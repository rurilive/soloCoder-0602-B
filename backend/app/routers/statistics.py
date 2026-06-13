from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models import Transaction, Category
from app.schemas import MonthlySummary, CategoryStat

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


@router.get("/monthly", response_model=MonthlySummary)
def monthly_summary(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    prefix = f"{year}-{month:02d}"
    rows = (
        db.query(Transaction.type, func.sum(Transaction.amount), func.count())
        .filter(Transaction.ledger_id == ledger_id, Transaction.date.like(f"{prefix}%"))
        .group_by(Transaction.type)
        .all()
    )
    total_income = 0.0
    total_expense = 0.0
    count = 0
    for r in rows:
        count += r[2]
        if r[0] == "income":
            total_income = float(r[1] or 0)
        elif r[0] == "expense":
            total_expense = float(r[1] or 0)
    return MonthlySummary(
        year=year,
        month=month,
        total_income=total_income,
        total_expense=total_expense,
        balance=total_income - total_expense,
        transaction_count=count,
    )


@router.get("/categories", response_model=List[CategoryStat])
def category_stats(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    type: str = Query(None),
    db: Session = Depends(get_db),
):
    prefix = f"{year}-{month:02d}"
    query = (
        db.query(
            Transaction.category_id,
            Category.name.label("category_name"),
            Category.icon.label("category_icon"),
            Category.type.label("cat_type"),
            func.sum(Transaction.amount).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.ledger_id == ledger_id, Transaction.date.like(f"{prefix}%"))
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
                amount=amount,
                percentage=pct,
            )
        )
    return result
