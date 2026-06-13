from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.database import get_db
from app.models import Budget, Category, Transaction
from app.schemas import (
    BudgetCreate,
    BudgetUpdate,
    BudgetOut,
    BudgetProgressItem,
    BudgetProgressSummary,
)

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


@router.get("/", response_model=List[BudgetOut])
def list_budgets(
    ledger_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Budget)
    if ledger_id is not None:
        query = query.filter(Budget.ledger_id == ledger_id)
    if year is not None:
        query = query.filter(Budget.year == year)
    if month is not None:
        query = query.filter(Budget.month == month)
    return query.order_by(Budget.id.desc()).all()


@router.get("/progress", response_model=BudgetProgressSummary)
def budget_progress(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)

    budgets = (
        db.query(Budget)
        .filter(Budget.ledger_id == ledger_id, Budget.year == year, Budget.month == month)
        .all()
    )

    if not budgets:
        return BudgetProgressSummary(
            year=year,
            month=month,
            total_budget=0,
            total_spent=0,
            total_remaining=0,
            overbudget_count=0,
            items=[],
        )

    category_ids = [b.category_id for b in budgets]

    spent_rows = (
        db.query(Transaction.category_id, func.sum(Transaction.amount).label("spent"))
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.type == "expense",
            Transaction.category_id.in_(category_ids),
        )
        .group_by(Transaction.category_id)
        .all()
    )
    spent_map = {r.category_id: float(r.spent or 0) for r in spent_rows}

    categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
    cat_map = {c.id: c for c in categories}

    items = []
    total_budget = 0.0
    total_spent = 0.0
    total_remaining = 0.0
    overbudget_count = 0

    for b in budgets:
        spent = spent_map.get(b.category_id, 0.0)
        remaining = b.amount - spent
        remaining_ratio = round(remaining / b.amount, 4) if b.amount > 0 else 0.0
        is_overbudget = spent > b.amount

        cat = cat_map.get(b.category_id)
        items.append(
            BudgetProgressItem(
                category_id=b.category_id,
                category_name=cat.name if cat else "未知",
                category_icon=cat.icon if cat else "",
                budget_amount=b.amount,
                spent=spent,
                remaining=round(remaining, 2),
                remaining_ratio=remaining_ratio,
                is_overbudget=is_overbudget,
            )
        )

        total_budget += b.amount
        total_spent += spent
        if is_overbudget:
            overbudget_count += 1

    total_remaining = round(total_budget - total_spent, 2)

    return BudgetProgressSummary(
        year=year,
        month=month,
        total_budget=total_budget,
        total_spent=round(total_spent, 2),
        total_remaining=total_remaining,
        overbudget_count=overbudget_count,
        items=items,
    )


@router.get("/{budget_id}", response_model=BudgetOut)
def get_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="预算不存在")
    return budget


@router.post("/", response_model=BudgetOut)
def create_budget(data: BudgetCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(Budget)
        .filter(
            Budget.category_id == data.category_id,
            Budget.ledger_id == data.ledger_id,
            Budget.year == data.year,
            Budget.month == data.month,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="该分类本月已设置预算")
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    budget = Budget(**data.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.put("/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: int, data: BudgetUpdate, db: Session = Depends(get_db)
):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="预算不存在")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(budget, key, value)
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(Budget.id == budget_id).first()
    if not budget:
        raise HTTPException(status_code=404, detail="预算不存在")
    db.delete(budget)
    db.commit()
    return {"message": "删除成功"}
