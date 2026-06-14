import json
import logging
import urllib.request
import urllib.error
import ssl
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import ExchangeRate

logger = logging.getLogger(__name__)

SUPPORTED_CURRENCIES = {
    "CNY": {"name": "人民币", "symbol": "¥"},
    "USD": {"name": "美元", "symbol": "$"},
    "EUR": {"name": "欧元", "symbol": "€"},
    "GBP": {"name": "英镑", "symbol": "£"},
    "JPY": {"name": "日元", "symbol": "¥"},
    "HKD": {"name": "港币", "symbol": "HK$"},
    "KRW": {"name": "韩元", "symbol": "₩"},
    "SGD": {"name": "新加坡元", "symbol": "S$"},
    "AUD": {"name": "澳元", "symbol": "A$"},
    "CAD": {"name": "加元", "symbol": "C$"},
}

FRANKFURTER_BASE = "https://api.frankfurter.app"


def _fetch_from_api(url: str, timeout: int = 10) -> dict:
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "BookKeeper/0.2.0"})
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    with opener.open(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _save_rate(db: Session, from_cur: str, to_cur: str, rate: float, rate_date: str):
    existing = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur,
        ExchangeRate.date == rate_date,
    ).first()
    if existing:
        existing.rate = rate
        existing.fetched_at = datetime.utcnow()
    else:
        db.add(ExchangeRate(
            from_currency=from_cur,
            to_currency=to_cur,
            rate=rate,
            date=rate_date,
        ))
    db.commit()


def _get_cached_rate(db: Session, from_cur: str, to_cur: str, rate_date: str) -> float | None:
    row = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur,
        ExchangeRate.date == rate_date,
    ).first()
    return row.rate if row else None


def _get_latest_cached_rate(db: Session, from_cur: str, to_cur: str) -> float | None:
    row = db.query(ExchangeRate).filter(
        ExchangeRate.from_currency == from_cur,
        ExchangeRate.to_currency == to_cur,
    ).order_by(ExchangeRate.date.desc()).first()
    return (row.rate, row.date) if row else (None, None)


def get_rate(db: Session, from_cur: str, to_cur: str, rate_date: str | None = None) -> tuple[float, str, str]:
    if from_cur == to_cur:
        return 1.0, rate_date or date.today().isoformat(), "identity"

    if rate_date is None:
        rate_date = date.today().isoformat()

    cached = _get_cached_rate(db, from_cur, to_cur, rate_date)
    if cached is not None:
        return cached, rate_date, "cache"

    try:
        url = f"{FRANKFURTER_BASE}/{rate_date}?from={from_cur}&to={to_cur}"
        data = _fetch_from_api(url)
        rate = data["rates"][to_cur]
        actual_date = data.get("date", rate_date)
        _save_rate(db, from_cur, to_cur, rate, actual_date)
        return rate, actual_date, "api"
    except Exception as e:
        logger.warning(f"Failed to fetch rate {from_cur}->{to_cur} for {rate_date}: {e}")

    latest_rate, latest_date = _get_latest_cached_rate(db, from_cur, to_cur)
    if latest_rate is not None:
        logger.info(f"Using fallback cached rate {from_cur}->{to_cur} from {latest_date}")
        return latest_rate, latest_date, "cache_fallback"

    try:
        url = f"{FRANKFURTER_BASE}/latest?from={from_cur}&to={to_cur}"
        data = _fetch_from_api(url)
        rate = data["rates"][to_cur]
        actual_date = data.get("date", rate_date)
        _save_rate(db, from_cur, to_cur, rate, actual_date)
        return rate, actual_date, "api_latest_fallback"
    except Exception as e:
        logger.error(f"All rate fetch methods failed for {from_cur}->{to_cur}: {e}")
        raise ValueError(f"无法获取汇率 {from_cur}->{to_cur}，请稍后重试")


def convert_amount(db: Session, amount: float, from_cur: str, to_cur: str, rate_date: str | None = None) -> tuple[float, float, str, str]:
    rate, actual_date, source = get_rate(db, from_cur, to_cur, rate_date)
    converted = round(amount * rate, 2)
    return converted, rate, actual_date, source


def get_latest_rates(db: Session, base_currency: str, targets: list[str] | None = None) -> dict:
    if targets is None:
        targets = [c for c in SUPPORTED_CURRENCIES if c != base_currency]

    result = {}
    for target in targets:
        if target == base_currency:
            continue
        try:
            rate, rate_date, source = get_rate(db, base_currency, target)
            result[target] = {"rate": rate, "date": rate_date, "source": source}
        except ValueError:
            result[target] = {"rate": None, "date": None, "source": "unavailable"}
    return result
