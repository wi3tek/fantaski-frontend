<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'
import { API_BASE_URL } from '@/api/client'
import { useNotifications } from '@/stores/notifications'
import { useI18n } from '@/i18n'

const { t, bcp47Locale, formatCategory } = useI18n()
const route = useRoute()
const { lastDraftEvent } = useNotifications()
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
const isStoppingScraper = ref(false)
const scrapeStatus = ref<any>(null)
const scrapeMessage = ref<string | null>(null)
const scrapeResult = ref<any>(null)
let scrapePollTimer: any = null

// --- Stan Wgranych Sezonów w Bazie ---
const seasonsSummary = ref<any[]>([])
const isLoadingSeasonsSummary = ref(false)

const totalMissingAcrossDb = computed(() =>
  seasonsSummary.value.reduce((acc, s) => acc + (s.missing_sessions || 0), 0),
)
const totalFailed429AcrossDb = computed(() =>
  seasonsSummary.value.reduce((acc, s) => acc + (s.failed_429_sessions || 0), 0),
)

const loadSeasonsSummary = async () => {
  isLoadingSeasonsSummary.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/seasons-summary`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      seasonsSummary.value = data.seasons || []
    }
  } catch (e) {
    console.error('Błąd ładowania podsumowania sezonów', e)
  } finally {
    isLoadingSeasonsSummary.value = false
  }
}

const getSeasonStatus = (seasonStr: string) => {
  return seasonsSummary.value.find((s) => s.season === seasonStr)
}

const quickSelectSeason = (seasonStr: string) => {
  if (!selectedSeasons.value.includes(seasonStr)) {
    selectedSeasons.value = [seasonStr]
  }
  const sData = getSeasonStatus(seasonStr)
  if (sData && sData.categories && sData.categories.length > 0) {
    selectedCategories.value = sData.categories.map((c: any) => c.category_code)
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// --- Stan Optymalizacji i Brakujących Zawodów ---
const onlyMissing = ref(true)
const showMissingModal = ref(false)
const isLoadingMissing = ref(false)
const selectedMissingSeason = ref<string>('')
const missingSeasonData = ref<any>(null)

const openMissingDetails = async (seasonStr: string) => {
  selectedMissingSeason.value = seasonStr
  showMissingModal.value = true
  isLoadingMissing.value = true
  missingSeasonData.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/seasons-summary/${seasonStr}/missing`, {
      headers: getHeaders(),
    })
    if (res.ok) {
      missingSeasonData.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd pobierania szczegółów brakujących zawodów', e)
  } finally {
    isLoadingMissing.value = false
  }
}

const closeMissingDetails = () => {
  showMissingModal.value = false
  missingSeasonData.value = null
}

const scrapeMissingSeason = async (seasonStr: string, only429: boolean = false) => {
  closeMissingDetails()
  window.scrollTo({ top: 0, behavior: 'smooth' })
  await triggerRetryMissing(seasonStr, only429)
}

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
const isStoppingPdf = ref(false)
const pdfStatus = ref<any>(null)
const pdfMessage = ref<string | null>(null)
const pdfScrapeResult = ref<any>(null)
let pdfPollTimer: any = null
const pdfSeason = ref<string>(new Date().getFullYear().toString())
const maxSelectableSeason = new Date().getFullYear() + 1
const pdfSeasonFrom = ref<number>(new Date().getFullYear())
const pdfSeasonTo = ref<number>(maxSelectableSeason)
const pdfCategories = ref<string[]>(['WC', 'OWG', 'WSC', 'SFWC'])
const pdfForceReprocess = ref<boolean>(false)

const allScraperCatOptions = [
  { code: 'WC' },
  { code: 'OWG' },
  { code: 'WSC' },
  { code: 'SFWC' },
  { code: 'GP' },
  { code: 'COC' },
  { code: 'FC' },
  { code: 'WJC' },
  { code: 'FESA' },
]

const togglePdfCategory = (code: string) => {
  const idx = pdfCategories.value.indexOf(code)
  if (idx > -1) pdfCategories.value.splice(idx, 1)
  else pdfCategories.value.push(code)
}

// --- Stan Wzbogacania Pogodą (Weather Enricher) ---
const weatherStatus = ref<any>(null)
const isEnrichingWeather = ref(false)
const isLoadingWeatherStatus = ref(false)
const isStoppingWeather = ref(false)
const weatherTarget = ref<'all' | 'dev' | 'test'>('all')
const weatherForce = ref(false)
const weatherMessage = ref<string | null>(null)
let weatherPollTimer: any = null

// --- Stan Nocnego Scrapowania (Nightly Batch Scraper) ---
const nightlyStatus = ref<any>(null)
const isNightlyScraping = ref(false)
const isStoppingNightly = ref(false)
const isLoadingNightlyStatus = ref(false)
const nightlyDelaySeconds = ref(1.8)
const nightlySeasonFrom = ref<number>(2020)
const nightlySeasonTo = ref<number>(maxSelectableSeason)
const nightlyCategories = ref<string[]>(['WC', 'GP', 'COC', 'FC'])
const nightlyMessage = ref<string | null>(null)
let nightlyPollTimer: any = null

const toggleNightlyCategory = (code: string) => {
  const idx = nightlyCategories.value.indexOf(code)
  if (idx > -1) nightlyCategories.value.splice(idx, 1)
  else nightlyCategories.value.push(code)
}

const applyNightlyPreset = (fromYear: number, toYear: number, cats: string[]) => {
  nightlySeasonFrom.value = fromYear
  nightlySeasonTo.value = toYear
  nightlyCategories.value = [...cats]
}

const hasActiveBackgroundProcess = computed(
  () => isScraping.value || isNightlyScraping.value || isEnrichingWeather.value || isPdfScraping.value,
)

// --- Stan Sieci Neuronowej (Training & Backtest) ---
const modelInfo = ref<any>(null)
const isTrainingModel = ref(false)
const isLoadingModelInfo = ref(false)
const modelTrainingMessage = ref<string | null>(null)
let modelPollTimer: any = null
const backtestStatus = ref<any>(null)
const isRunningBacktest = ref(false)
let backtestPollTimer: any = null
const hyperparamsBundle = ref<any>(null)
const autotuneStatus = ref<any>(null)
const isAutoTuning = ref(false)
const isStoppingAutotune = ref(false)
let autotunePollTimer: any = null

// --- Stan dla DEBUGGERA PDF ---
const checkerForm = ref({ url: '', codex: '', race_id: '' })
const isCheckingPdf = ref(false)
const checkerResult = ref<any>(null)

const runPdfChecker = async () => {
  if (!checkerForm.value.url) return alert('Podaj URL!')
  isCheckingPdf.value = true
  checkerResult.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-trainings-checker`, {
      method: 'POST',
      headers: getHeaders(),
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
      text: t('admin.diffNoSubstantiveChanges'),
    })
  }

  return lines
}
// ========================================================

const getHeaders = () => {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

// --- Stan Zarządzania Użytkownikami ---
const usersList = ref<any[]>([])
const isLoadingUsers = ref(false)
const updatingUserId = ref<string | null>(null)
const userSuccessMessage = ref('')
const userErrorMessage = ref('')
const esmSeasonLeagueId = ref('6ae06420a36131d6eb48db15')
const esmTeamDrafts = ref<Record<string, string>>({})
const savingEsmUserId = ref<string | null>(null)

// Filtrowanie i wyszukiwanie użytkowników
const userSearchQuery = ref('')
const userRoleFilter = ref('ALL')

const filteredUsersList = computed(() => {
  return usersList.value.filter((u) => {
    // 1. Filtr roli (legacy USER_LITE zaliczamy do kont darmowych USER)
    if (userRoleFilter.value !== 'ALL') {
      if (userRoleFilter.value === 'USER') {
        if (u.role === 'ADMIN' || u.role === 'USER_PRO') return false
      } else if (u.role !== userRoleFilter.value) {
        return false
      }
    }
    // 2. Szukanie po nazwie, emailu lub drużynie ESM
    const query = userSearchQuery.value.trim().toLowerCase()
    if (!query) return true

    const nameMatch = (u.name || '').toLowerCase().includes(query)
    const emailMatch = (u.email || '').toLowerCase().includes(query)
    const esmNameMatch = (u.esm_summary?.team_name || '').toLowerCase().includes(query)
    const esmIdMatch = (u.esm_summary?.team_id || '').toLowerCase().includes(query)
    return nameMatch || emailMatch || esmNameMatch || esmIdMatch
  })
})

const userRoleCounts = computed(() => {
  const counts = {
    ALL: usersList.value.length,
    ADMIN: 0,
    USER_PRO: 0,
    USER: 0,
  }
  usersList.value.forEach((u) => {
    if (u.role === 'ADMIN') counts.ADMIN++
    else if (u.role === 'USER_PRO') counts.USER_PRO++
    else counts.USER++
  })
  return counts
})

const clearUserFilters = () => {
  userSearchQuery.value = ''
  userRoleFilter.value = 'ALL'
}

const loadUsers = async () => {
  isLoadingUsers.value = true
  userErrorMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/auth/users`, { headers: getHeaders() })
    if (!res.ok) throw new Error(t('admin.errFetchUsersStatus', { status: res.status }))
    const data = await res.json()
    usersList.value = data
    const drafts: Record<string, string> = {}
    for (const u of data) {
      drafts[u.id] = u.esm_summary?.team_id || ''
    }
    esmTeamDrafts.value = drafts
  } catch (e: any) {
    userErrorMessage.value = e.message || t('admin.errFetchUsers')
  } finally {
    isLoadingUsers.value = false
  }
}

const assignUserEsmTeam = async (targetUser: any) => {
  const rawTid = (esmTeamDrafts.value[targetUser.id] || '').trim()
  if (!rawTid) {
    userErrorMessage.value = t('admin.errEnterEsmTid', { email: targetUser.email })
    return
  }
  savingEsmUserId.value = targetUser.id
  userErrorMessage.value = ''
  userSuccessMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/esm/admin/users/${targetUser.id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({
        team_id: rawTid,
        league_id: esmSeasonLeagueId.value.trim() || '6ae06420a36131d6eb48db15',
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.detail || t('admin.errAssignEsm'))
    }
    targetUser.esm_summary = data.esm_summary
    esmTeamDrafts.value[targetUser.id] = data.esm_summary?.team_id || rawTid
    userSuccessMessage.value = data.message || t('admin.okSyncEsm', { email: targetUser.email })
    setTimeout(() => {
      userSuccessMessage.value = ''
    }, 4500)
  } catch (e: any) {
    userErrorMessage.value = e.message || t('admin.errAssignEsmGeneric')
  } finally {
    savingEsmUserId.value = null
  }
}

const unlinkUserEsmTeam = async (targetUser: any) => {
  if (!confirm(t('admin.confirmUnlinkEsm', { email: targetUser.email }))) return
  savingEsmUserId.value = targetUser.id
  userErrorMessage.value = ''
  userSuccessMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/esm/admin/users/${targetUser.id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.detail || t('admin.errUnlinkEsm'))
    }
    targetUser.esm_summary = {
      connected: false,
      team_id: null,
      league_id: null,
      team_name: null,
    }
    esmTeamDrafts.value[targetUser.id] = ''
    userSuccessMessage.value = data.message || t('admin.okUnlinkEsm', { email: targetUser.email })
    setTimeout(() => {
      userSuccessMessage.value = ''
    }, 4000)
  } catch (e: any) {
    userErrorMessage.value = e.message || t('admin.errUnlinkEsm')
  } finally {
    savingEsmUserId.value = null
  }
}

const changeUserRole = async (targetUser: any, newRole: string) => {
  if (targetUser.role === newRole) return
  updatingUserId.value = targetUser.id
  userErrorMessage.value = ''
  userSuccessMessage.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/auth/users/${targetUser.id}/role`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ role: newRole }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || t('admin.errRoleUpdate'))
    }
    targetUser.role = newRole
    userSuccessMessage.value = t('admin.okRoleChanged', { email: targetUser.email, role: newRole })
    setTimeout(() => {
      userSuccessMessage.value = ''
    }, 4000)
  } catch (e: any) {
    userErrorMessage.value = e.message || t('admin.errRoleChange')
  } finally {
    updatingUserId.value = null
  }
}

const loadConfig = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/config`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      availableCategories.value = data.categories || {}
    }
  } catch (e) {
    console.error('Błąd ładowania configu', e)
  }
}

const loadScrapeStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-results/status`, {
      headers: getHeaders(),
    })
    if (res.ok) {
      const data = await res.json()
      scrapeStatus.value = data
      isScraping.value = Boolean(data.is_running)
      if (isScraping.value && !scrapePollTimer) {
        startScrapePolling()
      } else if (!isScraping.value && scrapePollTimer) {
        stopScrapePolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu scrapera:', e)
  }
}

const startScrapePolling = () => {
  if (scrapePollTimer) clearInterval(scrapePollTimer)
  scrapePollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/refresh-results/status`, {
        headers: getHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        scrapeStatus.value = data
        isScraping.value = Boolean(data.is_running)
        if (!isScraping.value) {
          stopScrapePolling()
          scrapeResult.value = data.stats || null
          scrapeMessage.value = data.last_message || t('admin.msgScrapeDone')
          await Promise.all([loadSeasonsSummary(), loadWeatherStatus(), fetchReviews()])
        }
      }
    } catch (e) {
      console.error('Błąd odpytywania statusu scrapera:', e)
    }
  }, 1500)
}

const stopScrapePolling = () => {
  if (scrapePollTimer) {
    clearInterval(scrapePollTimer)
    scrapePollTimer = null
  }
}

const runScraper = async () => {
  if (selectedCategories.value.length === 0 || selectedSeasons.value.length === 0)
    return alert(t('admin.alertSelectSeasonCat'))
  scrapeResult.value = null
  scrapeMessage.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-results/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        seasons: selectedSeasons.value,
        categories: selectedCategories.value,
        mode: scrapeMode.value,
        only_missing: onlyMissing.value,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      isScraping.value = true
      scrapeMessage.value = data.message || t('admin.msgScrapeStarted')
      await loadScrapeStatus()
      startScrapePolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errScrapeStart') }))
    }
  } catch (e: any) {
    console.error(e)
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerRetryMissing = async (seasonStr: string | null = null, only429: boolean = false) => {
  scrapeResult.value = null
  scrapeMessage.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/retry-missing/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        season: seasonStr,
        only_429: only429,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      isScraping.value = true
      scrapeMessage.value = data.message || t('admin.msgRetryStarted')
      await loadScrapeStatus()
      startScrapePolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errRetryStart') }))
    }
  } catch (e: any) {
    console.error(e)
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerStopScraper = async () => {
  if (isStoppingScraper.value) return
  isStoppingScraper.value = true
  if (scrapeStatus.value) {
    scrapeStatus.value.stop_requested = true
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-results/stop`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      scrapeMessage.value = t('admin.msgScrapeStopSent')
    }
  } catch (e) {
    console.error('Błąd zatrzymywania scrapera:', e)
  } finally {
    setTimeout(() => {
      isStoppingScraper.value = false
    }, 2500)
  }
}

// ========================================================
// --- METODY: WZBOGACANIE POGODĄ (OPEN-METEO ARCHIVE) ---
// ========================================================

const loadWeatherStatus = async () => {
  isLoadingWeatherStatus.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/weather-status`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      weatherStatus.value = data
      isEnrichingWeather.value = Boolean(data.status?.is_running)
      if (isEnrichingWeather.value && !weatherPollTimer) {
        startWeatherPolling()
      } else if (!isEnrichingWeather.value && weatherPollTimer) {
        stopWeatherPolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu pogody:', e)
  } finally {
    isLoadingWeatherStatus.value = false
  }
}

const startWeatherPolling = () => {
  if (weatherPollTimer) clearInterval(weatherPollTimer)
  weatherPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/weather-status`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        weatherStatus.value = data
        isEnrichingWeather.value = Boolean(data.status?.is_running)
        if (!isEnrichingWeather.value) {
          stopWeatherPolling()
          weatherMessage.value = t('admin.msgWeatherDone')
          setTimeout(() => (weatherMessage.value = null), 6000)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 2500)
}

const stopWeatherPolling = () => {
  if (weatherPollTimer) {
    clearInterval(weatherPollTimer)
    weatherPollTimer = null
  }
}

const triggerStartWeatherEnrichment = async () => {
  weatherMessage.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/enrich-weather/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        target: weatherTarget.value,
        force: weatherForce.value,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      isEnrichingWeather.value = true
      weatherMessage.value = data.message || t('admin.msgWeatherStarted')
      startWeatherPolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errWeatherStart') }))
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerStopWeatherEnrichment = async () => {
  if (isStoppingWeather.value) return
  isStoppingWeather.value = true
  if (weatherStatus.value?.status) {
    weatherStatus.value.status.stop_requested = true
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/enrich-weather/stop`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      weatherMessage.value = t('admin.msgWeatherStopSent')
    }
  } catch (e: any) {
    console.error('Błąd zatrzymywania enrichera:', e)
  } finally {
    setTimeout(() => {
      isStoppingWeather.value = false
    }, 2500)
  }
}

// ========================================================
// --- METODY: NOCNE PRZETWARZANIE BAZY (BATCH SCRAPE) ---
// ========================================================

const loadNightlyStatus = async () => {
  isLoadingNightlyStatus.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/nightly-scrape/status`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      nightlyStatus.value = data
      isNightlyScraping.value = Boolean(data.is_running)
      if (isNightlyScraping.value && !nightlyPollTimer) {
        startNightlyPolling()
      } else if (!isNightlyScraping.value && nightlyPollTimer) {
        stopNightlyPolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu nocnego scrapowania:', e)
  } finally {
    isLoadingNightlyStatus.value = false
  }
}

const startNightlyPolling = () => {
  if (nightlyPollTimer) clearInterval(nightlyPollTimer)
  nightlyPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/nightly-scrape/status`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        nightlyStatus.value = data
        isNightlyScraping.value = Boolean(data.is_running)
        if (!isNightlyScraping.value) {
          stopNightlyPolling()
          loadSeasonsSummary()
          loadWeatherStatus()
          nightlyMessage.value = t('admin.msgNightlyDone')
          setTimeout(() => (nightlyMessage.value = null), 6000)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 3000)
}

const stopNightlyPolling = () => {
  if (nightlyPollTimer) {
    clearInterval(nightlyPollTimer)
    nightlyPollTimer = null
  }
}

const triggerStartNightlyScrape = async () => {
  const lo = Math.min(nightlySeasonFrom.value, nightlySeasonTo.value)
  const hi = Math.max(nightlySeasonFrom.value, nightlySeasonTo.value)
  if (nightlyCategories.value.length === 0) {
    return alert(t('admin.alertNightlyNoCat'))
  }
  const seasonsRange: string[] = []
  for (let y = hi; y >= lo; y--) {
    seasonsRange.push(String(y))
  }

  if (
    !confirm(
      t('admin.confirmNightly', { lo, hi, years: seasonsRange.length, cats: nightlyCategories.value.join(', ') })
    )
  ) {
    return
  }
  nightlyMessage.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/admin/nightly-scrape/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        seasons: seasonsRange,
        categories: nightlyCategories.value,
        delay_seconds: Number(nightlyDelaySeconds.value) || 1.8,
        mode: 'IND',
      }),
    })
    const data = await res.json()
    if (res.ok) {
      isNightlyScraping.value = true
      nightlyMessage.value = data.message || t('admin.msgNightlyStarted')
      startNightlyPolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errNightlyStart') }))
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerStopNightlyScrape = async () => {
  if (isStoppingNightly.value) return
  isStoppingNightly.value = true
  if (nightlyStatus.value) {
    nightlyStatus.value.stop_requested = true
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/nightly-scrape/stop`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      nightlyMessage.value = t('admin.msgNightlyStopSent')
    }
  } catch (e: any) {
    console.error('Błąd zatrzymywania nocnego przetwarzania:', e)
  } finally {
    setTimeout(() => {
      isStoppingNightly.value = false
    }, 2500)
  }
}

const stopPdfPolling = () => {
  if (pdfPollTimer) {
    clearInterval(pdfPollTimer)
    pdfPollTimer = null
  }
}

const loadPdfStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-trainings/status`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      pdfStatus.value = data
      isPdfScraping.value = Boolean(data.is_running)
      if (!data.is_running && data.last_result) {
        pdfScrapeResult.value = data.last_result
      }
      if (isPdfScraping.value && !pdfPollTimer) {
        startPdfPolling()
      } else if (!isPdfScraping.value && pdfPollTimer) {
        stopPdfPolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu ekstrakcji PDF:', e)
  }
}

const startPdfPolling = () => {
  if (pdfPollTimer) clearInterval(pdfPollTimer)
  pdfPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/refresh-trainings/status`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        pdfStatus.value = data
        const stillRunning = Boolean(data.is_running)
        isPdfScraping.value = stillRunning
        if (!stillRunning) {
          stopPdfPolling()
          isStoppingPdf.value = false
          if (data.last_result) {
            pdfScrapeResult.value = data.last_result
          }
          pdfMessage.value = data.last_message || t('admin.msgPdfDone')
          fetchReviews()
          loadSeasonsSummary()
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 2000)
}

const runPdfScraper = async () => {
  if (isPdfScraping.value) return
  pdfScrapeResult.value = null
  pdfMessage.value = null
  const lo = Math.min(pdfSeasonFrom.value, pdfSeasonTo.value)
  const hi = Math.max(pdfSeasonFrom.value, pdfSeasonTo.value)
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-trainings/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        season_from: lo,
        season_to: hi,
        categories: pdfCategories.value.length > 0 ? pdfCategories.value : null,
        force_reprocess: pdfForceReprocess.value,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      isPdfScraping.value = true
      pdfMessage.value = data.message || t('admin.msgPdfStarted')
      await loadPdfStatus()
      startPdfPolling()
    } else {
      alert(t('admin.errServer', { msg: data.detail || t('admin.unknownErr') }))
    }
  } catch (e) {
    console.error(e)
    alert(t('admin.errBackendConn'))
  }
}

const triggerStopPdfScraper = async () => {
  if (isStoppingPdf.value) return
  isStoppingPdf.value = true
  if (pdfStatus.value) {
    pdfStatus.value.stop_requested = true
  }
  try {
    const res = await fetch(`${API_BASE_URL}/admin/refresh-trainings/stop`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      pdfMessage.value = t('admin.msgPdfStopSent')
    }
  } catch (e) {
    console.error('Błąd zatrzymywania ekstrakcji PDF:', e)
  } finally {
    setTimeout(() => {
      isStoppingPdf.value = false
    }, 2500)
  }
}

const refreshAthletes = async () => {
  isAthletesScraping.value = true
  athletesScrapeResult.value = null
  try {
    // Wysyłamy flagę w Body jako stringified JSON
    const body = JSON.stringify({ onlyPriceUpdate: onlyPriceUpdate.value })
    const res = await fetch(`${API_BASE_URL}/admin/refresh-athletes`, {
      method: 'POST',
      headers: getHeaders(),
      body,
    })
    const data = await res.json()
    if (res.ok) athletesScrapeResult.value = data.stats
    else alert(t('admin.errPrefix', { msg: data.detail }))
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
    const res = await fetch(`${API_BASE_URL}/admin/reviews/${endpoint}`, {
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
    const res = await fetch(`${API_BASE_URL}/admin/reviews/athletes/${fisCode}/${action}`, {
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
  if (!confirm(t('admin.confirmApproveAllAthletes', { count: athleteReviews.value.length }))) return
  isApprovingAll.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/reviews/athletes/approve-all`, {
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
    const res = await fetch(`${API_BASE_URL}/admin/reviews/sessions/${codex}/${action}`, {
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
  if (!confirm(t('admin.confirmApproveAllSessions', { count: sessionReviews.value.length }))) return
  isApprovingAll.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/reviews/sessions/approve-all`, {
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
      t('admin.confirmRejectAllSessions', { count: sessionReviews.value.length })
    )
  )
    return
  isRejectingAll.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/admin/reviews/sessions/reject-all`, {
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
  if (newVal === 'users') loadUsers()
  if (newVal === 'neural') loadModelInfo()
})

// ========================================================
// --- METODY: SIEĆ NEURONOWA (TRENING MODELU) ---
// ========================================================

const loadModelInfo = async () => {
  isLoadingModelInfo.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/model-info`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      modelInfo.value = data
      isTrainingModel.value = Boolean(data.training_status?.is_training ?? data.metadata?.is_training)
      if (isTrainingModel.value && !modelPollTimer) {
        startModelPolling()
      } else if (!isTrainingModel.value && modelPollTimer) {
        stopModelPolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania stanu modelu:', e)
  } finally {
    isLoadingModelInfo.value = false
  }
}

const startModelPolling = () => {
  if (modelPollTimer) clearInterval(modelPollTimer)
  modelPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/prediction/model-info`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        modelInfo.value = data
        isTrainingModel.value = Boolean(data.training_status?.is_training ?? data.metadata?.is_training)
        if (!isTrainingModel.value) {
          stopModelPolling()
          if (data.training_status?.error) {
            modelTrainingMessage.value = t('admin.msgTrainErr', { error: data.training_status.error })
          } else {
            modelTrainingMessage.value = t('admin.msgTrainOk')
          }
          setTimeout(() => (modelTrainingMessage.value = null), 10000)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 2000)
}

const stopModelPolling = () => {
  if (modelPollTimer) {
    clearInterval(modelPollTimer)
    modelPollTimer = null
  }
}

const stopBacktestPolling = () => {
  if (backtestPollTimer) {
    clearInterval(backtestPollTimer)
    backtestPollTimer = null
  }
}

const stopAutotunePolling = () => {
  if (autotunePollTimer) {
    clearInterval(autotunePollTimer)
    autotunePollTimer = null
  }
}

const loadHyperparams = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/hyperparams`, { headers: getHeaders() })
    if (res.ok) {
      hyperparamsBundle.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd pobierania hiperparametrów:', e)
  }
}

const resetHyperparams = async () => {
  if (!confirm(t('admin.confirmResetHyper'))) return
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/hyperparams/reset`, {
      method: 'POST',
      headers: getHeaders(),
    })
    if (res.ok) {
      hyperparamsBundle.value = await res.json()
      modelTrainingMessage.value = t('admin.msgResetHyperOk')
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const loadAutotuneStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/autotune/status`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      autotuneStatus.value = data
      isAutoTuning.value = Boolean(data.is_running)
      if (isAutoTuning.value && !autotunePollTimer) {
        startAutotunePolling()
      } else if (!isAutoTuning.value && autotunePollTimer) {
        stopAutotunePolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu Auto-Tunera:', e)
  }
}

const startAutotunePolling = () => {
  if (autotunePollTimer) clearInterval(autotunePollTimer)
  autotunePollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/prediction/autotune/status`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        autotuneStatus.value = data
        isAutoTuning.value = Boolean(data.is_running)
        if (!isAutoTuning.value) {
          stopAutotunePolling()
          isStoppingAutotune.value = false
          await loadHyperparams()
          await loadModelInfo()
          await loadBacktestStatus()
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 2500)
}

const triggerAutoTune = async () => {
  if (isAutoTuning.value) return
  if (!confirm(t('admin.confirmAutotune'))) return
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/autotune/start`, {
      method: 'POST',
      headers: getHeaders(),
    })
    const data = await res.json()
    if (res.ok) {
      isAutoTuning.value = true
      await loadAutotuneStatus()
      startAutotunePolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errAutotuneStart') }))
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerStopAutoTune = async () => {
  if (isStoppingAutotune.value) return
  isStoppingAutotune.value = true
  try {
    await fetch(`${API_BASE_URL}/prediction/autotune/stop`, {
      method: 'POST',
      headers: getHeaders(),
    })
  } catch (e) {
    console.error(e)
  } finally {
    setTimeout(() => (isStoppingAutotune.value = false), 2500)
  }
}

const loadBacktestStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/backtest/status`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      backtestStatus.value = data
      isRunningBacktest.value = Boolean(data.is_running)
      if (isRunningBacktest.value && !backtestPollTimer) {
        startBacktestPolling()
      } else if (!isRunningBacktest.value && backtestPollTimer) {
        stopBacktestPolling()
      }
    }
  } catch (e) {
    console.error('Błąd pobierania statusu backtestu:', e)
  }
}

const startBacktestPolling = () => {
  if (backtestPollTimer) clearInterval(backtestPollTimer)
  backtestPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/prediction/backtest/status`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        backtestStatus.value = data
        isRunningBacktest.value = Boolean(data.is_running)
        if (!isRunningBacktest.value) {
          stopBacktestPolling()
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 2500)
}

const triggerWalkForwardBacktest = async () => {
  if (isRunningBacktest.value) return
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/backtest/start`, {
      method: 'POST',
      headers: getHeaders(),
    })
    const data = await res.json()
    if (res.ok) {
      isRunningBacktest.value = true
      await loadBacktestStatus()
      startBacktestPolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errBacktestStart') }))
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}

const triggerModelRetrain = async () => {
  if (!confirm(t('admin.confirmRetrain'))) return
  modelTrainingMessage.value = null
  try {
    const res = await fetch(`${API_BASE_URL}/prediction/retrain`, {
      method: 'POST',
      headers: getHeaders(),
    })
    const data = await res.json()
    if (res.ok) {
      isTrainingModel.value = true
      modelTrainingMessage.value = data.message || t('admin.msgRetrainStarted')
      await loadModelInfo()
      startModelPolling()
    } else {
      alert(t('admin.errPrefix', { msg: data.detail || t('admin.errRetrainStart') }))
    }
  } catch (e: any) {
    alert(t('admin.errNetwork', { msg: e.message }))
  }
}
watch(reviewTab, () => {
  fetchReviews()
})

const totalPendingReviews = computed(
  () => athleteReviews.value.length + sessionReviews.value.length,
)

// --- KOMUNIKATOR: WIADOMOŚCI OD UŻYTKOWNIKÓW ---
const supportThreads = ref<any[]>([])
const supportUnreadCount = ref(0)
const isLoadingSupportThreads = ref(false)
const selectedSupportUserId = ref<string | null>(null)
const adminReplyText = ref('')
const isSendingAdminReply = ref(false)
const adminReplyError = ref('')

const activeSupportThread = computed(() =>
  supportThreads.value.find((t) => t.user_id === selectedSupportUserId.value) || null,
)

const loadSupportThreads = async (preferredUserId?: string) => {
  isLoadingSupportThreads.value = true
  try {
    const res = await fetch(`${API_BASE_URL}/support/admin/threads`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      supportThreads.value = data.threads || []
      supportUnreadCount.value = Number(data.unread_count || 0)
      if (preferredUserId && supportThreads.value.some((t) => t.user_id === preferredUserId)) {
        await selectSupportThread(preferredUserId)
      } else if (!selectedSupportUserId.value && supportThreads.value.length > 0) {
        selectedSupportUserId.value = supportThreads.value[0].user_id
      }
    }
  } catch (e) {
    console.warn('Błąd ładowania wątków wiadomości:', e)
  } finally {
    isLoadingSupportThreads.value = false
  }
}

const selectSupportThread = async (userId: string) => {
  selectedSupportUserId.value = userId
  adminReplyError.value = ''
  const target = supportThreads.value.find((t) => t.user_id === userId)
  if (target && target.unread_by_admin > 0) {
    try {
      await fetch(`${API_BASE_URL}/support/admin/threads/${encodeURIComponent(userId)}/read`, {
        method: 'POST',
        headers: getHeaders(),
      })
      supportUnreadCount.value = Math.max(0, supportUnreadCount.value - target.unread_by_admin)
      target.unread_by_admin = 0
    } catch {
      // ignore
    }
  }
}

const sendAdminSupportReply = async () => {
  const uid = selectedSupportUserId.value
  const clean = adminReplyText.value.trim()
  if (!uid || !clean || isSendingAdminReply.value) return
  isSendingAdminReply.value = true
  adminReplyError.value = ''
  try {
    const res = await fetch(`${API_BASE_URL}/support/admin/threads/${encodeURIComponent(uid)}/reply`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ message: clean }),
    })
    const data = await res.json()
    if (!res.ok) {
      adminReplyError.value = data.detail || t('admin.errSendReply')
      return
    }
    const idx = supportThreads.value.findIndex((t) => t.user_id === uid)
    if (idx !== -1) {
      supportThreads.value[idx] = data
    } else {
      supportThreads.value.unshift(data)
    }
    adminReplyText.value = ''
  } catch (e: any) {
    adminReplyError.value = e?.message || t('admin.errBackendConn')
  } finally {
    isSendingAdminReply.value = false
  }
}

watch(
  () => [route.query.tab, route.query.user_id],
  ([tab, uid]) => {
    if (tab === 'messages') {
      activeTab.value = 'messages'
      loadSupportThreads(typeof uid === 'string' ? uid : undefined)
    }
  },
)

watch(lastDraftEvent, (ev) => {
  if (ev && ev.event === 'notification') {
    loadSupportThreads(selectedSupportUserId.value || undefined)
  }
})

onMounted(() => {
  loadConfig()
  loadSeasonsSummary()
  loadScrapeStatus()
  loadWeatherStatus()
  loadNightlyStatus()
  loadPdfStatus()
  fetchReviews()
  loadModelInfo()
  loadBacktestStatus()
  loadHyperparams()
  loadAutotuneStatus()
  if (route.query.tab === 'messages') {
    activeTab.value = 'messages'
    loadSupportThreads(typeof route.query.user_id === 'string' ? route.query.user_id : undefined)
  } else {
    loadSupportThreads()
  }
})

onUnmounted(() => {
  stopScrapePolling()
  stopWeatherPolling()
  stopNightlyPolling()
  stopPdfPolling()
  stopModelPolling()
  stopBacktestPolling()
  stopAutotunePolling()
})
</script>

<template>
  <div class="admin-page">
    <SkiLoader v-if="isAthletesScraping">{{ t('admin.loaderAthletes') }}</SkiLoader>
    <SkiLoader v-if="isLoadingReviews">{{ t('admin.loaderReviews') }}</SkiLoader>
    <SkiLoader v-if="isApprovingAll">{{ t('admin.loaderApproveAll') }}</SkiLoader>
    <SkiLoader v-if="isRejectingAll">{{ t('admin.loaderRejectAll') }}</SkiLoader>

    <div
      v-if="showCategoryDropdown || showSeasonDropdown"
      class="dropdown-overlay"
      @click="closeDropdowns"
    ></div>

    <h2>{{ t('nav.admin') }}</h2>
    <div class="tabs">
      <button :class="{ active: activeTab === 'scraper' }" @click="activeTab = 'scraper'">
        <span>🏆</span> {{ t('admin.tabScraper') }}
      </button>
      <button :class="{ active: activeTab === 'trainings' }" @click="activeTab = 'trainings'">
        <span>📄</span> {{ t('admin.tabTrainings') }}
      </button>
      <button :class="{ active: activeTab === 'athletes' }" @click="activeTab = 'athletes'">
        <span>🎿</span> {{ t('admin.tabAthletes') }}
      </button>
      <button :class="{ active: activeTab === 'review' }" @click="activeTab = 'review'">
        <span>🛡️</span> {{ t('admin.tabReview') }}
        <span v-if="totalPendingReviews > 0" class="badge-counter">{{ totalPendingReviews }}</span>
      </button>
      <button :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">
        <span>👥</span> {{ t('admin.tabUsers') }}
      </button>
      <button :class="{ active: activeTab === 'neural' }" @click="activeTab = 'neural'">
        <span>🧠</span> {{ t('admin.tabNeural') }}
      </button>
      <button
        :class="{ active: activeTab === 'messages' }"
        @click="activeTab = 'messages'; loadSupportThreads(selectedSupportUserId || undefined)"
      >
        <span>💬</span> {{ t('admin.tabMessages') }}
        <span v-if="supportUnreadCount > 0" class="badge-counter">{{ supportUnreadCount }}</span>
      </button>
    </div>

    <!-- PRZYKLEJONY GLOBALNY PASEK AKTYWNEGO ZADANIA W TLE -->
    <div v-if="hasActiveBackgroundProcess" class="active-process-sticky-card">
      <div class="active-process-header">
        <div class="active-process-indicator">
          <span class="pulsing-live-dot"></span>
          <strong>
            {{
              isNightlyScraping
                ? t('admin.bgNightly')
                : isEnrichingWeather
                ? t('admin.bgWeather')
                : isPdfScraping
                ? t('admin.bgPdf')
                : scrapeStatus?.job_type === 'retry_missing'
                ? t('admin.bgRetry')
                : t('admin.bgScrape')
            }}
          </strong>
          <span v-if="isScraping && scrapeStatus?.current_season" class="active-process-sub">
            • {{ t('admin.seasonPrefix', { season: scrapeStatus.current_season }) }}
            <template v-if="scrapeStatus.current_category">({{ scrapeStatus.current_category }})</template>
          </span>
          <span v-else-if="isNightlyScraping && nightlyStatus?.current_season" class="active-process-sub">
            • {{ t('admin.seasonPrefix', { season: nightlyStatus.current_season }) }} ({{ nightlyStatus.current_category }})
          </span>
          <span v-else-if="isPdfScraping && pdfStatus?.total_files > 0" class="active-process-sub">
            • {{ t('admin.filesDone', { done: pdfStatus.files_done, total: pdfStatus.total_files, pct: pdfStatus.percent_complete }) }}
          </span>
        </div>
        <div class="active-process-actions">
          <button
            v-if="isScraping"
            type="button"
            @click="triggerStopScraper"
            class="btn-danger btn-compact-stop"
            :disabled="scrapeStatus?.stop_requested || isStoppingScraper"
          >
            <span>⏹️</span>
            {{ (scrapeStatus?.stop_requested || isStoppingScraper) ? t('admin.stopping') : t('admin.stopScraper').replace('⏹️ ', '') }}
          </button>
          <button
            v-else-if="isNightlyScraping"
            type="button"
            @click="triggerStopNightlyScrape"
            class="btn-danger btn-compact-stop"
            :disabled="nightlyStatus?.stop_requested || isStoppingNightly"
          >
            <span>⏹️</span>
            {{ (nightlyStatus?.stop_requested || isStoppingNightly) ? t('admin.stopping') : t('admin.stopNightly') }}
          </button>
          <button
            v-else-if="isEnrichingWeather"
            type="button"
            @click="triggerStopWeatherEnrichment"
            class="btn-danger btn-compact-stop"
            :disabled="weatherStatus?.status?.stop_requested || isStoppingWeather"
          >
            <span>⏹️</span>
            {{ (weatherStatus?.status?.stop_requested || isStoppingWeather) ? t('admin.stopping') : t('admin.stopWeather') }}
          </button>
          <button
            v-else-if="isPdfScraping"
            type="button"
            @click="triggerStopPdfScraper"
            class="btn-danger btn-compact-stop"
            :disabled="pdfStatus?.stop_requested || isStoppingPdf"
          >
            <span>⏹️</span>
            {{ (pdfStatus?.stop_requested || isStoppingPdf) ? t('admin.stopping') : t('admin.stopPdf') }}
          </button>
        </div>
      </div>

      <div class="active-process-bar-wrap">
        <div
          class="active-process-bar-fill"
          :style="{
            width: isNightlyScraping
              ? `${nightlyStatus?.percent_complete || 0}%`
              : isEnrichingWeather
              ? `${weatherStatus?.status?.percent_complete || 0}%`
              : isPdfScraping
              ? `${pdfStatus?.percent_complete || 0}%`
              : `${scrapeStatus?.percent_complete || 0}%`
          }"
        ></div>
      </div>

      <div class="active-process-stats">
        <span v-if="isScraping && scrapeStatus?.current_item" class="active-item-label">
          📍 {{ scrapeStatus.current_item }}
        </span>
        <span v-else-if="isNightlyScraping && nightlyStatus?.current_item" class="active-item-label">
          📍 {{ nightlyStatus.current_item }}
        </span>
        <span v-else-if="isEnrichingWeather && weatherStatus?.status?.current_item" class="active-item-label">
          🌤️ {{ weatherStatus.status.current_item }}
        </span>
        <span v-else-if="isPdfScraping && pdfStatus?.current_item" class="active-item-label">
          📄 {{ pdfStatus.current_item }}
        </span>

        <div class="active-stats-pills">
          <template v-if="isScraping && scrapeStatus">
            <span class="mini-stat-pill pill-green">
              {{ t('admin.pillNew', { count: (scrapeStatus.inserted ?? scrapeStatus.stats?.inserted ?? 0) + (scrapeStatus.recovered_missing ?? scrapeStatus.stats?.recovered_missing ?? 0) }) }}
            </span>
            <span class="mini-stat-pill pill-cyan">
              {{ t('admin.pillSkipped', { count: (scrapeStatus.skipped_complete ?? scrapeStatus.stats?.skipped_complete ?? 0) + (scrapeStatus.unchanged ?? scrapeStatus.stats?.unchanged ?? 0) }) }}
            </span>
            <span v-if="scrapeStatus.failed_429 > 0" class="mini-stat-pill pill-red">
              429: {{ scrapeStatus.failed_429 }}
            </span>
            <span class="mini-stat-pill pill-gray">
              ⏱️ {{ Math.floor((scrapeStatus.elapsed_seconds || 0) / 60) }}m {{ (scrapeStatus.elapsed_seconds || 0) % 60 }}s
            </span>
          </template>
          <template v-else-if="isNightlyScraping && nightlyStatus">
            <span class="mini-stat-pill pill-green">
              {{ t('admin.pillNew', { count: nightlyStatus.inserted_sessions || 0 }) }}
            </span>
            <span class="mini-stat-pill pill-blue">
              {{ t('admin.pillUpdated', { count: nightlyStatus.updated_sessions || 0 }) }}
            </span>
            <span class="mini-stat-pill pill-cyan">
              🌤️ {{ nightlyStatus.weather_attached_count || 0 }}
            </span>
            <span class="mini-stat-pill pill-gray">
              ⏱️ {{ Math.floor((nightlyStatus.elapsed_seconds || 0) / 60) }}m {{ (nightlyStatus.elapsed_seconds || 0) % 60 }}s
            </span>
          </template>
          <template v-else-if="isPdfScraping && pdfStatus">
            <span class="mini-stat-pill pill-green">
              {{ t('admin.pillQuarantine', { count: pdfStatus.saved_to_review || 0 }) }}
            </span>
            <span class="mini-stat-pill pill-cyan">
              {{ t('admin.pillUnchanged', { count: pdfStatus.unchanged_files || 0 }) }}
            </span>
            <span v-if="pdfStatus.failed_files > 0" class="mini-stat-pill pill-red">
              {{ t('admin.pillErrors', { count: pdfStatus.failed_files }) }}
            </span>
            <span class="mini-stat-pill pill-gray">
              ⏱️ {{ Math.floor((pdfStatus.elapsed_seconds || 0) / 60) }}m {{ (pdfStatus.elapsed_seconds || 0) % 60 }}s
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- TAB 1: SESJE & WYNIKI -->
    <div v-if="activeTab === 'scraper'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>{{ t('admin.scraperTitle') }}</h3>
            <p class="subtitle">{{ t('admin.scraperSub') }}</p>
          </div>
        </div>

        <div class="filter-row">
          <div class="filter-section">
            <label class="field-label">{{ t('admin.categoriesLabel') }}</label>
            <div class="custom-dropdown">
              <button
                class="dropdown-toggle"
                @click="showCategoryDropdown = !showCategoryDropdown; showSeasonDropdown = false"
              >
                <span>{{ selectedCategories.length > 0 ? t('admin.selectedCount', { count: selectedCategories.length }) : t('admin.chooseCategories') }}</span>
                <span class="arrow">▼</span>
              </button>
              <div v-if="showCategoryDropdown" class="dropdown-menu">
                <div class="dropdown-actions-row">
                  <button type="button" @click="selectAllCategories" class="btn-text-sm">{{ t('admin.selectAll') }}</button>
                  <button type="button" @click="clearCategories" class="btn-text-sm">{{ t('admin.clear') }}</button>
                </div>
                <label v-for="(_info, code) in availableCategories" :key="code" class="dropdown-item">
                  <input type="checkbox" :value="code" v-model="selectedCategories" />
                  <span>{{ formatCategory(String(code)) }} ({{ code }})</span>
                </label>
              </div>
            </div>
          </div>

          <div class="filter-section">
            <label class="field-label">{{ t('admin.seasonsLabel') }}</label>
            <div class="custom-dropdown">
              <button
                class="dropdown-toggle"
                @click="showSeasonDropdown = !showSeasonDropdown; showCategoryDropdown = false"
              >
                <span>{{ selectedSeasons.length > 0 ? t('admin.selectedCount', { count: selectedSeasons.length }) : t('admin.chooseSeasons') }}</span>
                <span class="arrow">▼</span>
              </button>
              <div v-if="showSeasonDropdown" class="dropdown-menu">
                <div class="dropdown-actions-row">
                  <button type="button" @click="selectAllSeasons" class="btn-text-sm">{{ t('admin.selectAll') }}</button>
                  <button type="button" @click="clearSeasons" class="btn-text-sm">{{ t('admin.clear') }}</button>
                </div>
                <label v-for="year in availableSeasons" :key="year" class="dropdown-item dropdown-season-item">
                  <div class="season-checkbox-label">
                    <input type="checkbox" :value="year" v-model="selectedSeasons" />
                    <span>{{ year }}</span>
                  </div>
                  <span
                    v-if="getSeasonStatus(year)"
                    class="season-pill-mini"
                    :class="`pill-${getSeasonStatus(year).status.toLowerCase()}`"
                  >
                    {{ getSeasonStatus(year).status === 'COMPLETE' ? t('admin.statusComplete') : (getSeasonStatus(year).status === 'PARTIAL' ? `⚠️ ${getSeasonStatus(year).completeness_pct}% (${getSeasonStatus(year).sessions_with_results}/${getSeasonStatus(year).total_sessions})` : t('admin.statusEmpty')) }}
                  </span>
                  <span v-else class="season-pill-mini pill-empty">{{ t('admin.statusNone') }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="filter-section">
            <label class="field-label">{{ t('admin.modeLabel') }}</label>
            <select v-model="scrapeMode" class="form-select">
              <option value="IND">{{ t('admin.modeInd') }}</option>
              <option value="TEAM" disabled>{{ t('admin.modeTeamSoon') }}</option>
            </select>
          </div>

          <div class="filter-section checkbox-filter-section">
            <label class="field-label">{{ t('admin.optLabel') }}</label>
            <label class="checkbox-control-box" :title="t('admin.onlyMissingTitle')">
              <input type="checkbox" v-model="onlyMissing" />
              <div class="checkbox-control-text">
                <strong>{{ t('admin.onlyMissing') }}</strong>
                <span class="help-desc">{{ t('admin.onlyMissingDesc') }}</span>
              </div>
            </label>
          </div>
        </div>

        <div class="action-footer scraper-action-footer">
          <button v-if="!isScraping" @click="runScraper" class="btn-primary" :disabled="isNightlyScraping">
            {{ t('admin.runScraper') }}
          </button>
          <button
            v-else
            type="button"
            @click="triggerStopScraper"
            class="btn-danger"
            :disabled="scrapeStatus?.stop_requested || isStoppingScraper"
          >
            <span>⏹️</span> {{ (scrapeStatus?.stop_requested || isStoppingScraper) ? t('admin.stopping') : t('admin.stopScraper').replace('⏹️ ', '') }}
          </button>
          <span
            class="status-pill-indicator"
            :class="isScraping ? 'pill-running' : 'pill-idle'"
          >
            <span class="status-dot"></span>
            {{ isScraping ? ((scrapeStatus?.stop_requested || isStoppingScraper) ? t('admin.stopping') : t('admin.statusRunningScrape')) : t('admin.statusReady') }}
          </span>
        </div>

        <div v-if="scrapeMessage && !isScraping" class="feedback-banner mt-3">
          <span>ℹ️</span> {{ scrapeMessage }}
        </div>

        <!-- PASEK POSTĘPU SCRAPERA NA ŻYWO -->
        <div
          v-if="scrapeStatus && (isScraping || scrapeStatus.total_combinations > 0 || scrapeStatus.races_total > 0)"
          class="live-progress-box mt-4"
        >
          <div class="progress-header">
            <div class="progress-title">
              <span>{{ scrapeStatus.job_type === 'retry_missing' ? t('admin.progressRetryTitle') : t('admin.progressScrapeTitle') }}</span>
              <strong v-if="scrapeStatus.current_season">
                {{ t('admin.seasonPrefix', { season: scrapeStatus.current_season }) }}
                <template v-if="scrapeStatus.current_category">({{ scrapeStatus.current_category }})</template>
              </strong>
              <span v-if="scrapeStatus.current_item && isScraping" class="current-item-text">
                • {{ scrapeStatus.current_item }}
              </span>
              <span v-else-if="!isScraping" class="current-item-text text-green font-semibold">
                • {{ scrapeStatus.current_item || t('admin.doneOk') }}
              </span>
            </div>
            <div class="progress-stat">
              <template v-if="scrapeStatus.job_type === 'retry_missing' && scrapeStatus.races_total > 0">
                {{ t('admin.sessionsSuffix', { done: scrapeStatus.races_done, total: scrapeStatus.races_total, pct: scrapeStatus.percent_complete }) }}
              </template>
              <template v-else-if="scrapeStatus.events_total > 0">
                <template v-if="isScraping">
                  {{ t('admin.comboEventProgress', { combo: scrapeStatus.combination_index, totalCombos: scrapeStatus.total_combinations, ev: scrapeStatus.events_done, totalEv: scrapeStatus.events_total, pct: scrapeStatus.percent_complete }) }}
                </template>
                <template v-else>
                  {{ t('admin.combosDone', { totalCombos: scrapeStatus.total_combinations, totalEv: scrapeStatus.events_total }) }}
                </template>
              </template>
              <template v-else>
                {{ t('admin.combosProgress', { combo: scrapeStatus.combination_index, totalCombos: scrapeStatus.total_combinations, pct: scrapeStatus.percent_complete }) }}
              </template>
            </div>
          </div>

          <div class="progress-bar-bg mb-3">
            <div
              class="progress-bar-fill"
              :class="isScraping ? 'fill-running' : 'fill-complete'"
              :style="{ width: `${scrapeStatus.percent_complete || 0}%` }"
            ></div>
          </div>

          <div class="live-metrics-grid">
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.metricNewUpdated') }}</span>
              <strong class="metric-value text-green">
                {{ (scrapeStatus.inserted ?? scrapeStatus.stats?.inserted ?? 0) + (scrapeStatus.recovered_missing ?? scrapeStatus.stats?.recovered_missing ?? 0) }}
                <span v-if="isScraping && (scrapeStatus.inserted || 0) === 0 && (scrapeStatus.races_done || 0) > 0" class="text-xs text-muted font-normal">
                  {{ t('admin.inBuffer', { count: scrapeStatus.races_done }) }}
                </span>
              </strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.metricSkippedComplete') }}</span>
              <strong class="metric-value text-cyan">
                {{ (scrapeStatus.skipped_complete ?? scrapeStatus.stats?.skipped_complete ?? 0) + (scrapeStatus.unchanged ?? scrapeStatus.stats?.unchanged ?? 0) }}
              </strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.tabReview') }}</span>
              <strong class="metric-value text-blue">{{ scrapeStatus.sent_to_review ?? scrapeStatus.stats?.sent_to_review ?? 0 }}</strong>
            </div>
            <div class="live-metric-card" v-if="(scrapeStatus.failed_429 ?? scrapeStatus.stats?.failed_429 ?? 0) > 0">
              <span class="metric-label">{{ t('admin.metricErrors429') }}</span>
              <strong class="metric-value text-red">🚦 {{ scrapeStatus.failed_429 ?? scrapeStatus.stats?.failed_429 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.metricDuration') }}</span>
              <strong class="metric-value">
                {{ Math.floor((scrapeStatus.elapsed_seconds || 0) / 60) }}m {{ (scrapeStatus.elapsed_seconds || 0) % 60 }}s
              </strong>
            </div>
          </div>
        </div>

        <div v-if="scrapeResult && !isScraping" class="results-box">
          <h4>{{ t('admin.reportTitle') }}</h4>
          <ul class="stats-list">
            <li>{{ t('admin.repCombos') }} <span>{{ scrapeResult.combinations_processed || scrapeStatus?.total_combinations }}</span></li>
            <li>{{ t('admin.repInserted') }} <span class="text-green">{{ scrapeResult.inserted || 0 }}</span></li>
            <li>{{ t('admin.repRecovered') }} <span class="text-cyan">{{ scrapeResult.recovered_missing || 0 }}</span></li>
            <li>{{ t('admin.repSkipped') }} <span class="text-cyan">{{ (scrapeResult.skipped_complete || 0) + (scrapeResult.unchanged || 0) }}</span></li>
            <li>{{ t('admin.repReview') }} <span class="text-yellow">{{ scrapeResult.sent_to_review || 0 }}</span></li>
            <li v-if="scrapeResult.failed_429 > 0">{{ t('admin.repErrors429') }} <span class="text-red">{{ scrapeResult.failed_429 }}</span></li>
          </ul>
          <div class="nn-retrain-hint-inline">
            <span>🧠 <strong>{{ t('admin.aiHintPrefix') }}</strong> {{ t('admin.aiHintText') }}</span>
            <button type="button" class="btn-link-neural" @click="activeTab = 'neural'">
              {{ t('admin.aiHintBtn') }}
            </button>
          </div>
        </div>

        <!-- PODSUMOWANIE BAZY DANYCH: SEZONY I KOMPLETNOŚĆ -->
        <div class="seasons-database-section">
          <div class="seasons-header-row">
            <div>
              <h4 class="seasons-summary-title">{{ t('admin.dbStateTitle') }}</h4>
              <p class="seasons-summary-subtitle">
                {{ t('admin.dbStateSub') }}
              </p>
            </div>
            <div class="seasons-header-actions">
              <button
                v-if="isScraping"
                type="button"
                class="btn-danger btn-header-stop"
                @click="triggerStopScraper"
                :disabled="scrapeStatus?.stop_requested || isStoppingScraper"
                :title="t('admin.stopTaskTitle')"
              >
                ⏹️ {{ (scrapeStatus?.stop_requested || isStoppingScraper) ? t('admin.stopping') : t('admin.stopTask') }}
              </button>
              <button
                v-if="totalFailed429AcrossDb > 0"
                type="button"
                class="btn-resume-429"
                @click="triggerRetryMissing(null, true)"
                :disabled="isScraping"
                :title="t('admin.resume429Title')"
              >
                {{ t('admin.resume429', { count: totalFailed429AcrossDb }) }}
              </button>
              <button
                v-if="totalMissingAcrossDb > 0"
                type="button"
                class="btn-fetch-missing-header"
                @click="triggerRetryMissing(null, false)"
                :disabled="isScraping"
                :title="t('admin.fetchMissingAllTitle')"
              >
                {{ t('admin.fetchMissingAll', { count: totalMissingAcrossDb }) }}
              </button>
              <button
                type="button"
                class="btn-refresh-summary"
                @click="loadSeasonsSummary"
                :disabled="isLoadingSeasonsSummary"
              >
                <span :class="{ spinning: isLoadingSeasonsSummary }">🔄</span> {{ t('admin.refreshDb').replace('🔄 ', '') }}
              </button>
            </div>
          </div>

          <div v-if="isLoadingSeasonsSummary" class="seasons-loading">
            {{ t('admin.loadingSeasons') }}
          </div>
          <div v-else-if="seasonsSummary.length === 0" class="seasons-empty">
            {{ t('admin.emptySeasons') }}
          </div>
          <div v-else class="seasons-grid">
            <div
              v-for="s in seasonsSummary"
              :key="s.season"
              class="season-card"
              :class="`border-${s.status.toLowerCase()}`"
            >
              <div class="season-card-header">
                <span class="season-year">{{ t('admin.seasonPrefix', { season: s.season }) }}</span>
                <span class="season-status-badge" :class="`badge-${s.status.toLowerCase()}`">
                  {{ s.status === 'COMPLETE' ? t('admin.statusComplete') : (s.status === 'PARTIAL' ? t('admin.statusPartial') : t('admin.statusEmpty')) }}
                </span>
              </div>

              <div class="season-progress">
                <div class="progress-info">
                  <span>{{ t('admin.seasonCompleteness') }}</span>
                  <strong>{{ s.completeness_pct }}%</strong>
                </div>
                <div class="progress-bar-bg">
                  <div
                    class="progress-bar-fill"
                    :class="`fill-${s.status.toLowerCase()}`"
                    :style="{ width: `${s.completeness_pct}%` }"
                  ></div>
                </div>
                <div class="progress-stats-breakdown">
                  <span class="stat-pill-sm pill-results" :title="t('admin.playedTitle')">
                    {{ t('admin.playedCount', { count: s.sessions_with_results }) }}
                  </span>
                  <span
                    v-if="s.cancelled_sessions > 0"
                    class="stat-pill-sm pill-cancelled"
                    :title="t('admin.cancelledTitle')"
                  >
                    {{ t('admin.cancelledCount', { count: s.cancelled_sessions }) }}
                  </span>
                  <span
                    v-if="s.failed_429_sessions > 0"
                    class="stat-pill-sm pill-429"
                    :title="t('admin.err429Title')"
                  >
                    {{ t('admin.err429Count', { count: s.failed_429_sessions }) }}
                  </span>
                  <span
                    v-if="s.missing_sessions > 0"
                    class="stat-pill-sm pill-missing"
                    :title="t('admin.missingTitle')"
                  >
                    {{ t('admin.missingCount', { count: s.missing_sessions }) }}
                  </span>
                </div>
              </div>

              <div class="season-details">
                <div class="season-detail-row">
                  <span class="detail-label-inline">{{ t('admin.hillsPlaces') }}</span>
                  <span class="detail-value">{{ t('admin.locationsCount', { count: s.unique_places_count }) }}</span>
                </div>
                <div class="season-categories-list">
                  <span class="detail-label-inline">{{ t('admin.competitionsLabel') }}</span>
                  <div class="cat-tags">
                    <span
                      v-for="cat in s.categories"
                      :key="cat.category_code"
                      class="cat-tag"
                      :title="t('admin.catTooltip', { code: cat.category_code, done: cat.sessions_with_results, total: cat.total_sessions })"
                    >
                      {{ formatCategory(cat.category_code) }}
                      <small>({{ cat.sessions_with_results }}/{{ cat.total_sessions }})</small>
                    </span>
                  </div>
                </div>
              </div>

              <div class="season-card-footer">
                <button
                  v-if="s.missing_sessions > 0"
                  type="button"
                  class="btn-fetch-missing"
                  @click="scrapeMissingSeason(s.season)"
                  :disabled="isScraping"
                  :title="t('admin.fetchMissingSeasonTitle')"
                >
                  {{ t('admin.fetchMissingSeason', { count: s.missing_sessions }) }}
                </button>
                <div class="footer-btn-group">
                  <button
                    type="button"
                    class="btn-view-details"
                    @click="openMissingDetails(s.season)"
                    :title="t('admin.detailsTitle')"
                  >
                    {{ t('admin.detailsCount', { count: (s.cancelled_sessions || 0) + (s.missing_sessions || 0) }) }}
                  </button>
                  <button
                    type="button"
                    class="btn-quick-select"
                    @click="quickSelectSeason(s.season)"
                    :title="t('admin.chooseBtnTitle')"
                  >
                    {{ t('admin.chooseBtn') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: SZCZEGÓŁY BRAKUJĄCYCH I ODWOŁANYCH ZAWODÓW -->
      <div v-if="showMissingModal" class="modal-overlay" @click.self="closeMissingDetails">
        <div class="modal-card">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">{{ t('admin.modalTitle', { season: selectedMissingSeason }) }}</h3>
              <p class="modal-subtitle">{{ t('admin.modalSub') }}</p>
            </div>
            <button type="button" class="btn-modal-close" @click="closeMissingDetails">✕</button>
          </div>

          <div v-if="isLoadingMissing" class="modal-loading">
            <span class="spinning">🔄</span> {{ t('admin.modalLoading') }}
          </div>

          <div v-else-if="missingSeasonData" class="modal-body">
            <!-- Pigułki podsumowania -->
            <div class="missing-summary-banner">
              <div class="summary-pill pill-success">
                <span>{{ t('admin.sumPlayed') }}</span>
                <strong>{{ getSeasonStatus(selectedMissingSeason)?.sessions_with_results || 0 }}</strong>
              </div>
              <div class="summary-pill pill-cancelled">
                <span>{{ t('admin.sumCancelled') }}</span>
                <strong>{{ missingSeasonData.cancelled_count }}</strong>
              </div>
              <div class="summary-pill pill-missing">
                <span>{{ t('admin.sumMissing') }}</span>
                <strong>{{ missingSeasonData.missing_count }}</strong>
              </div>
              <div v-if="missingSeasonData.failed_429_count > 0" class="summary-pill pill-429">
                <span>{{ t('admin.sum429') }}</span>
                <strong>{{ missingSeasonData.failed_429_count }}</strong>
              </div>
            </div>

            <!-- SEKCJA: BRAKUJĄCE W BAZIE -->
            <div v-if="missingSeasonData.missing_sessions && missingSeasonData.missing_sessions.length > 0" class="missing-section">
              <div class="section-title-row">
                <h4 class="text-missing">{{ t('admin.secMissingTitle') }}</h4>
                <button
                  type="button"
                  class="btn-primary-sm"
                  @click="scrapeMissingSeason(selectedMissingSeason)"
                  :disabled="isScraping"
                >
                  {{ t('admin.fetchTheseMissing') }}
                </button>
              </div>
              <div class="table-responsive">
                <table class="missing-table">
                  <thead>
                    <tr>
                      <th>{{ t('admin.thDate') }}</th>
                      <th>{{ t('admin.thPlace') }}</th>
                      <th>{{ t('admin.thCompName') }}</th>
                      <th>{{ t('admin.thCategory') }}</th>
                      <th>{{ t('admin.thHill') }}</th>
                      <th>{{ t('admin.thStatus') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in missingSeasonData.missing_sessions" :key="item.id">
                      <td>{{ item.date }} <small v-if="item.time">{{ item.time }}</small></td>
                      <td><strong>{{ item.place }}</strong></td>
                      <td>{{ item.title }}</td>
                      <td><span class="badge-cat">{{ item.category_code }}</span></td>
                      <td>{{ item.hill_size ? `${item.hill_unit}${item.hill_size}` : '—' }}</td>
                      <td>
                        <span :class="item.status === 'FAILED_429' ? 'badge-status-429' : 'badge-status-missing'">
                          {{ item.status === 'FAILED_429' ? '🚦 ' : '⚠️ ' }}{{ item.status_label }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- SEKCJA: ODWOŁANE PRZEZ JURY -->
            <div v-if="missingSeasonData.cancelled_sessions && missingSeasonData.cancelled_sessions.length > 0" class="missing-section">
              <h4 class="text-cancelled">{{ t('admin.secCancelledTitle') }}</h4>
              <p class="section-desc">
                {{ t('admin.secCancelledDesc') }}
              </p>
              <div class="table-responsive">
                <table class="missing-table">
                  <thead>
                    <tr>
                      <th>{{ t('admin.thDate') }}</th>
                      <th>{{ t('admin.thPlace') }}</th>
                      <th>{{ t('admin.thCompName') }}</th>
                      <th>{{ t('admin.thCategory') }}</th>
                      <th>{{ t('admin.thHill') }}</th>
                      <th>{{ t('admin.thStatus') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in missingSeasonData.cancelled_sessions" :key="item.id">
                      <td>{{ item.date }} <small v-if="item.time">{{ item.time }}</small></td>
                      <td><strong>{{ item.place }}</strong></td>
                      <td>{{ item.title }}</td>
                      <td><span class="badge-cat">{{ item.category_code }}</span></td>
                      <td>{{ item.hill_size ? `${item.hill_unit}${item.hill_size}` : '—' }}</td>
                      <td><span class="badge-status-cancelled">💨 {{ item.status_label }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="missingSeasonData.total_unresolved === 0" class="empty-state-card">
              <span class="text-2xl">🎉</span>
              <strong>{{ t('admin.completeSeasonTitle') }}</strong>
              <p>{{ t('admin.completeSeasonDesc', { season: selectedMissingSeason }) }}</p>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="closeMissingDetails">{{ t('admin.closeBtn') }}</button>
          </div>
        </div>
      </div>

      <!-- KARTA: NOCNE POBIERANIE CAŁEJ BAZY (BATCH SCRAPE) -->
      <div class="admin-card mt-6">
        <div class="admin-card-header flex-between">
          <div>
            <h3>{{ t('admin.nightlyTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.nightlySub') }}
            </p>
          </div>
          <div class="header-badges">
            <span
              class="status-pill-indicator"
              :class="isNightlyScraping ? 'pill-running' : 'pill-idle'"
            >
              <span class="status-dot"></span>
              {{ isNightlyScraping ? t('admin.nightlyRunning') : t('admin.nightlyIdle') }}
            </span>
          </div>
        </div>

        <div class="info-alert-banner">
          <span class="alert-icon">⏱️</span>
          <div>
            <strong>{{ t('admin.nightlyWarnTitle') }}</strong>
            <p>
              {{ t('admin.nightlyWarnDesc') }}
            </p>
          </div>
        </div>

        <div v-if="nightlyMessage" class="feedback-banner">
          <span>ℹ️</span> {{ nightlyMessage }}
        </div>

        <!-- Parametry i akcje -->
        <div class="range-config-box">
          <div class="range-sliders-block">
            <div class="range-header-row">
              <label class="field-label">{{ t('admin.seasonRangeLabel') }}</label>
              <span class="range-badge font-mono">
                {{ Math.min(nightlySeasonFrom, nightlySeasonTo) }} – {{ Math.max(nightlySeasonFrom, nightlySeasonTo) }}
                {{ t('admin.yearsSuffix', { count: Math.abs(nightlySeasonTo - nightlySeasonFrom) + 1 }) }}
              </span>
            </div>
            <div class="dual-sliders-grid">
              <div class="slider-item">
                <span>{{ t('admin.fromSeason') }} <strong class="font-mono">{{ nightlySeasonFrom }}</strong></span>
                <input type="range" min="2000" :max="maxSelectableSeason" v-model.number="nightlySeasonFrom" :disabled="isNightlyScraping" class="styled-slider" />
              </div>
              <div class="slider-item">
                <span>{{ t('admin.toSeason') }} <strong class="font-mono">{{ nightlySeasonTo }}</strong></span>
                <input type="range" min="2000" :max="maxSelectableSeason" v-model.number="nightlySeasonTo" :disabled="isNightlyScraping" class="styled-slider" />
              </div>
            </div>
            <div class="range-presets-row">
              <button type="button" class="btn-preset-chip" :disabled="isNightlyScraping" @click="applyNightlyPreset(maxSelectableSeason - 1, maxSelectableSeason, ['WC', 'GP', 'COC'])">
                {{ t('admin.presetLast2') }}
              </button>
              <button type="button" class="btn-preset-chip" :disabled="isNightlyScraping" @click="applyNightlyPreset(2020, maxSelectableSeason, ['WC', 'GP', 'COC', 'FC'])">
                2020–{{ maxSelectableSeason }}
              </button>
              <button type="button" class="btn-preset-chip" :disabled="isNightlyScraping" @click="applyNightlyPreset(2000, maxSelectableSeason, ['WC', 'GP', 'COC', 'FC', 'OWG', 'WSC', 'SFWC'])">
                {{ t('admin.presetFullHistory', { max: maxSelectableSeason }) }}
              </button>
            </div>
          </div>

          <div class="categories-pills-block">
            <label class="field-label">{{ t('admin.catTypesLabel') }}</label>
            <div class="cat-pills-wrap">
              <button
                v-for="cat in allScraperCatOptions"
                :key="cat.code"
                type="button"
                class="cat-pill-toggle"
                :class="{ active: nightlyCategories.includes(cat.code) }"
                :disabled="isNightlyScraping"
                @click="toggleNightlyCategory(cat.code)"
              >
                {{ cat.code === 'FESA' ? 'FESA' : `${formatCategory(cat.code)} (${cat.code})` }}
              </button>
            </div>
          </div>
        </div>

        <div class="batch-controls-row">
          <div class="control-group">
            <label class="field-label">{{ t('admin.delayLabel') }}</label>
            <div class="input-with-hint">
              <input
                type="number"
                step="0.1"
                min="0.8"
                max="10.0"
                v-model.number="nightlyDelaySeconds"
                :disabled="isNightlyScraping"
                class="form-input-number"
              />
              <span class="hint-text">{{ t('admin.delayHint') }}</span>
            </div>
          </div>

          <div class="control-actions">
            <button
              v-if="!isNightlyScraping"
              type="button"
              @click="triggerStartNightlyScrape"
              class="btn-primary btn-nightly-start"
              :disabled="isScraping"
            >
              <span>🌙</span> {{ t('admin.nightlyStartBtn') }}
            </button>
            <button
              v-else
              type="button"
              @click="triggerStopNightlyScrape"
              class="btn-danger btn-nightly-stop"
              :disabled="nightlyStatus?.stop_requested || isStoppingNightly"
            >
              <span>⏹️</span> {{ (nightlyStatus?.stop_requested || isStoppingNightly) ? t('admin.stopping') : t('admin.nightlyStopBtn') }}
            </button>
            <button
              type="button"
              @click="loadNightlyStatus"
              :disabled="isLoadingNightlyStatus"
              class="btn-refresh-summary"
            >
              <span :class="{ spinning: isLoadingNightlyStatus }">🔄</span> {{ t('admin.refreshStateBtn') }}
            </button>
          </div>
        </div>

        <!-- Postęp i statystyki live -->
        <div v-if="nightlyStatus && (nightlyStatus.is_running || nightlyStatus.total_combinations > 0)" class="live-progress-box mt-4">
          <div class="progress-header">
            <div class="progress-title">
              <span>{{ t('admin.nightlyProgressTitle') }}</span>
              <strong v-if="nightlyStatus.current_season">
                {{ t('admin.seasonPrefix', { season: nightlyStatus.current_season }) }} ({{ nightlyStatus.current_category }})
              </strong>
              <strong v-else>{{ t('admin.waiting') }}</strong>
              <span v-if="nightlyStatus.current_item && isNightlyScraping" class="current-item-text">
                • {{ nightlyStatus.current_item }}
              </span>
              <span v-else-if="!isNightlyScraping && nightlyStatus.last_message" class="current-item-text text-green font-semibold">
                • {{ nightlyStatus.last_message }}
              </span>
            </div>
            <div class="progress-stat">
              {{ t('admin.combosProgress', { combo: nightlyStatus.progress_index, totalCombos: nightlyStatus.total_combinations, pct: nightlyStatus.percent_complete }) }}
            </div>
          </div>

          <div class="progress-bar-bg mb-3">
            <div
              class="progress-bar-fill"
              :class="isNightlyScraping ? 'fill-running' : 'fill-complete'"
              :style="{ width: `${nightlyStatus.percent_complete}%` }"
            ></div>
          </div>

          <div class="live-metrics-grid">
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.nightlySavedNew') }}</span>
              <strong class="metric-value text-green">{{ nightlyStatus.inserted_sessions ?? 0 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.nightlyUpdated') }}</span>
              <strong class="metric-value text-blue">{{ nightlyStatus.updated_sessions ?? 0 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.nightlyUnchanged') }}</span>
              <strong class="metric-value">{{ nightlyStatus.unchanged_sessions ?? 0 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.nightlyWeatherAttached') }}</span>
              <strong class="metric-value text-cyan">🌤️ {{ nightlyStatus.weather_attached_count ?? 0 }}</strong>
            </div>
            <div class="live-metric-card" v-if="nightlyStatus.failed_combinations > 0">
              <span class="metric-label">{{ t('admin.weatherApiErrors') }}</span>
              <strong class="metric-value text-red">{{ nightlyStatus.failed_combinations }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.metricDuration') }}</span>
              <strong class="metric-value">
                {{ Math.floor(nightlyStatus.elapsed_seconds / 60) }}m {{ nightlyStatus.elapsed_seconds % 60 }}s
              </strong>
            </div>
          </div>
        </div>
      </div>

      <!-- KARTA: WZBOGACANIE BAZY DANYMI POGODOWYMI (OPEN-METEO ARCHIVE) -->
      <div class="admin-card mt-6">
        <div class="admin-card-header flex-between">
          <div>
            <h3>{{ t('admin.weatherTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.weatherSub') }}
            </p>
          </div>
          <div class="header-badges">
            <span
              class="status-pill-indicator"
              :class="isEnrichingWeather ? 'pill-running' : 'pill-idle'"
            >
              <span class="status-dot"></span>
              {{ isEnrichingWeather ? t('admin.weatherRunning') : t('admin.statusReady') }}
            </span>
          </div>
        </div>

        <!-- Wskaźniki pokrycia baz danych -->
        <div class="weather-coverage-section">
          <div class="coverage-grid">
            <div class="coverage-card">
              <div class="coverage-card-header">
                <span class="coverage-db-name">{{ t('admin.dbDevName') }}</span>
                <span class="coverage-badge" :class="weatherStatus?.dev?.coverage_pct >= 90 ? 'badge-complete' : 'badge-partial'">
                  {{ weatherStatus?.dev?.coverage_pct || 0 }}%
                </span>
              </div>
              <div class="coverage-numbers">
                <strong>{{ weatherStatus?.dev?.with_weather || 0 }}</strong>
                <span>{{ t('admin.dbSessionsHaveWeather', { total: weatherStatus?.dev?.total_sessions || 0 }) }}</span>
              </div>
              <div class="progress-bar-bg">
                <div
                  class="progress-bar-fill fill-complete"
                  :style="{ width: `${weatherStatus?.dev?.coverage_pct || 0}%` }"
                ></div>
              </div>
            </div>

            <div class="coverage-card">
              <div class="coverage-card-header">
                <span class="coverage-db-name">{{ t('admin.dbTestName') }}</span>
                <span class="coverage-badge" :class="weatherStatus?.test?.coverage_pct >= 90 ? 'badge-complete' : 'badge-partial'">
                  {{ weatherStatus?.test?.coverage_pct || 0 }}%
                </span>
              </div>
              <div class="coverage-numbers">
                <strong>{{ weatherStatus?.test?.with_weather || 0 }}</strong>
                <span>{{ t('admin.dbSessionsHaveWeather', { total: weatherStatus?.test?.total_sessions || 0 }) }}</span>
              </div>
              <div class="progress-bar-bg">
                <div
                  class="progress-bar-fill fill-complete"
                  :style="{ width: `${weatherStatus?.test?.coverage_pct || 0}%` }"
                ></div>
              </div>
            </div>

            <div class="coverage-card prod-note-card">
              <div class="coverage-card-header">
                <span class="coverage-db-name">{{ t('admin.dbProdName') }}</span>
                <span class="coverage-badge badge-prod">Auto-Enrich</span>
              </div>
              <p class="prod-note-text">
                {{ t('admin.dbProdNote') }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="weatherMessage" class="feedback-banner mt-3">
          <span>ℹ️</span> {{ weatherMessage }}
        </div>

        <!-- Sterowanie enricherem -->
        <div class="enricher-controls-row mt-4">
          <div class="control-group">
            <label class="field-label">{{ t('admin.weatherTargetLabel') }}</label>
            <select v-model="weatherTarget" :disabled="isEnrichingWeather" class="form-select">
              <option value="all">{{ t('admin.targetAll') }}</option>
              <option value="dev">{{ t('admin.targetDev') }}</option>
              <option value="test">{{ t('admin.targetTest') }}</option>
            </select>
          </div>

          <div class="control-group checkbox-group">
            <label class="custom-checkbox-label">
              <input type="checkbox" v-model="weatherForce" :disabled="isEnrichingWeather" />
              <span>{{ t('admin.weatherForceLabel') }}</span>
            </label>
          </div>

          <div class="control-actions">
            <button
              v-if="!isEnrichingWeather"
              type="button"
              @click="triggerStartWeatherEnrichment"
              class="btn-primary"
            >
              <span>🌤️</span> {{ t('admin.weatherStartBtn') }}
            </button>
            <button
              v-else
              type="button"
              @click="triggerStopWeatherEnrichment"
              class="btn-danger"
            >
              <span>⏹️</span> {{ t('admin.weatherStopBtn') }}
            </button>
            <button
              type="button"
              @click="loadWeatherStatus"
              :disabled="isLoadingWeatherStatus"
              class="btn-refresh-summary"
            >
              <span :class="{ spinning: isLoadingWeatherStatus }">🔄</span> {{ t('admin.refreshStateBtn') }}
            </button>
          </div>
        </div>

        <!-- Live postęp enrichera -->
        <div v-if="weatherStatus?.status && weatherStatus.status.is_running" class="live-progress-box mt-4">
          <div class="progress-header">
            <div class="progress-title">
              <span>{{ t('admin.weatherProgressDb') }} <strong>{{ weatherStatus.status.db_name }}</strong>:</span>
              <span v-if="weatherStatus.status.current_item" class="current-item-text">
                {{ weatherStatus.status.current_item }}
              </span>
            </div>
            <div class="progress-stat">
              {{ t('admin.sessionsSuffix', { done: weatherStatus.status.processed_sessions, total: weatherStatus.status.total_sessions, pct: weatherStatus.status.percent_complete }) }}
            </div>
          </div>

          <div class="progress-bar-bg mb-3">
            <div
              class="progress-bar-fill fill-running"
              :style="{ width: `${weatherStatus.status.percent_complete}%` }"
            ></div>
          </div>

          <div class="live-metrics-grid">
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.weatherUpdatedSessions') }}</span>
              <strong class="metric-value text-green">{{ weatherStatus.status.updated_sessions }}</strong>
            </div>
            <div class="live-metric-card" v-if="weatherStatus.status.failed_sessions > 0">
              <span class="metric-label">{{ t('admin.weatherApiErrors') }}</span>
              <strong class="metric-value text-red">{{ weatherStatus.status.failed_sessions }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: TRENINGI & PDF -->
    <div v-if="activeTab === 'trainings'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>{{ t('admin.pdfTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.pdfSub') }}
            </p>
          </div>
        </div>

        <div class="range-config-box">
          <div class="range-sliders-block">
            <div class="range-header-row">
              <label class="field-label">{{ t('admin.pdfRangeLabel') }}</label>
              <span class="range-badge font-mono">
                {{ Math.min(pdfSeasonFrom, pdfSeasonTo) }} – {{ Math.max(pdfSeasonFrom, pdfSeasonTo) }}
              </span>
            </div>
            <div class="dual-sliders-grid">
              <div class="slider-item">
                <span>{{ t('admin.fromSeason') }} <strong class="font-mono">{{ pdfSeasonFrom }}</strong></span>
                <input type="range" min="2000" :max="maxSelectableSeason" v-model.number="pdfSeasonFrom" :disabled="isPdfScraping" class="styled-slider" />
              </div>
              <div class="slider-item">
                <span>{{ t('admin.toSeason') }} <strong class="font-mono">{{ pdfSeasonTo }}</strong></span>
                <input type="range" min="2000" :max="maxSelectableSeason" v-model.number="pdfSeasonTo" :disabled="isPdfScraping" class="styled-slider" />
              </div>
            </div>
          </div>

          <div class="categories-pills-block">
            <label class="field-label">{{ t('admin.pdfCatTypesLabel') }}</label>
            <div class="cat-pills-wrap">
              <button
                v-for="cat in allScraperCatOptions"
                :key="cat.code"
                type="button"
                class="cat-pill-toggle"
                :class="{ active: pdfCategories.includes(cat.code) }"
                :disabled="isPdfScraping"
                @click="togglePdfCategory(cat.code)"
              >
                {{ cat.code === 'FESA' ? 'FESA' : `${formatCategory(cat.code)} (${cat.code})` }}
              </button>
            </div>
          </div>

          <label class="checkbox-control-card mt-2">
            <input type="checkbox" v-model="pdfForceReprocess" :disabled="isPdfScraping" />
            <div class="checkbox-control-text">
              <strong>{{ t('admin.pdfForceTitle') }}</strong>
              <span class="help-desc">{{ t('admin.pdfForceDesc') }}</span>
            </div>
          </label>
        </div>

        <div class="action-footer">
          <button v-if="!isPdfScraping" @click="runPdfScraper" class="btn-primary">
            <span>📄</span> {{ t('admin.pdfStartBtn') }}
          </button>
          <button
            v-else
            type="button"
            @click="triggerStopPdfScraper"
            class="btn-danger"
            :disabled="pdfStatus?.stop_requested || isStoppingPdf"
          >
            <span>⏹️</span> {{ (pdfStatus?.stop_requested || isStoppingPdf) ? t('admin.stopping') : t('admin.pdfStopBtn') }}
          </button>
          <button type="button" @click="loadPdfStatus" class="btn-refresh-summary">
            <span>🔄</span> {{ t('admin.refreshStateBtn') }}
          </button>
        </div>

        <div v-if="pdfMessage" class="info-alert mt-4">
          ℹ️ {{ pdfMessage }}
        </div>

        <!-- Postęp live dla ekstrakcji PDF -->
        <div v-if="pdfStatus && (pdfStatus.is_running || pdfStatus.total_files > 0)" class="live-progress-box mt-4">
          <div class="progress-header">
            <div class="progress-title">
              <span>{{ t('admin.pdfProgressTitle') }}</span>
              <span v-if="pdfStatus.current_item && isPdfScraping" class="current-item-text">
                • {{ pdfStatus.current_item }}
              </span>
              <span v-else-if="!isPdfScraping && pdfStatus.last_message" class="current-item-text text-green font-semibold">
                • {{ pdfStatus.last_message }}
              </span>
            </div>
            <div class="progress-stat font-mono">
              {{ t('admin.filesDone', { done: pdfStatus.files_done, total: pdfStatus.total_files, pct: pdfStatus.percent_complete }) }}
            </div>
          </div>

          <div class="progress-bar-bg mb-3">
            <div
              class="progress-bar-fill"
              :class="isPdfScraping ? 'fill-running' : 'fill-complete'"
              :style="{ width: `${pdfStatus.percent_complete || 0}%` }"
            ></div>
          </div>

          <div class="live-metrics-grid">
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.pdfBatchSessions') }}</span>
              <strong class="metric-value text-blue font-mono">{{ pdfStatus.total_sessions ?? 0 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.pdfToQuarantine') }}</span>
              <strong class="metric-value text-yellow font-mono">{{ pdfStatus.saved_to_review ?? 0 }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.nightlyUnchanged') }}</span>
              <strong class="metric-value font-mono">{{ pdfStatus.unchanged_files ?? 0 }}</strong>
            </div>
            <div class="live-metric-card" v-if="(pdfStatus.failed_files ?? 0) > 0">
              <span class="metric-label">{{ t('admin.pdfDownloadErrors') }}</span>
              <strong class="metric-value text-red font-mono">{{ pdfStatus.failed_files }}</strong>
            </div>
            <div class="live-metric-card">
              <span class="metric-label">{{ t('admin.metricDuration') }}</span>
              <strong class="metric-value font-mono">
                {{ Math.floor((pdfStatus.elapsed_seconds || 0) / 60) }}m {{ (pdfStatus.elapsed_seconds || 0) % 60 }}s
              </strong>
            </div>
          </div>
        </div>

        <div v-if="pdfScrapeResult" class="results-box">
          <div v-if="pdfScrapeResult.message" class="info-alert">
            ℹ️ {{ pdfScrapeResult.message }}
          </div>

          <div class="summary-stats-grid">
            <div class="summary-stat-card">
              <span class="stat-number text-yellow">{{ pdfScrapeResult.saved_to_review ?? 0 }}</span>
              <span class="stat-label">{{ t('admin.pdfRepQuarantine') }}</span>
            </div>
            <div class="summary-stat-card">
              <span class="stat-number text-muted">{{ pdfScrapeResult.unchanged_files ?? 0 }}</span>
              <span class="stat-label">{{ t('admin.pdfRepUnchanged') }}</span>
            </div>
            <div class="summary-stat-card">
              <span class="stat-number text-blue">{{ pdfScrapeResult.processed_sessions_in_batch ?? 0 }}</span>
              <span class="stat-label">{{ t('admin.pdfRepProcessed') }}</span>
            </div>
          </div>

          <!-- BŁĘDY / RAPORT POBIERANIA (np. ReadTimeout / 502 z FIS) -->
          <div v-if="(pdfScrapeResult.errors || pdfScrapeResult.report)?.length > 0" class="report-error-card">
            <h4>{{ t('admin.pdfRepErrorsTitle', { count: (pdfScrapeResult.errors || pdfScrapeResult.report).length }) }}</h4>
            <div v-for="(item, idx) in (pdfScrapeResult.errors || pdfScrapeResult.report)" :key="idx" class="report-error-item">
              <div class="report-error-header">
                <span class="badge-codex">Codex {{ item.codex }}</span>
                <span v-if="item.race_id" class="badge-codex">Race {{ item.race_id }}</span>
                <span class="badge-type">{{ item.type }}</span>
              </div>
              <pre class="report-error-msg">{{ item.error }}</pre>
            </div>
          </div>

          <div v-if="pdfScrapeResult.distinct_doc_types_in_batch?.length" class="doc-types-box">
            <p class="field-label">{{ t('admin.pdfDocTypesLabel') }}</p>
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
            <h3>{{ t('admin.dbgTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.dbgSub') }}
            </p>
          </div>
        </div>

        <div class="debug-inputs-row">
          <div class="filter-section flex-3">
            <label class="field-label">{{ t('admin.dbgUrlLabel') }}</label>
            <input
              type="text"
              v-model="checkerForm.url"
              placeholder="https://..."
              class="form-input"
            />
          </div>
          <div class="filter-section flex-1">
            <label class="field-label">{{ t('admin.dbgCodexLabel') }}</label>
            <input
              type="text"
              v-model="checkerForm.codex"
              :placeholder="t('admin.dbgCodexPh')"
              class="form-input"
            />
          </div>
          <div class="filter-section flex-1">
            <label class="field-label">Race ID:</label>
            <input
              type="text"
              v-model="checkerForm.race_id"
              :placeholder="t('admin.dbgRacePh')"
              class="form-input"
            />
          </div>
        </div>

        <div class="action-footer">
          <button @click="runPdfChecker" :disabled="isCheckingPdf" class="btn-primary btn-secondary">
            <span>🔍</span> {{ isCheckingPdf ? t('admin.dbgScanning') : t('admin.dbgAnalyzeBtn') }}
          </button>
        </div>

        <div v-if="checkerResult" class="results-box debug-console">
          <h4 class="console-title">{{ t('admin.dbgLogTitle') }}</h4>
          <ul class="console-logs">
            <li v-for="(log, i) in checkerResult.debug_log" :key="i">&gt;&gt; {{ log }}</li>
          </ul>

          <div v-if="checkerResult.parsed_results" class="parsed-results-box">
            <h4 class="text-green">{{ t('admin.dbgFoundAthletes', { count: checkerResult.athletes_found }) }}</h4>
            <div
              v-for="ath in checkerResult.parsed_results"
              :key="ath.name"
              class="parsed-ath-item"
            >
              <div class="ath-name">{{ ath.name }}</div>
              <div class="ath-floats">{{ t('admin.dbgNumbers') }} {{ ath.floats_found }}</div>
              <div class="ath-raw">Chunk: {{ ath.raw_text }}</div>
            </div>
          </div>

          <div v-if="checkerResult.error" class="error-banner">
            <strong>{{ t('admin.dbgErrorPrefix') }}</strong> {{ checkerResult.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: BAZA SKOCZKÓW -->
    <div v-if="activeTab === 'athletes'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header">
          <div>
            <h3>{{ t('admin.athletesTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.athletesSub') }}
            </p>
          </div>
        </div>

        <div class="options-container">
          <label class="toggle-label">
            <input v-model="onlyPriceUpdate" type="checkbox" />
            <span>{{ t('admin.athletesQuickPrice') }}</span>
          </label>
        </div>

        <div class="action-footer">
          <button @click="refreshAthletes" :disabled="isAthletesScraping" class="btn-primary">
            {{ t('admin.refreshAthletes') }}
          </button>
        </div>

        <div v-if="athletesScrapeResult" class="results-box">
          <h4>{{ t('admin.athletesRepTitle') }}</h4>
          <ul class="stats-list">
            <li>{{ t('admin.athletesUnchanged') }} <span>{{ athletesScrapeResult.unchanged }}</span></li>
            <li>{{ t('admin.athletesNew') }} <span class="text-blue">{{ athletesScrapeResult.new_to_review }}</span></li>
            <li>{{ t('admin.athletesModified') }} <span class="text-yellow">{{ athletesScrapeResult.modified_to_review }}</span></li>
            <li>{{ t('admin.athletesDeleted') }} <span class="text-red">{{ athletesScrapeResult.deleted_to_review }}</span></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- TAB 4: KWARANTANNA -->
    <div v-if="activeTab === 'review'" class="tab-content">
      <div class="review-sub-tabs">
        <button :class="{ active: reviewTab === 'athletes' }" @click="reviewTab = 'athletes'">
          {{ t('admin.revSubAthletes', { count: athleteReviews.length }) }}
        </button>
        <button :class="{ active: reviewTab === 'sessions' }" @click="reviewTab = 'sessions'">
          {{ t('admin.revSubSessions', { count: sessionReviews.length }) }}
        </button>
      </div>

      <div v-if="reviewTab === 'athletes'">
        <div v-if="athleteReviews.length > 0">
          <div class="actions-header">
            <p>
              {{ t('admin.toVerifyCount', { count: athleteReviews.length }) }}
            </p>
            <button
              @click="handleApproveAllAthletes"
              class="btn-primary"
              style="background: #22c55e"
            >
              {{ t('admin.approveAllBtn') }}
            </button>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>{{ t('admin.thFisCode') }}</th>
                <th>{{ t('admin.thAthlete') }}</th>
                <th>{{ t('admin.thStatus') }}</th>
                <th style="text-align: right">{{ t('admin.thAction') }}</th>
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
                      :title="t('admin.showDiffTitle')"
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
        <p v-else class="empty-state">{{ t('admin.emptyRevAthletes') }}</p>
      </div>

      <div v-if="reviewTab === 'sessions'">
        <div v-if="sessionReviews.length > 0">
          <div class="actions-header">
            <p>
              {{ t('admin.toVerifyCount', { count: sessionReviews.length }) }}
            </p>
            <div style="display: flex; gap: 10px">
              <button
                @click="handleApproveAllSessions"
                class="btn-primary"
                style="background: #22c55e"
              >
                {{ t('admin.approveAllSessionsBtn') }}
              </button>
              <button
                @click="handleRejectAllSessions"
                class="btn-primary"
                style="background: #ef4444"
              >
                {{ t('admin.rejectAllBtn') }}
              </button>
            </div>
          </div>

          <table class="review-table">
            <thead>
              <tr>
                <th>Codex</th>
                <th>{{ t('admin.thContest') }}</th>
                <th>{{ t('admin.thPlaceSeasonDate') }}</th>
                <th style="text-align: right">{{ t('admin.thActions') }}</th>
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
                      :title="t('admin.showDiffTitle')"
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
        <p v-else class="empty-state">{{ t('admin.emptyRevSessions') }}</p>
      </div>
    </div>

    <!-- TAB 5: ZARZĄDZANIE UŻYTKOWNIKAMI I ROLAMI -->
    <div v-if="activeTab === 'users'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header flex-between">
          <div>
            <h3>{{ t('admin.usersTitle') }}</h3>
            <p class="subtitle">{{ t('admin.usersSub') }}</p>
          </div>
          <button class="btn btn-secondary" @click="loadUsers" :disabled="isLoadingUsers">
            {{ t('admin.refreshList') }}
          </button>
        </div>

        <div v-if="userSuccessMessage" class="alert-success-box">
          ✅ {{ userSuccessMessage }}
        </div>
        <div v-if="userErrorMessage" class="alert-error-box">
          ❌ {{ userErrorMessage }}
        </div>

        <!-- PASEK WYSZUKIWANIA I FILTROWANIA UŻYTKOWNIKÓW -->
        <div class="users-toolbar">
          <div class="users-search-box">
            <span class="search-icon">🔍</span>
            <input
              v-model="userSearchQuery"
              type="text"
              class="form-input users-search-input"
              :placeholder="t('admin.usersSearchPh')"
            />
            <button
              v-if="userSearchQuery"
              type="button"
              class="btn-clear-search"
              @click="userSearchQuery = ''"
              :title="t('admin.clearSearchTitle')"
            >
              ✕
            </button>
          </div>

          <div class="users-filter-group">
            <div class="filter-role-pills">
              <button
                type="button"
                class="role-filter-pill"
                :class="{ active: userRoleFilter === 'ALL' }"
                @click="userRoleFilter = 'ALL'"
              >
                {{ t('admin.filterAll', { count: userRoleCounts.ALL }) }}
              </button>
              <button
                type="button"
                class="role-filter-pill pill-admin"
                :class="{ active: userRoleFilter === 'ADMIN' }"
                @click="userRoleFilter = 'ADMIN'"
              >
                {{ t('admin.filterAdmin', { count: userRoleCounts.ADMIN }) }}
              </button>
              <button
                type="button"
                class="role-filter-pill pill-pro"
                :class="{ active: userRoleFilter === 'USER_PRO' }"
                @click="userRoleFilter = 'USER_PRO'"
              >
                {{ t('admin.filterPro', { count: userRoleCounts.USER_PRO }) }}
              </button>
              <button
                type="button"
                class="role-filter-pill pill-user"
                :class="{ active: userRoleFilter === 'USER' }"
                @click="userRoleFilter = 'USER'"
              >
                {{ t('admin.filterFree', { count: userRoleCounts.USER }) }}
              </button>
            </div>

            <button
              v-if="userSearchQuery || userRoleFilter !== 'ALL'"
              type="button"
              class="btn-reset-filters"
              @click="clearUserFilters"
            >
              {{ t('admin.clearFilters') }}
            </button>
          </div>

          <div class="esm-season-bar">
            <label for="esmSeasonLeagueInput" class="esm-season-label">{{ t('admin.esmLeagueLabel') }}</label>
            <input
              id="esmSeasonLeagueInput"
              v-model="esmSeasonLeagueId"
              type="text"
              class="form-input esm-season-input"
              :placeholder="t('admin.esmLeaguePh')"
            />
          </div>
        </div>

        <div v-if="isLoadingUsers" class="loading-state">
          {{ t('admin.usersLoading') }}
        </div>

        <div v-else-if="usersList.length > 0">
          <div v-if="filteredUsersList.length > 0">
            <div class="table-summary-bar">
              <span>{{ t('admin.usersFoundSummary', { shown: filteredUsersList.length, total: usersList.length }) }}</span>
            </div>

            <div class="table-responsive desktop-users-only">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>{{ t('admin.thUserEmail') }}</th>
                    <th>{{ t('admin.thReg') }}</th>
                    <th>{{ t('admin.thLastLogin') }}</th>
                    <th>{{ t('admin.thRole') }}</th>
                    <th>{{ t('admin.thChangeRole') }}</th>
                    <th>{{ t('admin.thEsm') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="u in filteredUsersList" :key="u.id">
                    <td>
                      <div class="user-row-cell">
                        <img v-if="u.picture" :src="u.picture" class="user-row-avatar" alt="Avatar" />
                        <span v-else class="user-row-fallback">👤</span>
                        <div class="umc-name-col">
                          <strong>{{ u.name }}</strong>
                          <code class="admin-email-code">{{ u.email }}</code>
                        </div>
                      </div>
                    </td>
                    <td>{{ u.created_at ? new Date(u.created_at).toLocaleDateString(bcp47Locale) : '-' }}</td>
                    <td>{{ u.last_login ? new Date(u.last_login).toLocaleString(bcp47Locale) : '-' }}</td>
                    <td>
                      <span
                        class="role-badge"
                        :class="{
                          'role-admin': u.role === 'ADMIN',
                          'role-pro': u.role === 'USER_PRO',
                          'role-user': u.role !== 'ADMIN' && u.role !== 'USER_PRO',
                        }"
                      >
                        {{ u.role === 'ADMIN' ? 'ADMIN' : (u.role === 'USER_PRO' ? 'PRO' : 'FREE') }}
                      </span>
                    </td>
                    <td>
                      <select
                        class="form-select role-select"
                        :value="u.role === 'USER_LITE' ? 'USER' : u.role"
                        :disabled="updatingUserId === u.id"
                        @change="changeUserRole(u, ($event.target as HTMLSelectElement).value)"
                      >
                        <option value="USER">FREE</option>
                        <option value="USER_PRO">PRO</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td>
                      <div class="admin-esm-cell">
                        <div v-if="u.esm_summary?.connected" class="admin-esm-status">
                          <span class="esm-linked-pill">✅ {{ u.esm_summary.team_name || t('admin.esmSynced') }}</span>
                        </div>
                        <div class="admin-esm-controls">
                          <input
                            v-model="esmTeamDrafts[u.id]"
                            type="text"
                            class="form-input esm-tid-input"
                            :placeholder="t('admin.esmTidPh')"
                            :disabled="savingEsmUserId === u.id"
                          />
                          <button
                            type="button"
                            class="btn-esm-save"
                            :disabled="savingEsmUserId === u.id || !(esmTeamDrafts[u.id] || '').trim()"
                            @click="assignUserEsmTeam(u)"
                            :title="t('admin.esmAssignTitle')"
                          >
                            {{ savingEsmUserId === u.id ? '⏳' : (u.esm_summary?.connected ? '🔄' : '🔗') }}
                          </button>
                          <button
                            v-if="u.esm_summary?.connected"
                            type="button"
                            class="btn-esm-unlink"
                            :disabled="savingEsmUserId === u.id"
                            @click="unlinkUserEsmTeam(u)"
                            :title="t('admin.esmUnlinkTitle')"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- KARTY MOBILNE UŻYTKOWNIKÓW (<= 768px) -->
            <div class="users-mobile-cards mobile-users-only">
              <div v-for="u in filteredUsersList" :key="'mu_' + u.id" class="user-m-card">
                <div class="umc-top">
                  <div class="user-row-cell">
                    <img v-if="u.picture" :src="u.picture" class="user-row-avatar" alt="Avatar" />
                    <span v-else class="user-row-fallback">👤</span>
                    <div class="umc-name-col">
                      <strong>{{ u.name }}</strong>
                      <code class="umc-email">{{ u.email }}</code>
                    </div>
                  </div>
                  <span
                    class="role-badge"
                    :class="{
                      'role-admin': u.role === 'ADMIN',
                      'role-pro': u.role === 'USER_PRO',
                      'role-user': u.role !== 'ADMIN' && u.role !== 'USER_PRO',
                    }"
                  >
                    {{ u.role === 'ADMIN' ? 'ADMIN' : (u.role === 'USER_PRO' ? 'PRO' : 'FREE') }}
                  </span>
                </div>

                <div class="umc-field">
                  <label>{{ t('admin.rolePermLabel') }}</label>
                  <select
                    class="form-select role-select"
                    :value="u.role === 'USER_LITE' ? 'USER' : u.role"
                    :disabled="updatingUserId === u.id"
                    @change="changeUserRole(u, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="USER">FREE</option>
                    <option value="USER_PRO">PRO</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                <div class="umc-field">
                  <label>
                    esmManager Team ID
                    <span v-if="u.esm_summary?.connected" class="esm-linked-pill" style="margin-left: 6px;">
                      ✅ {{ u.esm_summary.team_name || 'OK' }}
                    </span>
                  </label>
                  <div class="admin-esm-controls">
                    <input
                      v-model="esmTeamDrafts[u.id]"
                      type="text"
                      class="form-input esm-tid-input"
                      :placeholder="t('admin.esmTidPh')"
                      :disabled="savingEsmUserId === u.id"
                    />
                    <button
                      type="button"
                      class="btn-esm-save"
                      :disabled="savingEsmUserId === u.id || !(esmTeamDrafts[u.id] || '').trim()"
                      @click="assignUserEsmTeam(u)"
                    >
                      {{ savingEsmUserId === u.id ? '⏳' : (u.esm_summary?.connected ? '🔄' : '🔗') }}
                    </button>
                    <button
                      v-if="u.esm_summary?.connected"
                      type="button"
                      class="btn-esm-unlink"
                      :disabled="savingEsmUserId === u.id"
                      @click="unlinkUserEsmTeam(u)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-filter-state">
            <p>{{ t('admin.emptyUsersFiltered') }}</p>
            <button type="button" class="btn btn-secondary" @click="clearUserFilters">
              {{ t('admin.resetFiltersBtn') }}
            </button>
          </div>
        </div>
        <p v-else class="empty-state">{{ t('admin.emptyUsersDb') }}</p>
      </div>
    </div>

    <!-- TAB 6: SIEĆ NEURONOWA -->
    <div v-if="activeTab === 'neural'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header flex-between">
          <div>
            <h3>{{ t('admin.nnTitle') }}</h3>
            <p class="subtitle">
              {{ t('admin.nnSub', { features: modelInfo?.metadata?.input_features || 25 }) }}
            </p>
          </div>
          <div class="header-badges">
            <span
              class="status-pill-indicator"
              :class="isTrainingModel ? 'pill-running' : 'pill-idle'"
            >
              <span class="status-dot"></span>
              {{ isTrainingModel ? t('admin.nnStatusTraining') : (modelInfo?.is_trained ? t('admin.nnStatusTrained') : t('admin.nnStatusUntrained')) }}
            </span>
          </div>
        </div>

        <!-- Sugestia przetrenowania po aktualizacji wyników -->
        <div class="nn-suggestion-banner">
          <span>💡</span>
          <div>
            <strong>{{ t('admin.nnTipTitle') }}</strong> {{ t('admin.nnTipDesc') }}
          </div>
        </div>

        <!-- Ostrzeżenie gdy brak kompatybilnego wytrenowanego modelu -->
        <div v-if="modelInfo && !modelInfo.is_trained && !isTrainingModel" class="nn-warning-banner">
          <span>⚠️</span>
          <div>
            <strong>{{ t('admin.nnWarnTitle') }}</strong> {{ t('admin.nnWarnDesc') }}
          </div>
        </div>

        <!-- Live pasek postępu treningu sieci neuronowej -->
        <div v-if="isTrainingModel" class="live-progress-box mb-4">
          <div class="progress-header">
            <div class="progress-title">
              <span>{{ t('admin.nnProgTitle') }}</span>
              <strong>{{ modelInfo?.training_status?.message || t('admin.nnProgDefaultMsg') }}</strong>
            </div>
            <div class="progress-stat">
              <template v-if="modelInfo?.training_status?.current_epoch">
                {{ t('admin.nnEpochProg', { epoch: modelInfo.training_status.current_epoch, total: modelInfo.training_status.total_epochs || 40 }) }}
              </template>
              {{ modelInfo?.training_status?.percent_complete ?? 0 }}%
            </div>
          </div>

          <div class="progress-bar-bg mb-3">
            <div
              class="progress-bar-fill fill-running"
              :style="{ width: `${Math.max(5, modelInfo?.training_status?.percent_complete ?? 10)}%` }"
            ></div>
          </div>
          <p class="nn-training-subhint">{{ t('admin.nnProgSubhint') }}</p>
        </div>

        <!-- Stan modelu -->
        <div v-if="modelInfo" class="nn-model-status">
          <h4>{{ t('admin.nnMetricsTitle') }}</h4>
          <div class="nn-metrics-grid">
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnStatusLabel') }}</span>
              <strong class="metric-value" :class="modelInfo.is_trained ? 'text-green' : 'text-red'">
                {{ modelInfo.is_trained ? t('admin.nnStatusReady') : `❌ ${t('admin.nnStatusUntrained')}` }}
              </strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.trained_at">
              <span class="metric-label">{{ t('admin.nnLastTrain') }}</span>
              <strong class="metric-value">{{ new Date(modelInfo.metadata.trained_at).toLocaleString(bcp47Locale) }}</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.sample_count">
              <span class="metric-label">{{ t('admin.nnSamples') }}</span>
              <strong class="metric-value">{{ modelInfo.metadata.sample_count.toLocaleString(bcp47Locale) }}</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.mae_distance_meters_approx != null">
              <span class="metric-label">{{ t('admin.nnMaeDist') }}</span>
              <strong class="metric-value">~{{ modelInfo.metadata.mae_distance_meters_approx }} m</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.val_loss != null">
              <span class="metric-label">{{ t('admin.nnValLoss') }}</span>
              <strong class="metric-value">{{ modelInfo.metadata.val_loss.toFixed(5) }}</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.input_features">
              <span class="metric-label">{{ t('admin.nnInputFeatures') }}</span>
              <strong class="metric-value">{{ modelInfo.metadata.input_features }}</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.tracked_athletes_count">
              <span class="metric-label">{{ t('admin.nnTrackedAthletes') }}</span>
              <strong class="metric-value">{{ modelInfo.tracked_athletes_count }}</strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.epochs != null">
              <span class="metric-label">{{ t('admin.nnEpochs') }}</span>
              <strong class="metric-value">
                {{ modelInfo.metadata.epochs }}<template v-if="modelInfo.metadata?.best_epoch"> (best: {{ modelInfo.metadata.best_epoch }})</template>
              </strong>
            </div>
            <div class="nn-metric-card" v-if="modelInfo.metadata?.training_seasons_range">
              <span class="metric-label">{{ t('admin.nnSeasonWindow') }}</span>
              <strong class="metric-value font-mono">{{ modelInfo.metadata.training_seasons_range }}</strong>
            </div>
          </div>
        </div>

        <div v-else-if="isLoadingModelInfo" class="nn-loading">
          <span class="spinning">🔄</span> {{ t('admin.nnLoading') }}
        </div>

        <!-- Komunikat wyniku -->
        <div
          v-if="modelTrainingMessage"
          class="nn-message"
          :class="modelTrainingMessage.startsWith('✅') ? 'nn-message-success' : (modelTrainingMessage.startsWith('❌') ? 'nn-message-error' : 'nn-message-info')"
        >
          {{ modelTrainingMessage }}
        </div>

        <!-- Akcja -->
        <div class="action-footer nn-action-footer">
          <button
            @click="triggerModelRetrain"
            :disabled="isTrainingModel || isAutoTuning"
            class="btn-primary"
          >
            <span>🧠</span> {{ isTrainingModel ? t('admin.nnTraining') : t('admin.nnTrainBtn') }}
          </button>
          <button
            type="button"
            @click="triggerWalkForwardBacktest"
            :disabled="isRunningBacktest || isTrainingModel || isAutoTuning"
            class="btn-secondary"
          >
            <span>📊</span> {{ isRunningBacktest ? t('admin.nnBacktestRunning') : t('admin.nnBacktestBtn') }}
          </button>
          <button
            v-if="!isAutoTuning"
            type="button"
            @click="triggerAutoTune"
            :disabled="isRunningBacktest || isTrainingModel"
            class="btn-secondary"
          >
            <span>🎯</span> {{ t('admin.nnAutotuneBtn') }}
          </button>
          <button
            v-else
            type="button"
            @click="triggerStopAutoTune"
            :disabled="isStoppingAutotune || autotuneStatus?.stop_requested"
            class="btn-danger"
          >
            <span>⏹️</span> {{ isStoppingAutotune ? t('admin.stopping') : t('admin.nnAutotuneStopBtn') }}
          </button>
          <button
            type="button"
            @click="() => { loadModelInfo(); loadBacktestStatus(); loadHyperparams(); }"
            :disabled="isLoadingModelInfo"
            class="btn-refresh-summary"
          >
            <span :class="{ spinning: isLoadingModelInfo }">🔄</span> {{ t('admin.nnRefreshBtn') }}
          </button>
        </div>

        <!-- Sekcja MongoDB Hyperparams & Auto-Tuner -->
        <div class="nn-backtest-section mt-6">
          <div class="nn-backtest-header flex-between" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
            <div>
              <h4>{{ t('admin.nnHyperTitle') }}</h4>
              <p class="subtitle">
                {{ t('admin.nnHyperSub') }}
              </p>
            </div>
            <button
              v-if="hyperparamsBundle?.source === 'autotuned'"
              type="button"
              @click="resetHyperparams"
              :disabled="isAutoTuning || isTrainingModel"
              class="btn-refresh-summary"
            >
              <span>↩️</span> {{ t('admin.nnResetHyperBtn') }}
            </button>
          </div>

          <div v-if="isAutoTuning" class="live-progress-box mt-3 mb-4">
            <div class="progress-header">
              <div class="progress-title">
                <span>{{ t('admin.nnAutotuneProgTitle', { done: autotuneStatus?.trials_done || 0, total: autotuneStatus?.trials_total || 16 }) }}</span>
                <strong>{{ autotuneStatus?.message || t('admin.nnAutotuneDefaultMsg') }}</strong>
              </div>
              <div class="progress-stat font-mono">
                {{ autotuneStatus?.percent_complete ?? 0 }}% • {{ autotuneStatus?.elapsed_seconds ?? 0 }}s
              </div>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill fill-running" :style="{ width: `${Math.max(5, autotuneStatus?.percent_complete ?? 5)}%` }"></div>
            </div>
          </div>

          <div v-if="autotuneStatus?.results" class="nn-message mb-3" :class="autotuneStatus.results.improved ? 'nn-message-success' : 'nn-message-info'">
            {{ autotuneStatus.message || (autotuneStatus.results.improved ? t('admin.nnAutotuneImproved', { label: autotuneStatus.results.best_candidate_label }) : t('admin.nnAutotuneKept')) }}
          </div>

          <div v-if="hyperparamsBundle?.params" class="nn-metrics-grid mb-3">
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnConfigSource') }}</span>
              <strong class="metric-value" :class="hyperparamsBundle.source === 'autotuned' ? 'text-green' : ''">
                {{ hyperparamsBundle.source === 'autotuned' ? t('admin.nnSourceTuned') : t('admin.nnSourceDefault') }}
              </strong>
            </div>
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnHalfLifeCompQua') }}</span>
              <strong class="metric-value font-mono">{{ hyperparamsBundle.params.comp_half_life_days }}d / {{ hyperparamsBundle.params.qua_half_life_days }}d</strong>
            </div>
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnHalfLifeTrialTrain') }}</span>
              <strong class="metric-value font-mono">{{ hyperparamsBundle.params.trial_half_life_days }}d / {{ hyperparamsBundle.params.training_half_life_days }}d</strong>
            </div>
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnWeekendWeights') }}</span>
              <strong class="metric-value font-mono">{{ hyperparamsBundle.params.weekend_qua_weight }} / {{ hyperparamsBundle.params.weekend_trial_weight }} / {{ hyperparamsBundle.params.weekend_training_weight }}</strong>
            </div>
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnLossBlend') }}</span>
              <strong class="metric-value font-mono">{{ Math.round(hyperparamsBundle.params.loss_quality_weight * 100) }}% / {{ Math.round(hyperparamsBundle.params.points_blend_quality_weight * 100) }}%</strong>
            </div>
            <div class="nn-metric-card">
              <span class="metric-label">{{ t('admin.nnLrDropoutWin') }}</span>
              <strong class="metric-value font-mono">{{ hyperparamsBundle.params.lr }} / {{ hyperparamsBundle.params.dropout }} / {{ hyperparamsBundle.params.rolling_window_seasons }} {{ t('admin.nnYearsUnit') }}</strong>
            </div>
          </div>
        </div>

        <!-- Walk-Forward Backtest (sezon po sezonie bez wycieku przyszłości) -->
        <div class="nn-backtest-section mt-6">
          <div class="nn-backtest-header">
            <div>
              <h4>{{ t('admin.nnBtTitle') }}</h4>
              <p class="subtitle">
                {{ t('admin.nnBtSub') }}
              </p>
            </div>
          </div>

          <div v-if="isRunningBacktest" class="live-progress-box mb-4">
            <div class="progress-header">
              <div class="progress-title">
                <span>{{ t('admin.nnBtProgTitle') }}</span>
                <strong>{{ backtestStatus?.message || t('admin.nnBtDefaultMsg') }}</strong>
              </div>
              <div class="progress-stat font-mono">{{ backtestStatus?.percent_complete ?? 0 }}%</div>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill fill-running" :style="{ width: `${Math.max(5, backtestStatus?.percent_complete ?? 5)}%` }"></div>
            </div>
          </div>

          <div v-if="backtestStatus?.error" class="nn-message nn-message-error">
            {{ t('admin.nnBtErrorPrefix', { error: backtestStatus.error }) }}
          </div>

          <div v-if="backtestStatus?.results?.overall" class="nn-backtest-results">
            <div class="nn-metrics-grid mb-4">
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtComps') }}</span>
                <strong class="metric-value font-mono">{{ backtestStatus.results.overall.competitions_evaluated }}</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtTop30') }}</span>
                <strong class="metric-value text-green font-mono">{{ backtestStatus.results.overall.top30_hit_pct }}%</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtTop10') }}</span>
                <strong class="metric-value text-blue font-mono">{{ backtestStatus.results.overall.top10_hit_pct }}%</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtPodium') }}</span>
                <strong class="metric-value text-yellow font-mono">{{ backtestStatus.results.overall.podium_hit_pct }}%</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtWinnerTop3') }}</span>
                <strong class="metric-value font-mono">{{ backtestStatus.results.overall.winner_top3_pct }}%</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtRankMae') }}</span>
                <strong class="metric-value font-mono">{{ backtestStatus.results.overall.avg_rank_mae }} {{ t('admin.nnBtPosUnit') }}</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtSpearman') }}</span>
                <strong class="metric-value font-mono">{{ backtestStatus.results.overall.spearman_corr }}</strong>
              </div>
              <div class="nn-metric-card">
                <span class="metric-label">{{ t('admin.nnBtDistMae') }}</span>
                <strong class="metric-value font-mono">~{{ backtestStatus.results.overall.dist_mae_m }} m</strong>
              </div>
            </div>

            <div class="table-responsive" v-if="backtestStatus.results.folds?.length">
              <table class="backtest-table">
                <thead>
                  <tr>
                    <th>{{ t('admin.thBtSeason') }}</th>
                    <th>{{ t('admin.thBtSamples') }}</th>
                    <th>{{ t('admin.thBtComps') }}</th>
                    <th>{{ t('admin.thBtTop30') }}</th>
                    <th>{{ t('admin.thBtTop10') }}</th>
                    <th>{{ t('admin.thBtPodium') }}</th>
                    <th>{{ t('admin.thBtWinTop3') }}</th>
                    <th>{{ t('admin.thBtRankMae') }}</th>
                    <th>{{ t('admin.thBtSpearman') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="fold in backtestStatus.results.folds" :key="fold.season">
                    <td class="font-mono"><strong>{{ fold.season }}</strong></td>
                    <td class="font-mono">{{ fold.train_samples.toLocaleString(bcp47Locale) }}</td>
                    <td class="font-mono">{{ fold.competitions_evaluated }}</td>
                    <td class="font-mono text-green">{{ fold.top30_hit_pct }}%</td>
                    <td class="font-mono text-blue">{{ fold.top10_hit_pct }}%</td>
                    <td class="font-mono">{{ fold.podium_hit_pct }}%</td>
                    <td class="font-mono">{{ fold.winner_top3_pct }}%</td>
                    <td class="font-mono">{{ fold.avg_rank_mae }}</td>
                    <td class="font-mono">{{ fold.spearman_corr }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 7: KOMUNIKATOR Z UŻYTKOWNIKAMI -->
    <div v-if="activeTab === 'messages'" class="tab-content">
      <div class="admin-card">
        <div class="admin-card-header flex-between">
          <div>
            <h3>{{ t('admin.msgTitle') }}</h3>
            <p class="subtitle">{{ t('admin.msgSub') }}</p>
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="isLoadingSupportThreads"
            @click="loadSupportThreads(selectedSupportUserId || undefined)"
          >
            {{ t('admin.msgRefresh') }}
          </button>
        </div>

        <div v-if="supportThreads.length === 0" class="empty-state">
          {{ t('admin.msgEmpty') }}
        </div>

        <div v-else class="admin-support-layout">
          <aside class="support-threads-sidebar">
            <button
              v-for="th in supportThreads"
              :key="th.user_id"
              type="button"
              class="support-thread-item"
              :class="{ active: selectedSupportUserId === th.user_id, unread: th.unread_by_admin > 0 }"
              @click="selectSupportThread(th.user_id)"
            >
              <div class="sti-top">
                <strong>{{ th.user_name }}</strong>
                <span v-if="th.unread_by_admin > 0" class="badge-counter">{{ th.unread_by_admin }}</span>
              </div>
              <span class="sti-email">{{ th.user_email }}</span>
              <span class="sti-preview">{{ th.last_message_preview }}</span>
            </button>
          </aside>

          <section class="support-thread-view" v-if="activeSupportThread">
            <div class="stv-header">
              <div>
                <strong>{{ activeSupportThread.user_name }}</strong>
                <span class="stv-email">{{ activeSupportThread.user_email }}</span>
              </div>
            </div>

            <div class="stv-messages">
              <div
                v-for="m in activeSupportThread.messages"
                :key="m.id"
                class="stv-bubble"
                :class="m.sender_role === 'ADMIN' ? 'bubble-adm' : 'bubble-usr'"
              >
                <div class="stv-meta">
                  <strong>{{ m.sender_role === 'ADMIN' ? t('profile.msgSenderAdmin') : activeSupportThread.user_name }}</strong>
                  <span>{{ m.created_at ? new Date(m.created_at).toLocaleString(bcp47Locale, { dateStyle: 'short', timeStyle: 'short' }) : '' }}</span>
                </div>
                <div v-if="m.context" class="stv-ctx">{{ m.context }}</div>
                <p class="stv-text">{{ m.text }}</p>
              </div>
            </div>

            <form @submit.prevent="sendAdminSupportReply" class="stv-reply-form">
              <textarea
                v-model="adminReplyText"
                rows="3"
                maxlength="1500"
                class="form-input"
                :placeholder="t('admin.msgPh')"
              ></textarea>
              <div v-if="adminReplyError" class="empty-state" style="color: #b91c1c; padding: 6px 0;">
                {{ adminReplyError }}
              </div>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="isSendingAdminReply || !adminReplyText.trim()"
              >
                {{ isSendingAdminReply ? t('admin.msgSending') : t('admin.msgSendBtn') }}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  padding: 24px 30px;
  max-width: 1180px;
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
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e2e8f0;
}
.tabs button {
  padding: 9px 11px;
  border: none;
  background: none;
  font-size: 0.88em;
  cursor: pointer;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  color: #ffffff;
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

/* UŻYTKOWNICY I ROLE */
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-row-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-row-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}
.user-row-fallback {
  font-size: 1.3em;
}
.role-badge {
  font-size: 0.72em;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  display: inline-block;
}
.role-admin {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #f87171;
}
.role-pro {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fbbf24;
}
.role-lite {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
}
.role-user {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.role-select {
  padding: 6px 10px;
  font-size: 0.85em;
  font-weight: 600;
  border-radius: 6px;
  min-width: 96px;
  max-width: 140px;
  white-space: nowrap;
}
.alert-success-box {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.9em;
}
.alert-error-box {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.9em;
}

/* PASEK FILTROWANIA I WYSZUKIWANIA UŻYTKOWNIKÓW */
.users-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 16px;
}

.users-search-box {
  position: relative;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.95em;
  color: #94a3b8;
  pointer-events: none;
}

.users-search-input {
  padding-left: 36px !important;
  padding-right: 36px !important;
  font-size: 0.9em;
}

.btn-clear-search {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-weight: 700;
  font-size: 0.85em;
  padding: 4px;
}

.btn-clear-search:hover {
  color: #ef4444;
}

.users-filter-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-role-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-filter-pill {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.78em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.role-filter-pill:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.role-filter-pill.active {
  background: #0284c7;
  border-color: #0284c7;
  color: white;
}

.role-filter-pill.pill-admin.active {
  background: #ef4444;
  border-color: #ef4444;
}

.role-filter-pill.pill-pro.active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #0f172a;
}

.role-filter-pill.pill-lite.active {
  background: #3b82f6;
  border-color: #3b82f6;
}

.role-filter-pill.pill-user.active {
  background: #475569;
  border-color: #475569;
}

.btn-reset-filters {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.8em;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
}

.btn-reset-filters:hover {
  text-decoration: underline;
  color: #0369a1;
}

.table-summary-bar {
  font-size: 0.82em;
  color: #64748b;
  margin-bottom: 8px;
  padding: 0 4px;
}

.empty-filter-state {
  text-align: center;
  padding: 30px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.loading-state {
  text-align: center;
  padding: 30px;
  color: #64748b;
  font-style: italic;
}

/* STANY SEZONÓW W DROPDOWNIE I PODSUMOWANIU */
.dropdown-season-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.season-checkbox-label {
  display: flex;
  align-items: center;
}
.season-pill-mini {
  font-size: 0.72em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.pill-complete {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}
.pill-partial {
  background: #fef9c3;
  color: #a16207;
  border: 1px solid #fde047;
}
.pill-empty {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #cbd5e1;
}

.seasons-database-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid #e2e8f0;
}
.seasons-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
}
.seasons-summary-title {
  margin: 0 0 4px 0;
  font-size: 1.1em;
  font-weight: 600;
  color: #0f172a;
}
.seasons-summary-subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.85em;
}
.btn-refresh-summary {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82em;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-refresh-summary:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.spinning {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.seasons-loading,
.seasons-empty {
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-style: italic;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}

.seasons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.season-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s, box-shadow 0.15s;
}
.season-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}
.season-card.border-complete {
  border-left: 4px solid #22c55e;
}
.season-card.border-partial {
  border-left: 4px solid #eab308;
}
.season-card.border-empty {
  border-left: 4px solid #94a3b8;
}

.season-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.season-year {
  font-weight: 700;
  font-size: 1.05em;
  color: #0f172a;
}
.season-status-badge {
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}
.badge-complete {
  background: #dcfce7;
  color: #15803d;
}
.badge-partial {
  background: #fef9c3;
  color: #a16207;
}
.badge-empty {
  background: #f1f5f9;
  color: #64748b;
}

.season-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.8em;
  color: #475569;
}
.progress-bar-bg {
  width: 100%;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.fill-complete {
  background: #22c55e;
}
.fill-partial {
  background: #eab308;
}
.fill-empty {
  background: #94a3b8;
}

.season-details {
  font-size: 0.82em;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.season-detail-row {
  display: flex;
  justify-content: space-between;
}
.detail-label-inline {
  color: #64748b;
  font-weight: 500;
}
.detail-value {
  font-weight: 600;
  color: #1e293b;
}

.season-categories-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.cat-tag {
  background: #f1f5f9;
  color: #334155;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.76em;
  border: 1px solid #e2e8f0;
}
.cat-tag small {
  color: #64748b;
  margin-left: 2px;
}

/* --- OPTYMALIZACJA SCRAPERA: CHECKBOX --- */
.checkbox-filter-section {
  grid-column: span 2;
}
.checkbox-control-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.checkbox-control-box:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.checkbox-control-box input[type="checkbox"] {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  accent-color: #2563eb;
  cursor: pointer;
}
.checkbox-control-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.checkbox-control-text strong {
  font-size: 0.88em;
  color: #1e293b;
}
.checkbox-control-text .help-desc {
  font-size: 0.78em;
  color: #64748b;
}

/* --- SEZON: PODZIAŁ STATYSTYK --- */
.progress-stats-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.stat-pill-sm {
  font-size: 0.74em;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
}
.stat-pill-sm.pill-results {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.stat-pill-sm.pill-cancelled {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.stat-pill-sm.pill-missing {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

/* --- SEZON CARD FOOTER I PRZYCISKI --- */
.season-card-footer {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-fetch-missing {
  width: 100%;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #b45309;
  font-size: 0.8em;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.btn-fetch-missing:hover:not(:disabled) {
  background: #fef3c7;
  border-color: #f59e0b;
}
.footer-btn-group {
  display: flex;
  gap: 6px;
}
.btn-view-details {
  flex: 1;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 0.78em;
  font-weight: 600;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  text-align: center;
}
.btn-view-details:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
}
.btn-quick-select {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
  font-size: 0.78em;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-quick-select:hover {
  background: #dcfce7;
  border-color: #86efac;
}

/* ========================================================
   MODAL: SZCZEGÓŁY ZAWODÓW (BRAKUJĄCE / ODWOŁANE)
   ======================================================== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  animation: fadeIn 0.15s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.modal-card {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 860px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #cbd5e1;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.modal-title {
  margin: 0;
  font-size: 1.15em;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
}
.modal-subtitle {
  margin: 4px 0 0 0;
  font-size: 0.82em;
  color: #64748b;
}
.btn-modal-close {
  background: transparent;
  border: none;
  font-size: 1.2em;
  color: #64748b;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}
.btn-modal-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.modal-loading {
  padding: 40px;
  text-align: center;
  color: #475569;
  font-size: 0.95em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.missing-summary-banner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.summary-pill {
  padding: 10px 14px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
}
.summary-pill strong {
  font-size: 1.15em;
}
.summary-pill.pill-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}
.summary-pill.pill-cancelled {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #334155;
}
.summary-pill.pill-missing {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.missing-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.text-missing {
  margin: 0;
  font-size: 0.98em;
  font-weight: 700;
  color: #b91c1c;
}
.text-cancelled {
  margin: 0;
  font-size: 0.98em;
  font-weight: 700;
  color: #334155;
}
.section-desc {
  margin: 0;
  font-size: 0.82em;
  color: #64748b;
  line-height: 1.4;
}
.btn-primary-sm {
  background: #2563eb;
  color: #ffffff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.btn-primary-sm:hover:not(:disabled) {
  background: #1d4ed8;
}
.missing-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82em;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}
.missing-table th {
  background: #f1f5f9;
  color: #334155;
  font-weight: 600;
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #cbd5e1;
}
.missing-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}
.missing-table tr:last-child td {
  border-bottom: none;
}
.missing-table tr:hover td {
  background: #f8fafc;
}
.badge-status-missing {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fee2e2;
  color: #991b1b;
  font-weight: 600;
  font-size: 0.78em;
}
.badge-status-cancelled {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
  font-weight: 600;
  font-size: 0.78em;
}
.empty-state-card {
  padding: 30px;
  text-align: center;
  background: #f0fdf4;
  border: 1px dashed #86efac;
  border-radius: 8px;
  color: #166534;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.modal-footer {
  padding: 12px 20px;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
}

/* ========================================================
   STYLES: NOCNE POBIERANIE & WZBOGACANIE POGODĄ
   ======================================================== */
.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.status-pill-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.pill-idle {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.pill-running {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
  animation: pulse-border 1.8s infinite;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.pill-running .status-dot {
  background: #f59e0b;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15); }
}

.info-alert-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #f0fdfa;
  border: 1px solid #ccfbf1;
  border-left: 4px solid #14b8a6;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 16px;
  color: #0f766e;
  font-size: 0.85em;
  line-height: 1.45;
}
.info-alert-banner p {
  margin: 4px 0 0 0;
  color: #115e59;
}
.alert-icon {
  font-size: 1.4em;
  line-height: 1;
}

.feedback-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 0.85em;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-controls-row,
.enricher-controls-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.control-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.input-with-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-input-number {
  width: 130px;
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 600;
  color: #0f172a;
}
.hint-text {
  font-size: 0.72em;
  color: #64748b;
}

.custom-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  color: #334155;
  cursor: pointer;
  user-select: none;
  padding-bottom: 8px;
}

.btn-nightly-start {
  background: #6366f1;
}
.btn-nightly-start:hover:not(:disabled) {
  background: #4f46e5;
}
.btn-nightly-stop {
  background: #dc2626;
}

.weather-coverage-section {
  margin-top: 8px;
  margin-bottom: 16px;
}
.coverage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}
.coverage-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.coverage-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.coverage-db-name {
  font-size: 0.85em;
  font-weight: 600;
  color: #1e293b;
}
.coverage-badge {
  font-size: 0.78em;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}
.badge-complete {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.badge-partial {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.badge-prod {
  background: #ede9fe;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}
.coverage-numbers {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.8em;
  color: #64748b;
}
.coverage-numbers strong {
  font-size: 1.25em;
  color: #0f172a;
}
.prod-note-card {
  background: #faf5ff;
  border-color: #f3e8ff;
}
.prod-note-text {
  margin: 0;
  font-size: 0.8em;
  color: #6b21a8;
  line-height: 1.4;
}

.live-progress-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 0.85em;
}
.progress-title {
  color: #1e293b;
}
.progress-title strong {
  color: #0284c7;
}
.current-item-text {
  margin-left: 6px;
  color: #64748b;
  font-size: 0.9em;
}
.progress-stat {
  font-weight: 600;
  color: #334155;
}
.fill-running {
  background: linear-gradient(90deg, #6366f1, #3b82f6);
  animation: progress-stripe 1.5s linear infinite;
  background-size: 200% 100%;
}
@keyframes progress-stripe {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.live-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.live-metric-card {
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.metric-label {
  font-size: 0.72em;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.metric-value {
  font-size: 1.05em;
  font-weight: 700;
  color: #0f172a;
}
.text-cyan {
  color: #0891b2 !important;
}
.text-blue {
  color: #2563eb !important;
}
.text-red {
  color: #dc2626 !important;
}
.text-green {
  color: #16a34a !important;
}

@media (max-width: 768px) {
  .batch-controls-row,
  .enricher-controls-row {
    flex-direction: column;
    align-items: stretch;
  }
  .control-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-start;
  }
}

/* ========================================
   SCRAPER LIVE, WZNOWIENIE 429 & SIEĆ NEURONOWA
   ======================================== */
.scraper-action-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.seasons-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-resume-429 {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #c2410c;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82em;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-resume-429:hover:not(:disabled) {
  background: #ffedd5;
  border-color: #fb923c;
}
.btn-resume-429:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-fetch-missing-header {
  background: #eff6ff;
  border: 1px solid #93c5fd;
  color: #1d4ed8;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82em;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-fetch-missing-header:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #60a5fa;
}
.btn-fetch-missing-header:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.stat-pill-sm.pill-429,
.summary-pill.pill-429 {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fdba74;
}

.badge-status-429 {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background: #ffedd5;
  color: #9a3412;
  font-weight: 600;
  font-size: 0.78em;
}

.nn-backtest-section {
  border-top: 1px solid #e2e8f0;
  padding-top: 20px;
}

.nn-backtest-header h4 {
  margin: 0 0 4px 0;
  font-size: 1.05em;
  color: #0f172a;
}

.nn-backtest-results {
  margin-top: 14px;
}

.backtest-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88em;
}

.backtest-table th,
.backtest-table td {
  padding: 9px 10px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  white-space: nowrap;
}

.backtest-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
  font-size: 0.82em;
  text-transform: uppercase;
}

.btn-secondary {
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  padding: 10px 18px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.92em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.btn-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.nn-retrain-hint-inline {
  margin-top: 14px;
  padding: 10px 14px;
  background: #fefce8;
  border: 1px solid #fde047;
  border-radius: 6px;
  font-size: 0.85em;
  color: #854d0e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-link-neural {
  background: #ffffff;
  border: 1px solid #facc15;
  color: #854d0e;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.btn-link-neural:hover {
  background: #fef9c3;
}

.nn-suggestion-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 18px;
  font-size: 0.9em;
  line-height: 1.5;
  color: #854d0e;
}
.nn-suggestion-banner span {
  font-size: 1.3em;
  flex-shrink: 0;
}

.nn-warning-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 18px;
  font-size: 0.88em;
  line-height: 1.45;
  color: #9a3412;
}

.nn-training-subhint {
  margin: 4px 0 0 0;
  font-size: 0.82em;
  color: #64748b;
}

.nn-model-status {
  margin-top: 8px;
  margin-bottom: 20px;
}
.nn-model-status h4 {
  font-size: 1em;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #0f172a;
}
.nn-metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}
.nn-metric-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nn-metric-card .metric-label {
  font-size: 0.78em;
  color: #64748b;
  font-weight: 500;
}
.nn-metric-card .metric-value {
  font-size: 1.05em;
  color: #0f172a;
}

.nn-loading {
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 0.95em;
}

.nn-message {
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 0.9em;
  margin-bottom: 16px;
}
.nn-message-success {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
}
.nn-message-error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #991b1b;
}
.nn-message-info {
  background: #dbeafe;
  border: 1px solid #93c5fd;
  color: #1e40af;
}

.nn-action-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* --- Globalny pasek aktywnego procesu w tle --- */
.active-process-sticky-card {
  position: sticky;
  top: 16px;
  z-index: 100;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid #334155;
  border-left: 4px solid #38bdf8;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
  color: #f8fafc;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.active-process-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.active-process-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.95em;
  flex-wrap: wrap;
}

.pulsing-live-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7);
  animation: pulseDot 1.6s infinite;
}

@keyframes pulseDot {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 8px rgba(56, 189, 248, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
  }
}

.active-process-sub {
  color: #94a3b8;
  font-size: 0.9em;
}

.active-process-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-compact-stop,
.btn-header-stop {
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 0.85em;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-compact-stop:hover:not(:disabled),
.btn-header-stop:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.btn-compact-stop:disabled,
.btn-header-stop:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.active-process-bar-wrap {
  width: 100%;
  height: 6px;
  background: #334155;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.active-process-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #818cf8);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.active-process-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82em;
  flex-wrap: wrap;
}

.active-item-label {
  color: #cbd5e1;
  max-width: 480px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-stats-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mini-stat-pill {
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8em;
}

.mini-stat-pill.pill-green {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.mini-stat-pill.pill-cyan {
  background: rgba(6, 182, 212, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(6, 182, 212, 0.3);
}

.mini-stat-pill.pill-blue {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.mini-stat-pill.pill-red {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.mini-stat-pill.pill-gray {
  background: rgba(148, 163, 184, 0.15);
  color: #cbd5e1;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

/* --- Kontrolki zakresu lat i kategorii (Nocny Scraper & PDF) --- */
.range-config-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.range-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.range-badge {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 700;
  font-size: 0.85em;
  padding: 3px 10px;
  border-radius: 999px;
}

.dual-sliders-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.slider-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85em;
  color: #334155;
}

.range-presets-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.btn-preset-chip {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.78em;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
}
.btn-preset-chip:hover:not(:disabled) {
  border-color: #0284c7;
  color: #0284c7;
}

.cat-pills-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.cat-pill-toggle {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.8em;
  font-weight: 600;
  padding: 5px 11px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.cat-pill-toggle.active {
  background: #0284c7;
  border-color: #0284c7;
  color: white;
}

/* ========================================================
   MOBILE UX RESPONSIVENESS (ADMIN VIEW)
   ======================================================== */
@media (max-width: 768px) {
  .admin-page {
    padding: 12px 10px;
  }
  .tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
    gap: 4px;
  }
  .tabs button {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 0.88em;
  }
  .admin-card {
    padding: 14px;
  }
  .admin-card-header.flex-between {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .filter-row,
  .batch-controls-row,
  .weather-controls-row,
  .seasons-header-row,
  .users-toolbar {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px;
  }
  .filter-section,
  .dropdown-container {
    max-width: none !important;
    width: 100%;
  }
  .dual-sliders-grid {
    grid-template-columns: 1fr;
  }
  .seasons-grid {
    grid-template-columns: 1fr !important;
  }
  .live-metrics-grid,
  .summary-stats-grid,
  .nn-metrics-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 8px;
  }
  .seasons-header-actions,
  .control-actions,
  .action-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .active-process-header,
  .active-process-stats {
    flex-direction: column;
    align-items: stretch;
  }
  .active-item-label {
    max-width: 100%;
  }
  .btn-compact-stop {
    width: 100%;
    justify-content: center;
  }
  .diff-container {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 440px) {
  .live-metrics-grid,
  .summary-stats-grid,
  .nn-metrics-grid {
    grid-template-columns: 1fr !important;
  }
}

.esm-season-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: 8px 12px;
  border-radius: 8px;
}

.esm-season-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0369a1;
}

.esm-season-input {
  max-width: 260px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  padding: 5px 9px;
}

.admin-esm-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.esm-linked-pill {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  color: #065f46;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  padding: 1px 7px;
  border-radius: 999px;
}

.admin-esm-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.esm-tid-input {
  flex: 1;
  min-width: 145px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.76rem;
  padding: 5px 8px;
}

.btn-esm-save,
.btn-esm-unlink {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-esm-save:hover:not(:disabled) {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.btn-esm-unlink {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.btn-esm-save:disabled,
.btn-esm-unlink:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* KOMUNIKATOR ADMINA */
.admin-support-layout {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 16px;
  margin-top: 12px;
}

.support-threads-sidebar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 520px;
  overflow-y: auto;
}

.support-thread-item {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 3px;
  overflow: hidden;
  cursor: pointer;
}

.support-thread-item.active {
  background: #f0f9ff;
  border-color: #0284c7;
}

.support-thread-item.unread:not(.active) {
  background: #fffbeb;
  border-color: #f59e0b;
}

.sti-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  min-width: 0;
  font-size: 0.88rem;
  color: #0f172a;
}

.sti-email {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.74rem;
  color: #64748b;
}

.sti-preview {
  display: block;
  width: 100%;
  min-width: 0;
  font-size: 0.78rem;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.support-thread-view {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.stv-email {
  margin-left: 8px;
  font-size: 0.8rem;
  color: #64748b;
}

.stv-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 360px;
  overflow-y: auto;
  padding: 10px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.stv-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.bubble-usr {
  align-self: flex-start;
}

.bubble-adm {
  align-self: flex-end;
  background: #f0f9ff;
  border-color: #bae6fd;
}

.stv-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.73rem;
  color: #64748b;
  margin-bottom: 4px;
}

.stv-ctx {
  font-size: 0.72rem;
  font-weight: 700;
  color: #0369a1;
  margin-bottom: 4px;
}

.stv-text {
  margin: 0;
  font-size: 0.9rem;
  color: #0f172a;
  white-space: pre-wrap;
  line-height: 1.4;
}

.stv-reply-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.admin-email-code {
  display: inline-block;
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.admin-table th,
.admin-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: middle;
}

.admin-table th {
  background: #f8fafc;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}

.admin-email-code {
  font-size: 0.76rem;
  color: #334155;
  word-break: break-word;
}

.esm-tid-input {
  flex: 1;
  min-width: 125px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.76rem;
  padding: 5px 8px;
}

.users-mobile-cards.mobile-users-only {
  display: none;
}

.user-m-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.umc-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.umc-name-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.umc-email {
  font-size: 0.74rem;
  color: #64748b;
  word-break: break-all;
}

.umc-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.umc-field label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
}

@media (max-width: 900px) {
  .admin-support-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .desktop-users-only {
    display: none !important;
  }
  .users-mobile-cards.mobile-users-only {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }
  .tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>