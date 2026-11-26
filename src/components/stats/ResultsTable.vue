<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  groupedRows: any[]
  filteredVisibleAthletes: any[]
  dictionaries: any
  highlightTopN: number
  hideEmptyAthletes: boolean
  onlyCommon: boolean
  excludedNames: string[]
}>()

const emit = defineEmits([
  'update:highlightTopN',
  'update:hideEmptyAthletes',
  'update:onlyCommon',
  'update:excludedNames',
])

const localHighlightTopN = computed({
  get: () => props.highlightTopN,
  set: (v) => emit('update:highlightTopN', v),
})
const localHideEmpty = computed({
  get: () => props.hideEmptyAthletes,
  set: (v) => emit('update:hideEmptyAthletes', v),
})
const localOnlyCommon = computed({
  get: () => props.onlyCommon,
  set: (v) => emit('update:onlyCommon', v),
})

const rowStart = ref(0)
const rowsWindowSize = 15
const colStart = ref(0)
const athletesWindowSize = ref(1)
const showViewFiltersMobile = ref(false)

const tableWrapperRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const calculateVisibleColumns = () => {
  if (!tableWrapperRef.value) return
  const wrapperWidth = tableWrapperRef.value.clientWidth

  const isMobile = window.innerWidth <= 768

  if (isMobile) {
    // Na mobile pokazujemy wszystkich zawodników wewnątrz jednej karty - wyłączamy wirtualizację kolumn
    athletesWindowSize.value = props.filteredVisibleAthletes.length || 1
  } else {
    // Desktop: Klasyczny D-Pad
    const availableForAthletes = wrapperWidth - 360
    athletesWindowSize.value = Math.max(1, Math.floor(availableForAthletes / 133))
  }

  const maxStart = Math.max(0, props.filteredVisibleAthletes.length - athletesWindowSize.value)
  if (colStart.value > maxStart) colStart.value = maxStart
}

onMounted(() => {
  window.addEventListener('resize', calculateVisibleColumns)
})
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('resize', calculateVisibleColumns)
})

watch(tableWrapperRef, (newRef) => {
  if (resizeObserver) resizeObserver.disconnect()
  if (newRef) {
    resizeObserver = new ResizeObserver(() => calculateVisibleColumns())
    resizeObserver.observe(newRef)
    calculateVisibleColumns()
  }
})

const moveCol = (step: number) => {
  const maxStart = Math.max(0, props.filteredVisibleAthletes.length - athletesWindowSize.value)
  colStart.value = Math.max(0, Math.min(colStart.value + step, maxStart))
}
const moveRow = (step: number) => {
  const maxStart = Math.max(0, props.groupedRows.length - rowsWindowSize)
  rowStart.value = Math.max(0, Math.min(rowStart.value + step, maxStart))
}

watch(
  () => props.filteredVisibleAthletes.length,
  (newLen) => {
    const maxStart = Math.max(0, newLen - athletesWindowSize.value)
    if (colStart.value > maxStart) colStart.value = maxStart
  },
)
watch(
  () => props.groupedRows.length,
  (newLen) => {
    const maxStart = Math.max(0, newLen - rowsWindowSize)
    if (rowStart.value > maxStart) rowStart.value = maxStart
  },
)

const displayedAthletes = computed(() =>
  props.filteredVisibleAthletes.slice(colStart.value, colStart.value + athletesWindowSize.value),
)
const displayedRows = computed(() =>
  props.groupedRows.slice(rowStart.value, rowStart.value + rowsWindowSize),
)

const excludeAthlete = (name: string) => {
  if (!props.excludedNames.includes(name))
    emit('update:excludedNames', [...props.excludedNames, name])
}

const getStatClass = (val: number, bestVal: number, worstVal: number) => {
  if (val == null) return ''
  if (val === bestVal) return 'text-best'
  if (val === worstVal) return 'text-worst'
  return ''
}

const getHighlightClass = (rank: number | null | undefined) => {
  if (rank === null || rank === undefined) return ''
  if (rank <= localHighlightTopN.value) return 'jump-in-points'
  return 'jump-outside-points'
}

const getCategoryName = (code: string) => props.dictionaries?.categories?.[code]?.pl || code
const getSessionName = (code: string) => props.dictionaries?.sessions?.[code]?.pl || code
</script>

<template>
  <div>
    <div class="card view-filters-card" style="margin-bottom: 16px">
      <div class="card-header vf-header-row">
        <div>
          <h3>⚡ Filtry Widoku</h3>
          <p class="subtitle">
            Modyfikują tabelę na żywo (Top {{ localHighlightTopN }}{{ localHideEmpty ? ', ukryj puste' : '' }}{{ localOnlyCommon ? ', tylko wspólne' : '' }}).
          </p>
        </div>
        <button
          type="button"
          class="vf-mobile-toggle"
          @click="showViewFiltersMobile = !showViewFiltersMobile"
        >
          {{ showViewFiltersMobile ? 'Zwiń ▲' : 'Opcje ▼' }}
        </button>
      </div>

      <div class="frontend-filters-row" :class="{ 'vf-collapsed-mobile': !showViewFiltersMobile }">
        <div class="filter-group filter-topn-group">
          <label>Wyróżnij miejsca do (Top X)</label>
          <input type="number" v-model="localHighlightTopN" min="1" max="100" />
        </div>
        <div class="checkbox-filters">
          <label
            class="toggle-label frontend-toggle"
            title="Odznacza i ukrywa kolumny skoczków, którzy nie posiadają żadnych danych w wyszukanych zawodach."
          >
            <input v-model="localHideEmpty" type="checkbox" />
            <span>Ukryj skoczków bez skoków</span>
          </label>
          <label
            class="toggle-label frontend-toggle"
            title="Pokaże tylko te serie, w których wszyscy aktualnie widoczni zawodnicy oddali skok"
          >
            <input v-model="localOnlyCommon" type="checkbox" />
            <span>Wyświetlaj tylko wspólne zawody</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="groupedRows.length > 0" class="results-container">
      <div class="mobile-desktop-hint mobile-only-block">
        💻 Na większym ekranie (komputerze) zobaczysz pełną macierz porównawczą w jednej tabeli.
      </div>

      <div class="nav-horizontal">
        <div class="nav-info-group" style="display: flex; gap: 30px; flex-wrap: wrap">
          <span class="nav-label"
          >Wiersze (Zawody):
            <strong
            >{{ Math.min(rowStart + 1, groupedRows.length) }} -
              {{ Math.min(rowStart + rowsWindowSize, groupedRows.length) }} z
              {{ groupedRows.length }}</strong
            ></span
          >
          <span class="nav-label desktop-only"
          >Kolumny (Skoczkowie):
            <strong
            >{{
                filteredVisibleAthletes.length > 0
                  ? Math.min(colStart + 1, filteredVisibleAthletes.length)
                  : 0
              }}
              - {{ Math.min(colStart + athletesWindowSize, filteredVisibleAthletes.length) }} z
              {{ filteredVisibleAthletes.length }}</strong
            ></span
          >
        </div>
        <div class="nav-controls">
          <button
            class="nav-btn"
            @click="moveRow(-10)"
            :disabled="rowStart === 0"
            title="-10 Wierszy"
          >
            ⏫ 10
          </button>
          <button class="nav-btn" @click="moveRow(-1)" :disabled="rowStart === 0" title="-1 Wiersz">
            ▲ 1
          </button>
        </div>
      </div>

      <div class="table-layout-wrapper desktop-only">
        <div class="nav-vertical nav-left">
          <div class="sticky-nav-buttons">
            <button
              class="nav-btn"
              @click="moveCol(-athletesWindowSize)"
              :disabled="colStart === 0"
              title="Cofa widok o cały ekran"
            >
              ⏪ Str.
            </button>
            <button
              class="nav-btn"
              @click="moveCol(-1)"
              :disabled="colStart === 0"
              title="-1 Skoczek"
            >
              ◀ 1
            </button>
          </div>
        </div>

        <div class="table-wrapper" ref="tableWrapperRef">
          <table class="results-table">
            <thead>
            <tr>
              <th class="sticky-col sticky-col-1">Data</th>
              <th class="sticky-col sticky-col-2">Miejsce i Sesja</th>
              <th v-for="athlete in displayedAthletes" :key="athlete.name" class="athlete-col">
                <button
                  @click="excludeAthlete(athlete.name)"
                  class="btn-close"
                  title="Ukryj z porównania"
                >
                  ✖
                </button>
                <div class="th-content">
                    <span v-if="athlete.price" class="badge price-header-badge">{{
                        Number(athlete.price).toFixed(1)
                      }}</span>
                  <span class="athlete-name" :title="athlete.name">{{ athlete.name }}</span>
                </div>
              </th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(row, idx) in displayedRows" :key="idx">
              <td class="meta-cell sticky-col sticky-col-1" style="white-space: nowrap">
                {{ row.meta.date }}<br />
                <small style="color: #64748b">{{ row.meta.time }}</small>
              </td>
              <td class="meta-cell sticky-col sticky-col-2">
                <strong>{{ row.meta.place || '?' }} HS{{ row.meta.hill_size || '?' }}</strong>
                <span style="color: #64748b"> • {{ getSessionName(row.meta.session_type) }}</span>
                <RouterLink :to="`/sessions/${row.meta.session_id}`" class="session-link" style="margin-left: 6px">LINK</RouterLink>
                <br />
                <small>{{ getCategoryName(row.meta.category) }} | Seria: {{ row.meta.round }}</small>
              </td>
              <td v-for="athlete in displayedAthletes" :key="athlete.name" class="athlete-cell">
                <div
                  v-if="row.athletes[athlete.name]"
                  :class="['jump-data', getHighlightClass(row.athletes[athlete.name].jump_rank)]"
                >
                    <span
                      :class="
                        getStatClass(row.athletes[athlete.name].jump_rank, row.minRank, row.maxRank)
                      "
                    >
                      Poz: <strong>{{ row.athletes[athlete.name].jump_rank }}</strong>
                    </span>
                  <span
                    :class="
                        getStatClass(row.athletes[athlete.name].distance, row.maxDist, row.minDist)
                      "
                  >
                      Odl: <strong>{{ row.athletes[athlete.name].distance }}m</strong>
                    </span>
                  <span
                    :class="
                        getStatClass(
                          row.athletes[athlete.name].points,
                          row.maxPoints,
                          row.minPoints,
                        )
                      "
                  >
                      Nota: <strong>{{ row.athletes[athlete.name].points }}</strong>
                    </span>
                </div>
                <div v-else class="no-jump">---</div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <div class="nav-vertical nav-right">
          <div class="sticky-nav-buttons">
            <button
              class="nav-btn"
              @click="moveCol(1)"
              :disabled="colStart >= filteredVisibleAthletes.length - athletesWindowSize"
              title="+1 Skoczek"
            >
              1 ▶
            </button>
            <button
              class="nav-btn"
              @click="moveCol(athletesWindowSize)"
              :disabled="colStart >= filteredVisibleAthletes.length - athletesWindowSize"
              title="Cały ekran"
            >
              Str. ⏩
            </button>
          </div>
        </div>
      </div>

      <div class="mobile-layout-wrapper mobile-only">
        <div class="m-card" v-for="(row, idx) in displayedRows" :key="idx">

          <div class="m-card-header">
            <div class="m-date-row">
              <span class="m-date">{{ row.meta.date }} <small v-if="row.meta.time" class="m-time">· {{ row.meta.time }}</small></span>
              <RouterLink :to="`/sessions/${row.meta.session_id}`" class="m-link">Szczegóły ↗</RouterLink>
            </div>
            <div class="m-title">
              {{ row.meta.place }} HS{{ row.meta.hill_size || '?' }}
              <span class="m-sep">|</span> {{ getSessionName(row.meta.session_type) }}
            </div>
            <div class="m-subtitle">
              {{ getCategoryName(row.meta.category) }} · Seria {{ row.meta.round }}
            </div>
          </div>

          <div class="m-card-body">
            <div class="m-athlete-row" v-for="athlete in displayedAthletes" :key="athlete.name">
              <div class="m-ath-info">
                <button @click="excludeAthlete(athlete.name)" class="m-btn-close" title="Ukryj">✕</button>
                <span v-if="athlete.price" class="badge price-header-badge">{{ Number(athlete.price).toFixed(1) }}</span>
                <span class="m-ath-name">{{ athlete.name }}</span>
              </div>

              <div class="m-ath-results">
                <template v-if="row.athletes[athlete.name]">
                  <div :class="['m-jump-data', getHighlightClass(row.athletes[athlete.name].jump_rank)]">
                    <div class="m-stat" :class="getStatClass(row.athletes[athlete.name].jump_rank, row.minRank, row.maxRank)">
                      Miejsce: <strong>{{ row.athletes[athlete.name].jump_rank }}.</strong>
                    </div>
                    <div class="m-stat" :class="getStatClass(row.athletes[athlete.name].distance, row.maxDist, row.minDist)">
                      Odległość: <strong>{{ row.athletes[athlete.name].distance }} m</strong>
                    </div>
                    <div class="m-stat" :class="getStatClass(row.athletes[athlete.name].points, row.maxPoints, row.minPoints)">
                      Nota: <strong>{{ row.athletes[athlete.name].points }}</strong>
                    </div>
                  </div>
                </template>
                <div v-else class="m-no-jump">Brak startu w tej serii</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="nav-horizontal" style="border-radius: 0 0 8px 8px; border-top: none">
        <div class="nav-controls">
          <button
            class="nav-btn"
            @click="moveRow(1)"
            :disabled="rowStart >= groupedRows.length - rowsWindowSize"
            title="+1 Wiersz"
          >
            1 ▼
          </button>
          <button
            class="nav-btn"
            @click="moveRow(10)"
            :disabled="rowStart >= groupedRows.length - rowsWindowSize"
            title="+10 Wierszy"
          >
            10 ⏬
          </button>
        </div>
      </div>
    </div>

    <div
      v-else
      class="card"
      style="text-align: center; color: #64748b; padding: 36px 20px"
    >
      <div style="font-size: 2.5rem; margin-bottom: 10px">🔍</div>
      <p style="margin: 0 0 14px 0; font-size: 0.95rem; line-height: 1.5">
        Brak zawodów spełniających kryteria <strong>filtrów widoku</strong>.<br />
        Wybrani skoczkowie mogli nie startować razem w tej samej serii lub włączono filtr wspólnych zawodów.
      </p>
      <div v-if="localOnlyCommon">
        <button
          type="button"
          class="btn-reset-common"
          @click="localOnlyCommon = false"
        >
          ✕ Wyłącz filtr "Tylko wspólne zawody"
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-reset-common {
  background: #0284c7;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-reset-common:hover {
  background: #0369a1;
}
/* Klasy kontrolujące widoczność RWD */
.desktop-only { display: flex; }
.mobile-only { display: none; }

.view-filters-card {
  background: #f8fafc;
  border-left: 4px solid #38bdf8;
}
.frontend-filters-row {
  display: flex;
  gap: 30px;
  align-items: center;
  flex-wrap: wrap;
}
.checkbox-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.results-container {
  margin-top: 10px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  padding: 0;
}
.table-layout-wrapper {
  align-items: stretch;
  background: white;
  width: 100%;
}
.nav-horizontal {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f5f9;
  padding: 10px 20px;
  border: 1px solid #cbd5e1;
  border-radius: 8px 8px 0 0;
}
.nav-vertical {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  background: #f1f5f9;
  padding: 10px;
  border-top: 1px solid #cbd5e1;
  border-bottom: 1px solid #cbd5e1;
}
.nav-left {
  border-left: 1px solid #cbd5e1;
}
.nav-right {
  border-right: 1px solid #cbd5e1;
}
.sticky-nav-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 40vh;
}
.nav-controls {
  display: flex;
  gap: 5px;
}
.nav-label {
  font-size: 0.9em;
  color: #475569;
}
.nav-btn {
  background: white;
  border: 1px solid #94a3b8;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.nav-btn:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #475569;
}
.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.table-wrapper {
  flex-grow: 1;
  border-top: 1px solid #cbd5e1;
  border-bottom: 1px solid #cbd5e1;
}
.results-table {
  width: max-content;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9em;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 30;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
}
.results-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.sticky-col-1 {
  position: sticky;
  left: 0;
  width: 100px;
  min-width: 100px;
  max-width: 100px;
  z-index: 5;
}
.sticky-col-2 {
  position: sticky;
  left: 100px;
  width: 260px;
  min-width: 260px;
  max-width: 260px;
  border-right: 2px solid #cbd5e1;
  z-index: 5;
  white-space: normal;
  word-wrap: break-word;
}
.results-table th.sticky-col-1,
.results-table th.sticky-col-2 {
  z-index: 40;
  background-color: #e2e8f0;
  padding: 12px 10px;
}
.results-table td.sticky-col-1,
.results-table td.sticky-col-2 {
  background-color: #f8fafc;
}
.athlete-col,
.athlete-cell {
  border-left: 1px solid #475569;
  width: 133px;
  min-width: 133px;
  max-width: 133px;
  position: relative;
}
.athlete-cell {
  border-left: 1px solid #e2e8f0;
  text-align: center;
  vertical-align: middle;
}
.th-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-height: 100px;
  height: 100%;
  padding: 12px 25px 12px 10px;
}
.athlete-name {
  line-height: 1.2;
  font-size: 0.9em;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: auto;
  display: flex;
  align-items: flex-start;
}
.btn-close {
  position: absolute;
  bottom: 22px;
  right: 5px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.btn-close:hover {
  background: #dc2626;
  transform: scale(1.1);
}
.jump-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.jump-in-points {
  opacity: 1;
}
.jump-outside-points {
  opacity: 0.25;
  filter: grayscale(100%);
}
.no-jump {
  color: #94a3b8;
  font-style: italic;
  padding-top: 10px;
}
.text-best {
  color: #16a34a;
}
.text-worst {
  color: #dc2626;
}
.price-header-badge {
  background: #fcd34d;
  color: #78350f;
  margin-bottom: auto;
}

.vf-mobile-toggle,
.mobile-only-block {
  display: none;
}

@media (max-width: 768px), (max-width: 960px) and (max-height: 520px) {
  .mobile-only-block {
    display: block;
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.78rem;
    font-weight: 600;
    margin-bottom: 10px;
    line-height: 1.4;
  }
}

/* ============================================== */
/* MEDIA QUERIES (Smartfony i małe ekrany)        */
/* ============================================== */
@media (max-width: 1024px) {
  .frontend-filters-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }
}

@media (max-width: 768px), (max-width: 960px) and (max-height: 520px) {
  /* Przełączanie trybów wyświetlania - gasimy desktop, zapalamy mobile */
  .desktop-only { display: none !important; }
  .mobile-only { display: flex; flex-direction: column; gap: 15px; padding: 10px; background: #f8fafc; }

  /* Modyfikacja paska nawigacyjnego (D-Pad w dół/górę) */
  .filter-topn-group {
    width: 100%;
    min-width: 0;
  }
  .nav-horizontal {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    text-align: center;
    padding: 10px 12px;
  }
  .nav-info-group {
    flex-direction: column;
    gap: 4px;
  }
  .nav-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .nav-btn {
    padding: 10px 12px;
    min-height: 40px;
  }

  /* --- STYLIZACJA KART MOBILNYCH (Cards Layout) --- */
  .m-card {
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  }

  .m-card-header {
    background: #f1f5f9;
    padding: 15px;
    border-bottom: 2px solid #e2e8f0;
  }

  .m-date-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .m-date { font-weight: 800; color: #334155; font-size: 0.9em; }
  .m-time { color: #64748b; font-size: 0.85em; }

  .m-title {
    font-weight: 800;
    color: #0f172a;
    font-size: 1.15em;
    margin: 4px 0;
    line-height: 1.3;
  }

  .m-subtitle { font-size: 0.85em; color: #475569; margin-bottom: 8px; }
  .m-link {
    font-size: 0.85em;
    color: #0284c7;
    font-weight: bold;
    text-decoration: none;
    display: inline-block;
    padding-top: 4px;
  }

  .m-card-body {
    display: flex;
    flex-direction: column;
  }

  .m-athlete-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 15px;
    border-bottom: 1px solid #f1f5f9;
  }
  .m-athlete-row:last-child { border-bottom: none; }

  .m-ath-info {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .m-ath-name { font-weight: 700; font-size: 1em; color: #1e293b; }

  .m-btn-close {
    background: #f1f5f9;
    color: #94a3b8;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    width: 24px;
    height: 24px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .m-ath-results {
    width: 100%;
    background: #f8fafc;
    border-radius: 6px;
    padding: 10px;
    border: 1px dashed #e2e8f0;
  }

  .m-jump-data {
    display: flex;
    justify-content: space-between;
    font-size: 0.9em;
  }
  .m-stat { color: #475569; }
  .m-no-jump { color: #94a3b8; font-style: italic; font-size: 0.9em; text-align: center; width: 100%; }

  .vf-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .vf-mobile-toggle {
    display: inline-flex;
    align-items: center;
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0369a1;
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .vf-collapsed-mobile {
    display: none !important;
  }

  .mobile-rt-modebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .rt-switch-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    flex: 1;
    background: #e2e8f0;
    padding: 3px;
    border-radius: 8px;
  }

  .rt-switch-btn {
    border: none;
    background: transparent;
    color: #475569;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .rt-switch-btn.active {
    background: #ffffff;
    color: #0284c7;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .rt-fs-btn {
    border: 1px solid #bae6fd;
    background: #f0f9ff;
    color: #0369a1;
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 0.73rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .matrix-mobile-active {
    display: flex !important;
  }

  .matrix-mobile-active .nav-vertical {
    display: none;
  }

  .matrix-mobile-active .table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .m-card-header {
    padding: 9px 12px;
  }

  .m-title {
    font-size: 0.92rem;
    margin: 2px 0 0;
  }

  .m-sep {
    color: #94a3b8;
    font-weight: 400;
  }

  .m-round {
    color: #64748b;
    font-weight: 600;
  }

  .m-compact-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 44px 54px 54px;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
  }

  .m-ath-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .m-ath-name {
    font-size: 0.8rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .m-c-rank,
  .m-c-dist,
  .m-c-pts {
    text-align: right;
    font-size: 0.78rem;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .m-c-rank {
    text-align: center;
    border-radius: 5px;
    padding: 2px 4px;
  }

  .m-no-jump-compact {
    grid-column: 2 / 5;
    text-align: right;
    font-size: 0.74rem;
    color: #94a3b8;
    font-style: italic;
  }
}

.matrix-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 10500;
  background: #ffffff;
  overflow: auto;
  margin: 0 !important;
  border-radius: 0 !important;
  display: flex;
  flex-direction: column;
}

.fullscreen-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.8rem;
  position: sticky;
  top: 0;
  z-index: 20;
}

.btn-exit-fs {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}
</style>