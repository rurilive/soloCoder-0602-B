from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Transaction, Ledger, Account, Category
from app.schemas import (
    ReconciliationUploadResponse,
    ReconciliationImportRequest,
    ReconciliationImportResult,
    TransactionCreate,
)
from app.utils.reconciliation import parse_csv, match_records

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])


def _validate_ledger(db, ledger_id):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        raise HTTPException(status_code=400, detail="账本不存在")
    return ledger


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


@router.post("/upload", response_model=ReconciliationUploadResponse)
async def upload_bank_statement(
    file: UploadFile = File(...),
    ledger_id: int = Form(...),
    db: Session = Depends(get_db),
):
    _validate_ledger(db, ledger_id)

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        bank_records, encoding, delimiter = parse_csv(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV解析失败: {str(e)}")

    if not bank_records:
        raise HTTPException(status_code=400, detail="未解析到有效记录，请检查CSV格式")

    system_transactions = (
        db.query(Transaction)
        .filter(Transaction.ledger_id == ledger_id)
        .all()
    )

    result = match_records(bank_records, system_transactions)

    return {
        "encoding": encoding,
        "delimiter": delimiter,
        "total_bank_records": len(bank_records),
        "total_system_transactions": len(system_transactions),
        "matched_count": len(result["matched_pairs"]),
        "unmatched_bank_count": len(result["unmatched_bank"]),
        "unmatched_system_count": len(result["unmatched_system"]),
        "bank_records": bank_records,
        "matched_pairs": result["matched_pairs"],
        "unmatched_bank": result["unmatched_bank"],
        "unmatched_system": result["unmatched_system"],
    }


@router.post("/import", response_model=ReconciliationImportResult)
def import_unmatched_records(
    data: ReconciliationImportRequest,
    db: Session = Depends(get_db),
):
    _validate_ledger(db, data.ledger_id)
    _validate_account(db, data.account_id, data.ledger_id)

    has_expense = any(r.type == "expense" for r in data.records)
    has_income = any(r.type == "income" for r in data.records)

    if has_expense:
        if data.expense_category_id is None:
            raise HTTPException(status_code=400, detail="包含支出记录，请提供支出分类")
        _validate_category(db, data.expense_category_id, data.ledger_id, "expense")
    if has_income:
        if data.income_category_id is None:
            raise HTTPException(status_code=400, detail="包含收入记录，请提供收入分类")
        _validate_category(db, data.income_category_id, data.ledger_id, "income")

    imported = []

    try:
        for rec in data.records:
            if rec.type == "income":
                category_id = data.income_category_id
            elif rec.type == "expense":
                category_id = data.expense_category_id
            else:
                raise HTTPException(status_code=400, detail=f"无效的交易类型: {rec.type}")

            tx_data = TransactionCreate(
                amount=rec.amount,
                type=rec.type,
                description=rec.description,
                category_id=category_id,
                ledger_id=data.ledger_id,
                account_id=data.account_id,
                date=rec.date,
            )
            tx = Transaction(**tx_data.model_dump())
            db.add(tx)
            db.flush()
            db.refresh(tx)
            imported.append(tx)

        db.commit()
        for tx in imported:
            db.refresh(tx)

    except Exception as e:
        db.rollback()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"导入失败，已全部回滚: {str(e)}")

    return {
        "imported_count": len(imported),
        "skipped_count": 0,
        "transactions": imported,
    }
