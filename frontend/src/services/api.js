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
    const qs = new URLSearchParams(params).toString();
    return request(`/statistics/monthly?${qs}`);
  },
  categories: (params) => {
    const qs = new URLSearchParams(params).toString();
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
