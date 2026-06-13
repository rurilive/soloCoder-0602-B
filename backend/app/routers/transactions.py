from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import Transaction
from app.schemas import TransactionCreate, TransactionUpdate, TransactionOut

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("/", response_model=List[TransactionOut])
def list_transactions(
    ledger_id: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction)
    if ledger_id is not None:
        query = query.filter(Transaction.ledger_id == ledger_id)
    if month is not None:
        query = query.filter(Transaction.date.like(f"{month}%"))
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    return query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")
    return tx


@router.post("/", response_model=TransactionOut)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    tx = Transaction(**data.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int, data: TransactionUpdate, db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tx, key, value)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(tx)
    db.commit()
    return {"message": "删除成功"}
