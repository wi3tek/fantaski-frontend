<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'

const auth = useAuth()

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

// Stan Filtrów (wysyłany do backendu) - Domyślnie tylko aktywni skoczkowie
const filters = ref({
  search_name: '',
  countries: [] as string[],
  status: 'ACTIVE', // Domyślnie 'ACTIVE' (aktywni skoczkowie)
  seasons: [] as string[], // Sezony startów
  categories: [] as string[], // Rodzaje zawodów (WC, COC itd.)
  age_min: null as number | null,
  age_max: null as number | null,
  sort_by: 'full_name',
  sort_order: 1,
  limit: 20,
  skip: 0
})

// Metadane filtrów sezonów i rodzajów zawodów
const availableSeasons = ref<string[]>([])
const availableCategories = ref<{ code: string; name: string }[]>([])
const showSeasonDropdown = ref(false)
const showCategoryDropdown = ref(false)
const showMobileFilters = ref(false)

const toggleSeason = (season: string) => {
  const idx = filters.value.seasons.indexOf(season)
  if (idx > -1) {
    filters.value.seasons.splice(idx, 1)
  } else {
    filters.value.seasons.push(season)
  }
  fetchAthletes(false)
}

const selectAllSeasons = () => {
  filters.value.seasons = [...availableSeasons.value]
  fetchAthletes(false)
}

const clearSeasons = () => {
  filters.value.seasons = []
  fetchAthletes(false)
}

const toggleCategory = (catCode: string) => {
  const idx = filters.value.categories.indexOf(catCode)
  if (idx > -1) {
    filters.value.categories.splice(idx, 1)
  } else {
    filters.value.categories.push(catCode)
  }
  fetchAthletes(false)
}

const selectAllCategories = () => {
  filters.value.categories = availableCategories.value.map(c => c.code)
  fetchAthletes(false)
}

const clearCategories = () => {
  filters.value.categories = []
  fetchAthletes(false)
}

const getCategoryLabel = (code?: string) => {
  if (!code) return ''
  const found = availableCategories.value.find(c => c.code === code)
  return found ? found.name : code
}

const hasActiveExtraFilters = computed(() => {
  return (
    filters.value.seasons.length > 0 ||
    filters.value.categories.length > 0 ||
    filters.value.countries.length > 0 ||
    filters.value.age_min !== null ||
    filters.value.age_max !== null ||
    filters.value.status !== 'ACTIVE'
  )
})

const activeExtraFiltersCount = computed(() => {
  let count = 0
  if (filters.value.status !== 'ACTIVE') count++
  if (filters.value.age_min !== null || filters.value.age_max !== null) count++
  if (filters.value.seasons.length > 0) count++
  if (filters.value.categories.length > 0) count++
  if (filters.value.countries.length > 0) count++
  return count
})

const clearAllFilters = () => {
  filters.value.search_name = ''
  filters.value.countries = []
  filters.value.status = 'ACTIVE'
  filters.value.seasons = []
  filters.value.categories = []
  filters.value.age_min = null
  filters.value.age_max = null
  fetchAthletes(false)
}

const fetchFiltersMeta = async () => {
  try {
    const data = await api.get('/athletes/filters-meta', { cacheTtlMs: 300000 })
    availableSeasons.value = data.seasons || []
    availableCategories.value = data.categories || []
  } catch (e) {
    console.error('Błąd pobierania metadanych filtrów skoczków', e)
  }
}

const closeAllDropdowns = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.dropdown-container')) {
    showSeasonDropdown.value = false
    showCategoryDropdown.value = false
  }
}

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

// Pobieranie słownika krajów (z in-memory cache)
const fetchCountries = async () => {
  try {
    const data = await api.get('/athletes/countries', { cacheTtlMs: 300000 })
    countries.value = data
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
    const data = await api.post('/athletes/list', filters.value)
    if (append) {
      athletes.value = [...athletes.value, ...data]
    } else {
      athletes.value = data
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
  if (!auth.isPro.value) return
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
    // cichy fallback w przypadku braku uprawnień lub błędu
  }
}

watch(() => auth.isPro.value, (isPro) => {
  if (isPro) fetchPrices()
})

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
  fetchFiltersMeta()
  fetchAthletes()
  fetchPrices()
  window.addEventListener('click', closeAllDropdowns)
})

onUnmounted(() => {
  window.removeEventListener('click', closeAllDropdowns)
})
</script>

<template>
  <div class="page">
    <div class="view-header">
      <h2>🎿 Baza Skoczków FIS</h2>
    </div>

    <div class="filters-bar-primary">
      <div class="filter-box filter-search-box flex-grow">
        <label>Szukaj zawodnika:</label>
        <input
          v-model="filters.search_name"
          @input="onSearchInput"
          type="text"
          placeholder="Wpisz imię lub nazwisko..."
          class="filter-input"
        />
      </div>

      <button
        type="button"
        class="mobile-filters-toggle"
        @click="showMobileFilters = !showMobileFilters"
      >
        <span>🎛️ Filtry{{ activeExtraFiltersCount ? ` (${activeExtraFiltersCount})` : '' }}</span>
        <span>{{ showMobileFilters ? '▴' : '▾' }}</span>
      </button>
    </div>

    <div class="filters-advanced-wrapper" :class="{ 'mobile-open': showMobileFilters }">
      <div class="filters-container filters-compact-grid">
        <div class="filter-box filter-box-fixed">
          <label>Wiek od:</label>
          <input type="number" v-model="filters.age_min" @change="fetchAthletes(false)" class="filter-input" placeholder="np. 18" min="10" max="100"/>
        </div>

        <div class="filter-box filter-box-fixed">
          <label>Wiek do:</label>
          <input type="number" v-model="filters.age_max" @change="fetchAthletes(false)" class="filter-input" placeholder="np. 25" min="10" max="100"/>
        </div>

        <div class="filter-box filter-box-select filter-span-2-mobile">
          <label>Status:</label>
          <select v-model="filters.status" @change="fetchAthletes(false)" class="filter-input">
            <option value="ACTIVE">Tylko aktywni (Domyślne)</option>
            <option value="">Wszyscy (w tym byli skoczkowie)</option>
            <option value="INACTIVE">Koniec kariery</option>
          </select>
        </div>
      </div>

      <div class="filters-container mt-0 filters-compact-grid">
        <!-- Filtr Sezonów (Rozwijana lista z checkboxami) -->
        <div class="filter-box dropdown-container">
          <label>Sezon startów:</label>
          <div class="dropdown-wrapper">
            <button
              type="button"
              class="dropdown-toggle-btn"
              @click.stop="showSeasonDropdown = !showSeasonDropdown; showCategoryDropdown = false"
              title="Wybierz sezony, w których startowali zawodnicy"
            >
              <span>
                {{ filters.seasons.length === 0 ? 'Wszystkie' : (filters.seasons.length === 1 ? `Sezon ${filters.seasons[0]}` : `Sezony: ${filters.seasons.length}`) }}
              </span>
              <span class="dropdown-arrow">▼</span>
            </button>

            <div v-if="showSeasonDropdown" class="dropdown-panel" @click.stop>
              <div class="dropdown-panel-actions">
                <button type="button" class="btn-text-xs" @click="selectAllSeasons">Zaznacz wszystkie</button>
                <button type="button" class="btn-text-xs" @click="clearSeasons">Wyczyść</button>
              </div>
              <div class="dropdown-panel-items">
                <label v-for="s in availableSeasons" :key="s" class="dropdown-checkbox-item">
                  <input
                    type="checkbox"
                    :value="s"
                    :checked="filters.seasons.includes(s)"
                    @change="toggleSeason(s)"
                  />
                  <span>Sezon {{ s }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Filtr Rodzaju Zawodów (PŚ, COC, LGP, FC itd.) -->
        <div class="filter-box dropdown-container dropdown-align-right-mobile">
          <label>Rodzaj zawodów:</label>
          <div class="dropdown-wrapper">
            <button
              type="button"
              class="dropdown-toggle-btn"
              @click.stop="showCategoryDropdown = !showCategoryDropdown; showSeasonDropdown = false"
              title="Wybierz rodzaj zawodów, w których startowali zawodnicy"
            >
              <span>
                {{ filters.categories.length === 0 ? 'Wszystkie' : (filters.categories.length === 1 ? getCategoryLabel(filters.categories[0]) : `Rodzaje: ${filters.categories.length}`) }}
              </span>
              <span class="dropdown-arrow">▼</span>
            </button>

            <div v-if="showCategoryDropdown" class="dropdown-panel" @click.stop>
              <div class="dropdown-panel-actions">
                <button type="button" class="btn-text-xs" @click="selectAllCategories">Zaznacz wszystkie</button>
                <button type="button" class="btn-text-xs" @click="clearCategories">Wyczyść</button>
              </div>
              <div class="dropdown-panel-items">
                <label v-for="cat in availableCategories" :key="cat.code" class="dropdown-checkbox-item">
                  <input
                    type="checkbox"
                    :value="cat.code"
                    :checked="filters.categories.includes(cat.code)"
                    @change="toggleCategory(cat.code)"
                  />
                  <span>{{ cat.name }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Filtr Krajów -->
        <div class="filter-box flex-grow multi-select-container filter-span-2-mobile">
          <label>Filtruj po krajach:</label>
          <div class="chips-box">
            <span v-for="code in filters.countries" :key="code" class="chip">
              <CountryFlag :code="code" size="xs" />
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
                placeholder="Wpisz kraj (np. POL, Niemcy)..."
              />
              <ul v-if="showCountryDropdown && filteredCountries.length > 0" class="autocomplete-list">
                <li
                  v-for="(c, idx) in filteredCountries"
                  :key="c.code"
                  @click="addCountry(c.code)"
                  @mouseover="activeCountryIndex = idx"
                  :class="{ active: activeCountryIndex === idx }"
                >
                  <CountryFlag :code="c.code" size="xs" />
                  <span>{{ c.name }} ({{ c.code }})</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pasek aktywnych filtrów (szybkie czyszczenie) -->
    <div v-if="hasActiveExtraFilters" class="active-filters-row">
      <span class="active-filters-label">Aktywne filtry:</span>
      <span v-if="filters.status !== 'ACTIVE'" class="active-filter-badge badge-status">
        Status: {{ filters.status === '' ? 'Wszyscy' : 'Koniec kariery' }}
        <button type="button" @click="filters.status = 'ACTIVE'; fetchAthletes(false)">&times;</button>
      </span>
      <span v-for="s in filters.seasons" :key="s" class="active-filter-badge badge-season">
        Sezon {{ s }}
        <button type="button" @click="toggleSeason(s)">&times;</button>
      </span>
      <span v-for="c in filters.categories" :key="c" class="active-filter-badge badge-cat">
        {{ getCategoryLabel(c) }}
        <button type="button" @click="toggleCategory(c)">&times;</button>
      </span>
      <span v-for="co in filters.countries" :key="co" class="active-filter-badge badge-country">
        <CountryFlag :code="co" size="xs" :show-code="true" />
        <button type="button" @click="removeCountry(co)">&times;</button>
      </span>
      <button type="button" class="btn-clear-all" @click="clearAllFilters">
        ✕ Wyczyść filtry
      </button>
    </div>

    <SkiLoader v-if="loading">Pobieranie bazy skoczków FIS...</SkiLoader>

    <div v-else>
      <div class="table-responsive desktop-only" v-if="athletes.length > 0">
        <table class="results-table">
          <thead>
          <tr>
            <th @click="toggleSort('country_code')" class="sortable col-country">
              Kraj <span class="sort-icon">{{ sortIcon('country_code') }}</span>
            </th>
            <th @click="toggleSort('full_name')" class="sortable col-name">
              Imię i Nazwisko <span class="sort-icon">{{ sortIcon('full_name') }}</span>
            </th>
            <th v-if="auth.isPro.value" class="col-price">Cena Fantasy</th>
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
            <td class="col-country">
              <CountryFlag
                :code="athlete.country_code"
                :src="athlete.flagUrl"
                size="sm"
                :title="getCountryDisplay(athlete.country_code)"
              />
            </td>
            <td class="col-name" :title="athlete.full_name">
              <RouterLink :to="'/athletes/' + athlete.fis_code" class="athlete-name-link">
                {{ athlete.full_name }}
              </RouterLink>
              <span v-if="athlete.status !== 'Active'" class="status-dot inactive" title="Koniec kariery"></span>
              <span v-else class="status-dot active" title="Aktywny"></span>
            </td>
            <td v-if="auth.isPro.value" class="col-price">
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

      <!-- KARTY MOBILNE SKOCZKÓW (<= 768px) -->
      <div class="athletes-mobile-cards mobile-only" v-if="athletes.length > 0">
        <div v-for="athlete in athletes" :key="athlete.fis_code" class="athlete-m-card">
          <div class="amc-top">
            <div class="amc-identity">
              <CountryFlag
                :code="athlete.country_code"
                :src="athlete.flagUrl"
                size="sm"
                :title="getCountryDisplay(athlete.country_code)"
              />
              <RouterLink :to="'/athletes/' + athlete.fis_code" class="athlete-name-link amc-name">
                {{ athlete.full_name }}
              </RouterLink>
              <span v-if="athlete.status !== 'Active'" class="status-dot inactive" title="Koniec kariery"></span>
              <span v-else class="status-dot active" title="Aktywny"></span>
            </div>
            <span v-if="auth.isPro.value && getAthletePrice(athlete) != null" class="price-chip">
              {{ getAthletePrice(athlete)!.toFixed(1) }}
            </span>
          </div>

          <div class="amc-meta">
            <CountryFlag
              :code="athlete.country_code"
              :src="athlete.flagUrl"
              size="xs"
              :show-code="true"
              :title="getCountryDisplay(athlete.country_code)"
            />
            <span>🎂 {{ calculateAge(athlete.birthdate) }} lat</span>
            <span v-if="athlete.club" class="amc-club">🎿 {{ athlete.club }}</span>
          </div>

          <div class="amc-actions">
            <RouterLink :to="'/athletes/' + athlete.fis_code" class="amc-btn-profile">
              Profil
            </RouterLink>
            <RouterLink
              :to="{ path: '/stats', query: { fis_code: athlete.fis_code, name: athlete.full_name } }"
              class="btn-details amc-btn-stats"
            >
              Statystyki ↗
            </RouterLink>
          </div>
        </div>
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
.filters-bar-primary {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: #f8fafc;
  padding: 12px 14px 10px;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
}
.mobile-filters-toggle {
  display: none;
}
.filters-advanced-wrapper {
  display: block;
}
.filters-container {
  display: flex;
  gap: 12px;
  background: #f8fafc;
  padding: 8px 14px 12px;
  border-radius: 0;
  margin-bottom: 0;
  border: 1px solid #e2e8f0;
  border-top: none;
  align-items: flex-end;
  flex-wrap: wrap;
}
.filters-container.mt-0 {
  margin-top: 0;
  margin-bottom: 16px;
  border-radius: 0 0 6px 6px;
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
  display: flex;
  align-items: center;
  gap: 7px;
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

/* ROZWIJANE MENU Z CHECKBOXAMI (SEZONY / KATEGORIE) */
.dropdown-container {
  min-width: 170px;
  max-width: 210px;
  position: relative;
}
.dropdown-wrapper {
  position: relative;
  width: 100%;
}
.dropdown-toggle-btn {
  width: 100%;
  padding: 6px 10px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.85em;
  color: #1e293b;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  height: 36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dropdown-toggle-btn:hover {
  border-color: #0284c7;
  background: #f8fafc;
}
.dropdown-arrow {
  font-size: 0.7em;
  color: #64748b;
  margin-left: 6px;
}
.dropdown-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 240px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 100;
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.dropdown-panel-actions {
  display: flex;
  justify-content: space-between;
  padding: 4px 6px 6px 6px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}
.btn-text-xs {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.76em;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}
.btn-text-xs:hover {
  background: #e0f2fe;
}
.dropdown-panel-items {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.dropdown-checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82em;
  color: #334155;
  transition: background 0.15s;
}
.dropdown-checkbox-item:hover {
  background: #f8fafc;
  color: #0f172a;
}
.dropdown-checkbox-item input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: #0284c7;
  cursor: pointer;
}

/* PASEK AKTYWNYCH FILTRÓW */
.active-filters-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.8em;
}
.active-filters-label {
  color: #64748b;
  font-weight: 600;
  margin-right: 4px;
}
.active-filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.82em;
  font-weight: 600;
}
.active-filter-badge button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1em;
  line-height: 1;
  padding: 0;
  color: inherit;
  opacity: 0.8;
}
.active-filter-badge button:hover {
  opacity: 1;
}
.active-filter-badge.badge-season {
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #b45309;
}
.active-filter-badge.badge-cat {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
}
.active-filter-badge.badge-country {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
}
.active-filter-badge.badge-status {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
}
.btn-clear-all {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 0.8em;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  margin-left: auto;
  border-radius: 4px;
}
.btn-clear-all:hover {
  background: #fee2e2;
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
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
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

.mobile-only {
  display: none;
}

@media (max-width: 900px) {
  .col-club { display: none; }
}

@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .page {
    padding: 12px;
  }
  .filters-bar-primary {
    border-radius: 8px;
    border-bottom: 1px solid #e2e8f0;
    padding: 10px;
    margin-bottom: 8px;
    align-items: stretch;
  }
  .mobile-filters-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #0f172a;
    border-radius: 6px;
    padding: 0 11px;
    height: 36px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    align-self: flex-end;
  }
  .filters-advanced-wrapper {
    display: none;
    margin-bottom: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: visible;
    background: #f8fafc;
  }
  .filters-advanced-wrapper.mobile-open {
    display: block;
  }
  .filters-container.filters-compact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px;
    border: none;
    background: transparent;
  }
  .filters-container.mt-0.filters-compact-grid {
    padding-top: 0;
    margin-bottom: 0;
  }
  .filter-span-2-mobile {
    grid-column: span 2;
  }
  .filter-box,
  .filter-box-fixed,
  .filter-box-select,
  .dropdown-container {
    width: 100%;
    min-width: 0;
    max-width: none;
  }
  .dropdown-align-right-mobile .dropdown-panel {
    left: auto;
    right: 0;
  }
  .dropdown-panel {
    max-width: calc(100vw - 36px);
  }
  .athlete-m-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  }
  .amc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .amc-identity {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .amc-name {
    font-size: 0.88rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .amc-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.74rem;
    color: #64748b;
  }
  .amc-club {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .amc-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 2px;
  }
  .amc-btn-profile {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
  }
  .amc-btn-stats {
    padding: 6px 8px;
    font-size: 0.78rem;
    min-height: 36px;
    border-radius: 6px;
  }
}
</style>
