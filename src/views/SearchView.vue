<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'
import ResultsTable from '@/components/stats/ResultsTable.vue'
import SearchForm from '@/components/stats/SearchForm.vue'
import AnalyticsPanel from '@/components/stats/AnalyticsPanel.vue'

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
const syncStateFromUrl = () => {
  const q = route.query
  if (q.names)
    selectedNames.value = Array.isArray(q.names) ? (q.names as string[]) : [q.names as string]
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
}

const updateUrlQueryParams = () => {
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

// --- FETCH WYNIKÓW ---
const performSearch = async (payload: any, finalNames: string[]) => {
  searchedNames.value = finalNames
  excludedNames.value = []
  loading.value = true
  results.value = []

  try {
    const res = await fetch('http://127.0.0.1:8000/stats/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) results.value = await res.json()
  } catch (e) {
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

// --- INICJALIZACJA ---
onMounted(async () => {
  const [dictsRes, pricesRes, namesRes] = await Promise.all([
    fetch('http://127.0.0.1:8000/stats/form-data').catch(() => null),
    fetch('http://127.0.0.1:8000/stats/athletes/with-prices').catch(() => null),
    fetch('http://127.0.0.1:8000/athletes/names').catch(() => null),
  ])
  if (dictsRes?.ok) {
    const data = await dictsRes.json()
    dictionaries.value = {
      places: data.places || [],
      hills: data.hill_types || {},
      categories: data.categories || {},
      sessions: data.sessions || {},
    }
  }
  if (pricesRes?.ok) athletesWithPrices.value = await pricesRes.json()
  if (namesRes?.ok) availableNames.value = await namesRes.json()

  syncStateFromUrl()

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
    <h2>Ekspert System & Analiza (ESM)</h2>

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
      />
    </div>

    <div
      v-else-if="!loading && results.length === 0 && searchedNames.length > 0"
      class="no-results card"
    >
      Brak wyników do wyświetlenia. Zmień filtry w KROKU 1.
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

.no-results {
  text-align: center;
  color: #64748b;
  padding: 20px;
  font-style: italic;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  border: 1px solid #e2e8f0;
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
