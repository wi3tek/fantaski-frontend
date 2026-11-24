<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useAuth } from '@/stores/auth'

const auth = useAuth()

const isMenuOpen = ref<boolean>(false)
const isStatsDropdownOpen = ref<boolean>(false)
const isUserDropdownOpen = ref<boolean>(false)
const devEmail = ref<string>('')
const devName = ref<string>('')
const devError = ref<string>('')

const getRoleBadgeLabel = (role?: string) => {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'USER_PRO') return 'PRO'
  if (role === 'USER_LITE') return 'LITE'
  return 'FREE'
}

const getRoleFullLabel = (role?: string) => {
  if (role === 'ADMIN') return 'Administrator'
  if (role === 'USER_PRO') return 'FantaSKI PRO'
  if (role === 'USER_LITE') return 'FantaSKI LITE'
  return 'Konto podstawowe (darmowe)'
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
}

const closeNavigation = () => {
  isMenuOpen.value = false
  isStatsDropdownOpen.value = false
  isUserDropdownOpen.value = false
}

const handleLogout = () => {
  auth.logout()
  closeNavigation()
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

onMounted(async () => {
  document.addEventListener('click', closeDropdown)
  if (auth.token.value) {
    await auth.fetchMe()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-container">
        <RouterLink to="/" @click="closeNavigation" class="brand-link">
          <div class="logo">
            <img src="/logo.png" alt="FantaSKI Logo" class="brand-logo-img" />
            <span class="logo-text">Fanta<strong>SKI</strong></span>
          </div>
        </RouterLink>

        <button
          class="menu-toggle"
          @click.stop="isMenuOpen = !isMenuOpen"
          aria-label="Menu"
          :class="{ active: isMenuOpen }"
        >
          <span></span><span></span><span></span>
        </button>

        <nav class="nav-links" :class="{ open: isMenuOpen }">
          <RouterLink to="/athletes" @click="closeNavigation">Baza skoczków</RouterLink>
          <RouterLink to="/sessions" @click="closeNavigation">Baza sesji</RouterLink>
          <RouterLink to="/hills" @click="closeNavigation">Baza skoczni</RouterLink>
          <RouterLink
            to="/standings"
            @click="closeNavigation"
            :class="{ 'nav-locked': !auth.isAuthenticated.value }"
            :title="!auth.isAuthenticated.value ? '🔒 Wymaga darmowego logowania' : 'Oficjalne klasyfikacje FIS'"
          >
            🏆 Klasyfikacje
            <span v-if="!auth.isAuthenticated.value" class="lock-icon">🔒</span>
          </RouterLink>

          <div class="dropdown-container">
            <button
              class="dropdown-btn"
              @click.stop="isStatsDropdownOpen = !isStatsDropdownOpen"
              :class="{ 'nav-locked': !auth.hasSearchAccess.value }"
            >
              Narzędzia
              <span v-if="!auth.hasSearchAccess.value" class="lock-icon">🔒</span>
              <span v-else-if="auth.isLite.value" class="badge-lite-mini" style="margin-left: 4px">LITE</span>
              <span v-else class="badge-pro">PRO</span>
              <span class="arrow" :class="{ up: isStatsDropdownOpen }">▼</span>
            </button>
            <div class="dropdown-menu" v-if="isStatsDropdownOpen">
              <RouterLink
                to="/stats"
                @click="closeNavigation"
                :class="{ 'nav-locked': !auth.hasSearchAccess.value }"
                :title="!auth.hasSearchAccess.value ? '🔒 Dostępne w pakietach LITE i PRO' : 'Porównywarka zawodników'"
              >
                ⚖️ Porównywarka
                <span v-if="!auth.hasSearchAccess.value" class="lock-icon">🔒</span>
                <span v-else-if="auth.isLite.value" class="badge-lite-mini">LITE</span>
                <span v-else class="badge-pro-mini">PRO</span>
              </RouterLink>
              <RouterLink
                to="/predictions"
                @click="closeNavigation"
                :class="{ 'nav-locked': !auth.isPro.value }"
                :title="!auth.isPro.value ? '🔒 Dostępne wyłącznie w pakiecie PRO' : 'Przewidywania AI'"
              >
                🔮 Przewidywania AI
                <span v-if="!auth.isPro.value" class="lock-icon">🔒</span>
                <span class="badge-pro-mini">PRO</span>
              </RouterLink>
            </div>
          </div>

          <RouterLink
            to="/predictions"
            @click="closeNavigation"
            class="predictions-nav-link"
            :class="{ 'nav-locked': !auth.isPro.value }"
            :title="!auth.isPro.value ? '🔒 Dostępne wyłącznie w pakiecie PRO' : 'Przewidywania AI'"
          >
            🔮 Przewidywania
            <span v-if="!auth.isPro.value" class="lock-icon">🔒</span>
            <span class="badge-pro">PRO</span>
          </RouterLink>

          <!-- Widoczne tylko dla ADMINA -->
          <RouterLink v-if="auth.isAdmin.value" to="/admin" class="admin-link" @click="closeNavigation">
            ⚙️ Panel
          </RouterLink>

          <!-- Użytkownik zalogowany -->
          <div v-if="auth.isAuthenticated.value" class="user-menu-container">
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
                  'role-lite': auth.user.value?.role === 'USER_LITE',
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
              <RouterLink v-if="auth.isAdmin.value" to="/admin" @click="closeNavigation">
                ⚙️ Panel Administratora
              </RouterLink>
              <button class="logout-menu-btn" @click="handleLogout">
                🚪 Wyloguj się
              </button>
            </div>
          </div>

          <!-- Przycisk logowania jeśli niezalogowany -->
          <button
            v-else
            class="login-btn"
            @click="auth.isAuthModalOpen.value = true; closeNavigation()"
          >
            Zaloguj się
          </button>
        </nav>
      </div>
    </header>

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

          <!-- Informacja o planach -->
          <div class="roles-explanation">
            <h4>Dostępne plany FantaSKI:</h4>
            <ul>
              <li><strong>Konto podstawowe (darmowe):</strong> Wyniki FIS, baza skoczków, sesji, skoczni oraz oficjalne klasyfikacje generalne.</li>
              <li><strong>FantaSKI LITE:</strong> Wgląd do porównywarki wyników (do 2 zawodników jednocześnie).</li>
              <li><strong>FantaSKI PRO:</strong> Nielimitowana porównywarka Head-to-Head, wyceny Fantasy oraz zaawansowane predykcje AI.</li>
            </ul>
          </div>
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
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.25);
}

.header-container {
  max-width: 1350px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.brand-link {
  text-decoration: none;
  color: white;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.25em;
  letter-spacing: 0.5px;
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
  gap: 14px;
  align-items: center;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.88em;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
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

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }
  .nav-links {
    display: none;
    flex-direction: column;
    position: absolute;
    top: 52px;
    left: 0;
    width: 100%;
    background-color: #0f172a;
    border-bottom: 1px solid #334155;
    padding: 14px 20px;
    box-sizing: border-box;
    gap: 8px;
    align-items: stretch;
  }
  .nav-links.open {
    display: flex;
    z-index: 10002;
  }
  .dropdown-menu {
    position: static;
    transform: none;
    background-color: #1e293b;
    border: 1px solid #334155;
    box-shadow: none;
    margin-top: 4px;
  }
  .app-content {
    padding: 10px 12px;
  }
}
</style>
