<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuth } from '@/stores/auth'
import { useNotice } from '@/stores/notice'

const auth = useAuth()
const notice = useNotice()

const props = defineProps<{
  searchForm: any
  selectedNames: string[]
  priceMode: boolean
  priceMin: number
  priceMax: number
  collapsed?: boolean
  hasResults?: boolean
  availableNames: string[]
  athletesWithPrices: any[]
  dictionaries: any
  loading: boolean
}>()

const emit = defineEmits([
  'update:searchForm',
  'update:selectedNames',
  'update:priceMode',
  'update:priceMin',
  'update:priceMax',
  'update:collapsed',
  'execute-search',
])

const isCollapsed = computed({
  get: () => Boolean(props.collapsed),
  set: (v: boolean) => emit('update:collapsed', v),
})

const selectedNamesPreview = computed(() => {
  if (localPriceMode.value && localNames.value.length === 0) {
    return `Przedział cenowy ${Number(localPriceMin.value).toFixed(1)}–${Number(localPriceMax.value).toFixed(1)}`
  }
  if (localNames.value.length === 0) return 'Brak wybranych skoczków'
  const firstTwo = localNames.value.slice(0, 2).join(', ')
  const extra = localNames.value.length - 2
  return extra > 0 ? `${firstTwo} (+${extra})` : firstTwo
})

const localForm = computed({
  get: () => props.searchForm,
  set: (v) => emit('update:searchForm', v),
})
const localNames = computed({
  get: () => props.selectedNames,
  set: (v) => emit('update:selectedNames', v),
})
const localPriceMode = computed({
  get: () => props.priceMode,
  set: (v) => emit('update:priceMode', v),
})
const localPriceMin = computed({
  get: () => props.priceMin,
  set: (v) => emit('update:priceMin', v),
})
const localPriceMax = computed({
  get: () => props.priceMax,
  set: (v) => emit('update:priceMax', v),
})

const nameInput = ref('')
const showDropdown = ref(false)
const activeIndex = ref(-1)
const showCategoryDropdown = ref(false)
const showPlaceDropdown = ref(false)
const placeContainerRef = ref<HTMLElement | null>(null)
const athleteContainerRef = ref<HTMLElement | null>(null)

const filteredNames = computed(() => {
  if (!nameInput.value) return []
  const lowerInput = nameInput.value.toLowerCase()
  if (localPriceMode.value) {
    return props.athletesWithPrices
      .filter(
        (a) => a.name.toLowerCase().includes(lowerInput) && !localNames.value.includes(a.name),
      )
      .slice(0, 15)
  } else {
    return props.availableNames
      .filter((n) => n.toLowerCase().includes(lowerInput) && !localNames.value.includes(n))
      .map((n) => ({ name: n }))
      .slice(0, 15)
  }
})

const addName = (name: string) => {
  if (!auth.isPro.value && localNames.value.length >= 2) {
    notice.showNotice({
      title: 'Limit konta darmowego',
      message: 'Darmowe konto pozwala na jednoczesne porównanie maksymalnie 2 zawodników. Przejdź na pakiet PRO, aby analizować dowolną liczbę skoczków.',
      badge: 'FREE: MAX 2',
    })
    return
  }
  if (!localNames.value.includes(name)) localNames.value = [...localNames.value, name]
  nameInput.value = ''
  showDropdown.value = false
}
const removeName = (name: string) => {
  localNames.value = localNames.value.filter((n) => n !== name)
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
      addName(filteredNames.value[activeIndex.value].name)
      activeIndex.value = -1
    }
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (placeContainerRef.value && !placeContainerRef.value.contains(event.target as Node))
    showPlaceDropdown.value = false
  if (athleteContainerRef.value && !athleteContainerRef.value.contains(event.target as Node))
    showDropdown.value = false
}

const filteredPlaces = computed(() => {
  if (!localForm.value.place) return (props.dictionaries?.places || []).slice(0, 10)
  const lowerInput = localForm.value.place.toLowerCase()
  return (props.dictionaries?.places || [])
    .filter((p: string) => p.toLowerCase().includes(lowerInput))
    .slice(0, 10)
})

const selectPlace = (place: string) => {
  localForm.value.place = place
  showPlaceDropdown.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

// Zestawy Local Storage
const savedSets = ref<Record<string, string[]>>({})
const newSetName = ref('')
const showSaveModal = ref(false)

onMounted(() => {
  const stored = localStorage.getItem('esm_saved_athlete_sets')
  if (stored) {
    try {
      savedSets.value = JSON.parse(stored)
    } catch (e) {}
  }
})
const saveCurrentSet = () => {
  if (!newSetName.value.trim()) return
  savedSets.value[newSetName.value.trim()] = [...localNames.value]
  localStorage.setItem('esm_saved_athlete_sets', JSON.stringify(savedSets.value))
  newSetName.value = ''
  showSaveModal.value = false
}
const loadSet = (setName: string) => {
  if (savedSets.value[setName]) localNames.value = [...savedSets.value[setName]]
}
const deleteSavedSet = (setName: string) => {
  const copy = { ...savedSets.value }
  delete copy[setName]
  savedSets.value = copy
  localStorage.setItem('esm_saved_athlete_sets', JSON.stringify(savedSets.value))
}

// --- CZYSZCZENIE I PRESETY FILTRÓW ---
const showAdvancedFilters = ref(false)

// Licznik aktywnych kryteriów zaawansowanych
const activeCriteriaCount = computed(() => {
  let count = 0
  if (localForm.value.place) count++
  if (localForm.value.hill_type) count++
  if (localForm.value.category && localForm.value.category.length > 0) count++
  if (localForm.value.session_type) count++
  if (localForm.value.date_from || localForm.value.date_to) count++
  if (localForm.value.limit && localForm.value.limit !== 10) count++
  return count
})

// Lista aktywnych filtrów do szybkiego usuwania pojedynczych kryteriów (Active Filter Chips)
const activeFiltersList = computed(() => {
  const chips: { key: string; label: string; clear: () => void }[] = []

  if (localPriceMode.value) {
    chips.push({
      key: 'price',
      label: `Cena: ${Number(localPriceMin.value).toFixed(1)} - ${Number(localPriceMax.value).toFixed(1)}`,
      clear: () => {
        localPriceMode.value = false
      },
    })
  }

  if (localForm.value.place) {
    chips.push({
      key: 'place',
      label: `Miejsce: ${localForm.value.place}`,
      clear: () => {
        localForm.value.place = ''
      },
    })
  }

  if (localForm.value.hill_type) {
    const hillName =
      props.dictionaries?.hills?.[localForm.value.hill_type]?.pl || localForm.value.hill_type
    chips.push({
      key: 'hill_type',
      label: `Skocznia: ${hillName}`,
      clear: () => {
        localForm.value.hill_type = ''
      },
    })
  }

  if (localForm.value.category && localForm.value.category.length > 0) {
    const catLabels = localForm.value.category
      .map((c: string) => props.dictionaries?.categories?.[c]?.pl || c)
      .join(', ')
    chips.push({
      key: 'category',
      label: `Cykl: ${catLabels}`,
      clear: () => {
        localForm.value.category = []
      },
    })
  }

  if (localForm.value.session_type) {
    const sessName =
      props.dictionaries?.sessions?.[localForm.value.session_type]?.pl || localForm.value.session_type
    chips.push({
      key: 'session_type',
      label: `Sesja: ${sessName}`,
      clear: () => {
        localForm.value.session_type = ''
      },
    })
  }

  if (localForm.value.date_from || localForm.value.date_to) {
    chips.push({
      key: 'dates',
      label: `Daty: ${localForm.value.date_from || '...'} do ${localForm.value.date_to || '...'}`,
      clear: () => {
        localForm.value.date_from = ''
        localForm.value.date_to = ''
      },
    })
  }

  if (localForm.value.limit && localForm.value.limit !== 10) {
    chips.push({
      key: 'limit',
      label: `Limit skoków: ${localForm.value.limit}`,
      clear: () => {
        localForm.value.limit = 10
      },
    })
  }

  return chips
})

// Szybkie presety 1-click
const applyQuickPreset = (preset: 'wc' | 'flying' | 'individual' | 'recent') => {
  if (preset === 'wc') {
    localForm.value.category = ['WC']
    localForm.value.session_type = ''
    localForm.value.limit = auth.isPro.value ? 20 : 10
  } else if (preset === 'flying') {
    localForm.value.hill_type = 'FLYING'
  } else if (preset === 'individual') {
    localForm.value.session_type = 'INDIVIDUAL'
  } else if (preset === 'recent') {
    localForm.value.limit = 5
  }
}

// --- CZYSZCZENIE FILTRÓW ---
const clearFilters = () => {
  // Resetujemy formularz do wartości domyślnych
  localForm.value = {
    place: '',
    hill_type: '',
    category: [],
    session_type: '',
    date_from: '',
    date_to: '',
    limit: 10,
  }

  // Resetujemy resztę zmiennych
  localNames.value = []
  localPriceMode.value = false
  localPriceMin.value = 0.1
  localPriceMax.value = 3.0
  nameInput.value = ''
}

const submitSearch = () => {
  let finalNames: string[] = []
  if (localPriceMode.value) {
    const inRange = props.athletesWithPrices.filter(
      (a) => a.price >= localPriceMin.value && a.price <= localPriceMax.value,
    )
    finalNames =
      localNames.value.length > 0
        ? inRange.filter((a) => localNames.value.includes(a.name)).map((a) => a.name)
        : inRange.map((a) => a.name)
    if (finalNames.length === 0) {
      notice.showNotice({
        title: 'Brak wyników cenowych',
        message: 'Żaden zawodnik nie mieści się w wybranym przedziale cenowym. Rozszerz zakres suwaków.',
        badge: 'FILTR CENOWY',
      })
      return
    }
  } else {
    if (localNames.value.length === 0) {
      notice.showNotice({
        title: 'Wybierz zawodników',
        message: 'Dodaj co najmniej jednego skoczka do listy, aby pobrać i porównać statystyki.',
        badge: 'WYMAGANY SKOCZEK',
      })
      return
    }
    finalNames = [...localNames.value]
  }

  if (!auth.isPro.value && finalNames.length > 2) {
    notice.showNotice({
      title: 'Limit konta darmowego',
      message: 'Darmowe konto pozwala na jednoczesne porównanie maksymalnie 2 zawodników. Przejdź na pakiet PRO, aby analizować dowolną liczbę skoczków.',
      badge: 'FREE: MAX 2',
    })
    return
  }

  const payload: any = Object.fromEntries(
    Object.entries(localForm.value).filter(([_, v]) =>
      Array.isArray(v) ? v.length > 0 : v !== '' && v !== null,
    ),
  )
  emit('execute-search', payload, finalNames)
}
</script>

<template>
  <!-- ZWINIĘTY PASEK PODSUMOWANIA FILTRÓW NA MOBILCE -->
  <div v-if="isCollapsed" class="card search-collapsed-bar">
    <div class="scb-info">
      <span class="scb-title">🔍 {{ selectedNamesPreview }}</span>
      <span v-if="activeFiltersList.length > 0" class="scb-meta">
        · {{ activeFiltersList.length }} aktywnych filtrów
      </span>
    </div>
    <div class="scb-actions">
      <button type="button" class="btn-scb-edit" @click="isCollapsed = false">
        ⚙️ Edytuj filtry
      </button>
    </div>
  </div>

  <div v-show="!isCollapsed" class="card search-card">
    <div class="card-header header-flex-row">
      <div>
        <h3>🔍 Kryteria Wyszukiwania i Porównywarki</h3>
        <p class="subtitle">
          Wybierz skoczków (lub zapisany skład) i pobierz wyniki historyczne.
        </p>
      </div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button
          v-if="hasResults"
          type="button"
          class="preset-chip mobile-only-inline"
          @click="isCollapsed = true"
        >
          ▲ Zwiń filtry
        </button>
        <button type="button" class="preset-chip reset-chip" @click="clearFilters">
          🔄 Wyczyść wszystko
        </button>
      </div>
    </div>

    <form @submit.prevent="submitSearch" class="search-form">
      <!-- SZYBKIE PRESETY 1-CLICK + ANALIZA CEN -->
      <div class="quick-presets-bar">
        <span class="presets-intro">⚡ Szybkie filtry:</span>
        <button
          type="button"
          class="preset-chip"
          :class="{ active: localForm.category.length === 1 && localForm.category[0] === 'WC' }"
          @click="applyQuickPreset('wc')"
        >
          🏆 Puchar Świata
        </button>
        <button
          type="button"
          class="preset-chip"
          :class="{ active: localForm.hill_type === 'FLYING' }"
          @click="applyQuickPreset('flying')"
        >
          🦅 Mamuty
        </button>
        <button
          type="button"
          class="preset-chip"
          :class="{ active: localForm.session_type === 'INDIVIDUAL' }"
          @click="applyQuickPreset('individual')"
        >
          🎯 Konkursy
        </button>
        <button
          type="button"
          class="preset-chip"
          :class="{ active: localForm.limit === 5 }"
          @click="applyQuickPreset('recent')"
        >
          ⏱️ Ostatnie 5 prób
        </button>
        <label
          v-if="auth.isPro.value"
          class="toggle-label toggle-esm"
          style="margin-left: auto"
          title="Włącza filtrowanie po cenie z Fantasy i pobiera automatycznie wszystkich zawodników z przedziału."
        >
          <input v-model="localPriceMode" type="checkbox" />
          <span style="font-weight: 600">🎯 Analiza cen</span>
        </label>
        <span
          v-else
          class="toggle-label toggle-esm"
          style="margin-left: auto; opacity: 0.65; cursor: not-allowed"
          title="Analiza cen zawodników Fantasy jest dostępna w planie FantaSKI PRO."
        >
          <span style="font-weight: 600">🔒 Analiza cen (PRO)</span>
        </span>
      </div>

      <div v-if="localPriceMode" class="price-sliders-container" style="margin-bottom: 20px">
        <div class="slider-group">
          <div class="slider-header">
            <label>Minimalna cena (od):</label>
            <span class="price-badge">{{ Number(localPriceMin).toFixed(1) }}</span>
          </div>
          <input
            type="range"
            class="styled-slider"
            v-model.number="localPriceMin"
            min="0.1"
            max="6.0"
            step="0.1"
          />
        </div>

        <div class="slider-group">
          <div class="slider-header">
            <label>Maksymalna cena (do):</label>
            <span class="price-badge">{{ Number(localPriceMax).toFixed(1) }}</span>
          </div>
          <input
            type="range"
            class="styled-slider"
            v-model.number="localPriceMax"
            min="0.1"
            max="6.0"
            step="0.1"
          />
        </div>
      </div>

      <div class="multi-select-container" ref="athleteContainerRef">
        <label v-if="localPriceMode">Ogranicz zawężonych skoczków (opcjonalnie):</label>
        <label v-else>Wybierz skoczków do porównania:</label>

        <div class="chips-box">
          <span v-for="name in localNames" :key="name" class="chip">
            {{ name }}
            <button type="button" @click="removeName(name)">&times;</button>
          </span>

          <div class="input-wrapper">
            <input
              v-model="nameInput"
              @focus="showDropdown = true"
              @input="showDropdown = true"
              @keydown="handleKeydown"
              type="text"
              :placeholder="
                localPriceMode ? 'Wybierz ulubieńców z przedziału...' : 'Wpisz nazwisko...'
              "
            />
            <ul v-if="showDropdown && filteredNames.length > 0" class="autocomplete-list">
              <li
                v-for="(item, index) in filteredNames"
                :key="item.name"
                @mousedown.prevent="addName(item.name)"
                :class="{ 'active-item': activeIndex === index }"
              >
                {{ item.name }}
                <span v-if="'price' in item" class="badge price-autocomplete-badge">{{
                  Number(item.price).toFixed(1)
                }}</span>
              </li>
            </ul>
          </div>

          <div v-if="auth.isPro.value" class="saved-sets-toolbar">
            <div v-if="Object.keys(savedSets).length > 0" class="saved-sets-pills">
              <span class="sets-label">Zapisane składy:</span>
              <span v-for="(_, sName) in savedSets" :key="sName" class="saved-set-pill">
                <button
                  type="button"
                  class="btn-load-set"
                  @click="loadSet(String(sName))"
                  title="Wczytaj ten zapisany skład"
                >
                  📋 {{ sName }}
                </button>
                <button
                  type="button"
                  class="btn-del-set"
                  @click="deleteSavedSet(String(sName))"
                  title="Usuń zapisany skład"
                >
                  ✕
                </button>
              </span>
            </div>
            <button
              v-if="localNames.length > 0"
              type="button"
              @click="showSaveModal = true"
              class="btn-save-set"
              title="Zapisz bieżącą listę zawodników"
            >
              💾 Zapisz ten skład
            </button>
            <div v-if="showSaveModal" class="save-set-inline-modal">
              <input
                v-model="newSetName"
                type="text"
                placeholder="Nazwa składu..."
                @keyup.enter="saveCurrentSet"
              />
              <button type="button" @click="saveCurrentSet" class="btn-confirm-save">
                Zatwierdź
              </button>
              <button type="button" @click="showSaveModal = false" class="btn-cancel-save">
                Anuluj
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ZWIJANY PANEL KRYTERIÓW ZAAWANSOWANYCH -->
      <div class="advanced-filters-toggle" @click="showAdvancedFilters = !showAdvancedFilters">
        <span class="toggle-text">
          ⚙️ Dodatkowe filtry (miejsce, skocznia, cykl, daty, limit)
          <span v-if="activeCriteriaCount > 0" class="criteria-counter">{{ activeCriteriaCount }} aktywne</span>
        </span>
        <span class="toggle-icon">{{ showAdvancedFilters ? 'Zwiń ▲' : 'Rozwiń ▼' }}</span>
      </div>

      <div v-show="showAdvancedFilters" class="form-grid mt-4">
        <div class="filter-group autocomplete-container" ref="placeContainerRef">
          <label>Miejsce</label>
          <input
            type="text"
            v-model="localForm.place"
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
          <select v-model="localForm.hill_type">
            <option value="">Wszystkie</option>
            <option v-for="(info, code) in dictionaries?.hills || {}" :key="code" :value="code">
              {{ info.pl }}
            </option>
          </select>
        </div>

        <div class="filter-group" style="position: relative">
          <label>Kategoria / Cykl</label>
          <div class="dropdown-trigger" @click="showCategoryDropdown = !showCategoryDropdown">
            <span>{{
              localForm.category.length > 0 ? `Wybrano (${localForm.category.length})` : 'Wszystkie'
            }}</span>
            <span style="font-size: 0.8em; color: #94a3b8">{{
              showCategoryDropdown ? '▲' : '▼'
            }}</span>
          </div>
          <div v-if="showCategoryDropdown" class="checkbox-list-container custom-dropdown">
            <label
              v-for="(info, code) in dictionaries?.categories || {}"
              :key="code"
              class="toggle-label list-checkbox"
            >
              <input type="checkbox" :value="code" v-model="localForm.category" />
              <span>{{ info.pl }}</span>
            </label>
          </div>
        </div>

        <div class="filter-group">
          <label>Typ sesji</label>
          <select v-model="localForm.session_type">
            <option value="">Wszystkie</option>
            <option v-for="(info, code) in dictionaries?.sessions || {}" :key="code" :value="code">
              {{ info.pl }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label>Data od</label>
          <input type="date" v-model="localForm.date_from" />
        </div>

        <div class="filter-group">
          <label>Data do</label>
          <input type="date" v-model="localForm.date_to" />
        </div>

        <div class="filter-group slider-group">
          <div class="slider-header" style="margin-bottom: 5px">
            <label>
              Ostatnie skoki (Limit)
              <small v-if="!auth.isPro.value" style="color: #64748b; font-weight: 500">(Free: max 10)</small>:
            </label>
            <span class="price-badge">{{ localForm.limit }}</span>
          </div>
          <input
            type="range"
            class="styled-slider"
            v-model.number="localForm.limit"
            min="1"
            :max="auth.isPro.value ? 100 : 10"
            step="1"
          />
        </div>
      </div>

      <!-- AKTYWNE FILTRY (ACTIVE CHIPS BAR) -->
      <div v-if="activeFiltersList.length > 0" class="active-filters-container">
        <span class="active-label">Aktywne filtry:</span>
        <div class="active-chips-wrap">
          <span v-for="af in activeFiltersList" :key="af.key" class="active-filter-badge">
            {{ af.label }}
            <button type="button" class="btn-remove-chip" @click="af.clear()">&times;</button>
          </span>
          <button type="button" class="btn-clear-all-link" @click="clearFilters">
            Wyczyść wszystkie
          </button>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-submit" :disabled="loading">
          {{ loading ? 'Pobieranie Danych...' : '🔍 Wyszukaj Wyniki' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.search-form {
  background: white;
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
.multi-select-container label {
  margin-bottom: 8px;
  display: block;
  font-size: 0.85em;
  color: #475569;
  font-weight: 500;
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
  background: #0284c7;
  color: white;
  padding: 3px 10px;
  border-radius: 16px;
  font-size: 0.85em;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
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
  display: flex;
  justify-content: space-between;
  align-items: center;
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
.price-autocomplete-badge {
  background: #fef08a;
  color: #854d0e;
}
.options-container {
  margin-bottom: 20px;
  padding-top: 15px;
}
.toggle-esm {
  background: lightgoldenrodyellow;
  padding: 8px 15px;
  border-radius: 6px;
  display: inline-flex;
  width: fit-content;
  border: dotted 2px;
}
.saved-sets-toolbar {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
  width: 100%;
}
.filter-group label {
  display: block;
  height: 18px;
  line-height: 18px;
  font-size: 0.82em;
  font-weight: 500;
  color: #475569;
  margin-bottom: 4px;
}
.set-picker label {
  font-size: 0.85rem;
  color: #475569;
  font-weight: 500;
  margin-right: 5px;
}
.set-picker select {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: white;
  font-size: 0.85rem;
}
.btn-save-set {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.2s;
}
.btn-save-set:hover {
  background: #e2e8f0;
  border-color: #94a3b8;
}
.save-set-inline-modal {
  display: flex;
  gap: 5px;
  align-items: center;
}
.save-set-inline-modal input {
  padding: 6px 10px;
  font-size: 0.85rem;
  border: 1px solid #8b5cf6;
  border-radius: 6px;
}
.btn-confirm-save {
  background: #0284c7;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.btn-cancel-save {
  background: #e2e8f0;
  color: #475569;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.checkbox-list-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 120px;
  overflow-y: auto;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 8px;
  background: white;
  scrollbar-width: thin;
}
.list-checkbox {
  font-size: 0.9em;
  margin-bottom: 0;
}
.dropdown-trigger {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 1em;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}
.dropdown-trigger:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}
.custom-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  margin-top: 4px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

/* SZYBKIE PRESETY */
.quick-presets-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 16px;
}

.presets-intro {
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
}

.preset-chip {
  background: white;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-chip:hover {
  border-color: #0284c7;
  color: #0284c7;
  background: #f0f9ff;
}

.preset-chip.active {
  background: #0284c7;
  color: white;
  border-color: #0284c7;
}

.preset-chip.reset-chip {
  margin-left: auto;
  color: #64748b;
  border-style: dashed;
}

.preset-chip.reset-chip:hover {
  color: #dc2626;
  border-color: #dc2626;
  background: #fef2f2;
}

/* AKORDEON FILTRÓW ZAAWANSOWANYCH */
.advanced-filters-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
  margin-top: 14px;
}

.advanced-filters-toggle:hover {
  background: #e2e8f0;
}

.toggle-text {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.criteria-counter {
  background: #0284c7;
  color: white;
  font-size: 0.7rem;
  padding: 2px 7px;
  border-radius: 9999px;
  font-weight: 800;
}

.toggle-icon {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0284c7;
  white-space: nowrap;
}

/* AKTYWNE CHIPSY */
.active-filters-container {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  margin-top: 14px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.active-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0369a1;
}

.active-chips-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.active-filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: white;
  border: 1px solid #93c5fd;
  color: #1e40af;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.btn-remove-chip {
  background: none;
  border: none;
  color: #93c5fd;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  font-weight: 700;
}

.btn-remove-chip:hover {
  color: #1e3a8a;
}

.btn-clear-all-link {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  margin-left: 6px;
}

.form-actions {
  display: flex;
  gap: 15px;
  align-items: center;
  margin-top: 10px;
}

.btn-clear {
  background: white;
  color: #64748b;
  border: 1px solid #cbd5e1;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.btn-clear:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #94a3b8;
}

/* Upewnij się, że .btn-submit nie zajmuje już 100% szerokości sam z siebie,
   tylko wypełnia wolną przestrzeń obok przycisku czyszczenia */
.btn-submit {
  flex-grow: 1;
  /* (resztę właściwości btn-submit masz już w globalnym main.css) */
}

/* Responsive Form */
@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .quick-presets-bar {
    padding: 8px 10px;
    gap: 6px;
  }
  .preset-chip {
    font-size: 0.74rem;
    padding: 4px 9px;
  }
  .toggle-esm {
    padding: 5px 10px;
    font-size: 0.76rem;
  }
  .advanced-filters-toggle {
    padding: 8px 10px;
  }
  .toggle-text,
  .toggle-icon {
    font-size: 0.76rem;
  }
  .dropdown-trigger {
    font-size: 0.82rem;
    padding: 7px 9px;
  }
  .price-sliders-container {
    flex-direction: column;
    gap: 14px;
    padding: 10px 12px;
  }
  .form-actions {
    flex-direction: column;
    width: 100%;
  }
  .btn-clear,
  .btn-submit {
    width: 100%;
    padding: 12px;
    font-size: 0.9rem;
  }
  .chips-box {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }
  .chip {
    font-size: 0.76rem;
    padding: 3px 8px;
  }
  .saved-sets-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}

.header-flex-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.saved-sets-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.sets-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.saved-set-pill {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  overflow: hidden;
}

.btn-load-set {
  border: none;
  background: transparent;
  color: #0369a1;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 8px 4px 10px;
  cursor: pointer;
}

.btn-load-set:hover {
  background: #e0f2fe;
}

.btn-del-set {
  border: none;
  border-left: 1px solid #cbd5e1;
  background: transparent;
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 8px;
  cursor: pointer;
}

.btn-del-set:hover {
  background: #fee2e2;
  color: #b91c1c;
}

.search-collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: #ffffff;
  border: 1px solid #bae6fd;
  border-left: 4px solid #0284c7;
}

.scb-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scb-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scb-meta {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 600;
}

.btn-scb-edit {
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 7px;
  white-space: nowrap;
  cursor: pointer;
}

.mobile-only-inline {
  display: none;
}

@media (max-width: 768px) {
  .mobile-only-inline {
    display: inline-flex;
  }
}
</style>
