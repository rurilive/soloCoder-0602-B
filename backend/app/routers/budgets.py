from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Tuple, Set
from datetime import datetime

from app.database import get_db
from app.models import Budget, Category, Transaction, Ledger, Account
from app.exchange_rate import get_rate
from app.schemas import (
    BudgetCreate,
    BudgetUpdate,
    BudgetOut,
    BudgetProgressItem,
    BudgetProgressSummary,
    BudgetSuggestionResponse,
    BudgetSuggestionItem,
    BudgetBatchCreateRequest,
    BudgetBatchCreateResult,
    CurrencyAmount,
)

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


def _get_previous_months(year: int, month: int, count: int):
    months = []
    y, m = year, month
    for _ in range(count):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
        months.append((y, m))
    return months


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


def _build_rate_cache(
    db: Session,
    currencies: Set[str],
    target_currency: str,
    rate_date: str | None = None,
) -> Tuple[Dict[Tuple[str, str], float], Set[str]]:
    cache: Dict[Tuple[str, str], float] = {}
    failed: Set[str] = set()
    for cur in currencies:
        if cur == target_currency:
            cache[(cur, target_currency)] = 1.0
            continue
        try:
            rate, _, _ = get_rate(db, cur, target_currency, rate_date)
            cache[(cur, target_currency)] = rate
        except ValueError:
            failed.add(cur)
    return cache, failed


@router.get("/progress", response_model=BudgetProgressSummary)
def budget_progress(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")
    base_currency = ledger.base_currency

    start, end = _month_range(year, month)
    mid_date = f"{year:04d}-{month:02d}-15"

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
            base_currency=base_currency,
            conversion_status="success",
            failed_currencies=[],
        )

    budgets = (
        db.query(Budget)
        .filter(Budget.ledger_id == ledger_id, Budget.year == year, Budget.month == month)
        .all()
    )
    budget_map = {b.category_id: b for b in budgets}

    accounts = db.query(Account).filter(Account.ledger_id == ledger_id).all()
    account_currency_map = {a.id: a.currency for a in accounts}
    unique_currencies = {a.currency for a in accounts}
    rate_cache, failed_currencies = _build_rate_cache(db, unique_currencies, base_currency, mid_date)

    all_cat_ids = [c.id for c in all_expense_categories]
    tx_rows = (
        db.query(Transaction.category_id, Transaction.account_id, Transaction.amount)
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.type == "expense",
            Transaction.category_id.in_(all_cat_ids),
        )
        .all()
    )

    spent_map: Dict[int, float] = {}
    unconverted_map: Dict[int, Dict[str, float]] = {}
    for r in tx_rows:
        cat_id = r.category_id
        acct_currency = account_currency_map.get(r.account_id, base_currency)
        if (acct_currency, base_currency) in rate_cache:
            rate = rate_cache[(acct_currency, base_currency)]
            converted = float(r.amount) * rate
            spent_map[cat_id] = spent_map.get(cat_id, 0.0) + converted
        else:
            if cat_id not in unconverted_map:
                unconverted_map[cat_id] = {}
            unconverted_map[cat_id][acct_currency] = (
                unconverted_map[cat_id].get(acct_currency, 0.0) + float(r.amount)
            )

    items = []
    total_budget = 0.0
    total_spent = 0.0
    unbudgeted_spent = 0.0
    overbudget_count = 0

    for cat in all_expense_categories:
        budget = budget_map.get(cat.id)
        has_budget = budget is not None
        budget_amount = budget.amount if has_budget else 0.0
        spent = round(spent_map.get(cat.id, 0.0), 2)

        has_unconverted = cat.id in unconverted_map

        if has_unconverted:
            is_overbudget = True
            remaining_ratio = 0.0
            remaining = 0.0
        else:
            remaining = budget_amount - spent
            remaining_ratio = round(remaining / budget_amount, 4) if budget_amount > 0 else 0.0
            is_overbudget = has_budget and spent > budget_amount

        unconverted_amounts = []
        if has_unconverted:
            unconverted_amounts = [
                CurrencyAmount(currency=curr, amount=round(amt, 2))
                for curr, amt in sorted(unconverted_map[cat.id].items())
            ]

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
                has_unconverted=has_unconverted,
                unconverted_amounts=unconverted_amounts,
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

    conversion_status = "success" if not failed_currencies else "partial"
    if failed_currencies and len(failed_currencies) == len(unique_currencies - {base_currency}):
        conversion_status = "failed"

    return BudgetProgressSummary(
        year=year,
        month=month,
        total_budget=round(total_budget, 2),
        total_spent=round(total_spent, 2),
        total_remaining=total_remaining,
        overbudget_count=overbudget_count,
        unbudgeted_spent=round(unbudgeted_spent, 2),
        items=items,
        base_currency=base_currency,
        conversion_status=conversion_status,
        failed_currencies=sorted(failed_currencies),
    )


@router.get("/suggest", response_model=BudgetSuggestionResponse)
def suggest_budgets(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")
    base_currency = ledger.base_currency

    categories = (
        db.query(Category)
        .filter(Category.ledger_id == ledger_id, Category.type == "expense")
        .all()
    )

    existing_budgets = (
        db.query(Budget)
        .filter(
            Budget.ledger_id == ledger_id,
            Budget.year == year,
            Budget.month == month,
        )
        .all()
    )
    existing_cat_ids = {b.category_id for b in existing_budgets}

    if not categories:
        return BudgetSuggestionResponse(
            ledger_id=ledger_id,
            year=year,
            month=month,
            total_months_analyzed=0,
            warning="该账本暂无支出分类，请先创建支出分类",
            suggestions=[],
            base_currency=base_currency,
            conversion_status="success",
            failed_currencies=[],
        )

    prev_months = _get_previous_months(year, month, 3)

    ledger_created_at = ledger.created_at
    available_months = []
    for y, m in prev_months:
        next_y, next_m = y, m + 1
        if next_m == 13:
            next_m = 1
            next_y += 1
        month_end = datetime(next_y, next_m, 1)
        if month_end > ledger_created_at:
            available_months.append((y, m))

    available_months = list(reversed(available_months))

    if not available_months:
        suggestions = [
            BudgetSuggestionItem(
                category_id=c.id,
                category_name=c.name,
                category_icon=c.icon or "",
                suggested_amount=0.0,
                months_available=0,
                has_existing_budget=c.id in existing_cat_ids,
            )
            for c in categories
        ]
        return BudgetSuggestionResponse(
            ledger_id=ledger_id,
            year=year,
            month=month,
            total_months_analyzed=0,
            warning="账本创建不足3个月，暂无历史支出数据用于生成建议",
            suggestions=suggestions,
            base_currency=base_currency,
            conversion_status="success",
            failed_currencies=[],
        )

    first_month = available_months[0]
    last_month = available_months[-1]
    first_start = f"{first_month[0]:04d}-{first_month[1]:02d}-01"
    last_end_y, last_end_m = last_month
    if last_end_m == 12:
        last_end_y += 1
        last_end_m = 1
    else:
        last_end_m += 1
    last_end = f"{last_end_y:04d}-{last_end_m:02d}-01"

    accounts = db.query(Account).filter(Account.ledger_id == ledger_id).all()
    account_currency_map = {a.id: a.currency for a in accounts}
    unique_currencies = {a.currency for a in accounts}

    month_rate_caches: Dict[str, Dict[Tuple[str, str], float]] = {}
    all_failed_currencies: Set[str] = set()
    for y, m in available_months:
        month_key = f"{y:04d}-{m:02d}"
        mid_date = f"{y:04d}-{m:02d}-15"
        cache, failed = _build_rate_cache(
            db, unique_currencies, base_currency, mid_date
        )
        month_rate_caches[month_key] = cache
        all_failed_currencies.update(failed)

    cat_ids = [c.id for c in categories]
    tx_rows = (
        db.query(
            Transaction.category_id,
            func.strftime("%Y-%m", Transaction.date).label("month"),
            Transaction.account_id,
            Transaction.amount,
        )
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.type == "expense",
            Transaction.category_id.in_(cat_ids),
            Transaction.date >= first_start,
            Transaction.date < last_end,
        )
        .all()
    )

    cat_month_totals: Dict[Tuple[int, str], float] = {}
    cat_unconverted_totals: Dict[int, Dict[str, float]] = {}
    for r in tx_rows:
        cat_id = r.category_id
        month_key = r.month
        acct_currency = account_currency_map.get(r.account_id, base_currency)
        rate_cache = month_rate_caches.get(month_key, {})
        if (acct_currency, base_currency) in rate_cache:
            rate = rate_cache[(acct_currency, base_currency)]
            converted = float(r.amount) * rate
            key = (cat_id, month_key)
            cat_month_totals[key] = cat_month_totals.get(key, 0.0) + converted
        else:
            if cat_id not in cat_unconverted_totals:
                cat_unconverted_totals[cat_id] = {}
            cat_unconverted_totals[cat_id][acct_currency] = (
                cat_unconverted_totals[cat_id].get(acct_currency, 0.0) + float(r.amount)
            )

    total_months = len(available_months)

    suggestions = []
    for cat in categories:
        total_spent = 0.0
        for y, m in available_months:
            month_key = f"{y:04d}-{m:02d}"
            key = (cat.id, month_key)
            if key in cat_month_totals:
                total_spent += cat_month_totals[key]

        suggested_amount = round(total_spent / total_months, 2) if total_months > 0 else 0.0

        unconverted_amounts = []
        if cat.id in cat_unconverted_totals:
            unconverted_amounts = [
                CurrencyAmount(currency=curr, amount=round(amt, 2))
                for curr, amt in sorted(cat_unconverted_totals[cat.id].items())
            ]

        suggestions.append(
            BudgetSuggestionItem(
                category_id=cat.id,
                category_name=cat.name,
                category_icon=cat.icon or "",
                suggested_amount=suggested_amount,
                months_available=total_months,
                has_existing_budget=cat.id in existing_cat_ids,
                unconverted_amounts=unconverted_amounts,
            )
        )

    warning_msg = None
    if total_months < 3:
        warning_msg = f"仅分析了{total_months}个月数据，建议参考性有限"

    conversion_status = "success" if not all_failed_currencies else "partial"
    if all_failed_currencies and len(all_failed_currencies) == len(unique_currencies - {base_currency}):
        conversion_status = "failed"

    return BudgetSuggestionResponse(
        ledger_id=ledger_id,
        year=year,
        month=month,
        total_months_analyzed=total_months,
        warning=warning_msg,
        suggestions=suggestions,
        base_currency=base_currency,
        conversion_status=conversion_status,
        failed_currencies=sorted(all_failed_currencies),
    )


@router.post("/batch", response_model=BudgetBatchCreateResult)
def batch_create_budgets(
    data: BudgetBatchCreateRequest,
    db: Session = Depends(get_db),
):
    ledger = db.query(Ledger).filter(Ledger.id == data.ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")

    existing = (
        db.query(Budget)
        .filter(
            Budget.ledger_id == data.ledger_id,
            Budget.year == data.year,
            Budget.month == data.month,
        )
        .all()
    )
    existing_cat_ids = {b.category_id for b in existing}

    created = []
    skipped = []

    for item in data.items:
        if item.category_id in existing_cat_ids:
            skipped.append(item.category_id)
            continue

        category = db.query(Category).filter(Category.id == item.category_id).first()
        if not category:
            skipped.append(item.category_id)
            continue
        if category.ledger_id != data.ledger_id:
            skipped.append(item.category_id)
            continue
        if category.type != "expense":
            skipped.append(item.category_id)
            continue

        budget = Budget(
            category_id=item.category_id,
            ledger_id=data.ledger_id,
            amount=item.amount,
            year=data.year,
            month=data.month,
        )
        db.add(budget)
        db.flush()
        db.refresh(budget)
        created.append(budget)
        existing_cat_ids.add(item.category_id)

    db.commit()

    for b in created:
        db.refresh(b)

    return BudgetBatchCreateResult(
        created_count=len(created),
        skipped_count=len(skipped),
        created=created,
        skipped=skipped,
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
