<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'

const auth = useAuth()
const route = useRoute()
const router = useRouter()

const showDevLogin =
  import.meta.env.MODE !== 'production' || import.meta.env.VITE_ENABLE_DEV_LOGIN === 'true'

const devEmail = ref('')
const devName = ref('')
const devError = ref('')
const gsiError = ref('')

const isExpired = computed(
  () => route.query.expired === '1' || auth.sessionExpiredReason.value === 'expired'
)

const safeRedirectTarget = computed(() => {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login')) {
    return raw
  }
  return '/athletes'
})

const redirectAfterLogin = () => {
  auth.clearExpiredReason()
  router.replace(safeRedirectTarget.value)
}

watch(
  () => auth.isAuthenticated.value,
  (isAuth) => {
    if (isAuth) {
      redirectAfterLogin()
    }
  },
  { immediate: true }
)

const initPageGoogleSignIn = () => {
  if (typeof window === 'undefined') return
  const google = (window as any).google
  if (!google?.accounts?.id) return

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    gsiError.value = 'Brak konfiguracji VITE_GOOGLE_CLIENT_ID.'
    return
  }

  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        if (response?.credential) {
          try {
            await auth.loginWithGoogle(response.credential)
            redirectAfterLogin()
          } catch (err: any) {
            gsiError.value = err?.message || 'Błąd logowania przez Google.'
          }
        }
      },
    })

    const btnEl = document.getElementById('login-page-google-btn')
    if (btnEl) {
      btnEl.innerHTML = ''
      google.accounts.id.renderButton(btnEl, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 280,
      })
    }
  } catch (e) {
    console.warn('Google GSI login page notice:', e)
  }
}

const handleDevLogin = async () => {
  devError.value = ''
  try {
    await auth.devLogin(devEmail.value, devName.value)
    redirectAfterLogin()
  } catch (e: any) {
    devError.value = e?.message || 'Błąd logowania testowego'
  }
}

onMounted(() => {
  setTimeout(initPageGoogleSignIn, 120)
})
</script>

<template>
  <div class="welcome-login-page">
    <div class="welcome-grid">
      <!-- LEWA STRONA: PREZENTACJA PLATFORMY I DLACZEGO WARTO DOŁĄCZYĆ -->
      <section class="showcase-panel">
        <div class="showcase-badge">🎿 CENTRUM STATYSTYK, DRAFTA &amp; FANTASY</div>
        <h1>Witaj w <span>FantaSKI</span></h1>
        <p class="showcase-lead">
          Twoje jedno miejsce do analizy wyników skoków narciarskich FIS, rywalizacji ze znajomymi w ligach Drafta oraz porównywania składów Fantasy.
        </p>

        <div class="features-grid">
          <div class="feature-card">
            <div class="f-icon">⚡</div>
            <div>
              <h3>Ligi Drafta Snake</h3>
              <p>Załóż własną ligę lub dołącz 8-znakowym kodem od znajomych i zbieraj punkty w trakcie sezonu (1 liga za darmo, bez limitu w PRO).</p>
            </div>
          </div>
          <div class="feature-card">
            <div class="f-icon">⚖️</div>
            <div>
              <h3>Porównywarka Skoczków &amp; ESM</h3>
              <p>Zestawiaj formę i serie skoków (do 2 skoczków i 10 prób za darmo, bez limitu oraz ze składami znajomych ESM w PRO).</p>
            </div>
          </div>
          <div class="feature-card">
            <div class="f-icon">📅</div>
            <div>
              <h3>Baza FIS &amp; Kalendarz PŚ</h3>
              <p>Kompletne wyniki treningów, kwalifikacji, konkursów, profile skoczni oraz klasyfikacje generalne FIS.</p>
            </div>
          </div>
          <div class="feature-card pro-highlight">
            <div class="f-icon">🔮</div>
            <div>
              <h3>Prognozy AI (PRO)</h3>
              <p>Sieć neuronowa, 300 symulacji Monte Carlo, prognoza wiatru oraz wyceny Fantasy przed każdym konkursem.</p>
            </div>
          </div>
        </div>

        <div class="public-shortcuts">
          <span class="shortcuts-label">Otwarty podgląd bez logowania:</span>
          <div class="shortcut-links">
            <RouterLink to="/athletes" class="shortcut-pill">🎿 Baza skoczków</RouterLink>
            <RouterLink to="/sessions" class="shortcut-pill">📅 Sesje &amp; Kalendarz PŚ</RouterLink>
            <RouterLink to="/hills" class="shortcut-pill">🏔️ Skocznie</RouterLink>
            <RouterLink to="/standings" class="shortcut-pill">🏆 Klasyfikacje generalne</RouterLink>
          </div>
        </div>
      </section>

      <!-- PRAWA STRONA: LOGOWANIE -->
      <section class="login-card">
        <div class="login-header">
          <img src="/logo.png" alt="FantaSKI" class="login-logo" />
          <h2>Dołącz lub zaloguj się</h2>
          <p>Darmowe konto daje natychmiastowy dostęp do Drafta (1 liga) i porównywarki skoczków.</p>
        </div>

        <div v-if="isExpired" class="expired-banner">
          <span class="expired-icon">⏱️</span>
          <div>
            <strong>Wylogowano automatycznie</strong>
            <p>Twoja sesja wygasła po upływie czasu ważności tokenu. Zaloguj się ponownie, aby kontynuować.</p>
          </div>
        </div>

        <div class="google-section">
          <label class="section-label">Szybkie logowanie kontem Google</label>
          <div id="login-page-google-btn" class="google-btn-wrap"></div>
          <p v-if="gsiError" class="login-error">{{ gsiError }}</p>
        </div>

        <template v-if="showDevLogin">
          <div class="login-separator">
            <span>lub szybkie logowanie dev</span>
          </div>

          <form class="dev-form" @submit.prevent="handleDevLogin">
            <div class="form-group">
              <label>Adres e-mail</label>
              <input v-model="devEmail" type="email" class="login-input" placeholder="twoj-email@domena.pl" required />
            </div>
            <div class="form-group">
              <label>Imię i nazwisko (opcjonalnie)</label>
              <input v-model="devName" type="text" class="login-input" placeholder="Twoje imię" />
            </div>
            <button type="submit" class="login-submit-btn" :disabled="auth.isLoading.value">
              {{ auth.isLoading.value ? 'Logowanie...' : 'Zaloguj się' }}
            </button>
            <p v-if="devError" class="login-error">{{ devError }}</p>
          </form>
        </template>

        <div class="tiers-box">
          <div class="tier-row">
            <span class="tier-pill free">DARMOWE (po zalogowaniu)</span>
            <small>1 liga Drafta (tworzenie lub dołączenie), Porównywarka (max 2 skoczków / 10 skoków), Bazy i Klasyfikacje FIS.</small>
          </div>
          <div class="tier-row">
            <span class="tier-pill pro">PRO</span>
            <small>Nielimitowane ligi Drafta, pełna Porównywarka + składy ESM, wyceny oraz Prognozy AI.</small>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.welcome-login-page {
  min-height: calc(100vh - 150px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 8px;
}

.welcome-grid {
  width: 100%;
  max-width: 1120px;
  display: grid;
  grid-template-columns: 1.25fr 0.95fr;
  gap: 24px;
  align-items: stretch;
}

.showcase-panel {
  background: linear-gradient(155deg, #0f172a 0%, #172554 100%);
  color: #f8fafc;
  border-radius: 18px;
  padding: 30px 28px;
  border: 1px solid #1e3a8a;
  box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.35);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 20px;
}

.showcase-badge {
  display: inline-block;
  align-self: flex-start;
  background: rgba(56, 189, 248, 0.16);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #7dd3fc;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border-radius: 999px;
}

.showcase-panel h1 {
  margin: 4px 0 8px;
  font-size: clamp(1.75rem, 3.5vw, 2.3rem);
  line-height: 1.15;
  color: #ffffff;
}

.showcase-panel h1 span {
  color: #38bdf8;
}

.showcase-lead {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.95rem;
  line-height: 1.55;
}

.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.feature-card {
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 12px;
  padding: 13px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.feature-card.pro-highlight {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.08);
}

.f-icon {
  font-size: 1.35rem;
  line-height: 1;
  flex-shrink: 0;
}

.feature-card h3 {
  margin: 0 0 4px;
  font-size: 0.9rem;
  color: #ffffff;
}

.feature-card p {
  margin: 0;
  font-size: 0.78rem;
  color: #cbd5e1;
  line-height: 1.4;
}

.public-shortcuts {
  border-top: 1px solid rgba(148, 163, 184, 0.22);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcuts-label {
  font-size: 0.76rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.shortcut-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.shortcut-pill {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
  padding: 6px 11px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  transition: background 0.15s;
}

.shortcut-pill:hover {
  background: rgba(56, 189, 248, 0.24);
  color: #ffffff;
}

.login-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 28px 26px;
  box-shadow: 0 18px 36px -8px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.login-header {
  text-align: center;
  margin-bottom: 18px;
}

.login-logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
  margin: 0 auto 10px;
  display: block;
}

.login-header h2 {
  margin: 0 0 6px;
  font-size: 1.35rem;
  color: #0f172a;
}

.login-header p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.45;
}

.expired-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  color: #92400e;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 18px;
  font-size: 0.84rem;
}

.expired-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.expired-banner strong {
  display: block;
  margin-bottom: 2px;
}

.expired-banner p {
  margin: 0;
  line-height: 1.4;
}

.google-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.section-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
  margin-bottom: 10px;
}

.google-btn-wrap {
  min-height: 44px;
  display: flex;
  justify-content: center;
  width: 100%;
}

.login-separator {
  position: relative;
  text-align: center;
  margin: 18px 0;
}

.login-separator::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  border-top: 1px solid #e2e8f0;
}

.login-separator span {
  position: relative;
  background: #ffffff;
  padding: 0 10px;
  font-size: 0.74rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.dev-form .form-group {
  margin-bottom: 10px;
}

.dev-form label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 4px;
}

.login-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.login-submit-btn {
  width: 100%;
  padding: 10px;
  background: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.login-submit-btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.login-error {
  margin: 8px 0 0;
  color: #dc2626;
  font-size: 0.8rem;
  text-align: center;
}

.tiers-box {
  margin-top: 20px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tier-row small {
  color: #475569;
  font-size: 0.77rem;
  line-height: 1.4;
}

.tier-pill {
  align-self: flex-start;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
}

.tier-pill.free {
  background: #e0f2fe;
  color: #0369a1;
}

.tier-pill.pro {
  background: #fef3c7;
  color: #b45309;
}

@media (max-width: 900px) {
  .welcome-grid {
    grid-template-columns: 1fr;
  }
  .features-grid {
    grid-template-columns: 1fr;
  }
  .showcase-panel,
  .login-card {
    padding: 20px 18px;
  }
}
</style>
