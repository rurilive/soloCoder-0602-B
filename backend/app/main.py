import csv
import io
import urllib.parse
from contextlib import asynccontextmanager
from datetime import datetime, date
from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List

from app.database import engine, SessionLocal, Base, get_db
from app.models import Ledger, Category, Transaction, Budget, Account, Transfer, RecurringRule, ExchangeRate, Loan, LoanRepaymentSchedule
from app.routers import ledgers, categories, transactions, statistics, recurring, budgets, accounts, transfers, exchange_rates, reconciliation, loans, prediction
from app.schemas import FinancialHealthScore, HealthScoreDimension
from app.exchange_rate import convert_amount


def seed_db():
    db = SessionLocal()
    if db.query(Ledger).first():
        db.close()
        return

    personal = Ledger(name="个人账本", type="personal", description="日常个人收支", base_currency="CNY")
    family = Ledger(name="家庭账本", type="family", description="家庭共同收支", base_currency="CNY")
    db.add_all([personal, family])
    db.commit()
    db.refresh(personal)
    db.refresh(family)

    cash = Account(name="现金", type="cash", icon="money-collect", initial_balance=2000, is_default=True, currency="CNY", ledger_id=personal.id)
    bank_card = Account(name="银行卡", type="bank", icon="credit-card", initial_balance=50000, currency="CNY", ledger_id=personal.id)
    alipay = Account(name="支付宝", type="ewallet", icon="alipay-circle", initial_balance=8000, currency="CNY", ledger_id=personal.id)
    usd_account = Account(name="美元账户", type="bank", icon="bank", initial_balance=5000, currency="USD", ledger_id=personal.id)
    family_cash = Account(name="家庭现金", type="cash", icon="money-collect", initial_balance=5000, is_default=True, currency="CNY", ledger_id=family.id)
    family_bank = Account(name="家庭银行卡", type="bank", icon="credit-card", initial_balance=100000, currency="CNY", ledger_id=family.id)
    family_usd = Account(name="家庭美元储蓄", type="bank", icon="bank", initial_balance=10000, currency="USD", ledger_id=family.id)
    db.add_all([cash, bank_card, alipay, usd_account, family_cash, family_bank, family_usd])
    db.commit()

    cats_personal = [
        Category(name="工资", type="income", icon="money-collect", ledger_id=personal.id),
        Category(name="兼职", type="income", icon="laptop", ledger_id=personal.id),
        Category(name="奖金", type="income", icon="gift", ledger_id=personal.id),
        Category(name="餐饮", type="expense", icon="coffee", ledger_id=personal.id),
        Category(name="交通", type="expense", icon="car", ledger_id=personal.id),
        Category(name="购物", type="expense", icon="shopping", ledger_id=personal.id),
        Category(name="娱乐", type="expense", icon="smile", ledger_id=personal.id),
        Category(name="居住", type="expense", icon="home", ledger_id=personal.id),
    ]
    cats_family = [
        Category(name="工资", type="income", icon="money-collect", ledger_id=family.id),
        Category(name="投资", type="income", icon="fund", ledger_id=family.id),
        Category(name="餐饮", type="expense", icon="coffee", ledger_id=family.id),
        Category(name="教育", type="expense", icon="read", ledger_id=family.id),
        Category(name="医疗", type="expense", icon="medicine-box", ledger_id=family.id),
        Category(name="居住", type="expense", icon="home", ledger_id=family.id),
    ]
    db.add_all(cats_personal + cats_family)
    db.commit()

    sample_txs = [
        Transaction(amount=15000, type="income", description="6月工资", category_id=1, ledger_id=personal.id, account_id=bank_card.id, date="2026-06-01"),
        Transaction(amount=2000, type="income", description="自由职业收入", category_id=2, ledger_id=personal.id, account_id=alipay.id, date="2026-06-05"),
        Transaction(amount=800, type="expense", description="日常餐饮", category_id=4, ledger_id=personal.id, account_id=alipay.id, date="2026-06-02"),
        Transaction(amount=200, type="expense", description="地铁公交", category_id=5, ledger_id=personal.id, account_id=cash.id, date="2026-06-03"),
        Transaction(amount=1500, type="expense", description="网购衣服", category_id=6, ledger_id=personal.id, account_id=alipay.id, date="2026-06-06"),
        Transaction(amount=300, type="expense", description="电影聚会", category_id=7, ledger_id=personal.id, account_id=alipay.id, date="2026-06-08"),
        Transaction(amount=3000, type="expense", description="房租", category_id=8, ledger_id=personal.id, account_id=bank_card.id, date="2026-06-01"),
        Transaction(amount=500, type="expense", description="美金购物", category_id=6, ledger_id=personal.id, account_id=usd_account.id, date="2026-06-10"),
        Transaction(amount=25000, type="income", description="家庭工资", category_id=9, ledger_id=family.id, account_id=family_bank.id, date="2026-06-01"),
        Transaction(amount=5000, type="income", description="理财收益", category_id=10, ledger_id=family.id, account_id=family_bank.id, date="2026-06-10"),
        Transaction(amount=2000, type="expense", description="家庭餐饮", category_id=11, ledger_id=family.id, account_id=family_cash.id, date="2026-06-02"),
        Transaction(amount=3000, type="expense", description="孩子补习", category_id=12, ledger_id=family.id, account_id=family_bank.id, date="2026-06-05"),
        Transaction(amount=500, type="expense", description="体检", category_id=13, ledger_id=family.id, account_id=family_bank.id, date="2026-06-07"),
    ]
    db.add_all(sample_txs)
    db.commit()

    sample_transfers = [
        Transfer(from_account_id=bank_card.id, to_account_id=alipay.id, amount=3000, date="2026-06-01", note="银行卡转入支付宝", ledger_id=personal.id),
    ]
    db.add_all(sample_transfers)
    db.commit()

    historical_txs_personal = []
    for month_offset in range(1, 7):
        y, m = 2026, 6 - month_offset
        if m <= 0:
            y, m = 2025, 12 + m
        month_str = f"{y:04d}-{m:02d}"
        historical_txs_personal.extend([
            Transaction(amount=15000, type="income", description=f"{m}月工资", category_id=1, ledger_id=personal.id, account_id=bank_card.id, date=f"{month_str}-01"),
            Transaction(amount=1800 if month_offset <= 3 else 2200, type="income", description="自由职业收入", category_id=2, ledger_id=personal.id, account_id=alipay.id, date=f"{month_str}-05"),
            Transaction(amount=850 + month_offset * 30, type="expense", description="日常餐饮", category_id=4, ledger_id=personal.id, account_id=alipay.id, date=f"{month_str}-02"),
            Transaction(amount=200, type="expense", description="地铁公交", category_id=5, ledger_id=personal.id, account_id=cash.id, date=f"{month_str}-03"),
            Transaction(amount=1200 + month_offset * 100, type="expense", description="购物消费", category_id=6, ledger_id=personal.id, account_id=alipay.id, date=f"{month_str}-06"),
            Transaction(amount=300 + month_offset * 50, type="expense", description="娱乐消费", category_id=7, ledger_id=personal.id, account_id=alipay.id, date=f"{month_str}-08"),
            Transaction(amount=3000, type="expense", description="房租", category_id=8, ledger_id=personal.id, account_id=bank_card.id, date=f"{month_str}-01"),
        ])
    db.add_all(historical_txs_personal)

    historical_txs_family = []
    for month_offset in range(1, 7):
        y, m = 2026, 6 - month_offset
        if m <= 0:
            y, m = 2025, 12 + m
        month_str = f"{y:04d}-{m:02d}"
        historical_txs_family.extend([
            Transaction(amount=25000, type="income", description=f"{m}月家庭工资", category_id=9, ledger_id=family.id, account_id=family_bank.id, date=f"{month_str}-01"),
            Transaction(amount=4000 + month_offset * 200, type="income", description="理财收益", category_id=10, ledger_id=family.id, account_id=family_bank.id, date=f"{month_str}-10"),
            Transaction(amount=2000 + month_offset * 100, type="expense", description="家庭餐饮", category_id=11, ledger_id=family.id, account_id=family_cash.id, date=f"{month_str}-02"),
            Transaction(amount=3000, type="expense", description="孩子补习", category_id=12, ledger_id=family.id, account_id=family_bank.id, date=f"{month_str}-05"),
            Transaction(amount=500, type="expense", description="医疗保健", category_id=13, ledger_id=family.id, account_id=family_bank.id, date=f"{month_str}-07"),
        ])
    db.add_all(historical_txs_family)
    db.commit()

    sample_loan = Loan(
        name="车贷", principal=100000, annual_rate=4.5, term_months=36,
        amortization_type="equal_payment", start_date="2026-01-01",
        repayment_day=15, ledger_id=personal.id, account_id=bank_card.id,
        category_id=8, status="active", total_interest=7094.25,
        total_payment=107094.25, description="36期车贷",
    )
    db.add(sample_loan)
    db.flush()

    loan_schedule = []
    monthly_rate = 4.5 / 100 / 12
    monthly_payment = (100000 * monthly_rate) / (1 - (1 + monthly_rate) ** (-36))
    remaining_principal = 100000
    for period in range(1, 37):
        interest = remaining_principal * monthly_rate
        principal = monthly_payment - interest
        remaining_principal -= principal
        y, m = 2026, period
        if m > 12:
            y, m = 2026 + (m - 1) // 12, ((m - 1) % 12) + 1
        due_date = f"{y:04d}-{m:02d}-15"
        status = "paid" if period <= 5 else "pending"
        loan_schedule.append(LoanRepaymentSchedule(
            loan_id=sample_loan.id, period_number=period, due_date=due_date,
            payment_amount=round(monthly_payment, 2),
            principal_amount=round(principal, 2),
            interest_amount=round(interest, 2),
            remaining_principal=round(max(0, remaining_principal), 2),
            status=status,
        ))
    db.add_all(loan_schedule)
    db.commit()

    sample_rules = [
        RecurringRule(
            name="每月房租", frequency="monthly", amount=3000, type="expense",
            description="月度房租支出", category_id=8, ledger_id=personal.id,
            account_id=bank_card.id, start_date="2026-01-01", next_date="2026-07-01",
            day_of_month=1,
        ),
        RecurringRule(
            name="每月工资", frequency="monthly", amount=15000, type="income",
            description="月度工资收入", category_id=1, ledger_id=personal.id,
            account_id=bank_card.id, start_date="2026-01-01", next_date="2026-07-01",
            day_of_month=1,
        ),
    ]
    db.add_all(sample_rules)
    db.commit()
    db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_db()
    yield


app = FastAPI(title="BookKeeper API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ledgers.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(statistics.router)
app.include_router(recurring.router)
app.include_router(budgets.router)
app.include_router(accounts.router)
app.include_router(transfers.router)
app.include_router(exchange_rates.router)
app.include_router(reconciliation.router)
app.include_router(loans.router)
app.include_router(prediction.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


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


def _build_csv_response(headers: Optional[List[str]], rows: List[List], filename_prefix: str, ascii_prefix: str = "export", extra_date_part: Optional[str] = None):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    if headers:
        writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    buffer.seek(0)
    today = datetime.now().strftime("%Y%m%d")
    date_part = f"{extra_date_part}_{today}" if extra_date_part else today
    filename = f"{filename_prefix}_{date_part}.csv"
    ascii_filename = f"{ascii_prefix}_{date_part}.csv"
    encoded_filename = urllib.parse.quote(filename)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8-sig",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}; filename={ascii_filename}"
        },
    )


@app.get("/api/export/transactions")
def export_transactions(
    ledger_id: int = Query(...),
    year: Optional[int] = Query(None, ge=1970, le=9999),
    month: Optional[int] = Query(None, ge=1, le=12),
    category_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            Transaction,
            Category.name.label("category_name"),
            Account.name.label("account_name"),
            Account.currency.label("currency"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(Transaction.ledger_id == ledger_id)
    )
    if year is not None and month is not None:
        start, end = _month_range(year, month)
        query = query.filter(Transaction.date >= start, Transaction.date < end)
    if category_id is not None:
        query = query.filter(Transaction.category_id == category_id)
    if type is not None:
        query = query.filter(Transaction.type == type)
    results = query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()

    headers = ["日期", "类型", "分类", "账户", "币种", "金额", "描述"]
    rows = []
    for tx, cat_name, acc_name, currency in results:
        tx_type = "收入" if tx.type == "income" else "支出"
        rows.append([
            tx.date,
            tx_type,
            cat_name,
            acc_name,
            currency,
            f"{tx.amount:.2f}",
            tx.description,
        ])
    return _build_csv_response(headers, rows, "交易记录", ascii_prefix="transactions")


@app.get("/api/export/monthly-report")
def export_monthly_report(
    ledger_id: int = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    target_currency: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    start, end = _month_range(year, month)
    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    base_currency = ledger.base_currency if ledger else "CNY"

    tx_rows = (
        db.query(
            Transaction.type,
            Transaction.amount,
            Transaction.date,
            Transaction.account_id,
            Transaction.category_id,
            Category.name.label("category_name"),
            Account.name.label("account_name"),
            Account.currency.label("currency"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .join(Account, Transaction.account_id == Account.id)
        .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
        .all()
    )

    category_totals = {}
    daily_totals = {}
    total_income = 0.0
    total_expense = 0.0

    for r in tx_rows:
        src_currency = r.currency or base_currency
        amount = float(r.amount or 0)
        display_currency = target_currency or src_currency

        if target_currency and src_currency != target_currency:
            try:
                converted, _, _, _ = convert_amount(db, amount, src_currency, target_currency, r.date)
                amount = converted
            except ValueError:
                pass
        else:
            display_currency = src_currency

        key = (r.type, r.category_name or "其他", display_currency)
        category_totals[key] = category_totals.get(key, 0.0) + amount

        day_key = (r.date, display_currency)
        if day_key not in daily_totals:
            daily_totals[day_key] = {"income": 0.0, "expense": 0.0, "currency": display_currency}
        if r.type == "income":
            daily_totals[day_key]["income"] += amount
            total_income += amount
        else:
            daily_totals[day_key]["expense"] += amount
            total_expense += amount

    rows = []
    cur = target_currency or base_currency
    rows.append([f"月度报表 - {year}年{month}月"])
    rows.append([])
    rows.append(["汇总信息"])
    rows.append(["总收入", f"{total_income:.2f}", cur])
    rows.append(["总支出", f"{total_expense:.2f}", cur])
    rows.append(["净结余", f"{total_income - total_expense:.2f}", cur])
    rows.append(["交易笔数", len(tx_rows)])
    rows.append([])

    rows.append(["分类明细"])
    rows.append(["类型", "分类", "币种", "金额", "占比"])
    total_all = total_income + total_expense
    sorted_cats = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    for (tx_type, cat_name, currency), amount in sorted_cats:
        type_label = "收入" if tx_type == "income" else "支出"
        pct = f"{amount / total_all * 100:.2f}%" if total_all > 0 else "0.00%"
        rows.append([type_label, cat_name, currency, f"{amount:.2f}", pct])
    rows.append([])

    rows.append(["每日明细"])
    rows.append(["日期", "币种", "收入", "支出", "净结余"])
    for day_key in sorted(daily_totals.keys()):
        d, _ = day_key
        info = daily_totals[day_key]
        rows.append([
            d,
            info["currency"],
            f"{info['income']:.2f}",
            f"{info['expense']:.2f}",
            f"{info['income'] - info['expense']:.2f}",
        ])

    return _build_csv_response(None, rows, "月度报表", ascii_prefix="monthly-report", extra_date_part=f"{year}{month:02d}")


@app.get("/api/export/loan-schedule")
def export_loan_schedule(
    loan_id: int = Query(...),
    db: Session = Depends(get_db),
):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="贷款不存在")

    schedules = (
        db.query(LoanRepaymentSchedule)
        .filter(LoanRepaymentSchedule.loan_id == loan_id)
        .order_by(LoanRepaymentSchedule.period_number)
        .all()
    )

    status_map = {
        "pending": "待还款",
        "overdue": "已逾期",
        "paid": "已还款",
    }

    headers = [
        "期次", "还款日", "应还本金", "应还利息", "本期还款额",
        "提前还款额", "剩余本金", "状态", "是否提前还款", "关联交易ID",
    ]
    rows = []
    for s in schedules:
        rows.append([
            f"第{s.period_number}期",
            s.due_date,
            f"{s.principal_amount:.2f}",
            f"{s.interest_amount:.2f}",
            f"{s.payment_amount:.2f}",
            f"{s.early_repayment_amount:.2f}" if s.early_repayment_amount > 0 else "0.00",
            f"{s.remaining_principal:.2f}",
            status_map.get(s.status, s.status),
            "是" if s.is_early_repayment else "否",
            s.transaction_id if s.transaction_id else "-",
        ])

    return _build_csv_response(headers, rows, f"贷款还款计划_{loan.name}", ascii_prefix="loan-schedule")


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


@app.get("/api/financial-health/score", response_model=FinancialHealthScore)
def get_financial_health_score(
    ledger_id: int = Query(...),
    db: Session = Depends(get_db),
):
    today = date.today()
    current_year = today.year
    current_month = today.month

    months_data = []
    months_analyzed = 0
    for i in range(3):
        y, m = _add_months(current_year, current_month, -i)
        start, end = _month_range(y, m)
        rows = (
            db.query(Transaction.type, Transaction.amount, Transaction.date, Transaction.account_id)
            .filter(Transaction.ledger_id == ledger_id, Transaction.date >= start, Transaction.date < end)
            .all()
        )
        months_data.append({
            "year": y,
            "month": m,
            "start": start,
            "end": end,
            "transactions": rows,
        })
        if rows:
            months_analyzed += 1

    if months_analyzed == 0:
        return FinancialHealthScore(
            ledger_id=ledger_id,
            total_score=0,
            level="很差",
            level_description="暂无数据，无法评估财务健康状况",
            level_color="#f5222d",
            dimensions=[],
            overall_suggestions=["建议先记录至少一个月的收支数据，以便进行财务健康评估。"],
            months_analyzed=0,
        )

    ledger = db.query(Ledger).filter(Ledger.id == ledger_id).first()
    base_currency = ledger.base_currency if ledger else "CNY"
    account_ids = set()
    for md in months_data:
        for r in md["transactions"]:
            account_ids.add(r.account_id)
    accounts = db.query(Account).filter(Account.id.in_(list(account_ids))).all() if account_ids else []
    account_currency_map = {a.id: a.currency for a in accounts}

    monthly_summaries = []
    for md in months_data:
        income = 0.0
        expense = 0.0
        tx_count = 0
        for r in md["transactions"]:
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
            tx_count += 1
        monthly_summaries.append({
            "year": md["year"],
            "month": md["month"],
            "income": income,
            "expense": expense,
            "net": income - expense,
            "tx_count": tx_count,
            "savings_rate": (income - expense) / income if income > 0 else 0,
        })

    avg_income = sum(m["income"] for m in monthly_summaries if m["tx_count"] > 0) / max(months_analyzed, 1)
    avg_expense = sum(m["expense"] for m in monthly_summaries if m["tx_count"] > 0) / max(months_analyzed, 1)
    avg_savings_rate = sum(m["savings_rate"] for m in monthly_summaries if m["tx_count"] > 0 and m["income"] > 0) / max(months_analyzed, 1)
    total_months_with_data = sum(1 for m in monthly_summaries if m["tx_count"] > 0)

    dimensions = []

    savings_score = 0.0
    savings_suggestions = []
    if avg_income > 0:
        if avg_savings_rate >= 0.3:
            savings_score = 100
            savings_suggestions.append("储蓄率优秀，继续保持！")
        elif avg_savings_rate >= 0.2:
            savings_score = 80
            savings_suggestions.append("储蓄率良好，可考虑适当提升投资比例。")
        elif avg_savings_rate >= 0.1:
            savings_score = 60
            savings_suggestions.append("储蓄率一般，建议控制非必要支出。")
        elif avg_savings_rate >= 0:
            savings_score = 40
            savings_suggestions.append("储蓄率偏低，需要认真审视消费习惯。")
        else:
            savings_score = 10
            savings_suggestions.append("入不敷出！请立即削减支出或增加收入来源。")
    else:
        savings_suggestions.append("暂无收入数据，建议记录收入来源。")

    dimensions.append(HealthScoreDimension(
        key="savings",
        name="储蓄能力",
        score=round(savings_score, 1),
        weight=0.30,
        max_score=100,
        description=f"近{months_analyzed}个月平均储蓄率：{avg_savings_rate * 100:.1f}%",
        suggestions=savings_suggestions,
    ))

    balance_score = 0.0
    balance_suggestions = []
    positive_months = sum(1 for m in monthly_summaries if m["tx_count"] > 0 and m["net"] >= 0)
    if total_months_with_data > 0:
        balance_ratio = positive_months / total_months_with_data
        balance_score = balance_ratio * 100
        if balance_ratio >= 1.0:
            balance_suggestions.append("连续保持收支平衡，非常棒！")
        elif balance_ratio >= 0.66:
            balance_suggestions.append("多数月份收支平衡，需关注超支月份。")
        else:
            balance_suggestions.append("多个月份出现超支，需要制定更严格的预算。")
    else:
        balance_suggestions.append("数据不足，建议持续记录。")

    dimensions.append(HealthScoreDimension(
        key="balance",
        name="收支平衡",
        score=round(balance_score, 1),
        weight=0.25,
        max_score=100,
        description=f"{positive_months}/{total_months_with_data}个月实现结余",
        suggestions=balance_suggestions,
    ))

    expense_score = 100.0
    expense_suggestions = []
    if months_analyzed >= 2:
        active_months = [m for m in monthly_summaries if m["tx_count"] > 0]
        if len(active_months) >= 2:
            expenses = [m["expense"] for m in active_months]
            avg_exp = sum(expenses) / len(expenses)
            if avg_exp > 0:
                variance = sum((e - avg_exp) ** 2 for e in expenses) / len(expenses)
                std_dev = variance ** 0.5
                cv = std_dev / avg_exp
                if cv <= 0.1:
                    expense_score = 100
                    expense_suggestions.append("支出非常稳定，预算执行出色！")
                elif cv <= 0.2:
                    expense_score = 80
                    expense_suggestions.append("支出基本稳定，可关注大额波动月份。")
                elif cv <= 0.4:
                    expense_score = 60
                    expense_suggestions.append("支出波动较大，建议设置每月预算上限。")
                else:
                    expense_score = 40
                    expense_suggestions.append("支出波动很大，需要严格控制冲动消费。")
    else:
        expense_suggestions.append("数据不足，建议记录满3个月后评估支出稳定性。")

    dimensions.append(HealthScoreDimension(
        key="expense_stability",
        name="支出稳定性",
        score=round(expense_score, 1),
        weight=0.20,
        max_score=100,
        description="评估月度支出的波动程度",
        suggestions=expense_suggestions,
    ))

    debt_score = 100.0
    debt_suggestions = []
    start_3m, _ = _month_range(*_add_months(current_year, current_month, -2))
    _, end_cur = _month_range(current_year, current_month)

    loans = db.query(Loan).filter(Loan.ledger_id == ledger_id, Loan.status == "active").all()
    total_loan_payment = 0.0
    if loans:
        for loan in loans:
            schedules = (
                db.query(LoanRepaymentSchedule)
                .filter(
                    LoanRepaymentSchedule.loan_id == loan.id,
                    LoanRepaymentSchedule.due_date >= start_3m,
                    LoanRepaymentSchedule.due_date < end_cur,
                )
                .all()
            )
            for s in schedules:
                total_loan_payment += s.payment_amount

    debt_to_income = 0.0
    total_income_3m = sum(m["income"] for m in monthly_summaries)
    if total_income_3m > 0:
        debt_to_income = total_loan_payment / total_income_3m
        if debt_to_income <= 0.1:
            debt_score = 100
            debt_suggestions.append("债务负担极轻，财务自由度高！")
        elif debt_to_income <= 0.3:
            debt_score = 80
            debt_suggestions.append("债务负担合理，可适度还款加快清债。")
        elif debt_to_income <= 0.5:
            debt_score = 60
            debt_suggestions.append("债务负担较重，建议优先偿还高息贷款。")
        elif debt_to_income <= 0.7:
            debt_score = 40
            debt_suggestions.append("债务压力大，需要制定加速还款计划。")
        else:
            debt_score = 10
            debt_suggestions.append("债务极其危险！请立即寻求专业财务建议。")
    else:
        if not loans:
            debt_suggestions.append("目前没有负债，财务状况良好。")
        else:
            debt_suggestions.append("暂无收入数据，无法评估债务压力。")

    dimensions.append(HealthScoreDimension(
        key="debt",
        name="债务压力",
        score=round(debt_score, 1),
        weight=0.15,
        max_score=100,
        description=f"债务收入比：{debt_to_income * 100:.1f}%" if total_income_3m > 0 else "数据不足",
        suggestions=debt_suggestions,
    ))

    activity_score = 0.0
    activity_suggestions = []
    avg_tx_count = sum(m["tx_count"] for m in monthly_summaries if m["tx_count"] > 0) / max(months_analyzed, 1)
    if months_analyzed == 3:
        if avg_tx_count >= 40:
            activity_score = 100
            activity_suggestions.append("记账非常积极，数据详尽可靠！")
        elif avg_tx_count >= 20:
            activity_score = 80
            activity_suggestions.append("记账习惯良好，建议保持。")
        elif avg_tx_count >= 10:
            activity_score = 60
            activity_suggestions.append("记账频率一般，小额支出也请记录。")
        else:
            activity_score = 40
            activity_suggestions.append("记账偏少，建议养成每日记账习惯。")
    elif months_analyzed == 2:
        activity_score = 60
        activity_suggestions.append("继续保持记账，3个月后评分更准确。")
    else:
        activity_score = 40
        activity_suggestions.append("记账时间较短，建议坚持连续记录。")

    dimensions.append(HealthScoreDimension(
        key="activity",
        name="记账活跃度",
        score=round(activity_score, 1),
        weight=0.10,
        max_score=100,
        description=f"近{months_analyzed}个月平均每月{avg_tx_count:.0f}笔记录",
        suggestions=activity_suggestions,
    ))

    total_score = sum(d.score * d.weight for d in dimensions)
    total_score = round(max(0.0, min(100.0, total_score)), 1)

    level_info = _get_level_info(total_score)

    overall_suggestions = []
    for d in dimensions:
        if d.score < 60:
            overall_suggestions.extend(d.suggestions)
    if not overall_suggestions:
        overall_suggestions.append("财务状况整体良好，继续保持当前的理财习惯！")
        overall_suggestions.append("建议定期查看财务报告，及时调整财务策略。")

    return FinancialHealthScore(
        ledger_id=ledger_id,
        total_score=total_score,
        level=level_info["level"],
        level_description=level_info["description"],
        level_color=level_info["color"],
        dimensions=dimensions,
        overall_suggestions=overall_suggestions,
        months_analyzed=months_analyzed,
    )
