<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'

const route = useRoute()
const router = useRouter()

// --- STAN APLIKACJI ---
const placeContainerRef = ref<HTMLElement | null>(null)
const athleteContainerRef = ref<HTMLElement | null>(null)
const availableNames = ref<string[]>([])
const selectedNames = ref<string[]>([])
const nameInput = ref('')
const showDropdown = ref(false)
const activeIndex = ref(-1)

// --- NOWE SŁOWNIKI Z BACKENDU ---
const availablePlaces = ref<string[]>([])
const hillTypes = ref<Record<string, { pl: string; eng: string }>>({})
const categoriesDict = ref<Record<string, { pl: string; eng: string }>>({})
const sessionsDict = ref<Record<string, { pl: string; eng: string }>>({})
const showPlaceDropdown = ref(false)

const onlyCommon = ref(false)
const searchForm = ref({
  place: '',
  hill_type: '',
  category: '',
  session_type: '',
  date_from: '',
  date_to: '',
  rank: null as number | null,
  limit: 50,
})

const results = ref<any[]>([])
const loading = ref(false)

// --- FUNKCJE SYNCHRONIZACJI URL <-> STAN ---
const syncStateFromUrl = () => {
  const q = route.query

  if (q.names) {
    // URL może zwrócić string (jeśli 1 imię) lub tablicę stringów
    const namesArray = Array.isArray(q.names) ? q.names : [q.names]
    selectedNames.value = namesArray as string[]
  }

  searchForm.value.place = (q.place as string) || ''
  searchForm.value.hill_type = (q.hill_type as string) || ''
  searchForm.value.category = (q.category as string) || ''
  searchForm.value.session_type = (q.session_type as string) || ''
  searchForm.value.date_from = (q.date_from as string) || ''
  searchForm.value.date_to = (q.date_to as string) || ''
  searchForm.value.rank = q.rank ? parseInt(q.rank as string) : null
  searchForm.value.limit = q.limit ? parseInt(q.limit as string) : 50

  if (q.onlyCommon === 'true') {
    onlyCommon.value = true
  }
}

const updateUrlQueryParams = () => {
  const queryParams: Record<string, any> = { ...searchForm.value }

  // Usuwamy puste wartości, żeby nie śmiecić w URL (np. place=)
  Object.keys(queryParams).forEach((key) => {
    if (queryParams[key] === '' || queryParams[key] === null) {
      delete queryParams[key]
    }
  })

  if (selectedNames.value.length > 0) {
    queryParams.names = selectedNames.value
  }
  if (onlyCommon.value) {
    queryParams.onlyCommon = 'true'
  }

  // Używamy router.replace, aby udostępnianie linków działało świetnie bez zapychania historii "wstecz" w przeglądarce
  router.replace({ query: queryParams })
}

// --- LOGIKA MULTI-SELECTA ZAWODNIKÓW ---
const filteredNames = computed(() => {
  if (!nameInput.value) return []
  const lowerInput = nameInput.value.toLowerCase()
  return availableNames.value
    .filter((n) => n.toLowerCase().includes(lowerInput) && !selectedNames.value.includes(n))
    .slice(0, 10)
})

const addName = (name: string) => {
  if (selectedNames.value.length >= 10) {
    alert('Możesz porównać maksymalnie 10 skoczków!')
    return
  }
  if (!selectedNames.value.includes(name)) {
    selectedNames.value.push(name)
  }
  nameInput.value = ''
}

const removeName = (name: string) => {
  selectedNames.value = selectedNames.value.filter((n) => n !== name)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!showDropdown.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % filteredNames.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value =
      (activeIndex.value - 1 + filteredNames.value.length) % filteredNames.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (activeIndex.value >= 0 && activeIndex.value < filteredNames.value.length) {
      e.preventDefault()
      addName(filteredNames.value[activeIndex.value])
      activeIndex.value = -1
    }
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (placeContainerRef.value && !placeContainerRef.value.contains(event.target as Node)) {
    showPlaceDropdown.value = false
  }
  if (athleteContainerRef.value && !athleteContainerRef.value.contains(event.target as Node)) {
    showDropdown.value = false
  }
}

const filteredPlaces = computed(() => {
  if (!searchForm.value.place) return availablePlaces.value.slice(0, 10)
  const lowerInput = searchForm.value.place.toLowerCase()
  return availablePlaces.value.filter((p) => p.toLowerCase().includes(lowerInput)).slice(0, 10)
})

const selectPlace = (place: string) => {
  searchForm.value.place = place
  showPlaceDropdown.value = false
}

// --- WYSZUKIWANIE ---
const performSearch = async () => {
  if (selectedNames.value.length === 0) {
    alert('Dodaj co najmniej jednego skoczka!')
    return
  }

  // Najpierw aktualizujemy adres URL
  updateUrlQueryParams()

  loading.value = true
  const payload = Object.fromEntries(
    Object.entries(searchForm.value).filter(([_, v]) => v !== '' && v !== null),
  )
  payload.names = selectedNames.value

  try {
    const res = await fetch('http://127.0.0.1:8000/stats/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      results.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd sieci', e)
  } finally {
    loading.value = false
  }
}

// --- POBIERANIE SŁOWNIKÓW I STARTOWE ZAPYTANIA ---
const fetchFormData = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/stats/form-data')
    if (res.ok) {
      const data = await res.json()
      availablePlaces.value = data.places || []
      hillTypes.value = data.hill_types || {}
      categoriesDict.value = data.categories || {}
      sessionsDict.value = data.sessions || {}
    }
  } catch (e) {
    console.error('Błąd pobierania słowników wyszukiwarki', e)
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)

  // Pobieramy słowniki NAJPIERW, żeby tabele umiały się przetłumaczyć z linka
  await fetchFormData()

  try {
    const res = await fetch('http://127.0.0.1:8000/athletes/names')
    if (res.ok) {
      availableNames.value = await res.json()
    }
  } catch (e) {
    console.error('Nie udało się pobrać nazwisk', e)
  }

  // Obsługa fis_code z innego modułu
  if (route.query.fis_code) {
    const fisCode = route.query.fis_code as string
    try {
      const athleteRes = await fetch(`http://127.0.0.1:8000/athletes/find?fis_code=${fisCode}`)
      if (athleteRes.ok) {
        const athleteData = await athleteRes.json()
        const exactName = athleteData.full_name
        if (!selectedNames.value.includes(exactName)) {
          selectedNames.value.push(exactName)
        }
        await performSearch() // to przy okazji wyczyści z URL fis_code i wrzuci normalne filtry
      }
    } catch (e) {
      console.error('Błąd podczas rozwiązywania fis_code', e)
    }
  } else {
    // Odczytanie filtrów z URL (jeśli weszliśmy z linka wygenerowanego)
    syncStateFromUrl()
    // Jeśli z linka przyszły nazwiska - automatycznie odpal szukanie!
    if (selectedNames.value.length > 0) {
      performSearch()
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// ... GRUPOWANIE WYNIKÓW (bez zmian) ...
const groupedRows = computed(() => {
  const map: Record<string, any> = {}
  results.value.forEach((athleteData: any) => {
    const athleteName = athleteData.name
    athleteData.jumps.forEach((jump: any) => {
      const key = `${jump.codex}-${jump.round}`
      if (!map[key]) {
        map[key] = { meta: jump, athletes: {} }
      }
      map[key].athletes[athleteName] = jump
    })
  })

  let rows = Object.values(map)
  if (onlyCommon.value && selectedNames.value.length > 0) {
    const requiredCount = selectedNames.value.length
    rows = rows.filter((row) => Object.keys(row.athletes).length === requiredCount)
  }

  rows.forEach((row) => {
    const jumps = Object.values(row.athletes) as any[]
    const distances = jumps.map((j) => j.distance).filter((v) => v != null)
    const points = jumps.map((j) => j.points).filter((v) => v != null)
    const ranks = jumps.map((j) => j.jump_rank).filter((v) => v != null)

    row.maxDist = Math.max(...distances)
    row.minDist = Math.min(...distances)
    row.maxPoints = Math.max(...points)
    row.minPoints = Math.min(...points)
    row.minRank = Math.min(...ranks)
    row.maxRank = Math.max(...ranks)
  })

  return rows.sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime())
})

// --- POMOCNICZE FUNKCJE (TŁUMACZENIA ZE SŁOWNIKÓW) ---
const getStatClass = (val: number, bestVal: number, worstVal: number) => {
  if (val == null) return ''
  if (val === bestVal) return 'text-best'
  if (val === worstVal) return 'text-worst'
  return ''
}

// Zmieniono: Używa dynamicznego słownika
const getCategoryName = (code: string) => {
  return categoriesDict.value[code]?.pl || code
}

// Zmieniono: Używa dynamicznego słownika
const getSessionName = (code: string) => {
  return sessionsDict.value[code]?.pl || code
}
</script>

<template>
  <div class="page">
    <h2>Porównywarka Skoczków</h2>

    <form @submit.prevent="performSearch" class="search-form">
      <div class="multi-select-container" ref="athleteContainerRef">
        <label>Porównaj skoczków (max 10):</label>
        <div class="chips-box">
          <span v-for="name in selectedNames" :key="name" class="chip">
            {{ name }}
            <button type="button" @click="removeName(name)">&times;</button>
          </span>

          <div class="input-wrapper">
            <input
              v-model="nameInput"
              @focus="showDropdown = true"
              @keydown="handleKeydown"
              type="text"
              placeholder="Wpisz nazwisko..."
            />
            <ul v-if="showDropdown && filteredNames.length > 0" class="autocomplete-list">
              <li
                v-for="(name, index) in filteredNames"
                :key="name"
                @mousedown.prevent="addName(name)"
                :class="{ 'active-item': activeIndex === index }"
              >
                {{ name }}
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="form-grid mt-4">
        <div class="filter-group autocomplete-container" ref="placeContainerRef">
          <label>Miejsce</label>
          <input
            type="text"
            v-model="searchForm.place"
            @focus="showPlaceDropdown = true"
            placeholder="np. Zakopane"
          />
          <ul
            v-if="showPlaceDropdown && filteredPlaces.length > 0"
            class="autocomplete-list place-list"
          >
            <li v-for="p in filteredPlaces" :key="p" @mousedown.prevent="selectPlace(p)">
              {{ p }}
            </li>
          </ul>
        </div>

        <div class="filter-group">
          <label>Rozmiar skoczni</label>
          <select v-model="searchForm.hill_type">
            <option value="">Wszystkie</option>
            <option v-for="(info, code) in hillTypes" :key="code" :value="code">
              {{ info.pl }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Kategoria / Cykl</label>
          <select v-model="searchForm.category">
            <option value="">Wszystkie</option>
            <option v-for="(info, code) in categoriesDict" :key="code" :value="code">
              {{ info.pl }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Typ sesji</label>
          <select v-model="searchForm.session_type">
            <option value="">Wszystkie</option>
            <option v-for="(info, code) in sessionsDict" :key="code" :value="code">
              {{ info.pl }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Data od</label>
          <input type="date" v-model="searchForm.date_from" />
        </div>

        <div class="filter-group">
          <label>Data do</label>
          <input type="date" v-model="searchForm.date_to" />
        </div>

        <div class="filter-group">
          <label>Dokładne miejsce</label>
          <input type="number" v-model="searchForm.rank" placeholder="np. 1" min="1" max="100" />
        </div>

        <div class="filter-group">
          <label>Max. wyników</label>
          <select v-model="searchForm.limit">
            <option :value="10">10 wyników</option>
            <option :value="50">50 wyników</option>
            <option :value="100">100 wyników</option>
            <option :value="1000">1000 wyników</option>
          </select>
        </div>
      </div>

      <div class="options-container">
        <label
          class="toggle-label"
          title="Pokaże tylko te serie, w których wszyscy wybrani zawodnicy oddali skok"
        >
          <input v-model="onlyCommon" type="checkbox" />
          <span>Wyświetlaj tylko wspólne zawody</span>
        </label>
      </div>

      <button type="submit" class="btn-submit" :disabled="loading">
        {{ loading ? 'Szukanie...' : 'Porównaj Wyniki' }}
      </button>
    </form>

    <div v-if="loading" style="margin-top: 40px">
      <SkiLoader></SkiLoader>
    </div>

    <div v-else-if="groupedRows.length > 0" class="table-wrapper">
      <table class="results-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Miejsce i Sesja</th>
            <th v-for="name in selectedNames" :key="name" class="athlete-col" :title="name">
              {{ name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in groupedRows" :key="idx">
            <td class="meta-cell">
              {{ row.meta.date }}<br />
              <small style="color: #64748b">{{ row.meta.time }}</small>
            </td>
            <td class="meta-cell">
              <strong>{{ row.meta.place }} HS{{ row.meta.hill_size || '?' }}</strong
              >: {{ getSessionName(row.meta.session_type) }}:
              <a target="_self" style="color: darkred"
                ><RouterLink :to="`/sessions/${row.meta.session_id}`" class="session-link">
                  LINK
                </RouterLink></a
              ><br />
              <small>{{ getCategoryName(row.meta.category) }} | Seria: {{ row.meta.round }}</small>
            </td>

            <td v-for="name in selectedNames" :key="name" class="athlete-cell">
              <div v-if="row.athletes[name]" class="jump-data">
                <span :class="getStatClass(row.athletes[name].jump_rank, row.minRank, row.maxRank)">
                  Poz: <strong>{{ row.athletes[name].jump_rank }}</strong>
                </span>
                <span :class="getStatClass(row.athletes[name].distance, row.maxDist, row.minDist)">
                  Odl: <strong>{{ row.athletes[name].distance }}m</strong>
                </span>
                <span
                  :class="getStatClass(row.athletes[name].points, row.maxPoints, row.minPoints)"
                >
                  Nota: <strong>{{ row.athletes[name].points }}</strong>
                </span>
              </div>
              <div v-else class="no-jump">---</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-else-if="!loading && results.length === 0 && selectedNames.length > 0"
      class="no-results"
    >
      Brak wyników do wyświetlenia.
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
.search-form {
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;
  border: 1px solid #e2e8f0;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}
.mt-4 {
  margin-top: 1rem;
}

/* STYLE DLA NOWYCH FILTRÓW Z ZACHOWANIEM STARYCH KLAS */
.filter-group {
  display: flex;
  flex-direction: column;
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
  gap: 5px;
}
.filter-group input,
.filter-group select {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 1em;
  box-sizing: border-box;
}

/* MULTI SELECT CSS */
.multi-select-container label {
  margin-bottom: 8px;
  display: block;
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
}
.chips-box {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  align-items: center;
}
.chip {
  background: #38bdf8;
  color: white;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 0.85em;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;
}
.chip button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.2em;
  line-height: 1;
  padding: 0;
}
.chip button:hover {
  color: #0f172a;
}
.input-wrapper {
  position: relative;
  flex-grow: 1;
}
.input-wrapper input {
  border: none;
  width: 100%;
  outline: none;
  padding: 4px;
  background: transparent;
}

.autocomplete-container {
  position: relative;
}
.autocomplete-list {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  max-height: 150px;
  overflow-y: auto;
  list-style: none;
  padding: 0;
  margin: 4px 0 0 0;
  z-index: 10;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
.autocomplete-list li {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.9em;
  border-bottom: 1px solid #f1f5f9;
}
.autocomplete-list li:hover {
  background: #f8fafc;
  color: #38bdf8;
}

.autocomplete-list li.active-item {
  background: #f8fafc;
  color: #38bdf8;
  font-weight: bold;
}

.place-list {
  max-height: 200px;
}

.options-container {
  margin-bottom: 20px;
  padding-top: 15px;
  border-top: 1px solid #e2e8f0;
}

.toggle-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: normal;
  color: #1e293b;
}

.toggle-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #38bdf8;
}

.btn-submit {
  background: #38bdf8;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  width: 100%;
}
.btn-submit:hover:not(:disabled) {
  background: #0284c7;
}

/* TABELA - ZAKTUALIZOWANA WERSJA DLA STICKY HEADER */
.table-wrapper {
  overflow-x: auto;
  overflow-y: auto; /* Włączamy przewijanie w pionie */
  max-height: 83vh; /* Ograniczamy wysokość kontenera, dostosuj tę wartość! */
  border-radius: 8px; /* Opcjonalnie, dla ładniejszego wyglądu */
  border: 1px solid #e2e8f0; /* Obramowanie wokół całej tabeli */
}
.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9em;
  min-width: 800px;
}

.results-table tr th {
  background-color: rgb(30, 41, 59);
  text-align: center;
  text-transform: uppercase;
  color: white;
}

.results-table th,
.results-table td {
  padding: 12px 10px;
  /* Usuwamy border-bottom stąd, bo zepsuje sticky na th */
}

/* Obramowanie tylko dla komórek wideo (wierszy), omijamy nagłówek */
.results-table td {
  border-bottom: 1px solid #e2e8f0;
}

.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-weight: bold;

  /* KLUCZOWE WŁAŚCIWOŚCI STICKY */
  position: sticky;
  top: 0; /* Dokowanie do samej góry wrappera */
  z-index: 10; /* Zawsze nad wierszami tabeli */

  /* Zamiast border-bottom używamy box-shadow, działa to dużo lepiej ze sticky */
  box-shadow: 0 1px 0 #e2e8f0;
}
.meta-cell {
  background-color: #f8fafc;
  border-right: 2px solid #cbd5e1;
}
.athlete-col {
  border-left: 1px solid #475569;
}
.athlete-cell {
  border-left: 1px solid #e2e8f0;
  text-align: center;
  vertical-align: top;
}

.jump-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.no-jump {
  color: #94a3b8;
  font-style: italic;
  padding-top: 10px;
}

/* KOLOROWANIE */
.text-best {
  color: #16a34a;
}
.text-worst {
  color: #dc2626;
}

.no-results {
  text-align: center;
  color: #64748b;
  padding: 20px;
  font-style: italic;
}
</style>
