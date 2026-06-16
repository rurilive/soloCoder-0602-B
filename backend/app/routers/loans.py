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
    LoanRemainingPrincipalPoint,
)
from app.utils.amortization import (
    calculate_amortization_schedule,
    recalculate_schedule_after_early_repayment,
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


@router.post("/early-repayment", response_model=LoanWithSchedule)
def early_repayment(data: EarlyRepaymentRequest, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == data.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    if loan.status != "active":
        raise HTTPException(status_code=400, detail="贷款状态不是活跃状态")

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
        repayment_type=data.repayment_type,
    )

    for s in schedules:
        db.delete(s)

    for item in new_schedule:
        orig = schedules[item["period_number"] - 1] if item["period_number"] <= len(schedules) else None
        schedule_item = LoanRepaymentSchedule(
            loan_id=loan.id,
            period_number=item["period_number"],
            due_date=item["due_date"],
            payment_amount=item["payment_amount"],
            principal_amount=item["principal_amount"],
            interest_amount=item["interest_amount"],
            remaining_principal=item["remaining_principal"],
            status=orig.status if orig and orig.status == "paid" else item.get("status", "pending"),
            transaction_id=orig.transaction_id if orig else None,
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

    total_amount = schedule.payment_amount + schedule.early_repayment_amount
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
