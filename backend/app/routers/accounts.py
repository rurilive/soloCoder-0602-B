from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List, Optional

from app.database import get_db
from app.models import Account, Transaction, Transfer, RecurringRule, Ledger
from app.schemas import AccountCreate, AccountUpdate, AccountOut, AccountWithBalance
from app.exchange_rate import convert_amount

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def _compute_balance(db: Session, account: Account) -> float:
    income_total = db.query(sql_func.coalesce(sql_func.sum(Transaction.amount), 0)).filter(
        Transaction.account_id == account.id,
        Transaction.type == "income",
    ).scalar() or 0

    expense_total = db.query(sql_func.coalesce(sql_func.sum(Transaction.amount), 0)).filter(
        Transaction.account_id == account.id,
        Transaction.type == "expense",
    ).scalar() or 0

    transfer_in_total = db.query(sql_func.coalesce(sql_func.sum(Transfer.amount), 0)).filter(
        Transfer.to_account_id == account.id,
    ).scalar() or 0

    transfer_out_total = db.query(sql_func.coalesce(sql_func.sum(Transfer.amount), 0)).filter(
        Transfer.from_account_id == account.id,
    ).scalar() or 0

    return account.initial_balance + income_total - expense_total + transfer_in_total - transfer_out_total


def _account_with_balance(db: Session, account: Account, base_currency: str | None = None) -> dict:
    balance = _compute_balance(db, account)
    converted_balance = None
    if base_currency and account.currency != base_currency:
        try:
            conv, _, _, _ = convert_amount(db, balance, account.currency, base_currency)
            converted_balance = conv
        except ValueError:
            converted_balance = None
    elif base_currency and account.currency == base_currency:
        converted_balance = balance

    return {
        "id": account.id,
        "name": account.name,
        "type": account.type,
        "icon": account.icon,
        "initial_balance": account.initial_balance,
        "is_default": account.is_default,
        "currency": account.currency,
        "ledger_id": account.ledger_id,
        "balance": round(balance, 2),
        "converted_balance": round(converted_balance, 2) if converted_balance is not None else None,
        "created_at": account.created_at,
    }


def _get_base_currency(db: Session, ledger_id: int) -> str | None:
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    return ledger.base_currency if ledger else None


@router.get("/", response_model=List[AccountWithBalance])
def list_accounts(
    ledger_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Account)
    if ledger_id is not None:
        query = query.filter(Account.ledger_id == ledger_id)
    accounts = query.order_by(Account.id.desc()).all()
    base_currency = _get_base_currency(db, ledger_id) if ledger_id else None
    return [_account_with_balance(db, a, base_currency) for a in accounts]


@router.get("/{account_id}", response_model=AccountWithBalance)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    base_currency = _get_base_currency(db, account.ledger_id)
    return _account_with_balance(db, account, base_currency)


@router.get("/{account_id}/balance")
def get_account_balance(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    result = {"account_id": account.id, "balance": round(_compute_balance(db, account), 2), "currency": account.currency}
    base_currency = _get_base_currency(db, account.ledger_id)
    if base_currency and account.currency != base_currency:
        try:
            conv, _, _, _ = convert_amount(db, result["balance"], account.currency, base_currency)
            result["converted_balance"] = round(conv, 2)
            result["base_currency"] = base_currency
        except ValueError:
            result["converted_balance"] = None
            result["base_currency"] = base_currency
    return result


@router.post("/", response_model=AccountWithBalance)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    if data.is_default:
        existing_default = db.query(Account).filter(
            Account.ledger_id == data.ledger_id,
            Account.is_default == True,
        ).first()
        if existing_default:
            existing_default.is_default = False
    account = Account(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    base_currency = _get_base_currency(db, account.ledger_id)
    return _account_with_balance(db, account, base_currency)


@router.put("/{account_id}", response_model=AccountWithBalance)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    update_dict = data.model_dump(exclude_unset=True)
    if update_dict.get("is_default") is True:
        existing_default = db.query(Account).filter(
            Account.ledger_id == account.ledger_id,
            Account.is_default == True,
            Account.id != account_id,
        ).first()
        if existing_default:
            existing_default.is_default = False
    for key, value in update_dict.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    base_currency = _get_base_currency(db, account.ledger_id)
    return _account_with_balance(db, account, base_currency)


@router.delete("/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")

    tx_count = db.query(Transaction).filter(Transaction.account_id == account_id).count()
    transfer_out_count = db.query(Transfer).filter(Transfer.from_account_id == account_id).count()
    transfer_in_count = db.query(Transfer).filter(Transfer.to_account_id == account_id).count()
    rule_count = db.query(RecurringRule).filter(RecurringRule.account_id == account_id).count()
    total_related = tx_count + transfer_out_count + transfer_in_count + rule_count

    if total_related > 0:
        raise HTTPException(
            status_code=400,
            detail=f"无法删除：该账户关联了 {tx_count} 笔交易、{transfer_out_count + transfer_in_count} 笔转账和 {rule_count} 条周期记账规则，请先处理关联数据后再删除",
        )

    db.delete(account)
    db.commit()
    return {"message": "删除成功"}
