from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
import re
import uuid
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Transaction, Ledger, Account, Category
from app.schemas import (
    ReconciliationUploadResponse,
    ReconciliationImportRequest,
    ReconciliationImportResult,
    TransactionCreate,
    MatchActionRequest,
    MatchActionResponse,
)
from app.utils.reconciliation import (
    parse_csv,
    match_records,
    count_confirmed_matches,
    confirm_match,
    reject_match,
)

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])

DATE_FORMAT = "%Y-%m-%d"
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_session_store: Dict[str, Dict[str, Any]] = {}

_SESSION_TTL = timedelta(minutes=30)


def _cleanup_expired_sessions():
    now = datetime.now()
    expired = [
        sid for sid, sess in _session_store.items()
        if now - sess.get("created_at", now) > _SESSION_TTL
    ]
    for sid in expired:
        del _session_store[sid]


def _validate_date(value: str, field_name: str):
    if not DATE_PATTERN.match(value):
        raise HTTPException(
            status_code=400,
            detail=f"{field_name}格式错误，应为YYYY-MM-DD",
        )
    try:
        datetime.strptime(value, DATE_FORMAT)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name}不是有效的日期",
        )


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
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    _validate_ledger(db, ledger_id)

    if start_date:
        _validate_date(start_date, "start_date")
    if end_date:
        _validate_date(end_date, "end_date")

    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        bank_records, encoding, delimiter = parse_csv(raw_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV解析失败: {str(e)}")

    if not bank_records:
        raise HTTPException(status_code=400, detail="未解析到有效记录，请检查CSV格式")

    query = db.query(Transaction).filter(Transaction.ledger_id == ledger_id)
    if start_date:
        query = query.filter(Transaction.date >= start_date)
    if end_date:
        query = query.filter(Transaction.date <= end_date)
    system_transactions = query.all()

    result = match_records(bank_records, system_transactions)

    _cleanup_expired_sessions()
    session_id = str(uuid.uuid4())
    _session_store[session_id] = {
        "matched_pairs": result["matched_pairs"],
        "unmatched_bank": result["unmatched_bank"],
        "unmatched_system": result["unmatched_system"],
        "created_at": datetime.now(),
    }

    confirmed_count = count_confirmed_matches(result["matched_pairs"])
    return {
        "session_id": session_id,
        "encoding": encoding,
        "delimiter": delimiter,
        "total_bank_records": len(bank_records),
        "total_system_transactions": len(system_transactions),
        "matched_count": confirmed_count,
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


@router.post("/confirm", response_model=MatchActionResponse)
def confirm_low_match(data: MatchActionRequest):
    _cleanup_expired_sessions()
    session = _session_store.get(data.session_id)
    if not session:
        return {
            "success": False,
            "matched_count": 0,
            "matched_pairs": [],
            "unmatched_bank": [],
            "unmatched_system": [],
            "error": "会话不存在或已过期，请重新上传",
        }

    matched_pairs = session["matched_pairs"]
    unmatched_bank = session["unmatched_bank"]
    unmatched_system = session["unmatched_system"]

    result = confirm_match(
        matched_pairs,
        unmatched_bank,
        unmatched_system,
        data.bank_row_index,
    )

    if not result["success"]:
        return {
            "success": False,
            "matched_count": count_confirmed_matches(matched_pairs),
            "matched_pairs": matched_pairs,
            "unmatched_bank": unmatched_bank,
            "unmatched_system": unmatched_system,
            "error": result.get("error"),
        }

    session["matched_pairs"] = result["matched_pairs"]
    session["unmatched_bank"] = result["unmatched_bank"]
    session["unmatched_system"] = result["unmatched_system"]

    return {
        "success": True,
        "matched_count": count_confirmed_matches(result["matched_pairs"]),
        "matched_pairs": result["matched_pairs"],
        "unmatched_bank": result["unmatched_bank"],
        "unmatched_system": result["unmatched_system"],
    }


@router.post("/reject", response_model=MatchActionResponse)
def reject_low_match(data: MatchActionRequest):
    _cleanup_expired_sessions()
    session = _session_store.get(data.session_id)
    if not session:
        return {
            "success": False,
            "matched_count": 0,
            "matched_pairs": [],
            "unmatched_bank": [],
            "unmatched_system": [],
            "error": "会话不存在或已过期，请重新上传",
        }

    matched_pairs = session["matched_pairs"]
    unmatched_bank = session["unmatched_bank"]
    unmatched_system = session["unmatched_system"]

    result = reject_match(
        matched_pairs,
        unmatched_bank,
        unmatched_system,
        data.bank_row_index,
    )

    if not result["success"]:
        return {
            "success": False,
            "matched_count": count_confirmed_matches(matched_pairs),
            "matched_pairs": matched_pairs,
            "unmatched_bank": unmatched_bank,
            "unmatched_system": unmatched_system,
            "error": result.get("error"),
        }

    session["matched_pairs"] = result["matched_pairs"]
    session["unmatched_bank"] = result["unmatched_bank"]
    session["unmatched_system"] = result["unmatched_system"]

    return {
        "success": True,
        "matched_count": count_confirmed_matches(result["matched_pairs"]),
        "matched_pairs": result["matched_pairs"],
        "unmatched_bank": result["unmatched_bank"],
        "unmatched_system": result["unmatched_system"],
    }
