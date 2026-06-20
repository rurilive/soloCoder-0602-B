from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from collections import defaultdict
from datetime import datetime, timedelta

from app.database import get_db
from app.models import (
    Ledger,
    Account,
    InvestmentSecurity,
    InvestmentTransaction,
    InvestmentLot,
)
from app.schemas import (
    InvestmentSecurityCreate,
    InvestmentSecurityUpdate,
    InvestmentSecurityOut,
    InvestmentTransactionCreate,
    InvestmentTransactionOut,
    PortfolioSummary,
    HoldingItem,
    InvestmentLotOut,
    PortfolioHistoryResponse,
    PortfolioHistoryPoint,
)
from app.exchange_rate import convert_amount

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

VALID_TX_TYPES = {"buy", "sell", "dividend", "split"}
VALID_SECURITY_TYPES = {"stock", "etf", "fund", "bond", "crypto", "other"}


def _validate_ledger(db: Session, ledger_id: int) -> Ledger:
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=400, detail="账本不存在")
    return ledger


def _validate_account(db: Session, account_id: int, ledger_id: int) -> Account:
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=400, detail="账户不存在")
    if account.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该账户不属于当前账本")
    return account


def _validate_security(db: Session, security_id: int, ledger_id: int) -> InvestmentSecurity:
    sec = db.query(InvestmentSecurity).filter(InvestmentSecurity.id == security_id).first()
    if not sec:
        raise HTTPException(status_code=400, detail="证券不存在")
    if sec.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该证券不属于当前账本")
    return sec


def _round2(v: float) -> float:
    return round(v, 2)


def _create_buy_lot(db: Session, tx: InvestmentTransaction, security_id: int, ledger_id: int):
    total_cost = tx.amount + tx.fee
    qty = tx.quantity
    if qty <= 0:
        raise HTTPException(status_code=400, detail="买入数量必须大于0")
    cost_per_share = total_cost / qty
    lot = InvestmentLot(
        security_id=security_id,
        buy_transaction_id=tx.id,
        quantity_remaining=qty,
        cost_basis_per_share=cost_per_share,
        original_quantity=qty,
        buy_date=tx.date,
        is_closed=False,
        ledger_id=ledger_id,
    )
    db.add(lot)
    db.flush()


def _sell_fifo(db: Session, tx: InvestmentTransaction, security_id: int, ledger_id: int):
    qty_needed = tx.quantity
    if qty_needed <= 0:
        raise HTTPException(status_code=400, detail="卖出数量必须大于0")

    open_lots = (
        db.query(InvestmentLot)
        .filter(
            InvestmentLot.security_id == security_id,
            InvestmentLot.ledger_id == ledger_id,
            InvestmentLot.is_closed == False,
            InvestmentLot.quantity_remaining > 0,
        )
        .order_by(InvestmentLot.buy_date.asc(), InvestmentLot.id.asc())
        .all()
    )

    total_available = sum(l.quantity_remaining for l in open_lots)
    if total_available < qty_needed - 1e-9:
        raise HTTPException(
            status_code=400,
            detail=f"持仓不足：可用{total_available:.4f}，需卖出{qty_needed:.4f}",
        )

    total_cost_sold = 0.0
    remaining_qty = qty_needed

    for lot in open_lots:
        if remaining_qty <= 1e-9:
            break
        sell_from_lot = min(lot.quantity_remaining, remaining_qty)
        cost_sold = sell_from_lot * lot.cost_basis_per_share
        total_cost_sold += cost_sold
        lot.quantity_remaining -= sell_from_lot
        if lot.quantity_remaining <= 1e-9:
            lot.quantity_remaining = 0.0
            lot.is_closed = True
        remaining_qty -= sell_from_lot

    proceeds = tx.amount - tx.fee
    realized_gain = proceeds - total_cost_sold
    tx.realized_gain = _round2(realized_gain)
    db.flush()


def _sell_weighted_avg(db: Session, tx: InvestmentTransaction, security_id: int, ledger_id: int):
    qty_needed = tx.quantity
    if qty_needed <= 0:
        raise HTTPException(status_code=400, detail="卖出数量必须大于0")

    open_lots = (
        db.query(InvestmentLot)
        .filter(
            InvestmentLot.security_id == security_id,
            InvestmentLot.ledger_id == ledger_id,
            InvestmentLot.is_closed == False,
            InvestmentLot.quantity_remaining > 0,
        )
        .all()
    )

    total_qty = sum(l.quantity_remaining for l in open_lots)
    if total_qty < qty_needed - 1e-9:
        raise HTTPException(
            status_code=400,
            detail=f"持仓不足：可用{total_qty:.4f}，需卖出{qty_needed:.4f}",
        )

    total_cost = sum(l.quantity_remaining * l.cost_basis_per_share for l in open_lots)
    avg_cost = total_cost / total_qty if total_qty > 0 else 0
    cost_sold = qty_needed * avg_cost

    remaining_qty = qty_needed
    for lot in sorted(open_lots, key=lambda l: (l.buy_date, l.id)):
        if remaining_qty <= 1e-9:
            break
        sell_from_lot = min(lot.quantity_remaining, remaining_qty)
        lot.quantity_remaining -= sell_from_lot
        if lot.quantity_remaining <= 1e-9:
            lot.quantity_remaining = 0.0
            lot.is_closed = True
        remaining_qty -= sell_from_lot

    remaining_open_lots = [
        l for l in open_lots if not l.is_closed and l.quantity_remaining > 1e-9
    ]
    if remaining_open_lots:
        for lot in remaining_open_lots:
            lot.cost_basis_per_share = avg_cost

    remaining_total_cost = sum(
        l.quantity_remaining * l.cost_basis_per_share for l in remaining_open_lots
    )
    expected_remaining_cost = total_cost - cost_sold
    if abs(remaining_total_cost - expected_remaining_cost) > 0.01:
        raise HTTPException(
            status_code=500,
            detail=(
                f"加权平均卖出后总成本不守恒："
                f"剩余总成本{remaining_total_cost:.2f} != "
                f"原总成本{total_cost:.2f} - 卖出成本{cost_sold:.2f} = {expected_remaining_cost:.2f}"
            ),
        )

    proceeds = tx.amount - tx.fee
    realized_gain = proceeds - cost_sold
    tx.realized_gain = _round2(realized_gain)
    db.flush()


def _apply_split(db: Session, tx: InvestmentTransaction, security_id: int, ledger_id: int):
    ratio = tx.split_ratio
    if ratio is None or ratio <= 0:
        raise HTTPException(status_code=400, detail="拆股比例必须大于0")

    open_lots = (
        db.query(InvestmentLot)
        .filter(
            InvestmentLot.security_id == security_id,
            InvestmentLot.ledger_id == ledger_id,
            InvestmentLot.is_closed == False,
        )
        .all()
    )

    for lot in open_lots:
        total_original_cost = lot.quantity_remaining * lot.cost_basis_per_share
        lot.original_quantity = lot.original_quantity * ratio
        lot.quantity_remaining = lot.quantity_remaining * ratio
        lot.cost_basis_per_share = total_original_cost / lot.quantity_remaining if lot.quantity_remaining > 0 else 0

    db.flush()


def _process_dividend(db: Session, tx: InvestmentTransaction, security_id: int, ledger_id: int):
    if tx.dividend_amount is None:
        raise HTTPException(status_code=400, detail="分红金额不能为空")
    if tx.dividend_amount <= 0:
        raise HTTPException(status_code=400, detail="分红金额必须大于0")

    if tx.reinvest:
        if tx.price <= 0 or tx.quantity <= 0:
            raise HTTPException(status_code=400, detail="分红再投资需要提供价格和数量")
        reinvest_amount = tx.dividend_amount
        tx.amount = reinvest_amount

        reinvest_tx = InvestmentTransaction(
            security_id=security_id,
            type="buy",
            quantity=tx.quantity,
            price=tx.price,
            amount=reinvest_amount,
            fee=0.0,
            date=tx.date,
            description=f"分红再投资 - {tx.description}",
            ledger_id=ledger_id,
            account_id=tx.account_id,
            linked_transaction_id=tx.id,
        )
        db.add(reinvest_tx)
        db.flush()
        _create_buy_lot(db, reinvest_tx, security_id, ledger_id)

    db.flush()


@router.get("/securities", response_model=List[InvestmentSecurityOut])
def list_securities(
    ledger_id: int = Query(...),
    db: Session = Depends(get_db),
):
    _validate_ledger(db, ledger_id)
    return (
        db.query(InvestmentSecurity)
        .filter(InvestmentSecurity.ledger_id == ledger_id)
        .order_by(InvestmentSecurity.symbol.asc())
        .all()
    )


@router.post("/securities", response_model=InvestmentSecurityOut)
def create_security(data: InvestmentSecurityCreate, db: Session = Depends(get_db)):
    _validate_ledger(db, data.ledger_id)
    if data.type not in VALID_SECURITY_TYPES:
        raise HTTPException(status_code=400, detail=f"证券类型必须是 {VALID_SECURITY_TYPES}")
    existing = (
        db.query(InvestmentSecurity)
        .filter(
            InvestmentSecurity.ledger_id == data.ledger_id,
            InvestmentSecurity.symbol == data.symbol,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="该证券代码已存在")
    sec = InvestmentSecurity(**data.model_dump())
    db.add(sec)
    db.commit()
    db.refresh(sec)
    return sec


@router.put("/securities/{security_id}", response_model=InvestmentSecurityOut)
def update_security(
    security_id: int,
    data: InvestmentSecurityUpdate,
    db: Session = Depends(get_db),
):
    sec = db.query(InvestmentSecurity).filter(InvestmentSecurity.id == security_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="证券不存在")
    update_dict = data.model_dump(exclude_unset=True)
    if "type" in update_dict and update_dict["type"] not in VALID_SECURITY_TYPES:
        raise HTTPException(status_code=400, detail=f"证券类型必须是 {VALID_SECURITY_TYPES}")
    for k, v in update_dict.items():
        setattr(sec, k, v)
    db.commit()
    db.refresh(sec)
    return sec


@router.delete("/securities/{security_id}")
def delete_security(security_id: int, db: Session = Depends(get_db)):
    sec = db.query(InvestmentSecurity).filter(InvestmentSecurity.id == security_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="证券不存在")
    tx_count = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.security_id == security_id)
        .count()
    )
    if tx_count > 0:
        raise HTTPException(status_code=400, detail=f"该证券有{tx_count}笔交易记录，无法删除")
    db.delete(sec)
    db.commit()
    return {"message": "删除成功"}


@router.get("/transactions", response_model=List[InvestmentTransactionOut])
def list_transactions(
    ledger_id: int = Query(...),
    security_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    _validate_ledger(db, ledger_id)
    query = db.query(InvestmentTransaction).filter(InvestmentTransaction.ledger_id == ledger_id)
    if security_id is not None:
        query = query.filter(InvestmentTransaction.security_id == security_id)
    return query.order_by(InvestmentTransaction.date.desc(), InvestmentTransaction.id.desc()).all()


@router.post("/transactions", response_model=InvestmentTransactionOut)
def create_transaction(data: InvestmentTransactionCreate, db: Session = Depends(get_db)):
    ledger = _validate_ledger(db, data.ledger_id)
    _validate_account(db, data.account_id, data.ledger_id)
    _validate_security(db, data.security_id, data.ledger_id)

    if data.type not in VALID_TX_TYPES:
        raise HTTPException(status_code=400, detail=f"交易类型必须是 {VALID_TX_TYPES}")

    tx_data = data.model_dump(exclude={"amount"})
    if data.type == "buy":
        amount = _round2(data.quantity * data.price)
    elif data.type == "sell":
        amount = _round2(data.quantity * data.price)
    elif data.type == "dividend":
        amount = _round2(data.dividend_amount or 0.0)
    elif data.type == "split":
        amount = 0.0
    else:
        amount = 0.0

    tx_data["amount"] = amount
    tx_data["realized_gain"] = 0.0
    tx = InvestmentTransaction(**tx_data)
    db.add(tx)
    db.flush()

    if data.type == "buy":
        _create_buy_lot(db, tx, data.security_id, data.ledger_id)
    elif data.type == "sell":
        if ledger.cost_method == "fifo":
            _sell_fifo(db, tx, data.security_id, data.ledger_id)
        else:
            _sell_weighted_avg(db, tx, data.security_id, data.ledger_id)
    elif data.type == "split":
        _apply_split(db, tx, data.security_id, data.ledger_id)
    elif data.type == "dividend":
        _process_dividend(db, tx, data.security_id, data.ledger_id)

    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.id == transaction_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="交易不存在")
    raise HTTPException(
        status_code=400,
        detail="为保证成本计算的准确性，投资交易暂不支持删除。建议通过反向交易冲销。",
    )


@router.get("/summary", response_model=PortfolioSummary)
def get_portfolio_summary(
    ledger_id: int = Query(...),
    db: Session = Depends(get_db),
):
    ledger = _validate_ledger(db, ledger_id)
    base_currency = ledger.base_currency

    securities = (
        db.query(InvestmentSecurity)
        .filter(InvestmentSecurity.ledger_id == ledger_id)
        .order_by(InvestmentSecurity.symbol.asc())
        .all()
    )

    holdings: List[HoldingItem] = []
    total_cost_basis = 0.0
    total_market_value = 0.0
    total_realized = 0.0
    total_dividends = 0.0

    for sec in securities:
        lots = (
            db.query(InvestmentLot)
            .filter(
                InvestmentLot.security_id == sec.id,
                InvestmentLot.ledger_id == ledger_id,
            )
            .order_by(InvestmentLot.buy_date.asc(), InvestmentLot.id.asc())
            .all()
        )

        open_lots = [l for l in lots if not l.is_closed and l.quantity_remaining > 1e-9]
        qty = sum(l.quantity_remaining for l in open_lots)
        cost_basis = sum(l.quantity_remaining * l.cost_basis_per_share for l in open_lots)
        avg_cost = (cost_basis / qty) if qty > 0 else 0.0

        market_value = qty * sec.current_price
        unrealized_gain = market_value - cost_basis
        unrealized_gain_pct = (unrealized_gain / cost_basis * 100) if cost_basis > 0 else 0.0

        transactions = (
            db.query(InvestmentTransaction)
            .filter(
                InvestmentTransaction.security_id == sec.id,
                InvestmentTransaction.ledger_id == ledger_id,
            )
            .order_by(InvestmentTransaction.date.asc(), InvestmentTransaction.id.asc())
            .all()
        )

        realized_gain = sum(t.realized_gain for t in transactions if t.type == "sell")
        dividends_received = sum(
            t.dividend_amount or 0.0
            for t in transactions
            if t.type == "dividend"
        )

        converted_market_value = None
        converted_cost_basis = None
        converted_unrealized_gain = None
        if sec.currency != base_currency:
            try:
                cmv, _, _, _ = convert_amount(db, market_value, sec.currency, base_currency)
                ccb, _, _, _ = convert_amount(db, cost_basis, sec.currency, base_currency)
                converted_market_value = cmv
                converted_cost_basis = ccb
                converted_unrealized_gain = cmv - ccb
                total_market_value += cmv
                total_cost_basis += ccb
            except ValueError:
                total_market_value += market_value
                total_cost_basis += cost_basis
        else:
            total_market_value += market_value
            total_cost_basis += cost_basis

        total_realized += realized_gain
        total_dividends += dividends_received

        lot_schemas = [InvestmentLotOut.model_validate(l) for l in lots]
        tx_schemas = [InvestmentTransactionOut.model_validate(t) for t in transactions]

        holdings.append(HoldingItem(
            security_id=sec.id,
            symbol=sec.symbol,
            name=sec.name,
            type=sec.type,
            currency=sec.currency,
            quantity=_round2(qty),
            cost_basis=_round2(cost_basis),
            avg_cost=_round2(avg_cost),
            current_price=sec.current_price,
            market_value=_round2(market_value),
            unrealized_gain=_round2(unrealized_gain),
            unrealized_gain_pct=_round2(unrealized_gain_pct),
            realized_gain=_round2(realized_gain),
            dividends_received=_round2(dividends_received),
            lots=lot_schemas,
            transactions=tx_schemas,
            converted_market_value=_round2(converted_market_value) if converted_market_value is not None else None,
            converted_cost_basis=_round2(converted_cost_basis) if converted_cost_basis is not None else None,
            converted_unrealized_gain=_round2(converted_unrealized_gain) if converted_unrealized_gain is not None else None,
        ))

    total_unrealized_gain = total_market_value - total_cost_basis
    total_unrealized_gain_pct = (
        (total_unrealized_gain / total_cost_basis * 100) if total_cost_basis > 0 else 0.0
    )

    return PortfolioSummary(
        ledger_id=ledger_id,
        base_currency=base_currency,
        cost_method=ledger.cost_method,
        total_market_value=_round2(total_market_value),
        total_cost_basis=_round2(total_cost_basis),
        total_unrealized_gain=_round2(total_unrealized_gain),
        total_unrealized_gain_pct=_round2(total_unrealized_gain_pct),
        total_realized_gain=_round2(total_realized),
        total_dividends=_round2(total_dividends),
        holdings=holdings,
    )


@router.get("/history", response_model=PortfolioHistoryResponse)
def get_portfolio_history(
    ledger_id: int = Query(...),
    days: int = Query(90, ge=7, le=365),
    db: Session = Depends(get_db),
):
    ledger = _validate_ledger(db, ledger_id)
    base_currency = ledger.base_currency

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days - 1)

    securities = (
        db.query(InvestmentSecurity)
        .filter(InvestmentSecurity.ledger_id == ledger_id)
        .all()
    )
    sec_ids = [s.id for s in securities]
    sec_map = {s.id: s for s in securities}

    all_transactions = (
        db.query(InvestmentTransaction)
        .filter(InvestmentTransaction.ledger_id == ledger_id)
        .order_by(InvestmentTransaction.date.asc(), InvestmentTransaction.id.asc())
        .all()
    )
    tx_by_sec = defaultdict(list)
    for tx in all_transactions:
        tx_by_sec[tx.security_id].append(tx)

    all_splits = [tx for tx in all_transactions if tx.type == "split"]
    splits_by_sec = defaultdict(list)
    for tx in all_splits:
        splits_by_sec[tx.security_id].append(tx)

    points: List[PortfolioHistoryPoint] = []
    current_date = start_date

    while current_date <= end_date:
        date_str = current_date.isoformat()
        by_security: Dict[str, float] = {}
        total_value = 0.0

        for sec in securities:
            sec_txs = tx_by_sec.get(sec.id, [])
            sec_splits = splits_by_sec.get(sec.id, [])

            cumulative_qty = 0.0
            split_multiplier = 1.0
            future_splits = [s for s in sec_splits if s.date > date_str]
            for fs in future_splits:
                if fs.split_ratio and fs.split_ratio > 0:
                    split_multiplier *= fs.split_ratio

            for tx in sec_txs:
                if tx.date > date_str:
                    break
                if tx.type == "buy":
                    cumulative_qty += tx.quantity
                    tx_split_mult = 1.0
                    for fs in [s for s in sec_splits if s.date > tx.date and s.date <= date_str]:
                        if fs.split_ratio and fs.split_ratio > 0:
                            tx_split_mult *= fs.split_ratio
                    cumulative_qty -= tx.quantity
                    cumulative_qty += tx.quantity * tx_split_mult
                elif tx.type == "sell":
                    sell_mult = 1.0
                    for fs in [s for s in sec_splits if s.date > tx.date and s.date <= date_str]:
                        if fs.split_ratio and fs.split_ratio > 0:
                            sell_mult *= fs.split_ratio
                    cumulative_qty = max(0, cumulative_qty - tx.quantity * sell_mult)
                elif tx.type == "split":
                    pass
                elif tx.type == "dividend" and tx.reinvest:
                    reinvest_qty = tx.quantity
                    tx_split_mult = 1.0
                    for fs in [s for s in sec_splits if s.date > tx.date and s.date <= date_str]:
                        if fs.split_ratio and fs.split_ratio > 0:
                            tx_split_mult *= fs.split_ratio
                    cumulative_qty += reinvest_qty * tx_split_mult

            qty_on_date = max(0, cumulative_qty) * split_multiplier

            price = sec.current_price
            if sec.currency != base_currency:
                try:
                    converted_price, _, _, _ = convert_amount(
                        db, price, sec.currency, base_currency, date_str
                    )
                    price = converted_price
                except ValueError:
                    pass

            value_on_date = qty_on_date * price
            by_security[sec.symbol] = _round2(value_on_date)
            total_value += value_on_date

        points.append(PortfolioHistoryPoint(
            date=date_str,
            total_value=_round2(total_value),
            by_security=by_security,
        ))
        current_date += timedelta(days=1)

    return PortfolioHistoryResponse(
        ledger_id=ledger_id,
        base_currency=base_currency,
        points=points,
    )


@router.get("/lots/{security_id}", response_model=List[InvestmentLotOut])
def get_lots_for_security(
    security_id: int,
    db: Session = Depends(get_db),
):
    sec = db.query(InvestmentSecurity).filter(InvestmentSecurity.id == security_id).first()
    if not sec:
        raise HTTPException(status_code=404, detail="证券不存在")
    lots = (
        db.query(InvestmentLot)
        .filter(InvestmentLot.security_id == security_id)
        .order_by(InvestmentLot.buy_date.asc(), InvestmentLot.id.asc())
        .all()
    )
    return lots
