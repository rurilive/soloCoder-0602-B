from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app.database import get_db
from app.models import Tag, Transaction, transaction_tags
from app.schemas import TagCreate, TagUpdate, TagOut

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("/", response_model=List[TagOut])
def list_tags(
    ledger_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Tag)
    if ledger_id is not None:
        query = query.filter(Tag.ledger_id == ledger_id)
    return query.order_by(Tag.name).all()


@router.get("/{tag_id}", response_model=TagOut)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    return tag


@router.post("/", response_model=TagOut)
def create_tag(data: TagCreate, db: Session = Depends(get_db)):
    existing = db.query(Tag).filter(
        Tag.ledger_id == data.ledger_id,
        Tag.name == data.name,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该账本下已存在同名标签")
    tag = Tag(**data.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, data: TagUpdate, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    update_dict = data.model_dump(exclude_unset=True)
    if "name" in update_dict:
        existing = db.query(Tag).filter(
            Tag.ledger_id == tag.ledger_id,
            Tag.name == update_dict["name"],
            Tag.id != tag_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="该账本下已存在同名标签")
    for key, value in update_dict.items():
        setattr(tag, key, value)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    db.execute(
        transaction_tags.delete().where(transaction_tags.c.tag_id == tag_id)
    )
    db.delete(tag)
    db.commit()
    return {"message": "删除成功"}


@router.get("/{tag_id}/transactions/count")
def get_tag_transaction_count(tag_id: int, db: Session = Depends(get_db)):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")
    count = db.query(func.count(transaction_tags.c.transaction_id)).filter(
        transaction_tags.c.tag_id == tag_id
    ).scalar() or 0
    return {"tag_id": tag_id, "transaction_count": count}
