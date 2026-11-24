import { ref, computed } from 'vue'
import { api, API_BASE_URL } from '@/api/client'

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

// Initialize from localStorage
try {
  const savedToken = localStorage.getItem('token')
  const savedUser = localStorage.getItem('user')
  if (savedToken) {
    token.value = savedToken
  }
  if (savedUser) {
    user.value = JSON.parse(savedUser)
  }
} catch (e) {
  console.error('Error reading auth from localStorage:', e)
}

// Listen for 401 expiration
if (typeof window !== 'undefined') {
  window.addEventListener('auth:expired', () => {
    user.value = null
    token.value = null
  })
}

export function useAuth() {
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'ADMIN')
  const isPro = computed(() => user.value?.role === 'USER_PRO' || user.value?.role === 'ADMIN')
  const isLite = computed(() => user.value?.role === 'USER_LITE')
  const hasSearchAccess = computed(
    () => user.value?.role === 'USER_LITE' || user.value?.role === 'USER_PRO' || user.value?.role === 'ADMIN'
  )

  const setAuthData = (newToken: string, newUser: User) => {
    token.value = newToken
    user.value = newUser
    localStorage.setItem('token', newToken)
    localStorage.setItem('user', JSON.stringify(newUser))
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
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

  return {
    user,
    token,
    isLoading,
    isAuthModalOpen,
    isAuthenticated,
    isAdmin,
    isPro,
    isLite,
    hasSearchAccess,
    setAuthData,
    logout,
    fetchMe,
    loginWithGoogle,
    devLogin,
  }
}
