// src/services/api.js
// API 服務
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 自動附加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 處理 Token 過期
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  refresh: (refreshToken) => api.post('/api/auth/refresh', { refreshToken }),
};

// User API
export const userAPI = {
  getMe: () => api.get('/api/users/me'),
  updateMe: (data) => api.put('/api/users/me', data),
  getUser: (id) => api.get(`/api/users/${id}`),
};

// Matching API
export const matchingAPI = {
  getSuggestions: () => api.get('/api/matching/suggestions'),
  like: (userId) => api.post(`/api/matching/like/${userId}`),
  skip: (userId) => api.post(`/api/matching/skip/${userId}`),
  getMatches: () => api.get('/api/matching/matches'),
};

// Messages API
export const messagesAPI = {
  getMessages: (matchId) => api.get(`/api/messages/${matchId}`),
  sendMessage: (matchId, text) => api.post(`/api/messages/${matchId}`, { text }),
};

// Agora API
export const agoraAPI = {
  getToken: (channelName) => api.post('/api/agora/token', { channelName }),
  getConfig: () => api.get('/api/agora/config'),
};

export default api;
