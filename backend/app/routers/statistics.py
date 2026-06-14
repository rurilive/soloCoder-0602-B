from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models import Transaction, Category, Account, Ledger
from app.schemas import MonthlySummary, CategoryStat
from app.exchange_rate import convert_amount

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


@router.get("/monthly", response_model=MonthlySummary)
def monthly_summary(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    target_currency: str = Query(None, description="目标币种，不传则按原币汇总"),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)
    count = db.query(func.count(Transaction.id)).filter(
        Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end
    ).scalar() or 0

    if not target_currency:
        rows = (
            db.query(Transaction.type, func.sum(Transaction.amount), func.count())
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
            .group_by(Transaction.type)
            .all()
        )
        total_income = 0.0
        total_expense = 0.0
        for r in rows:
            if r[0] == "income":
                total_income = float(r[1] or 0)
            elif r[0] == "expense":
                total_expense = float(r[1] or 0)
    else:
        ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
        base_currency = ledger.base_currency if ledger else "CNY"

        tx_rows = (
            db.query(Transaction.type, Transaction.amount, Transaction.date, Transaction.account_id)
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
            .all()
        )
        account_ids = list(set(r.account_id for r in tx_rows))
        accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
        account_currency_map = {a.id: a.currency for a in accounts}

        total_income = 0.0
        total_expense = 0.0
        for r in tx_rows:
            src_currency = account_currency_map.get(r.account_id, base_currency)
            amount = float(r.amount or 0)
            if src_currency != target_currency:
                try:
                    converted, _, _, _ = convert_amount(db, amount, src_currency, target_currency, r.date)
                    amount = converted
                except ValueError:
                    pass
            if r.type == "income":
                total_income += amount
            elif r.type == "expense":
                total_expense += amount

    return MonthlySummary(
        year=year,
        month=month,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        balance=round(total_income - total_expense, 2),
        transaction_count=count,
    )


@router.get("/categories", response_model=List[CategoryStat])
def category_stats(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    type: str = Query(None),
    target_currency: str = Query(None, description="目标币种，不传则按原币汇总"),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)

    if not target_currency:
        query = (
            db.query(
                Transaction.category_id,
                Category.name.label("category_name"),
                Category.icon.label("category_icon"),
                Category.type.label("cat_type"),
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Transaction.category_id == Category.id)
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
        )
        if type:
            query = query.filter(Category.type == type)
        rows = query.group_by(Transaction.category_id).all()

        total_all = sum(float(r.total or 0) for r in rows)
        result = []
        for r in rows:
            amount = float(r.total or 0)
            pct = round(amount / total_all * 100, 2) if total_all > 0 else 0
            result.append(
                CategoryStat(
                    category_id=r.category_id,
                    category_name=r.category_name,
                    category_icon=r.category_icon or "",
                    type=r.cat_type,
                    amount=round(amount, 2),
                    percentage=pct,
                )
            )
        return result

    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    base_currency = ledger.base_currency if ledger else "CNY"

    tx_rows = (
        db.query(Transaction.category_id, Transaction.amount, Transaction.date, Transaction.account_id)
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
    )
    if type:
        tx_rows = tx_rows.filter(Category.type == type)
    tx_rows = tx_rows.all()

    account_ids = list(set(r.account_id for r in tx_rows))
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
    account_currency_map = {a.id: a.currency for a in accounts}

    category_ids = list(set(r.category_id for r in tx_rows))
    categories = db.query(Category).filter(Category.id.in_(category_ids)).all() if category_ids else []
    category_map = {c.id: c for c in categories}

    category_converted = {}
    for r in tx_rows:
        src_currency = account_currency_map.get(r.account_id, base_currency)
        amount = float(r.amount or 0)
        if src_currency != target_currency:
            try:
                converted, _, _, _ = convert_amount(db, amount, src_currency, target_currency, r.date)
                amount = converted
            except ValueError:
                pass
        cid = r.category_id
        category_converted[cid] = category_converted.get(cid, 0.0) + amount

    total_all = sum(category_converted.values())
    result = []
    for cid, amount in category_converted.items():
        cat = category_map.get(cid)
        if not cat:
            continue
        pct = round(amount / total_all * 100, 2) if total_all > 0 else 0
        result.append(
            CategoryStat(
                category_id=cid,
                category_name=cat.name,
                category_icon=cat.icon or "",
                type=cat.type,
                amount=round(amount, 2),
                percentage=pct,
            )
        )
    result.sort(key=lambda x: x.amount, reverse=True)
    return result
