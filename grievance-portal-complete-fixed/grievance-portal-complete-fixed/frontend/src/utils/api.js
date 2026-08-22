import axios from 'axios';
import toast from 'react-hot-toast';

const getBaseURL = () => {
  const envApiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envApiUrl) {
    return envApiUrl.endsWith('/api') ? envApiUrl : `${envApiUrl}/api`;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalhost) {
      return `${window.location.origin}/api`;
    }
  }
  return 'http://127.0.0.1:8000/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Sanitize string fields against XSS
    if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
      config.data = sanitizeObject(config.data);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const authModule = await import('../store/authStore');
        const authStore = authModule.default || authModule.useAuthStore;
        
        if (authStore?.getState) {
          const refreshToken = authStore.getState().refreshToken;
          if (refreshToken) {
            const refreshed = await authStore.getState().refreshAccessToken();
            if (refreshed) {
              originalRequest.headers['Authorization'] = api.defaults.headers.common['Authorization'];
              return api(originalRequest);
            }
          }
          // If no refreshToken or refresh failed, cleanly log out
          console.warn('⚠️ Authentication session invalid (401). Clearing stored auth.');
          authStore.getState().logout();
        }
      } catch (refreshErr) {
        console.error('❌ Token refresh threw error. Logging out...', refreshErr?.message);
        try {
          const authModule = await import('../store/authStore');
          const authStore = authModule.default || authModule.useAuthStore;
          if (authStore?.getState) authStore.getState().logout();
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('role');
          localStorage.removeItem('grievance-auth');
          delete api.defaults.headers.common['Authorization'];
        }
      }
    }

    const message = error.response?.data?.message || error.message || 'Something went wrong';

    // Don't toast for certain routes or when explicitly silenced
    const silentRoutes = ['/auth/login', '/auth/register'];
    const isSilent = silentRoutes.some((r) => error.config?.url?.includes(r)) || error.config?.silent;

    // Suppress FAILED_PRECONDITION errors related to missing Firestore indexes
    const isIndexError = message.includes('FAILED_PRECONDITION') && message.includes('index');

    if (!isSilent && error.response?.status !== 401 && !isIndexError) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

// XSS sanitization helper
const sanitizeObject = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  const sanitized = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      sanitized[key] = obj[key].replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '');
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitizeObject(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
};

export default api;
