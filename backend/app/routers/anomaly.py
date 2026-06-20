from datetime import date, timedelta
from collections import defaultdict
import statistics as stats_mod

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Transaction, Category, Account
from app.schemas import AnomalyDetectionResponse, AnomalyTransactionItem

router = APIRouter(prefix="/api/anomaly", tags=["anomaly"])


def _add_months(year: int, month: int, delta: int):
    total = year * 12 + (month - 1) + delta
    y, m = divmod(total, 12)
    return y, m + 1


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


def _detect_amount_iqr(transactions):
    if len(transactions) < 4:
        return {}
    amounts = sorted([abs(float(t.amount)) for t in transactions])
    n = len(amounts)
    q1_idx = n // 4
    q3_idx = (3 * n) // 4
    q1 = amounts[q1_idx]
    q3 = amounts[q3_idx]
    iqr = q3 - q1
    if iqr == 0:
        return {}
    lower = q1 - 1.5 * iqr
    upper = q3 + 1.5 * iqr
    scores = {}
    for t in transactions:
        amt = abs(float(t.amount))
        if amt < lower:
            dist = (lower - amt) / iqr
            scores[t.id] = min(round(dist, 2), 10.0)
        elif amt > upper:
            dist = (amt - upper) / iqr
            scores[t.id] = min(round(dist, 2), 10.0)
    return scores


def _detect_frequency_zscore(transactions):
    if len(transactions) < 4:
        return {}
    daily_counts = defaultdict(int)
    for t in transactions:
        daily_counts[t.date] += 1
    counts = list(daily_counts.values())
    if len(counts) < 2:
        return {}
    mean_count = stats_mod.mean(counts)
    std_count = stats_mod.stdev(counts)
    if std_count == 0:
        return {}
    daily_zscore = {}
    for d, c in daily_counts.items():
        z = (c - mean_count) / std_count
        if z > 2.0:
            daily_zscore[d] = round(z, 2)
    scores = {}
    for t in transactions:
        if t.date in daily_zscore:
            scores[t.id] = daily_zscore[t.date]
    return scores


def _detect_time_anomaly(transactions):
    if len(transactions) < 4:
        return {}
    sorted_txs = sorted(transactions, key=lambda t: t.date)
    dow_counts = defaultdict(int)
    for t in sorted_txs:
        try:
            dt = date.fromisoformat(t.date)
            dow_counts[dt.weekday()] += 1
        except (ValueError, TypeError):
            pass
    if not dow_counts:
        return {}
    dow_values = list(dow_counts.values())
    mean_dow = stats_mod.mean(dow_values)
    std_dow = stats_mod.stdev(dow_values) if len(dow_values) >= 2 else 0
    unusual_dows = set()
    if std_dow > 0:
        for dow, cnt in dow_counts.items():
            z = (cnt - mean_dow) / std_dow
            if z > 1.0:
                unusual_dows.add(dow)
    weekend_dows = {5, 6}
    intervals = []
    for i in range(1, len(sorted_txs)):
        try:
            d1 = date.fromisoformat(sorted_txs[i - 1].date)
            d2 = date.fromisoformat(sorted_txs[i].date)
            gap = (d2 - d1).days
            if gap > 0:
                intervals.append(gap)
        except (ValueError, TypeError):
            pass
    short_interval_threshold = None
    mean_interval = 0
    std_interval = 0
    if len(intervals) >= 2:
        mean_interval = stats_mod.mean(intervals)
        std_interval = stats_mod.stdev(intervals)
        if std_interval > 0:
            short_interval_threshold = max(0, mean_interval - 1.0 * std_interval)
    scores = {}
    for t in sorted_txs:
        score = 0.0
        try:
            dt = date.fromisoformat(t.date)
            if dt.weekday() in unusual_dows and std_dow > 0:
                z = (dow_counts[dt.weekday()] - mean_dow) / std_dow
                score += min(z, 5.0)
            if dt.weekday() in weekend_dows and abs(float(t.amount)) > 1000:
                score += 2.0
        except (ValueError, TypeError):
            pass
        if short_interval_threshold is not None:
            idx = next((i for i, s in enumerate(sorted_txs) if s.id == t.id), None)
            if idx is not None and idx > 0:
                try:
                    prev = date.fromisoformat(sorted_txs[idx - 1].date)
                    curr = date.fromisoformat(t.date)
                    gap = (curr - prev).days
                    if 0 < gap < short_interval_threshold:
                        z = (mean_interval - gap) / std_interval if std_interval > 0 else 1.0
                        score += min(z, 5.0)
                except (ValueError, TypeError):
                    pass
        if score > 0:
            scores[t.id] = round(score, 2)
    return scores


@router.get("/detect", response_model=AnomalyDetectionResponse)
def detect_anomalies(
    ledger_id: int = Query(...),
    db: Session = Depends(get_db),
):
    today = date.today()
    three_months_ago = today - timedelta(days=90)
    start_date = three_months_ago.strftime("%Y-%m-%d")

    tx_rows = (
        db.query(
            Transaction.id,
            Transaction.amount,
            Transaction.type,
            Transaction.description,
            Transaction.date,
            Transaction.category_id,
        )
        .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start_date)
        .order_by(Transaction.date)
        .all()
    )

    if not tx_rows:
        return AnomalyDetectionResponse(
            ledger_id=ledger_id,
            total_transactions=0,
            anomaly_count=0,
            amount_anomaly_count=0,
            frequency_anomaly_count=0,
            time_anomaly_count=0,
            anomalies=[],
        )

    class _Tx:
        pass

    transactions = []
    for r in tx_rows:
        t = _Tx()
        t.id = r.id
        t.amount = r.amount
        t.type = r.type
        t.description = r.description
        t.date = r.date
        t.category_id = r.category_id
        transactions.append(t)

    amount_scores = _detect_amount_iqr(transactions)
    frequency_scores = _detect_frequency_zscore(transactions)
    time_scores = _detect_time_anomaly(transactions)

    all_anomaly_ids = set(amount_scores.keys()) | set(frequency_scores.keys()) | set(time_scores.keys())

    category_ids = list(set(t.category_id for t in transactions))
    categories = db.query(Category).filter(Category.id.in_(category_ids)).all() if category_ids else []
    category_map = {c.id: c.name for c in categories}

    anomalies = []
    for t in transactions:
        if t.id not in all_anomaly_ids:
            continue
        anomaly_types = []
        a_score = amount_scores.get(t.id, 0.0)
        f_score = frequency_scores.get(t.id, 0.0)
        t_score = time_scores.get(t.id, 0.0)
        if a_score > 0:
            anomaly_types.append("amount")
        if f_score > 0:
            anomaly_types.append("frequency")
        if t_score > 0:
            anomaly_types.append("time")
        total = round(a_score + f_score + t_score, 2)
        anomalies.append(AnomalyTransactionItem(
            transaction_id=t.id,
            date=t.date,
            description=t.description or "",
            amount=float(t.amount),
            type=t.type,
            category_name=category_map.get(t.category_id, "未知"),
            anomaly_types=anomaly_types,
            amount_score=a_score,
            frequency_score=f_score,
            time_score=t_score,
            total_score=total,
        ))

    anomalies.sort(key=lambda x: x.total_score, reverse=True)

    amount_count = sum(1 for a in anomalies if "amount" in a.anomaly_types)
    freq_count = sum(1 for a in anomalies if "frequency" in a.anomaly_types)
    time_count = sum(1 for a in anomalies if "time" in a.anomaly_types)

    return AnomalyDetectionResponse(
        ledger_id=ledger_id,
        total_transactions=len(transactions),
        anomaly_count=len(anomalies),
        amount_anomaly_count=amount_count,
        frequency_anomaly_count=freq_count,
        time_anomaly_count=time_count,
        anomalies=anomalies,
    )
