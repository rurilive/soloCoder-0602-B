from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List


class LedgerCreate(BaseModel):
    name: str
    type: str = "personal"
    description: str = ""


class LedgerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None


class LedgerOut(BaseModel):
    id: int
    name: str
    type: str
    description: str
    created_at: datetime


class CategoryCreate(BaseModel):
    name: str
    type: str
    icon: str = ""
    ledger_id: int


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    icon: Optional[str] = None


class CategoryOut(BaseModel):
    id: int
    name: str
    type: str
    icon: str
    ledger_id: int
    created_at: datetime


class TransactionCreate(BaseModel):
    amount: float
    type: str
    description: str = ""
    category_id: int
    ledger_id: int
    date: str


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    date: Optional[str] = None


class TransactionOut(BaseModel):
    id: int
    amount: float
    type: str
    description: str
    category_id: int
    ledger_id: int
    date: str
    created_at: datetime


class MonthlySummary(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
    balance: float
    transaction_count: int


class CategoryStat(BaseModel):
    category_id: int
    category_name: str
    category_icon: str
    type: str
    amount: float
    percentage: float


class RecurringRuleCreate(BaseModel):
    name: str
    frequency: str
    amount: float
    type: str
    description: str = ""
    category_id: int
    ledger_id: int
    start_date: str
    end_date: str = ""
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None


class RecurringRuleUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    next_date: Optional[str] = None
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    is_active: Optional[int] = None


class RecurringRuleOut(BaseModel):
    id: int
    name: str
    frequency: str
    amount: float
    type: str
    description: str
    category_id: int
    ledger_id: int
    start_date: str
    end_date: str
    next_date: str
    day_of_month: Optional[int]
    day_of_week: Optional[int]
    is_active: int
    created_at: datetime


class RecurringLogOut(BaseModel):
    id: int
    rule_id: int
    transaction_id: Optional[int]
    generated_date: str
    status: str
    message: str
    created_at: datetime


class GenerateResult(BaseModel):
    total_rules: int
    generated_count: int
    skipped_count: int
    details: List[str]
