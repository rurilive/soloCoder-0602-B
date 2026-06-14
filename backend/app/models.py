from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.sql import func

from app.database import Base


class Ledger(Base):
    __tablename__ = "ledgers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), default="personal")
    description = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), default="cash")
    icon = Column(String(50), default="wallet")
    initial_balance = Column(Float, default=0.0)
    is_default = Column(Boolean, default=False)
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
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    date = Column(String(10), nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Transfer(Base):
    __tablename__ = "transfers"

    id = Column(Integer, primary_key=True, index=True)
    from_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    to_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Float, nullable=False)
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
