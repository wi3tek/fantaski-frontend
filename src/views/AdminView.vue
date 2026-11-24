<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'

const activeTab = ref('scraper')

// --- Stan Konfiguracji ---
const availableCategories = ref<Record<string, any>>({})
const availableSeasons = computed(() => {
  const currentYear = new Date().getFullYear() + 2
  const years = []
  for (let i = 0; i <= 30; i++) {
    years.push((currentYear - i).toString())
  }
  return years
})

// --- Stan Formularza Sesji ---
const selectedCategories = ref<string[]>([])
const selectedSeasons = ref<string[]>([new Date().getFullYear().toString()])
const scrapeMode = ref('IND')

const isScraping = ref(false)
const scrapeResult = ref<any>(null)

// Stan Dropdownów
const showCategoryDropdown = ref(false)
const showSeasonDropdown = ref(false)
const onlyPriceUpdate = ref(false)

const closeDropdowns = () => {
  showCategoryDropdown.value = false
  showSeasonDropdown.value = false
}

const selectAllCategories = () => {
  selectedCategories.value = Object.keys(availableCategories.value)
}
const clearCategories = () => {
  selectedCategories.value = []
}
const selectAllSeasons = () => {
  selectedSeasons.value = [...availableSeasons.value]
}
const clearSeasons = () => {
  selectedSeasons.value = []
}

// --- Stan Formularza Skoczków ---
const isAthletesScraping = ref(false)
const athletesScrapeResult = ref<any>(null)

// --- Stan Kwarantanny (Weryfikacja) ---
const reviewTab = ref('athletes')
const athleteReviews = ref<any[]>([])
const sessionReviews = ref<any[]>([])
const isLoadingReviews = ref(false)
const isApprovingAll = ref(false)
const isRejectingAll = ref(false)

const expandedSession = ref<string | null>(null)
const expandedAthlete = ref<number | null>(null)

// Stan dla scrapowania PDF
const isPdfScraping = ref(false)
const pdfScrapeResult = ref<any>(null)
const pdfSeason = ref<string>(new Date().getFullYear().toString())

// --- Stan dla DEBUGGERA PDF ---
const checkerForm = ref({ url: '', codex: '', race_id: '' })
const isCheckingPdf = ref(false)
const checkerResult = ref<any>(null)

const runPdfChecker = async () => {
  if (!checkerForm.value.url) return alert('Podaj URL!')
  isCheckingPdf.value = true
  checkerResult.value = null
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/refresh-trainings-checker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkerForm.value),
    })
    checkerResult.value = await res.json()
  } catch (e) {
    console.error(e)
  } finally {
    isCheckingPdf.value = false
  }
}

const toggleSessionDiff = (codex: string) => {
  expandedSession.value = expandedSession.value === codex ? null : codex
}

const toggleAthleteDiff = (fisCode: number) => {
  expandedAthlete.value = expandedAthlete.value === fisCode ? null : fisCode
}

// ========================================================
// --- LOGIKA DIFF (Głębokie Porównywanie JSON) ---
// ========================================================

// Funkcja rekurencyjnie spłaszczająca obiekt do płaskich ścieżek
// np. { a: { b: [1] } } -> { "a.b[0]": 1 }
const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
  let flattened: Record<string, any> = {}

  if (obj === null || typeof obj !== 'object') {
    flattened[prefix] = obj
    return flattened
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      flattened[prefix] = '[]'
    } else {
      obj.forEach((item, index) => {
        Object.assign(flattened, flattenObject(item, `${prefix}[${index}]`))
      })
    }
    return flattened
  }

  const keys = Object.keys(obj)
  if (keys.length === 0) {
    flattened[prefix] = '{}'
  } else {
    keys.forEach((key) => {
      const newPrefix = prefix ? `${prefix}.${key}` : key
      Object.assign(flattened, flattenObject(obj[key], newPrefix))
    })
  }
  return flattened
}

const getDiff = (oldObj: any, newObj: any) => {
  const oldData = oldObj || {}
  const newData = newObj || {}

  // 1. Zabezpieczamy kopie przed mutacją i usuwamy klucze techniczne MongoDB
  const cleanOld = JSON.parse(JSON.stringify(oldData))
  const cleanNew = JSON.parse(JSON.stringify(newData))
  ;['_id', 'checksum', 'original_checksum', 'last_checked', 'review_reason'].forEach((k) => {
    delete cleanOld[k]
    delete cleanNew[k]
  })

  // 2. Spłaszczamy oba obiekty
  const flatOld = flattenObject(cleanOld)
  const flatNew = flattenObject(cleanNew)

  // 3. Łączymy wszystkie znalezione płaskie klucze i sortujemy alfabetycznie
  const keys = new Set([...Object.keys(flatOld), ...Object.keys(flatNew)])
  const sortedKeys = Array.from(keys).sort()

  const lines: { type: string; text: string }[] = []

  // 4. Porównujemy każdą zmienną
  for (const key of sortedKeys) {
    const oldVal = flatOld[key]
    const newVal = flatNew[key]

    if (oldVal !== newVal) {
      if (oldVal !== undefined) {
        lines.push({ type: 'removed', text: `- ${key}: ${JSON.stringify(oldVal)}` })
      }
      if (newVal !== undefined) {
        lines.push({ type: 'added', text: `+ ${key}: ${JSON.stringify(newVal)}` })
      }
    }
  }

  if (lines.length === 0) {
    lines.push({
      type: 'unchanged',
      text: 'Brak zmian w danych merytorycznych. (Zmieniły się tylko klucze systemowe w tle).',
    })
  }

  return lines
}
// ========================================================

const getHeaders = () => {
  return { 'Content-Type': 'application/json' }
}

const loadConfig = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/config', { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      availableCategories.value = data.categories || {}
    }
  } catch (e) {
    console.error('Błąd ładowania configu', e)
  }
}

const runScraper = async () => {
  if (selectedCategories.value.length === 0 || selectedSeasons.value.length === 0)
    return alert('Wybierz sezon i kategorię.')
  isScraping.value = true
  scrapeResult.value = null
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/refresh-results', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        seasons: selectedSeasons.value,
        categories: selectedCategories.value,
        mode: scrapeMode.value,
      }),
    })
    const data = await res.json()
    if (res.ok) scrapeResult.value = data.stats
    else alert('Błąd: ' + data.detail)
  } catch (e) {
    console.error(e)
  } finally {
    isScraping.value = false
  }
}

const runPdfScraper = async () => {
  isPdfScraping.value = true
  pdfScrapeResult.value = null
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/refresh-trainings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ season: pdfSeason.value || null }),
    })
    const data = await res.json()
    if (res.ok) {
      pdfScrapeResult.value = data
    } else {
      alert('Błąd serwera: ' + (data.detail || 'Nieznany błąd'))
    }
  } catch (e) {
    console.error(e)
    alert('Błąd połączenia z backendem.')
  } finally {
    isPdfScraping.value = false
  }
}

const refreshAthletes = async () => {
  isAthletesScraping.value = true
  athletesScrapeResult.value = null
  try {
    // Wysyłamy flagę w Body jako stringified JSON
    const body = JSON.stringify({ onlyPriceUpdate: onlyPriceUpdate.value })
    const res = await fetch('http://127.0.0.1:8000/admin/refresh-athletes', {
      method: 'POST',
      headers: getHeaders(),
      body,
    })
    const data = await res.json()
    if (res.ok) athletesScrapeResult.value = data.stats
    else alert('Błąd: ' + data.detail)
  } catch (e) {
    console.error(e)
  } finally {
    isAthletesScraping.value = false
  }
}

const fetchReviews = async () => {
  isLoadingReviews.value = true
  expandedSession.value = null
  expandedAthlete.value = null
  try {
    const endpoint = reviewTab.value === 'athletes' ? 'athletes' : 'sessions'
    const res = await fetch(`http://127.0.0.1:8000/admin/reviews/${endpoint}`, {
      headers: getHeaders(),
    })
    if (res.ok) {
      if (reviewTab.value === 'athletes') athleteReviews.value = await res.json()
      else sessionReviews.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd pobierania', e)
  } finally {
    isLoadingReviews.value = false
  }
}

const handleAthleteReview = async (fisCode: number, action: 'approve' | 'reject') => {
  try {
    const res = await fetch(`http://127.0.0.1:8000/admin/reviews/athletes/${fisCode}/${action}`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      athleteReviews.value = athleteReviews.value.filter((a) => a.fis_code !== fisCode)
      if (expandedAthlete.value === fisCode) expandedAthlete.value = null
    }
  } catch (e) {
    console.error(e)
  }
}

const handleApproveAllAthletes = async () => {
  if (!confirm(`Zatwierdzić wszystkie (${athleteReviews.value.length}) zmiany u skoczków?`)) return
  isApprovingAll.value = true
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/reviews/athletes/approve-all', {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      athleteReviews.value = []
      expandedAthlete.value = null
    }
  } catch (e) {
    console.error(e)
  } finally {
    isApprovingAll.value = false
  }
}

const handleSessionReview = async (codex: string, action: 'approve' | 'reject') => {
  try {
    const res = await fetch(`http://127.0.0.1:8000/admin/reviews/sessions/${codex}/${action}`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      sessionReviews.value = sessionReviews.value.filter((s) => s.codex !== codex)
      if (expandedSession.value === codex) expandedSession.value = null
    }
  } catch (e) {
    console.error(e)
  }
}

const handleApproveAllSessions = async () => {
  if (!confirm(`Zatwierdzić wszystkie (${sessionReviews.value.length}) zmiany w sesjach?`)) return
  isApprovingAll.value = true
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/reviews/sessions/approve-all', {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      sessionReviews.value = []
      expandedSession.value = null
    }
  } catch (e) {
    console.error(e)
  } finally {
    isApprovingAll.value = false
  }
}

const handleRejectAllSessions = async () => {
  if (
    !confirm(
      `UWAGA: Czy na pewno chcesz ODRZUCIĆ I USUNĄĆ wszystkie (${sessionReviews.value.length}) oczekujące sesje z kwarantanny?`
    )
  )
    return
  isRejectingAll.value = true
  try {
    const res = await fetch('http://127.0.0.1:8000/admin/reviews/sessions/reject-all', {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      sessionReviews.value = []
      expandedSession.value = null
    }
  } catch (e) {
    console.error(e)
  } finally {
    isRejectingAll.value = false
  }
}

watch(activeTab, (newVal) => {
  if (newVal === 'review') fetchReviews()
})
watch(reviewTab, () => {
  fetchReviews()
})

const totalPendingReviews = computed(
  () => athleteReviews.value.length + sessionReviews.value.length,
)

onMounted(() => {
  loadConfig()
  fetchReviews()
})
</script>

<template>
  <div class="admin-page">
    <SkiLoader v-if="isScraping">Pobieranie i analizowanie wyników FIS...</SkiLoader>
    <SkiLoader v-if="isAthletesScraping">Weryfikacja bazy skoczków z FIS...</SkiLoader>
    <SkiLoader v-if="isLoadingReviews">Wczytywanie kwarantanny...</SkiLoader>
    <SkiLoader v-if="isApprovingAll">Masowe zatwierdzanie...</SkiLoader>
    <SkiLoader v-if="isRejectingAll">Odrzucanie wszystkich sesji...</SkiLoader>
    <SkiLoader v-if="isPdfScraping">Pobieranie i czytanie dokumentów PDF z FIS...</SkiLoader>

    <div
      v-if="showCategoryDropdown || showSeasonDropdown"
      class="dropdown-overlay"
      @click="closeDropdowns"
    ></div>

    <h2>Panel Administratora</h2>
    <div class="tabs">
      <button :class="{ active: activeTab === 'scraper' }" @click="activeTab = 'scraper'">
        <span>🏆</span> Sesje & Wyniki
      </button>
      <button :class="{ active: activeTab === 'trainings' }" @click="activeTab = 'trainings'">
        <span>📄</span> Treningi & PDF
      </button>
      <button :class="{ active: activeTab === 'athletes' }" @click="activeTab = 'athletes'">
        <span>🎿</span> Baza Skoczków
      </button>
      <button :class="{ active: activeTab === 'review' }" @click="activeTab = 'review'">
        <span>🛡️</span> Kwarantanna
        <span v-if="totalPendingReviews > 0" class="badge-counter">{{ totalPendingReviews }}</span>
      </button>
    </div>

    <!-- TAB 1: SESJE & WYNIKI -->
    <div v-if="activeTab === 'scraper'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>Pobierz Wyniki Konkursów z FIS</h3>
            <p class="subtitle">Pobieranie oficjalnych wyników konkursowych oraz kwalifikacji do bazy danych.</p>
          </div>
        </div>

        <div class="filter-row">
          <div class="filter-section">
            <label class="field-label">Kategorie:</label>
            <div class="custom-dropdown">
              <button
                class="dropdown-toggle"
                @click="showCategoryDropdown = !showCategoryDropdown; showSeasonDropdown = false"
              >
                <span>{{ selectedCategories.length > 0 ? `Wybrano: ${selectedCategories.length}` : 'Wybierz kategorie...' }}</span>
                <span class="arrow">▼</span>
              </button>
              <div v-if="showCategoryDropdown" class="dropdown-menu">
                <div class="dropdown-actions-row">
                  <button type="button" @click="selectAllCategories" class="btn-text-sm">Zaznacz wszystkie</button>
                  <button type="button" @click="clearCategories" class="btn-text-sm">Wyczyść</button>
                </div>
                <label v-for="(info, code) in availableCategories" :key="code" class="dropdown-item">
                  <input type="checkbox" :value="code" v-model="selectedCategories" />
                  <span>{{ info.pl }} ({{ code }})</span>
                </label>
              </div>
            </div>
          </div>

          <div class="filter-section">
            <label class="field-label">Sezony:</label>
            <div class="custom-dropdown">
              <button
                class="dropdown-toggle"
                @click="showSeasonDropdown = !showSeasonDropdown; showCategoryDropdown = false"
              >
                <span>{{ selectedSeasons.length > 0 ? `Wybrano: ${selectedSeasons.length}` : 'Wybierz sezony...' }}</span>
                <span class="arrow">▼</span>
              </button>
              <div v-if="showSeasonDropdown" class="dropdown-menu">
                <div class="dropdown-actions-row">
                  <button type="button" @click="selectAllSeasons" class="btn-text-sm">Zaznacz wszystkie</button>
                  <button type="button" @click="clearSeasons" class="btn-text-sm">Wyczyść</button>
                </div>
                <label v-for="year in availableSeasons" :key="year" class="dropdown-item">
                  <input type="checkbox" :value="year" v-model="selectedSeasons" />
                  <span>{{ year }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="filter-section">
            <label class="field-label">Tryb Pobierania:</label>
            <select v-model="scrapeMode" class="form-select">
              <option value="IND">Tylko Indywidualne (IND)</option>
              <option value="TEAM" disabled>Drużynówki (Wkrótce)</option>
            </select>
          </div>
        </div>

        <div class="action-footer">
          <button @click="runScraper" :disabled="isScraping" class="btn-primary">
            <span>🚀</span> Rozpocznij Scrapowanie
          </button>
        </div>

        <div v-if="scrapeResult" class="results-box">
          <h4>Raport z wykonania:</h4>
          <ul class="stats-list">
            <li>Przetworzono kombinacji: <span>{{ scrapeResult.combinations_processed }}</span></li>
            <li>Zapisano nowych konkursów: <span class="text-green">{{ scrapeResult.inserted }}</span></li>
            <li>Zaktualizowano (brak zmian): <span>{{ scrapeResult.unchanged }}</span></li>
            <li>Wysłano do kwarantanny: <span class="text-yellow">{{ scrapeResult.sent_to_review }}</span></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 2: TRENINGI & PDF -->
    <div v-if="activeTab === 'trainings'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>Pobieranie Wyników Treningów & Serii Próbnych (PDF)</h3>
            <p class="subtitle">
              Skrypt przeszukuje załączniki PDF z oficjalnymi treningami lub seriami próbnymi, pobiera je, wyciąga surowy tekst i zasila system niezależnymi sesjami (TRAINING / TRIAL).
            </p>
          </div>
        </div>

        <div class="filter-row">
          <div class="filter-section" style="max-width: 250px">
            <label class="field-label">Sezon zawodów:</label>
            <select v-model="pdfSeason" class="form-select">
              <option v-for="year in availableSeasons" :key="year" :value="year">{{ year }}</option>
            </select>
          </div>
        </div>

        <div class="action-footer">
          <button @click="runPdfScraper" :disabled="isPdfScraping" class="btn-primary">
            <span>📄</span> Przeprowadź Ekstrakcję Treningów (PDF)
          </button>
        </div>

        <div v-if="pdfScrapeResult" class="results-box">
          <div v-if="pdfScrapeResult.message" class="info-alert">
            ℹ️ {{ pdfScrapeResult.message }}
          </div>

          <div class="summary-stats-grid">
            <div class="summary-stat-card">
              <span class="stat-number text-yellow">{{ pdfScrapeResult.saved_to_review }}</span>
              <span class="stat-label">Wysłano do Kwarantanny</span>
            </div>
            <div class="summary-stat-card">
              <span class="stat-number text-muted">{{ pdfScrapeResult.unchanged_files }}</span>
              <span class="stat-label">Pominięto (Brak zmian)</span>
            </div>
            <div class="summary-stat-card">
              <span class="stat-number text-blue">{{ pdfScrapeResult.processed_sessions_in_batch ?? 0 }}</span>
              <span class="stat-label">Przetworzone sesje</span>
            </div>
          </div>

          <!-- BŁĘDY / RAPORT POBIERANIA (np. 502 Bad Gateway z FIS) -->
          <div v-if="pdfScrapeResult.report && pdfScrapeResult.report.length > 0" class="report-error-card">
            <h4>⚠️ Zgłoszone błędy serwera FIS podczas pobierania ({{ pdfScrapeResult.report.length }}):</h4>
            <div v-for="(item, idx) in pdfScrapeResult.report" :key="idx" class="report-error-item">
              <div class="report-error-header">
                <span class="badge-codex">Codex {{ item.codex }}</span>
                <span class="badge-type">{{ item.type }}</span>
              </div>
              <pre class="report-error-msg">{{ item.error }}</pre>
            </div>
          </div>

          <div v-if="pdfScrapeResult.distinct_doc_types_in_batch?.length" class="doc-types-box">
            <p class="field-label">Wykryte typy dokumentów w paczce:</p>
            <div class="chips-wrap">
              <span v-for="type in pdfScrapeResult.distinct_doc_types_in_batch" :key="type" class="doc-pill">
                {{ type }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Debugger PDF -->
      <div class="admin-card mt-6">
        <div class="admin-card-header">
          <div>
            <h3>🛠️ Debugger Algorytmu (Test pojedynczego PDF)</h3>
            <p class="subtitle">
              Narzędzie testowe pozwalające zrzucić proces analizy parsera dla konkretnego pliku PDF.
            </p>
          </div>
        </div>

        <div class="debug-inputs-row">
          <div class="filter-section flex-3">
            <label class="field-label">Pełny URL do pliku PDF:</label>
            <input
              type="text"
              v-model="checkerForm.url"
              placeholder="https://..."
              class="form-input"
            />
          </div>
          <div class="filter-section flex-1">
            <label class="field-label">Codex:</label>
            <input
              type="text"
              v-model="checkerForm.codex"
              placeholder="np. 3700"
              class="form-input"
            />
          </div>
          <div class="filter-section flex-1">
            <label class="field-label">Race ID:</label>
            <input
              type="text"
              v-model="checkerForm.race_id"
              placeholder="np. 3001"
              class="form-input"
            />
          </div>
        </div>

        <div class="action-footer">
          <button @click="runPdfChecker" :disabled="isCheckingPdf" class="btn-primary btn-secondary">
            <span>🔍</span> {{ isCheckingPdf ? 'Skanowanie...' : 'Analizuj Plik' }}
          </button>
        </div>

        <div v-if="checkerResult" class="results-box debug-console">
          <h4 class="console-title">Log Systemowy (Zrozumienie Pliku):</h4>
          <ul class="console-logs">
            <li v-for="(log, i) in checkerResult.debug_log" :key="i">&gt;&gt; {{ log }}</li>
          </ul>

          <div v-if="checkerResult.parsed_results" class="parsed-results-box">
            <h4 class="text-green">Zidentyfikowano Zawodników: {{ checkerResult.athletes_found }}</h4>
            <div
              v-for="ath in checkerResult.parsed_results"
              :key="ath.name"
              class="parsed-ath-item"
            >
              <div class="ath-name">{{ ath.name }}</div>
              <div class="ath-floats">Liczby: {{ ath.floats_found }}</div>
              <div class="ath-raw">Chunk: {{ ath.raw_text }}</div>
            </div>
          </div>

          <div v-if="checkerResult.error" class="error-banner">
            <strong>BŁĄD:</strong> {{ checkerResult.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: BAZA SKOCZKÓW -->
    <div v-if="activeTab === 'athletes'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>Zarządzanie Bazą Skoczków</h3>
            <p class="subtitle">
              Pobierz najnowszą listę zawodników z FIS lub zaktualizuj ceny z Fantasy ESM.
            </p>
          </div>
        </div>

        <div class="options-container">
          <label class="toggle-label">
            <input v-model="onlyPriceUpdate" type="checkbox" />
            <span>Szybka aktualizacja cen z ESM (omija pełne scrapowanie FIS)</span>
          </label>
        </div>

        <div class="action-footer">
          <button @click="refreshAthletes" :disabled="isAthletesScraping" class="btn-primary">
            <span>🔄</span> Odśwież Bazę Skoczków
          </button>
        </div>

        <div v-if="athletesScrapeResult" class="results-box">
          <h4>Raport weryfikacji zawodników:</h4>
          <ul class="stats-list">
            <li>Bez zmian (aktualni): <span>{{ athletesScrapeResult.unchanged }}</span></li>
            <li>Nowi skoczkowie (kwarantanna): <span class="text-blue">{{ athletesScrapeResult.new_to_review }}</span></li>
            <li>Zmienieni skoczkowie (kwarantanna): <span class="text-yellow">{{ athletesScrapeResult.modified_to_review }}</span></li>
            <li>Usunięci / Zniknęli: <span class="text-red">{{ athletesScrapeResult.deleted_to_review }}</span></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 4: KWARANTANNA -->
    <div v-if="activeTab === 'review'" class="tab-content">
      <div class="review-sub-tabs">
        <button :class="{ active: reviewTab === 'athletes' }" @click="reviewTab = 'athletes'">
          Skoczkowie ({{ athleteReviews.length }})
        </button>
        <button :class="{ active: reviewTab === 'sessions' }" @click="reviewTab = 'sessions'">
          Sesje i Wyniki ({{ sessionReviews.length }})
        </button>
      </div>

      <div v-if="reviewTab === 'athletes'">
        <div v-if="athleteReviews.length > 0">
          <div class="actions-header">
            <p>
              Do weryfikacji: {{ athleteReviews.length }}
            </p>
            <button
              @click="handleApproveAllAthletes"
              class="btn-primary"
              style="background: #22c55e"
            >
              ✅ Akceptuj Wszystkich
            </button>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>FIS Code</th>
                <th>Zawodnik</th>
                <th>Status</th>
                <th style="text-align: right">Akcja</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in athleteReviews" :key="item.fis_code">
                <tr>
                  <td>{{ item.fis_code }}</td>
                  <td>
                    <span>{{ item.new_data.full_name }}</span>
                  </td>
                  <td>
                    <span :class="['badge', item.new_data.review_reason?.toLowerCase()]">{{
                      item.new_data.review_reason
                    }}</span>
                  </td>
                  <td style="text-align: right; min-width: 150px">
                    <button
                      @click="toggleAthleteDiff(item.fis_code)"
                      class="btn-icon"
                      title="Pokaż różnice"
                    >
                      🔍
                    </button>
                    <button
                      @click="handleAthleteReview(item.fis_code, 'approve')"
                      class="btn-icon btn-approve"
                    >
                      ✅
                    </button>
                    <button
                      @click="handleAthleteReview(item.fis_code, 'reject')"
                      class="btn-icon btn-reject"
                    >
                      ❌
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedAthlete === item.fis_code">
                  <td colspan="4" class="diff-td">
                    <div class="diff-viewer">
                      <div
                        v-for="(line, idx) in getDiff(item.old_data, item.new_data)"
                        :key="idx"
                        :class="['diff-line', line.type]"
                      >
                        {{ line.text }}
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">Brak skoczków oczekujących na weryfikację. 🎉</p>
      </div>

      <div v-if="reviewTab === 'sessions'">
        <div v-if="sessionReviews.length > 0">
          <div class="actions-header">
            <p>
              Do weryfikacji: {{ sessionReviews.length }}
            </p>
            <div style="display: flex; gap: 10px">
              <button
                @click="handleApproveAllSessions"
                class="btn-primary"
                style="background: #22c55e"
              >
                ✅ Akceptuj Wszystkie
              </button>
              <button
                @click="handleRejectAllSessions"
                class="btn-primary"
                style="background: #ef4444"
              >
                ❌ Odrzuć Wszystkie
              </button>
            </div>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>Codex</th>
                <th>Konkurs</th>
                <th>Miejsce / Sezon / Data</th>
                <th style="text-align: right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="item in sessionReviews" :key="item.codex">
                <tr>
                  <td>{{ item.codex }}</td>
                  <td>
                    <span>{{ item.new_data.title || item.new_data.session_type }}</span>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px">
                      <span>{{ item.new_data.event_place || '-' }}</span>
                      <span
                        v-if="item.new_data.season"
                        style="
                          background: #e0f2fe;
                          color: #0369a1;
                          padding: 2px 6px;
                          border-radius: 4px;
                          font-weight: 500;
                          font-size: 0.85em;
                        "
                      >
                        {{ item.new_data.season }}
                      </span>
                    </div>
                    <div
                      v-if="item.new_data.date"
                      style="color: #64748b; font-size: 0.85em; margin-top: 3px"
                    >
                      📅 {{ item.new_data.date }} {{ item.new_data.time || '' }}
                    </div>
                  </td>
                  <td style="text-align: right; min-width: 150px">
                    <button
                      @click="toggleSessionDiff(item.codex)"
                      class="btn-icon"
                      title="Pokaż różnice"
                    >
                      🔍
                    </button>
                    <button
                      @click="handleSessionReview(item.codex, 'approve')"
                      class="btn-icon btn-approve"
                    >
                      ✅
                    </button>
                    <button
                      @click="handleSessionReview(item.codex, 'reject')"
                      class="btn-icon btn-reject"
                    >
                      ❌
                    </button>
                  </td>
                </tr>
                <tr v-if="expandedSession === item.codex">
                  <td colspan="4" class="diff-td">
                    <div class="diff-viewer">
                      <div
                        v-for="(line, idx) in getDiff(item.old_data, item.new_data)"
                        :key="idx"
                        :class="['diff-line', line.type]"
                      >
                        {{ line.text }}
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">Brak wyników oczekujących na weryfikację. 🎿</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 24px 30px;
  max-width: 1080px;
  margin: 0 auto;
  color: #1e293b;
}

.admin-page h2 {
  font-size: 1.45em;
  font-weight: 600;
  color: #0f172a;
  margin-top: 0;
  margin-bottom: 20px;
}

/* Taby */
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e2e8f0;
}
.tabs button {
  padding: 10px 18px;
  border: none;
  background: none;
  font-size: 0.95em;
  cursor: pointer;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.tabs button:hover {
  color: #0f172a;
}
.tabs button.active {
  color: #0284c7;
  border-bottom-color: #0284c7;
  font-weight: 600;
}
.badge-counter {
  background: #fef08a;
  color: #854d0e;
  font-size: 0.75em;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 600;
}

/* Karty sekcji */
.admin-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 22px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.admin-card-header {
  margin-bottom: 18px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 12px;
}
.admin-card-header h3 {
  margin: 0 0 4px 0;
  font-size: 1.15em;
  font-weight: 600;
  color: #0f172a;
}
.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.85em;
}
.mt-6 {
  margin-top: 24px;
}

/* Etykiety i Filtry */
.field-label {
  font-size: 0.78em;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  height: 16px;
  line-height: 16px;
  display: block;
  margin-bottom: 4px;
}
.filter-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.filter-section {
  flex: 1 1 200px;
  min-width: 180px;
}
.flex-1 { flex: 1 1 120px; }
.flex-3 { flex: 3 1 300px; }

.form-select,
.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9em;
  background: white;
  color: #1e293b;
  box-sizing: border-box;
}
.form-select:focus,
.form-input:focus {
  outline: none;
  border-color: #0284c7;
}

.custom-dropdown {
  position: relative;
  width: 100%;
}
.dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
}
.dropdown-toggle {
  width: 100%;
  padding: 8px 12px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9em;
  color: #1e293b;
}
.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  margin-top: 4px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  max-height: 250px;
  overflow-y: auto;
  z-index: 50;
}
.dropdown-actions-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.btn-text-sm {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.78em;
  cursor: pointer;
  padding: 2px 4px;
}
.btn-text-sm:hover {
  text-decoration: underline;
}
.dropdown-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.88em;
}
.dropdown-item:hover {
  background: #f8fafc;
}
.dropdown-item input {
  margin-right: 8px;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

/* Przyciski */
.action-footer {
  margin-top: 18px;
}
.btn-primary {
  background: #0284c7;
  color: white;
  padding: 9px 18px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  font-size: 0.9em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-primary:hover:not(:disabled) {
  background: #0369a1;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary {
  background: #475569;
}
.btn-secondary:hover:not(:disabled) {
  background: #334155;
}
.btn-danger {
  background: #dc2626;
}
.btn-danger:hover:not(:disabled) {
  background: #b91c1c;
}

.debug-inputs-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* Wyniki & Raporty */
.results-box {
  margin-top: 20px;
  padding: 16px 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}
.results-box h4 {
  margin: 0 0 10px 0;
  font-size: 0.95em;
  font-weight: 600;
  color: #334155;
}
.stats-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9em;
}
.stats-list li span {
  font-weight: 600;
}
.text-green { color: #16a34a; }
.text-yellow { color: #ca8a04; }
.text-red { color: #dc2626; }
.text-blue { color: #0284c7; }
.text-muted { color: #64748b; }

.info-alert {
  padding: 10px 14px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 6px;
  margin-bottom: 14px;
  font-size: 0.88em;
}
.summary-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.summary-stat-card {
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 12px;
  text-align: center;
}
.stat-number {
  display: block;
  font-size: 1.5em;
  font-weight: 600;
  line-height: 1.2;
}
.stat-label {
  font-size: 0.78em;
  color: #64748b;
  text-transform: uppercase;
}

/* Raport Błędów Serwera */
.report-error-card {
  margin-top: 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 14px;
}
.report-error-card h4 {
  color: #b91c1c;
  margin-top: 0;
  margin-bottom: 10px;
}
.report-error-item {
  background: white;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 8px;
}
.report-error-header {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
}
.badge-codex {
  background: #fee2e2;
  color: #991b1b;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.78em;
  font-weight: 600;
  font-family: monospace;
}
.badge-type {
  background: #f1f5f9;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.78em;
}
.report-error-msg {
  margin: 0;
  font-size: 0.8em;
  color: #dc2626;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
}

.doc-types-box {
  margin-top: 14px;
}
.chips-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.doc-pill {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.78em;
}

/* Debugger Console */
.debug-console {
  background: #0f172a;
  color: #f8fafc;
}
.console-title {
  color: #38bdf8 !important;
  margin-top: 0;
}
.console-logs {
  color: #94a3b8;
  font-family: monospace;
  font-size: 0.85em;
  list-style: none;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
}
.parsed-ath-item {
  border-left: 2px solid #38bdf8;
  padding-left: 10px;
  margin-bottom: 12px;
}
.ath-name { color: white; font-weight: 500; }
.ath-floats { color: #fef08a; font-size: 0.82em; }
.ath-raw { color: #94a3b8; font-size: 0.78em; font-style: italic; }
.error-banner {
  color: #ef4444;
  margin-top: 14px;
  font-weight: 500;
}

/* Kwarantanna / Review */
.review-sub-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.review-sub-tabs button {
  padding: 7px 14px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
  font-weight: 500;
  font-size: 0.88em;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.review-sub-tabs button.active {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
  font-weight: 600;
}
.review-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border-radius: 6px;
  font-size: 0.88em;
}
.review-table th,
.review-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}
.actions-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  align-items: center;
}
.btn-icon {
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 1.1em;
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-approve:hover { background: #dcfce7; border-color: #22c55e; }
.btn-reject:hover { background: #fee2e2; border-color: #ef4444; }

.badge {
  padding: 3px 7px;
  border-radius: 10px;
  font-size: 0.78em;
  font-weight: 500;
}
.badge.new { background: #dcfce7; color: #166534; }
.badge.modified { background: #fef08a; color: #854d0e; }
.badge.deleted { background: #fee2e2; color: #991b1b; }

.empty-state {
  text-align: center;
  padding: 36px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}

/* DIFF */
.diff-td {
  padding: 0 !important;
  background: #0f172a;
  border: none !important;
}
.diff-viewer {
  padding: 12px 14px;
  font-family: monospace;
  font-size: 0.85em;
  line-height: 1.5;
  color: #cbd5e1;
  max-height: 350px;
  overflow-y: auto;
}
.diff-line {
  white-space: pre-wrap;
  padding: 1px 4px;
  border-radius: 2px;
}
.diff-line.added {
  background-color: rgba(34, 197, 94, 0.2);
  color: #86efac;
}
.diff-line.removed {
  background-color: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  text-decoration: line-through;
}
.diff-line.unchanged {
  opacity: 0.65;
  font-style: italic;
}
</style>