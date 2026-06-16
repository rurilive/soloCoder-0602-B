from datetime import datetime
from dateutil.relativedelta import relativedelta
from typing import List, Dict


def calculate_equal_principal(
    principal: float,
    annual_rate: float,
    term_months: int,
    start_date: str,
    repayment_day: int,
) -> List[Dict]:
    monthly_rate = annual_rate / 100 / 12
    monthly_principal = principal / term_months
    remaining = principal
    schedule = []

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    for i in range(term_months):
        period = i + 1
        interest = remaining * monthly_rate
        payment = monthly_principal + interest
        remaining -= monthly_principal

        due_dt = start_dt + relativedelta(months=period)
        try:
            due_dt = due_dt.replace(day=repayment_day)
        except ValueError:
            due_dt = due_dt + relativedelta(day=repayment_day)

        if remaining < 0.01:
            remaining = 0.0

        schedule.append({
            "period_number": period,
            "due_date": due_dt.strftime("%Y-%m-%d"),
            "payment_amount": round(payment, 2),
            "principal_amount": round(monthly_principal, 2),
            "interest_amount": round(interest, 2),
            "remaining_principal": round(remaining, 2),
            "status": "pending",
        })

    total_interest = sum(item["interest_amount"] for item in schedule)
    total_payment = sum(item["payment_amount"] for item in schedule)

    return schedule, round(total_interest, 2), round(total_payment, 2)


def calculate_equal_payment(
    principal: float,
    annual_rate: float,
    term_months: int,
    start_date: str,
    repayment_day: int,
) -> List[Dict]:
    monthly_rate = annual_rate / 100 / 12

    if monthly_rate == 0:
        monthly_payment = principal / term_months
    else:
        monthly_payment = (principal * monthly_rate) / (1 - (1 + monthly_rate) ** (-term_months))

    remaining = principal
    schedule = []

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    for i in range(term_months):
        period = i + 1
        interest = remaining * monthly_rate
        principal_payment = monthly_payment - interest
        remaining -= principal_payment

        due_dt = start_dt + relativedelta(months=period)
        try:
            due_dt = due_dt.replace(day=repayment_day)
        except ValueError:
            due_dt = due_dt + relativedelta(day=repayment_day)

        if remaining < 0.01:
            remaining = 0.0
            principal_payment += remaining

        schedule.append({
            "period_number": period,
            "due_date": due_dt.strftime("%Y-%m-%d"),
            "payment_amount": round(monthly_payment, 2),
            "principal_amount": round(principal_payment, 2),
            "interest_amount": round(interest, 2),
            "remaining_principal": round(remaining, 2),
            "status": "pending",
        })

    total_interest = sum(item["interest_amount"] for item in schedule)
    total_payment = sum(item["payment_amount"] for item in schedule)

    return schedule, round(total_interest, 2), round(total_payment, 2)


def recalculate_schedule_after_early_repayment(
    original_schedule: List[Dict],
    early_repayment_period: int,
    early_repayment_amount: float,
    amortization_type: str,
    repayment_type: str = "reduce_term",
) -> List[Dict]:
    paid_schedule = original_schedule[:early_repayment_period - 1]
    target_period = original_schedule[early_repayment_period - 1]

    remaining_principal = target_period["remaining_principal"] - early_repayment_amount
    if remaining_principal < 0:
        remaining_principal = 0

    remaining_periods = len(original_schedule) - early_repayment_period
    paid_schedule.append({
        **target_period,
        "is_early_repayment": True,
        "early_repayment_amount": round(early_repayment_amount, 2),
        "remaining_principal": round(remaining_principal, 2),
    })

    if remaining_principal <= 0.01 or remaining_periods <= 0:
        return paid_schedule

    last_paid_date = target_period["due_date"]
    last_paid_dt = datetime.strptime(last_paid_date, "%Y-%m-%d")
    start_date = last_paid_dt.strftime("%Y-%m-%d")
    repayment_day = last_paid_dt.day

    if amortization_type == "equal_principal":
        new_schedule, _, _ = calculate_equal_principal(
            principal=remaining_principal,
            annual_rate=0,
            term_months=remaining_periods,
            start_date=start_date,
            repayment_day=repayment_day,
        )
    else:
        new_schedule, _, _ = calculate_equal_payment(
            principal=remaining_principal,
            annual_rate=0,
            term_months=remaining_periods,
            start_date=start_date,
            repayment_day=repayment_day,
        )

    for i, item in enumerate(new_schedule):
        item["period_number"] = early_repayment_period + i + 1
        item["status"] = "pending"

    return paid_schedule + new_schedule


def calculate_amortization_schedule(
    principal: float,
    annual_rate: float,
    term_months: int,
    amortization_type: str,
    start_date: str,
    repayment_day: int,
) -> tuple[List[Dict], float, float]:
    if amortization_type == "equal_principal":
        return calculate_equal_principal(principal, annual_rate, term_months, start_date, repayment_day)
    elif amortization_type == "equal_payment":
        return calculate_equal_payment(principal, annual_rate, term_months, start_date, repayment_day)
    else:
        raise ValueError(f"Unknown amortization type: {amortization_type}")
