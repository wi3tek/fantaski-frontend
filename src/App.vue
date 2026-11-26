<script setup lang="ts">
import { RouterLink, RouterView, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useAuth } from '@/stores/auth'
import { useNotice } from '@/stores/notice'
import { useNotifications } from '@/stores/notifications'
import { api, clearApiCache } from '@/api/client'

const auth = useAuth()
const notice = useNotice()
const router = useRouter()
const {
  unreadCount,
  unreadNotifications,
  activeToast,
  dismissToast,
  fetchNotifications,
  startEventStream,
  stopEventStream,
  markAsRead,
  markAllAsRead,
} = useNotifications()
const envName = (import.meta.env.VITE_ENV_NAME || (import.meta.env.MODE === 'test' ? 'TEST' : '')).toUpperCase()
const showDevLogin = import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true'

const isMenuOpen = ref<boolean>(false)
const isStatsDropdownOpen = ref<boolean>(false)
const isUserDropdownOpen = ref<boolean>(false)
const isNotifDropdownOpen = ref<boolean>(false)
const deferredInstallPrompt = ref<any>(null)
const isAppInstalled = ref<boolean>(false)
const showInstallGuideModal = ref<boolean>(false)
const isIosDevice = ref<boolean>(false)
const showSupportModal = ref<boolean>(false)
const supportContext = ref<string>('')
const supportMessageText = ref<string>('')
const isSendingSupport = ref<boolean>(false)
const supportSendError = ref<string>('')
const supportSendSuccess = ref<boolean>(false)
let notifPollTimer: any = null
const devEmail = ref<string>('')
const devName = ref<string>('')
const devError = ref<string>('')

const getRoleBadgeLabel = (role?: string) => {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'USER_PRO') return 'PRO'
  return 'FREE'
}

const getRoleFullLabel = (role?: string) => {
  if (role === 'ADMIN') return 'Administrator'
  if (role === 'USER_PRO') return 'FantaSKI PRO'
  return 'Konto darmowe'
}

// Zamykanie dropdownów po kliknięciu gdziekolwiek indziej na ekranie
const closeDropdown = (e: Event) => {
  const target = e.target as HTMLElement
  if (!target.closest('.dropdown-container')) {
    isStatsDropdownOpen.value = false
  }
  if (!target.closest('.user-menu-container')) {
    isUserDropdownOpen.value = false
  }
  if (!target.closest('.notif-menu-container')) {
    isNotifDropdownOpen.value = false
  }
}

const closeNavigation = () => {
  isMenuOpen.value = false
  isStatsDropdownOpen.value = false
  isUserDropdownOpen.value = false
  isNotifDropdownOpen.value = false
}

const openNotification = async (notif: any) => {
  dismissToast()
  await markAsRead(notif.id)
  closeNavigation()
  router.push(notif.link || '/draft')
}

watch(isMenuOpen, (open) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

const isProtectedRoute = (r: RouteLocationNormalizedLoaded) =>
  Boolean(r.meta?.requiresAuth || r.meta?.requiresSearch || r.meta?.requiresPro || r.meta?.requiresAdmin)

const handleAutoExpiredRedirect = () => {
  closeNavigation()
  auth.isAuthModalOpen.value = false
  notice.closeNotice()
  stopEventStream()
  clearApiCache()

  const cur = router.currentRoute.value
  if (cur.path !== '/login') {
    const query: Record<string, string> = { expired: '1' }
    if (isProtectedRoute(cur)) {
      query.redirect = cur.fullPath
    }
    router.replace({ path: '/login', query })
  }
}

watch(
  [() => auth.isAuthenticated.value, () => router.currentRoute.value.fullPath],
  ([isAuth]) => {
    const cur = router.currentRoute.value
    if (!isAuth && isProtectedRoute(cur)) {
      closeNavigation()
      if (auth.sessionExpiredReason.value === 'expired') {
        router.replace({ path: '/login', query: { expired: '1', redirect: cur.fullPath } })
      } else {
        router.replace('/')
      }
    }
  }
)

const handleLogout = () => {
  auth.logout()
  stopEventStream()
  notice.closeNotice()
  closeNavigation()
  router.replace('/')
}

const detectStandaloneMode = () => {
  if (typeof window === 'undefined') return false
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any)?.standalone === true,
  )
}

const handleBeforeInstallPrompt = (e: Event) => {
  e.preventDefault()
  deferredInstallPrompt.value = e
}

const handleAppInstalled = () => {
  deferredInstallPrompt.value = null
  isAppInstalled.value = true
  showInstallGuideModal.value = false
}

const triggerPwaInstall = async () => {
  if (deferredInstallPrompt.value) {
    try {
      await deferredInstallPrompt.value.prompt()
      const choice = await deferredInstallPrompt.value.userChoice
      if (choice?.outcome === 'accepted') {
        isAppInstalled.value = true
      }
      deferredInstallPrompt.value = null
    } catch {
      showInstallGuideModal.value = true
    }
    closeNavigation()
    return
  }
  closeNavigation()
  showInstallGuideModal.value = true
}

const openSupportComposer = (contextTitle?: string) => {
  notice.closeNotice()
  if (!auth.isAuthenticated.value) {
    auth.isAuthModalOpen.value = true
    return
  }
  supportContext.value = contextTitle ? `Dotyczy: ${contextTitle}` : ''
  supportMessageText.value = ''
  supportSendError.value = ''
  supportSendSuccess.value = false
  showSupportModal.value = true
}

const submitSupportMessage = async () => {
  const clean = supportMessageText.value.trim()
  if (!clean) {
    supportSendError.value = 'Wpisz treść wiadomości przed wysłaniem.'
    return
  }
  isSendingSupport.value = true
  supportSendError.value = ''
  try {
    await api.post('/support/messages', {
      message: clean,
      context: supportContext.value || undefined,
    })
    supportSendSuccess.value = true
    supportMessageText.value = ''
  } catch (e: any) {
    supportSendError.value = e?.message || 'Nie udało się wysłać wiadomości.'
  } finally {
    isSendingSupport.value = false
  }
}

// Inicjalizacja Google One Tap / Button
const initGoogleSignIn = () => {
  if (typeof window === 'undefined') return
  const google = (window as any).google
  if (!google?.accounts?.id) return

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    console.error('BŁĄD: Brak zmiennej VITE_GOOGLE_CLIENT_ID w pliku .env frontendu! Zrestartuj "npm run dev".')
    return
  }

  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        if (response?.credential) {
          try {
            await auth.loginWithGoogle(response.credential)
          } catch (err: any) {
            alert('Błąd logowania przez Google: ' + (err.message || 'Nieznany błąd'))
          }
        }
      },
    })

    const btnEl = document.getElementById('google-btn-container')
    if (btnEl) {
      google.accounts.id.renderButton(btnEl, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280,
      })
    }
  } catch (e) {
    console.warn('Google GSI initialization notice:', e)
  }
}

watch(
  () => auth.isAuthModalOpen.value,
  (open) => {
    if (open) {
      setTimeout(initGoogleSignIn, 150)
    }
  }
)

const handleDevLogin = async () => {
  devError.value = ''
  try {
    await auth.devLogin(devEmail.value, devName.value)
  } catch (e: any) {
    devError.value = e.message || 'Błąd logowania testowego'
  }
}

watch(
  () => auth.isAuthenticated.value,
  (isAuth) => {
    if (isAuth) {
      fetchNotifications()
      startEventStream()
    } else {
      stopEventStream()
    }
  }
)

onMounted(async () => {
  document.addEventListener('click', closeDropdown)
  window.addEventListener('auth:expired', handleAutoExpiredRedirect)
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  isAppInstalled.value = detectStandaloneMode()
  isIosDevice.value = /iphone|ipad|ipod/i.test(navigator.userAgent || '')
  if (auth.sessionExpiredReason.value === 'expired' && isProtectedRoute(router.currentRoute.value)) {
    handleAutoExpiredRedirect()
    return
  }
  if (auth.token.value) {
    await auth.fetchMe()
    if (auth.isAuthenticated.value) {
      await fetchNotifications()
      startEventStream()
    }
  }
  notifPollTimer = setInterval(() => {
    if (auth.isAuthenticated.value) {
      fetchNotifications()
    }
  }, 45000)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
  window.removeEventListener('auth:expired', handleAutoExpiredRedirect)
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)
  stopEventStream()
  if (notifPollTimer) clearInterval(notifPollTimer)
})
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-container">
        <RouterLink :to="auth.isAuthenticated.value ? '/dashboard' : '/'" @click="closeNavigation" class="brand-link">
          <div class="logo">
            <img src="/logo.png" alt="FantaSKI Logo" class="brand-logo-img" />
            <span class="logo-text">Fanta<strong>SKI</strong></span>
            <span v-if="envName === 'TEST'" class="env-pill-test" title="Aktywne środowisko testowe (baza: FIS_DATA_DB_TEST)">TEST</span>
          </div>
        </RouterLink>

        <nav class="nav-links" :class="{ open: isMenuOpen }">
          <div class="drawer-header-mobile">
            <div class="drawer-logo">
              <img src="/logo.png" alt="FantaSKI" class="drawer-logo-img" />
              <span>Fanta<strong>SKI</strong></span>
            </div>
            <button class="drawer-close-btn" @click="closeNavigation" aria-label="Zamknij menu">&times;</button>
          </div>

          <div v-if="auth.isAuthenticated.value" class="drawer-user-card-mobile">
            <img
              v-if="auth.user.value?.picture"
              :src="auth.user.value.picture"
              class="user-avatar"
              alt="Avatar"
            />
            <span v-else class="user-avatar-fallback">👤</span>
            <div class="drawer-user-meta">
              <div class="drawer-user-name">{{ auth.user.value?.name }}</div>
              <div class="drawer-user-plan">Plan: <strong>{{ getRoleBadgeLabel(auth.user.value?.role) }}</strong></div>
            </div>
          </div>
          <div v-else class="drawer-guest-card-mobile">
            <button class="drawer-login-btn" @click="auth.isAuthModalOpen.value = true; closeNavigation()">
              🚀 Zaloguj się na konto
            </button>
          </div>

          <RouterLink v-if="auth.isAuthenticated.value" to="/dashboard" @click="closeNavigation">
            🏠 Pulpit
          </RouterLink>

          <div class="drawer-section-label">Bazy Danych</div>
          <RouterLink to="/athletes" @click="closeNavigation">🎿 Baza skoczków</RouterLink>
          <RouterLink to="/sessions" @click="closeNavigation">📅 Baza sesji</RouterLink>
          <RouterLink to="/hills" @click="closeNavigation">🏔️ Baza skoczni</RouterLink>

          <div class="drawer-section-label">Zawody &amp; Wyniki</div>
          <RouterLink to="/standings" @click="closeNavigation" title="Oficjalne klasyfikacje FIS">
            🏆 Klasyfikacje
          </RouterLink>

          <div class="drawer-section-label">Analityka &amp; Narzędzia</div>
          <div class="dropdown-container">
            <button
              class="dropdown-btn"
              @click.stop="isStatsDropdownOpen = !isStatsDropdownOpen"
              :class="{ 'nav-locked': !auth.isAuthenticated.value }"
            >
              Narzędzia
              <span v-if="!auth.isAuthenticated.value" class="lock-icon">🔒</span>
              <span class="arrow" :class="{ up: isStatsDropdownOpen }">▼</span>
            </button>
            <div class="dropdown-menu" v-if="isStatsDropdownOpen || isMenuOpen">
              <RouterLink
                to="/stats"
                @click="closeNavigation"
                :class="{ 'nav-locked': !auth.isAuthenticated.value }"
                :title="!auth.isAuthenticated.value ? '🔒 Dostępne po darmowym zalogowaniu' : 'Porównywarka zawodników'"
              >
                ⚖️ Porównywarka
                <span v-if="!auth.isAuthenticated.value" class="lock-icon">🔒</span>
              </RouterLink>
              <RouterLink
                to="/draft"
                @click="closeNavigation"
                :class="{ 'nav-locked': !auth.isAuthenticated.value }"
                :title="!auth.isAuthenticated.value ? '🔒 Dostępne po darmowym zalogowaniu' : 'Ligi Drafta Fantasy'"
              >
                ⚡ Draft
                <span v-if="!auth.isAuthenticated.value" class="lock-icon">🔒</span>
              </RouterLink>
              <RouterLink
                to="/predictions"
                @click="closeNavigation"
                :class="{ 'nav-locked': !auth.isPro.value }"
                :title="!auth.isPro.value ? '🔒 Dostępne wyłącznie w pakiecie PRO' : 'Prognozy'"
              >
                🔮 Prognozy
                <span v-if="!auth.isPro.value" class="lock-icon">🔒</span>
                <span class="badge-pro-mini">PRO</span>
              </RouterLink>
            </div>
          </div>

          <!-- Widoczne tylko dla ADMINA -->
          <template v-if="auth.isAdmin.value">
            <div class="drawer-section-label">Administracja</div>
            <RouterLink to="/admin" class="admin-link" @click="closeNavigation">
              ⚙️ Panel Administratora
            </RouterLink>
          </template>

          <!-- Użytkownik zalogowany (widok mobilny wewnątrz szuflady) -->
          <div v-if="auth.isAuthenticated.value" class="mobile-only-account">
            <div class="drawer-section-label">Konto</div>
            <RouterLink to="/profile" @click="closeNavigation">
              👤 Mój profil
            </RouterLink>
            <button class="logout-menu-btn" @click="handleLogout">
              🚪 Wyloguj się
            </button>
          </div>

          <div v-if="!isAppInstalled" class="pwa-install-drawer-wrap">
            <div class="drawer-section-label">Aplikacja na telefon</div>
            <button type="button" class="pwa-install-drawer-btn" @click="triggerPwaInstall">
              📲 Zainstaluj na ekranie głównym
            </button>
          </div>
        </nav>

        <!-- Stały pasek po prawej stronie nagłówka: Profil / Logowanie (desktop) + dzwoneczek powiadomień + hamburger (mobile/tablet) -->
        <div class="header-right-bar">
          <div v-if="auth.isAuthenticated.value" class="user-menu-container desktop-only">
            <button class="user-btn" @click.stop="isUserDropdownOpen = !isUserDropdownOpen">
              <img
                v-if="auth.user.value?.picture"
                :src="auth.user.value.picture"
                class="user-avatar"
                alt="Avatar"
              />
              <span v-else class="user-avatar-fallback">👤</span>
              <span class="user-name">{{ auth.user.value?.name }}</span>
              <span
                v-if="auth.user.value?.role !== 'USER'"
                class="role-badge"
                :class="{
                  'role-admin': auth.user.value?.role === 'ADMIN',
                  'role-pro': auth.user.value?.role === 'USER_PRO',
                }"
              >
                {{ getRoleBadgeLabel(auth.user.value?.role) }}
              </span>
              <span class="arrow" :class="{ up: isUserDropdownOpen }">▼</span>
            </button>

            <div class="dropdown-menu user-dropdown" v-if="isUserDropdownOpen">
              <div class="user-info-box">
                <div class="user-info-email">{{ auth.user.value?.email }}</div>
                <div class="user-info-role">Plan: <strong>{{ getRoleFullLabel(auth.user.value?.role) }}</strong></div>
              </div>
              <RouterLink to="/profile" @click="closeNavigation">
                👤 Mój profil
              </RouterLink>
              <RouterLink v-if="auth.isAdmin.value" to="/admin" @click="closeNavigation">
                ⚙️ Panel Administratora
              </RouterLink>
              <button class="logout-menu-btn" @click="handleLogout">
                🚪 Wyloguj się
              </button>
            </div>
          </div>

          <button
            v-else
            class="login-btn desktop-only"
            @click="auth.isAuthModalOpen.value = true; closeNavigation()"
          >
            Zaloguj się
          </button>

          <div v-if="auth.isAuthenticated.value" class="notif-menu-container">
            <button
              type="button"
              class="notif-bell-btn"
              @click.stop="isNotifDropdownOpen = !isNotifDropdownOpen; if (isNotifDropdownOpen) fetchNotifications()"
              title="Powiadomienia (Draft)"
            >
              🔔
              <span v-if="unreadCount > 0" class="notif-badge">{{ unreadCount }}</span>
            </button>
            <div v-if="isNotifDropdownOpen" class="notif-popover">
              <div class="notif-dropdown-header">
                <strong>Powiadomienia ({{ unreadCount }})</strong>
                <button
                  v-if="unreadCount > 0"
                  type="button"
                  class="notif-read-all-btn"
                  @click.stop="markAllAsRead"
                >
                  Oznacz wszystkie
                </button>
              </div>
              <div v-if="unreadNotifications.length === 0" class="notif-empty">
                Brak nieprzeczytanych powiadomień.
              </div>
              <div v-else class="notif-items-scroll">
                <button
                  v-for="n in unreadNotifications"
                  :key="n.id"
                  type="button"
                  class="notif-item unread"
                  @click="openNotification(n)"
                >
                  <div class="notif-item-head">
                    <span class="notif-item-dot"></span>
                    <strong class="notif-item-title">{{ n.title }}</strong>
                  </div>
                  <span class="notif-item-msg">{{ n.message }}</span>
                </button>
              </div>
              <RouterLink to="/profile?tab=notifications" class="notif-history-link" @click="closeNavigation">
                📜 Historia powiadomień w Profilu →
              </RouterLink>
            </div>
          </div>

          <button
            class="menu-toggle"
            @click.stop="isMenuOpen = !isMenuOpen"
            aria-label="Menu"
            :class="{ active: isMenuOpen }"
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <!-- POWIADOMIENIE NA ŻYWO (SSE TOAST) -->
    <div v-if="activeToast" class="live-toast" @click="openNotification(activeToast)">
      <div class="live-toast-body">
        <strong>🔔 {{ activeToast.title }}</strong>
        <span>{{ activeToast.message }}</span>
        <small>Kliknij, aby otworzyć Draft →</small>
      </div>
      <button type="button" class="live-toast-close" @click.stop="dismissToast">&times;</button>
    </div>

    <div v-if="isMenuOpen" class="menu-overlay" @click="isMenuOpen = false"></div>

    <main class="app-content">
      <RouterView />
    </main>

    <!-- MODAL LOGOWANIA GOOGLE & DEV -->
    <div
      v-if="auth.isAuthModalOpen.value"
      class="auth-modal-overlay"
      @click.self="auth.isAuthModalOpen.value = false"
    >
      <div class="auth-modal">
        <button class="auth-close-btn" @click="auth.isAuthModalOpen.value = false">&times;</button>
        <div class="auth-modal-header">
          <img src="/logo.png" alt="FantaSKI" class="auth-modal-logo" />
          <h3>Logowanie do FantaSKI</h3>
          <p>Zaloguj się, aby uzyskać dostęp do pełnych klasyfikacji i narzędzi analitycznych.</p>
        </div>

        <div class="auth-modal-body">
          <!-- Google Sign-In -->
          <div class="google-login-section">
            <label class="section-label">Logowanie kontem Google</label>
            <div id="google-btn-container" class="google-btn-wrapper"></div>
            <p class="gsi-hint">Bezpieczne logowanie OAuth 2.0 przez konto Google</p>
          </div>

          <template v-if="showDevLogin">
            <div class="auth-separator">
              <span>lub szybkie logowanie e-mail</span>
            </div>

            <!-- Dev / Quick Login -->
            <div class="dev-login-section">
              <div class="form-group">
                <label>Adres e-mail</label>
                <input
                  type="email"
                  v-model="devEmail"
                  placeholder="twoj-email@domena.pl"
                  class="auth-input"
                />
              </div>
              <div class="form-group">
                <label>Imię i nazwisko (opcjonalnie)</label>
                <input
                  type="text"
                  v-model="devName"
                  placeholder="Twoje imię"
                  class="auth-input"
                />
              </div>
              <button
                class="dev-login-btn"
                :disabled="auth.isLoading.value"
                @click="handleDevLogin"
              >
                {{ auth.isLoading.value ? 'Logowanie...' : 'Zaloguj się' }}
              </button>
              <div v-if="devError" class="auth-error-msg">{{ devError }}</div>
            </div>
          </template>

          <!-- Informacja o planach -->
          <div class="roles-explanation">
            <h4>Dostępne plany FantaSKI:</h4>
            <ul>
              <li><strong>Konto darmowe (po zalogowaniu):</strong> Bazy FIS, klasyfikacje generalne, Porównywarka (max 2 skoczków i 10 skoków) oraz 1 liga Drafta.</li>
              <li><strong>FantaSKI PRO:</strong> Nielimitowana Porównywarka &amp; ESM, nieograniczone ligi Drafta, wyceny Fantasy oraz Prognozy AI.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- CUSTOMOWY MODAL BRAKU DOSTĘPU / POWIADOMIENIA (ZAMIAST BRZYDKIEGO ALERT) -->
    <div
      v-if="notice.isOpen.value"
      class="auth-modal-overlay"
      @click.self="notice.closeNotice()"
    >
      <div class="auth-modal notice-modal">
        <button class="auth-close-btn" @click="notice.closeNotice()">&times;</button>
        <div class="notice-modal-header">
          <div class="notice-icon-box">
            <span>🔒</span>
          </div>
          <span v-if="notice.noticeData.value.badge" class="notice-badge">
            {{ notice.noticeData.value.badge }}
          </span>
          <h3>{{ notice.noticeData.value.title }}</h3>
          <p class="notice-desc">{{ notice.noticeData.value.message }}</p>
        </div>

        <div class="notice-modal-actions">
          <button
            v-if="notice.noticeData.value.requiresLogin"
            class="btn-notice-action"
            @click="notice.closeNotice(); auth.isAuthModalOpen.value = true"
          >
            🔑 Zaloguj się do FantaSKI
          </button>
          <button
            v-else
            class="btn-notice-action"
            @click="openSupportComposer(notice.noticeData.value.title)"
          >
            ✨ Skontaktuj się z administratorem
          </button>
          <button class="btn-notice-close" @click="notice.closeNotice()">
            Zamknij
          </button>
        </div>
      </div>
    </div>

    <!-- KOMUNIKATOR: WIADOMOŚĆ DO ADMINISTRATORA -->
    <div
      v-if="showSupportModal"
      class="auth-modal-overlay"
      @click.self="showSupportModal = false"
    >
      <div class="auth-modal notice-modal">
        <button class="auth-close-btn" @click="showSupportModal = false">&times;</button>
        <div class="notice-modal-header">
          <div class="notice-icon-box">
            <span>💬</span>
          </div>
          <span class="notice-badge">KONTAKT Z ADMINISTRATOREM</span>
          <h3>Napisz wiadomość</h3>
          <p class="notice-desc">
            Twoje zapytanie trafi prosto do panelu administratora. Gdy admin odpisze, dostaniesz powiadomienie tutaj w aplikacji.
          </p>
        </div>

        <div v-if="supportContext" class="support-ctx-pill">{{ supportContext }}</div>

        <div v-if="supportSendSuccess" class="support-success-box">
          <p>✅ Wiadomość została wysłana do administratora!</p>
          <div class="notice-modal-actions" style="margin-top: 10px;">
            <button
              type="button"
              class="btn-notice-action"
              @click="showSupportModal = false; router.push('/profile?tab=messages')"
            >
              💬 Przejdź do moich wiadomości
            </button>
            <button type="button" class="btn-notice-close" @click="showSupportModal = false">
              Zamknij
            </button>
          </div>
        </div>

        <form v-else @submit.prevent="submitSupportMessage" class="support-compose-form">
          <textarea
            v-model="supportMessageText"
            rows="4"
            maxlength="1500"
            class="support-textarea"
            placeholder="Opisz krótko pytanie lub poproś o aktywację dostępu..."
          ></textarea>
          <div v-if="supportSendError" class="auth-error-msg">{{ supportSendError }}</div>
          <div class="notice-modal-actions" style="margin-top: 10px;">
            <button type="submit" class="btn-notice-action" :disabled="isSendingSupport">
              {{ isSendingSupport ? 'Wysyłanie...' : '📩 Wyślij wiadomość' }}
            </button>
            <button type="button" class="btn-notice-close" @click="showSupportModal = false">
              Anuluj
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- INSTRUKCJA INSTALACJI PWA (gdy przeglądarka wymaga ręcznego dodania, np. iOS Safari) -->
    <div
      v-if="showInstallGuideModal"
      class="auth-modal-overlay"
      @click.self="showInstallGuideModal = false"
    >
      <div class="auth-modal notice-modal">
        <button class="auth-close-btn" @click="showInstallGuideModal = false">&times;</button>
        <div class="notice-modal-header">
          <div class="notice-icon-box">
            <img src="/pwa-192x192.png" alt="FantaSKI" style="width: 34px; height: 34px; object-fit: contain;" />
          </div>
          <span class="notice-badge">APLIKACJA NA TELEFON</span>
          <h3>Zainstaluj FantaSKI na ekranie</h3>
          <p class="notice-desc">
            <template v-if="isIosDevice">
              W przeglądarce <strong>Safari (iPhone / iPad)</strong> dodasz aplikację w 2 krokach:
            </template>
            <template v-else>
              Dodaj ikonę FantaSKI bezpośrednio do pulpitu telefonu bez pobierania ze sklepu:
            </template>
          </p>
        </div>

        <ol class="install-steps-list">
          <template v-if="isIosDevice">
            <li>Dotknij ikony <strong>Udostępnij</strong> (kwadrat ze strzałką w górę na dole ekranu).</li>
            <li>Wybierz opcję <strong>„Do ekranu głównego”</strong> i zatwierdź przyciskiem <strong>Dodaj</strong>.</li>
          </template>
          <template v-else>
            <li>Otwórz menu przeglądarki (ikona <strong>⋮</strong> w prawym górnym rogu).</li>
            <li>Wybierz <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong>.</li>
          </template>
        </ol>

        <div class="notice-modal-actions">
          <button class="btn-notice-close" @click="showInstallGuideModal = false">
            Rozumiem
          </button>
        </div>
      </div>
    </div>

    <footer class="app-footer">
      <p>FantaSKI &bull; Fantasy &amp; Wyniki Skoków Narciarskich &bull; 2026</p>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 100%;
  overflow-x: clip;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
}

/* --- STICKY HEADER (NOWOCZESNY, ALPEJSKI) --- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 10000;
  background-color: #0f172a;
  border-bottom: 1px solid #1e293b;
  color: white;
  padding: 10px 0;
  width: 100%;
  max-width: 100%;
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.25);
}

.header-container {
  max-width: 1350px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
}

.header-right-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-link {
  text-decoration: none;
  color: white;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.25em;
  letter-spacing: 0.5px;
}

.env-pill-test {
  background: #f59e0b;
  color: #0f172a;
  font-size: 0.58em;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
  letter-spacing: 0.5px;
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
}

.brand-logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 50%;
  display: block;
}

.auth-modal-logo {
  width: 60px;
  height: 60px;
  object-fit: contain;
  margin: 0 auto 10px;
  display: block;
}

.logo-text strong {
  color: #38bdf8;
}

.nav-links {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
  min-width: 0;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.86em;
  font-weight: 500;
  padding: 6px 8px;
  border-radius: 6px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.nav-links a:hover {
  color: white;
  background-color: #1e293b;
}

.nav-links a.router-link-active {
  color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.12);
}

.badge-pro {
  background: #f59e0b;
  color: #0f172a;
  font-size: 0.62em;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 3px;
  letter-spacing: 0.5px;
}

.badge-pro-mini {
  background: #f59e0b;
  color: #0f172a;
  font-size: 0.62em;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: auto;
}

.badge-lite-mini {
  background: #3b82f6;
  color: white;
  font-size: 0.62em;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: auto;
}

.nav-locked {
  opacity: 0.65;
  transition: opacity 0.2s, filter 0.2s;
}

.nav-locked:hover {
  opacity: 0.95;
}

.lock-icon {
  font-size: 0.8em;
  margin-left: 3px;
}

.admin-link {
  color: #cbd5e1 !important;
}

.login-btn {
  background: #0284c7;
  color: white !important;
  font-weight: 600;
  padding: 6px 14px !important;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  font-size: 0.88em;
  transition: background 0.2s;
}
.login-btn:hover {
  background: #0369a1 !important;
}

/* User Menu */
.user-menu-container {
  position: relative;
}

.user-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: white;
  padding: 4px 10px;
  border-radius: 20px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  transition: border-color 0.2s;
}

.user-btn:hover {
  border-color: #64748b;
}

.user-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-fallback {
  font-size: 1.1em;
}

.user-name {
  font-weight: 600;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-badge {
  font-size: 0.65em;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.role-admin {
  background: #ef4444;
  color: white;
}

.role-pro {
  background: #f59e0b;
  color: #0f172a;
}

.role-lite {
  background: #3b82f6;
  color: white;
}

.role-user {
  background: #475569;
  color: white;
}

.user-dropdown {
  min-width: 220px;
  right: 0;
  left: auto;
}

.user-info-box {
  padding: 8px 14px;
  border-bottom: 1px solid #334155;
  font-size: 0.8em;
}

.user-info-email {
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-info-role {
  margin-top: 4px;
  color: #cbd5e1;
}

.logout-menu-btn {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: #f87171;
  padding: 8px 14px;
  font-size: 0.85em;
  cursor: pointer;
  transition: background 0.2s;
}

.logout-menu-btn:hover {
  background-color: #1e293b;
}

.notif-menu-container {
  position: relative;
}

.notif-bell-btn {
  position: relative;
  background: #1e293b;
  border: 1px solid #334155;
  color: #ffffff;
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 0.95em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.notif-bell-btn:hover {
  border-color: #64748b;
}

.notif-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ef4444;
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 800;
  min-width: 17px;
  height: 17px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.notif-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 350px;
  max-width: calc(100vw - 24px);
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.55);
  z-index: 10500;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.notif-history-link {
  display: block;
  text-align: center;
  padding: 10px 14px;
  background: #1e293b;
  color: #38bdf8;
  text-decoration: none;
  font-size: 0.78rem;
  font-weight: 700;
  border-top: 1px solid #334155;
}

.notif-history-link:hover {
  background: #0b1329;
}

.notif-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid #334155;
  color: #ffffff;
  font-size: 0.85rem;
}

.notif-read-all-btn {
  background: none;
  border: none;
  color: #38bdf8;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
}

.notif-empty {
  padding: 20px 14px;
  color: #94a3b8;
  font-size: 0.82rem;
  text-align: center;
}

.notif-items-scroll {
  max-height: 320px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.notif-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid #1e293b;
  padding: 11px 14px;
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 4px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
  box-sizing: border-box;
}

.notif-item-head {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
}

.notif-item-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #38bdf8;
  flex-shrink: 0;
}

.notif-item-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #f8fafc;
  text-align: left;
}

.notif-item-msg {
  font-size: 0.77rem;
  font-weight: 400;
  color: #cbd5e1;
  text-align: left;
  line-height: 1.42;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notif-item.unread {
  background: rgba(56, 189, 248, 0.1);
}

.notif-item:hover {
  background: #1e293b;
}

.live-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 21000;
  max-width: min(380px, calc(100vw - 24px));
  background: #0f172a;
  color: #ffffff;
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
  animation: modalIn 0.2s ease-out;
}

.live-toast-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.85em;
}

.live-toast-body small {
  color: #38bdf8;
  font-weight: 700;
}

.live-toast-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.3em;
  line-height: 1;
  cursor: pointer;
}

/* --- DROPDOWN MENU --- */
.dropdown-container {
  position: relative;
}

.dropdown-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.88em;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  transition: all 0.2s;
}

.dropdown-btn:hover {
  color: white;
  background-color: #1e293b;
}

.arrow {
  font-size: 0.65em;
  transition: transform 0.2s;
}
.arrow.up {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.5);
  z-index: 10001;
}

.dropdown-menu a {
  padding: 8px 14px;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  font-size: 0.85em;
}

.dropdown-menu a:hover {
  background-color: #1e293b;
  color: #38bdf8;
}

/* --- KONTENER GŁÓWNY --- */
.app-content {
  flex: 1;
  width: 100%;
  max-width: 1350px;
  margin: 0 auto;
  padding: 16px 20px;
  box-sizing: border-box;
}

.app-footer {
  background-color: #0f172a;
  border-top: 1px solid #1e293b;
  color: #64748b;
  text-align: center;
  padding: 14px 20px;
  font-size: 0.8em;
  width: 100%;
}

.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: space-around;
  width: 24px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.menu-toggle span {
  display: block;
  width: 100%;
  height: 2px;
  background-color: #cbd5e1;
  border-radius: 2px;
  transition: all 0.2s;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.55);
  z-index: 9998;
}

/* --- AUTH MODAL --- */
.auth-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(4px);
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.auth-modal {
  background: white;
  color: #0f172a;
  border-radius: 12px;
  max-width: 440px;
  width: 100%;
  padding: 28px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  position: relative;
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.notice-modal {
  text-align: center;
  max-width: 420px;
}

.notice-icon-box {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fef3c7;
  color: #d97706;
  font-size: 1.8em;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.notice-badge {
  display: inline-block;
  background: #f59e0b;
  color: #0f172a;
  font-size: 0.7em;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.notice-desc {
  color: #475569;
  font-size: 0.9em;
  line-height: 1.5;
  margin: 8px 0 20px;
}

.notice-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-notice-action {
  width: 100%;
  padding: 10px 16px;
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.92em;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-notice-action:hover {
  background: #0369a1;
}

.btn-notice-close {
  width: 100%;
  padding: 8px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.88em;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-notice-close:hover {
  background: #e2e8f0;
}

.auth-close-btn {
  position: absolute;
  top: 16px;
  right: 18px;
  background: none;
  border: none;
  font-size: 1.6em;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
}
.auth-close-btn:hover {
  color: #0f172a;
}

.auth-modal-header {
  text-align: center;
  margin-bottom: 20px;
}

.auth-logo-icon {
  font-size: 2em;
}

.auth-modal-header h3 {
  margin: 6px 0 4px;
  font-size: 1.3em;
  font-weight: 700;
  color: #0f172a;
}

.auth-modal-header p {
  margin: 0;
  color: #64748b;
  font-size: 0.85em;
}

.section-label {
  display: block;
  font-size: 0.85em;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.google-login-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.google-btn-wrapper {
  min-height: 44px;
  display: flex;
  justify-content: center;
  width: 100%;
}

.gsi-hint {
  font-size: 0.72em;
  color: #94a3b8;
  margin-top: 6px;
}

.auth-separator {
  position: relative;
  text-align: center;
  margin: 18px 0;
}
.auth-separator::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  border-top: 1px solid #e2e8f0;
}
.auth-separator span {
  position: relative;
  background: white;
  padding: 0 10px;
  font-size: 0.75em;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dev-login-section .form-group {
  margin-bottom: 12px;
}

.dev-login-section label {
  display: block;
  font-size: 0.8em;
  font-weight: 600;
  color: #475569;
  margin-bottom: 4px;
}

.auth-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9em;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.auth-input:focus {
  outline: none;
  border-color: #0284c7;
}

.dev-login-btn {
  width: 100%;
  padding: 10px;
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.9em;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 6px;
}
.dev-login-btn:hover {
  background: #0369a1;
}
.dev-login-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.auth-error-msg {
  color: #dc2626;
  font-size: 0.8em;
  margin-top: 8px;
  text-align: center;
}

.roles-explanation {
  margin-top: 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}

.roles-explanation h4 {
  margin: 0 0 6px;
  font-size: 0.8em;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.roles-explanation ul {
  margin: 0;
  padding-left: 18px;
  font-size: 0.78em;
  color: #64748b;
  line-height: 1.4;
}

.roles-explanation li {
  margin-bottom: 4px;
}

.drawer-header-mobile,
.drawer-user-card-mobile,
.drawer-guest-card-mobile,
.drawer-section-label,
.mobile-only-account,
.pwa-install-drawer-wrap {
  display: none;
}

.install-steps-list {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: #334155;
  font-size: 0.88rem;
  line-height: 1.45;
}

.support-ctx-pill {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 7px;
  margin-bottom: 10px;
}

.support-compose-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.support-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 0.9rem;
  color: #0f172a;
  resize: vertical;
}

.support-textarea:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
}

.support-success-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 12px;
  font-size: 0.88rem;
  font-weight: 600;
}

.support-success-box p {
  margin: 0;
}

@media (max-width: 1120px) {
  .desktop-only {
    display: none !important;
  }

  .mobile-only-account {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu-toggle {
    display: flex;
  }

  .notif-popover {
    position: fixed;
    top: 60px;
    left: 12px;
    right: 12px;
    width: auto;
    max-width: none;
  }

  /* --- SLIDE-IN MOBILE DRAWER --- */
  .nav-links {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 86vw);
    height: 100vh;
    background-color: #0f172a;
    border-left: 1px solid #1e293b;
    box-shadow: -12px 0 35px rgba(0, 0, 0, 0.5);
    padding: 14px 16px 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: stretch;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 10005;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .nav-links.open {
    transform: translateX(0);
  }

  /* Overlay musi pozostać pod .app-header (z-index: 10000), żeby nie wyszarzał otwartego menu! */
  .menu-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9998;
  }

  .drawer-header-mobile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 10px;
    border-bottom: 1px solid #1e293b;
  }

  .drawer-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.15em;
    color: white;
  }

  .drawer-logo-img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 50%;
  }

  .drawer-close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.8rem;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
  }
  .drawer-close-btn:hover {
    color: white;
  }

  .drawer-user-card-mobile {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #1e293b;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 10px;
  }

  .drawer-user-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .drawer-user-name {
    color: white;
    font-weight: 600;
    font-size: 0.9em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .drawer-user-plan {
    font-size: 0.75em;
    color: #94a3b8;
  }

  .drawer-guest-card-mobile {
    display: block;
    margin-bottom: 12px;
  }

  .drawer-login-btn {
    width: 100%;
    padding: 12px;
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.92em;
    cursor: pointer;
  }

  .drawer-section-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    font-weight: 700;
    padding: 10px 8px 4px;
  }

  .nav-links a {
    min-height: 44px;
    padding: 10px 14px;
    font-size: 0.95em;
    border-radius: 8px;
    color: #cbd5e1;
  }

  .nav-links a:hover,
  .nav-links a.router-link-active {
    background-color: #1e293b;
    color: #38bdf8;
  }

  .dropdown-btn {
    width: 100%;
    justify-content: space-between;
    padding: 10px 14px;
    min-height: 44px;
    font-size: 0.95em;
    border-radius: 8px;
  }

  .dropdown-menu {
    position: static;
    transform: none;
    background-color: #0b1329;
    border: 1px solid #1e293b;
    box-shadow: none;
    margin-top: 4px;
    padding: 4px 6px;
    border-radius: 8px;
  }

  .dropdown-menu a {
    min-height: 40px;
    font-size: 0.9em;
  }

  .user-dropdown {
    position: static;
    transform: none;
    width: 100%;
    background-color: #0b1329;
    box-shadow: none;
    margin-top: 6px;
  }

  .logout-menu-btn {
    width: 100%;
    min-height: 42px;
    padding: 8px 12px;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .app-content {
    padding: 10px 12px;
  }

  .pwa-install-drawer-wrap {
    display: block;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #1e293b;
  }

  .pwa-install-drawer-btn {
    width: 100%;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    background: rgba(2, 132, 199, 0.18);
    color: #bae6fd;
    font-weight: 700;
    font-size: 0.9em;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
}
</style>
