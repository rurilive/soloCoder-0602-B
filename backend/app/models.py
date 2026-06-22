from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, UniqueConstraint, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", Integer, ForeignKey("transactions.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(20), default="#1890ff")
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("ledger_id", "name", name="uq_tag_ledger_name"),
    )


class Ledger(Base):
    __tablename__ = "ledgers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), default="personal")
    description = Column(Text, default="")
    base_currency = Column(String(3), default="CNY")
    cost_method = Column(String(20), default="fifo")
    created_at = Column(DateTime, server_default=func.now())


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), default="cash")
    icon = Column(String(50), default="wallet")
    initial_balance = Column(Float, default=0.0)
    is_default = Column(Boolean, default=False)
    currency = Column(String(3), default="CNY")
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)
    icon = Column(String(50), default="")
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)
    description = Column(Text, default="")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    date = Column(String(10), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    tags = relationship("Tag", secondary=transaction_tags, lazy="joined")


class Transfer(Base):
    __tablename__ = "transfers"

    id = Column(Integer, primary_key=True, index=True)
    from_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Float, nullable=False)
    to_amount = Column(Float, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    date = Column(String(10), nullable=False)
    note = Column(Text, default="")
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    amount = Column(Float, nullable=False)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class RecurringRule(Base):
    __tablename__ = "recurring_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    frequency = Column(String(20), nullable=False)
    amount = Column(Float, nullable=False)
    type = Column(String(20), nullable=False)
    description = Column(Text, default="")
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    start_date = Column(String(10), nullable=False)
    end_date = Column(String(10), default="")
    next_date = Column(String(10), nullable=False)
    day_of_month = Column(Integer)
    day_of_week = Column(Integer)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, server_default=func.now())


class RecurringLog(Base):
    __tablename__ = "recurring_logs"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("recurring_rules.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    generated_date = Column(String(10), nullable=False)
    status = Column(String(20), default="success")
    message = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    __table_args__ = (
        UniqueConstraint("from_currency", "to_currency", "date", name="uq_exchange_rate"),
    )

    id = Column(Integer, primary_key=True, index=True)
    from_currency = Column(String(3), nullable=False)
    to_currency = Column(String(3), nullable=False)
    rate = Column(Float, nullable=False)
    date = Column(String(10), nullable=False)
    fetched_at = Column(DateTime, server_default=func.now())


class Loan(Base):
    __tablename__ = "loans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    principal = Column(Float, nullable=False)
    annual_rate = Column(Float, nullable=False)
    term_months = Column(Integer, nullable=False)
    amortization_type = Column(String(20), nullable=False)
    start_date = Column(String(10), nullable=False)
    repayment_day = Column(Integer, nullable=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    status = Column(String(20), default="active")
    total_interest = Column(Float, default=0.0)
    total_payment = Column(Float, default=0.0)
    description = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())


class LoanRepaymentSchedule(Base):
    __tablename__ = "loan_repayment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    period_number = Column(Integer, nullable=False)
    due_date = Column(String(10), nullable=False)
    payment_amount = Column(Float, nullable=False)
    principal_amount = Column(Float, nullable=False)
    interest_amount = Column(Float, nullable=False)
    remaining_principal = Column(Float, nullable=False)
    status = Column(String(20), default="pending")
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    is_early_repayment = Column(Boolean, default=False)
    early_repayment_amount = Column(Float, default=0.0)
    created_at = Column(DateTime, server_default=func.now())


class InvestmentSecurity(Base):
    __tablename__ = "investment_securities"
    __table_args__ = (
        UniqueConstraint("ledger_id", "symbol", name="uq_security_ledger_symbol"),
    )

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    type = Column(String(50), default="stock")
    currency = Column(String(3), default="CNY")
    current_price = Column(Float, default=0.0)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class InvestmentTransaction(Base):
    __tablename__ = "investment_transactions"

    id = Column(Integer, primary_key=True, index=True)
    security_id = Column(Integer, ForeignKey("investment_securities.id"), nullable=False)
    type = Column(String(20), nullable=False)
    quantity = Column(Float, default=0.0)
    price = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)
    fee = Column(Float, default=0.0)
    date = Column(String(10), nullable=False)
    split_ratio = Column(Float, nullable=True)
    dividend_amount = Column(Float, nullable=True)
    reinvest = Column(Boolean, default=False)
    realized_gain = Column(Float, default=0.0)
    raw_short_gain = Column(Float, default=0.0)
    raw_long_gain = Column(Float, default=0.0)
    taxable_gain_short = Column(Float, default=0.0)
    taxable_gain_long = Column(Float, default=0.0)
    tax_amount_capital = Column(Float, default=0.0)
    dividend_tax = Column(Float, default=0.0)
    dividend_after_tax = Column(Float, nullable=True)
    description = Column(Text, default="")
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    linked_transaction_id = Column(Integer, ForeignKey("investment_transactions.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class InvestmentLot(Base):
    __tablename__ = "investment_lots"

    id = Column(Integer, primary_key=True, index=True)
    security_id = Column(Integer, ForeignKey("investment_securities.id"), nullable=False)
    buy_transaction_id = Column(Integer, ForeignKey("investment_transactions.id"), nullable=False)
    quantity_remaining = Column(Float, nullable=False)
    cost_basis_per_share = Column(Float, nullable=False)
    original_quantity = Column(Float, nullable=False)
    buy_date = Column(String(10), nullable=False)
    is_closed = Column(Boolean, default=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class TaxLotSale(Base):
    __tablename__ = "tax_lot_sales"

    id = Column(Integer, primary_key=True, index=True)
    sell_transaction_id = Column(Integer, ForeignKey("investment_transactions.id"), nullable=False)
    lot_id = Column(Integer, ForeignKey("investment_lots.id"), nullable=False)
    security_id = Column(Integer, ForeignKey("investment_securities.id"), nullable=False)
    quantity_sold = Column(Float, nullable=False)
    cost_basis_per_share = Column(Float, nullable=False)
    cost_sold = Column(Float, nullable=False)
    proceeds_per_share = Column(Float, nullable=False)
    proceeds_sold = Column(Float, nullable=False)
    gain = Column(Float, nullable=False)
    holding_days = Column(Integer, nullable=False)
    gain_type = Column(String(10), nullable=False)
    buy_date = Column(String(10), nullable=False)
    sell_date = Column(String(10), nullable=False)
    ledger_id = Column(Integer, ForeignKey("ledgers.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
