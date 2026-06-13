from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Ledger
from app.schemas import LedgerCreate, LedgerUpdate, LedgerOut

router = APIRouter(prefix="/api/ledgers", tags=["ledgers"])


@router.get("/", response_model=List[LedgerOut])
def list_ledgers(db: Session = Depends(get_db)):
    return db.query(Ledger).order_by(Ledger.id.desc()).all()


@router.get("/{ledger_id}", response_model=LedgerOut)
def get_ledger(ledger_id: int, db: Session = Depends(get_db)):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")
    return ledger


@router.post("/", response_model=LedgerOut)
def create_ledger(data: LedgerCreate, db: Session = Depends(get_db)):
    ledger = Ledger(**data.model_dump())
    db.add(ledger)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.put("/{ledger_id}", response_model=LedgerOut)
def update_ledger(ledger_id: int, data: LedgerUpdate, db: Session = Depends(get_db)):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(ledger, key, value)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.delete("/{ledger_id}")
def delete_ledger(ledger_id: int, db: Session = Depends(get_db)):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=404, detail="账本不存在")
    db.delete(ledger)
    db.commit()
    return {"message": "删除成功"}
