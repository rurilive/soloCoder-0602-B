from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict


class LedgerCreate(BaseModel):
    name: str
    type: str = "personal"
    description: str = ""
    base_currency: str = "CNY"
    cost_method: str = "fifo"


class LedgerUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    base_currency: Optional[str] = None
    cost_method: Optional[str] = None


class LedgerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: str
    description: str
    base_currency: str
    cost_method: str
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
    session_id: str
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
    session_id: str
    bank_row_index: int


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


class LoanCreate(BaseModel):
    name: str
    principal: float
    annual_rate: float
    term_months: int
    amortization_type: str
    start_date: str
    repayment_day: int
    ledger_id: int
    account_id: int
    category_id: int
    description: str = ""


class LoanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    principal: float
    annual_rate: float
    term_months: int
    amortization_type: str
    start_date: str
    repayment_day: int
    ledger_id: int
    account_id: int
    category_id: int
    status: str
    total_interest: float
    total_payment: float
    description: str
    created_at: datetime


class LoanWithSchedule(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    principal: float
    annual_rate: float
    term_months: int
    amortization_type: str
    start_date: str
    repayment_day: int
    ledger_id: int
    account_id: int
    category_id: int
    status: str
    total_interest: float
    total_payment: float
    description: str
    created_at: datetime
    schedule: List["LoanRepaymentScheduleOut"] = []


class LoanRepaymentScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    loan_id: int
    period_number: int
    due_date: str
    payment_amount: float
    principal_amount: float
    interest_amount: float
    remaining_principal: float
    status: str
    transaction_id: Optional[int] = None
    is_early_repayment: bool
    early_repayment_amount: float
    created_at: datetime


class EarlyRepaymentRequest(BaseModel):
    loan_id: int
    period_number: int
    amount: float
    repayment_type: str = "reduce_payment"


class EarlyRepaymentPreviewRequest(BaseModel):
    loan_id: int
    period_number: int
    amount: float
    repayment_type: str = "reduce_payment"


class EarlyRepaymentScheduleDiff(BaseModel):
    period_number: int
    due_date: str
    original_payment: float
    new_payment: float
    payment_diff: float
    original_principal: float
    new_principal: float
    original_interest: float
    new_interest: float
    original_remaining: float
    new_remaining: float


class EarlyRepaymentPreviewResponse(BaseModel):
    original_schedule: List[Dict]
    new_schedule: List[Dict]
    diff_schedule: List[EarlyRepaymentScheduleDiff]
    original_total_payment: float
    new_total_payment: float
    original_total_interest: float
    new_total_interest: float
    payment_saved: float
    interest_saved: float
    original_remaining_periods: int
    new_remaining_periods: int
    original_monthly_payment: float
    new_monthly_payment: float


class LoanRemainingPrincipalPoint(BaseModel):
    period_number: int
    due_date: str
    remaining_principal: float


class LoanGenerateTransactionRequest(BaseModel):
    schedule_id: int


class RateChangeItem(BaseModel):
    change_period: int
    new_annual_rate: float


class RateChangeSimulationRequest(BaseModel):
    loan_id: int
    rate_changes: List[RateChangeItem]


class RateChangeScheduleDiff(BaseModel):
    period_number: int
    due_date: str
    original_rate: float
    new_rate: float
    rate_changed: bool
    rate_change_index: Optional[int] = None
    original_payment: float
    new_payment: float
    payment_diff: float
    original_principal: float
    new_principal: float
    original_interest: float
    new_interest: float
    interest_diff: float
    original_remaining: float
    new_remaining: float


class RateChangeSimulationResponse(BaseModel):
    original_schedule: List[Dict]
    new_schedule: List[Dict]
    diff_schedule: List[RateChangeScheduleDiff]
    original_total_payment: float
    new_total_payment: float
    original_total_interest: float
    new_total_interest: float
    total_payment_diff: float
    total_interest_diff: float
    original_total_periods: int
    new_total_periods: float
    rate_change_colors: List[str]


LoanWithSchedule.model_rebuild()


class HealthScoreDimension(BaseModel):
    key: str
    name: str
    score: float
    weight: float
    max_score: float
    description: str
    suggestions: List[str]


class FinancialHealthScore(BaseModel):
    ledger_id: int
    total_score: float
    level: str
    level_description: str
    level_color: str
    dimensions: List[HealthScoreDimension]
    overall_suggestions: List[str]
    months_analyzed: int


class MonthlyCashFlowPoint(BaseModel):
    year: int
    month: int
    label: str
    income: float
    expense: float
    net_cash_flow: float
    is_actual: bool
    income_lower: Optional[float] = None
    income_upper: Optional[float] = None
    expense_lower: Optional[float] = None
    expense_upper: Optional[float] = None
    net_lower: Optional[float] = None
    net_upper: Optional[float] = None
    confidence_level: Optional[float] = None


class AnomalyTransactionItem(BaseModel):
    transaction_id: int
    date: str
    description: str
    amount: float
    type: str
    category_name: str
    anomaly_types: List[str]
    amount_score: float = 0.0
    frequency_score: float = 0.0
    time_score: float = 0.0
    total_score: float


class AnomalyDetectionResponse(BaseModel):
    ledger_id: int
    total_transactions: int
    anomaly_count: int
    amount_anomaly_count: int
    frequency_anomaly_count: int
    time_anomaly_count: int
    anomalies: List[AnomalyTransactionItem]


class CashFlowPredictionWarning(BaseModel):
    has_warning: bool
    consecutive_negative_months: int
    first_negative_month: Optional[str] = None
    last_negative_month: Optional[str] = None
    suggestions: List[str]


class CashFlowPredictionResponse(BaseModel):
    ledger_id: int
    base_currency: str
    historical_months: int
    predicted_months: int
    historical_data: List[MonthlyCashFlowPoint]
    predicted_data: List[MonthlyCashFlowPoint]
    combined_data: List[MonthlyCashFlowPoint]
    warning: CashFlowPredictionWarning
    model_description: str


class InvestmentSecurityCreate(BaseModel):
    symbol: str
    name: str
    type: str = "stock"
    currency: str = "CNY"
    current_price: float = 0.0
    ledger_id: int


class InvestmentSecurityUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    currency: Optional[str] = None
    current_price: Optional[float] = None


class InvestmentSecurityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    symbol: str
    name: str
    type: str
    currency: str
    current_price: float
    ledger_id: int
    created_at: datetime


class InvestmentTransactionCreate(BaseModel):
    security_id: int
    type: str
    quantity: float = 0.0
    price: float = 0.0
    fee: float = 0.0
    date: str
    split_ratio: Optional[float] = None
    dividend_amount: Optional[float] = None
    reinvest: bool = False
    description: str = ""
    ledger_id: int
    account_id: int


class InvestmentTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    security_id: int
    type: str
    quantity: float
    price: float
    amount: float
    fee: float
    date: str
    split_ratio: Optional[float] = None
    dividend_amount: Optional[float] = None
    reinvest: bool
    realized_gain: float
    raw_short_gain: float = 0.0
    raw_long_gain: float = 0.0
    taxable_gain_short: float = 0.0
    taxable_gain_long: float = 0.0
    tax_amount_capital: float = 0.0
    dividend_tax: float = 0.0
    dividend_after_tax: Optional[float] = None
    description: str
    ledger_id: int
    account_id: int
    linked_transaction_id: Optional[int] = None
    created_at: datetime


class InvestmentLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    security_id: int
    buy_transaction_id: int
    quantity_remaining: float
    cost_basis_per_share: float
    original_quantity: float
    buy_date: str
    is_closed: bool
    ledger_id: int
    created_at: datetime


class HoldingItem(BaseModel):
    security_id: int
    symbol: str
    name: str
    type: str
    currency: str
    quantity: float
    cost_basis: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_gain: float
    unrealized_gain_pct: float
    realized_gain: float
    dividends_received: float
    lots: List[InvestmentLotOut]
    transactions: List[InvestmentTransactionOut]
    converted_market_value: Optional[float] = None
    converted_cost_basis: Optional[float] = None
    converted_unrealized_gain: Optional[float] = None


class PortfolioSummary(BaseModel):
    ledger_id: int
    base_currency: str
    cost_method: str
    total_market_value: float
    total_cost_basis: float
    total_unrealized_gain: float
    total_unrealized_gain_pct: float
    total_realized_gain: float
    total_dividends: float
    holdings: List[HoldingItem]


class PortfolioHistoryPoint(BaseModel):
    date: str
    total_value: float
    by_security: Dict[str, float]


class PortfolioHistoryResponse(BaseModel):
    ledger_id: int
    base_currency: str
    points: List[PortfolioHistoryPoint]


class TaxLotSaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sell_transaction_id: int
    lot_id: int
    security_id: int
    quantity_sold: float
    cost_basis_per_share: float
    cost_sold: float
    proceeds_per_share: float
    proceeds_sold: float
    gain: float
    holding_days: int
    gain_type: str
    buy_date: str
    sell_date: str
    ledger_id: int
    created_at: datetime


class TaxDetailLotItem(BaseModel):
    lot_id: int
    buy_date: str
    sell_date: str
    holding_days: int
    gain_type: str
    quantity_sold: float
    cost_sold: float
    proceeds_sold: float
    gain: float


class TaxDetailItem(BaseModel):
    transaction_id: int
    date: str
    security_id: int
    symbol: str
    name: str
    sell_quantity: float
    sell_price: float
    proceeds: float
    total_cost: float
    realized_gain: float
    taxable_gain_short: float
    taxable_gain_long: float
    tax_amount: float
    lots: List[TaxDetailLotItem]


class MonthlyTaxCalendarItem(BaseModel):
    year: int
    month: int
    short_gain: float
    long_gain: float
    dividend_income: float
    dividend_tax: float
    capital_tax: float
    total_tax: float


class TaxSummaryResponse(BaseModel):
    ledger_id: int
    year: int
    short_gain_total: float
    short_cost_total: float
    short_proceeds_total: float
    short_tax: float
    long_gain_total: float
    long_cost_total: float
    long_proceeds_total: float
    long_tax: float
    dividend_income_total: float
    dividend_tax_total: float
    total_capital_tax: float
    total_tax: float
    effective_tax_rate: float
    monthly_calendar: List[MonthlyTaxCalendarItem]


class TaxDetailsResponse(BaseModel):
    ledger_id: int
    year: int
    details: List[TaxDetailItem]
