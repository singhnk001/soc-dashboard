/**
 * src/services/api-client.ts
 * Standardized HTTP client with type-safe methods, error normalization, and URL query builder.
 */

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, any>;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...customConfig } = options;
  
  let url = endpoint;
  if (params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    });
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...customConfig,
  };

  try {
    const response = await fetch(url, config);
    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      const message = typeof errorData === 'object' && errorData?.detail
        ? errorData.detail
        : `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, errorData);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error or host unreachable',
      0
    );
  }
}

export const apiClient = {
  get: <T>(url: string, params?: Record<string, any>, config?: RequestInit) =>
    request<T>(url, { method: 'GET', params, ...config }),
    
  post: <T>(url: string, body?: any, config?: RequestInit) =>
    request<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...config,
    }),
    
  patch: <T>(url: string, body?: any, config?: RequestInit) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body), ...config }),
    
  put: <T>(url: string, body?: any, config?: RequestInit) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body), ...config }),
    
  delete: <T>(url: string, config?: RequestInit) =>
    request<T>(url, { method: 'DELETE', ...config }),
};
