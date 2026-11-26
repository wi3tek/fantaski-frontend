<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const sessionId = route.params.id

const session = ref<any>(null)
const loading = ref(true)

// ========================================================
// --- SYSTEM PAKIETÓW ZAWODNIKÓW (SMART PORÓWNYWARKA) ---
// ========================================================
export interface AthletePackage {
  id: string
  name: string
  athletes: string[] // Lista nazwisk zawodników (agnostyczna do konkursu)
}

export interface EsmPlayer {
  esm_id?: string | null
  esm_fullname?: string | null
  fis_code?: number | null
  fis_name?: string | null
  country?: string | null
  price?: number | null
  is_captain?: boolean
  group?: number
}

export interface EsmTeam {
  team_id: string
  team_name?: string | null
  league_id?: string | null
  value?: number | null
  income?: number | null
  total_points?: number | null
  starters: EsmPlayer[]
  bench: EsmPlayer[]
  all_players: EsmPlayer[]
  synced_at?: string | null
}

export interface EsmFriendTeam extends EsmTeam {
  id: string
  display_name: string
  source?: string
}

export interface EsmStatusResponse {
  connected: boolean
  has_token: boolean
  token_email?: string | null
  league_id: string
  team_id?: string | null
  my_team?: EsmTeam | null
  friends: EsmFriendTeam[]
  last_synced_at?: string | null
}

const STORAGE_KEY = 'fantaski_athlete_packages'
const selectedAthletes = ref<string[]>([])
const newPackageName = ref('')
const savedPackages = ref<AthletePackage[]>([])
const editingPackageId = ref<string | null>(null)
const editingPackageName = ref('')
const showPackageDrawer = ref(false)
const pricesMap = ref<Record<string, number>>({})

const fetchPrices = async () => {
  try {
    const data: { name: string; fis_code: number; price: number }[] = await api.get(
      '/stats/athletes/with-prices',
      { cacheTtlMs: 60000 }
    )
    const map: Record<string, number> = {}
    for (const item of data) {
      if (item.fis_code != null) map[String(item.fis_code)] = item.price
      if (item.name) map[item.name.toLowerCase().trim()] = item.price
    }
    pricesMap.value = map
  } catch (e) {
    // cichy fallback offline
  }
}

const getAthletePrice = (athlete: any): number | null => {
  if (athlete?.price != null) return Number(athlete.price)
  if (athlete?.fis_code != null && pricesMap.value[String(athlete.fis_code)] !== undefined) {
    return pricesMap.value[String(athlete.fis_code)] ?? null
  }
  const cleanName = athlete?.name?.toLowerCase().trim()
  if (cleanName && pricesMap.value[cleanName] !== undefined) {
    return pricesMap.value[cleanName] ?? null
  }
  return null
}

const getAthletePriceByName = (name: string): number | null => {
  if (!name) return null
  const cleanName = name.toLowerCase().trim()
  return pricesMap.value[cleanName] ?? null
}

const calcPackagePrice = (athleteNames: string[]): number => {
  return athleteNames.reduce((acc, name) => {
    const p = getAthletePriceByName(name)
    return acc + (p || 0)
  }, 0)
}

const currentSelectionPrice = computed(() => {
  return calcPackagePrice(selectedAthletes.value)
})

const loadPackagesFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      savedPackages.value = JSON.parse(raw)
    }
  } catch (e) {
    console.error('Błąd odczytu pakietów z localStorage:', e)
  }
}

const savePackagesToStorage = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPackages.value))
  } catch (e) {
    console.error('Błąd zapisu pakietów do localStorage:', e)
  }
}

// Mapowanie wyników bieżącego konkursu dla szybkiego dostępu { [name]: competition_points }
const sessionPointsMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  if (!session.value?.results_data?.results) return map
  for (const r of session.value.results_data.results) {
    if (r.name) {
      map[r.name.trim().toUpperCase()] = Number(r.competition_points) || 0
    }
  }
  return map
})

// Obliczanie punktów PŚ dla dowolnej listy zawodników w tym konkursie
const getAthletePts = (name: string): number => {
  if (!name) return 0
  return sessionPointsMap.value[name.trim().toUpperCase()] || 0
}

const calcPackagePoints = (athleteNames: string[]): number => {
  return athleteNames.reduce((acc, name) => {
    return acc + getAthletePts(name)
  }, 0)
}

// Suma punktów PŚ aktualnie zaznaczonych zawodników
const currentSelectionPoints = computed(() => {
  return calcPackagePoints(selectedAthletes.value)
})

// Najwyższy wynik punktowy wśród wszystkich składów (ESM + zapisane własne)
const bestPackagePoints = computed(() => {
  if (allComparisonSquads.value.length === 0) return 0
  return Math.max(...allComparisonSquads.value.map((s) => calcPackagePoints(s.athletes)))
})

// Przełączanie zaznaczenia zawodnika
const toggleAthlete = (name: string) => {
  const idx = selectedAthletes.value.indexOf(name)
  if (idx !== -1) {
    selectedAthletes.value.splice(idx, 1)
  } else {
    if (selectedAthletes.value.length >= 8) {
      alert('Możesz zaznaczyć maksymalnie 8 zawodników w jednym składzie!')
      return
    }
    selectedAthletes.value.push(name)
  }
}

const isAthleteSelected = (name: string): boolean => {
  return selectedAthletes.value.includes(name)
}

const clearSelection = () => {
  selectedAthletes.value = []
}

// Zapisanie bieżącego składu do localStorage (tylko PRO)
const saveCurrentPackage = () => {
  if (!auth.isPro.value) return
  if (selectedAthletes.value.length === 0) {
    alert('Zaznacz przynajmniej jednego zawodnika w tabeli!')
    return
  }

  const customCount = customSavedPackages.value.length
  const name = newPackageName.value.trim() || `Skład #${customCount + 1} (${selectedAthletes.value.length} skoczków)`

  const newPkg: AthletePackage = {
    id: 'pkg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    athletes: [...selectedAthletes.value],
  }

  savedPackages.value.push(newPkg)
  savePackagesToStorage()
  newPackageName.value = ''
  showPackageDrawer.value = true
}

// Zastosowanie składu jako bieżące zaznaczenie w tabeli
const applyPackageToSelection = (athletes: string[]) => {
  selectedAthletes.value = [...athletes.slice(0, 8)]
}

// Usunięcie własnego zapisanego składu (tylko PRO)
const deletePackage = (id: string) => {
  if (!auth.isPro.value) return
  savedPackages.value = savedPackages.value.filter((p) => p.id !== id)
  savePackagesToStorage()
}

const fetchDetails = async () => {
  try {
    session.value = await api.get(`/stats/sessions/${sessionId}`)
  } catch (e) {
    console.error('Błąd:', e)
    alert('Nie znaleziono sesji.')
    router.push('/sessions')
  } finally {
    loading.value = false
  }
}

// ========================================================
// --- INTEGRACJA Z ESMMANAGER (SKŁAD + ZNAJOMI) ---
// ========================================================
const ESM_SCOPE_STORAGE_KEY = 'fantaski_esm_squad_scope'
const savedScope = typeof window !== 'undefined' ? localStorage.getItem(ESM_SCOPE_STORAGE_KEY) : null
const esmStatus = ref<EsmStatusResponse | null>(null)
const esmSquadScope = ref<'starters' | 'all'>(savedScope === 'all' ? 'all' : 'starters')
const isSyncingEsmInline = ref(false)
const esmActionMessage = ref('')

const normalizeAthName = (name?: string | null): string =>
  (name || '').trim().replace(/\s+/g, ' ').toUpperCase()

const resolveEsmPlayerNameInSession = (player: EsmPlayer): string | null => {
  const results = session.value?.results_data?.results || []
  if (player.fis_code != null) {
    const byCode = results.find((r: any) => r.fis_code != null && Number(r.fis_code) === Number(player.fis_code))
    if (byCode?.name) return byCode.name
  }
  const candNames = [player.fis_name, player.esm_fullname].filter(Boolean).map((n) => normalizeAthName(n))
  if (candNames.length > 0) {
    const byName = results.find((r: any) => candNames.includes(normalizeAthName(r.name)))
    if (byName?.name) return byName.name
  }
  return player.fis_name || player.esm_fullname || null
}

const getTeamPlayersForScope = (team: EsmTeam, scope: 'starters' | 'all' = esmSquadScope.value): EsmPlayer[] => {
  if (scope === 'starters') {
    return Array.isArray(team.starters) && team.starters.length > 0
      ? team.starters
      : (team.all_players || []).slice(0, 4)
  }
  if (Array.isArray(team.all_players) && team.all_players.length > 0) {
    return team.all_players
  }
  return [...(team.starters || []), ...(team.bench || [])]
}

const resolveTeamAthleteNames = (team: EsmTeam, scope: 'starters' | 'all' = esmSquadScope.value): string[] => {
  const players = getTeamPlayersForScope(team, scope)
  const resolved = players
    .map((p) => resolveEsmPlayerNameInSession(p))
    .filter((name): name is string => Boolean(name))
  return Array.from(new Set(resolved)).slice(0, 8)
}

const esmStarterLookup = computed(() => {
  const codes = new Set<number>()
  const names = new Set<string>()
  for (const p of esmStatus.value?.my_team?.starters || []) {
    if (p.fis_code != null) codes.add(Number(p.fis_code))
    if (p.fis_name) names.add(normalizeAthName(p.fis_name))
    if (p.esm_fullname) names.add(normalizeAthName(p.esm_fullname))
  }
  return { codes, names }
})

const esmBenchLookup = computed(() => {
  const codes = new Set<number>()
  const names = new Set<string>()
  for (const p of esmStatus.value?.my_team?.bench || []) {
    if (p.fis_code != null) codes.add(Number(p.fis_code))
    if (p.fis_name) names.add(normalizeAthName(p.fis_name))
    if (p.esm_fullname) names.add(normalizeAthName(p.esm_fullname))
  }
  return { codes, names }
})

const isEsmStarter = (athlete: any): boolean => {
  if (athlete?.fis_code != null && esmStarterLookup.value.codes.has(Number(athlete.fis_code))) return true
  return esmStarterLookup.value.names.has(normalizeAthName(athlete?.name))
}

const isEsmBench = (athlete: any): boolean => {
  if (isEsmStarter(athlete)) return false
  if (athlete?.fis_code != null && esmBenchLookup.value.codes.has(Number(athlete.fis_code))) return true
  return esmBenchLookup.value.names.has(normalizeAthName(athlete?.name))
}

const setEsmSquadScope = (scope: 'starters' | 'all') => {
  esmSquadScope.value = scope
  try {
    localStorage.setItem(ESM_SCOPE_STORAGE_KEY, scope)
  } catch {
    // ignore storage errors
  }
}

const customSavedPackages = computed(() =>
  auth.isPro.value ? savedPackages.value.filter((p) => !String(p.id).startsWith('esm_')) : []
)

const hasEsmTeams = computed(() =>
  Boolean(esmStatus.value?.my_team || (esmStatus.value?.friends || []).some((f) => f.all_players?.length || f.starters?.length))
)

const allComparisonSquads = computed(() => {
  const cards: { id: string; name: string; badge: string; athletes: string[]; removable: boolean }[] = []

  if (esmStatus.value?.my_team) {
    const myAth = resolveTeamAthleteNames(esmStatus.value.my_team, esmSquadScope.value)
    if (myAth.length > 0) {
      cards.push({
        id: `esm_my_${esmStatus.value.my_team.team_id}`,
        name: esmStatus.value.my_team.team_name || 'Mój skład ESM',
        badge: '⭐ Mój ESM',
        athletes: myAth,
        removable: false,
      })
    }
  }

  for (const fr of esmStatus.value?.friends || []) {
    const fAth = resolveTeamAthleteNames(fr, esmSquadScope.value)
    if (fAth.length > 0) {
      cards.push({
        id: `esm_friend_${fr.team_id || fr.id}`,
        name: fr.display_name || fr.team_name || 'Znajomy',
        badge: '👥 Znajomy',
        athletes: fAth,
        removable: false,
      })
    }
  }

  for (const pkg of customSavedPackages.value) {
    cards.push({
      id: pkg.id,
      name: pkg.name,
      badge: '💾 Własny',
      athletes: pkg.athletes,
      removable: true,
    })
  }

  return cards
})

const fetchEsmStatus = async () => {
  if (!auth.isAuthenticated.value) return
  try {
    esmStatus.value = await api.get('/esm/status')
  } catch {
    // Brak połączenia ESM – widok sesji działa normalnie
  }
}

const syncEsmInline = async () => {
  if (!auth.isAuthenticated.value || isSyncingEsmInline.value) return
  isSyncingEsmInline.value = true
  esmActionMessage.value = ''
  try {
    const res = await api.post('/esm/sync', {})
    esmStatus.value = res
    esmActionMessage.value = 'Odświeżono składy z esmManager.'
    setTimeout(() => {
      esmActionMessage.value = ''
    }, 3500)
  } catch (e: any) {
    esmActionMessage.value = e?.message || 'Nie udało się odświeżyć składów z ESM.'
  } finally {
    isSyncingEsmInline.value = false
  }
}

const maxRoundsCount = computed(() => {
  const res = session.value?.results_data?.results || []
  let maxR = session.value?.session_type === 'TRAINING' || session.value?.session_type === 'TRIAL' ? 1 : 2
  for (const ath of res) {
    if (Array.isArray(ath.jumps) && ath.jumps.length > maxR) {
      maxR = ath.jumps.length
    }
  }
  return maxR
})

const mobileViewMode = ref<'cards' | 'table'>('cards')
const expandedSessionRow = ref<string | null>(null)
const isTableFullScreen = ref(false)

const toggleExpandedRow = (key: string) => {
  expandedSessionRow.value = expandedSessionRow.value === key ? null : key
}

onMounted(() => {
  loadPackagesFromStorage()
  fetchDetails()
  fetchPrices()
  fetchEsmStatus()
})
</script>

<template>
  <div class="page">
    <SkiLoader v-if="loading">Ładowanie szczegółów zawodów...</SkiLoader>

    <div v-else-if="session" class="session-container">
      <!-- HEADER ZAWODÓW -->
      <div class="header">
        <button @click="router.back()" class="btn-back">← Powrót</button>
        <div class="title-section">
          <div class="place-row">
            <h2>{{ session.event_place }}</h2>
            <CountryFlag v-if="session.event_country" :code="session.event_country" size="md" :show-code="true" />
          </div>
          <h3 class="session-sub">{{ session.title }}</h3>
        </div>
        <div class="badges">
          <span class="badge blue">{{ session.category_code }}</span>
          <span class="badge gray">{{ session.session_type }}</span>
          <a v-if="session.raceUrl" :href="session.raceUrl" target="_blank" rel="noopener noreferrer" class="btn-fis" title="Oficjalny protokół FIS">
            Wyniki FIS ↗
          </a>
        </div>
      </div>

      <!-- KARTY INFORMACYJNE O SKOCZNI I SESJI -->
      <div class="info-grid">
        <div class="info-card">
          <div class="card-icon">📅</div>
          <div class="card-text">
            <span class="card-label">Termin</span>
            <strong>{{ session.date }}</strong>
            <small class="time-dim">{{ session.time || 'Godz. b/d' }}</small>
          </div>
        </div>
        <div class="info-card">
          <div class="card-icon">🏔️</div>
          <div class="card-text">
            <span class="card-label">Skocznia</span>
            <strong>{{ session.hillType || 'Normalna / Duża' }}</strong>
            <small class="time-dim">HS: {{ session.hillSize || 'Brak danych' }}</small>
          </div>
        </div>
        <div class="info-card" v-if="session.documents && session.documents.length > 0">
          <div class="card-icon">📄</div>
          <div class="card-text">
            <span class="card-label">Protokoły PDF</span>
            <div class="doc-links">
              <a v-for="doc in session.documents.slice(0, 2)" :key="doc.url" :href="doc.url" target="_blank" rel="noopener noreferrer" class="doc-link">
                {{ doc.type }} ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PORÓWNYWARKA SKŁADÓW (UPROSZCZONA, CZYSTA)               -->
      <!-- ======================================================== -->
      <div class="smart-package-hub">
        <!-- Pasek główny -->
        <div class="hub-main-bar">
          <div class="hub-left">
            <div class="hub-title">
              <span class="ski-icon">🎿</span>
              <strong>Porównywarka Składów</strong>
            </div>
            <div class="selection-pill" :class="{ active: selectedAthletes.length > 0, full: selectedAthletes.length >= 8 }">
              <span class="dots-meter">
                <span
                  v-for="i in 8"
                  :key="i"
                  class="dot"
                  :class="{ filled: i <= selectedAthletes.length }"
                ></span>
              </span>
              <span class="count-text">{{ selectedAthletes.length }}/8</span>
            </div>
          </div>

          <div class="hub-center">
            <div class="active-score" v-if="selectedAthletes.length > 0">
              <span class="score-caption">Suma Pkt PŚ:</span>
              <span class="score-val">+{{ currentSelectionPoints }}</span>
              <span v-if="currentSelectionPrice > 0" class="score-price">
                (Koszt: {{ currentSelectionPrice.toFixed(1) }})
              </span>
            </div>
            <span v-else class="hub-hint">
              Kliknij skoczków na liście poniżej, aby złożyć testowy skład (max 8)
            </span>
          </div>

          <div class="hub-right">
            <button
              v-if="allComparisonSquads.length > 0"
              @click="showPackageDrawer = !showPackageDrawer"
              class="btn-toggle-drawer"
              :class="{ open: showPackageDrawer }"
            >
              ⚖️ Porównaj składy ({{ allComparisonSquads.length }})
              <span class="arrow-icon">{{ showPackageDrawer ? '▴' : '▾' }}</span>
            </button>
            <RouterLink
              v-else-if="auth.isAuthenticated.value && !esmStatus?.connected"
              to="/profile"
              class="btn-esm-connect-link"
              title="Sprawdź status esmManager i znajomych w swoim profilu"
            >
              🏆 Składy ESM w Profilu
            </RouterLink>
            <button
              v-if="selectedAthletes.length > 0"
              @click="clearSelection"
              class="btn-clear-micro"
              title="Wyczyść bieżące zaznaczenie"
            >
              ✕ Wyczyść
            </button>
          </div>
        </div>

        <!-- Pasek zapisu bieżącego ręcznego wyboru (widoczny tylko gdy zaznaczono skoczków) -->
        <div class="selection-detail-strip" v-if="selectedAthletes.length > 0">
          <div class="selected-chips-scroll">
            <span
              v-for="athName in selectedAthletes"
              :key="athName"
              class="athlete-micro-chip"
            >
              <span class="chip-name">{{ athName }}</span>
              <span v-if="getAthletePriceByName(athName) != null" class="chip-price">
                {{ getAthletePriceByName(athName)!.toFixed(1) }}
              </span>
              <strong class="chip-pts">+{{ getAthletePts(athName) }}</strong>
              <button
                @click="toggleAthlete(athName)"
                class="chip-x"
                title="Usuń ze składu"
              >
                ✕
              </button>
            </span>
          </div>

          <div v-if="auth.isPro.value" class="quick-save-form">
            <input
              type="text"
              v-model="newPackageName"
              placeholder="Nazwa składu (np. Skład A)..."
              class="save-input-compact"
              @keyup.enter="saveCurrentPackage"
            />
            <button @click="saveCurrentPackage" class="btn-save-compact">
              💾 Zapisz jako skład
            </button>
          </div>
        </div>

        <!-- Jeden wspólny panel porównania składów (ESM + Zapisane własne) -->
        <div class="drawer-content" v-if="showPackageDrawer && allComparisonSquads.length > 0">
          <div class="drawer-header drawer-header-flex">
            <div>
              <span class="drawer-title">
                📊 Porównanie składów w tym konkursie ({{ session.event_place }})
              </span>
              <small class="drawer-subtitle">
                Twój skład ESM, składy znajomych oraz zapisane zestawy w jednym miejscu.
              </small>
            </div>
            <div v-if="hasEsmTeams" class="drawer-esm-controls">
              <div class="esm-scope-switch" title="Zakres zawodników w kartach esmManager">
                <button
                  type="button"
                  class="scope-btn"
                  :class="{ active: esmSquadScope === 'starters' }"
                  @click="setEsmSquadScope('starters')"
                >
                  Podst. 4
                </button>
                <button
                  type="button"
                  class="scope-btn"
                  :class="{ active: esmSquadScope === 'all' }"
                  @click="setEsmSquadScope('all')"
                >
                  Cały 8
                </button>
              </div>
              <button
                type="button"
                @click="syncEsmInline"
                :disabled="isSyncingEsmInline"
                class="btn-esm-action"
              >
                {{ isSyncingEsmInline ? '⏳ Odświeżanie...' : '🔄 Odśwież ESM' }}
              </button>
            </div>
          </div>

          <p v-if="esmActionMessage" class="esm-action-msg">{{ esmActionMessage }}</p>

          <div class="packages-compact-grid">
            <div
              v-for="sq in allComparisonSquads"
              :key="sq.id"
              class="pkg-compact-card"
              :class="{ 'is-leader': calcPackagePoints(sq.athletes) === bestPackagePoints && bestPackagePoints > 0 }"
            >
              <div class="card-top">
                <div class="title-with-actions">
                  <span class="squad-origin-tag">{{ sq.badge }}</span>
                  <strong class="pkg-label">{{ sq.name }}</strong>
                </div>

                <div class="card-corner-actions">
                  <button
                    @click="applyPackageToSelection(sq.athletes)"
                    class="btn-apply-micro"
                    title="Zaznacz tych skoczków w tabeli poniżej"
                  >
                    Pokaż w tabeli
                  </button>
                  <button
                    v-if="sq.removable"
                    @click="deletePackage(sq.id)"
                    class="btn-delete-micro"
                    title="Usuń zapisany skład"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div class="card-score-row">
                <div class="score-cluster">
                  <span class="pts-big">+{{ calcPackagePoints(sq.athletes) }}</span>
                  <span class="pts-unit">pkt PŚ</span>
                </div>
                <div class="score-meta">
                  <span
                    v-if="calcPackagePoints(sq.athletes) === bestPackagePoints && bestPackagePoints > 0"
                    class="leader-badge"
                  >
                    👑 Lider
                  </span>
                  <span
                    v-else-if="bestPackagePoints > calcPackagePoints(sq.athletes)"
                    class="delta-badge"
                  >
                    {{ calcPackagePoints(sq.athletes) - bestPackagePoints }} pkt
                  </span>
                  <span class="count-tag">{{ sq.athletes.length }} skoczków</span>
                  <span v-if="calcPackagePrice(sq.athletes) > 0" class="price-tag">
                    Koszt: {{ calcPackagePrice(sq.athletes).toFixed(1) }}
                  </span>
                </div>
              </div>

              <div class="compact-athletes-list">
                <div
                  v-for="ath in sq.athletes"
                  :key="ath"
                  class="ath-pill"
                >
                  <span class="ath-pill-name" :title="ath">{{ ath }}</span>
                  <span v-if="getAthletePriceByName(ath) != null" class="ath-pill-price">
                    {{ getAthletePriceByName(ath)!.toFixed(1) }}
                  </span>
                  <span class="ath-pill-pts" :class="{ zero: getAthletePts(ath) === 0 }">
                    +{{ getAthletePts(ath) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- TABELA WYNIKÓW ZAWODÓW (FIS LIVE FEEL, PODIUM, RESPONSYWNA) -->
      <!-- ======================================================== -->
      <div class="results-section">
        <div class="results-toolbar">
          <div class="toolbar-left">
            <h3>Oficjalne Wyniki Konkursu</h3>
            <span class="results-count" v-if="session.results_data?.results">
              {{ session.results_data.results.length }} skoczków
            </span>
          </div>
          <div class="toolbar-right-mobile">
            <span class="table-tip">
              💡 Kliknij wiersz lub pole 📦 aby dodać skoczka do testowego składu
            </span>
            <div class="s-view-switch mobile-only">
              <button
                type="button"
                class="s-switch-btn"
                :class="{ active: mobileViewMode === 'cards' }"
                @click="mobileViewMode = 'cards'"
              >
                🪪 Karty
              </button>
              <button
                type="button"
                class="s-switch-btn"
                :class="{ active: mobileViewMode === 'table' }"
                @click="mobileViewMode = 'table'"
              >
                📋 Tabela
              </button>
            </div>
          </div>
        </div>

        <div class="mobile-desktop-hint mobile-only">
          💻 Pełną tabelę wyników wszystkich serii i szczegółów zobaczysz na większym ekranie (komputerze).
        </div>

        <p v-if="session.results_data?.is_cancelled" class="cancelled-alert">
          ⚠️ Uwaga: Ta sesja została oficjalnie odwołana lub przerwana.
        </p>

        <!-- CZYTELNE KARTY MOBILNE WYNIKÓW SESJI (<= 768px) -->
        <div
          v-if="mobileViewMode === 'cards' && session.results_data?.results?.length > 0"
          class="session-mobile-list mobile-only"
        >
          <div
            v-for="(athlete, aIdx) in session.results_data.results"
            :key="'m_' + (athlete.fis_code || `${athlete.name}_${aIdx}`)"
            class="session-m-res-card"
            :class="{
              'row-selected': isAthleteSelected(athlete.name),
              'row-esm-starter': isEsmStarter(athlete),
              'row-esm-bench': isEsmBench(athlete),
              'podium-gold': athlete.rank === 1,
              'podium-silver': athlete.rank === 2,
              'podium-bronze': athlete.rank === 3,
            }"
            @click="toggleAthlete(athlete.name)"
          >
            <div class="smr-top">
              <div class="smr-left">
                <input
                  type="checkbox"
                  :checked="isAthleteSelected(athlete.name)"
                  @change="toggleAthlete(athlete.name)"
                  @click.stop
                  :disabled="!isAthleteSelected(athlete.name) && selectedAthletes.length >= 8"
                  class="smart-checkbox"
                  :aria-label="'Wybierz ' + athlete.name"
                />
                <span v-if="athlete.rank === 1" class="rank-badge gold">🥇 1</span>
                <span v-else-if="athlete.rank === 2" class="rank-badge silver">🥈 2</span>
                <span v-else-if="athlete.rank === 3" class="rank-badge bronze">🥉 3</span>
                <strong v-else class="rank-normal smr-rank">#{{ athlete.rank || '-' }}</strong>

                <CountryFlag v-if="athlete.country" :code="athlete.country" size="sm" />
                <div class="smr-name-wrap">
                  <RouterLink
                    v-if="athlete.fis_code"
                    :to="`/athletes/${athlete.fis_code}`"
                    class="athlete-link smr-name"
                    @click.stop
                  >
                    {{ athlete.name }}
                  </RouterLink>
                  <span v-else class="athlete-name-plain smr-name">{{ athlete.name }}</span>
                  <div class="smr-tags">
                    <span v-if="athlete.bib" class="bib-tag">Bib {{ athlete.bib }}</span>
                    <span v-if="athlete.status && athlete.status !== 'Classified'" class="status-dns">
                      {{ athlete.status }}
                    </span>
                    <span v-if="isEsmStarter(athlete)" class="esm-badge esm-starter">⭐ ESM</span>
                    <span v-else-if="isEsmBench(athlete)" class="esm-badge esm-bench">🪑 ESM (R)</span>
                  </div>
                </div>
              </div>

              <div class="smr-right">
                <span v-if="getAthletePrice(athlete) != null" class="price-chip">
                  {{ getAthletePrice(athlete)!.toFixed(1) }}
                </span>
                <span
                  v-if="athlete.competition_points > 0"
                  class="comp-pts-chip active"
                >
                  +{{ athlete.competition_points }} PŚ
                </span>
              </div>
            </div>

            <div class="smr-jumps-row">
              <div
                v-for="rNum in maxRoundsCount"
                :key="'mr_' + rNum"
                class="smr-jump-box"
              >
                <span class="smr-j-label">
                  {{ (session.session_type === 'TRAINING' || session.session_type === 'TRIAL') ? `Skok ${rNum}` : `Seria ${rNum}` }}
                </span>
                <template v-if="athlete.jumps && athlete.jumps[rNum - 1] && athlete.jumps[rNum - 1].distance">
                  <strong class="distance-main font-mono">{{ athlete.jumps[rNum - 1].distance }} m</strong>
                  <small class="jump-sub">
                    <template v-if="athlete.jumps[rNum - 1].points != null">{{ athlete.jumps[rNum - 1].points }} pkt</template>
                    <template v-if="athlete.jumps[rNum - 1].rank != null"> ({{ athlete.jumps[rNum - 1].rank }}.)</template>
                  </small>
                </template>
                <span v-else-if="athlete.jumps && athlete.jumps[rNum - 1] && athlete.jumps[rNum - 1].status" class="status-dns">
                  {{ athlete.jumps[rNum - 1].status }}
                </span>
                <span v-else class="dim-dash">-</span>
              </div>

              <div class="smr-jump-box smr-total-box">
                <span class="smr-j-label">Nota łączna</span>
                <strong class="font-mono smr-total-val">
                  {{ athlete.total_points != null ? athlete.total_points : '-' }}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div
          class="table-responsive"
          :class="{ 'desktop-only': mobileViewMode === 'cards' }"
          v-if="session.results_data?.results?.length > 0"
        >
          <table class="results-table">
            <thead>
              <tr>
                <th class="th-pkg" title="Dodaj do składu">📦</th>
                <th class="th-rank">Poz.</th>
                <th class="th-bib">Bib</th>
                <th class="th-name">Zawodnik</th>
                <th class="th-price">Cena</th>
                <th class="th-country">Kraj</th>
                <th v-for="rNum in maxRoundsCount" :key="rNum" class="th-jump">
                  {{ (session.session_type === 'TRAINING' || session.session_type === 'TRIAL') ? `Skok ${rNum}` : `Seria ${rNum}` }}
                </th>
                <th class="th-total">Łączna nota</th>
                <th class="th-points">Pkt PŚ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(athlete, aIdx) in session.results_data.results"
                :key="athlete.fis_code || `${athlete.name}_${aIdx}`"
                :class="{
                  'row-selected': isAthleteSelected(athlete.name),
                  'row-esm-starter': isEsmStarter(athlete),
                  'row-esm-bench': isEsmBench(athlete),
                  'podium-gold': athlete.rank === 1,
                  'podium-silver': athlete.rank === 2,
                  'podium-bronze': athlete.rank === 3,
                }"
                @click="toggleAthlete(athlete.name)"
              >
                <!-- Checkbox dodania do pakietu -->
                <td class="td-pkg" @click.stop>
                  <input
                    type="checkbox"
                    :checked="isAthleteSelected(athlete.name)"
                    @change="toggleAthlete(athlete.name)"
                    :disabled="!isAthleteSelected(athlete.name) && selectedAthletes.length >= 8"
                    class="smart-checkbox"
                    :aria-label="'Wybierz ' + athlete.name"
                  />
                </td>

                <!-- Pozycja z odznakami podium -->
                <td class="td-rank">
                  <span v-if="athlete.rank === 1" class="rank-badge gold" title="1. Miejsce">🥇 1</span>
                  <span v-else-if="athlete.rank === 2" class="rank-badge silver" title="2. Miejsce">🥈 2</span>
                  <span v-else-if="athlete.rank === 3" class="rank-badge bronze" title="3. Miejsce">🥉 3</span>
                  <strong v-else class="rank-normal">{{ athlete.rank || '-' }}</strong>
                </td>

                <!-- Numer startowy bib -->
                <td class="td-bib">
                  <span class="bib-tag">{{ athlete.bib || '-' }}</span>
                </td>

                <!-- Imię i Nazwisko -->
                <td class="td-name">
                  <RouterLink
                    v-if="athlete.fis_code"
                    :to="`/athletes/${athlete.fis_code}`"
                    class="athlete-link"
                    @click.stop
                  >
                    {{ athlete.name }}
                  </RouterLink>
                  <span v-else class="athlete-name-plain">{{ athlete.name }}</span>
                  <span v-if="athlete.status && athlete.status !== 'Classified'" class="status-dns">
                    {{ athlete.status }}
                  </span>
                  <span
                    v-if="isEsmStarter(athlete)"
                    class="esm-badge esm-starter"
                    title="W Twoim podstawowym składzie esmManager"
                  >
                    ⭐ ESM
                  </span>
                  <span
                    v-else-if="isEsmBench(athlete)"
                    class="esm-badge esm-bench"
                    title="Na ławce rezerwowych w esmManager"
                  >
                    🪑 ESM (R)
                  </span>
                </td>

                <!-- Cena ESM -->
                <td class="td-price">
                  <span v-if="getAthletePrice(athlete) != null" class="price-chip">
                    {{ getAthletePrice(athlete)!.toFixed(1) }}
                  </span>
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Kraj -->
                <td class="td-country">
                  <CountryFlag v-if="athlete.country" :code="athlete.country" size="sm" />
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Skoki dynamiczne (1..maxRoundsCount) -->
                <td v-for="rNum in maxRoundsCount" :key="rNum" class="td-jump">
                  <div v-if="athlete.jumps && athlete.jumps[rNum - 1] && athlete.jumps[rNum - 1].distance" class="jump-block">
                    <span class="distance-main font-mono">{{ athlete.jumps[rNum - 1].distance }} m</span>
                    <span class="jump-sub">
                      <template v-if="athlete.jumps[rNum - 1].points != null">{{ athlete.jumps[rNum - 1].points }} pkt</template>
                      <template v-if="athlete.jumps[rNum - 1].rank != null"> ({{ athlete.jumps[rNum - 1].rank }}.)</template>
                    </span>
                  </div>
                  <span v-else-if="athlete.jumps && athlete.jumps[rNum - 1] && athlete.jumps[rNum - 1].status" class="status-dns">
                    {{ athlete.jumps[rNum - 1].status }}
                  </span>
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Punkty łączne -->
                <td class="td-total font-mono">
                  <strong>{{ athlete.total_points != null ? athlete.total_points : '-' }}</strong>
                </td>

                <!-- Punkty Pucharu Świata -->
                <td class="td-points font-mono">
                  <span
                    class="comp-pts-chip"
                    :class="{ active: athlete.competition_points > 0 }"
                  >
                    {{ athlete.competition_points > 0 ? `+${athlete.competition_points}` : '-' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* HEADER SESJI */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 14px;
  margin-bottom: 16px;
  gap: 15px;
  flex-wrap: wrap;
}
.btn-back {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  color: #475569;
  font-weight: 600;
  font-size: 0.85em;
  transition: all 0.2s;
}
.btn-back:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.title-section {
  flex: 1;
  min-width: 220px;
}
.place-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.place-row h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.5em;
  font-weight: 800;
}
.country-badge {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.8em;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}
.session-sub {
  margin: 2px 0 0 0;
  color: #64748b;
  font-weight: 500;
  font-size: 0.95em;
}

.badges {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 700;
  text-transform: uppercase;
}
.badge.blue {
  background: #e0f2fe;
  color: #0284c7;
}
.badge.gray {
  background: #f1f5f9;
  color: #475569;
}
.btn-fis {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.2s;
}
.btn-fis:hover {
  background: #d1fae5;
}

/* KARTY INFORMACYJNE O SKOCZNI */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px 14px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-icon {
  font-size: 1.4em;
}
.card-text {
  display: flex;
  flex-direction: column;
}
.card-label {
  font-size: 0.72em;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.info-card strong {
  font-size: 0.92em;
  color: #1e293b;
}
.time-dim {
  color: #64748b;
  font-size: 0.8em;
}
.doc-links {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.doc-link {
  color: #0284c7;
  font-size: 0.82em;
  font-weight: 600;
  text-decoration: none;
}
.doc-link:hover {
  text-decoration: underline;
}

/* ======================================================== */
/* SMART PANEL PAKIETÓW (WINTER SPORTS ERGONOMICS) */
/* ======================================================== */
.smart-package-hub {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  color: white;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.25);
}

/* Główny pasek statusu (kompaktowy ~48px) */
.hub-main-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  gap: 12px;
  flex-wrap: wrap;
}
.hub-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hub-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95em;
  color: #38bdf8;
}
.ski-icon {
  font-size: 1.1em;
}

.selection-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #0f172a;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid #334155;
}
.selection-pill.active {
  border-color: #38bdf8;
}
.selection-pill.full {
  border-color: #f59e0b;
}
.dots-meter {
  display: flex;
  gap: 3px;
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #475569;
}
.dot.filled {
  background: #38bdf8;
}
.selection-pill.full .dot.filled {
  background: #f59e0b;
}
.count-text {
  font-size: 0.78em;
  font-weight: 700;
  color: #cbd5e1;
}

.hub-center {
  display: flex;
  align-items: center;
}
.hub-hint {
  color: #94a3b8;
  font-size: 0.82em;
}
.active-score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  background: #0f172a;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.score-caption {
  font-size: 0.75em;
  color: #94a3b8;
  text-transform: uppercase;
}
.score-val {
  font-size: 1.15em;
  font-weight: 800;
  color: #38bdf8;
}

.hub-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-toggle-drawer {
  background: #0284c7;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82em;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}
.btn-toggle-drawer:hover {
  background: #0369a1;
}
.btn-toggle-drawer.open {
  background: #0369a1;
}
.arrow-icon {
  font-size: 0.8em;
}
.btn-clear-micro {
  background: none;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.78em;
  cursor: pointer;
}
.btn-clear-micro:hover {
  color: #f87171;
  border-color: #f87171;
}

/* Pasek z mikropigułkami skoczków i formularzem zapisu */
.selection-detail-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: #0b132b;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
}
.selected-chips-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}
.athlete-micro-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}
.chip-name {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-pts {
  color: #38bdf8;
  font-size: 0.88em;
}
.chip-x {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 1px;
  font-size: 0.85em;
  line-height: 1;
}
.chip-x:hover {
  color: #f87171;
}

.quick-save-form {
  display: flex;
  gap: 6px;
  align-items: center;
}
.save-input-compact {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  color: white;
  padding: 5px 9px;
  font-size: 0.82em;
  min-width: 180px;
}
.save-input-compact:focus {
  outline: none;
  border-color: #38bdf8;
}
.btn-save-compact {
  background: #10b981;
  color: #064e3b;
  font-weight: 700;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.82em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-save-compact:hover {
  background: #34d399;
}

/* ROZWIJANY DRAWER PORÓWNANIA PAKIETÓW */
.drawer-content {
  padding: 14px 16px;
  background: #0f172a;
}
.drawer-header {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
}
.drawer-title {
  font-weight: 700;
  color: #e2e8f0;
  font-size: 0.9em;
}
.drawer-subtitle {
  color: #64748b;
  font-size: 0.78em;
}

.packages-compact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.pkg-compact-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s;
}
.pkg-compact-card.is-leader {
  border-color: #eab308;
  background: linear-gradient(180deg, rgba(234, 179, 8, 0.08) 0%, #1e293b 100%);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.title-with-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
}
.pkg-label {
  color: #38bdf8;
  font-size: 0.88em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-icon-rename {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75em;
  opacity: 0.7;
}
.btn-icon-rename:hover {
  opacity: 1;
}

.rename-inline {
  display: flex;
  gap: 4px;
}
.rename-input-sm {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.8em;
}
.btn-micro-ok {
  background: #38bdf8;
  color: #0f172a;
  border: none;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
}

.card-corner-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-apply-micro {
  background: #334155;
  color: #cbd5e1;
  border: none;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.72em;
  font-weight: 600;
  cursor: pointer;
}
.btn-apply-micro:hover {
  background: #475569;
  color: white;
}
.btn-delete-micro {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.7;
}
.btn-delete-micro:hover {
  opacity: 1;
}

.card-score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0f172a;
  padding: 6px 10px;
  border-radius: 4px;
}
.score-cluster {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.pts-big {
  font-size: 1.25em;
  font-weight: 800;
  color: #22c55e;
}
.pts-unit {
  font-size: 0.75em;
  color: #94a3b8;
}
.score-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.leader-badge {
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.delta-badge {
  color: #94a3b8;
  font-size: 0.75em;
  font-family: monospace;
}
.count-tag {
  color: #64748b;
  font-size: 0.75em;
}

.compact-athletes-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 2px;
}
.ath-pill {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78em;
  padding: 3px 6px;
  background: #0f172a;
  border-radius: 3px;
}
.ath-pill-name {
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.ath-pill-pts {
  color: #22c55e;
  font-weight: 700;
  margin: 0 6px;
}
.ath-pill-pts.zero {
  color: #64748b;
  font-weight: normal;
}
.ath-pill-remove {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.8em;
}
.ath-pill-remove:hover {
  color: #ef4444;
}

.card-bottom-action {
  border-top: 1px solid #334155;
  padding-top: 6px;
}
.btn-merge-selection {
  width: 100%;
  background: none;
  border: 1px dashed #475569;
  color: #38bdf8;
  padding: 4px;
  border-radius: 3px;
  font-size: 0.75em;
  cursor: pointer;
}
.btn-merge-selection:hover {
  background: #0f172a;
}

/* ======================================================== */
/* TABELA WYNIKÓW (SPORTOWY STANDARD, PODIUM) */
/* ======================================================== */
.results-section {
  margin-top: 8px;
}
.results-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-left h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.15em;
  font-weight: 700;
}
.results-count {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 12px;
}
.table-tip {
  color: #64748b;
  font-size: 0.8em;
}

.cancelled-alert {
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 600;
  margin-bottom: 10px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88em;
}
.results-table th,
.results-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  white-space: nowrap;
}
.results-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
}
.results-table tbody tr:hover {
  background-color: #f8fafc;
}

/* Wiersz wybrany */
.results-table tbody tr.row-selected {
  background-color: rgba(56, 189, 248, 0.12) !important;
}

/* Podium highlights */
.podium-gold {
  background-color: rgba(254, 243, 199, 0.4);
}
.podium-silver {
  background-color: rgba(241, 245, 249, 0.6);
}
.podium-bronze {
  background-color: rgba(254, 237, 213, 0.3);
}

.rank-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
  font-size: 0.85em;
}
.rank-badge.gold {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.rank-badge.silver {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.rank-badge.bronze {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fed7aa;
}
.rank-normal {
  color: #1e293b;
}

.smart-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #0284c7;
}

.th-pkg, .td-pkg { width: 36px; text-align: center; }
.th-rank, .td-rank { width: 55px; text-align: center; }
.th-bib, .td-bib { width: 45px; text-align: center; }
.th-price, .td-price { width: 75px; text-align: center; }
.th-country, .td-country { width: 65px; text-align: center; }
.th-jump, .td-jump { width: 110px; text-align: center; }
.th-total, .td-total { width: 100px; text-align: right; }
.th-points, .td-points { width: 85px; text-align: right; }

.price-chip {
  display: inline-block;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
  font-size: 0.82em;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid #a7f3d0;
  font-family: monospace;
}
.score-price {
  font-size: 0.82em;
  color: #047857;
  font-weight: 600;
  margin-left: 6px;
}
.chip-price {
  font-size: 0.75em;
  color: #047857;
  background: #ecfdf5;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
  margin-right: 2px;
  border: 1px solid #a7f3d0;
}
.ath-pill-price {
  font-size: 0.72em;
  color: #047857;
  background: #ecfdf5;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
  margin-right: 2px;
  border: 1px solid #a7f3d0;
}
.price-tag {
  background: #ecfdf5;
  color: #047857;
  font-size: 0.72em;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  border: 1px solid #a7f3d0;
}

.bib-tag {
  color: #64748b;
  font-family: monospace;
  font-size: 0.9em;
}
.athlete-link {
  color: #0f172a;
  text-decoration: none;
  font-weight: 600;
}
.athlete-link:hover {
  color: #0284c7;
  text-decoration: underline;
}
.status-dns {
  margin-left: 6px;
  background: #fee2e2;
  color: #991b1b;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.72em;
  font-weight: 700;
}
.country-pill {
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.82em;
  color: #475569;
}

.jump-block {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.distance-main {
  font-weight: 700;
  color: #0f172a;
}
.jump-sub {
  font-size: 0.75em;
  color: #64748b;
}
.dim-dash {
  color: #cbd5e1;
}

.comp-pts-chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.82em;
  font-weight: 700;
  color: #94a3b8;
}
.comp-pts-chip.active {
  background: #e0f2fe;
  color: #0284c7;
}

/* RESPONSYWNOŚĆ */
.athlete-name-plain {
  font-weight: 600;
  color: #334155;
}

.mobile-only {
  display: none;
}

.toolbar-right-mobile {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: flex;
  }
  .page {
    padding: 12px;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
  .info-grid {
    grid-template-columns: 1fr;
  }
  .hub-main-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .hub-right {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .selection-detail-strip {
    flex-direction: column;
    align-items: stretch;
  }
  .quick-save-form {
    width: 100%;
  }
  .save-input-compact {
    flex: 1;
    min-width: 0;
  }
  .packages-compact-grid {
    grid-template-columns: 1fr;
  }
  .toolbar-right-mobile {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .s-view-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: #e2e8f0;
    padding: 3px;
    border-radius: 8px;
    width: 100%;
  }
  .s-switch-btn {
    border: none;
    background: transparent;
    color: #475569;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    min-height: 32px;
    cursor: pointer;
  }
  .s-switch-btn.active {
    background: #ffffff;
    color: #0284c7;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .session-mobile-list {
    flex-direction: column;
    gap: 7px;
  }
  .session-m-res-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  }
  .session-m-res-card.podium-gold {
    background: rgba(254, 243, 199, 0.45);
    border-color: #fde68a;
  }
  .session-m-res-card.podium-silver {
    background: rgba(241, 245, 249, 0.8);
    border-color: #cbd5e1;
  }
  .session-m-res-card.podium-bronze {
    background: rgba(254, 237, 213, 0.45);
    border-color: #fed7aa;
  }
  .session-m-res-card.row-esm-starter:not(.row-selected) {
    background-color: #fffbeb;
  }
  .session-m-res-card.row-esm-bench:not(.row-selected) {
    background-color: #f8fafc;
  }
  .session-m-res-card.row-selected {
    background: #e0f2fe !important;
    border-color: #38bdf8;
    box-shadow: 0 0 0 1px #38bdf8;
  }
  .smr-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .smr-left {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    min-width: 0;
    flex: 1;
  }
  .smr-rank {
    font-size: 0.85rem;
    min-width: 24px;
  }
  .smr-name-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .smr-name {
    font-size: 0.85rem;
    line-height: 1.2;
  }
  .smr-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  .smr-tags .esm-badge {
    margin-left: 0;
  }
  .smr-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }
  .smr-jumps-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(82px, 1fr));
    gap: 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 7px 8px;
  }
  .smr-jump-box {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .smr-j-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
  }
  .smr-total-box {
    align-items: flex-end;
    text-align: right;
  }
  .smr-total-val {
    font-size: 0.86rem;
    color: #0f172a;
  }

  /* Poprawione zamrożone kolumny w tabeli sesji (bez nakładania checkboxa) */
  .results-table th.th-pkg,
  .results-table td.td-pkg {
    position: sticky;
    left: 0;
    z-index: 9;
    background: #ffffff;
    width: 34px;
    min-width: 34px;
    padding: 6px 4px;
  }
  .results-table th.th-pkg {
    z-index: 11;
    background: #f8fafc;
  }
  .results-table th.th-rank,
  .results-table td.td-rank {
    position: sticky;
    left: 34px;
    z-index: 8;
    background: #ffffff;
    min-width: 42px;
    padding: 6px 4px;
  }
  .results-table th.th-rank {
    z-index: 10;
    background: #f8fafc;
  }
  .results-table th.th-name,
  .results-table td.td-name {
    position: sticky;
    left: 76px;
    z-index: 8;
    background: #ffffff;
    min-width: 135px;
    max-width: 155px;
    white-space: normal;
    box-shadow: 4px 0 6px -2px rgba(0, 0, 0, 0.08);
  }
  .results-table th.th-name {
    z-index: 10;
    background: #f8fafc;
  }
  .results-table tr.podium-gold td.td-pkg,
  .results-table tr.podium-gold td.td-rank,
  .results-table tr.podium-gold td.td-name { background: #fefce8; }
  .results-table tr.podium-silver td.td-pkg,
  .results-table tr.podium-silver td.td-rank,
  .results-table tr.podium-silver td.td-name { background: #f8fafc; }
  .results-table tr.podium-bronze td.td-pkg,
  .results-table tr.podium-bronze td.td-rank,
  .results-table tr.podium-bronze td.td-name { background: #fff7ed; }
  .results-table tr.row-selected td.td-pkg,
  .results-table tr.row-selected td.td-rank,
  .results-table tr.row-selected td.td-name { background: #e0f2fe; }
}

/* ======================================================== */
/* --- ESM MANAGER INTEGRATION (SESJA + PAKIETY)        --- */
/* ======================================================== */
.esm-scope-switch {
  display: inline-flex;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}

.scope-btn {
  border: none;
  background: transparent;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.scope-btn.active {
  background: #0284c7;
  color: #ffffff;
}

.btn-esm-action,
.btn-esm-import,
.btn-esm-connect-link {
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.btn-esm-action:hover,
.btn-esm-import:hover,
.btn-esm-connect-link:hover,
.btn-esm-import.open {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.esm-import-panel {
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 12px 16px;
}

.esm-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.esm-panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: #0f172a;
}

.esm-panel-sub {
  font-size: 0.82rem;
  color: #475569;
}

.esm-panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-esm-panel-sync,
.btn-esm-import-all {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1e293b;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-esm-import-all {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.btn-esm-import-all:hover {
  background: #0369a1;
}

.esm-action-msg {
  margin: 0 0 10px 0;
  font-size: 0.84rem;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  padding: 6px 10px;
  border-radius: 6px;
}

.esm-teams-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.esm-team-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.esm-my-card {
  border-color: #38bdf8;
  background: #f0f9ff;
}

.esm-team-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.esm-team-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  background: #fef3c7;
  color: #b45309;
  padding: 2px 6px;
  border-radius: 6px;
  margin-right: 6px;
}

.esm-team-badge.friend {
  background: #e2e8f0;
  color: #334155;
}

.esm-team-name {
  font-size: 0.92rem;
  color: #0f172a;
}

.esm-team-meta {
  font-size: 0.76rem;
  color: #64748b;
  white-space: nowrap;
}

.esm-team-btns {
  display: flex;
  gap: 6px;
}

.btn-esm-card-select,
.btn-esm-card-pkg {
  flex: 1;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #1e293b;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
}

.btn-esm-card-pkg {
  background: #f8fafc;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.btn-esm-card-select:hover {
  background: #f1f5f9;
}

.btn-esm-card-pkg:hover {
  background: #eff6ff;
}

.esm-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  vertical-align: middle;
}

.esm-badge.esm-starter {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.esm-badge.esm-bench {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.results-table tr.row-esm-starter:not(.row-selected) {
  background-color: #fffbeb;
}

.results-table tr.row-esm-bench:not(.row-selected) {
  background-color: #f8fafc;
}

.drawer-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.drawer-esm-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.s-fs-btn {
  width: 100%;
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 7px;
  cursor: pointer;
}

.sml-col-head {
  display: grid;
  grid-template-columns: 24px 32px minmax(0, 1fr) 76px 50px;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.sml-h-jumps,
.sml-h-total {
  text-align: right;
}

.sml-compact-row {
  display: grid;
  grid-template-columns: 24px 32px minmax(0, 1fr) 76px 50px;
  align-items: center;
  gap: 6px;
}

.sml-chk {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sml-rank {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
}

.sml-identity {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.sml-name {
  font-size: 0.8rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.esm-dot {
  font-size: 0.72rem;
  flex-shrink: 0;
}

.sml-jumps {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.72rem;
  color: #334155;
  line-height: 1.25;
}

.sml-total {
  text-align: right;
  font-size: 0.8rem;
  color: #0f172a;
}

.sml-expanded-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 7px;
  border-top: 1px dashed #cbd5e1;
}

.sml-exp-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.session-table-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 10500;
  background: #ffffff;
  overflow: auto;
}

.session-fs-bar {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.8rem;
}

.btn-session-fs-close {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.squad-origin-tag {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  background: #e2e8f0;
  color: #334155;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .mobile-desktop-hint {
    display: block;
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 8px 11px;
    margin-bottom: 10px;
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.35;
  }
}
</style>
