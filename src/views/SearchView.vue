<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'
import ResultsTable from '@/components/stats/ResultsTable.vue'
import SearchForm from '@/components/stats/SearchForm.vue'
import AnalyticsPanel from '@/components/stats/AnalyticsPanel.vue'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useNotice } from '@/stores/notice'

const auth = useAuth()
const notice = useNotice()
const route = useRoute()
const router = useRouter()

// --- STAN BAZOWY Z API ---
const availableNames = ref<string[]>([])
const athletesWithPrices = ref<{ name: string; fis_code: number; price: number }[]>([])
const dictionaries = ref({ places: [], hills: {}, categories: {}, sessions: {} })

// --- STAN FORMULARZA I FILTRÓW ---
const searchForm = ref({
  place: '',
  hill_type: '',
  category: [] as string[],
  session_type: '',
  date_from: '',
  date_to: '',
  limit: 10,
})
const selectedNames = ref<string[]>([])
const priceMode = ref(false)
const priceMin = ref(0.1)
const priceMax = ref(3.0)

const highlightTopN = ref(50)
const hideEmptyAthletes = ref(false)
const onlyCommon = ref(false)

// --- STAN WYNIKÓW BAZY ---
const results = shallowRef<any[]>([])
const searchedNames = ref<string[]>([])
const excludedNames = ref<string[]>([])
const loading = ref(false)

// --- LOGIKA URL ---
const isSyncingFromUrl = ref(false)

const syncStateFromUrl = async () => {
  isSyncingFromUrl.value = true
  try {
    const q = route.query
    if (q.names) {
      selectedNames.value = Array.isArray(q.names) ? (q.names as string[]) : [q.names as string]
    } else if (q.name) {
      selectedNames.value = [q.name as string]
    } else if (q.fis_code) {
      const code = Number(q.fis_code)
      const found = athletesWithPrices.value.find((a) => a.fis_code === code)
      if (found) {
        selectedNames.value = [found.name]
      } else {
        try {
          const data = await api.get(`/athletes/find?fis_code=${code}`)
          if (data?.full_name) {
            selectedNames.value = [data.full_name]
          }
        } catch (e) {
          console.error('Błąd pobierania danych skoczka po fis_code:', e)
        }
      }
    }
    searchForm.value.place = (q.place as string) || ''
    searchForm.value.hill_type = (q.hill_type as string) || ''
    searchForm.value.category = q.category
      ? Array.isArray(q.category)
        ? (q.category as string[])
        : [q.category as string]
      : []
    searchForm.value.session_type = (q.session_type as string) || ''
    searchForm.value.date_from = (q.date_from as string) || ''
    searchForm.value.date_to = (q.date_to as string) || ''
    searchForm.value.limit = q.limit ? parseInt(q.limit as string) : 10
    if (q.priceMode === 'true') {
      priceMode.value = true
      if (q.priceMin) priceMin.value = parseFloat(q.priceMin as string)
      if (q.priceMax) priceMax.value = parseFloat(q.priceMax as string)
    }
    if (q.onlyCommon === 'true') onlyCommon.value = true
    if (q.hideEmptyAthletes === 'true') hideEmptyAthletes.value = true
    if (q.highlightTopN) highlightTopN.value = parseInt(q.highlightTopN as string)
  } finally {
    await nextTick()
    isSyncingFromUrl.value = false
  }
}

const updateUrlQueryParams = () => {
  if (isSyncingFromUrl.value) return
  const queryParams: Record<string, any> = { ...searchForm.value }
  Object.keys(queryParams).forEach((key) => {
    if (
      queryParams[key] === '' ||
      queryParams[key] === null ||
      (Array.isArray(queryParams[key]) && queryParams[key].length === 0)
    )
      delete queryParams[key]
  })
  if (selectedNames.value.length > 0) queryParams.names = selectedNames.value
  if (onlyCommon.value) queryParams.onlyCommon = 'true'
  if (hideEmptyAthletes.value) queryParams.hideEmptyAthletes = 'true'
  queryParams.highlightTopN = highlightTopN.value
  if (priceMode.value) {
    queryParams.priceMode = 'true'
    queryParams.priceMin = priceMin.value
    queryParams.priceMax = priceMax.value
  }
  router.replace({ query: queryParams })
}

watch(
  [
    searchForm,
    selectedNames,
    priceMode,
    priceMin,
    priceMax,
    onlyCommon,
    hideEmptyAthletes,
    highlightTopN,
  ],
  updateUrlQueryParams,
  { deep: true },
)

// Reagowanie na bezpośrednie nawigacje z parametrami zawodnika (np. z AthleteDetailView lub AthletesView)
watch(
  () => [route.query.fis_code, route.query.name],
  async ([newFis, newName], [oldFis, oldName]) => {
    if (newFis !== oldFis || newName !== oldName) {
      if (newFis || newName) {
        await syncStateFromUrl()
        if (selectedNames.value.length > 0) {
          const payload = Object.fromEntries(
            Object.entries(searchForm.value).filter(([_, v]) =>
              Array.isArray(v) ? v.length > 0 : v !== '' && v !== null,
            ),
          )
          performSearch(payload, selectedNames.value)
        }
      }
    }
  },
)

// --- FETCH WYNIKÓW ---
const performSearch = async (payload: any, finalNames: string[]) => {
  if (!auth.isPro.value && finalNames.length > 2) {
    notice.showNotice({
      title: 'Limit konta darmowego',
      message: 'Darmowe konto pozwala na jednoczesne porównanie maksymalnie 2 zawodników i 10 skoków. Przejdź na pakiet PRO, aby analizować dowolną liczbę skoczków i pełną historię.',
      badge: 'FREE: MAX 2',
    })
    return
  }

  const safePayload = !auth.isPro.value
    ? { ...payload, limit: Math.min(Number(payload.limit || 10), 10) }
    : payload

  searchedNames.value = finalNames
  excludedNames.value = []
  loading.value = true
  results.value = []

  try {
    results.value = await api.post('/stats/search', safePayload)
  } catch (e: any) {
    notice.showNotice({
      title: 'Błąd pobierania danych',
      message: e.message || 'Wystąpił nieoczekiwany błąd podczas pobierania danych z serwera.',
      badge: 'BŁĄD',
    })
    console.error('Błąd sieci', e)
  } finally {
    loading.value = false
  }
}

// --- LOGIKA DANYCH (Współdzielona z subkomponentami) ---
const visibleAthletes = computed(() => {
  const active = searchedNames.value.filter((name) => !excludedNames.value.includes(name))
  return active
    .map((name) => {
      return { name, price: athletesWithPrices.value.find((a) => a.name === name)?.price || null }
    })
    .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
})

const filteredVisibleAthletes = computed(() => {
  let list = visibleAthletes.value
  if (hideEmptyAthletes.value) {
    const namesWithData = new Set(
      results.value.filter((d: any) => d.jumps && d.jumps.length > 0).map((d: any) => d.name),
    )
    list = list.filter((a) => namesWithData.has(a.name))
  }
  return list
})

const groupedRows = computed(() => {
  const map: Record<string, any> = {}
  results.value.forEach((data: any) => {
    if (excludedNames.value.includes(data.name)) return
    data.jumps.forEach((jump: any) => {
      const key = `${jump.codex}-${jump.round}`
      if (!map[key]) map[key] = { meta: jump, athletes: {} }
      map[key].athletes[data.name] = jump
    })
  })

  let rows = Object.values(map)
  if (onlyCommon.value && filteredVisibleAthletes.value.length > 0) {
    rows = rows.filter((row) =>
      filteredVisibleAthletes.value.every((a) => row.athletes[a.name] !== undefined),
    )
  }

  rows.forEach((row) => {
    const jumps = Object.values(row.athletes) as any[]
    row.maxDist = Math.max(...jumps.map((j) => j.distance).filter((v) => v != null))
    row.minDist = Math.min(...jumps.map((j) => j.distance).filter((v) => v != null))
    row.maxPoints = Math.max(...jumps.map((j) => j.points).filter((v) => v != null))
    row.minPoints = Math.min(...jumps.map((j) => j.points).filter((v) => v != null))
    row.minRank = Math.min(...jumps.map((j) => j.jump_rank).filter((v) => v != null))
    row.maxRank = Math.max(...jumps.map((j) => j.jump_rank).filter((v) => v != null))
  })
  return rows.sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime())
})

// --- AKCJE SZYBKIEGO RESETU / SUGIESTII ---
const resetToWorldCup = () => {
  searchForm.value = {
    place: '',
    hill_type: '',
    category: ['WC'],
    session_type: '',
    date_from: '',
    date_to: '',
    limit: 20,
  }
  const payload = { category: ['WC'], limit: 20 }
  performSearch(payload, selectedNames.value)
}

const clearAllCriteriaAndRetry = () => {
  searchForm.value = {
    place: '',
    hill_type: '',
    category: [],
    session_type: '',
    date_from: '',
    date_to: '',
    limit: 10,
  }
  const payload = { limit: 10 }
  performSearch(payload, selectedNames.value)
}

// --- INICJALIZACJA ---
onMounted(async () => {
  const [data, prices, names] = await Promise.all([
    api.get('/stats/form-data', { cacheTtlMs: 300000 }).catch(() => null),
    api.get('/stats/athletes/with-prices', { cacheTtlMs: 60000 }).catch(() => null),
    api.get('/athletes/names', { cacheTtlMs: 300000 }).catch(() => null),
  ])
  if (data) {
    dictionaries.value = {
      places: data.places || [],
      hills: data.hill_types || {},
      categories: data.categories || {},
      sessions: data.sessions || {},
    }
  }
  if (prices) athletesWithPrices.value = prices
  if (names) availableNames.value = names

  await syncStateFromUrl()

  if (selectedNames.value.length > 0 || priceMode.value) {
    const payload = Object.fromEntries(
      Object.entries(searchForm.value).filter(([_, v]) =>
        Array.isArray(v) ? v.length > 0 : v !== '' && v !== null,
      ),
    )
    // Wywołaj search od razu bez zatrzymywania, by nie spowalniać ładowania UI
    performSearch(payload, selectedNames.value)
  }
})
</script>

<template>
  <div class="page">
    <h2>Porównywarka &amp; Analiza Skoczków {{ auth.isPro.value ? '(FantaSKI PRO)' : '(Konto darmowe)' }}</h2>

    <div v-if="!auth.isPro.value" class="lite-notice-banner">
      <span>ℹ️ <strong>Konto darmowe:</strong> Możesz porównywać do <strong>2 zawodników</strong> i maksymalnie <strong>10 ostatnich skoków</strong>. Przejdź na <strong>FantaSKI PRO</strong>, aby zdjąć limity.</span>
    </div>

    <SearchForm
      v-model:searchForm="searchForm"
      v-model:selectedNames="selectedNames"
      v-model:priceMode="priceMode"
      v-model:priceMin="priceMin"
      v-model:priceMax="priceMax"
      :availableNames="availableNames"
      :athletesWithPrices="athletesWithPrices"
      :dictionaries="dictionaries"
      :loading="loading"
      @execute-search="performSearch"
    />

    <div v-if="loading" style="margin-top: 40px"><SkiLoader /></div>

    <div v-else-if="results.length > 0" class="results-layout">
      <ResultsTable
        v-model:highlightTopN="highlightTopN"
        v-model:hideEmptyAthletes="hideEmptyAthletes"
        v-model:onlyCommon="onlyCommon"
        v-model:excludedNames="excludedNames"
        :groupedRows="groupedRows"
        :filteredVisibleAthletes="filteredVisibleAthletes"
        :dictionaries="dictionaries"
      />

      <AnalyticsPanel
        :groupedRows="groupedRows"
        :filteredVisibleAthletes="filteredVisibleAthletes"
        :currentHillType="searchForm.hill_type"
      />
    </div>

    <!-- POMOCNY STAN PUSTY (HELPFUL EMPTY STATE) -->
    <div
      v-else-if="!loading && results.length === 0 && searchedNames.length > 0"
      class="card empty-state-card"
    >
      <div class="empty-icon">🏔️</div>
      <h3>Brak wyników dla wybranych kryteriów</h3>
      <p class="empty-desc">
        Baza danych nie odnalazła skoków dla wskazanych filtrów. Możliwe, że wybrani skoczkowie nie startowali w wytypowanych zawodach lub ustawiono zbyt wąskie kryteria.
      </p>
      <div class="empty-actions">
        <button type="button" class="btn-preset-action" @click="resetToWorldCup">
          🏆 Pokaż cały Puchar Świata
        </button>
        <button type="button" class="btn-reset-action" @click="clearAllCriteriaAndRetry">
          🔄 Zresetuj kryteria wyszukiwania
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: transparent;
  padding: 30px;
  width: 100%;
  max-width: 1900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

.lite-notice-banner {
  background: #eff6ff;
  border: 1px solid #93c5fd;
  color: #1e40af;
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state-card {
  text-align: center;
  padding: 48px 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  border: 1px solid #e2e8f0;
  max-width: 700px;
  margin: 30px auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 12px;
}

.empty-state-card h3 {
  font-size: 1.3rem;
  color: #0f172a;
  margin: 0 0 8px 0;
  font-weight: 800;
}

.empty-desc {
  font-size: 0.92rem;
  color: #64748b;
  max-width: 500px;
  margin: 0 0 24px 0;
  line-height: 1.5;
}

.empty-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-preset-action {
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-preset-action:hover {
  background: #0369a1;
}

.btn-reset-action {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reset-action:hover {
  background: #e2e8f0;
  color: #0f172a;
}

/* Responsive Layout */
@media (max-width: 768px) {
  .page {
    padding: 10px;
    gap: 15px;
  }
  h2 {
    font-size: 1.4rem;
    text-align: center;
  }
}
</style>
