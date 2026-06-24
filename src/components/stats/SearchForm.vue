<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  searchForm: any
  selectedNames: string[]
  priceMode: boolean
  priceMin: number
  priceMax: number
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
  'execute-search',
])

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
    if (finalNames.length === 0) return alert('Brak zawodników spełniających kryteria cenowe!')
  } else {
    if (localNames.value.length === 0) return alert('Dodaj co najmniej jednego skoczka!')
    finalNames = [...localNames.value]
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
  <div class="card search-card">
    <div class="card-header">
      <h3>🔍 Kryteria Wyszukiwania w Bazie (Krok 1)</h3>
      <p class="subtitle">
        Wypełnij filtry i kliknij "Wyszukaj Wyniki", aby pobrać dane historyczne z bazy.
      </p>
    </div>

    <form @submit.prevent="submitSearch" class="search-form">
      <div class="options-container" style="border: none; margin-bottom: 10px; padding-top: 0">
        <label
          class="toggle-label toggle-esm"
          title="Włącza filtrowanie po cenie z Fantasy i pobiera z automatu wszystkich zawodników z przedziału."
        >
          <input v-model="localPriceMode" type="checkbox" />
          <span style="font-weight: bold">🎯 Analiza cen zawodników</span>
        </label>
      </div>

      <div v-if="localPriceMode" class="price-sliders-container" style="margin-bottom: 20px">
        <div class="slider-group">
          <div class="slider-header">
            <label>Minimalna cena (od):</label>
            <span class="price-badge">{{ localPriceMin }}</span>
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
            <span class="price-badge">{{ localPriceMax }}</span>
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
                  item.price
                }}</span>
              </li>
            </ul>
          </div>

          <div class="saved-sets-toolbar">
            <div v-if="Object.keys(savedSets).length > 0" class="set-picker">
              <label for="set-select">Wczytaj zestaw:</label>
              <select id="set-select" @change="loadSet(($event.target as HTMLSelectElement).value)">
                <option value="">-- Wybierz zapisany skład --</option>
                <option v-for="(_, name) in savedSets" :key="name" :value="name">{{ name }}</option>
              </select>
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
                placeholder="Nazwa zestawu..."
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

      <div class="form-grid mt-4">
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
            <label>Ostatnie skoki (Limit):</label>
            <span class="price-badge">{{ localForm.limit }}</span>
          </div>
          <input
            type="range"
            class="styled-slider"
            v-model.number="localForm.limit"
            min="1"
            max="100"
            step="1"
          />
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-clear" @click="clearFilters">🗑️ Wyczyść filtry</button>
        <button type="submit" class="btn-submit" :disabled="loading">
          {{ loading ? 'Pobieranie Danych...' : 'Wyszukaj Wyniki' }}
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
.set-picker label {
  font-size: 0.85rem;
  color: #475569;
  font-weight: 600;
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
  font-weight: bold;
  font-size: 0.85rem;
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
  background: #8b5cf6;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-cancel-save {
  background: #e2e8f0;
  color: #475569;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
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
  padding: 14px 24px;
  border-radius: 4px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
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
    grid-template-columns: 1fr; /* Wszystko w jednej kolumnie */
  }
  .price-sliders-container {
    flex-direction: column;
    gap: 20px;
  }
  .form-actions {
    flex-direction: column;
    width: 100%;
  }
  .btn-clear,
  .btn-submit {
    width: 100%;
    padding: 16px; /* Większy obszar kliknięcia dla palca */
  }
  .chips-box {
    flex-direction: column;
    align-items: stretch;
  }
  .chip {
    justify-content: space-between;
  }
  .saved-sets-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
