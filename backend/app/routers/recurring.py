from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
import calendar

from app.database import get_db
from app.models import RecurringRule, RecurringLog, Transaction, Category
from app.schemas import (
    RecurringRuleCreate,
    RecurringRuleUpdate,
    RecurringRuleOut,
    RecurringLogOut,
    GenerateResult,
)

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


def _parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def _fmt_date(d: date) -> str:
    return d.strftime("%Y-%m-%d")


def _find_monthly_day(year: int, month: int, day_of_month: int) -> date:
    while True:
        last_day = calendar.monthrange(year, month)[1]
        if day_of_month <= last_day:
            return date(year, month, day_of_month)
        overflow = day_of_month - last_day
        if month == 12:
            year += 1
            month = 1
        else:
            month += 1
        day_of_month = overflow


def _next_monthly_after(from_date: date, day_of_month: int) -> date:
    year = from_date.year
    month = from_date.month
    candidate = _find_monthly_day(year, month, day_of_month)
    if candidate > from_date:
        return candidate
    if month == 12:
        year += 1
        month = 1
    else:
        month += 1
    return _find_monthly_day(year, month, day_of_month)


def _first_monthly_on_or_after(from_date: date, day_of_month: int) -> date:
    year = from_date.year
    month = from_date.month
    candidate = _find_monthly_day(year, month, day_of_month)
    if candidate >= from_date:
        return candidate
    if month == 12:
        year += 1
        month = 1
    else:
        month += 1
    return _find_monthly_day(year, month, day_of_month)


def _calc_next_date(rule: RecurringRule, from_date: date) -> Optional[date]:
    if rule.frequency == "monthly":
        dom = rule.day_of_month or from_date.day
        return _next_monthly_after(from_date, dom)
    elif rule.frequency == "weekly":
        dow = rule.day_of_week or from_date.weekday()
        days_ahead = dow - from_date.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        return from_date + timedelta(days=days_ahead)
    elif rule.frequency == "yearly":
        dom = rule.day_of_month or from_date.day
        start_month = _parse_date(rule.start_date).month if rule.start_date else from_date.month
        candidate = _find_monthly_day(from_date.year, start_month, dom)
        if candidate > from_date:
            return candidate
        return _find_monthly_day(from_date.year + 1, start_month, dom)
    else:
        return None


def _compute_initial_next(rule_data: dict) -> str:
    start = _parse_date(rule_data["start_date"])
    freq = rule_data.get("frequency")
    today = date.today()
    anchor = start if start > today else today
    if freq == "monthly":
        dom = rule_data.get("day_of_month") or start.day
        return _fmt_date(_first_monthly_on_or_after(anchor, dom))
    elif freq == "weekly":
        dow = rule_data.get("day_of_week") if rule_data.get("day_of_week") is not None else start.weekday()
        days_ahead = dow - anchor.weekday()
        if days_ahead < 0:
            days_ahead += 7
        candidate = anchor + timedelta(days=days_ahead)
        if candidate < start:
            candidate += timedelta(days=7)
        return _fmt_date(candidate)
    elif freq == "yearly":
        dom = rule_data.get("day_of_month") or start.day
        candidate = _find_monthly_day(today.year, start.month, dom)
        if candidate < start or candidate < today:
            candidate = _find_monthly_day(today.year + 1, start.month, dom)
        return _fmt_date(candidate)
    return _fmt_date(start)


def _validate_category(db, category_id, ledger_id, tx_type):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=400, detail="分类不存在")
    if cat.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该分类不属于当前账本")
    if cat.type != tx_type:
        raise HTTPException(
            status_code=400,
            detail=f"分类类型不匹配：分类为{cat.type}，交易为{tx_type}",
        )
    return cat


@router.get("/rules/", response_model=List[RecurringRuleOut])
def list_rules(
    ledger_id: Optional[int] = Query(None),
    is_active: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(RecurringRule)
    if ledger_id is not None:
        query = query.filter(RecurringRule.ledger_id == ledger_id)
    if is_active is not None:
        query = query.filter(RecurringRule.is_active == is_active)
    return query.order_by(RecurringRule.id.desc()).all()


@router.get("/rules/{rule_id}", response_model=RecurringRuleOut)
def get_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(RecurringRule).filter(RecurringRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    return rule


@router.post("/rules/", response_model=RecurringRuleOut)
def create_rule(data: RecurringRuleCreate, db: Session = Depends(get_db)):
    if data.frequency not in ("monthly", "weekly", "yearly"):
        raise HTTPException(status_code=400, detail="frequency 必须是 monthly/weekly/yearly")
    _validate_category(db, data.category_id, data.ledger_id, data.type)
    payload = data.model_dump()
    payload["next_date"] = _compute_initial_next(payload)
    rule = RecurringRule(**payload)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=RecurringRuleOut)
def update_rule(rule_id: int, data: RecurringRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(RecurringRule).filter(RecurringRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    update_dict = data.model_dump(exclude_unset=True)
    final_type = update_dict.get("type", rule.type)
    final_ledger = update_dict.get("ledger_id", rule.ledger_id)
    final_category = update_dict.get("category_id", rule.category_id)
    if "category_id" in update_dict or "type" in update_dict or "ledger_id" in update_dict:
        _validate_category(db, final_category, final_ledger, final_type)
    for key, value in update_dict.items():
        setattr(rule, key, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(RecurringRule).filter(RecurringRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    db.delete(rule)
    db.commit()
    return {"message": "删除成功"}


@router.get("/rules/{rule_id}/preview", response_model=List[str])
def preview_dates(rule_id: int, count: int = 5, db: Session = Depends(get_db)):
    rule = db.query(RecurringRule).filter(RecurringRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="规则不存在")
    results = []
    current = _parse_date(rule.start_date)
    today = date.today()
    if current < today:
        current = today
    if rule.frequency == "monthly":
        dom = rule.day_of_month or current.day
        cursor = _first_monthly_on_or_after(current, dom)
        while len(results) < count:
            results.append(_fmt_date(cursor))
            cursor = _next_monthly_after(cursor, dom)
    elif rule.frequency == "weekly":
        dow = rule.day_of_week or current.weekday()
        days_ahead = dow - current.weekday()
        if days_ahead < 0:
            days_ahead += 7
        candidate = current + timedelta(days=days_ahead)
        while len(results) < count:
            results.append(_fmt_date(candidate))
            candidate += timedelta(days=7)
    elif rule.frequency == "yearly":
        dom = rule.day_of_month or current.day
        start_month = _parse_date(rule.start_date).month
        candidate = _find_monthly_day(current.year, start_month, dom)
        if candidate < current:
            candidate = _find_monthly_day(current.year + 1, start_month, dom)
        while len(results) < count:
            results.append(_fmt_date(candidate))
            candidate = _find_monthly_day(candidate.year + 1, start_month, dom)
    return results


@router.post("/preview", response_model=List[str])
def preview_dates_from_data(data: dict, count: int = 5):
    try:
        start = _parse_date(data.get("start_date", date.today().strftime("%Y-%m-%d")))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="start_date 格式错误")
    freq = data.get("frequency")
    if freq not in ("monthly", "weekly", "yearly"):
        raise HTTPException(status_code=400, detail="frequency 必须是 monthly/weekly/yearly")
    results = []
    today = date.today()
    current = start if start > today else today
    if freq == "monthly":
        dom = data.get("day_of_month") or start.day
        cursor = _first_monthly_on_or_after(current, dom)
        while len(results) < count:
            results.append(_fmt_date(cursor))
            cursor = _next_monthly_after(cursor, dom)
    elif freq == "weekly":
        dow = data.get("day_of_week")
        if dow is None:
            dow = start.weekday()
        days_ahead = dow - current.weekday()
        if days_ahead < 0:
            days_ahead += 7
        candidate = current + timedelta(days=days_ahead)
        while len(results) < count:
            results.append(_fmt_date(candidate))
            candidate += timedelta(days=7)
    elif freq == "yearly":
        dom = data.get("day_of_month") or start.day
        candidate = _find_monthly_day(current.year, start.month, dom)
        if candidate < current:
            candidate = _find_monthly_day(current.year + 1, start.month, dom)
        while len(results) < count:
            results.append(_fmt_date(candidate))
            candidate = _find_monthly_day(candidate.year + 1, start.month, dom)
    return results


@router.get("/logs/", response_model=List[RecurringLogOut])
def list_logs(
    rule_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(RecurringLog)
    if rule_id is not None:
        query = query.filter(RecurringLog.rule_id == rule_id)
    return query.order_by(RecurringLog.id.desc()).limit(limit).all()


@router.post("/generate", response_model=GenerateResult)
def generate_transactions(db: Session = Depends(get_db)):
    today = date.today()
    details = []
    generated_count = 0
    skipped_count = 0
    MAX_PER_RULE = 1000

    rules = db.query(RecurringRule).filter(RecurringRule.is_active == 1).all()

    for rule in rules:
        if not rule.next_date:
            continue
        try:
            end_d = None
            if rule.end_date:
                end_d = _parse_date(rule.end_date)
                if today > end_d:
                    rule.is_active = 0
                    details.append(f"规则#{rule.id}({rule.name})已过结束日期，已停用")
                    continue
        except ValueError:
            end_d = None

        loop_count = 0
        while loop_count < MAX_PER_RULE:
            try:
                next_d = _parse_date(rule.next_date)
            except ValueError:
                break

            if end_d and next_d > end_d:
                rule.is_active = 0
                details.append(f"规则#{rule.id}({rule.name})已到结束日期{rule.end_date}，已停用")
                break

            if next_d > today:
                break

            loop_count += 1
            tx_date_str = rule.next_date

            existing_log = (
                db.query(RecurringLog)
                .filter(
                    RecurringLog.rule_id == rule.id,
                    RecurringLog.generated_date == tx_date_str,
                )
                .first()
            )
            if existing_log:
                skipped_count += 1
                details.append(f"规则#{rule.id}({rule.name})日期{tx_date_str}已生成，跳过")

                new_next = _calc_next_date(rule, next_d)
                if not new_next or new_next <= next_d:
                    break
                rule.next_date = _fmt_date(new_next)
                continue

            tx = Transaction(
                amount=rule.amount,
                type=rule.type,
                description=rule.description or f"[周期]{rule.name}",
                category_id=rule.category_id,
                ledger_id=rule.ledger_id,
                date=tx_date_str,
            )
            db.add(tx)
            db.flush()

            log = RecurringLog(
                rule_id=rule.id,
                transaction_id=tx.id,
                generated_date=tx_date_str,
                status="success",
                message=f"已生成交易 #{tx.id}",
            )
            db.add(log)

            new_next = _calc_next_date(rule, next_d)
            if not new_next or new_next <= next_d:
                details.append(
                    f"规则#{rule.id}({rule.name})已生成交易，日期{tx_date_str}，无法计算下次执行日期，停止"
                )
                generated_count += 1
                break

            rule.next_date = _fmt_date(new_next)
            generated_count += 1
            details.append(
                f"规则#{rule.id}({rule.name})已生成交易，日期{tx_date_str}，下次执行{rule.next_date}"
            )

        if loop_count >= MAX_PER_RULE:
            details.append(
                f"规则#{rule.id}({rule.name})达到单次补齐上限{MAX_PER_RULE}，已停止，剩余下次再处理"
            )

    db.commit()

    return GenerateResult(
        total_rules=len(rules),
        generated_count=generated_count,
        skipped_count=skipped_count,
        details=details,
    )
