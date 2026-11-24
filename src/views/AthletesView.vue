<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'

interface Athlete {
  fis_code: string
  full_name: string
  country_code: string
  birthdate: string | null
  club: string | null
  status: string
  profile_url: string
  flagUrl?: string
  price?: number | null
}

const athletes = ref<Athlete[]>([])
const countries = ref<{ code: string; name: string }[]>([])
const pricesMap = ref<Record<string, number>>({})
const loading = ref(true)
const loadingMore = ref(false)

// Stan Filtrów (wysyłany do backendu)
const filters = ref({
  search_name: '',
  countries: [] as string[],
  status: '', // '' (wszyscy), 'ACTIVE', 'INACTIVE'
  age_min: null as number | null,
  age_max: null as number | null,
  sort_by: 'full_name',
  sort_order: 1,
  limit: 20,
  skip: 0
})

// --- WYSZUKIWANIE KRAJÓW I KLAWIATURA ---
const countryInput = ref('')
const showCountryDropdown = ref(false)
const activeCountryIndex = ref(-1)
let searchTimeout: ReturnType<typeof setTimeout>

const filteredCountries = computed(() => {
  const lowerInput = countryInput.value.toLowerCase()
  return countries.value.filter(c => {
    const match = c.name.toLowerCase().includes(lowerInput) || c.code.toLowerCase().includes(lowerInput)
    const notSelected = !filters.value.countries.includes(c.code)
    return match && notSelected
  }).slice(0, 10)
})

const addCountry = (code: string) => {
  if (!filters.value.countries.includes(code)) {
    filters.value.countries.push(code)
  }
  countryInput.value = ''
  showCountryDropdown.value = false
  activeCountryIndex.value = -1
  fetchAthletes(false)
}

const removeCountry = (code: string) => {
  filters.value.countries = filters.value.countries.filter(c => c !== code)
  fetchAthletes(false)
}

// Obsługa klawiatury dla wyszukiwarki krajów
const onCountryKeyDown = (e: KeyboardEvent) => {
  if (!showCountryDropdown.value || filteredCountries.value.length === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeCountryIndex.value = (activeCountryIndex.value + 1) % filteredCountries.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeCountryIndex.value = (activeCountryIndex.value - 1 + filteredCountries.value.length) % filteredCountries.value.length
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (activeCountryIndex.value >= 0 && activeCountryIndex.value < filteredCountries.value.length) {
      const selected = filteredCountries.value[activeCountryIndex.value]
      if (selected) addCountry(selected.code)
    } else if (filteredCountries.value.length > 0) {
      // Automatyczny wybór pierwszego z listy, jeśli żaden nie był zaznaczony
      const first = filteredCountries.value[0]
      if (first) addCountry(first.code)
    }
  }
}

const onBlurCountry = () => {
  setTimeout(() => {
    showCountryDropdown.value = false
  }, 200)
}

watch(countryInput, () => {
  activeCountryIndex.value = -1
})

// Pobieranie słownika krajów
const fetchCountries = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/athletes/countries')
    if (res.ok) countries.value = await res.json()
  } catch (e) {
    console.error('Błąd pobierania krajów', e)
  }
}

// Główna funkcja pobierająca skoczków z bazy
const fetchAthletes = async (append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    filters.value.skip = 0
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/athletes/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters.value)
    })

    if (res.ok) {
      const data = await res.json()
      if (append) {
        athletes.value = [...athletes.value, ...data]
      } else {
        athletes.value = data
      }
    }
  } catch (e) {
    console.error('Błąd pobierania bazy skoczków', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  filters.value.skip += filters.value.limit
  fetchAthletes(true)
}

const onSearchInput = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    fetchAthletes(false)
  }, 500)
}

// --- LOGIKA SORTOWANIA W TABELI ---
const toggleSort = (key: string) => {
  if (filters.value.sort_by === key) {
    filters.value.sort_order = filters.value.sort_order === 1 ? -1 : 1
  } else {
    filters.value.sort_by = key
    filters.value.sort_order = 1
  }
  fetchAthletes(false)
}

const sortIcon = (key: string) => {
  if (filters.value.sort_by !== key) return '↕'
  return filters.value.sort_order === 1 ? '▲' : '▼'
}

// Skoro datę urodzenia przechowujemy w DB, to odwracamy symbolikę dla kolumny Wiek
const sortIconAge = () => {
  if (filters.value.sort_by !== 'birthdate') return '↕'
  return filters.value.sort_order === -1 ? '▲' : '▼'
}

// --- FUNKCJE POMOCNICZE ---
const calculateAge = (birthdate: string | null): string | number => {
  if (!birthdate) return '-'
  const dob = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()

  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age
}

const fetchPrices = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/stats/athletes/with-prices')
    if (res.ok) {
      const data: { name: string; fis_code: number; price: number }[] = await res.json()
      const map: Record<string, number> = {}
      for (const item of data) {
        if (item.fis_code != null) map[String(item.fis_code)] = item.price
        if (item.name) map[item.name.toLowerCase().trim()] = item.price
      }
      pricesMap.value = map
    }
  } catch (e) {
    // cichy fallback w przypadku braku połączenia
  }
}

const getAthletePrice = (athlete: Athlete): number | null => {
  if (athlete.price != null) return athlete.price
  if (athlete.fis_code && pricesMap.value[String(athlete.fis_code)] !== undefined) {
    return pricesMap.value[String(athlete.fis_code)] ?? null
  }
  const cleanName = athlete.full_name?.toLowerCase().trim()
  if (cleanName && pricesMap.value[cleanName] !== undefined) {
    return pricesMap.value[cleanName] ?? null
  }
  return null
}

const getCountryDisplay = (code: string) => {
  const c = countries.value.find(country => country.code === code)
  return c ? `${c.name} (${code})` : code
}

onMounted(() => {
  fetchCountries()
  fetchAthletes()
  fetchPrices()
})
</script>

<template>
  <div class="page">
    <div class="view-header">
      <h2>🎿 Baza Skoczków FIS</h2>
    </div>

    <div class="filters-container">
      <div class="filter-box flex-grow">
        <label>Szukaj zawodnika:</label>
        <input
          v-model="filters.search_name"
          @input="onSearchInput"
          type="text"
          placeholder="Wpisz imię lub nazwisko..."
          class="filter-input"
        />
      </div>

      <div class="filter-box filter-box-fixed">
        <label>Wiek od:</label>
        <input type="number" v-model="filters.age_min" @change="fetchAthletes(false)" class="filter-input" placeholder="np. 18" min="10" max="100"/>
      </div>

      <div class="filter-box filter-box-fixed">
        <label>Wiek do:</label>
        <input type="number" v-model="filters.age_max" @change="fetchAthletes(false)" class="filter-input" placeholder="np. 25" min="10" max="100"/>
      </div>

      <div class="filter-box filter-box-select">
        <label>Status:</label>
        <select v-model="filters.status" @change="fetchAthletes(false)" class="filter-input">
          <option value="">Wszyscy</option>
          <option value="ACTIVE">Aktywny</option>
          <option value="INACTIVE">Koniec kariery</option>
        </select>
      </div>
    </div>

    <div class="filters-container mt-0">
      <div class="filter-box flex-grow multi-select-container">
        <label>Filtruj po krajach (możesz dodać kilka):</label>
        <div class="chips-box">
          <span v-for="code in filters.countries" :key="code" class="chip">
            {{ code }}
            <button type="button" @click="removeCountry(code)">&times;</button>
          </span>

          <div class="input-wrapper">
            <input
              v-model="countryInput"
              @focus="showCountryDropdown = true"
              @blur="onBlurCountry"
              @keydown="onCountryKeyDown"
              type="text"
              placeholder="Wpisz kraj (np. POL, Niemcy)... użyj strzałek i TAB do nawigacji"
            />
            <ul v-if="showCountryDropdown && filteredCountries.length > 0" class="autocomplete-list">
              <li
                v-for="(c, idx) in filteredCountries"
                :key="c.code"
                @click="addCountry(c.code)"
                @mouseover="activeCountryIndex = idx"
                :class="{ active: activeCountryIndex === idx }"
              >
                {{ c.name }} ({{ c.code }})
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <SkiLoader v-if="loading">Pobieranie bazy skoczków FIS...</SkiLoader>

    <div v-else>
      <div class="table-responsive" v-if="athletes.length > 0">
        <table class="results-table">
          <thead>
          <tr>
            <th @click="toggleSort('country_code')" class="sortable col-country">
              Kraj <span class="sort-icon">{{ sortIcon('country_code') }}</span>
            </th>
            <th @click="toggleSort('full_name')" class="sortable col-name">
              Imię i Nazwisko <span class="sort-icon">{{ sortIcon('full_name') }}</span>
            </th>
            <th class="col-price">Cena ESM</th>
            <th @click="toggleSort('birthdate')" class="sortable col-age" title="Sortowanie po wieku">
              Wiek <span class="sort-icon">{{ sortIconAge() }}</span>
            </th>
            <th @click="toggleSort('birthdate')" class="sortable col-birthdate">
              Data ur. <span class="sort-icon">{{ sortIcon('birthdate') }}</span>
            </th>
            <th @click="toggleSort('club')" class="sortable col-club">
              Klub <span class="sort-icon">{{ sortIcon('club') }}</span>
            </th>
            <th class="col-actions">Akcje</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="athlete in athletes" :key="athlete.fis_code">
            <td class="col-country" style="cursor: help;">
              <img
                v-if="athlete.flagUrl"
                :src="athlete.flagUrl"
                class="mini-flag"
                :title="getCountryDisplay(athlete.country_code)"
                alt=""
              />
              <span v-else :title="getCountryDisplay(athlete.country_code)">🏳️</span>
            </td>
            <td class="col-name" :title="athlete.full_name">
              <RouterLink :to="'/athletes/' + athlete.fis_code" class="athlete-name-link">
                {{ athlete.full_name }}
              </RouterLink>
              <span v-if="athlete.status !== 'Active'" class="status-dot inactive" title="Koniec kariery"></span>
              <span v-else class="status-dot active" title="Aktywny"></span>
            </td>
            <td class="col-price">
              <span v-if="getAthletePrice(athlete) != null" class="price-chip">
                {{ getAthletePrice(athlete)!.toFixed(1) }}
              </span>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="col-age">{{ calculateAge(athlete.birthdate) }}</td>
            <td class="col-birthdate">
              {{ athlete.birthdate ? new Date(athlete.birthdate).toLocaleDateString() : 'Brak' }}
            </td>
            <td class="col-club" :title="athlete.club || ''">{{ athlete.club || '-' }}</td>
            <td class="col-actions">
              <RouterLink
                :to="{ path: '/stats', query: { fis_code: athlete.fis_code, name: athlete.full_name } }"
                class="btn-details"
                title="Zobacz statystyki"
              >
                Statystyki ↗
              </RouterLink>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-if="athletes.length >= filters.limit" class="load-more-container">
        <button @click="loadMore" :disabled="loadingMore" class="btn-load-more">
          {{ loadingMore ? 'Ładowanie...' : 'Pokaż kolejnych ↓' }}
        </button>
      </div>

      <div v-if="athletes.length === 0" class="no-results">
        🎿 Brak skoczków spełniających kryteria.
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

.view-header {
  margin-bottom: 14px;
}
.view-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.45em;
  font-weight: 800;
}

/* FILTRY */
.filters-container {
  display: flex;
  gap: 12px;
  background: #f8fafc;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 14px;
  border: 1px solid #e2e8f0;
  align-items: flex-end;
  flex-wrap: wrap;
}
.mt-0 {
  margin-top: -6px;
  margin-bottom: 18px;
}
.filter-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filter-box-fixed {
  flex: 0 0 100px;
}
.filter-box-select {
  flex: 0 0 140px;
}
.flex-grow {
  flex: 1 1 200px;
}
.filter-box label {
  font-size: 0.75em;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  height: 16px;
  line-height: 16px;
}
.filter-input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.88em;
  width: 100%;
  box-sizing: border-box;
  background: white;
  color: #1e293b;
}
.filter-input:focus {
  outline: none;
  border-color: #0284c7;
}

/* MULTI SELECT CSS */
.multi-select-container label {
  margin-bottom: 0;
  height: 16px;
  line-height: 16px;
}
.chips-box {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  align-items: center;
  min-height: 36px;
}
.chip {
  background: #0284c7;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.78em;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.chip button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
  padding: 0;
}
.chip button:hover {
  color: #f87171;
}
.input-wrapper {
  position: relative;
  flex-grow: 1;
  min-width: 140px;
}
.input-wrapper input {
  border: none;
  width: 100%;
  outline: none;
  padding: 2px 4px;
  background: transparent;
  font-size: 0.85em;
}
.autocomplete-list {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  max-height: 180px;
  overflow-y: auto;
  list-style: none;
  padding: 0;
  margin: 4px 0 0 0;
  z-index: 10;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
}
.autocomplete-list li {
  padding: 7px 10px;
  cursor: pointer;
  font-size: 0.82em;
  border-bottom: 1px solid #f1f5f9;
}
.autocomplete-list li.active,
.autocomplete-list li:hover {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 700;
}

/* TABELA I SORTOWANIE */
.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  table-layout: fixed;
  font-size: 0.88em;
}
.results-table th,
.results-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
}

.col-country { width: 70px; text-align: center; }
.col-name { width: auto; }
.col-price { width: 85px; text-align: center; }
.col-age { width: 75px; text-align: center; }
.col-birthdate { width: 95px; }
.col-club { width: 20%; }
.col-actions { width: 110px; text-align: right; }

.price-chip {
  display: inline-block;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
  font-size: 0.82em;
  padding: 2px 7px;
  border-radius: 12px;
  border: 1px solid #a7f3d0;
  font-family: monospace;
}
.text-muted {
  color: #94a3b8;
}

.sortable {
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.sortable:hover {
  background-color: #e2e8f0;
  color: #0f172a;
}
.sort-icon {
  font-size: 0.8em;
  color: #94a3b8;
  margin-left: 3px;
  display: inline-block;
}
.mini-flag {
  width: 24px;
  height: 16px;
  object-fit: contain;
  vertical-align: middle;
  border-radius: 2px;
  border: 1px solid #e2e8f0;
}
.btn-details {
  background: #0284c7;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}
.btn-details:hover {
  background: #0369a1;
}
.athlete-name-link {
  color: #0284c7;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.15s ease;
  margin-right: 6px;
}
.athlete-name-link:hover {
  color: #0284c7;
  text-decoration: underline;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-bottom: 1px;
}
.status-dot.active {
  background-color: #22c55e;
  box-shadow: 0 0 4px #22c55e;
}
.status-dot.inactive {
  background-color: #cbd5e1;
}

.no-results {
  text-align: center;
  color: #64748b;
  padding: 30px;
  font-style: italic;
  font-size: 0.9em;
  background: #f8fafc;
  border-radius: 6px;
  margin-top: 15px;
}
.load-more-container {
  text-align: center;
  margin-top: 18px;
}
.btn-load-more {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 8px 20px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 0.85em;
  cursor: pointer;
}
.btn-load-more:hover {
  background: #e2e8f0;
  color: #0f172a;
}

@media (max-width: 900px) {
  .col-club { display: none; }
}

@media (max-width: 768px) {
  .page {
    padding: 12px;
  }
  .filters-container {
    flex-direction: column;
    align-items: stretch;
  }
  .col-birthdate { display: none; }
}

@media (max-width: 500px) {
  .col-age { display: none; }
  .col-country { width: 50px; }
}
</style>
