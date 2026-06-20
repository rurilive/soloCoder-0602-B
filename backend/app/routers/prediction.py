from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Tuple, Dict
from datetime import date, datetime
import statistics

from app.database import get_db
from app.models import Transaction, Ledger, Account, RecurringRule, Loan, LoanRepaymentSchedule
from app.schemas import (
    MonthlyCashFlowPoint,
    CashFlowPredictionWarning,
    CashFlowPredictionResponse,
)
from app.exchange_rate import convert_amount

router = APIRouter(prefix="/api/prediction", tags=["prediction"])


def _add_months(year: int, month: int, delta: int) -> Tuple[int, int]:
    total = year * 12 + (month - 1) + delta
    y, m = divmod(total, 12)
    return y, m + 1


def _month_range(year: int, month: int) -> Tuple[str, str]:
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


def _month_label(year: int, month: int) -> str:
    return f"{year}年{month}月"


def _weighted_moving_average(values: List[float], weights: List[float]) -> float:
    if not values or not weights:
        return 0.0
    if len(values) < len(weights):
        weights = weights[: len(values)]
    values = values[-len(weights) :]
    total_weight = sum(weights)
    if total_weight == 0:
        return 0.0
    return sum(v * w for v, w in zip(values, weights)) / total_weight


def _calculate_confidence_interval(
    values: List[float], predicted_value: float, confidence_level: float = 0.95
) -> Tuple[float, float]:
    if len(values) < 2:
        margin = abs(predicted_value) * 0.2
        return predicted_value - margin, predicted_value + margin

    std_dev = statistics.stdev(values)
    z_score = 1.96 if confidence_level >= 0.95 else 1.645
    margin_of_error = z_score * std_dev / (len(values) ** 0.5)

    lower = predicted_value - margin_of_error
    upper = predicted_value + margin_of_error

    if predicted_value >= 0:
        lower = max(lower, 0)
    else:
        upper = min(upper, 0)

    return lower, upper


def _get_monthly_summary(
    db: Session,
    ledger_id: int,
    year: int,
    month: int,
    base_currency: str,
    account_currency_map: Dict[int, str],
) -> Tuple[float, float, int]:
    start, end = _month_range(year, month)
    tx_rows = (
        db.query(
            Transaction.type,
            Transaction.amount,
            Transaction.date,
            Transaction.account_id,
        )
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .all()
    )

    income = 0.0
    expense = 0.0
    tx_count = len(tx_rows)

    for r in tx_rows:
        src_currency = account_currency_map.get(r.account_id, base_currency)
        amount = float(r.amount or 0)
        if src_currency != base_currency:
            try:
                converted, _, _, _ = convert_amount(
                    db, amount, src_currency, base_currency, r.date
                )
                amount = converted
            except ValueError:
                pass
        if r.type == "income":
            income += amount
        else:
            expense += amount

    return income, expense, tx_count


def _get_recurring_rules_for_month(
    db: Session, ledger_id: int, year: int, month: int
) -> Tuple[float, float]:
    start, end = _month_range(year, month)
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.ledger_id == ledger_id,
            RecurringRule.is_active == 1,
            RecurringRule.next_date >= start,
            RecurringRule.next_date < end,
        )
        .all()
    )

    recurring_income = 0.0
    recurring_expense = 0.0

    for rule in rules:
        if rule.type == "income":
            recurring_income += float(rule.amount or 0)
        else:
            recurring_expense += float(rule.amount or 0)

    return recurring_income, recurring_expense


def _get_loan_payments_for_month(
    db: Session, ledger_id: int, year: int, month: int
) -> float:
    start, end = _month_range(year, month)
    active_loans = (
        db.query(Loan)
        .filter(
            Loan.ledger_id == ledger_id,
            Loan.status == "active",
        )
        .all()
    )

    if not active_loans:
        return 0.0

    loan_ids = [loan.id for loan in active_loans]
    schedules = (
        db.query(LoanRepaymentSchedule)
        .filter(
            LoanRepaymentSchedule.loan_id.in_(loan_ids),
            LoanRepaymentSchedule.due_date >= start,
            LoanRepaymentSchedule.due_date < end,
            LoanRepaymentSchedule.status.in_(["pending", "overdue"]),
        )
        .all()
    )

    total_payment = sum(float(s.payment_amount or 0) for s in schedules)
    return total_payment


@router.get("/cash-flow", response_model=CashFlowPredictionResponse)
def predict_cash_flow(
    ledger_id: int = Query(...),
    historical_months: int = Query(6, ge=1, le=24, description="历史数据月份数"),
    predicted_months: int = Query(6, ge=1, le=12, description="预测月份数"),
    target_currency: str = Query(None, description="目标币种，默认使用账本本位币"),
    db: Session = Depends(get_db),
):
    today = date.today()
    current_year = today.year
    current_month = today.month

    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        base_currency = "CNY"
    else:
        base_currency = target_currency or ledger.base_currency or "CNY"

    account_ids = set()
    for i in range(historical_months):
        y, m = _add_months(current_year, current_month, -i - 1)
        start, end = _month_range(y, m)
        txs = (
            db.query(Transaction.account_id)
            .filter(
                Transaction.ledger_id == ledger_id,
                Transaction.date >= start,
                Transaction.date < end,
            )
            .all()
        )
        for t in txs:
            account_ids.add(t[0])

    accounts = (
        db.query(Account).filter(Account.id.in_(list(account_ids))).all()
        if account_ids
        else []
    )
    account_currency_map = {a.id: a.currency for a in accounts}

    historical_data: List[MonthlyCashFlowPoint] = []
    historical_incomes: List[float] = []
    historical_expenses: List[float] = []

    for i in range(historical_months):
        y, m = _add_months(current_year, current_month, -historical_months + i)
        income, expense, tx_count = _get_monthly_summary(
            db, ledger_id, y, m, base_currency, account_currency_map
        )

        net = income - expense
        point = MonthlyCashFlowPoint(
            year=y,
            month=m,
            label=_month_label(y, m),
            income=round(income, 2),
            expense=round(expense, 2),
            net_cash_flow=round(net, 2),
            is_actual=True,
            confidence_level=1.0 if tx_count > 0 else 0.0,
        )
        historical_data.append(point)
        historical_incomes.append(income)
        historical_expenses.append(expense)

    weights = [0.05, 0.1, 0.15, 0.2, 0.25, 0.25]

    predicted_data: List[MonthlyCashFlowPoint] = []
    all_predicted_incomes: List[float] = []
    all_predicted_expenses: List[float] = []

    for i in range(predicted_months):
        y, m = _add_months(current_year, current_month, i)

        extended_incomes = historical_incomes + all_predicted_incomes
        extended_expenses = historical_expenses + all_predicted_expenses

        base_income = _weighted_moving_average(extended_incomes, weights)
        base_expense = _weighted_moving_average(extended_expenses, weights)

        recurring_income, recurring_expense = _get_recurring_rules_for_month(
            db, ledger_id, y, m
        )

        if recurring_income > 0 and base_income > 0:
            base_income = max(base_income, recurring_income)
        elif recurring_income > 0:
            base_income = recurring_income

        if recurring_expense > 0 and base_expense > 0:
            base_expense = max(base_expense, recurring_expense)
        elif recurring_expense > 0:
            base_expense = recurring_expense

        loan_payment = _get_loan_payments_for_month(db, ledger_id, y, m)
        base_expense += loan_payment

        predicted_income = round(base_income, 2)
        predicted_expense = round(base_expense, 2)
        predicted_net = round(predicted_income - predicted_expense, 2)

        all_predicted_incomes.append(predicted_income)
        all_predicted_expenses.append(predicted_expense)

        recent_incomes = [x for x in extended_incomes[-6:] if x > 0] or [predicted_income]
        recent_expenses = [x for x in extended_expenses[-6:] if x > 0] or [predicted_expense]

        income_lower, income_upper = _calculate_confidence_interval(
            recent_incomes, predicted_income
        )
        expense_lower, expense_upper = _calculate_confidence_interval(
            recent_expenses, predicted_expense
        )

        net_lower = round(income_lower - expense_upper, 2)
        net_upper = round(income_upper - expense_lower, 2)

        data_points = len([x for x in recent_incomes if x > 0])
        confidence = min(0.9, 0.5 + (data_points * 0.1))

        point = MonthlyCashFlowPoint(
            year=y,
            month=m,
            label=_month_label(y, m),
            income=predicted_income,
            expense=predicted_expense,
            net_cash_flow=predicted_net,
            is_actual=False,
            income_lower=round(income_lower, 2),
            income_upper=round(income_upper, 2),
            expense_lower=round(expense_lower, 2),
            expense_upper=round(expense_upper, 2),
            net_lower=net_lower,
            net_upper=net_upper,
            confidence_level=round(confidence, 2),
        )
        predicted_data.append(point)

    combined_data = historical_data + predicted_data

    has_warning = False
    consecutive_negative = 0
    max_consecutive = 0
    max_first = None
    max_last = None
    temp_first = None

    for point in predicted_data:
        if point.net_cash_flow < 0:
            consecutive_negative += 1
            if temp_first is None:
                temp_first = point.label
            if consecutive_negative >= max_consecutive:
                max_consecutive = consecutive_negative
                max_first = temp_first
                max_last = point.label
        else:
            consecutive_negative = 0
            temp_first = None

    suggestions: List[str] = []
    if max_consecutive >= 3:
        has_warning = True
        suggestions = [
            "预测显示未来将连续多个月出现负现金流，建议立即采取行动。",
            "审查非必要支出，寻找削减开支的机会（如娱乐、购物等）。",
            "检查贷款还款计划，考虑是否可以调整还款方式或进行债务重组。",
            "探索增加收入的可能性，如副业、兼职或投资收益。",
            "建立应急储备金，以应对突发的财务压力。",
        ]
    elif max_consecutive >= 1:
        suggestions = [
            "预测显示部分月份可能出现负现金流，建议提前做好资金规划。",
            "关注大额支出月份，确保有足够的资金储备。",
        ]
    else:
        suggestions = [
            "预测显示未来现金流健康，继续保持良好的理财习惯。",
            "可考虑将盈余资金用于投资或加速偿还贷款。",
        ]

    warning = CashFlowPredictionWarning(
        has_warning=has_warning,
        consecutive_negative_months=max_consecutive,
        first_negative_month=max_first if max_consecutive >= 3 else None,
        last_negative_month=max_last if max_consecutive >= 3 else None,
        suggestions=suggestions,
    )

    model_description = (
        f"采用加权移动平均模型（WMA）进行预测，基于最近{historical_months}个月的历史交易数据，"
        f"同时叠加周期性规则和贷款还款计划的固定支出。权重分配为：最近月份权重25%，逐月累减5%。"
        f"置信区间基于95%置信水平计算。"
    )

    return CashFlowPredictionResponse(
        ledger_id=ledger_id,
        base_currency=base_currency,
        historical_months=historical_months,
        predicted_months=predicted_months,
        historical_data=historical_data,
        predicted_data=predicted_data,
        combined_data=combined_data,
        warning=warning,
        model_description=model_description,
    )
