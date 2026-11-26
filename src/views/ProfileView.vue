<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/stores/auth'
import { useNotifications } from '@/stores/notifications'
import CountryFlag from '@/components/CountryFlag.vue'
import { api } from '@/api/client'

const auth = useAuth()
const router = useRouter()
const {
  notifications: notifHistory,
  unreadCount: notifUnreadCount,
  isLoadingNotifs,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
} = useNotifications()

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
  loadEsmStatus()
  searchDirectory()
  fetchNotifications(100)
})

const openHistoryNotification = async (n: any) => {
  if (!n.is_read) {
    await markAsRead(n.id)
  }
  router.push(n.link || '/draft')
}

// --- INTEGRACJA ESM MANAGER + ZNAJOMI FANTASKI ---
const esmStatus = ref<any>(null)
const isLoadingEsm = ref(false)
const isSyncingEsm = ref(false)
const esmSuccessMsg = ref('')
const esmErrorMsg = ref('')

const directoryQuery = ref('')
const directoryResults = ref<any[]>([])
const isLoadingDirectory = ref(false)
const friendActionUserId = ref<string | null>(null)

const loadEsmStatus = async () => {
  if (!auth.isAuthenticated.value) return
  isLoadingEsm.value = true
  try {
    esmStatus.value = await api.get<any>('/esm/status')
  } catch (e: any) {
    console.warn('Nie udało się pobrać statusu ESM:', e)
  } finally {
    isLoadingEsm.value = false
  }
}

const syncEsmNow = async () => {
  esmErrorMsg.value = ''
  esmSuccessMsg.value = ''
  isSyncingEsm.value = true
  try {
    const data = await api.post<any>('/esm/sync', {})
    esmStatus.value = data
    esmSuccessMsg.value = data.message || 'Składy zostały zaktualizowane!'
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się odświeżyć danych z ESM.'
  } finally {
    isSyncingEsm.value = false
  }
}

const searchDirectory = async () => {
  if (!auth.isAuthenticated.value) return
  isLoadingDirectory.value = true
  try {
    const q = encodeURIComponent(directoryQuery.value.trim())
    directoryResults.value = await api.get<any[]>(`/esm/friends/directory?q=${q}`)
  } catch (e: any) {
    console.warn('Błąd wyszukiwania graczy:', e)
  } finally {
    isLoadingDirectory.value = false
  }
}

const sendFriendRequest = async (targetUserId: string) => {
  esmErrorMsg.value = ''
  esmSuccessMsg.value = ''
  friendActionUserId.value = targetUserId
  try {
    const data = await api.post<any>(`/esm/friends/request/${encodeURIComponent(targetUserId)}`, {})
    esmStatus.value = data
    esmSuccessMsg.value = data.message || 'Wysłano zaproszenie!'
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się wysłać zaproszenia.'
  } finally {
    friendActionUserId.value = null
  }
}

const acceptFriendRequest = async (requesterUserId: string) => {
  esmErrorMsg.value = ''
  esmSuccessMsg.value = ''
  friendActionUserId.value = requesterUserId
  try {
    const data = await api.post<any>(`/esm/friends/accept/${encodeURIComponent(requesterUserId)}`, {})
    esmStatus.value = data
    esmSuccessMsg.value = data.message || 'Zaakceptowano zaproszenie!'
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się zaakceptować zaproszenia.'
  } finally {
    friendActionUserId.value = null
  }
}

const rejectFriendRequest = async (requesterUserId: string) => {
  esmErrorMsg.value = ''
  friendActionUserId.value = requesterUserId
  try {
    const data = await api.post<any>(`/esm/friends/reject/${encodeURIComponent(requesterUserId)}`, {})
    esmStatus.value = data
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się odrzucić zaproszenia.'
  } finally {
    friendActionUserId.value = null
  }
}

const cancelFriendRequest = async (targetUserId: string) => {
  esmErrorMsg.value = ''
  friendActionUserId.value = targetUserId
  try {
    const data = await api.delete<any>(`/esm/friends/request/${encodeURIComponent(targetUserId)}`)
    esmStatus.value = data
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się anulować zaproszenia.'
  } finally {
    friendActionUserId.value = null
  }
}

const removeFantaskiFriend = async (friendUserId: string) => {
  if (!confirm('Czy na pewno usunąć tego gracza ze znajomych?')) return
  esmErrorMsg.value = ''
  friendActionUserId.value = friendUserId
  try {
    const data = await api.delete<any>(`/esm/friends/${encodeURIComponent(friendUserId)}`)
    esmStatus.value = data
    esmSuccessMsg.value = data.message || 'Usunięto ze znajomych.'
    await searchDirectory()
  } catch (e: any) {
    esmErrorMsg.value = e.message || 'Nie udało się usunąć znajomego.'
  } finally {
    friendActionUserId.value = null
  }
}

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
  return 'FREE'
}

const getRoleClass = (role?: string) => {
  if (role === 'ADMIN') return 'role-admin'
  if (role === 'USER_PRO') return 'role-pro'
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
              <h4>{{ auth.user.value?.role === 'ADMIN' ? 'Pakiet Administratorski' : auth.user.value?.role === 'USER_PRO' ? 'FantaSKI PRO' : 'Konto Darmowe' }}</h4>
              <p class="plan-desc">
                {{ auth.user.value?.role === 'ADMIN' ? 'Pełny dostęp techniczny: scrapowanie danych FIS, kwarantanna wyników, zarządzanie rolami użytkowników i trenowanie modeli AI.' : auth.user.value?.role === 'USER_PRO' ? 'Pełny pakiet analityczny: nielimitowana porównywarka, wszystkie składy ESM znajomych, nielimitowane ligi Drafta oraz prognozy AI.' : 'Darmowy dostęp po zalogowaniu: bazy i klasyfikacje FIS, 1 liga Drafta, porównywarka (max 2 skoczków i 10 skoków).' }}
              </p>
            </div>

            <div class="features-checklist">
              <h5>Dostępne moduły:</h5>
              <ul>
                <li class="feature-active">✓ Baza skoczków, sesji, skoczni i klasyfikacje FIS</li>
                <li :class="auth.isAuthenticated.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.isAuthenticated.value ? '✓' : '🔒' }} Ligi Drafta Fantasy
                  <span v-if="!auth.isPro.value" class="tag-sm">(max 1 liga)</span>
                </li>
                <li :class="auth.isAuthenticated.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.isAuthenticated.value ? '✓' : '🔒' }} Porównywarka zawodników (Panel Statystyczny)
                  <span v-if="!auth.isPro.value" class="tag-sm">(do 2 skoczków / 10 skoków)</span>
                </li>
                <li :class="auth.isPro.value ? 'feature-active' : 'feature-inactive'">
                  {{ auth.isPro.value ? '✓' : '🔒' }} Prognozy sieci neuronowej &amp; aero-profile wiatru
                </li>
                <li v-if="auth.isAdmin.value" class="feature-active">
                  ✓ Panel Zarządzania Bazy & Scrapowanie wyników FIS
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- KARTA INTEGRACJI Z ESM MANAGER I ZNAJOMYCH FANTASKI -->
      <div class="card esm-card">
        <div class="card-header esm-header-row">
          <div>
            <h3>🏆 Integracja z esmManager (Fantasy Skoki)</h3>
            <p class="subtitle">
              Twój skład z bieżącego sezonu oraz zaakceptowani znajomi z FantaSKI automatycznie zasilają Porównywarkę Pakietów w wynikach konkursów.
            </p>
          </div>
          <div class="esm-header-actions">
            <span v-if="esmStatus?.connected" class="esm-connected-pill">✅ Zsynchronizowano z esmManager</span>
            <span v-else class="esm-pending-pill">⏳ Oczekuje na przypisanie przez Admina</span>
            <button
              v-if="esmStatus?.connected || esmStatus?.friends?.length"
              type="button"
              class="btn-esm-sync"
              :disabled="isSyncingEsm"
              @click="syncEsmNow"
            >
              {{ isSyncingEsm ? 'Synchronizacja...' : '🔄 Odśwież składy' }}
            </button>
          </div>
        </div>

        <div class="card-body">
          <div v-if="esmSuccessMsg" class="alert-box success"><span>✅</span> {{ esmSuccessMsg }}</div>
          <div v-if="esmErrorMsg" class="alert-box error"><span>⚠️</span> {{ esmErrorMsg }}</div>

          <!-- Informacja gdy admin jeszcze nie przypisał ESM Team ID -->
          <div v-if="!esmStatus?.connected" class="esm-unlinked-box">
            <div class="esm-unlinked-text">
              <strong>Konto nie jest jeszcze przypisane do drużyny esmManager.</strong>
              <p>
                Ze względów bezpieczeństwa powiązanie Twojego konta FantaSKI z ID drużyny w esmManager wykonuje wyłącznie Administrator w Panelu Admina.
                Gdy Administrator doda Twoje ID drużyny, w tym miejscu automatycznie pojawi się status synchronizacji oraz Twój skład.
              </p>
            </div>
            <RouterLink v-if="auth.isAdmin.value" to="/admin" class="btn-esm-sync">
              🛠️ Przypisz w Panelu Admina →
            </RouterLink>
          </div>

          <!-- Podgląd zsynchronizowanego składu użytkownika -->
          <div v-if="esmStatus?.my_team" class="esm-team-preview">
            <div class="esm-team-meta">
              <div>
                <h4>⛷️ Mój Skład: {{ esmStatus.my_team.team_name }}</h4>
                <small class="field-hint">
                  ID Drużyny: <code>{{ esmStatus.team_id }}</code> • Ostatnia synchronizacja: {{ formatDate(esmStatus.last_synced_at) }}
                </small>
              </div>
              <div class="esm-team-pills">
                <span v-if="esmStatus.my_team.value != null" class="esm-stat-chip">Wartość: {{ esmStatus.my_team.value }}</span>
                <span class="esm-stat-chip">Pkt ESM: {{ esmStatus.my_team.total_points }}</span>
              </div>
            </div>

            <div class="esm-squad-columns">
              <div class="esm-squad-group">
                <h5>⭐ Podstawowy skład ({{ esmStatus.my_team.starters?.length || 0 }})</h5>
                <div class="esm-player-list">
                  <div v-for="p in esmStatus.my_team.starters" :key="p.esm_id || p.esm_fullname" class="esm-player-chip">
                    <CountryFlag :code="p.country" size="xs" />
                    <span class="esm-p-name">{{ p.fis_name || p.esm_fullname }}</span>
                    <span v-if="p.price != null" class="esm-p-price">{{ Number(p.price).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
              <div class="esm-squad-group">
                <h5>🪑 Ławka rezerwowych ({{ esmStatus.my_team.bench?.length || 0 }})</h5>
                <div class="esm-player-list">
                  <div v-for="p in esmStatus.my_team.bench" :key="p.esm_id || p.esm_fullname" class="esm-player-chip bench">
                    <CountryFlag :code="p.country" size="xs" />
                    <span class="esm-p-name">{{ p.fis_name || p.esm_fullname }}</span>
                    <span v-if="p.price != null" class="esm-p-price">{{ Number(p.price).toFixed(1) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SEKCJA ZNAJOMYCH WEWNĄTRZ FANTASKI (ZAPROSZENIA + PRYWATNOŚĆ) -->
          <div class="esm-friends-section">
            <div class="esm-friends-header">
              <h5>👥 Znajomi w FantaSKI ({{ esmStatus?.friends?.length || 0 }})</h5>
              <small class="field-hint">
                Zaproś innych graczy FantaSKI z podpiętą drużyną ESM. Po akceptacji zaproszenia ich aktualne składy pojawią się automatycznie w Porównywarce Pakietów.
              </small>
            </div>

            <!-- Otrzymane zaproszenia -->
            <div v-if="esmStatus?.incoming_requests?.length" class="esm-req-block">
              <h6 class="esm-sub-heading">📩 Oczekujące zaproszenia ({{ esmStatus.incoming_requests.length }})</h6>
              <div class="esm-req-list">
                <div v-for="req in esmStatus.incoming_requests" :key="req.user_id" class="esm-req-card incoming">
                  <div class="esm-user-ident">
                    <img v-if="req.picture" :src="req.picture" class="esm-mini-avatar" alt="Avatar" />
                    <div>
                      <strong>{{ req.name }}</strong>
                      <small class="field-hint">Drużyna: {{ req.team_name }}</small>
                    </div>
                  </div>
                  <div class="esm-req-actions">
                    <button
                      type="button"
                      class="btn-req-accept"
                      :disabled="friendActionUserId === req.user_id"
                      @click="acceptFriendRequest(req.user_id)"
                    >
                      ✓ Akceptuj
                    </button>
                    <button
                      type="button"
                      class="btn-req-reject"
                      :disabled="friendActionUserId === req.user_id"
                      @click="rejectFriendRequest(req.user_id)"
                    >
                      ✕ Odrzuć
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Wysłane zaproszenia -->
            <div v-if="esmStatus?.outgoing_requests?.length" class="esm-req-block">
              <h6 class="esm-sub-heading">📤 Wysłane zaproszenia ({{ esmStatus.outgoing_requests.length }})</h6>
              <div class="esm-req-list">
                <div v-for="req in esmStatus.outgoing_requests" :key="req.user_id" class="esm-req-card">
                  <div class="esm-user-ident">
                    <img v-if="req.picture" :src="req.picture" class="esm-mini-avatar" alt="Avatar" />
                    <div>
                      <strong>{{ req.name }}</strong>
                      <small class="field-hint">Drużyna: {{ req.team_name }}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn-req-reject"
                    :disabled="friendActionUserId === req.user_id"
                    @click="cancelFriendRequest(req.user_id)"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </div>

            <!-- Zaakceptowani znajomi + składy -->
            <div v-if="esmStatus?.friends?.length" class="esm-friends-grid">
              <div v-for="fr in esmStatus.friends" :key="fr.user_id || fr.id" class="esm-friend-card">
                <div class="esm-friend-top">
                  <div class="esm-user-ident">
                    <img v-if="fr.picture" :src="fr.picture" class="esm-mini-avatar" alt="Avatar" />
                    <div>
                      <strong>{{ fr.display_name }}</strong>
                      <small v-if="fr.team_name" class="field-hint"> ({{ fr.team_name }})</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn-text"
                    :disabled="friendActionUserId === (fr.user_id || fr.id)"
                    @click="removeFantaskiFriend(fr.user_id || fr.id)"
                    title="Usuń ze znajomych"
                  >
                    ✕
                  </button>
                </div>
                <div class="esm-friend-players" v-if="fr.starters?.length">
                  <span v-for="p in fr.starters" :key="p.esm_id || p.esm_fullname" class="esm-mini-tag">
                    ⭐ {{ p.fis_name || p.esm_fullname }}
                  </span>
                </div>
                <small v-else class="field-hint">Ten znajomy nie ma jeszcze zsynchronizowanego składu.</small>
              </div>
            </div>

            <!-- Wyszukiwarka graczy FantaSKI (bez adresów e-mail) -->
            <div class="esm-directory-box">
              <h6 class="esm-sub-heading">🔍 Znajdź znajomych w FantaSKI</h6>
              <div class="esm-directory-search">
                <input
                  v-model="directoryQuery"
                  type="text"
                  class="form-input"
                  placeholder="Szukaj po nazwie gracza lub nazwie drużyny ESM..."
                  @keyup.enter="searchDirectory"
                />
                <button type="button" class="btn-esm-sync" :disabled="isLoadingDirectory" @click="searchDirectory">
                  {{ isLoadingDirectory ? 'Szukanie...' : 'Szukaj' }}
                </button>
              </div>

              <div v-if="directoryResults.length" class="esm-directory-list">
                <div v-for="player in directoryResults" :key="player.user_id" class="esm-dir-item">
                  <div class="esm-user-ident">
                    <img v-if="player.picture" :src="player.picture" class="esm-mini-avatar" alt="Avatar" />
                    <div>
                      <strong>{{ player.name }}</strong>
                      <small class="field-hint">
                        Drużyna: {{ player.team_name }}
                        <template v-if="player.value != null"> • {{ player.value }} mln</template>
                      </small>
                    </div>
                  </div>
                  <div>
                    <span v-if="player.relation === 'friend'" class="esm-rel-pill friend">✓ Znajomy</span>
                    <button
                      v-else-if="player.relation === 'incoming'"
                      type="button"
                      class="btn-req-accept"
                      :disabled="friendActionUserId === player.user_id"
                      @click="acceptFriendRequest(player.user_id)"
                    >
                      ✓ Akceptuj
                    </button>
                    <button
                      v-else-if="player.relation === 'outgoing'"
                      type="button"
                      class="btn-req-reject"
                      :disabled="friendActionUserId === player.user_id"
                      @click="cancelFriendRequest(player.user_id)"
                    >
                      ⏳ Wysłano (Anuluj)
                    </button>
                    <button
                      v-else
                      type="button"
                      class="btn-esm-sync"
                      :disabled="friendActionUserId === player.user_id"
                      @click="sendFriendRequest(player.user_id)"
                    >
                      + Wyślij zaproszenie
                    </button>
                  </div>
                </div>
              </div>
              <small v-else class="field-hint">
                Brak innych graczy FantaSKI z przypisaną drużyną ESM dla tego wyszukiwania.
              </small>
            </div>
          </div>
        </div>
      </div>

      <!-- KARTA HISTORII POWIADOMIEŃ -->
      <div class="card notif-history-card">
        <div class="card-header esm-header-row">
          <div>
            <h3>🔔 Historia powiadomień ({{ notifHistory.length }})</h3>
            <p class="subtitle">
              Pełne archiwum powiadomień o Drafcie i ligach. Po kliknięciu powiadomienie znika z dzwoneczka na górze, ale pozostaje tutaj na stałe.
            </p>
          </div>
          <div class="esm-header-actions">
            <button
              v-if="notifUnreadCount > 0"
              type="button"
              class="btn-esm-sync"
              @click="markAllAsRead"
            >
              ✓ Oznacz wszystkie jako przeczytane
            </button>
            <button type="button" class="btn-secondary" :disabled="isLoadingNotifs" @click="fetchNotifications(100)">
              🔄 Odśwież
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="notifHistory.length === 0" class="field-hint">
            Brak zapisanych powiadomień.
          </div>
          <div v-else class="notif-history-list">
            <div
              v-for="n in notifHistory"
              :key="n.id"
              class="notif-history-item"
              :class="{ unread: !n.is_read }"
            >
              <div class="notif-hist-main">
                <div class="notif-hist-top">
                  <span class="notif-hist-badge" :class="n.is_read ? 'read' : 'new'">
                    {{ n.is_read ? 'Przeczytane' : 'Nowe' }}
                  </span>
                  <strong>{{ n.title }}</strong>
                  <small class="field-hint">{{ n.created_at ? new Date(n.created_at).toLocaleString() : '' }}</small>
                </div>
                <p class="notif-hist-msg">{{ n.message }}</p>
              </div>
              <button type="button" class="btn-esm-sync" @click="openHistoryNotification(n)">
                Otwórz →
              </button>
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

.esm-card {
  width: 100%;
}

.esm-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
}

.esm-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.esm-connected-pill {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.btn-esm-sync {
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid #0284c7;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
}

.btn-esm-sync:hover:not(:disabled) {
  background: #bae6fd;
}

.btn-esm-disconnect {
  padding: 7px 12px;
  border-radius: 7px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
}

.esm-connect-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.esm-mode-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.esm-form-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.esm-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.esm-connect-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.esm-league-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.form-input-sm {
  font-size: 0.82rem;
  padding: 7px 10px;
  font-family: 'JetBrains Mono', monospace;
}

.esm-team-preview {
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  border-radius: 10px;
  padding: 14px 16px;
}

.esm-team-meta {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.esm-team-meta h4 {
  margin: 0 0 2px 0;
  color: #0c4a6e;
}

.esm-team-pills {
  display: flex;
  gap: 8px;
}

.esm-stat-chip {
  background: white;
  border: 1px solid #7dd3fc;
  color: #0369a1;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
}

.esm-squad-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.esm-squad-group h5 {
  margin: 0 0 8px 0;
  font-size: 0.82rem;
  color: #334155;
}

.esm-player-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.esm-player-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 0.82rem;
}

.esm-player-chip.bench {
  background: #f8fafc;
  opacity: 0.92;
}

.esm-p-country {
  font-size: 0.72rem;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
  padding: 1px 6px;
  border-radius: 4px;
}

.esm-p-name {
  flex: 1;
  font-weight: 600;
  color: #0f172a;
}

.esm-p-price {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #0369a1;
}

.esm-friends-section {
  border-top: 1px solid #e2e8f0;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.esm-friends-header h5 {
  margin: 0;
  font-size: 0.9rem;
  color: #0f172a;
}

.esm-add-friend-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr auto;
  gap: 8px;
}

.esm-friends-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.esm-friend-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.esm-friend-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.esm-friend-players {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.esm-mini-tag {
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.72rem;
  color: #334155;
}

.esm-pending-pill {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 700;
}

.esm-unlinked-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 14px 16px;
}

.esm-unlinked-text p {
  margin: 4px 0 0 0;
  font-size: 0.85rem;
  color: #475569;
  max-width: 720px;
}

.esm-req-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.esm-sub-heading {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}

.esm-req-list,
.esm-directory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.esm-req-card,
.esm-dir-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 9px 12px;
}

.esm-req-card.incoming {
  border-color: #93c5fd;
  background: #eff6ff;
}

.esm-user-ident {
  display: flex;
  align-items: center;
  gap: 10px;
}

.esm-user-ident > div {
  display: flex;
  flex-direction: column;
}

.esm-mini-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid #cbd5e1;
}

.esm-req-actions {
  display: flex;
  gap: 6px;
}

.btn-req-accept {
  border: 1px solid #16a34a;
  background: #16a34a;
  color: #ffffff;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-req-reject {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.esm-directory-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.esm-directory-search {
  display: flex;
  gap: 8px;
}

.esm-rel-pill.friend {
  display: inline-block;
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #6ee7b7;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.notif-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notif-history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.notif-history-item.unread {
  border-color: #93c5fd;
  background: #eff6ff;
}

.notif-hist-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.notif-hist-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.notif-hist-badge {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
}

.notif-hist-badge.new {
  background: #0284c7;
  color: #ffffff;
}

.notif-hist-badge.read {
  background: #e2e8f0;
  color: #475569;
}

.notif-hist-msg {
  margin: 0;
  font-size: 0.85rem;
  color: #334155;
}

@media (max-width: 768px) {
  .esm-form-grid,
  .esm-squad-columns,
  .esm-add-friend-row,
  .esm-directory-search {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
}
</style>
