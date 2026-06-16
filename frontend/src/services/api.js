const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

export const CURRENCY_SYMBOLS = {
  CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  HKD: 'HK$', KRW: '₩', SGD: 'S$', AUD: 'A$', CAD: 'C$',
};

export const CURRENCY_NAMES = {
  CNY: '人民币', USD: '美元', EUR: '欧元', GBP: '英镑', JPY: '日元',
  HKD: '港币', KRW: '韩元', SGD: '新加坡元', AUD: '澳元', CAD: '加元',
};

export const CURRENCY_OPTIONS = Object.keys(CURRENCY_NAMES).map((code) => ({
  label: `${CURRENCY_NAMES[code]} (${CURRENCY_SYMBOLS[code]})`,
  value: code,
}));

export function formatCurrency(amount, currency = 'CNY') {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym}${Number(amount).toFixed(2)}`;
}

export const ledgerApi = {
  list: () => request('/ledgers/'),
  get: (id) => request(`/ledgers/${id}`),
  create: (data) => request('/ledgers/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/ledgers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/ledgers/${id}`, { method: 'DELETE' }),
};

export const categoryApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/categories/${qs ? '?' + qs : ''}`);
  },
  create: (data) => request('/categories/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};

export const transactionApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/transactions/${qs ? '?' + qs : ''}`);
  },
  create: (data) => request('/transactions/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
};

export const statisticsApi = {
  monthly: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/statistics/monthly?${qs}`);
  },
  categories: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/statistics/categories?${qs}`);
  },
};

export const budgetApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/budgets/${qs ? '?' + qs : ''}`);
  },
  get: (id) => request(`/budgets/${id}`),
  create: (data) => request('/budgets/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/budgets/${id}`, { method: 'DELETE' }),
  progress: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/budgets/progress?${qs}`);
  },
  suggest: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/budgets/suggest?${qs}`);
  },
  alerts: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/budgets/alerts?${qs}`);
  },
  batchCreate: (data) => request('/budgets/batch', { method: 'POST', body: JSON.stringify(data) }),
};

export const recurringApi = {
  listRules: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/recurring/rules/${qs ? '?' + qs : ''}`);
  },
  getRule: (id) => request(`/recurring/rules/${id}`),
  createRule: (data) => request('/recurring/rules/', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id, data) => request(`/recurring/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRule: (id) => request(`/recurring/rules/${id}`, { method: 'DELETE' }),
  previewDates: (data) => request('/recurring/preview', { method: 'POST', body: JSON.stringify(data) }),
  previewRuleDates: (id, count = 5) => request(`/recurring/rules/${id}/preview?count=${count}`),
  listLogs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/recurring/logs/${qs ? '?' + qs : ''}`);
  },
  generate: () => request('/recurring/generate', { method: 'POST' }),
};

export const accountApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/accounts/${qs ? '?' + qs : ''}`);
  },
  get: (id) => request(`/accounts/${id}`),
  getBalance: (id) => request(`/accounts/${id}/balance`),
  create: (data) => request('/accounts/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),
};

export const transferApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
    return request(`/transfers/${qs ? '?' + qs : ''}`);
  },
  create: (data) => request('/transfers/', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/transfers/${id}`, { method: 'DELETE' }),
};

export const exchangeRateApi = {
  currencies: () => request('/exchange-rates/currencies'),
  latest: (base = 'CNY') => request(`/exchange-rates/latest?base=${base}`),
  pair: (from, to, date = null) => {
    const params = new URLSearchParams({ from, to });
    if (date) params.set('date', date);
    return request(`/exchange-rates/pair?${params.toString()}`);
  },
  convert: (from, to, amount, date = null) => {
    const params = new URLSearchParams({ from, to, amount: String(amount) });
    if (date) params.set('date', date);
    return request(`/exchange-rates/convert?${params.toString()}`);
  },
};

async function uploadRequest(url, formData) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

export const reconciliationApi = {
  upload: (file, ledgerId, startDate, endDate) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('ledger_id', String(ledgerId));
    if (startDate) formData.append('start_date', startDate);
    if (endDate) formData.append('end_date', endDate);
    return uploadRequest('/reconciliation/upload', formData);
  },
  import: (data) => request('/reconciliation/import', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  confirm: (data) => request('/reconciliation/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  reject: (data) => request('/reconciliation/reject', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};
