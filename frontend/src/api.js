import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!config.headers['X-Request-ID']) {
    config.headers['X-Request-ID'] = generateRequestId();
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  deleteTenant: () => api.delete('/auth/me'),
};

export const projectAPI = {
  list: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
};

export const taskAPI = {
  list: (projectId) => api.get(`/projects/${projectId}/tasks`),
  get: (projectId, taskId) => api.get(`/projects/${projectId}/tasks/${taskId}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data),
  update: (projectId, taskId, data) => api.put(`/projects/${projectId}/tasks/${taskId}`, data),
  reorder: (projectId, taskId, data) => api.put(`/projects/${projectId}/tasks/${taskId}/reorder`, data),
  delete: (projectId, taskId) => api.delete(`/projects/${projectId}/tasks/${taskId}`),
  bulkMove: (projectId, data) => api.post(`/projects/${projectId}/tasks/bulk/move`, data),
  bulkDelete: (projectId, data) => api.post(`/projects/${projectId}/tasks/bulk/delete`, data),
};

export const customFieldAPI = {
  list: (projectId) => api.get(`/projects/${projectId}/custom-fields`),
  get: (projectId, fieldId) => api.get(`/projects/${projectId}/custom-fields/${fieldId}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/custom-fields`, data),
  update: (projectId, fieldId, data) => api.put(`/projects/${projectId}/custom-fields/${fieldId}`, data),
  delete: (projectId, fieldId) => api.delete(`/projects/${projectId}/custom-fields/${fieldId}`),
};

export const notificationAPI = {
  list: (params = {}) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  get: (id) => api.get(`/notifications/${id}`),
  markRead: (id, read = true) => api.put(`/notifications/${id}/read`, { read }),
  markAllRead: () => api.put('/notifications/read-all'),
};

export default api;
