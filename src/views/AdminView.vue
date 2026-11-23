<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'

const activeTab = ref('scraper')

// --- Stan Konfiguracji ---
const availableCategories = ref<Record<string, any>>({})
const availableSeasons = computed(() => {
  const currentYear = new Date().getFullYear() + 1
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
const onlyPriceUpdate = ref(false) // NOWY STAN DLA CHECKBOXA

const closeDropdowns = () => {
  showCategoryDropdown.value = false
  showSeasonDropdown.value = false
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

const expandedSession = ref<string | null>(null)
const expandedAthlete = ref<number | null>(null)

// Stan dla scrapowania PDF
const isPdfScraping = ref(false)
const pdfScrapeResult = ref<any>(null)

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
        // Jeśli Twoja aplikacja wymaga autoryzacji, dodaj: ...getHeaders()
      },
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

watch(activeTab, (newVal) => {
  if (newVal === 'review') fetchReviews()
})
watch(reviewTab, () => {
  fetchReviews()
})

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="admin-page">
    <SkiLoader v-if="isScraping">Pobieranie i analizowanie wyników FIS...</SkiLoader>
    <SkiLoader v-if="isAthletesScraping">Weryfikacja bazy skoczków z FIS...</SkiLoader>
    <SkiLoader v-if="isLoadingReviews">Wczytywanie kwarantanny...</SkiLoader>
    <SkiLoader v-if="isApprovingAll">Masowe zatwierdzanie...</SkiLoader>
    <SkiLoader v-if="isPdfScraping">Pobieranie i czytanie dokumentów PDF z FIS...</SkiLoader>

    <div
      v-if="showCategoryDropdown || showSeasonDropdown"
      class="dropdown-overlay"
      @click="closeDropdowns"
    ></div>

    <h2>Panel Administratora</h2>
    <div class="tabs">
      <button :class="{ active: activeTab === 'scraper' }" @click="activeTab = 'scraper'">
        Wyniki / Sesje
      </button>
      <button :class="{ active: activeTab === 'athletes' }" @click="activeTab = 'athletes'">
        Baza Skoczków
      </button>
      <button :class="{ active: activeTab === 'review' }" @click="activeTab = 'review'">
        Weryfikacja Kwarantanny
      </button>
    </div>

    <div v-if="activeTab === 'scraper'" class="tab-content">
      <h3>Pobierz Wyniki FIS do Bazy Danych</h3>

      <div class="filter-row">
        <div class="filter-section">
          <h4>Wybierz Kategorie</h4>
          <div class="custom-dropdown">
            <button
              class="dropdown-toggle"
              @click="
                showCategoryDropdown = !showCategoryDropdown;
                showSeasonDropdown = false
              "
            >
              {{
                selectedCategories.length > 0
                  ? `Wybrano kategorii: ${selectedCategories.length}`
                  : 'Wybierz kategorie...'
              }}
              <span class="arrow">▼</span>
            </button>
            <div v-if="showCategoryDropdown" class="dropdown-menu">
              <label v-for="(info, code) in availableCategories" :key="code" class="dropdown-item">
                <input type="checkbox" :value="code" v-model="selectedCategories" />
                {{ info.pl }} ({{ code }})
              </label>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <h4>Wybierz Sezony</h4>
          <div class="custom-dropdown">
            <button
              class="dropdown-toggle"
              @click="
                showSeasonDropdown = !showSeasonDropdown;
                showCategoryDropdown = false
              "
            >
              {{
                selectedSeasons.length > 0
                  ? `Wybrano sezonów: ${selectedSeasons.length}`
                  : 'Wybierz sezony...'
              }}
              <span class="arrow">▼</span>
            </button>
            <div v-if="showSeasonDropdown" class="dropdown-menu">
              <label v-for="year in availableSeasons" :key="year" class="dropdown-item">
                <input type="checkbox" :value="year" v-model="selectedSeasons" />
                {{ year }}
              </label>
            </div>
          </div>
        </div>

        <div class="filter-section">
          <h4>Tryb Pobierania</h4>
          <select v-model="scrapeMode" class="form-select">
            <option value="IND">Tylko Indywidualne (IND)</option>
            <option value="TEAM" disabled>Drużynówki (Wkrótce)</option>
          </select>
        </div>
      </div>

      <div style="margin-top: 20px">
        <button @click="runScraper" :disabled="isScraping" class="btn-primary">
          Rozpocznij Scrapowanie
        </button>
      </div>

      <div v-if="scrapeResult" class="results-box">
        <h4>Raport z wykonania:</h4>
        <ul>
          <li>Przetworzono kombinacji: {{ scrapeResult.combinations_processed }}</li>
          <li>Zapisano nowych konkursów: {{ scrapeResult.inserted }}</li>
          <li>Zaktualizowano (brak zmian): {{ scrapeResult.unchanged }}</li>
          <li>
            <b style="color: #eab308">Wysłano do kwarantanny: {{ scrapeResult.sent_to_review }}</b>
          </li>
        </ul>
      </div>
      <div v-if="scrapeResult" class="results-box">
        <h4>Raport z wykonania:</h4>
      </div>

      <hr style="margin: 40px 0; border: 1px solid #e2e8f0" />

      <h3>Pobieranie Wyników Treningów & Serii Próbnych (PDF)</h3>
      <p style="color: #64748b; margin-bottom: 20px">
        Skrypt przeszukuje bazę danych w poszukiwaniu załączników PDF z oficjalnymi treningami lub
        seriami próbnymi, pobiera je, wyciąga surowy tekst i zasila system niezależnymi,
        chronologicznymi sesjami (TRAINING / TRIAL).
      </p>

      <button
        @click="runPdfScraper"
        :disabled="isPdfScraping"
        class="btn-primary"
        style="background-color: #8b5cf6"
      >
        📄 Przeprowadź Ekstrakcję Treningów (PDF)
      </button>

      <div v-if="pdfScrapeResult" class="results-box" style="margin-top: 20px">
        <h4>Raport z generowania z PDF:</h4>
        <p>
          <strong>Przesłano do Kwarantanny (Nowe lub Zmienione sesje):</strong>
          <span style="color: #eab308; font-weight: bold; font-size: 1.2em">
            {{ pdfScrapeResult.saved_sessions_count }}
          </span>
        </p>
        <p>
          <strong>Pominięto (Identyczne sesje - brak zmian):</strong>
          <span style="color: #64748b; font-weight: bold; font-size: 1em">
            {{ pdfScrapeResult.unchanged_count }}
          </span>
        </p>

        <div
          style="
            margin-top: 20px;
            background: white;
            padding: 15px;
            border-radius: 6px;
            border: 1px dashed #cbd5e1;
          "
        >
          <p style="font-weight: bold; margin-bottom: 10px">Wykryte typy dokumentów w systemie:</p>
          <ul style="display: flex; flex-wrap: wrap; gap: 10px; padding: 0; list-style: none">
            <li
              v-for="type in pdfScrapeResult.distinct_doc_types"
              :key="type"
              style="
                background: #f1f5f9;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 0.85em;
                border: 1px solid #cbd5e1;
              "
            >
              {{ type }}
            </li>
          </ul>
        </div>
      </div>
      <hr style="margin: 40px 0; border: 1px solid #e2e8f0" />

      <h3 style="color: #dc2626">🛠️ Debugger Algorytmu (Wklej PDF który zawiódł)</h3>
      <p style="color: #64748b; margin-bottom: 20px">
        Narzędzie testowe pozwalające zrzucić "myślenie" parsera dla konkretnego pliku. Pokaże co
        skrypt odciął, ile rozpoznał nazwisk i jakie liczby wyciągnął.
      </p>

      <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap">
        <input
          type="text"
          v-model="checkerForm.url"
          placeholder="Wklej pełny adres URL PDF z FIS..."
          style="
            flex: 3;
            min-width: 300px;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
          "
        />
        <input
          type="text"
          v-model="checkerForm.codex"
          placeholder="Codex (np. 3185)"
          style="flex: 1; padding: 12px; border-radius: 4px; border: 1px solid #cbd5e1"
        />
        <input
          type="text"
          v-model="checkerForm.race_id"
          placeholder="Race ID"
          style="flex: 1; padding: 12px; border-radius: 4px; border: 1px solid #cbd5e1"
        />
        <button
          @click="runPdfChecker"
          :disabled="isCheckingPdf"
          class="btn-primary"
          style="background-color: #dc2626"
        >
          {{ isCheckingPdf ? 'Skanowanie...' : '🔍 Analizuj Plik' }}
        </button>
      </div>

      <div
        v-if="checkerResult"
        class="results-box"
        style="background: #1e293b; color: #f8fafc; overflow-x: auto"
      >
        <h4 style="color: #38bdf8; margin-top: 0">Log Systemowy (Zrozumienie Pliku):</h4>
        <ul style="color: #94a3b8; font-family: monospace; font-size: 0.9em">
          <li v-for="(log, i) in checkerResult.debug_log" :key="i">>> {{ log }}</li>
        </ul>

        <div v-if="checkerResult.parsed_results" style="margin-top: 20px">
          <h4 style="color: #22c55e">
            Zidentyfikowano Zawodników: {{ checkerResult.athletes_found }}
          </h4>
          <div
            v-for="ath in checkerResult.parsed_results"
            :key="ath.name"
            style="border-left: 2px solid #38bdf8; padding-left: 10px; margin-bottom: 15px"
          >
            <strong style="color: white">{{ ath.name }}</strong
            ><br />
            <span style="color: #fef08a; font-size: 0.85em"
              >Liczby Zmiennoprzecinkowe: {{ ath.floats_found }}</span
            ><br />
            <span style="color: #94a3b8; font-size: 0.8em; font-style: italic"
              >Chunk Tekstu: {{ ath.raw_text }}</span
            >
          </div>
        </div>

        <div v-if="checkerResult.error" style="color: #ef4444; margin-top: 20px">
          <strong>BŁĄD:</strong> {{ checkerResult.error }}
        </div>
      </div>
    </div>
    <div v-if="activeTab === 'athletes'" class="tab-content"></div>

    <div v-if="activeTab === 'athletes'" class="tab-content">
      <h3>Zarządzanie Bazą Skoczków</h3>
      <p>
        Proces pobierze najnowszą listę zawodników z FIS i porówna z naszą bazą danych w
        poszukiwaniu nowych twarzy, modyfikacji lub usuniętych skoczków.
      </p>

      <div class="options-container" style="margin-bottom: 15px">
        <label
          class="toggle-label"
          title="Pobierze ceny z ESM i umieści wybrane zmiany w module weryfikacji, omijając pełne scrapowanie FIS."
        >
          <input v-model="onlyPriceUpdate" type="checkbox" />
          <span>Szybka aktualizacja cen z ESM</span>
        </label>
      </div>

      <button @click="refreshAthletes" :disabled="isAthletesScraping" class="btn-primary">
        Odśwież Bazę Skoczków
      </button>

      <div v-if="athletesScrapeResult" class="results-box">
        <h4>Raport weryfikacji zawodników:</h4>
        <ul>
          <li>Bez zmian (aktualni): {{ athletesScrapeResult.unchanged }}</li>
          <li>
            <b style="color: #3b82f6"
              >Nowi skoczkowie (kwarantanna): {{ athletesScrapeResult.new_to_review }}</b
            >
          </li>
          <li>
            <b style="color: #eab308"
              >Zmienieni skoczkowie (kwarantanna): {{ athletesScrapeResult.modified_to_review }}</b
            >
          </li>
          <li>
            <b style="color: #ef4444"
              >Usunięci / Zniknęli (kwarantanna): {{ athletesScrapeResult.deleted_to_review }}</b
            >
          </li>
        </ul>
      </div>
    </div>

    <div v-if="activeTab === 'review'" class="tab-content">
      <div class="review-sub-tabs">
        <button :class="{ active: reviewTab === 'athletes' }" @click="reviewTab = 'athletes'">
          Skoczkowie
        </button>
        <button :class="{ active: reviewTab === 'sessions' }" @click="reviewTab = 'sessions'">
          Sesje i Wyniki
        </button>
      </div>

      <div v-if="reviewTab === 'athletes'">
        <div v-if="athleteReviews.length > 0">
          <div class="actions-header">
            <p>
              <strong>Do weryfikacji: {{ athleteReviews.length }}</strong>
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
            <template v-for="item in athleteReviews" :key="item.fis_code">
              <tr>
                <td>{{ item.fis_code }}</td>
                <td>
                  <strong>{{ item.new_data.full_name }}</strong>
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
          </table>
        </div>
        <p v-else class="empty-state">Brak skoczków oczekujących na weryfikację. 🎉</p>
      </div>

      <div v-if="reviewTab === 'sessions'">
        <div v-if="sessionReviews.length > 0">
          <div class="actions-header">
            <p>
              <strong>Do weryfikacji: {{ sessionReviews.length }}</strong>
            </p>
            <button
              @click="handleApproveAllSessions"
              class="btn-primary"
              style="background: #22c55e"
            >
              ✅ Akceptuj Wszystkie
            </button>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>Codex</th>
                <th>Konkurs</th>
                <th>Miejsce</th>
                <th style="text-align: right">Akcje</th>
              </tr>
            </thead>
            <template v-for="item in sessionReviews" :key="item.codex">
              <tr>
                <td>{{ item.codex }}</td>
                <td>
                  <strong>{{ item.new_data.title }}</strong>
                </td>
                <td>{{ item.new_data.event_place }}</td>
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
          </table>
        </div>
        <p v-else class="empty-state">Brak wyników oczekujących na weryfikację. 🎿</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 30px;
  max-width: 1000px;
  margin: 0 auto;
  color: #1e293b;
}

/* Taby */
.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e2e8f0;
}
.tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 1.1em;
  cursor: pointer;
  color: #64748b;
}
.tabs button.active {
  font-weight: bold;
  color: #0284c7;
  border-bottom: 3px solid #0284c7;
}
.review-sub-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}
.review-sub-tabs button {
  padding: 8px 16px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
}
.review-sub-tabs button.active {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
}

/* Dropdowny i filtry */
.filter-row {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.filter-section {
  flex: 1;
  min-width: 250px;
}
.filter-section h4 {
  margin-bottom: 8px;
  color: #334155;
}
.form-select {
  width: 100%;
  padding: 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1em;
  background: white;
}

.custom-dropdown {
  position: relative;
  width: 100%;
}
.dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 40;
}
.dropdown-toggle {
  width: 100%;
  padding: 12px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1em;
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
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  max-height: 250px;
  overflow-y: auto;
  z-index: 50;
}
.dropdown-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  user-select: none;
}
.dropdown-item:hover {
  background: #f8fafc;
}
.dropdown-item input {
  margin-right: 10px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Przyciski i Tabele */
.btn-primary {
  background: #0ea5e9;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}
.btn-primary:hover {
  background: #0284c7;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-icon {
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 1.2em;
  margin-left: 5px;
}
.btn-approve:hover {
  background: #dcfce7;
  border-color: #22c55e;
}
.btn-reject:hover {
  background: #fee2e2;
  border-color: #ef4444;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
}
.review-table th,
.review-table td {
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}
.actions-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  align-items: center;
}
.badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
}
.badge.new {
  background: #dcfce7;
  color: #166534;
}
.badge.modified {
  background: #fef08a;
  color: #854d0e;
}
.badge.deleted {
  background: #fee2e2;
  color: #991b1b;
}
.results-box {
  margin-top: 20px;
  padding: 15px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
}

/* STYLE GITA (DIFF) z uwzględnieniem tylko zmian! */
.diff-td {
  padding: 0 !important;
  background: #1e293b;
  border: none !important;
}
.diff-viewer {
  padding: 15px;
  font-family: monospace;
  font-size: 0.9em;
  line-height: 1.5;
  color: #cbd5e1;
  max-height: 400px;
  overflow-y: auto;
}
.diff-line {
  white-space: pre-wrap;
  padding: 2px 5px;
  border-radius: 2px;
}
.diff-line.added {
  background-color: rgb(12 149 59 / 0.2);
  color: #9ce1ba;
}
.diff-line.removed {
  background-color: rgb(230 158 158 / 0.35);
  color: #f87171;
  text-decoration: line-through;
}
.diff-line.unchanged {
  opacity: 0.7;
  font-style: italic;
}

.toggle-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: bold;
  color: #0f172a;
}
.toggle-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #0ea5e9;
}
</style>