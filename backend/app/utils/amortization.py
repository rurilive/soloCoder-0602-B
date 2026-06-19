import copy
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


def calculate_reduce_payment_schedule(
    remaining_principal: float,
    annual_rate: float,
    remaining_periods: int,
    start_date: str,
    repayment_day: int,
    early_repayment_period: int,
) -> List[Dict]:
    monthly_rate = annual_rate / 100 / 12

    if monthly_rate == 0:
        new_monthly_payment = remaining_principal / remaining_periods
    else:
        new_monthly_payment = (remaining_principal * monthly_rate) / (1 - (1 + monthly_rate) ** (-remaining_periods))

    new_monthly_payment = round(new_monthly_payment, 2)

    remaining = remaining_principal
    schedule = []

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    for i in range(remaining_periods):
        period = i + 1
        interest = remaining * monthly_rate
        interest = round(interest, 2)

        is_last_period = (i == remaining_periods - 1)

        if is_last_period:
            principal_payment = remaining
            payment = principal_payment + interest
        else:
            if new_monthly_payment < interest:
                payment = interest
                principal_payment = 0
            else:
                payment = new_monthly_payment
                principal_payment = payment - interest

        remaining -= principal_payment

        due_dt = start_dt + relativedelta(months=period)
        try:
            due_dt = due_dt.replace(day=repayment_day)
        except ValueError:
            due_dt = due_dt + relativedelta(day=repayment_day)

        if remaining < 0.01:
            remaining = 0.0

        schedule.append({
            "period_number": early_repayment_period + period,
            "due_date": due_dt.strftime("%Y-%m-%d"),
            "payment_amount": round(payment, 2),
            "principal_amount": round(principal_payment, 2),
            "interest_amount": round(interest, 2),
            "remaining_principal": round(remaining, 2),
            "status": "pending",
        })

    return schedule


def calculate_reduce_term_schedule(
    remaining_principal: float,
    annual_rate: float,
    original_monthly_payment: float,
    start_date: str,
    repayment_day: int,
    early_repayment_period: int,
    max_remaining_periods: int,
) -> List[Dict]:
    monthly_rate = annual_rate / 100 / 12

    remaining = remaining_principal
    schedule = []

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")

    period = 1
    while remaining > 0.01 and period <= max_remaining_periods:
        interest = remaining * monthly_rate
        interest = round(interest, 2)

        is_last_period = (remaining + interest) <= original_monthly_payment + 0.01

        if is_last_period:
            principal_payment = remaining
            payment = principal_payment + interest
        else:
            if original_monthly_payment < interest:
                payment = interest
                principal_payment = 0
            else:
                payment = original_monthly_payment
                principal_payment = payment - interest

        remaining -= principal_payment

        due_dt = start_dt + relativedelta(months=period)
        try:
            due_dt = due_dt.replace(day=repayment_day)
        except ValueError:
            due_dt = due_dt + relativedelta(day=repayment_day)

        if remaining < 0.01:
            remaining = 0.0

        schedule.append({
            "period_number": early_repayment_period + period,
            "due_date": due_dt.strftime("%Y-%m-%d"),
            "payment_amount": round(payment, 2),
            "principal_amount": round(principal_payment, 2),
            "interest_amount": round(interest, 2),
            "remaining_principal": round(remaining, 2),
            "status": "pending",
        })

        if is_last_period:
            break

        period += 1

    return schedule


def recalculate_schedule_after_early_repayment(
    original_schedule: List[Dict],
    early_repayment_period: int,
    early_repayment_amount: float,
    amortization_type: str,
    annual_rate: float,
    repayment_type: str = "reduce_payment",
) -> List[Dict]:
    paid_schedule = [copy.deepcopy(item) for item in original_schedule[:early_repayment_period - 1]]

    target_period = copy.deepcopy(original_schedule[early_repayment_period - 1])

    remaining_principal = target_period["remaining_principal"] - early_repayment_amount
    if remaining_principal < 0:
        remaining_principal = 0

    remaining_periods = len(original_schedule) - early_repayment_period
    original_monthly_payment = target_period["payment_amount"]

    paid_schedule.append({
        **target_period,
        "payment_amount": round(target_period["payment_amount"] + early_repayment_amount, 2),
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

    if repayment_type == "reduce_payment":
        new_schedule = calculate_reduce_payment_schedule(
            remaining_principal=remaining_principal,
            annual_rate=annual_rate,
            remaining_periods=remaining_periods,
            start_date=start_date,
            repayment_day=repayment_day,
            early_repayment_period=early_repayment_period,
        )
    elif repayment_type == "reduce_term":
        new_schedule = calculate_reduce_term_schedule(
            remaining_principal=remaining_principal,
            annual_rate=annual_rate,
            original_monthly_payment=original_monthly_payment,
            start_date=start_date,
            repayment_day=repayment_day,
            early_repayment_period=early_repayment_period,
            max_remaining_periods=remaining_periods,
        )
    else:
        if amortization_type == "equal_principal":
            new_schedule, _, _ = calculate_equal_principal(
                principal=remaining_principal,
                annual_rate=annual_rate,
                term_months=remaining_periods,
                start_date=start_date,
                repayment_day=repayment_day,
            )
        else:
            new_schedule, _, _ = calculate_equal_payment(
                principal=remaining_principal,
                annual_rate=annual_rate,
                term_months=remaining_periods,
                start_date=start_date,
                repayment_day=repayment_day,
            )

        for i, item in enumerate(new_schedule):
            item["period_number"] = early_repayment_period + i + 1
            item["status"] = "pending"

    return paid_schedule + new_schedule


def recalculate_schedule_after_rate_change(
    original_schedule: List[Dict],
    change_period: int,
    new_annual_rate: float,
) -> List[Dict]:
    paid_schedule = [copy.deepcopy(item) for item in original_schedule[:change_period - 1]]

    target_period = copy.deepcopy(original_schedule[change_period - 1])
    remaining_principal = target_period["remaining_principal"]
    original_monthly_payment = target_period["payment_amount"]

    if remaining_principal <= 0.01:
        return original_schedule

    monthly_rate = new_annual_rate / 100 / 12
    start_dt = datetime.strptime(target_period["due_date"], "%Y-%m-%d")
    repayment_day = start_dt.day
    remaining = remaining_principal
    schedule = []

    period = 0
    while remaining > 0.01:
        period += 1
        interest = remaining * monthly_rate
        interest = round(interest, 2)

        is_last_period = (remaining + interest) <= original_monthly_payment + 0.01

        if is_last_period:
            principal_payment = remaining
            payment = principal_payment + interest
        else:
            if original_monthly_payment < interest:
                payment = interest
                principal_payment = 0
            else:
                payment = original_monthly_payment
                principal_payment = payment - interest

        remaining -= principal_payment

        due_dt = start_dt + relativedelta(months=period)
        try:
            due_dt = due_dt.replace(day=repayment_day)
        except ValueError:
            due_dt = due_dt + relativedelta(day=repayment_day)

        if remaining < 0.01:
            remaining = 0.0

        if period == 1:
            schedule.append({
                **target_period,
                "period_number": change_period,
                "due_date": due_dt.strftime("%Y-%m-%d"),
                "payment_amount": round(payment, 2),
                "principal_amount": round(principal_payment, 2),
                "interest_amount": round(interest, 2),
                "remaining_principal": round(remaining, 2),
                "annual_rate": new_annual_rate,
                "is_rate_changed": True,
            })
        else:
            schedule.append({
                "period_number": change_period + period - 1,
                "due_date": due_dt.strftime("%Y-%m-%d"),
                "payment_amount": round(payment, 2),
                "principal_amount": round(principal_payment, 2),
                "interest_amount": round(interest, 2),
                "remaining_principal": round(remaining, 2),
                "status": "pending",
                "annual_rate": new_annual_rate,
                "is_rate_changed": False,
                "is_early_repayment": False,
                "early_repayment_amount": 0.0,
            })

        if is_last_period:
            break

    return paid_schedule + schedule


def apply_multiple_rate_changes(
    original_schedule: List[Dict],
    rate_changes: List[Dict],
) -> List[Dict]:
    sorted_changes = sorted(rate_changes, key=lambda x: x["change_period"])
    current_schedule = [copy.deepcopy(item) for item in original_schedule]

    for change in sorted_changes:
        change_period = change["change_period"]
        new_rate = change["new_annual_rate"]

        if change_period <= 0 or change_period > len(current_schedule):
            continue

        found = False
        for i, item in enumerate(current_schedule):
            if item["period_number"] == change_period and item["status"] != "paid":
                found = True
                break

        if not found:
            continue

        current_schedule = recalculate_schedule_after_rate_change(
            current_schedule,
            change_period,
            new_rate,
        )

        for item in current_schedule:
            if item["period_number"] >= change_period:
                change_index = sorted_changes.index(change)
                item["rate_change_index"] = change_index

    return current_schedule


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
