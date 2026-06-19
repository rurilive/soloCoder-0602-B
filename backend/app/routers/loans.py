from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import Loan, LoanRepaymentSchedule, Transaction, Category, Account
from app.schemas import (
    LoanCreate,
    LoanUpdate,
    LoanOut,
    LoanWithSchedule,
    LoanRepaymentScheduleOut,
    EarlyRepaymentRequest,
    EarlyRepaymentPreviewRequest,
    EarlyRepaymentPreviewResponse,
    LoanRemainingPrincipalPoint,
    RateChangeSimulationRequest,
    RateChangeSimulationResponse,
)
from app.utils.amortization import (
    calculate_amortization_schedule,
    recalculate_schedule_after_early_repayment,
    apply_multiple_rate_changes,
)

router = APIRouter(prefix="/api/loans", tags=["loans"])


def _validate_category(db, category_id, ledger_id):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=400, detail="分类不存在")
    if cat.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该分类不属于当前账本")
    if cat.type != "expense":
        raise HTTPException(status_code=400, detail="贷款还款分类必须是支出类型")
    return cat


def _validate_account(db, account_id, ledger_id):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=400, detail="账户不存在")
    if account.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该账户不属于当前账本")
    return account


def _update_schedule_status(schedules: List[LoanRepaymentSchedule]) -> List[LoanRepaymentSchedule]:
    today = datetime.now().strftime("%Y-%m-%d")
    for s in schedules:
        if s.status == "pending" and s.due_date < today:
            s.status = "overdue"
    return schedules


@router.get("/", response_model=List[LoanOut])
def list_loans(
    ledger_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Loan)
    if ledger_id is not None:
        query = query.filter(Loan.ledger_id == ledger_id)
    if status is not None:
        query = query.filter(Loan.status == status)
    return query.order_by(Loan.created_at.desc()).all()


@router.get("/{loan_id}", response_model=LoanWithSchedule)
def get_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    schedules = _update_schedule_status(schedules)

    return {
        **loan.__dict__,
        "schedule": schedules,
    }


@router.post("/", response_model=LoanWithSchedule)
def create_loan(data: LoanCreate, db: Session = Depends(get_db)):
    _validate_category(db, data.category_id, data.ledger_id)
    _validate_account(db, data.account_id, data.ledger_id)

    if data.amortization_type not in ["equal_principal", "equal_payment"]:
        raise HTTPException(status_code=400, detail="摊销类型必须是 equal_principal 或 equal_payment")

    if data.principal <= 0:
        raise HTTPException(status_code=400, detail="贷款本金必须大于0")

    if data.annual_rate < 0:
        raise HTTPException(status_code=400, detail="年利率不能为负数")

    if data.term_months <= 0:
        raise HTTPException(status_code=400, detail="贷款期限必须大于0")

    if data.repayment_day < 1 or data.repayment_day > 31:
        raise HTTPException(status_code=400, detail="还款日必须在1-31之间")

    schedule, total_interest, total_payment = calculate_amortization_schedule(
        principal=data.principal,
        annual_rate=data.annual_rate,
        term_months=data.term_months,
        amortization_type=data.amortization_type,
        start_date=data.start_date,
        repayment_day=data.repayment_day,
    )

    loan = Loan(
        name=data.name,
        principal=data.principal,
        annual_rate=data.annual_rate,
        term_months=data.term_months,
        amortization_type=data.amortization_type,
        start_date=data.start_date,
        repayment_day=data.repayment_day,
        ledger_id=data.ledger_id,
        account_id=data.account_id,
        category_id=data.category_id,
        total_interest=total_interest,
        total_payment=total_payment,
        description=data.description,
        status="active",
    )
    db.add(loan)
    db.flush()

    for item in schedule:
        schedule_item = LoanRepaymentSchedule(
            loan_id=loan.id,
            period_number=item["period_number"],
            due_date=item["due_date"],
            payment_amount=item["payment_amount"],
            principal_amount=item["principal_amount"],
            interest_amount=item["interest_amount"],
            remaining_principal=item["remaining_principal"],
            status=item["status"],
            is_early_repayment=item.get("is_early_repayment", False),
            early_repayment_amount=item.get("early_repayment_amount", 0.0),
        )
        db.add(schedule_item)

    db.commit()
    db.refresh(loan)

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan.id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    schedules = _update_schedule_status(schedules)

    return {
        **loan.__dict__,
        "schedule": schedules,
    }


@router.put("/{loan_id}", response_model=LoanOut)
def update_loan(loan_id: int, data: LoanUpdate, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    update_dict = data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(loan, key, value)

    db.commit()
    db.refresh(loan)
    return loan


@router.delete("/{loan_id}")
def delete_loan(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id
    ).all()

    for s in schedules:
        if s.transaction_id:
            tx = db.query(Transaction).filter(Transaction.id == s.transaction_id).first()
            if tx:
                db.delete(tx)
        db.delete(s)

    db.delete(loan)
    db.commit()
    return {"message": "删除成功"}


@router.post("/early-repayment/preview", response_model=EarlyRepaymentPreviewResponse)
def preview_early_repayment(data: EarlyRepaymentPreviewRequest, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    if data.repayment_type not in ["reduce_payment", "reduce_term"]:
        raise HTTPException(status_code=400, detail="还款方式必须是 reduce_payment 或 reduce_term")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == data.loan_id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    if data.period_number < 1 or data.period_number > len(schedules):
        raise HTTPException(status_code=400, detail="提前还款期次无效")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="提前还款金额必须大于0")

    target_schedule = schedules[data.period_number - 1]

    if data.amount > target_schedule.remaining_principal:
        raise HTTPException(
            status_code=400,
            detail=f"提前还款金额不能超过剩余本金 {target_schedule.remaining_principal}",
        )

    schedule_dicts = [
        {
            "period_number": s.period_number,
            "due_date": s.due_date,
            "payment_amount": s.payment_amount,
            "principal_amount": s.principal_amount,
            "interest_amount": s.interest_amount,
            "remaining_principal": s.remaining_principal,
            "status": s.status,
            "is_early_repayment": s.is_early_repayment,
            "early_repayment_amount": s.early_repayment_amount,
        }
        for s in schedules
    ]

    original_remaining_schedule = schedule_dicts[data.period_number - 1:]
    original_total_payment = sum(item["payment_amount"] for item in original_remaining_schedule)
    original_total_interest = sum(item["interest_amount"] for item in original_remaining_schedule)
    original_monthly_payment = target_schedule.payment_amount
    original_remaining_periods = len(original_remaining_schedule)

    new_schedule = recalculate_schedule_after_early_repayment(
        original_schedule=schedule_dicts,
        early_repayment_period=data.period_number,
        early_repayment_amount=data.amount,
        amortization_type=loan.amortization_type,
        annual_rate=loan.annual_rate,
        repayment_type=data.repayment_type,
    )

    new_remaining_schedule = new_schedule[data.period_number - 1:]
    new_total_payment = sum(item["payment_amount"] for item in new_remaining_schedule)
    new_total_interest = sum(item["interest_amount"] for item in new_remaining_schedule)
    new_remaining_periods = len(new_remaining_schedule)

    new_monthly_payment = 0
    if len(new_remaining_schedule) > 1:
        new_monthly_payment = new_remaining_schedule[1]["payment_amount"]

    diff_schedule = []
    max_len = max(len(original_remaining_schedule), len(new_remaining_schedule))
    for i in range(max_len):
        orig = original_remaining_schedule[i] if i < len(original_remaining_schedule) else None
        new = new_remaining_schedule[i] if i < len(new_remaining_schedule) else None

        if orig and new:
            diff_schedule.append({
                "period_number": new["period_number"],
                "due_date": new["due_date"],
                "original_payment": orig["payment_amount"],
                "new_payment": new["payment_amount"],
                "payment_diff": round(new["payment_amount"] - orig["payment_amount"], 2),
                "original_principal": orig["principal_amount"],
                "new_principal": new["principal_amount"],
                "original_interest": orig["interest_amount"],
                "new_interest": new["interest_amount"],
                "original_remaining": orig["remaining_principal"],
                "new_remaining": new["remaining_principal"],
            })
        elif new:
            diff_schedule.append({
                "period_number": new["period_number"],
                "due_date": new["due_date"],
                "original_payment": 0,
                "new_payment": new["payment_amount"],
                "payment_diff": new["payment_amount"],
                "original_principal": 0,
                "new_principal": new["principal_amount"],
                "original_interest": 0,
                "new_interest": new["interest_amount"],
                "original_remaining": 0,
                "new_remaining": new["remaining_principal"],
            })
        elif orig:
            diff_schedule.append({
                "period_number": orig["period_number"],
                "due_date": orig["due_date"],
                "original_payment": orig["payment_amount"],
                "new_payment": 0,
                "payment_diff": round(-orig["payment_amount"], 2),
                "original_principal": orig["principal_amount"],
                "new_principal": 0,
                "original_interest": orig["interest_amount"],
                "new_interest": 0,
                "original_remaining": orig["remaining_principal"],
                "new_remaining": 0,
            })

    return {
        "original_schedule": original_remaining_schedule,
        "new_schedule": new_remaining_schedule,
        "diff_schedule": diff_schedule,
        "original_total_payment": round(original_total_payment, 2),
        "new_total_payment": round(new_total_payment, 2),
        "original_total_interest": round(original_total_interest, 2),
        "new_total_interest": round(new_total_interest, 2),
        "payment_saved": round(original_total_payment - new_total_payment, 2),
        "interest_saved": round(original_total_interest - new_total_interest, 2),
        "original_remaining_periods": original_remaining_periods,
        "new_remaining_periods": new_remaining_periods,
        "original_monthly_payment": round(original_monthly_payment, 2),
        "new_monthly_payment": round(new_monthly_payment, 2),
    }


@router.post("/early-repayment", response_model=LoanWithSchedule)
def early_repayment(data: EarlyRepaymentRequest, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    if loan.status != "active":
        raise HTTPException(status_code=400, detail="贷款状态不是活跃状态")

    if data.repayment_type not in ["reduce_payment", "reduce_term"]:
        raise HTTPException(status_code=400, detail="还款方式必须是 reduce_payment 或 reduce_term")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == data.loan_id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    if data.period_number < 1 or data.period_number > len(schedules):
        raise HTTPException(status_code=400, detail="提前还款期次无效")

    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="提前还款金额必须大于0")

    target_schedule = schedules[data.period_number - 1]
    if target_schedule.status == "paid":
        raise HTTPException(status_code=400, detail="该期已还款，不能提前还款")

    if data.amount > target_schedule.remaining_principal:
        raise HTTPException(
            status_code=400,
            detail=f"提前还款金额不能超过剩余本金 {target_schedule.remaining_principal}",
        )

    schedule_dicts = [
        {
            "period_number": s.period_number,
            "due_date": s.due_date,
            "payment_amount": s.payment_amount,
            "principal_amount": s.principal_amount,
            "interest_amount": s.interest_amount,
            "remaining_principal": s.remaining_principal,
            "status": s.status,
            "is_early_repayment": s.is_early_repayment,
            "early_repayment_amount": s.early_repayment_amount,
        }
        for s in schedules
    ]

    new_schedule = recalculate_schedule_after_early_repayment(
        original_schedule=schedule_dicts,
        early_repayment_period=data.period_number,
        early_repayment_amount=data.amount,
        amortization_type=loan.amortization_type,
        annual_rate=loan.annual_rate,
        repayment_type=data.repayment_type,
    )

    for s in schedules:
        db.delete(s)

    for item in new_schedule:
        orig = schedules[item["period_number"] - 1] if item["period_number"] <= len(schedules) else None
        if orig and orig.status == "paid":
            schedule_item = LoanRepaymentSchedule(
                loan_id=loan.id,
                period_number=orig.period_number,
                due_date=orig.due_date,
                payment_amount=orig.payment_amount,
                principal_amount=orig.principal_amount,
                interest_amount=orig.interest_amount,
                remaining_principal=orig.remaining_principal,
                status=orig.status,
                transaction_id=orig.transaction_id,
                is_early_repayment=orig.is_early_repayment,
                early_repayment_amount=orig.early_repayment_amount,
            )
        else:
            schedule_item = LoanRepaymentSchedule(
                loan_id=loan.id,
                period_number=item["period_number"],
                due_date=item["due_date"],
                payment_amount=item["payment_amount"],
                principal_amount=item["principal_amount"],
                interest_amount=item["interest_amount"],
                remaining_principal=item["remaining_principal"],
                status=item.get("status", "pending"),
                transaction_id=None,
                is_early_repayment=item.get("is_early_repayment", False),
                early_repayment_amount=item.get("early_repayment_amount", 0.0),
            )
        db.add(schedule_item)

    total_interest = sum(item["interest_amount"] for item in new_schedule)
    total_payment = sum(item["payment_amount"] for item in new_schedule)
    loan.total_interest = round(total_interest, 2)
    loan.total_payment = round(total_payment, 2)

    remaining_principals = [s["remaining_principal"] for s in new_schedule]
    if remaining_principals and remaining_principals[-1] <= 0.01:
        loan.status = "paid_off"

    db.commit()
    db.refresh(loan)

    updated_schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan.id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    updated_schedules = _update_schedule_status(updated_schedules)

    return {
        **loan.__dict__,
        "schedule": updated_schedules,
    }


@router.post("/{loan_id}/generate-transaction/{schedule_id}", response_model=LoanRepaymentScheduleOut)
def generate_repayment_transaction(
    loan_id: int,
    schedule_id: int,
    db: Session = Depends(get_db),
):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    schedule = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.id == schedule_id,
        LoanRepaymentSchedule.loan_id == loan_id,
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="还款计划不存在")

    if schedule.status == "paid":
        raise HTTPException(status_code=400, detail="该期已生成交易")

    total_amount = schedule.payment_amount
    description = f"{loan.name} - 第{schedule.period_number}期还款"
    if schedule.is_early_repayment:
        description += f"（含提前还款{schedule.early_repayment_amount}）"

    tx = Transaction(
        amount=total_amount,
        type="expense",
        description=description,
        category_id=loan.category_id,
        ledger_id=loan.ledger_id,
        account_id=loan.account_id,
        date=schedule.due_date,
    )
    db.add(tx)
    db.flush()

    schedule.transaction_id = tx.id
    schedule.status = "paid"

    db.commit()
    db.refresh(schedule)

    all_schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id
    ).all()
    all_paid = all(s.status == "paid" for s in all_schedules)
    if all_paid:
        loan.status = "paid_off"
        db.commit()

    return schedule


@router.get("/{loan_id}/remaining-principal", response_model=List[LoanRemainingPrincipalPoint])
def get_remaining_principal_curve(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    result = [
        {
            "period_number": 0,
            "due_date": loan.start_date,
            "remaining_principal": loan.principal,
        }
    ]

    for s in schedules:
        result.append({
            "period_number": s.period_number,
            "due_date": s.due_date,
            "remaining_principal": s.remaining_principal,
        })

    return result


@router.post("/{loan_id}/generate-overdue-transactions")
def generate_overdue_transactions(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    today = datetime.now().strftime("%Y-%m-%d")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id,
        LoanRepaymentSchedule.status.in_(["pending", "overdue"]),
        LoanRepaymentSchedule.transaction_id.is_(None),
        LoanRepaymentSchedule.due_date <= today,
    ).order_by(LoanRepaymentSchedule.period_number).all()

    success_count = 0
    failed_count = 0
    failed_details = []

    for schedule in schedules:
        try:
            total_amount = schedule.payment_amount
            description = f"{loan.name} - 第{schedule.period_number}期还款"
            if schedule.is_early_repayment:
                description += f"（含提前还款{schedule.early_repayment_amount}）"

            tx = Transaction(
                amount=total_amount,
                type="expense",
                description=description,
                category_id=loan.category_id,
                ledger_id=loan.ledger_id,
                account_id=loan.account_id,
                date=schedule.due_date,
            )
            db.add(tx)
            db.flush()

            schedule.transaction_id = tx.id
            schedule.status = "paid"
            success_count += 1
        except Exception as e:
            failed_count += 1
            failed_details.append({
                "period_number": schedule.period_number,
                "error": str(e),
            })

    if success_count > 0:
        db.commit()

    all_schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == loan_id
    ).all()
    all_paid = all(s.status == "paid" for s in all_schedules)
    if all_paid:
        loan.status = "paid_off"
        db.commit()

    return {
        "message": "批量生成完成",
        "success_count": success_count,
        "failed_count": failed_count,
        "failed_details": failed_details,
        "total_processed": len(schedules),
    }


RATE_CHANGE_COLORS = [
    "#ff7875",
    "#ffa940",
    "#ffd666",
    "#95de64",
    "#5cdbd3",
    "#69c0ff",
    "#85a5ff",
    "#b37feb",
    "#ff85c0",
]


@router.post("/rate-change/simulation", response_model=RateChangeSimulationResponse)
def simulate_rate_change(data: RateChangeSimulationRequest, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    if not data.rate_changes or len(data.rate_changes) == 0:
        raise HTTPException(status_code=400, detail="请至少设置一次利率变动")

    schedules = db.query(LoanRepaymentSchedule).filter(
        LoanRepaymentSchedule.loan_id == data.loan_id
    ).order_by(LoanRepaymentSchedule.period_number).all()

    if len(schedules) == 0:
        raise HTTPException(status_code=400, detail="该贷款没有还款计划")

    schedule_dicts = []
    for s in schedules:
        item = {
            "period_number": s.period_number,
            "due_date": s.due_date,
            "payment_amount": s.payment_amount,
            "principal_amount": s.principal_amount,
            "interest_amount": s.interest_amount,
            "remaining_principal": s.remaining_principal,
            "status": s.status,
            "is_early_repayment": s.is_early_repayment,
            "early_repayment_amount": s.early_repayment_amount,
            "annual_rate": loan.annual_rate,
        }
        schedule_dicts.append(item)

    original_schedule = [dict(item) for item in schedule_dicts]

    for i, change in enumerate(data.rate_changes):
        if change.change_period < 1:
            raise HTTPException(status_code=400, detail=f"第{i+1}次利率变动的期次必须大于0")
        if change.new_annual_rate < 0:
            raise HTTPException(status_code=400, detail=f"第{i+1}次利率变动的新利率不能为负数")

        period_exists = False
        for s in schedule_dicts:
            if s["period_number"] == change.change_period:
                period_exists = True
                if s["status"] == "paid":
                    raise HTTPException(status_code=400, detail=f"第{change.change_period}期已还款，不能在该期调整利率")
                break

        if not period_exists:
            raise HTTPException(status_code=400, detail=f"第{change.change_period}期不存在")

    rate_changes_list = [
        {"change_period": c.change_period, "new_annual_rate": c.new_annual_rate}
        for c in data.rate_changes
    ]

    if loan.amortization_type == "equal_payment":
        monthly_rate = loan.annual_rate / 100 / 12
        if monthly_rate == 0:
            standard_monthly_payment = loan.principal / loan.term_months
        else:
            standard_monthly_payment = (
                loan.principal * monthly_rate
            ) / (1 - (1 + monthly_rate) ** (-loan.term_months))
        standard_monthly_payment = round(standard_monthly_payment, 2)
    else:
        standard_monthly_payment = schedule_dicts[0]["payment_amount"] if schedule_dicts else 0.0

    new_schedule = apply_multiple_rate_changes(
        original_schedule=schedule_dicts,
        rate_changes=rate_changes_list,
        standard_monthly_payment=standard_monthly_payment,
    )

    original_total_payment = sum(item["payment_amount"] for item in original_schedule)
    original_total_interest = sum(item["interest_amount"] for item in original_schedule)
    original_total_periods = len(original_schedule)

    new_total_payment = sum(item["payment_amount"] for item in new_schedule)
    new_total_interest = sum(item["interest_amount"] for item in new_schedule)
    new_total_periods = len(new_schedule)

    diff_schedule = []
    max_len = max(len(original_schedule), len(new_schedule))

    sorted_changes = sorted(rate_changes_list, key=lambda x: x["change_period"])

    for i in range(max_len):
        orig = original_schedule[i] if i < len(original_schedule) else None
        new = new_schedule[i] if i < len(new_schedule) else None

        rate_change_index = None
        rate_changed = False
        original_rate = loan.annual_rate
        new_rate = loan.annual_rate

        if new:
            rate_change_index = new.get("rate_change_index")
            rate_changed = new.get("is_rate_changed", False)
            new_rate = new.get("annual_rate", loan.annual_rate)

        if orig:
            original_rate = orig.get("annual_rate", loan.annual_rate)

        if orig and new:
            diff_schedule.append({
                "period_number": new["period_number"],
                "due_date": new["due_date"],
                "original_rate": original_rate,
                "new_rate": new_rate,
                "rate_changed": rate_changed,
                "rate_change_index": rate_change_index,
                "original_payment": orig["payment_amount"],
                "new_payment": new["payment_amount"],
                "payment_diff": round(new["payment_amount"] - orig["payment_amount"], 2),
                "original_principal": orig["principal_amount"],
                "new_principal": new["principal_amount"],
                "original_interest": orig["interest_amount"],
                "new_interest": new["interest_amount"],
                "interest_diff": round(new["interest_amount"] - orig["interest_amount"], 2),
                "original_remaining": orig["remaining_principal"],
                "new_remaining": new["remaining_principal"],
            })
        elif new:
            diff_schedule.append({
                "period_number": new["period_number"],
                "due_date": new["due_date"],
                "original_rate": original_rate,
                "new_rate": new_rate,
                "rate_changed": rate_changed,
                "rate_change_index": rate_change_index,
                "original_payment": 0,
                "new_payment": new["payment_amount"],
                "payment_diff": new["payment_amount"],
                "original_principal": 0,
                "new_principal": new["principal_amount"],
                "original_interest": 0,
                "new_interest": new["interest_amount"],
                "interest_diff": new["interest_amount"],
                "original_remaining": 0,
                "new_remaining": new["remaining_principal"],
            })
        elif orig:
            diff_schedule.append({
                "period_number": orig["period_number"],
                "due_date": orig["due_date"],
                "original_rate": original_rate,
                "new_rate": original_rate,
                "rate_changed": False,
                "rate_change_index": None,
                "original_payment": orig["payment_amount"],
                "new_payment": 0,
                "payment_diff": round(-orig["payment_amount"], 2),
                "original_principal": orig["principal_amount"],
                "new_principal": 0,
                "original_interest": orig["interest_amount"],
                "new_interest": 0,
                "interest_diff": round(-orig["interest_amount"], 2),
                "original_remaining": orig["remaining_principal"],
                "new_remaining": 0,
            })

    last_remaining = new_schedule[-1]["remaining_principal"] if new_schedule else 0
    if last_remaining > 0.01:
        raise HTTPException(
            status_code=500,
            detail=f"计算错误：最后一期剩余本金 {last_remaining} 不为零，请检查参数",
        )

    rate_change_colors = RATE_CHANGE_COLORS[:len(sorted_changes)]

    return {
        "original_schedule": original_schedule,
        "new_schedule": new_schedule,
        "diff_schedule": diff_schedule,
        "original_total_payment": round(original_total_payment, 2),
        "new_total_payment": round(new_total_payment, 2),
        "original_total_interest": round(original_total_interest, 2),
        "new_total_interest": round(new_total_interest, 2),
        "total_payment_diff": round(new_total_payment - original_total_payment, 2),
        "total_interest_diff": round(new_total_interest - original_total_interest, 2),
        "original_total_periods": original_total_periods,
        "new_total_periods": new_total_periods,
        "rate_change_colors": rate_change_colors,
    }
