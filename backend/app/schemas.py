from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict


class LedgerCreate(BaseModel):
    name: str
    type: str = "personal"
    description: str = ""
    base_currency: str = "CNY"


class LedgerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    base_currency: Optional[str] = None


class LedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    description: str
    base_currency: str
    created_at: datetime


class AccountCreate(BaseModel):
    name: str
    type: str = "cash"
    icon: str = "wallet"
    initial_balance: float = 0.0
    is_default: bool = False
    currency: str = "CNY"
    ledger_id: int


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    icon: Optional[str] = None
    initial_balance: Optional[float] = None
    is_default: Optional[bool] = None
    currency: Optional[str] = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    icon: str
    initial_balance: float
    is_default: bool
    currency: str
    ledger_id: int
    created_at: datetime


class AccountWithBalance(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    icon: str
    initial_balance: float
    is_default: bool
    currency: str
    ledger_id: int
    balance: float
    converted_balance: Optional[float] = None
    created_at: datetime


class TransferCreate(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: float
    to_amount: Optional[float] = None
    exchange_rate: Optional[float] = None
    date: str
    note: str = ""
    ledger_id: int


class TransferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    from_account_id: int
    to_account_id: int
    amount: float
    to_amount: Optional[float] = None
    exchange_rate: Optional[float] = None
    date: str
    note: str
    ledger_id: int
    created_at: datetime


class TransferWithNames(BaseModel):
    id: int
    from_account_id: int
    to_account_id: int
    from_account_name: str
    to_account_name: str
    from_currency: str
    to_currency: str
    amount: float
    to_amount: Optional[float] = None
    exchange_rate: Optional[float] = None
    date: str
    note: str
    ledger_id: int
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
    model_config = ConfigDict(from_attributes=True)
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
    account_id: int
    date: str


class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    date: Optional[str] = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    amount: float
    type: str
    description: str
    category_id: int
    ledger_id: int
    account_id: int
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
    account_id: int
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
    account_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    next_date: Optional[str] = None
    day_of_month: Optional[int] = None
    day_of_week: Optional[int] = None
    is_active: Optional[int] = None


class RecurringRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    frequency: str
    amount: float
    type: str
    description: str
    category_id: int
    ledger_id: int
    account_id: int
    start_date: str
    end_date: str
    next_date: str
    day_of_month: Optional[int]
    day_of_week: Optional[int]
    is_active: int
    created_at: datetime


class RecurringLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rule_id: int
    transaction_id: Optional[int]
    generated_date: str
    status: str
    message: str
    created_at: datetime


class BudgetCreate(BaseModel):
    category_id: int
    ledger_id: int
    amount: float
    year: int
    month: int


class BudgetUpdate(BaseModel):
    amount: Optional[float] = None


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    ledger_id: int
    amount: float
    year: int
    month: int
    created_at: datetime


class BudgetProgressItem(BaseModel):
    budget_id: Optional[int]
    category_id: int
    category_name: str
    category_icon: str
    budget_amount: float
    spent: float
    remaining: Optional[float]
    remaining_ratio: Optional[float]
    is_overbudget: Optional[bool]
    has_budget: bool
    has_unconverted: bool = False
    unconverted_amounts: List["CurrencyAmount"] = []


class BudgetProgressSummary(BaseModel):
    year: int
    month: int
    total_budget: float
    total_spent: float
    total_remaining: float
    overbudget_count: int
    unbudgeted_spent: float
    items: List[BudgetProgressItem]
    base_currency: str
    conversion_status: str
    failed_currencies: List[str] = []


class GenerateResult(BaseModel):
    total_rules: int
    generated_count: int
    skipped_count: int
    details: List[str]


class BudgetSuggestionItem(BaseModel):
    category_id: int
    category_name: str
    category_icon: str
    suggested_amount: float
    months_available: int
    has_existing_budget: bool
    unconverted_amounts: List["CurrencyAmount"] = []


class BudgetSuggestionResponse(BaseModel):
    ledger_id: int
    year: int
    month: int
    total_months_analyzed: int
    warning: Optional[str] = None
    suggestions: List[BudgetSuggestionItem]
    base_currency: str
    conversion_status: str
    failed_currencies: List[str] = []


class BudgetBatchCreateItem(BaseModel):
    category_id: int
    amount: float


class BudgetBatchCreateRequest(BaseModel):
    ledger_id: int
    year: int
    month: int
    items: List[BudgetBatchCreateItem]


class BudgetBatchCreateResult(BaseModel):
    created_count: int
    skipped_count: int
    created: List[BudgetOut]
    skipped: List[int]


class ExchangeRateOut(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    date: str


class ExchangeRateConvertResult(BaseModel):
    from_currency: str
    to_currency: str
    original_amount: float
    converted_amount: float
    rate: float
    rate_date: str
    rate_source: str


class CurrencyAmount(BaseModel):
    currency: str
    amount: float


class CurrencyInfo(BaseModel):
    code: str
    name: str
    symbol: str


class BudgetAlertItem(BaseModel):
    category_id: int
    category_name: str
    category_icon: str
    budget_amount: float
    spent: float
    days_elapsed: int
    days_total: int
    current_rate: float
    ideal_rate: float
    ratio: float
    severity: str
    projected_overspend: float


class BudgetAlertsResponse(BaseModel):
    ledger_id: int
    year: int
    month: int
    base_currency: str
    conversion_status: str
    failed_currencies: List[str] = []
    severe_count: int
    warning_count: int
    alerts: List[BudgetAlertItem]


class BankRecord(BaseModel):
    row_index: int
    date: Optional[str] = None
    amount: float
    type: str
    description: str
    raw_data: Dict


class SystemTransactionShort(BaseModel):
    id: int
    amount: float
    date: str
    type: str
    description: str
    category_id: int
    account_id: int


class MatchedPair(BaseModel):
    match_type: str
    bank_record: BankRecord
    system_transaction: Optional[SystemTransactionShort] = None
    system_transactions: Optional[List[SystemTransactionShort]] = None
    score: float
    confidence: str
    confirmed: bool = True
    amount_diff: bool
    date_diff: Optional[int] = None
    split_count: Optional[int] = None
    total_system_amount: Optional[float] = None


class ReconciliationUploadResponse(BaseModel):
    encoding: str
    delimiter: str
    total_bank_records: int
    total_system_transactions: int
    matched_count: int
    unmatched_bank_count: int
    unmatched_system_count: int
    bank_records: List[BankRecord]
    matched_pairs: List[MatchedPair]
    unmatched_bank: List[BankRecord]
    unmatched_system: List[SystemTransactionShort]


class ReconciliationImportItem(BaseModel):
    date: str
    amount: float
    type: str
    description: str


class ReconciliationImportRequest(BaseModel):
    ledger_id: int
    account_id: int
    expense_category_id: Optional[int] = None
    income_category_id: Optional[int] = None
    records: List[ReconciliationImportItem]


class ReconciliationImportResult(BaseModel):
    imported_count: int
    skipped_count: int
    transactions: List[TransactionOut]


class MatchActionRequest(BaseModel):
    bank_row_index: int
    matched_pairs: List[MatchedPair]
    unmatched_bank: List[BankRecord]
    unmatched_system: List[SystemTransactionShort]


class MatchActionResponse(BaseModel):
    success: bool
    matched_count: int
    matched_pairs: List[MatchedPair]
    unmatched_bank: List[BankRecord]
    unmatched_system: List[SystemTransactionShort]
    error: Optional[str] = None


BudgetProgressItem.model_rebuild()
BudgetProgressSummary.model_rebuild()
BudgetSuggestionItem.model_rebuild()
BudgetSuggestionResponse.model_rebuild()
BankRecord.model_rebuild()
SystemTransactionShort.model_rebuild()
MatchedPair.model_rebuild()
ReconciliationUploadResponse.model_rebuild()
ReconciliationImportItem.model_rebuild()
ReconciliationImportRequest.model_rebuild()
ReconciliationImportResult.model_rebuild()
MatchActionRequest.model_rebuild()
MatchActionResponse.model_rebuild()
