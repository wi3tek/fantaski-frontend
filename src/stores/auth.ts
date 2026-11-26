import { ref, computed } from 'vue'
import { api, clearApiCache } from '@/api/client'

export interface User {
  id: string
  email: string
  name: string
  picture?: string
  role: 'USER' | 'USER_LITE' | 'USER_PRO' | 'ADMIN'
  is_active?: boolean
  created_at?: string
  last_login?: string
}

// Reactive singleton state
const user = ref<User | null>(null)
const token = ref<string | null>(null)
const isLoading = ref<boolean>(false)
const isAuthModalOpen = ref<boolean>(false)
const sessionExpiredReason = ref<'expired' | null>(null)

let expiryTimer: ReturnType<typeof setTimeout> | null = null

const clearExpiryTimer = () => {
  if (expiryTimer) {
    clearTimeout(expiryTimer)
    expiryTimer = null
  }
}

export const parseJwtExpiryMs = (jwtToken: string): number | null => {
  try {
    const parts = jwtToken.split('.')
    if (parts.length < 2 || !parts[1]) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(atob(padded))
    return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

const isTokenExpired = (jwtToken: string | null = token.value): boolean => {
  if (!jwtToken) return false
  const expMs = parseJwtExpiryMs(jwtToken)
  if (!expMs) return false
  return expMs <= Date.now()
}

const expireSession = () => {
  const hadSession = !!token.value || !!user.value
  clearExpiryTimer()
  token.value = null
  user.value = null
  sessionExpiredReason.value = 'expired'
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    clearApiCache()
    if (hadSession) {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
  }
}

const scheduleExpiryCheck = () => {
  clearExpiryTimer()
  if (typeof window === 'undefined' || !token.value) return
  const expMs = parseJwtExpiryMs(token.value)
  if (!expMs) return
  const remaining = expMs - Date.now()
  if (remaining <= 0) {
    expireSession()
    return
  }
  // JS setTimeout max ~24.8 dni; przy dłuższym TTL przeplanowuje się bezpiecznie
  const delay = Math.min(remaining, 2_000_000_000)
  expiryTimer = setTimeout(() => {
    if (isTokenExpired(token.value)) {
      expireSession()
    } else {
      scheduleExpiryCheck()
    }
  }, delay)
}

// Initialize from localStorage
try {
  const savedToken = localStorage.getItem('token')
  const savedUser = localStorage.getItem('user')
  if (savedToken) {
    if (isTokenExpired(savedToken)) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionExpiredReason.value = 'expired'
    } else {
      token.value = savedToken
      if (savedUser) {
        user.value = JSON.parse(savedUser)
      }
      scheduleExpiryCheck()
    }
  }
} catch (e) {
  console.error('Error reading auth from localStorage:', e)
}

// Listen for 401 expiration and tab focus/visibility return
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    clearExpiryTimer()
    user.value = null
    token.value = null
    sessionExpiredReason.value = 'expired'
    clearApiCache()
  })

  const checkOnReturn = () => {
    if (token.value && isTokenExpired(token.value)) {
      expireSession()
    }
  }
  window.addEventListener('focus', checkOnReturn)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOnReturn()
  })
}

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  const isPro = computed(() => user.value?.role === 'USER_PRO' || user.value?.role === 'ADMIN')

  const clearExpiredReason = () => {
    sessionExpiredReason.value = null
  }

  const setAuthData = (newToken: string, newUser: User) => {
    sessionExpiredReason.value = null
    token.value = newToken
    user.value = newUser
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
    scheduleExpiryCheck()
  }

  const logout = () => {
    clearExpiryTimer()
    sessionExpiredReason.value = null
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    clearApiCache()
  }

  const fetchMe = async () => {
    if (!token.value) return null
    try {
      const userData = await api.get<User>('/auth/me')
      user.value = userData
      localStorage.setItem('user', JSON.stringify(userData))
      return userData
    } catch (e) {
      console.warn('Failed to refresh user profile:', e)
      logout()
      return null
    }
  }

  const loginWithGoogle = async (idToken: string) => {
    isLoading.value = true
    try {
      const data = await api.post<{ access_token: string; user: User }>('/auth/google', {
        id_token: idToken,
      })
      setAuthData(data.access_token, data.user)
      isAuthModalOpen.value = false
      return data.user
    } finally {
      isLoading.value = false
    }
  }

  const devLogin = async (email: string, name?: string) => {
    isLoading.value = true
    try {
      const data = await api.post<{ access_token: string; user: User }>('/auth/dev-login', {
        email,
        name,
      })
      setAuthData(data.access_token, data.user)
      isAuthModalOpen.value = false
      return data.user
    } finally {
      isLoading.value = false
    }
  }

  const updateProfile = async (payload: { name?: string; picture?: string }) => {
    isLoading.value = true
    try {
      const data = await api.put<{ access_token?: string; user: User }>('/auth/me', payload)
      if (data?.access_token && data?.user) {
        setAuthData(data.access_token, data.user)
      } else if (data?.user) {
        user.value = data.user
        localStorage.setItem('user', JSON.stringify(data.user))
      }
      return data?.user || user.value
    } finally {
      isLoading.value = false
    }
  }

  return {
    user,
    token,
    isLoading,
    isAuthModalOpen,
    sessionExpiredReason,
    isAuthenticated,
    isAdmin,
    isPro,
    isTokenExpired,
    expireSession,
    clearExpiredReason,
    setAuthData,
    logout,
    fetchMe,
    loginWithGoogle,
    devLogin,
    updateProfile,
  }
}
