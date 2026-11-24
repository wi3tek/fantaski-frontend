// Centralized API Client with JWT Bearer Token Injection & In-Memory TTL Caching

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// Lightweight in-memory cache for static dictionary endpoints
interface CacheEntry {
  data: any
  expiry: number
}

const memoryCache = new Map<string, CacheEntry>()

export const clearApiCache = (prefix?: string) => {
  if (!prefix) {
    memoryCache.clear()
    return
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(prefix)) {
      memoryCache.delete(key)
    }
  }
}

export interface ApiFetchOptions extends RequestInit {
  cacheTtlMs?: number // e.g. 60000 for 1 minute cache
}

export async function apiFetch<T = any>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
  const method = (options.method || 'GET').toUpperCase()

  // Check cache for GET requests
  if (method === 'GET' && options.cacheTtlMs && options.cacheTtlMs > 0) {
    const cached = memoryCache.get(url)
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T
    }
  }

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  // Inject JWT Bearer token
  const token = localStorage.getItem('token')
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    // Token expired or invalid
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.dispatchEvent(new CustomEvent('auth:expired'))
  }

  if (!response.ok) {
    let errorDetail = `Błąd serwera (${response.status})`
    try {
      const errJson = await response.json()
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson)
    } catch {
      // not JSON
    }
    const err = new Error(errorDetail) as any
    err.status = response.status
    throw err
  }

  const data = await response.json()

  // Save to cache if requested
  if (method === 'GET' && options.cacheTtlMs && options.cacheTtlMs > 0) {
    memoryCache.set(url, {
      data,
      expiry: Date.now() + options.cacheTtlMs,
    })
  }

  return data as T
}

export const api = {
  get: <T = any>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'GET' }),
  post: <T = any>(endpoint: string, body?: any, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T = any>(endpoint: string, body?: any, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T = any>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: 'DELETE' }),
}
