from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import Account, Transfer
from app.schemas import TransferCreate, TransferOut, TransferWithNames
from app.routers.accounts import _compute_balance
from app.exchange_rate import convert_amount, SUPPORTED_CURRENCIES

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


@router.get("/", response_model=List[TransferWithNames])
def list_transfers(
    ledger_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Transfer)
    if ledger_id is not None:
        query = query.filter(Transfer.ledger_id == ledger_id)
    transfers = query.order_by(Transfer.date.desc(), Transfer.id.desc()).all()

    account_ids = set()
    for t in transfers:
        account_ids.add(t.from_account_id)
        account_ids.add(t.to_account_id)
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
    account_map = {a.id: a for a in accounts}

    result = []
    for t in transfers:
        from_acc = account_map.get(t.from_account_id)
        to_acc = account_map.get(t.to_account_id)
        result.append({
            "id": t.id,
            "from_account_id": t.from_account_id,
            "to_account_id": t.to_account_id,
            "from_account_name": from_acc.name if from_acc else "未知账户",
            "to_account_name": to_acc.name if to_acc else "未知账户",
            "from_currency": from_acc.currency if from_acc else "CNY",
            "to_currency": to_acc.currency if to_acc else "CNY",
            "amount": t.amount,
            "to_amount": t.to_amount,
            "exchange_rate": t.exchange_rate,
            "date": t.date,
            "note": t.note,
            "ledger_id": t.ledger_id,
            "created_at": t.created_at,
        })
    return result


@router.post("/", response_model=TransferOut)
def create_transfer(data: TransferCreate, db: Session = Depends(get_db)):
    if data.from_account_id == data.to_account_id:
        raise HTTPException(status_code=400, detail="转出和转入账户不能相同")

    from_account = db.query(Account).filter(Account.id == data.from_account_id).first()
    if not from_account:
        raise HTTPException(status_code=400, detail="转出账户不存在")

    to_account = db.query(Account).filter(Account.id == data.to_account_id).first()
    if not to_account:
        raise HTTPException(status_code=400, detail="转入账户不存在")

    if from_account.ledger_id != to_account.ledger_id:
        raise HTTPException(status_code=400, detail="转出和转入账户必须属于同一账本")

    if from_account.ledger_id != data.ledger_id:
        raise HTTPException(status_code=400, detail="账户与指定账本不匹配")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="转账金额必须大于0")

    current_balance = _compute_balance(db, from_account)
    if current_balance < data.amount:
        from_sym = SUPPORTED_CURRENCIES.get(from_account.currency, {}).get("symbol", from_account.currency)
        raise HTTPException(
            status_code=400,
            detail=f"转出账户余额不足，当前余额 {from_sym}{current_balance:.2f}，转账金额 {from_sym}{data.amount:.2f}",
        )

    is_cross_currency = from_account.currency != to_account.currency

    to_amount = None
    exchange_rate = None

    if is_cross_currency:
        if data.exchange_rate is not None and data.to_amount is not None:
            exchange_rate = data.exchange_rate
            to_amount = data.to_amount
        elif data.exchange_rate is not None:
            exchange_rate = data.exchange_rate
            to_amount = round(data.amount * exchange_rate, 2)
        else:
            try:
                conv, rate, _, _ = convert_amount(db, data.amount, from_account.currency, to_account.currency, data.date)
                to_amount = conv
                exchange_rate = rate
            except ValueError as e:
                raise HTTPException(status_code=503, detail=f"无法获取汇率进行跨币种转账: {e}")

    transfer = Transfer(
        from_account_id=data.from_account_id,
        to_account_id=data.to_account_id,
        amount=data.amount,
        to_amount=to_amount,
        exchange_rate=exchange_rate,
        date=data.date,
        note=data.note,
        ledger_id=data.ledger_id,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return transfer


@router.delete("/{transfer_id}")
def delete_transfer(transfer_id: int, db: Session = Depends(get_db)):
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="转账记录不存在")
    db.delete(transfer)
    db.commit()
    return {"message": "删除成功"}
