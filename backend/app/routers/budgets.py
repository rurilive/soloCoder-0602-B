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

    all_expense_categories = (
        db.query(Category)
        .filter(Category.ledger_id == ledger_id, Category.type == "expense")
        .all()
    )

    if not all_expense_categories:
        return BudgetProgressSummary(
            year=year,
            month=month,
            total_budget=0,
            total_spent=0,
            total_remaining=0,
            overbudget_count=0,
            unbudgeted_spent=0,
            items=[],
        )

    budgets = (
        db.query(Budget)
        .filter(Budget.ledger_id == ledger_id, Budget.year == year, Budget.month == month)
        .all()
    )
    budget_map = {b.category_id: b for b in budgets}

    all_cat_ids = [c.id for c in all_expense_categories]
    spent_rows = (
        db.query(Transaction.category_id, func.sum(Transaction.amount).label("spent"))
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.type == "expense",
            Transaction.category_id.in_(all_cat_ids),
        )
        .group_by(Transaction.category_id)
        .all()
    )
    spent_map = {r.category_id: float(r.spent or 0) for r in spent_rows}

    items = []
    total_budget = 0.0
    total_spent = 0.0
    unbudgeted_spent = 0.0
    overbudget_count = 0

    for cat in all_expense_categories:
        budget = budget_map.get(cat.id)
        has_budget = budget is not None
        budget_amount = budget.amount if has_budget else 0.0
        spent = spent_map.get(cat.id, 0.0)
        remaining = budget_amount - spent
        remaining_ratio = round(remaining / budget_amount, 4) if budget_amount > 0 else 0.0
        is_overbudget = has_budget and spent > budget_amount

        items.append(
            BudgetProgressItem(
                budget_id=budget.id if has_budget else None,
                category_id=cat.id,
                category_name=cat.name,
                category_icon=cat.icon or "",
                budget_amount=budget_amount,
                spent=spent,
                remaining=round(remaining, 2),
                remaining_ratio=remaining_ratio,
                is_overbudget=is_overbudget,
                has_budget=has_budget,
            )
        )

        if has_budget:
            total_budget += budget_amount
            total_spent += spent
        else:
            unbudgeted_spent += spent
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
        unbudgeted_spent=round(unbudgeted_spent, 2),
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
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    if category.ledger_id != data.ledger_id:
        raise HTTPException(status_code=400, detail="该分类不属于当前账本")
    if category.type != "expense":
        raise HTTPException(status_code=400, detail="只能为支出分类设置预算")

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
