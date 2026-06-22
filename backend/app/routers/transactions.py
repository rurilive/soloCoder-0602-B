from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional

from app.database import get_db
from app.models import Transaction, Category, Account, Tag, transaction_tags
from app.schemas import TransactionCreate, TransactionUpdate, TransactionOut

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


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


def _validate_account(db, account_id, ledger_id):
    if account_id is None:
        raise HTTPException(status_code=400, detail="账户不能为空")
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(status_code=400, detail="账户不存在")
    if account.ledger_id != ledger_id:
        raise HTTPException(status_code=400, detail="该账户不属于当前账本")
    return account


def _validate_tags(db, tag_ids, ledger_id):
    if not tag_ids:
        return []
    tags = db.query(Tag).filter(
        Tag.id.in_(tag_ids),
        Tag.ledger_id == ledger_id,
    ).all()
    if len(tags) != len(tag_ids):
        found_ids = {t.id for t in tags}
        missing = [tid for tid in tag_ids if tid not in found_ids]
        raise HTTPException(status_code=400, detail=f"标签不存在或不属于当前账本: {missing}")
    return tags


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


@router.get("/", response_model=List[TransactionOut])
def list_transactions(
    ledger_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None, ge=1970, le=9999),
    month: Optional[int] = Query(None, ge=1, le=12),
    category_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    tag_ids: Optional[str] = Query(None, description="逗号分隔的标签ID列表，匹配任一标签即可"),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction)
    if ledger_id is not None:
        query = query.filter(Transaction.ledger_id == ledger_id)
    if year is not None and month is not None:
        start, end = _month_range(year, month)
        query = query.filter(Transaction.date >= start, Transaction.date < end)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    if tag_ids:
        tag_id_list = [int(tid.strip()) for tid in tag_ids.split(",") if tid.strip()]
        if tag_id_list:
            query = query.join(
                transaction_tags,
                and_(
                    transaction_tags.c.transaction_id == Transaction.id,
                    transaction_tags.c.tag_id.in_(tag_id_list),
                ),
                isouter=False,
            ).distinct()
    return query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")
    return tx


@router.post("/", response_model=TransactionOut)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    _validate_category(db, data.category_id, data.ledger_id, data.type)
    _validate_account(db, data.account_id, data.ledger_id)
    tags = _validate_tags(db, data.tag_ids, data.ledger_id)
    tx_data = data.model_dump(exclude={"tag_ids"})
    tx = Transaction(**tx_data)
    if tags:
        tx.tags = tags
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
    update_dict = data.model_dump(exclude_unset=True)
    final_type = update_dict.get("type", tx.type)
    final_ledger = update_dict.get("ledger_id", tx.ledger_id)
    final_category = update_dict.get("category_id", tx.category_id)
    if "category_id" in update_dict or "type" in update_dict or "ledger_id" in update_dict:
        _validate_category(db, final_category, final_ledger, final_type)
    if "account_id" in update_dict:
        _validate_account(db, update_dict["account_id"], final_ledger)
    if "tag_ids" in update_dict:
        new_tag_ids = update_dict.pop("tag_ids")
        if new_tag_ids is not None:
            tags = _validate_tags(db, new_tag_ids, final_ledger)
            tx.tags = tags
    for key, value in update_dict.items():
        setattr(tx, key, value)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.execute(
        transaction_tags.delete().where(transaction_tags.c.transaction_id == transaction_id)
    )
    db.delete(tx)
    db.commit()
    return {"message": "删除成功"}
