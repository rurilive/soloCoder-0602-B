from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List, Optional

from app.database import get_db
from app.models import Account, Transaction, Transfer
from app.schemas import AccountCreate, AccountUpdate, AccountOut, AccountWithBalance

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


def _account_with_balance(db: Session, account: Account) -> dict:
    balance = _compute_balance(db, account)
    return {
        "id": account.id,
        "name": account.name,
        "type": account.type,
        "icon": account.icon,
        "initial_balance": account.initial_balance,
        "is_default": account.is_default,
        "ledger_id": account.ledger_id,
        "balance": round(balance, 2),
        "created_at": account.created_at,
    }


@router.get("/", response_model=List[AccountWithBalance])
def list_accounts(
    ledger_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Account)
    if ledger_id is not None:
        query = query.filter(Account.ledger_id == ledger_id)
    accounts = query.order_by(Account.id.desc()).all()
    return [_account_with_balance(db, a) for a in accounts]


@router.get("/{account_id}", response_model=AccountWithBalance)
def get_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    return _account_with_balance(db, account)


@router.get("/{account_id}/balance")
def get_account_balance(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")
    return {"account_id": account.id, "balance": round(_compute_balance(db, account), 2)}


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
    return _account_with_balance(db, account)


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
    return _account_with_balance(db, account)


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    force: bool = Query(False, description="强制删除，将关联交易的account_id置空并删除关联转账"),
    db: Session = Depends(get_db),
):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="账户不存在")

    tx_count = db.query(Transaction).filter(Transaction.account_id == account_id).count()
    transfer_out_count = db.query(Transfer).filter(Transfer.from_account_id == account_id).count()
    transfer_in_count = db.query(Transfer).filter(Transfer.to_account_id == account_id).count()

    if (tx_count + transfer_out_count + transfer_in_count) > 0 and not force:
        return {
            "can_delete": False,
            "message": f"该账户关联了 {tx_count} 笔交易、{transfer_out_count + transfer_in_count} 笔转账，请确认是否强制删除",
            "transaction_count": tx_count,
            "transfer_count": transfer_out_count + transfer_in_count,
        }

    db.query(Transaction).filter(Transaction.account_id == account_id).update(
        {"account_id": None}, synchronize_session="fetch"
    )
    db.query(Transfer).filter(
        (Transfer.from_account_id == account_id) | (Transfer.to_account_id == account_id)
    ).delete(synchronize_session="fetch")

    db.delete(account)
    db.commit()
    return {"message": "删除成功", "can_delete": True}
