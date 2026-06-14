from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.exchange_rate import get_rate, convert_amount, get_latest_rates, SUPPORTED_CURRENCIES
from app.schemas import ExchangeRateOut, ExchangeRateConvertResult, CurrencyInfo

router = APIRouter(prefix="/api/exchange-rates", tags=["exchange-rates"])


@router.get("/currencies", response_model=list[CurrencyInfo])
def list_currencies():
    return [CurrencyInfo(code=code, name=info["name"], symbol=info["symbol"]) for code, info in SUPPORTED_CURRENCIES.items()]


@router.get("/latest")
def latest_rates(
    base: str = Query("CNY", max_length=3),
    db: Session = Depends(get_db),
):
    if base not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"不支持的币种: {base}")
    return get_latest_rates(db, base)


@router.get("/pair", response_model=ExchangeRateOut)
def get_pair_rate(
    from_currency: str = Query(..., alias="from", max_length=3),
    to_currency: str = Query(..., alias="to", max_length=3),
    date: str | None = Query(None, description="YYYY-MM-DD格式的日期，不传则取最新"),
    db: Session = Depends(get_db),
):
    if from_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"不支持的币种: {from_currency}")
    if to_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"不支持的币种: {to_currency}")
    try:
        rate, rate_date, _ = get_rate(db, from_currency, to_currency, date)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ExchangeRateOut(from_currency=from_currency, to_currency=to_currency, rate=rate, date=rate_date)


@router.get("/convert", response_model=ExchangeRateConvertResult)
def convert(
    from_currency: str = Query(..., alias="from", max_length=3),
    to_currency: str = Query(..., alias="to", max_length=3),
    amount: float = Query(..., gt=0),
    date: str | None = Query(None, description="YYYY-MM-DD格式的日期，不传则取最新"),
    db: Session = Depends(get_db),
):
    if from_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"不支持的币种: {from_currency}")
    if to_currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"不支持的币种: {to_currency}")
    try:
        converted, rate, rate_date, source = convert_amount(db, amount, from_currency, to_currency, date)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ExchangeRateConvertResult(
        from_currency=from_currency,
        to_currency=to_currency,
        original_amount=amount,
        converted_amount=converted,
        rate=rate,
        rate_date=rate_date,
        rate_source=source,
    )
