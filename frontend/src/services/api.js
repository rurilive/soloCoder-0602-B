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
