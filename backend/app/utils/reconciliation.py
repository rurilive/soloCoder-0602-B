import csv
import io
import re
import chardet
from difflib import SequenceMatcher
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
from app.models import Transaction


AMOUNT_KEYWORDS = ["金额", "交易金额", "amount", "money", "交易金額"]
DATE_KEYWORDS = ["日期", "交易日期", "date", "时间", "交易日", "交易時間"]
DESC_KEYWORDS = ["摘要", "描述", "备注", "交易类型", "description", "remark", "附言", "備註", "交易摘要"]
TYPE_KEYWORDS = ["收入/支出", "借贷标志", "收支", "type", "借/贷", "借贷"]
INCOME_KEYWORDS = ["收入", "贷", "credit", "转入", "入账"]
EXPENSE_KEYWORDS = ["支出", "借", "debit", "转出", "出账"]


def detect_encoding(raw_bytes: bytes) -> str:
    result = chardet.detect(raw_bytes)
    encoding = result.get("encoding", "utf-8")
    if encoding and encoding.lower() in ["gb2312", "gbk", "gb18030"]:
        return "gbk"
    return "utf-8"


def detect_delimiter(line: str) -> str:
    candidates = [",", ";", "\t", "|"]
    counts = {c: line.count(c) for c in candidates}
    return max(counts, key=counts.get) if max(counts.values()) > 0 else ","


def _find_best_field(headers: List[str], keywords: List[str]) -> Optional[str]:
    for header in headers:
        h = header.lower().strip()
        for kw in keywords:
            if kw.lower() in h:
                return header
    return None


def map_fields(headers: List[str]) -> Dict[str, Optional[str]]:
    return {
        "amount": _find_best_field(headers, AMOUNT_KEYWORDS),
        "date": _find_best_field(headers, DATE_KEYWORDS),
        "description": _find_best_field(headers, DESC_KEYWORDS),
        "type": _find_best_field(headers, TYPE_KEYWORDS),
    }


def _parse_date(date_str: str) -> Optional[str]:
    if not date_str:
        return None
    s = str(date_str).strip()
    formats = [
        "%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d",
        "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})", s)
    if m:
        try:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        except ValueError:
            pass
    return None


def _parse_amount(amount_str: str) -> Optional[float]:
    if amount_str is None or amount_str == "":
        return None
    s = str(amount_str).strip()
    s = s.replace(",", "").replace("¥", "").replace("￥", "").replace("$", "")
    try:
        return float(s)
    except ValueError:
        return None


def _determine_type(row: Dict, type_field: Optional[str], amount: float) -> str:
    if type_field and type_field in row:
        t = str(row[type_field]).strip().lower()
        for kw in INCOME_KEYWORDS:
            if kw.lower() in t:
                return "income"
        for kw in EXPENSE_KEYWORDS:
            if kw.lower() in t:
                return "expense"
    if amount >= 0:
        return "income"
    return "expense"


def parse_csv(raw_bytes: bytes) -> Tuple[List[Dict], str, str]:
    encoding = detect_encoding(raw_bytes)
    try:
        content = raw_bytes.decode(encoding)
    except UnicodeDecodeError:
        encoding = "utf-8"
        content = raw_bytes.decode(encoding, errors="ignore")

    lines = content.splitlines()
    lines = [l for l in lines if l.strip()]
    if not lines:
        return [], encoding, ","

    delimiter = detect_delimiter(lines[0])
    reader = csv.DictReader(lines, delimiter=delimiter)
    headers = reader.fieldnames or []
    field_map = map_fields(headers)

    records = []
    for idx, row in enumerate(reader):
        amount = _parse_amount(row.get(field_map["amount"], "")) if field_map["amount"] else None
        if amount is None:
            continue
        date = _parse_date(row.get(field_map["date"], "")) if field_map["date"] else None
        description = str(row.get(field_map["description"], "")).strip() if field_map["description"] else ""
        tx_type = _determine_type(row, field_map["type"], amount)

        if tx_type == "expense" and amount > 0:
            amount = -amount

        records.append({
            "row_index": idx,
            "date": date,
            "amount": abs(amount),
            "type": tx_type,
            "description": description,
            "raw_data": row,
        })

    return records, encoding, delimiter


def _date_diff_days(d1: str, d2: str) -> Optional[int]:
    try:
        dt1 = datetime.strptime(d1, "%Y-%m-%d")
        dt2 = datetime.strptime(d2, "%Y-%m-%d")
        return abs((dt1 - dt2).days)
    except (ValueError, TypeError):
        return None


def _levenshtein_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def calculate_match_score(bank_record: Dict, system_tx: Transaction) -> float:
    score = 0.0

    if abs(bank_record["amount"] - system_tx.amount) < 0.001:
        score += 0.5

    if bank_record["date"] and system_tx.date:
        diff = _date_diff_days(bank_record["date"], system_tx.date)
        if diff is not None and diff <= 3:
            score += 0.3

    desc_sim = _levenshtein_similarity(bank_record["description"] or "", system_tx.description or "")
    if desc_sim > 0.5:
        score += 0.2

    return round(score, 4)


def match_records(bank_records: List[Dict], system_transactions: List[Transaction]) -> Dict:
    used_tx_ids = set()
    used_bank_indices = set()
    matched_pairs = []

    candidates = []
    for b_idx, bank_rec in enumerate(bank_records):
        for tx in system_transactions:
            if tx.id in used_tx_ids:
                continue
            if bank_rec["type"] != tx.type:
                continue
            s = calculate_match_score(bank_rec, tx)
            if s > 0.7:
                candidates.append((s, b_idx, tx.id, bank_rec, tx))

    candidates.sort(key=lambda x: x[0], reverse=True)

    for score, b_idx, tx_id, bank_rec, tx in candidates:
        if tx_id in used_tx_ids or b_idx in used_bank_indices:
            continue
        matched_pairs.append({
            "bank_record": bank_rec,
            "system_transaction": {
                "id": tx.id,
                "amount": tx.amount,
                "date": tx.date,
                "type": tx.type,
                "description": tx.description,
                "category_id": tx.category_id,
                "account_id": tx.account_id,
            },
            "score": score,
            "amount_diff": abs(bank_rec["amount"] - tx.amount) >= 0.001,
            "date_diff": _date_diff_days(bank_rec["date"] or "", tx.date or ""),
        })
        used_tx_ids.add(tx_id)
        used_bank_indices.add(b_idx)

    unmatched_bank = [r for i, r in enumerate(bank_records) if i not in used_bank_indices]
    unmatched_system = [
        {
            "id": tx.id,
            "amount": tx.amount,
            "date": tx.date,
            "type": tx.type,
            "description": tx.description,
            "category_id": tx.category_id,
            "account_id": tx.account_id,
        }
        for tx in system_transactions if tx.id not in used_tx_ids
    ]

    return {
        "matched_pairs": matched_pairs,
        "unmatched_bank": unmatched_bank,
        "unmatched_system": unmatched_system,
    }
