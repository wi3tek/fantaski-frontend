<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '@/stores/auth'

const auth = useAuth()

// Stan edycji formularza
const nameInput = ref('')
const avatarInput = ref('')
const activeAvatarTab = ref<'presets' | 'url' | 'upload'>('presets')

const isSaving = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

// Predefiniowane szablony awatarów
const avatarStyles = [
  { id: 'bottts', name: '🤖 Roboty' },
  { id: 'avataaars', name: '👤 Postacie' },
  { id: 'identicon', name: '🔷 Wzory' },
  { id: 'thumbs', name: '👍 Emotikony' },
  { id: 'lorelei', name: '🎨 Ilustracje' }
]
const selectedStyle = ref('bottts')
const randomSeed = ref('')

const skiThemes = [
  { label: '⛷️ Skoczek', seed: 'skijumper' },
  { label: '🏔️ Skocznia', seed: 'skigroove' },
  { label: '🦅 Orzeł', seed: 'goldeneagle' },
  { label: '👑 Mistrz', seed: 'champion' },
  { label: '❄️ Śnieżynka', seed: 'winterflyer' },
  { label: '🎿 Narty & Gogle', seed: 'goggles' },
  { label: '🔥 Zwierzę Konkursowe', seed: 'clutch' },
  { label: '🎯 Metronom', seed: 'metronome' }
]

const rollRandomSeed = () => {
  randomSeed.value = Math.random().toString(36).substring(2, 9)
  avatarInput.value = `https://api.dicebear.com/7.x/${selectedStyle.value}/svg?seed=${randomSeed.value}`
}

const selectSkiTheme = (seed: string) => {
  randomSeed.value = seed
  avatarInput.value = `https://api.dicebear.com/7.x/${selectedStyle.value}/svg?seed=${seed}`
}

const selectStyle = (styleId: string) => {
  selectedStyle.value = styleId
  const seed = randomSeed.value || auth.user.value?.email || 'skijump'
  avatarInput.value = `https://api.dicebear.com/7.x/${styleId}/svg?seed=${seed}`
}

// Obsługa wgrywania pliku
const handleFileUpload = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    errorMsg.value = 'Wybrany plik musi być obrazem (JPG, PNG, WebP).'
    return
  }

  if (file.size > 1024 * 1024) {
    errorMsg.value = 'Maksymalny dopuszczalny rozmiar pliku to 1 MB.'
    return
  }

  errorMsg.value = ''
  const reader = new FileReader()
  reader.onload = (e) => {
    avatarInput.value = e.target?.result as string
  }
  reader.readAsDataURL(file)
}

const resetToDefault = () => {
  const defaultSeed = auth.user.value?.email || 'default'
  avatarInput.value = `https://api.dicebear.com/7.x/identicon/svg?seed=${defaultSeed}`
}

// Inicjalizacja danych z aktualnego profilu
const initProfileData = () => {
  if (auth.user.value) {
    nameInput.value = auth.user.value.name || ''
    avatarInput.value = auth.user.value.picture || ''
  }
}

onMounted(() => {
  initProfileData()
  if (!randomSeed.value) {
    const emailPrefix = auth.user.value?.email ? auth.user.value.email.split('@')[0] : ''
    randomSeed.value = emailPrefix || 'skijump'
  }
})

// Wykrywanie zmian
const hasChanges = computed(() => {
  const currentName = auth.user.value?.name || ''
  const currentPic = auth.user.value?.picture || ''
  return nameInput.value.trim() !== currentName || avatarInput.value.trim() !== currentPic
})

// Zapisanie zmian
const handleSave = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  const trimmedName = nameInput.value.trim()
  if (trimmedName.length < 2 || trimmedName.length > 60) {
    errorMsg.value = 'Nazwa użytkownika musi zawierać od 2 do 60 znaków.'
    return
  }

  isSaving.value = true
  try {
    await auth.updateProfile({
      name: trimmedName,
      picture: avatarInput.value.trim()
    })
    successMsg.value = 'Pomyślnie zaktualizowano Twój profil!'
    setTimeout(() => {
      successMsg.value = ''
    }, 4000)
  } catch (err: any) {
    errorMsg.value = err.message || 'Wystąpił błąd podczas zapisywania zmian.'
  } finally {
    isSaving.value = false
  }
}

const getRoleBadgeLabel = (role?: string) => {
  if (role === 'ADMIN') return 'ADMINISTRATOR'
  if (role === 'USER_PRO') return 'PRO'
  if (role === 'USER_LITE') return 'LITE'
  return 'FREE'
}

const getRoleClass = (role?: string) => {
  if (role === 'ADMIN') return 'role-admin'
  if (role === 'USER_PRO') return 'role-pro'
  if (role === 'USER_LITE') return 'role-lite'
  return 'role-free'
}

const formatDate = (isoString?: string) => {
  if (!isoString) return 'Brak informacji'
  try {
    const d = new Date(isoString)
    return d.toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}
</script>

<template>
  <div class="profile-page">
    <div class="profile-container">
      <!-- HEADER PROFILU (HERO CARD) -->
      <div class="profile-hero-card">
        <div class="hero-left">
          <div class="avatar-wrapper">
            <img
              v-if="avatarInput || auth.user.value?.picture"
              :src="avatarInput || auth.user.value?.picture"
              class="profile-avatar-large"
              alt="Avatar"
              @error="avatarInput = ''"
            />
            <div v-else class="avatar-fallback-large">👤</div>
          </div>
          <div class="hero-details">
            <div class="hero-title-row">
              <h1 class="user-display-name">{{ nameInput || auth.user.value?.name }}</h1>
              <span class="role-pill" :class="getRoleClass(auth.user.value?.role)">
                {{ getRoleBadgeLabel(auth.user.value?.role) }}
              </span>
            </div>
            <p class="user-email">✉️ {{ auth.user.value?.email }}</p>
            <div class="hero-meta-row">
              <span>Konto aktywne od: <strong>{{ formatDate(auth.user.value?.created_at) }}</strong></span>
              <span class="meta-dot">&bull;</span>
              <span>Ostatnie logowanie: <strong>{{ formatDate(auth.user.value?.last_login) }}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <!-- KOMUNIKATY O BŁĘDACH I SUKCESIE -->
      <div v-if="successMsg" class="alert-box success">
        <span>✅</span> {{ successMsg }}
      </div>
      <div v-if="errorMsg" class="alert-box error">
        <span>⚠️</span> {{ errorMsg }}
      </div>

      <!-- GŁÓWNA SIATKA USTAWIEŃ -->
      <div class="profile-grid">
        <!-- FORMULARZ EDYCJI DANYCH -->
        <div class="card edit-card">
          <div class="card-header">
            <h3>✏️ Edycja Profilu</h3>
            <p class="subtitle">Dostosuj swoją wyświetlaną nazwę oraz awatar widoczny w całym serwisie.</p>
          </div>

          <div class="card-body">
            <!-- 1. IMIĘ / PSEUDONIM -->
            <div class="form-group">
              <label for="displayName" class="field-label">Wyświetlana nazwa / Imię i Nazwisko:</label>
              <input
                id="displayName"
                v-model="nameInput"
                type="text"
                class="form-input"
                placeholder="Wpisz swoje imię lub pseudonim..."
                maxlength="60"
              />
              <span class="field-hint">Nazwa ta będzie prezentowana w nagłówku strony i panelu analiz.</span>
            </div>

            <!-- 2. ZARZĄDZANIE AWATAREM -->
            <div class="avatar-section">
              <label class="field-label">Wybór awatara profilowego:</label>
              
              <!-- Zakładki wyboru avatara -->
              <div class="avatar-tabs">
                <button
                  type="button"
                  class="avatar-tab-btn"
                  :class="{ active: activeAvatarTab === 'presets' }"
                  @click="activeAvatarTab = 'presets'"
                >
                  🎲 Generator & Motywy
                </button>
                <button
                  type="button"
                  class="avatar-tab-btn"
                  :class="{ active: activeAvatarTab === 'upload' }"
                  @click="activeAvatarTab = 'upload'"
                >
                  📁 Wgraj plik z dysku
                </button>
                <button
                  type="button"
                  class="avatar-tab-btn"
                  :class="{ active: activeAvatarTab === 'url' }"
                  @click="activeAvatarTab = 'url'"
                >
                  🔗 Własny adres URL
                </button>
              </div>

              <!-- OPCJA 1: GENERATOR & PRESETY -->
              <div v-if="activeAvatarTab === 'presets'" class="tab-pane">
                <div class="styles-selector">
                  <span class="sub-label">Styl ilustracji:</span>
                  <div class="style-chips">
                    <button
                      v-for="st in avatarStyles"
                      :key="st.id"
                      type="button"
                      class="style-chip"
                      :class="{ active: selectedStyle === st.id }"
                      @click="selectStyle(st.id)"
                    >
                      {{ st.name }}
                    </button>
                  </div>
                </div>

                <div class="themes-selector">
                  <span class="sub-label">Szybkie motywy skokowe:</span>
                  <div class="theme-buttons">
                    <button
                      v-for="th in skiThemes"
                      :key="th.seed"
                      type="button"
                      class="theme-btn"
                      @click="selectSkiTheme(th.seed)"
                    >
                      {{ th.label }}
                    </button>
                  </div>
                </div>

                <div class="generator-actions">
                  <button type="button" class="btn-secondary" @click="rollRandomSeed">
                    🎲 Wylosuj inny awatar
                  </button>
                  <button type="button" class="btn-text" @click="resetToDefault">
                    🔄 Przywróć domyślny
                  </button>
                </div>
              </div>

              <!-- OPCJA 2: UPLOAD Z DYSKU -->
              <div v-if="activeAvatarTab === 'upload'" class="tab-pane">
                <div class="upload-dropzone">
                  <label for="avatarUploadInput" class="upload-label">
                    <span class="upload-icon">📤</span>
                    <strong>Kliknij tutaj, aby wybrać zdjęcie z komputera</strong>
                    <small>Formaty JPG, PNG lub WebP (maks. 1 MB)</small>
                  </label>
                  <input
                    id="avatarUploadInput"
                    type="file"
                    accept="image/*"
                    class="file-input-hidden"
                    @change="handleFileUpload"
                  />
                </div>
              </div>

              <!-- OPCJA 3: WŁASNY URL -->
              <div v-if="activeAvatarTab === 'url'" class="tab-pane">
                <input
                  v-model="avatarInput"
                  type="url"
                  class="form-input"
                  placeholder="https://twojadomena.pl/moj-awatar.png"
                />
                <span class="field-hint">Wklej bezpośredni link do obrazka ze strony zewnętrznej.</span>
              </div>
            </div>

            <!-- PRZYCISKI AKCJI -->
            <div class="form-actions">
              <button
                type="button"
                class="btn-primary"
                :disabled="isSaving || !hasChanges"
                @click="handleSave"
              >
                <span v-if="isSaving">Zapisywanie...</span>
                <span v-else>💾 Zapisz zmiany w profilu</span>
              </button>
              <button
                type="button"
                class="btn-cancel"
                :disabled="isSaving || !hasChanges"
                @click="initProfileData"
              >
                ✕ Przywróć poprzednie
              </button>
            </div>
          </div>
        </div>

        <!-- KARTA INFORMACJI O PLANIE I PAKIETACH -->
        <div class="card info-card">
          <div class="card-header">
            <h3>💎 Twój Pakiet i Możliwości</h3>
            <p class="subtitle">Szczegóły aktywnego konta w FantaSKI.</p>
          </div>

          <div class="card-body">
            <div class="plan-summary-box" :class="getRoleClass(auth.user.value?.role)">
              <div class="plan-badge-large">{{ getRoleBadgeLabel(auth.user.value?.role) }}</div>
              <h4>{{ auth.user.value?.role === 'ADMIN' ? 'Pakiet Administratorski' : auth.user.value?.role === 'USER_PRO' ? 'FantaSKI PRO' : auth.user.value?.role === 'USER_LITE' ? 'FantaSKI LITE' : 'Konto Standardowe' }}</h4>
              <p class="plan-desc">
                {{ auth.user.value?.role === 'ADMIN' ? 'Pełny dostęp techniczny: scrapowanie danych FIS, kwarantanna wyników, zarządzanie rolami użytkowników i trenowanie modeli AI.' : auth.user.value?.role === 'USER_PRO' ? 'Pełny pakiet analityczny: nielimitowana porównywarka zawodników, prognozy AI sieci neuronowych (PyTorch) oraz wyceny Fantasy.' : auth.user.value?.role === 'USER_LITE' ? 'Dostęp do oficjalnych klasyfikacji FIS oraz porównywarki skoczków (do 2 zawodników w jednym zestawieniu).' : 'Podstawowy darmowy dostęp do bazy skoczków, skoczni oraz terminarza sesji.' }}
              </p>
            </div>

            <div class="features-checklist">
              <h5>Dostępne moduły:</h5>
              <ul>
                <li class="feature-active">✓ Baza skoczków, sesji i skoczni narciarskich</li>
                <li :class="auth.isAuthenticated.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.isAuthenticated.value ? '✓' : '🔒' }} Oficjalne klasyfikacje Pucharu Świata (FIS)
                </li>
                <li :class="auth.hasSearchAccess.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.hasSearchAccess.value ? '✓' : '🔒' }} Porównywarka zawodników (Panel Statystyczny)
                  <span v-if="auth.isLite.value" class="tag-sm">(do 2 skoczków)</span>
                </li>
                <li :class="auth.isPro.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.isPro.value ? '✓' : '🔒' }} Przewidywania AI sieci neuronowej & aero-profile wiatru
                </li>
                <li v-if="auth.isAdmin.value" class="feature-active">
                  ✓ Panel Zarządzania Bazy & Scrapowanie wyników FIS
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 30px 20px;
  background: #f8fafc;
  min-height: calc(100vh - 70px);
}

.profile-container {
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* HERO CARD */
.profile-hero-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 24px 28px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.avatar-wrapper {
  flex-shrink: 0;
}

.profile-avatar-large {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #0284c7;
  background: #f1f5f9;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.avatar-fallback-large {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: #64748b;
  border: 3px solid #cbd5e1;
}

.hero-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.user-display-name {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 800;
  color: #0f172a;
}

.role-pill {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 9999px;
  letter-spacing: 0.5px;
}

.role-admin {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #f87171;
}

.role-pro {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fbbf24;
}

.role-lite {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
}

.role-free {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.user-email {
  margin: 0;
  font-size: 0.95rem;
  color: #64748b;
}

.hero-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 4px;
  flex-wrap: wrap;
}

.hero-meta-row strong {
  color: #475569;
}

.meta-dot {
  color: #cbd5e1;
}

/* ALERTY */
.alert-box {
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-box.success {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
}

.alert-box.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
}

/* SIATKA KART */
.profile-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 24px;
}

@media (max-width: 860px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

.card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.card-header {
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
}

.card-header h3 {
  margin: 0 0 4px 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.82rem;
}

.card-body {
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* FORMS */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.92rem;
  color: #0f172a;
  background: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.field-hint {
  font-size: 0.78rem;
  color: #64748b;
}

/* AVATAR TABS */
.avatar-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.avatar-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 8px;
  flex-wrap: wrap;
}

.avatar-tab-btn {
  background: none;
  border: none;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.avatar-tab-btn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.avatar-tab-btn.active {
  background: #0284c7;
  color: white;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.sub-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  display: block;
  margin-bottom: 6px;
}

.style-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.style-chip {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
  transition: all 0.15s;
}

.style-chip.active {
  background: #e0f2fe;
  border-color: #0284c7;
  color: #0369a1;
}

.theme-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.theme-btn {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
  transition: all 0.15s;
}

.theme-btn:hover {
  background: #f0fdf4;
  border-color: #86efac;
}

.generator-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-top: 6px;
}

.upload-dropzone {
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.upload-dropzone:hover {
  border-color: #0284c7;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.upload-icon {
  font-size: 2rem;
}

.upload-label strong {
  font-size: 0.88rem;
  color: #0f172a;
}

.upload-label small {
  font-size: 0.76rem;
  color: #64748b;
}

.file-input-hidden {
  display: none;
}

/* BUTTONS */
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover:not(:disabled) {
  background: #0369a1;
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-secondary {
  background: white;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #f1f5f9;
}

.btn-cancel {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel:hover:not(:disabled) {
  background: #e2e8f0;
}

.btn-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-text {
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.8rem;
  cursor: pointer;
}

.btn-text:hover {
  text-decoration: underline;
  color: #0f172a;
}

/* PLAN BOX */
.plan-summary-box {
  border-radius: 8px;
  padding: 16px;
  border: 1px solid #e2e8f0;
}

.plan-summary-box h4 {
  margin: 6px 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.plan-desc {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
}

.plan-badge-large {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.features-checklist h5 {
  margin: 0 0 10px 0;
  font-size: 0.85rem;
  color: #334155;
}

.features-checklist ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.82rem;
}

.feature-active {
  color: #15803d;
  font-weight: 500;
}

.feature-inactive {
  color: #94a3b8;
}

.tag-sm {
  font-size: 0.75rem;
  color: #64748b;
  margin-left: 4px;
}
</style>
