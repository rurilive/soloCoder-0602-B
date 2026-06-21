from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict, Tuple, Set
from datetime import datetime

from app.database import get_db
from app.models import (
    Transaction, Category, Account, Ledger, Budget,
    InvestmentSecurity, InvestmentTransaction, InvestmentLot,
    TaxLotSale, Loan, LoanRepaymentSchedule,
)
from app.schemas import (
    MonthlySummary, CategoryStat,
    AnnualCategoryStat, AnnualMonthlyCashFlow, AnnualInvestmentSummary,
    AnnualBudgetItem, AnnualBudgetSummary, AnnualHealthScorePoint,
    AnnualReportResponse, FinancialHealthScore, HealthScoreDimension,
    TaxSummaryResponse, MonthlyTaxCalendarItem,
)
from app.exchange_rate import convert_amount, get_rate

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


def _month_range(year: int, month: int):
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return start, end


@router.get("/monthly", response_model=MonthlySummary)
def monthly_summary(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    target_currency: str = Query(None, description="目标币种，不传则按原币汇总"),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)
    count = db.query(func.count(Transaction.id)).filter(
        Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end
    ).scalar() or 0

    if not target_currency:
        rows = (
            db.query(Transaction.type, func.sum(Transaction.amount), func.count())
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
            .group_by(Transaction.type)
            .all()
        )
        total_income = 0.0
        total_expense = 0.0
        for r in rows:
            if r[0] == "income":
                total_income = float(r[1] or 0)
            elif r[0] == "expense":
                total_expense = float(r[1] or 0)
    else:
        ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
        base_currency = ledger.base_currency if ledger else "CNY"

        tx_rows = (
            db.query(Transaction.type, Transaction.amount, Transaction.date, Transaction.account_id)
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
            .all()
        )
        account_ids = list(set(r.account_id for r in tx_rows))
        accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
        account_currency_map = {a.id: a.currency for a in accounts}

        total_income = 0.0
        total_expense = 0.0
        for r in tx_rows:
            src_currency = account_currency_map.get(r.account_id, base_currency)
            amount = float(r.amount or 0)
            if src_currency != target_currency:
                try:
                    converted, _, _, _ = convert_amount(db, amount, src_currency, target_currency, r.date)
                    amount = converted
                except ValueError:
                    pass
            if r.type == "income":
                total_income += amount
            elif r.type == "expense":
                total_expense += amount

    return MonthlySummary(
        year=year,
        month=month,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        balance=round(total_income - total_expense, 2),
        transaction_count=count,
    )


@router.get("/categories", response_model=List[CategoryStat])
def category_stats(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    type: str = Query(None),
    target_currency: str = Query(None, description="目标币种，不传则按原币汇总"),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)

    if not target_currency:
        query = (
            db.query(
                Transaction.category_id,
                Category.name.label("category_name"),
                Category.icon.label("category_icon"),
                Category.type.label("cat_type"),
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Transaction.category_id == Category.id)
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
        )
        if type:
            query = query.filter(Category.type == type)
        rows = query.group_by(Transaction.category_id).all()

        total_all = sum(float(r.total or 0) for r in rows)
        result = []
        for r in rows:
            amount = float(r.total or 0)
            pct = round(amount / total_all * 100, 2) if total_all > 0 else 0
            result.append(
                CategoryStat(
                    category_id=r.category_id,
                    category_name=r.category_name,
                    category_icon=r.category_icon or "",
                    type=r.cat_type,
                    amount=round(amount, 2),
                    percentage=pct,
                )
            )
        return result

    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    base_currency = ledger.base_currency if ledger else "CNY"

    tx_rows = (
        db.query(Transaction.category_id, Transaction.amount, Transaction.date, Transaction.account_id)
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
    )
    if type:
        tx_rows = tx_rows.filter(Category.type == type)
    tx_rows = tx_rows.all()

    account_ids = list(set(r.account_id for r in tx_rows))
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
    account_currency_map = {a.id: a.currency for a in accounts}

    category_ids = list(set(r.category_id for r in tx_rows))
    categories = db.query(Category).filter(Category.id.in_(category_ids)).all() if category_ids else []
    category_map = {c.id: c for c in categories}

    category_converted = {}
    for r in tx_rows:
        src_currency = account_currency_map.get(r.account_id, base_currency)
        amount = float(r.amount or 0)
        if src_currency != target_currency:
            try:
                converted, _, _, _ = convert_amount(db, amount, src_currency, target_currency, r.date)
                amount = converted
            except ValueError:
                pass
        cid = r.category_id
        category_converted[cid] = category_converted.get(cid, 0.0) + amount

    total_all = sum(category_converted.values())
    result = []
    for cid, amount in category_converted.items():
        cat = category_map.get(cid)
        if not cat:
            continue
        pct = round(amount / total_all * 100, 2) if total_all > 0 else 0
        result.append(
            CategoryStat(
                category_id=cid,
                category_name=cat.name,
                category_icon=cat.icon or "",
                type=cat.type,
                amount=round(amount, 2),
                percentage=pct,
            )
        )
    result.sort(key=lambda x: x.amount, reverse=True)
    return result


def _year_range(year: int):
    return f"{year:04d}-01-01", f"{year + 1:04d}-01-01"


def _r2(v: float) -> float:
    return round(v, 2)


def _build_rate_cache(
    db: Session,
    currencies: Set[str],
    target_currency: str,
    rate_date: Optional[str] = None,
) -> Tuple[Dict[Tuple[str, str], float], Set[str]]:
    cache: Dict[Tuple[str, str], float] = {}
    failed: Set[str] = set()
    for cur in currencies:
        if cur == target_currency:
            cache[(cur, target_currency)] = 1.0
            continue
        try:
            rate, _, _ = get_rate(db, cur, target_currency, rate_date)
            cache[(cur, target_currency)] = rate
        except ValueError:
            failed.add(cur)
    return cache, failed


def _get_level_info(score: float):
    if score >= 85:
        return {"level": "优秀", "description": "财务状况非常健康，资金管理出色", "color": "#52c41a"}
    elif score >= 70:
        return {"level": "良好", "description": "财务状况良好，保持现有习惯", "color": "#1890ff"}
    elif score >= 50:
        return {"level": "一般", "description": "财务状况一般，有改进空间", "color": "#faad14"}
    elif score >= 30:
        return {"level": "较差", "description": "财务状况较差，需要重点关注", "color": "#fa8c16"}
    else:
        return {"level": "很差", "description": "财务状况危险，请立即采取行动", "color": "#f5222d"}


def _compute_month_health_score(db: Session, ledger_id: int, year: int, month: int, ledger: Ledger):
    start, end = _month_range(year, month)
    rows = (
        db.query(Transaction.type, Transaction.amount, Transaction.date, Transaction.account_id)
        .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
        .all()
    )
    if not rows:
        return None

    base_currency = ledger.base_currency
    account_ids = list(set(r.account_id for r in rows))
    accounts = db.query(Account).filter(Account.id.in_(account_ids)).all() if account_ids else []
    account_currency_map = {a.id: a.currency for a in accounts}

    income = 0.0
    expense = 0.0
    for r in rows:
        src_cur = account_currency_map.get(r.account_id, base_currency)
        amount = float(r.amount or 0)
        if src_cur != base_currency:
            try:
                converted, _, _, _ = convert_amount(db, amount, src_cur, base_currency, r.date)
                amount = converted
            except ValueError:
                pass
        if r.type == "income":
            income += amount
        else:
            expense += amount

    net = income - expense
    savings_rate = net / income if income > 0 else 0.0
    tx_count = len(rows)

    savings_score = 0.0
    if income > 0:
        if savings_rate >= 0.3:
            savings_score = 100
        elif savings_rate >= 0.2:
            savings_score = 80
        elif savings_rate >= 0.1:
            savings_score = 60
        elif savings_rate >= 0:
            savings_score = 40
        else:
            savings_score = 10

    balance_score = 100.0 if net >= 0 else 0.0

    total_score = round(savings_score * 0.5 + balance_score * 0.5, 1)
    total_score = max(0.0, min(100.0, total_score))
    level_info = _get_level_info(total_score)

    return {
        "score": total_score,
        "level": level_info["level"],
        "level_color": level_info["color"],
        "savings_rate": savings_rate,
        "income": income,
        "expense": expense,
        "net": net,
        "tx_count": tx_count,
    }


@router.get("/annual", response_model=AnnualReportResponse)
def annual_report(
    ledger_id: int = Query(...),
    year: int = Query(...),
    target_currency: Optional[str] = Query(None, description="目标币种，不传则使用账本基准币种"),
    db: Session = Depends(get_db),
):
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    if not ledger:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="账本不存在")

    base_currency = target_currency or ledger.base_currency
    year_start, year_end = _year_range(year)

    accounts = db.query(Account).filter(Account.ledger_id == ledger_id).all()
    account_currency_map = {a.id: a.currency for a in accounts}
    unique_currencies = {a.currency for a in accounts}
    mid_date = f"{year}-06-30"
    rate_cache, _ = _build_rate_cache(db, unique_currencies, base_currency, mid_date)

    tx_rows = (
        db.query(
            Transaction.type, Transaction.amount, Transaction.date,
            Transaction.account_id, Transaction.category_id,
        )
        .filter(
            Transaction.ledger_id == ledger_id,
            Transaction.date >= year_start,
            Transaction.date < year_end,
        )
        .all()
    )

    def _convert(amount: float, account_id: int, date_str: str) -> float:
        src_cur = account_currency_map.get(account_id, base_currency)
        if src_cur == base_currency:
            return float(amount)
        if (src_cur, base_currency) in rate_cache:
            return float(amount) * rate_cache[(src_cur, base_currency)]
        try:
            converted, _, _, _ = convert_amount(db, float(amount), src_cur, base_currency, date_str)
            return converted
        except ValueError:
            return float(amount)

    total_income = 0.0
    total_expense = 0.0
    category_totals: Dict[Tuple[str, int], float] = {}
    monthly_data: Dict[int, Dict[str, float]] = {}

    for m in range(1, 13):
        monthly_data[m] = {"income": 0.0, "expense": 0.0}

    for r in tx_rows:
        converted = _convert(r.amount, r.account_id, r.date)
        key = (r.type, r.category_id)
        category_totals[key] = category_totals.get(key, 0.0) + converted

        m = int(r.date[5:7])
        if r.type == "income":
            total_income += converted
            monthly_data[m]["income"] += converted
        else:
            total_expense += converted
            monthly_data[m]["expense"] += converted

    total_income = _r2(total_income)
    total_expense = _r2(total_expense)
    net_balance = _r2(total_income - total_expense)
    savings_rate = _r2((total_income - total_expense) / total_income * 100) if total_income > 0 else 0.0
    transaction_count = len(tx_rows)

    all_categories = db.query(Category).filter(Category.ledger_id == ledger_id).all()
    cat_map = {c.id: c for c in all_categories}

    income_cats: List[AnnualCategoryStat] = []
    expense_cats: List[AnnualCategoryStat] = []

    for (tx_type, cat_id), amount in category_totals.items():
        cat = cat_map.get(cat_id)
        if not cat:
            continue
        total = total_income if tx_type == "income" else total_expense
        pct = _r2(amount / total * 100) if total > 0 else 0.0
        stat = AnnualCategoryStat(
            category_id=cat.id,
            category_name=cat.name,
            category_icon=cat.icon or "",
            type=tx_type,
            amount=_r2(amount),
            percentage=pct,
        )
        if tx_type == "income":
            income_cats.append(stat)
        else:
            expense_cats.append(stat)

    income_cats.sort(key=lambda x: x.amount, reverse=True)
    expense_cats.sort(key=lambda x: x.amount, reverse=True)

    monthly_cash_flow: List[AnnualMonthlyCashFlow] = []
    month_labels = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
    for m in range(1, 13):
        d = monthly_data[m]
        income = _r2(d["income"])
        expense = _r2(d["expense"])
        monthly_cash_flow.append(AnnualMonthlyCashFlow(
            month=m,
            label=month_labels[m - 1],
            income=income,
            expense=expense,
            net_cash_flow=_r2(income - expense),
        ))

    securities = db.query(InvestmentSecurity).filter(InvestmentSecurity.ledger_id == ledger_id).all()
    total_cost_basis = 0.0
    total_market_value = 0.0
    total_realized_gain = 0.0
    total_unrealized_gain = 0.0
    total_dividends = 0.0

    for sec in securities:
        lots = (
            db.query(InvestmentLot)
            .filter(
                InvestmentLot.security_id == sec.id,
                InvestmentLot.ledger_id == ledger_id,
            )
            .all()
        )
        open_lots = [l for l in lots if not l.is_closed and l.quantity_remaining > 1e-9]
        qty = sum(l.quantity_remaining for l in open_lots)
        cost_basis = sum(l.quantity_remaining * l.cost_basis_per_share for l in open_lots)
        market_value = qty * sec.current_price
        unrealized_gain = market_value - cost_basis

        transactions = (
            db.query(InvestmentTransaction)
            .filter(
                InvestmentTransaction.security_id == sec.id,
                InvestmentTransaction.ledger_id == ledger_id,
                InvestmentTransaction.date >= year_start,
                InvestmentTransaction.date < year_end,
            )
            .all()
        )
        realized = sum(t.realized_gain for t in transactions if t.type == "sell")
        dividends = sum(t.dividend_amount or 0.0 for t in transactions if t.type == "dividend")

        if sec.currency != base_currency:
            try:
                cmv, _, _, _ = convert_amount(db, market_value, sec.currency, base_currency)
                ccb, _, _, _ = convert_amount(db, cost_basis, sec.currency, base_currency)
                cug, _, _, _ = convert_amount(db, unrealized_gain, sec.currency, base_currency)
                crg, _, _, _ = convert_amount(db, realized, sec.currency, base_currency)
                cdv, _, _, _ = convert_amount(db, dividends, sec.currency, base_currency)
                total_market_value += cmv
                total_cost_basis += ccb
                total_unrealized_gain += cug
                total_realized_gain += crg
                total_dividends += cdv
            except ValueError:
                total_market_value += market_value
                total_cost_basis += cost_basis
                total_unrealized_gain += unrealized_gain
                total_realized_gain += realized
                total_dividends += dividends
        else:
            total_market_value += market_value
            total_cost_basis += cost_basis
            total_unrealized_gain += unrealized_gain
            total_realized_gain += realized
            total_dividends += dividends

    total_return_pct = _r2(
        (total_realized_gain + total_unrealized_gain + total_dividends) / total_cost_basis * 100
    ) if total_cost_basis > 0 else 0.0

    investment_summary = AnnualInvestmentSummary(
        total_realized_gain=_r2(total_realized_gain),
        total_unrealized_gain=_r2(total_unrealized_gain),
        total_dividends=_r2(total_dividends),
        total_market_value=_r2(total_market_value),
        total_cost_basis=_r2(total_cost_basis),
        total_return_pct=total_return_pct,
    )

    SHORT_TERM_RATE = 0.20
    LONG_TERM_RATE = 0.10
    DIVIDEND_TAX_RATE = 0.20

    sell_txs = (
        db.query(InvestmentTransaction)
        .filter(
            InvestmentTransaction.ledger_id == ledger_id,
            InvestmentTransaction.type == "sell",
            InvestmentTransaction.date >= year_start,
            InvestmentTransaction.date < year_end,
        )
        .all()
    )

    raw_short_total = sum(tx.raw_short_gain for tx in sell_txs)
    raw_long_total = sum(tx.raw_long_gain for tx in sell_txs)

    net_short = raw_short_total
    net_long = raw_long_total
    short_gain_total = max(0.0, net_short)
    long_gain_total = max(0.0, net_long)
    if net_short < 0:
        long_gain_total = max(0.0, net_long + net_short)
    if net_long < 0 and net_short > 0:
        short_gain_total = max(0.0, net_short + net_long)

    short_tax = short_gain_total * SHORT_TERM_RATE
    long_tax = long_gain_total * LONG_TERM_RATE

    short_cost_total = 0.0
    short_proceeds_total = 0.0
    long_cost_total = 0.0
    long_proceeds_total = 0.0

    tax_lot_sales = (
        db.query(TaxLotSale)
        .filter(
            TaxLotSale.ledger_id == ledger_id,
            TaxLotSale.sell_date >= year_start,
            TaxLotSale.sell_date < year_end,
        )
        .all()
    )

    for tls in tax_lot_sales:
        if tls.gain_type == "short":
            short_cost_total += tls.cost_sold
            short_proceeds_total += tls.proceeds_sold
        else:
            long_cost_total += tls.cost_sold
            long_proceeds_total += tls.proceeds_sold

    div_txs = (
        db.query(InvestmentTransaction)
        .filter(
            InvestmentTransaction.ledger_id == ledger_id,
            InvestmentTransaction.type == "dividend",
            InvestmentTransaction.date >= year_start,
            InvestmentTransaction.date < year_end,
        )
        .all()
    )

    dividend_income_total = sum(tx.dividend_amount or 0.0 for tx in div_txs)
    dividend_tax_total = sum(tx.dividend_tax for tx in div_txs)
    total_capital_tax = _r2(short_tax + long_tax)
    total_tax = _r2(total_capital_tax + dividend_tax_total)

    net_income = short_gain_total + long_gain_total + dividend_income_total
    effective_tax_rate = _r2((total_tax / net_income * 100) if net_income > 0 else 0.0)

    raw_capital_tax_total = 0.0
    monthly_tax_calendar = []
    for m in range(1, 13):
        m_start = f"{year}-{m:02d}-01"
        if m == 12:
            m_end = f"{year + 1}-01-01"
        else:
            m_end = f"{year}-{m + 1:02d}-01"

        m_sell_txs = [tx for tx in sell_txs if m_start <= tx.date < m_end]
        m_div_txs = [tx for tx in div_txs if m_start <= tx.date < m_end]

        m_short = sum(tx.raw_short_gain for tx in m_sell_txs)
        m_long = sum(tx.raw_long_gain for tx in m_sell_txs)

        m_div_income = sum(tx.dividend_amount or 0.0 for tx in m_div_txs)
        m_div_tax = sum(tx.dividend_tax for tx in m_div_txs)
        m_cap_tax = _r2(max(0.0, m_short) * SHORT_TERM_RATE + max(0.0, m_long) * LONG_TERM_RATE)
        m_total_tax = _r2(m_cap_tax + m_div_tax)

        raw_capital_tax_total += m_cap_tax

        monthly_tax_calendar.append(MonthlyTaxCalendarItem(
            year=year,
            month=m,
            short_gain=_r2(m_short),
            long_gain=_r2(m_long),
            dividend_income=_r2(m_div_income),
            dividend_tax=_r2(m_div_tax),
            capital_tax=m_cap_tax,
            total_tax=m_total_tax,
        ))

    raw_capital_tax_total = _r2(raw_capital_tax_total)
    raw_total_tax = _r2(raw_capital_tax_total + dividend_tax_total)

    tax_summary = TaxSummaryResponse(
        ledger_id=ledger_id,
        year=year,
        raw_short_gain_total=_r2(raw_short_total),
        raw_long_gain_total=_r2(raw_long_total),
        short_gain_total=_r2(short_gain_total),
        short_cost_total=_r2(short_cost_total),
        short_proceeds_total=_r2(short_proceeds_total),
        short_tax=_r2(short_tax),
        long_gain_total=_r2(long_gain_total),
        long_cost_total=_r2(long_cost_total),
        long_proceeds_total=_r2(long_proceeds_total),
        long_tax=_r2(long_tax),
        dividend_income_total=_r2(dividend_income_total),
        dividend_tax_total=_r2(dividend_tax_total),
        raw_capital_tax_total=raw_capital_tax_total,
        raw_total_tax=raw_total_tax,
        total_capital_tax=total_capital_tax,
        total_tax=total_tax,
        effective_tax_rate=effective_tax_rate,
        monthly_calendar=monthly_tax_calendar,
    )

    budgets = (
        db.query(Budget)
        .filter(Budget.ledger_id == ledger_id, Budget.year == year)
        .all()
    )
    budget_map: Dict[Tuple[int, int], float] = {}
    for b in budgets:
        key = (b.category_id, b.month)
        budget_map[key] = budget_map.get(key, 0.0) + float(b.amount)

    annual_budget_map: Dict[int, float] = {}
    for (cat_id, _m), amt in budget_map.items():
        annual_budget_map[cat_id] = annual_budget_map.get(cat_id, 0.0) + amt

    expense_cat_ids = [c.id for c in all_categories if c.type == "expense"]
    spent_map: Dict[int, float] = {}
    for (tx_type, cat_id), amount in category_totals.items():
        if tx_type == "expense":
            spent_map[cat_id] = amount

    budget_items: List[AnnualBudgetItem] = []
    total_budget = 0.0
    total_spent = 0.0
    overbudget_count = 0

    for cat in all_categories:
        if cat.type != "expense":
            continue
        budget_amount = annual_budget_map.get(cat.id, 0.0)
        spent_amount = spent_map.get(cat.id, 0.0)
        remaining = budget_amount - spent_amount
        execution_rate = _r2(spent_amount / budget_amount * 100) if budget_amount > 0 else 0.0
        is_overbudget = spent_amount > budget_amount and budget_amount > 0

        if budget_amount > 0:
            total_budget += budget_amount
            total_spent += spent_amount
            if is_overbudget:
                overbudget_count += 1

        budget_items.append(AnnualBudgetItem(
            category_id=cat.id,
            category_name=cat.name,
            category_icon=cat.icon or "",
            budget_amount=_r2(budget_amount),
            spent_amount=_r2(spent_amount),
            remaining=_r2(remaining),
            execution_rate=execution_rate,
            is_overbudget=is_overbudget,
        ))

    budget_items.sort(key=lambda x: -x.spent_amount)
    overall_execution_rate = _r2(total_spent / total_budget * 100) if total_budget > 0 else 0.0

    budget_summary = AnnualBudgetSummary(
        total_budget=_r2(total_budget),
        total_spent=_r2(total_spent),
        total_remaining=_r2(total_budget - total_spent),
        overall_execution_rate=overall_execution_rate,
        overbudget_count=overbudget_count,
        items=budget_items,
    )

    health_score_history: List[AnnualHealthScorePoint] = []
    for m in range(1, 13):
        result = _compute_month_health_score(db, ledger_id, year, m, ledger)
        if result:
            health_score_history.append(AnnualHealthScorePoint(
                month=m,
                score=result["score"],
                level=result["level"],
                level_color=result["level_color"],
            ))
        else:
            health_score_history.append(AnnualHealthScorePoint(
                month=m,
                score=0.0,
                level="暂无数据",
                level_color="#bfbfbf",
            ))

    return AnnualReportResponse(
        ledger_id=ledger_id,
        year=year,
        base_currency=base_currency,
        total_income=total_income,
        total_expense=total_expense,
        net_balance=net_balance,
        savings_rate=savings_rate,
        transaction_count=transaction_count,
        income_categories=income_cats,
        expense_categories=expense_cats,
        monthly_cash_flow=monthly_cash_flow,
        investment_summary=investment_summary,
        tax_summary=tax_summary,
        budget_summary=budget_summary,
        health_score_history=health_score_history,
    )
