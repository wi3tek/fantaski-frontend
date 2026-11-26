<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'
import { api } from '@/api/client'

interface Hill {
  hill_id: string
  place?: string | null
  country_code?: string | null
  size?: number | null
  unit?: string | null
  type?: string | null
}

interface WeatherState {
  temperature: number
  wind_speed: number
  wind_direction: number
  wind_gusts: number
  surface_pressure: number
  relative_humidity: number
  precipitation: number
  headwind_component: number
  source?: string
  is_forecast?: boolean
  wind_volatility_index?: number
  wind_trend_slope?: number
  direction_shift?: number
  temperature_drift?: number
  lottery_risk_level?: string
}

interface AvailableAthlete {
  fis_code: number | string
  full_name: string
  country_code: string
  price: number | null
  has_price: boolean
  has_wc: boolean
  scored_current_season?: boolean
}

interface AthleteProfile {
  code: string
  icon: string
  label: string
  tag_class: string
  description: string
}

interface PredictedAthlete {
  fis_code: number | string
  name: string
  country: string
  price: number | null
  predicted_rank: number
  predicted_distance: number
  predicted_points: number
  podium_probability: number
  win_probability: number
  top10_probability: number
  top30_probability: number
  form_score: number
  recent_form_score?: number
  consistency_score: number
  conversion_delta: number
  hill_affinity_score: number
  venue_affinity_score: number
  current_season_active: number
  career_starts: number
  has_wc_experience: boolean
  is_tier_debutant?: boolean
  tier_starts_count?: number
  tier_experience_ratio?: number
  profiles: AthleteProfile[]
  sequence_index?: number
  effective_headwind?: number
  wind_profile?: string
  headwind_efficiency?: number
  tailwind_penalty?: number
}

interface WeatherCorridor {
  wind_volatility_index: number
  lottery_risk_level: string
  wind_trend_slope: number
  temperature_drift: number
  direction_shift: number
}

interface WeekendSessionInfo {
  id: string
  date: string
  time?: string
  type: string
  title: string
  jumpers_count: number
}

// --- Stan Skoczni i Daty ---
const hills = ref<Hill[]>([])
const selectedHillId = ref<string>('ZAKOPANE_HS140')
const selectedCompetitionType = ref<string>('WC')
const isCustomHill = ref(false)
const customPlace = ref('Zakopane')
const customHillSize = ref(140)
const customHillType = ref('LARGE')

// Domyślnie data jutrzejsza
const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const selectedDate = ref(tomorrow.toISOString().split('T')[0])
const selectedTime = ref('16:00')

// --- Stan Najbliższych Zawodów (Auto-detekcja z Kalendarza FIS) ---
const upcomingCompetition = ref<any>(null)
const isFetchingUpcoming = ref(false)

const fetchUpcomingCompetition = async () => {
  try {
    isFetchingUpcoming.value = true
    const data = await api.get('/prediction/next-competition')
    if (data && data.found) {
      upcomingCompetition.value = data
      // Automatycznie ustaw najbliższy konkurs w formularzu
      if (data.hill_id) {
        selectedHillId.value = data.hill_id
        isCustomHill.value = false
      }
      if (data.date) {
        selectedDate.value = data.date
      }
      if (data.time) {
        selectedTime.value = data.time
      }
      if (data.competition_type) {
        selectedCompetitionType.value = data.competition_type
      }
    }
  } catch (e) {
    console.error('Błąd pobierania najbliższych zawodów z kalendarza FIS:', e)
  } finally {
    isFetchingUpcoming.value = false
  }
}

const applyUpcomingCompetition = () => {
  if (!upcomingCompetition.value) return
  const data = upcomingCompetition.value
  if (data.hill_id) {
    selectedHillId.value = data.hill_id
    isCustomHill.value = false
  }
  if (data.date) selectedDate.value = data.date
  if (data.time) selectedTime.value = data.time
  if (data.competition_type) selectedCompetitionType.value = data.competition_type
}

// --- Stan Pogody ---
const weather = ref<WeatherState>({
  temperature: -2.0,
  wind_speed: 1.5,
  wind_direction: 180,
  wind_gusts: 2.5,
  surface_pressure: 960.0,
  relative_humidity: 75,
  precipitation: 0.0,
  headwind_component: 0.6,
  source: 'Domyślna',
  is_forecast: true
})

const isFetchingWeather = ref(false)
const weatherMessage = ref<string | null>(null)
const weatherCorridor = ref<WeatherCorridor | null>(null)

// --- Stan Listy Startowej (Zarządzanie skoczkami z wyceną) ---
const availableAthletes = ref<AvailableAthlete[]>([])
const selectedFisCodes = ref<string[]>([])
const showStartListManager = ref(false)
const athleteSearchQuery = ref('')
const showAutocomplete = ref(false)
const showLegendModal = ref(false)

// --- Stan Predykcji i Modelu ---
const isPredicting = ref(false)
const predictions = ref<PredictedAthlete[]>([])
const detectedWeekendSessions = ref<WeekendSessionInfo[]>([])
const modelMeta = ref<any>(null)
const errorMsg = ref<string | null>(null)

// Filtry tabeli
const tableSearch = ref('')
const filterMode = ref<'all' | 'top30' | 'pol' | 'podium' | 'clutch'>('all')

// Sortowanie tabeli
const sortKey = ref<string>('predicted_rank')
const sortOrder = ref<'asc' | 'desc'>('asc')

const sortBy = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    // Metryki, gdzie wyższa wartość jest lepsza / pożądana na początku: sortujemy domyślnie malejąco
    if ([
      'predicted_distance',
      'predicted_points',
      'top30_probability',
      'podium_probability',
      'form_score',
      'consistency_score',
      'price'
    ].includes(key)) {
      sortOrder.value = 'desc'
    } else {
      // Dla rankingu (1. miejsce jest najlepsze) oraz nazwiska: sortujemy rosnąco
      sortOrder.value = 'asc'
    }
  }
}

// Obliczenie aktualnej skoczni
const currentHill = computed(() => {
  if (isCustomHill.value) {
    return {
      place: customPlace.value,
      size: Number(customHillSize.value) || 130,
      type: customHillType.value,
      id: 'CUSTOM'
    }
  }
  const found = hills.value.find(h => h.hill_id === selectedHillId.value)
  if (found) {
    return {
      place: found.place || 'Zakopane',
      size: found.size || 130,
      type: found.type || 'LARGE',
      id: found.hill_id
    }
  }
  return {
    place: 'Zakopane',
    size: 140,
    type: 'LARGE',
    id: 'ZAKOPANE_HS140'
  }
})

// Autouzupełnianie skoczków do dodania
const filteredAvailableAthletes = computed(() => {
  if (!athleteSearchQuery.value.trim()) return []
  const q = athleteSearchQuery.value.toLowerCase().trim()
  return availableAthletes.value.filter(a => {
    const codeStr = String(a.fis_code)
    const matches = a.full_name.toLowerCase().includes(q) || a.country_code.toLowerCase().includes(q)
    const notSelected = !selectedFisCodes.value.includes(codeStr)
    return matches && notSelected
  }).slice(0, 8)
})

// Obiekt wybranych skoczków do wyświetlenia na liście
const selectedAthletesDetails = computed(() => {
  const map = new Map<string, AvailableAthlete>()
  for (const a of availableAthletes.value) {
    map.set(String(a.fis_code), a)
  }
  return selectedFisCodes.value.map(code => {
    return map.get(code) || {
      fis_code: code,
      full_name: `Skoczek #${code}`,
      country_code: '',
      price: null,
      has_price: false,
      has_wc: true
    }
  })
})

// Pobranie listy skoczni
const fetchHills = async () => {
  try {
    const data = await api.get('/hills/list', { cacheTtlMs: 60000 })
    hills.value = data
    hills.value.sort((a, b) => (a.place || '').localeCompare(b.place || ''))
    if (!hills.value.some(h => h.hill_id === selectedHillId.value) && hills.value.length > 0 && hills.value[0]) {
      selectedHillId.value = hills.value[0].hill_id
    }
  } catch (e) {
    console.error('Błąd pobierania skoczni:', e)
  }
}

// Pobranie listy dostępnych skoczków (z domyślnym filtrem price != null)
const fetchAvailableAthletes = async () => {
  try {
    const data = await api.get('/prediction/available-athletes')
    availableAthletes.value = data
    // Domyślnie załaduj dokładnie skoczków z wyceną (price != null)
    selectedFisCodes.value = availableAthletes.value
      .filter(a => a.has_price)
      .map(a => String(a.fis_code))
  } catch (e) {
    console.error('Błąd pobierania skoczków:', e)
  }
}

// Zarządzanie listą startową
const addAthlete = (athlete: AvailableAthlete) => {
  const code = String(athlete.fis_code)
  if (!selectedFisCodes.value.includes(code)) {
    selectedFisCodes.value.push(code)
  }
  athleteSearchQuery.value = ''
  showAutocomplete.value = false
}

const removeAthlete = (fisCode: string | number) => {
  const code = String(fisCode)
  selectedFisCodes.value = selectedFisCodes.value.filter(c => c !== code)
  predictions.value = predictions.value.filter(p => String(p.fis_code) !== code)
  predictions.value.forEach((p, idx) => {
    p.predicted_rank = idx + 1
  })
}

const currentPreset = ref<'priced' | 'scored' | 'top30' | 'pol' | 'clear' | 'custom'>('priced')
const scoredCount = computed(() => availableAthletes.value.filter(a => a.scored_current_season === true).length)

// Presety listy startowej
const applyAthletePreset = (preset: 'priced' | 'scored' | 'top30' | 'pol' | 'clear') => {
  currentPreset.value = preset
  if (preset === 'priced') {
    selectedFisCodes.value = availableAthletes.value
      .filter(a => a.has_price)
      .map(a => String(a.fis_code))
  } else if (preset === 'scored') {
    selectedFisCodes.value = availableAthletes.value
      .filter(a => a.scored_current_season)
      .map(a => String(a.fis_code))
  } else if (preset === 'top30') {
    selectedFisCodes.value = availableAthletes.value
      .filter(a => a.has_price)
      .slice(0, 30)
      .map(a => String(a.fis_code))
  } else if (preset === 'pol') {
    selectedFisCodes.value = availableAthletes.value
      .filter(a => a.country_code === 'POL')
      .map(a => String(a.fis_code))
  } else if (preset === 'clear') {
    selectedFisCodes.value = []
    predictions.value = []
  }
}

// Pobranie informacji o modelu
const fetchModelInfo = async () => {
  try {
    const data = await api.get('/prediction/model-info')
    modelMeta.value = data.metadata
  } catch (e) {
    console.error('Błąd pobierania info o modelu:', e)
  }
}

// Pobieranie prognozy pogody z Open-Meteo
const fetchWeatherForecast = async () => {
  isFetchingWeather.value = true
  weatherMessage.value = null
  try {
    const place = currentHill.value.place
    const data = await api.get(`/prediction/weather?place=${encodeURIComponent(place)}&date=${selectedDate.value}&time=${selectedTime.value}`)
    weather.value = {
      temperature: data.temperature,
      wind_speed: data.wind_speed,
      wind_direction: data.wind_direction,
      wind_gusts: data.wind_gusts,
      surface_pressure: data.surface_pressure,
      relative_humidity: data.relative_humidity,
      precipitation: data.precipitation,
      headwind_component: data.headwind_component,
      source: data.source,
      is_forecast: data.is_forecast,
      wind_volatility_index: data.wind_volatility_index,
      wind_trend_slope: data.wind_trend_slope,
      direction_shift: data.direction_shift,
      temperature_drift: data.temperature_drift,
      lottery_risk_level: data.lottery_risk_level
    }
    weatherMessage.value = `Pobrano dane pogodowe dla: ${place} (${data.source})`
  } catch (e) {
    console.error('Błąd pobierania pogody:', e)
    weatherMessage.value = 'Błąd połączenia z API pogodowym.'
  } finally {
    isFetchingWeather.value = false
  }
}

// Uruchomienie predykcji
const runPrediction = async () => {
  if (selectedFisCodes.value.length === 0) {
    errorMsg.value = 'Lista startowa jest pusta. Wybierz lub dodaj skoczków.'
    return
  }

  isPredicting.value = true
  errorMsg.value = null
  try {
    const payload = {
      hill_place: currentHill.value.place,
      hill_size: currentHill.value.size,
      hill_type: currentHill.value.type,
      hill_id: currentHill.value.id,
      competition_type: selectedCompetitionType.value,
      date: selectedDate.value,
      time: selectedTime.value,
      weather: weather.value,
      fis_codes: selectedFisCodes.value,
      num_simulations: 100
    }

    const data = await api.post('/prediction/predict', payload)
    predictions.value = data.predictions
    detectedWeekendSessions.value = data.weekend_sessions_detected || []
    weatherCorridor.value = data.corridor || null
  } catch (err: any) {
    errorMsg.value = err.message || 'Wystąpił błąd podczas generowania predykcji.'
  } finally {
    isPredicting.value = false
  }
}

// Gotowe presety pogodowe
const applyWeatherPreset = (type: 'headwind' | 'tailwind' | 'calm' | 'thaw') => {
  if (type === 'headwind') {
    weather.value.headwind_component = 2.2
    weather.value.wind_speed = 3.0
    weather.value.wind_direction = 0
    weather.value.temperature = -3.0
    weather.value.surface_pressure = 955.0
    weather.value.source = 'Symulacja: Mocny wiatr pod narty'
  } else if (type === 'tailwind') {
    weather.value.headwind_component = -1.8
    weather.value.wind_speed = 2.5
    weather.value.wind_direction = 180
    weather.value.temperature = -4.0
    weather.value.surface_pressure = 962.0
    weather.value.source = 'Symulacja: Trudny wiatr w plecy'
  } else if (type === 'calm') {
    weather.value.headwind_component = 0.2
    weather.value.wind_speed = 0.5
    weather.value.wind_direction = 90
    weather.value.temperature = -8.0
    weather.value.surface_pressure = 970.0
    weather.value.source = 'Symulacja: Bezwietrzny mróz'
  } else if (type === 'thaw') {
    weather.value.headwind_component = 0.5
    weather.value.wind_speed = 1.8
    weather.value.wind_direction = 240
    weather.value.temperature = 4.5
    weather.value.surface_pressure = 948.0
    weather.value.source = 'Symulacja: Ciepła odwilż'
  }
}

// Filtrowanie i sortowanie listy zawodników w tabeli wyników
const filteredPredictions = computed(() => {
  let list = predictions.value

  if (filterMode.value === 'top30') {
    list = list.slice(0, 30)
  } else if (filterMode.value === 'pol') {
    list = list.filter(a => a.country === 'POL')
  } else if (filterMode.value === 'podium') {
    list = list.filter(a => a.podium_probability >= 10.0)
  } else if (filterMode.value === 'clutch') {
    list = list.filter(a => a.profiles.some(p => p.code === 'clutch'))
  }

  if (tableSearch.value.trim()) {
    const q = tableSearch.value.toLowerCase().trim()
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q)
    )
  }

  // Sortowanie
  return [...list].sort((a, b) => {
    const valA = a[sortKey.value as keyof PredictedAthlete]
    const valB = b[sortKey.value as keyof PredictedAthlete]

    // Wartości null/undefined (np. cena) na sam koniec tabeli
    if (valA == null && valB == null) return 0
    if (valA == null) return 1
    if (valB == null) return -1

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortOrder.value === 'asc'
        ? valA.localeCompare(valB, 'pl')
        : valB.localeCompare(valA, 'pl')
    }

    const numA = Number(valA)
    const numB = Number(valB)
    return sortOrder.value === 'asc' ? numA - numB : numB - numA
  })
})

const podiumAthletes = computed(() => {
  return predictions.value.slice(0, 3)
})

const formattedTrainedDate = computed(() => {
  if (!modelMeta.value?.trained_at) return 'Niedawno'
  try {
    const d = new Date(modelMeta.value.trained_at)
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return modelMeta.value.trained_at
  }
})

watch([selectedHillId, isCustomHill], () => {
  fetchWeatherForecast()
})

onMounted(async () => {
  await fetchHills()
  await fetchUpcomingCompetition()
  await fetchAvailableAthletes()
  await fetchModelInfo()
  await fetchWeatherForecast()
  await runPrediction()
})
</script>

<template>
  <div class="predictions-page">
    <!-- HERO HEADER -->
    <header class="page-hero">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="badge-icon">🔮</span>
          <span>NEURAL NETWORK FIS ANALYTICS</span>
        </div>
        <h1 class="hero-title">Prognozy</h1>
        <p class="hero-desc">
          Model sieci neuronowej z hierarchią sesji (konkurs > kwalifikacje > trening), normalizacją jakości obsady, wskaźnikiem powtarzalności skoków, profilami psychologii presji, doświadczeniem kariery i wektorową kompensacją wiatru FIS (K-wind).
        </p>

        <div class="model-meta-bar" v-if="modelMeta">
          <div class="meta-item">
            <span class="meta-label">Próbek treningowych:</span>
            <strong class="meta-val">{{ modelMeta.sample_count?.toLocaleString() || '69 500+' }} skoków</strong>
          </div>
          <div class="meta-divider">|</div>
          <div class="meta-item">
            <span class="meta-label">Błąd odległości MAE:</span>
            <strong class="meta-val">~{{ modelMeta.mae_distance_meters_approx }} m</strong>
          </div>
          <div class="meta-divider">|</div>
          <div class="meta-item">
            <span class="meta-label">Cechy wejściowe sieci:</span>
            <strong class="meta-val">25 parametrów sportowo-fizycznych</strong>
          </div>
          <div class="meta-divider">|</div>
          <div class="meta-item">
            <span class="meta-label">Ostatni trening:</span>
            <strong class="meta-val">{{ formattedTrainedDate }}</strong>
          </div>
        </div>
      </div>
    </header>

    <div class="container main-layout">
      <!-- BANNER NAJBLIŻSZYCH ZAWODÓW (FIS CALENDAR AUTO-DETECTION) -->
      <div v-if="upcomingCompetition && upcomingCompetition.found" class="upcoming-comp-banner">
        <div class="upcoming-comp-left">
          <div class="upcoming-badge">
            <span class="pulse-indicator"></span>
            <strong>NAJBLIŻSZE ZAWODY Z KALENDARZA FIS</strong>
          </div>
          <div class="upcoming-info">
            <span class="upcoming-event-title">
              📍 <strong>{{ upcomingCompetition.event_name || upcomingCompetition.place }}</strong>
              <span class="upcoming-hill-spec" v-if="upcomingCompetition.hill_size">
                ({{ upcomingCompetition.session_title || 'Konkurs Indywidualny' }} &bull; HS{{ upcomingCompetition.hill_size }})
              </span>
            </span>
            <span class="upcoming-timing">
              📅 Konkurs: <strong>{{ upcomingCompetition.date }}</strong> godz. <strong>{{ upcomingCompetition.time }}</strong>
              <template v-if="upcomingCompetition.qualification">
                &bull; ⏱️ Kwalifikacje: {{ upcomingCompetition.qualification.date }} {{ upcomingCompetition.qualification.time }}
              </template>
            </span>
          </div>
        </div>
        <div class="upcoming-comp-actions">
          <button
            class="btn-apply-upcoming"
            @click="applyUpcomingCompetition"
            title="Kliknij, aby ustawić te zawody jako aktualny cel predykcji"
          >
            ⚡ Zastosuj zawody
          </button>
        </div>
      </div>

      <!-- PANEL KONTROLNY (SKOCZNIA + POGODA + SYMULATOR) -->
      <section class="control-grid">
        <!-- KARTA 1: WYBÓR SKOCZNI I TERMINU -->
        <div class="card setup-card">
          <div class="card-header">
            <h3>🏔️ Skocznia i Termin</h3>
            <button class="text-btn" @click="isCustomHill = !isCustomHill">
              {{ isCustomHill ? 'Wybierz z bazy' : '+ Własna skocznia' }}
            </button>
          </div>

          <div class="card-body">
            <!-- Wybór z bazy -->
            <div class="form-group" v-if="!isCustomHill">
              <label>Wybierz skocznię z bazy:</label>
              <select v-model="selectedHillId" class="custom-select">
                <option v-for="h in hills" :key="h.hill_id" :value="h.hill_id">
                  {{ h.place }} ({{ h.unit || 'HS' }}{{ h.size }}) &bull; {{ h.type }} [{{ h.country_code }}]
                </option>
              </select>
            </div>

            <!-- Własna konfiguracja skoczni -->
            <div v-else class="custom-hill-fields">
              <div class="form-group">
                <label>Miejscowość:</label>
                <input v-model="customPlace" type="text" class="custom-input" placeholder="np. Zakopane" />
              </div>
              <div class="form-row">
                <div class="form-group half">
                  <label>Rozmiar (HS w metrach):</label>
                  <input v-model.number="customHillSize" type="number" class="custom-input" min="60" max="250" />
                </div>
                <div class="form-group half">
                  <label>Typ skoczni:</label>
                  <select v-model="customHillType" class="custom-select">
                    <option value="NORMAL">Normalna (HS 85-109)</option>
                    <option value="LARGE">Duża (HS 110-184)</option>
                    <option value="FLYING">Mamucia (HS 185+)</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Wybór rangi zawodów (Liga FIS) -->
            <div class="form-group">
              <label>🏆 Ranga zawodów (Poziom ligowy FIS):</label>
              <select v-model="selectedCompetitionType" class="custom-select tier-select">
                <option value="WC">Puchar Świata (WC / Igrzyska / MŚ) &bull; Super-Elita (Waga 1.00)</option>
                <option value="GP">Letnie Grand Prix (GP) &bull; Elita Igelit (Waga 0.70)</option>
                <option value="COC">Puchar Kontynentalny (COC) &bull; Zaplecze / II liga (Waga 0.45)</option>
                <option value="FC">FIS Cup (FC) &bull; III liga (Waga 0.20)</option>
              </select>
            </div>

            <!-- Data i Godzina -->
            <div class="form-row">
              <div class="form-group half">
                <label>Data konkursu:</label>
                <input v-model="selectedDate" type="date" class="custom-input" />
              </div>
              <div class="form-group half">
                <label>Godzina startu:</label>
                <input v-model="selectedTime" type="time" class="custom-input" />
              </div>
            </div>

            <!-- Podsumowanie skoczni -->
            <div class="hill-summary-badge">
              <div class="h-badge-left">
                <span class="h-name">{{ currentHill.place }}</span>
                <span class="h-type">{{ currentHill.type }}</span>
              </div>
              <div class="h-badge-right">
                <span class="h-hs">HS {{ currentHill.size }} m</span>
              </div>
            </div>

            <!-- Pasek Listy Startowej -->
            <div class="start-list-toggle-bar">
              <div class="start-list-info">
                <span class="sl-title">📋 Skład:</span>
                <strong class="sl-count">{{ selectedFisCodes.length }}</strong>
                <span class="sl-badge">{{ currentPreset === 'scored' ? '⚡ Punktowali w sezonie' : (currentPreset === 'priced' ? 'Wycenieni' : (currentPreset === 'top30' ? 'TOP 30' : (currentPreset === 'pol' ? 'Polacy' : 'Własny'))) }}</span>
              </div>
              <div class="quick-preset-pills">
                <button
                  type="button"
                  class="pill-quick-btn"
                  :class="{ active: currentPreset === 'priced' }"
                  @click="applyAthletePreset('priced')"
                  title="Wszyscy wycenieni w Fantasy"
                >
                  Wycenieni
                </button>
                <button
                  type="button"
                  class="pill-quick-btn highlight-gold"
                  :class="{ active: currentPreset === 'scored' }"
                  @click="applyAthletePreset('scored')"
                  title="Zawodnicy, którzy punktowali w obecnym sezonie zimowym"
                >
                  ⚡ Punktowali w sezonie ({{ scoredCount }})
                </button>
              </div>
              <button
                class="manage-list-btn"
                @click="showStartListManager = !showStartListManager"
              >
                {{ showStartListManager ? 'Zwiń ▲' : 'Wybierz ▼' }}
              </button>
            </div>
          </div>
        </div>

        <!-- KARTA 2: POGODA I SYMULATOR ("CO JEŚLI?") -->
        <div class="card weather-card">
          <div class="card-header">
            <h3>🌤️ Warunki Pogodowe & Symulator</h3>
            <button
              class="refresh-weather-btn"
              @click="fetchWeatherForecast"
              :disabled="isFetchingWeather"
              title="Pobierz świeże dane z Open-Meteo"
            >
              <span :class="{ spinning: isFetchingWeather }">🔄</span>
              Pobierz z Open-Meteo
            </button>
          </div>

          <div class="card-body">
            <!-- Pasek źródła -->
            <div class="weather-source-bar">
              <span class="source-tag">{{ weather.source || 'Open-Meteo API' }}</span>
              <span v-if="weatherMessage" class="source-msg">{{ weatherMessage }}</span>
            </div>

            <!-- Szybkie presety -->
            <div class="weather-presets">
              <span class="presets-label">Szybkie scenariusze:</span>
              <button class="preset-btn" @click="applyWeatherPreset('headwind')">🌪️ Pod narty (+2.2m/s)</button>
              <button class="preset-btn" @click="applyWeatherPreset('tailwind')">💨 W plecy (-1.8m/s)</button>
              <button class="preset-btn" @click="applyWeatherPreset('calm')">❄️ Cisza (-8°C)</button>
              <button class="preset-btn" @click="applyWeatherPreset('thaw')">☀️ Odwilż (+4.5°C)</button>
            </div>

            <!-- Suwaki interaktywne -->
            <div class="sliders-container">
              <!-- Wiatr pod narty / w plecy (kluczowy parametr) -->
              <div class="slider-box highlight">
                <div class="slider-header">
                  <span class="s-title">Kompensacja wiatru (w osi zeskoku):</span>
                  <span
                    class="s-value"
                    :class="{
                      positive: weather.headwind_component > 0,
                      negative: weather.headwind_component < 0
                    }"
                  >
                    {{ weather.headwind_component > 0 ? '+' : '' }}{{ weather.headwind_component.toFixed(1) }} m/s
                    <small>({{ weather.headwind_component > 0 ? 'pod narty 🚀' : weather.headwind_component < 0 ? 'w plecy 🔻' : 'bezwietrznie' }})</small>
                  </span>
                </div>
                <input
                  type="range"
                  v-model.number="weather.headwind_component"
                  min="-2.5"
                  max="3.0"
                  step="0.1"
                  class="range-slider headwind-slider"
                />
                <div class="slider-scale">
                  <span>-2.5 (W plecy)</span>
                  <span>0.0 (Cisza)</span>
                  <span>+3.0 (Pod narty)</span>
                </div>
              </div>

              <!-- Pozostałe parametry -->
              <div class="sliders-row">
                <div class="slider-box mini">
                  <div class="slider-header">
                    <span>Prędkość ogólna:</span>
                    <strong>{{ weather.wind_speed.toFixed(1) }} m/s</strong>
                  </div>
                  <input type="range" v-model.number="weather.wind_speed" min="0" max="8" step="0.2" class="range-slider" />
                </div>

                <div class="slider-box mini">
                  <div class="slider-header">
                    <span>Temperatura:</span>
                    <strong>{{ weather.temperature.toFixed(1) }} °C</strong>
                  </div>
                  <input type="range" v-model.number="weather.temperature" min="-20" max="15" step="0.5" class="range-slider" />
                </div>

                <div class="slider-box mini">
                  <div class="slider-header">
                    <span>Ciśnienie pow.:</span>
                    <strong>{{ Math.round(weather.surface_pressure) }} hPa</strong>
                  </div>
                  <input type="range" v-model.number="weather.surface_pressure" min="900" max="1025" step="1" class="range-slider" />
                </div>
              </div>
            </div>

            <!-- Przycisk GENERUJ PREDYKCJE -->
            <button
              class="run-prediction-btn"
              @click="runPrediction"
              :disabled="isPredicting"
            >
              <span v-if="!isPredicting">🚀 GENERUJ PROGNOZY ({{ selectedFisCodes.length }} SKOCZKÓW)</span>
              <span v-else>Przetwarzanie przez sieć neuronową...</span>
            </button>
          </div>
        </div>
      </section>

      <!-- BANNER WYKRYTYCH SESJI BIEŻĄCEGO WEEKENDU -->
      <div v-if="detectedWeekendSessions.length > 0" class="weekend-context-banner">
        <div class="wcb-header">
          <span class="wcb-icon">⚡</span>
          <strong>Wykryto serie z bieżącego weekendu (uwzględniono w modelu):</strong>
        </div>
        <div class="wcb-tags">
          <span
            v-for="ws in detectedWeekendSessions"
            :key="ws.id"
            class="wcb-tag"
            :class="'tag-' + ws.type.toLowerCase()"
          >
            {{ ws.title }} ({{ ws.date }} {{ ws.time || '' }}) &bull; {{ ws.jumpers_count }} skoczków
          </span>
        </div>
      </div>

      <!-- ROZWIJANY PANEL ZARZĄDZANIA LISTĄ STARTOWĄ -->
      <section v-if="showStartListManager" class="card start-list-manager-card">
        <div class="card-header">
          <h3>👥 Zarządzanie Listą Startową (Dodawaj i usuwaj skoczków)</h3>
          <div class="manager-presets">
            <button class="small-preset-btn" :class="{ active: currentPreset === 'priced' }" @click="applyAthletePreset('priced')">Wszyscy wycenieni</button>
            <button class="small-preset-btn highlight-gold" :class="{ active: currentPreset === 'scored' }" @click="applyAthletePreset('scored')">⚡ Punktowali w sezonie ({{ scoredCount }})</button>
            <button class="small-preset-btn" :class="{ active: currentPreset === 'top30' }" @click="applyAthletePreset('top30')">TOP 30 Wycenionych</button>
            <button class="small-preset-btn" :class="{ active: currentPreset === 'pol' }" @click="applyAthletePreset('pol')">Tylko Polacy 🇵🇱</button>
            <button class="small-preset-btn danger" @click="applyAthletePreset('clear')">Wyczyść listę</button>
          </div>
        </div>

        <div class="card-body">
          <!-- Wyszukiwarka do dodawania skoczka -->
          <div class="add-athlete-wrapper">
            <label>Dodaj dowolnego aktywnego skoczka z bazy do listy:</label>
            <div class="search-box-relative">
              <input
                v-model="athleteSearchQuery"
                @focus="showAutocomplete = true"
                type="text"
                class="custom-input"
                placeholder="Wpisz nazwisko skoczka (np. Stoch, Kubacki, Prevc, Kraft)..."
              />
              <div v-if="showAutocomplete && filteredAvailableAthletes.length > 0" class="autocomplete-dropdown">
                <div
                  v-for="ath in filteredAvailableAthletes"
                  :key="ath.fis_code"
                  class="autocomplete-item"
                  @click="addAthlete(ath)"
                >
                  <CountryFlag :code="ath.country_code" size="xs" />
                  <span class="ath-name">{{ ath.full_name }}</span>
                  <span class="ath-country">({{ ath.country_code }})</span>
                  <span v-if="ath.price" class="ath-price-tag">💰 {{ Number(ath.price).toFixed(1) }}</span>
                  <span v-if="ath.has_wc" class="ath-wc-tag">PŚ</span>
                  <span class="ath-add-plus">+ Dodaj</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Siatka aktualnie wybranych skoczków z cenami i przyciskami ✕ -->
          <div class="selected-chips-grid">
            <div
              v-for="ath in selectedAthletesDetails"
              :key="ath.fis_code"
              class="athlete-chip"
            >
              <CountryFlag :code="ath.country_code" size="xs" />
              <span class="chip-name">{{ ath.full_name }}</span>
              <span v-if="ath.price" class="chip-price">💰 {{ Number(ath.price).toFixed(1) }}</span>
              <button
                class="chip-remove"
                @click.stop="removeAthlete(ath.fis_code)"
                title="Usuń z listy startowej"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- KOMUNIKAT BŁĘDU -->
      <div v-if="errorMsg" class="error-banner">
        ⚠️ {{ errorMsg }}
      </div>

      <!-- LOADER PODCZAS GENEROWANIA -->
      <div v-if="isPredicting" class="loader-box">
        <SkiLoader />
        <p class="loader-txt">Sieć neuronowa analizuje parametry skoczni, pogodę, powtarzalność i formę {{ selectedFisCodes.length }} skoczków...</p>
      </div>

      <!-- WYNIKI PREDYKCJI -->
      <section v-if="!isPredicting && predictions.length > 0" class="results-section">
        <!-- SHOWCASE PODIUM (TOP 3) -->
        <div class="podium-section">
          <h2 class="section-title">🏆 Przewidywane Podium</h2>
          <div class="podium-grid">
            <!-- 2. MIEJSCE (SREBRO) -->
            <div class="podium-card silver" v-if="podiumAthletes[1]">
              <div class="podium-step">2</div>
              <div class="podium-flag-box">
                <CountryFlag :code="podiumAthletes[1].country" size="md" :show-code="true" />
                <span v-if="podiumAthletes[1].price" class="p-price">💰 {{ Number(podiumAthletes[1].price).toFixed(1) }}</span>
              </div>
              <h4 class="p-name">{{ podiumAthletes[1].name }}</h4>
              <div class="p-metrics">
                <div class="metric-dist">
                  <span class="m-val">{{ podiumAthletes[1].predicted_distance.toFixed(1) }} m</span>
                  <span class="m-label">Przewidywana odległość</span>
                </div>
                <div class="metric-pts">
                  <span class="m-val">{{ podiumAthletes[1].predicted_points.toFixed(1) }} pkt</span>
                  <span class="m-label">Punkty łączna nota</span>
                </div>
              </div>
              <div class="p-badge">
                Podium: <strong>{{ podiumAthletes[1].podium_probability ?? 0 }}%</strong> | Top 30: <strong>{{ podiumAthletes[1].top30_probability ?? 0 }}%</strong>
              </div>
            </div>

            <!-- 1. MIEJSCE (ZŁOTO - ŚRODEK, WIĘKSZE) -->
            <div class="podium-card gold" v-if="podiumAthletes[0]">
              <div class="gold-crown">👑</div>
              <div class="podium-step">1</div>
              <div class="podium-flag-box">
                <CountryFlag :code="podiumAthletes[0].country" size="lg" :show-code="true" />
                <span v-if="podiumAthletes[0].price" class="p-price">💰 {{ Number(podiumAthletes[0].price).toFixed(1) }}</span>
              </div>
              <h3 class="p-name">{{ podiumAthletes[0].name }}</h3>
              <div class="p-metrics">
                <div class="metric-dist">
                  <span class="m-val">{{ podiumAthletes[0].predicted_distance.toFixed(1) }} m</span>
                  <span class="m-label">Przewidywana odległość</span>
                </div>
                <div class="metric-pts">
                  <span class="m-val">{{ podiumAthletes[0].predicted_points.toFixed(1) }} pkt</span>
                  <span class="m-label">Punkty łączna nota</span>
                </div>
              </div>
              <div class="p-badge win-badge">
                Wygrana: <strong>{{ podiumAthletes[0].win_probability ?? 0 }}%</strong> | Podium: <strong>{{ podiumAthletes[0].podium_probability ?? 0 }}%</strong> | Top 30: <strong>{{ podiumAthletes[0].top30_probability ?? 0 }}%</strong>
              </div>
            </div>

            <!-- 3. MIEJSCE (BRĄZ) -->
            <div class="podium-card bronze" v-if="podiumAthletes[2]">
              <div class="podium-step">3</div>
              <div class="podium-flag-box">
                <CountryFlag :code="podiumAthletes[2].country" size="md" :show-code="true" />
                <span v-if="podiumAthletes[2].price" class="p-price">💰 {{ Number(podiumAthletes[2].price).toFixed(1) }}</span>
              </div>
              <h4 class="p-name">{{ podiumAthletes[2].name }}</h4>
              <div class="p-metrics">
                <div class="metric-dist">
                  <span class="m-val">{{ podiumAthletes[2].predicted_distance.toFixed(1) }} m</span>
                  <span class="m-label">Przewidywana odległość</span>
                </div>
                <div class="metric-pts">
                  <span class="m-val">{{ podiumAthletes[2].predicted_points.toFixed(1) }} pkt</span>
                  <span class="m-label">Punkty łączna nota</span>
                </div>
              </div>
              <div class="p-badge">
                Podium: <strong>{{ podiumAthletes[2].podium_probability ?? 0 }}%</strong> | Top 30: <strong>{{ podiumAthletes[2].top30_probability ?? 0 }}%</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- KORYTARZ POGODOWY I DYNAMIKA OKNA ZAWODÓW -->
        <div v-if="weatherCorridor" class="corridor-status-card">
          <div class="csc-left">
            <span
              class="corridor-pill"
              :class="`risk-${weatherCorridor.lottery_risk_level.toLowerCase()}`"
            >
              <span v-if="weatherCorridor.lottery_risk_level === 'HIGH'">🌪️ Loteria wiatrowa (Wysoka zmienność)</span>
              <span v-else-if="weatherCorridor.lottery_risk_level === 'MODERATE'">💨 Umiarkowana zmienność wiatru</span>
              <span v-else>🟢 Stabilne warunki laminarne</span>
            </span>
            <div class="csc-metrics">
              <span>Porywistość: <strong>{{ weatherCorridor.wind_volatility_index }}</strong></span>
              <span>Trend okna: <strong>{{ weatherCorridor.wind_trend_slope >= 0 ? '+' : '' }}{{ weatherCorridor.wind_trend_slope }} m/s</strong></span>
              <span>Drift temp.: <strong>{{ weatherCorridor.temperature_drift }} °C</strong></span>
            </div>
          </div>
          <div class="csc-right">
            <span class="corridor-note">
              Model przypisał dynamiczne warunki wyjścia na belkę do każdego zawodnika według kolejności startowej (niezależnie od numeru bib).
            </span>
          </div>
        </div>

        <!-- TABELA PEŁNYCH WYNIKÓW -->
        <div class="card table-card">
          <div class="table-toolbar">
            <div class="toolbar-left">
              <div class="title-with-legend">
                <h3>Klasyfikacja Końcowa ({{ filteredPredictions.length }} skoczków)</h3>
                <button class="legend-btn" @click="showLegendModal = !showLegendModal">
                  📖 Słownik Profili & Parametrów
                </button>
              </div>
              <div class="filter-pills">
                <button
                  class="pill-btn"
                  :class="{ active: filterMode === 'all' }"
                  @click="filterMode = 'all'"
                >
                  Wszyscy
                </button>
                <button
                  class="pill-btn"
                  :class="{ active: filterMode === 'top30' }"
                  @click="filterMode = 'top30'"
                >
                  TOP 30 (Awans)
                </button>
                <button
                  class="pill-btn"
                  :class="{ active: filterMode === 'pol' }"
                  @click="filterMode = 'pol'"
                >
                  🇵🇱 Tylko Polacy
                </button>
                <button
                  class="pill-btn"
                  :class="{ active: filterMode === 'podium' }"
                  @click="filterMode = 'podium'"
                >
                  Kandydaci do podium (≥10%)
                </button>
                <button
                  class="pill-btn"
                  :class="{ active: filterMode === 'clutch' }"
                  @click="filterMode = 'clutch'"
                >
                  🔥 Zwierzęta konkursowe
                </button>
              </div>
            </div>

            <div class="toolbar-right">
              <input
                v-model="tableSearch"
                type="text"
                class="search-input"
                placeholder="Szukaj skoczka..."
              />
            </div>
          </div>

          <!-- SŁOWNIK POJĘĆ, WSKAŹNIKÓW I PROFILI -->
          <div v-if="showLegendModal" class="legend-panel">
            <div class="legend-header-bar">
              <h4>📖 Słownik pojęć, wskaźników i profili zawodników</h4>
              <button class="legend-close-btn" @click="showLegendModal = false">✕ Zamknij</button>
            </div>

            <!-- SEKCJA 1: STATUSY ZAWODNIKA -->
            <div class="legend-section">
              <h5 class="legend-subheading">🏷️ Statusy i oznaczenia zawodnika</h5>
              <div class="legend-grid">
                <div class="legend-item">
                  <span class="debutant-pill">DEBIUTANT</span>
                  <p><strong>Debiutant w Pucharze Świata:</strong> Oznaczany wyłącznie, gdy skoczek ma <strong>0 startów w konkursie głównym Pucharu Świata</strong> (I seria po kwalifikacjach). Udział w kwalifikacjach lub treningach <strong>NIE znosi</strong> statusu debiutanta! Status znika dopiero po awansie i oddaniu skoku w I serii konkursu głównego PŚ / IO / MŚ.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-scored">⚡ Punktował w sezonie</span>
                  <p>Zawodnik zajął miejsce w czołowej trzydziestce (Top 30) przynajmniej w jednym konkursie Pucharu Świata w <strong>trwającym sezonie zimowym</strong>.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-active">❄️ Aktywność zimowa</span>
                  <p>Weryfikacja realnych startów na śniegu w trwającym sezonie. Skoczkowie powracający po kontuzji lub bez powołań (0 startów zimowych) podlegają korekcie niepewności.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-esm">💰 Cena ESM (Fantasy)</span>
                  <p>Wycena zawodnika w grze Ekstra Skoki Menadżer. Jest to <strong>wyłącznie informacja pomocnicza dla graczy</strong> — cena <strong>nie ma absolutnie żadnego wpływu na wyliczenia sztucznej inteligencji</strong>.</p>
                </div>
              </div>
            </div>

            <!-- SEKCJA 2: WSKAŹNIKI ANALIZY AI I FORM -->
            <div class="legend-section">
              <h5 class="legend-subheading">📊 Wskaźniki analizy AI i symulacji</h5>
              <div class="legend-grid">
                <div class="legend-item">
                  <span class="badge-item badge-top30">Awans Top 30 (%)</span>
                  <p>Prawdopodobieństwo awansu do II serii (miejsca 1–30) wyliczone metodą <strong>Monte Carlo (300 symulacji konkursu)</strong> przy uwzględnieniu losowości wiatru i dyspozycji.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-podium">Szansa Podium (%)</span>
                  <p>Prawdopodobieństwo ukończenia zawodów w pierwszej trójce (miejsca 1–3) wyznaczone w symulacji wielowariantowej.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-form">Forma bieżąca (28 dni / ▲▼)</span>
                  <p>Dyspozycja skoczka z ostatnich 4 tygodni w relacji do średniej wielotygodniowej. Strzałka <strong>▲</strong> oznacza zwyżkę formy i wysoki trend punktowy.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-venue">Afinitet do skoczni (Historia)</span>
                  <p>Model analizuje <strong>historyczną dyspozycję zawodnika na tej konkretnej skoczni i w tej miejscowości</strong> (np. Ruka HS142) oraz dopasowanie do profilu obiektu (skocznia normalna/duża/mamucia).</p>
                </div>
              </div>
            </div>

            <!-- SEKCJA 3: PROFILE STYLU I PSYCHIKI -->
            <div class="legend-section">
              <h5 class="legend-subheading">🧠 Psychologia i profile sportowe</h5>
              <div class="legend-grid">
                <div class="legend-item">
                  <span class="badge-item badge-clutch">🔥 Zwierzę konkursowe</span>
                  <p>Zyskuje statystycznie $\ge 2.5$ pozycji w konkursie w porównaniu do treningów i kwalifikacji. Doskonale radzi sobie z presją.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-choker">📉 Syndrom treningów</span>
                  <p>W seriach próbnych osiąga wyższe lokaty niż w konkursie głównym (średni spadek o $\ge 3$ pozycje pod presją).</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-metronome">🎯 Metronom</span>
                  <p>Wysoka powtarzalność prób ($>80\%$). Minimalna wariancja odległości między seriami treningowymi i konkursowymi.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-volatile">🎲 Chwiejny</span>
                  <p>Duży rozrzut skoków i wysoka amplituda punktowa. Skoczek podatny na dyspozycję chwili i podmuchy wiatru.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-flying">🦅 Lotnik</span>
                  <p>Specjalista od skoczni mamucich (HS 200+). Osiąga na nich wyraźnie większe odległości niż na obiektach tradycyjnych.</p>
                </div>
                <div class="legend-item">
                  <span class="badge-item badge-balanced">⚖️ Równy poziom</span>
                  <p>Skacze na zbliżonym poziomie w seriach próbnych, kwalifikacyjnych i konkursowych bez wahań psychicznych.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="table-responsive">
            <table class="predictions-table">
              <thead>
                <tr>
                  <th
                    class="th-rank sortable-th"
                    :class="{ 'sorted-th': sortKey === 'predicted_rank' }"
                    @click="sortBy('predicted_rank')"
                    title="Sortuj po przewidywanej pozycji"
                  >
                    Msc
                    <span v-if="sortKey === 'predicted_rank'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-athlete sortable-th"
                    :class="{ 'sorted-th': sortKey === 'name' }"
                    @click="sortBy('name')"
                    title="Sortuj alfabetycznie po nazwisku"
                  >
                    Skoczek
                    <span v-if="sortKey === 'name'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-price sortable-th"
                    :class="{ 'sorted-th': sortKey === 'price' }"
                    @click="sortBy('price')"
                    title="Sortuj po cenie w Fantasy"
                  >
                    Cena
                    <span v-if="sortKey === 'price'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-dist sortable-th"
                    :class="{ 'sorted-th': sortKey === 'predicted_distance' }"
                    @click="sortBy('predicted_distance')"
                    title="Sortuj po prognozowanym dystansie"
                  >
                    Dystans
                    <span v-if="sortKey === 'predicted_distance'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-pts sortable-th"
                    :class="{ 'sorted-th': sortKey === 'predicted_points' }"
                    @click="sortBy('predicted_points')"
                    title="Sortuj po sumarycznych punktach"
                  >
                    Punkty
                    <span v-if="sortKey === 'predicted_points'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-top30 sortable-th"
                    :class="{ 'sorted-th': sortKey === 'top30_probability' }"
                    @click="sortBy('top30_probability')"
                    title="Sortuj po szansie na awans do II serii"
                  >
                    Top 30
                    <span v-if="sortKey === 'top30_probability'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-chance sortable-th"
                    :class="{ 'sorted-th': sortKey === 'podium_probability' }"
                    @click="sortBy('podium_probability')"
                    title="Sortuj po szansie na podium"
                  >
                    Podium
                    <span v-if="sortKey === 'podium_probability'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th
                    class="th-form sortable-th"
                    :class="{ 'sorted-th': sortKey === 'form_score' }"
                    @click="sortBy('form_score')"
                    title="Sortuj po wskaźniku formy"
                  >
                    Forma
                    <span v-if="sortKey === 'form_score'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th class="th-profiles">Profil</th>
                  <th
                    class="th-repeat sortable-th"
                    :class="{ 'sorted-th': sortKey === 'consistency_score' }"
                    @click="sortBy('consistency_score')"
                    title="Sortuj po wskaźniku powtarzalności prób"
                  >
                    Stabilność
                    <span v-if="sortKey === 'consistency_score'" class="sort-indicator">
                      {{ sortOrder === 'asc' ? '▲' : '▼' }}
                    </span>
                  </th>
                  <th class="th-action">✕</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="ath in filteredPredictions"
                  :key="ath.fis_code"
                  :class="{
                    'row-gold': ath.predicted_rank === 1,
                    'row-silver': ath.predicted_rank === 2,
                    'row-bronze': ath.predicted_rank === 3,
                    'row-top10': ath.predicted_rank > 3 && ath.predicted_rank <= 10,
                    'row-top30': ath.predicted_rank > 10 && ath.predicted_rank <= 30
                  }"
                >
                  <!-- MIEJSCE -->
                  <td class="td-rank">
                    <span class="rank-badge" :class="'rank-' + ath.predicted_rank">
                      {{ ath.predicted_rank }}
                    </span>
                  </td>

                  <!-- SKOCZEK -->
                  <td class="td-athlete">
                    <div class="athlete-cell">
                      <CountryFlag :code="ath.country" size="sm" />
                      <RouterLink :to="'/athletes/' + ath.fis_code" class="athlete-link">
                        {{ ath.name }}
                      </RouterLink>
                      <span class="country-tag">{{ ath.country }}</span>
                      <span
                        v-if="ath.is_tier_debutant && selectedCompetitionType === 'WC'"
                        class="debutant-pill"
                        title="Debiutant w Pucharze Świata (0 dotychczasowych startów w PŚ)"
                      >
                        DEBIUTANT
                      </span>
                    </div>
                  </td>

                  <!-- CENA (jeśli null to '-') -->
                  <td class="td-price">
                    <span v-if="ath.price !== null && ath.price !== undefined" class="price-badge">
                      {{ Number(ath.price).toFixed(1) }}
                    </span>
                    <span v-else class="price-null">-</span>
                  </td>

                  <!-- DYSTANS + PASEK WIZUALNY -->
                  <td class="td-dist">
                    <div class="dist-container">
                      <div class="dist-header-row">
                        <span class="dist-num">{{ ath.predicted_distance.toFixed(1) }} m</span>
                        <span
                          v-if="ath.effective_headwind !== undefined"
                          class="wind-micro-badge"
                          :class="ath.effective_headwind >= 0 ? 'wind-head' : 'wind-tail'"
                          :title="`Zinterpolowany wiatr w momencie skoku: ${ath.effective_headwind >= 0 ? '+' : ''}${ath.effective_headwind} m/s`"
                        >
                          {{ ath.effective_headwind >= 0 ? '↗' : '↘' }}{{ ath.effective_headwind >= 0 ? '+' : '' }}{{ ath.effective_headwind }}
                        </span>
                      </div>
                      <div class="dist-bar-track">
                        <div
                          class="dist-bar-fill"
                          :style="{
                            width: Math.min(100, Math.max(10, (ath.predicted_distance / currentHill.size) * 100)) + '%'
                          }"
                          :class="{
                            'bar-over-hs': ath.predicted_distance >= currentHill.size,
                            'bar-top': ath.predicted_distance >= currentHill.size * 0.95
                          }"
                        ></div>
                      </div>
                    </div>
                  </td>

                  <!-- PUNKTY -->
                  <td class="td-pts">
                    <strong class="pts-bold">{{ ath.predicted_points.toFixed(1) }}</strong> <small class="pts-unit">pkt</small>
                  </td>

                  <!-- SZANSA NA TOP 30 (AWANS DO II SERII) -->
                  <td class="td-top30">
                    <div class="top30-badge" :class="{
                      'top30-high': (ath.top30_probability ?? 0) >= 80,
                      'top30-med': (ath.top30_probability ?? 0) >= 40 && (ath.top30_probability ?? 0) < 80,
                      'top30-low': (ath.top30_probability ?? 0) < 40
                    }">
                      {{ ath.top30_probability != null ? ath.top30_probability : 0 }}%
                    </div>
                  </td>

                  <!-- SZANSA PODIUM -->
                  <td class="td-chance">
                    <div class="chance-box" v-if="ath.podium_probability != null && ath.podium_probability > 0">
                      <div class="chance-bar">
                        <div
                          class="chance-fill"
                          :style="{ width: Math.min(100, ath.podium_probability) + '%' }"
                        ></div>
                      </div>
                      <span class="chance-val">{{ ath.podium_probability }}%</span>
                    </div>
                    <span v-else class="chance-zero">&lt;1%</span>
                  </td>

                  <!-- FORMA -->
                  <td class="td-form">
                    <div class="form-cell-wrapper" :title="ath.recent_form_score ? `Bieżąca dyspozycja (21 dni): ${ath.recent_form_score}% | Średnia ważona: ${ath.form_score}%` : `Forma: ${ath.form_score}%`">
                      <span
                        class="form-pill"
                        :class="{
                          'form-high': ath.form_score >= 95,
                          'form-med': ath.form_score >= 88 && ath.form_score < 95,
                          'form-low': ath.form_score < 88
                        }"
                      >
                        {{ ath.form_score }}%
                      </span>
                      <span
                        v-if="ath.recent_form_score"
                        class="recent-form-tag"
                        :class="ath.recent_form_score >= ath.form_score ? 'trend-up' : 'trend-down'"
                      >
                        {{ ath.recent_form_score >= ath.form_score ? '▲' : '▼' }}{{ ath.recent_form_score }}%
                      </span>
                    </div>
                  </td>

                  <!-- PROFILE WIELOWYMIAROWE Z TOOLTIPAMI -->
                  <td class="td-profiles">
                    <div class="profiles-flex">
                      <span
                        v-for="prof in ath.profiles"
                        :key="prof.code"
                        class="profile-tag"
                        :class="prof.tag_class"
                        :title="prof.description"
                      >
                        {{ prof.icon }} {{ prof.label }}
                      </span>
                    </div>
                  </td>

                  <!-- POWTARZALNOŚĆ -->
                  <td class="td-repeat">
                    <div class="repeat-box" :title="'Wskaźnik stabilności powtarzalnych prób: ' + ath.consistency_score + '%'">
                      <div class="repeat-circle" :style="{
                        background: ath.consistency_score >= 80 ? '#10b981' : ath.consistency_score >= 50 ? '#3b82f6' : '#f59e0b'
                      }"></div>
                      <span class="repeat-num">{{ ath.consistency_score.toFixed(0) }}%</span>
                    </div>
                  </td>

                  <!-- AKCJA USUŃ Z LISTY -->
                  <td class="td-action">
                    <button
                      class="btn-row-remove"
                      @click="removeAthlete(ath.fis_code)"
                      title="Usuń z listy startowej"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.predictions-page {
  min-height: 100vh;
  background-color: #f8fafc;
  color: #0f172a;
  padding-bottom: 60px;
}

/* HERO */
.page-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0369a1 100%);
  color: white;
  padding: 48px 24px 40px;
  position: relative;
  overflow: hidden;
}

.hero-content {
  max-width: 1540px;
  margin: 0 auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-bottom: 16px;
  backdrop-filter: blur(8px);
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 12px 0;
  letter-spacing: -0.02em;
}

.hero-desc {
  font-size: 1.05rem;
  line-height: 1.5;
  color: #cbd5e1;
  max-width: 850px;
  margin: 0 0 24px 0;
}

.model-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 18px;
  border-radius: 10px;
  max-width: 100%;
  box-sizing: border-box;
  font-size: 0.88rem;
}

.meta-divider {
  color: #475569;
}

.meta-label {
  color: #94a3b8;
  margin-right: 6px;
}

.meta-val {
  color: #38bdf8;
}

/* LAYOUT */
.container {
  max-width: 1540px;
  margin: 0 auto;
  padding: 0 24px;
}

.main-layout {
  margin-top: -24px;
  position: relative;
  z-index: 10;
}

/* CARDS */
.card {
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
  background: #ffffff;
}

.card-header h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.card-body {
  padding: 22px;
}

/* CONTROL GRID */
.control-grid {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 24px;
  margin-bottom: 24px;
}

@media (max-width: 900px) {
  .control-grid {
    grid-template-columns: 1fr;
  }
}

/* FORMS */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.84rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
}

.form-row {
  display: flex;
  gap: 14px;
}

.form-row .half {
  flex: 1;
}

.custom-select,
.custom-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.92rem;
  color: #0f172a;
  background: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.custom-select:focus,
.custom-input:focus {
  outline: none;
  border-color: #0284c7;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.text-btn {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.text-btn:hover {
  text-decoration: underline;
}

/* SKOCZNIA SUMMARY BADGE */
.hill-summary-badge {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 12px 14px;
  border-radius: 10px;
  margin-top: 14px;
  box-sizing: border-box;
}

.h-badge-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.h-name {
  font-weight: 700;
  color: #166534;
  font-size: 1.05rem;
}

.h-type {
  background: #dcfce7;
  color: #15803d;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.h-hs {
  font-size: 1.15rem;
  font-weight: 800;
  color: #166534;
}

/* LISTA STARTOWA TOGGLE */
.start-list-toggle-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-sizing: border-box;
}

.start-list-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.sl-title {
  font-size: 0.86rem;
  font-weight: 600;
  color: #475569;
}

.sl-count {
  font-size: 0.95rem;
  color: #0284c7;
  font-weight: 800;
}

.sl-badge {
  background: #fef3c7;
  color: #b45309;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.manage-list-btn {
  background: white;
  border: 1px solid #cbd5e1;
  color: #0369a1;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.manage-list-btn:hover {
  background: #f0f9ff;
  border-color: #7dd3fc;
}

@media (max-width: 540px) {
  .start-list-toggle-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .manage-list-btn {
    width: 100%;
    text-align: center;
  }
}

/* WEEKEND CONTEXT BANNER */
.weekend-context-banner {
  background: #ecfeff;
  border: 1.5px solid #a5f3fc;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 24px;
}

.wcb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  color: #0891b2;
  margin-bottom: 8px;
}

.wcb-icon {
  font-size: 1.1rem;
}

.wcb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.wcb-tag {
  background: white;
  border: 1px solid #cffafe;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #0e7490;
}

.tag-qua {
  border-color: #fde047;
  color: #854d0e;
}

.tag-competition {
  border-color: #86efac;
  color: #166534;
}

/* START LIST MANAGER CARD */
.start-list-manager-card {
  margin-bottom: 24px;
  border-color: #bae6fd;
}

.manager-presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.small-preset-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.small-preset-btn:hover {
  background: #e2e8f0;
}

.small-preset-btn.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fff5f5;
}

.small-preset-btn.danger:hover {
  background: #fee2e2;
}

.add-athlete-wrapper {
  margin-bottom: 16px;
}

.add-athlete-wrapper label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
}

.search-box-relative {
  position: relative;
}

.autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 100;
  margin-top: 4px;
  max-height: 250px;
  overflow-y: auto;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.15s;
}

.autocomplete-item:hover {
  background: #f0f9ff;
}

.ath-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.ath-country {
  font-size: 0.8rem;
  color: #64748b;
}

.ath-price-tag {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 4px;
}

.ath-wc-tag {
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
}

.ath-add-plus {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 700;
  color: #16a34a;
}

.selected-chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.athlete-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: white;
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.82rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

.chip-name {
  font-weight: 600;
  color: #0f172a;
}

.chip-price {
  font-size: 0.72rem;
  color: #b45309;
  font-weight: 800;
}

.chip-remove {
  background: none;
  border: none;
  color: #94a3b8;
  font-weight: 800;
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0 2px;
}

.chip-remove:hover {
  color: #ef4444;
}

/* WEATHER CARD */
.refresh-weather-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 6px 12px;
  border-radius: 7px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-weather-btn:hover {
  background: #e2e8f0;
}

.refresh-weather-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  display: inline-block;
  animation: spin 1s infinite linear;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.weather-source-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.source-tag {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}

.source-msg {
  font-size: 0.82rem;
  color: #64748b;
}

.weather-presets {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}

.presets-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
}

.preset-btn {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
  color: #0284c7;
}

/* SLIDERS */
.sliders-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 22px;
}

.slider-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 12px 16px;
  border-radius: 10px;
}

.slider-box.highlight {
  background: #f0f9ff;
  border: 1.5px solid #bae6fd;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.86rem;
  font-weight: 600;
}

.s-title {
  color: #0369a1;
}

.s-value {
  font-size: 0.95rem;
  font-weight: 700;
}

.s-value.positive {
  color: #16a34a;
}

.s-value.negative {
  color: #dc2626;
}

.s-value small {
  font-size: 0.78rem;
  font-weight: 600;
}

.range-slider {
  width: 100%;
  accent-color: #0284c7;
  cursor: pointer;
}

.headwind-slider {
  accent-color: #16a34a;
}

.slider-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 4px;
}

.sliders-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

@media (max-width: 600px) {
  .sliders-row {
    grid-template-columns: 1fr;
  }
}

.slider-box.mini {
  padding: 8px 12px;
}

.slider-box.mini .slider-header {
  font-size: 0.78rem;
  margin-bottom: 6px;
}

/* RUN PREDICTION BUTTON */
.run-prediction-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  transition: all 0.2s;
}

.run-prediction-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(2, 132, 199, 0.45);
}

.run-prediction-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* LOADER & ERROR */
.loader-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loader-txt {
  margin-top: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: #475569;
}

.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 14px 20px;
  border-radius: 10px;
  margin-bottom: 24px;
  font-weight: 600;
}

/* PODIUM SECTION */
.podium-section {
  margin-bottom: 40px;
}

.section-title {
  font-size: 1.45rem;
  font-weight: 800;
  margin-bottom: 20px;
  color: #0f172a;
}

.podium-grid {
  display: grid;
  grid-template-columns: 1fr 1.15fr 1fr;
  align-items: end;
  gap: 20px;
}

@media (max-width: 880px) {
  .podium-grid {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}

.podium-card {
  background: white;
  border-radius: 16px;
  padding: 24px 20px;
  text-align: center;
  position: relative;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.06);
  border: 2px solid transparent;
  transition: transform 0.2s;
}

.podium-card:hover {
  transform: translateY(-4px);
}

.podium-card.gold {
  border-color: #f59e0b;
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
  padding: 32px 22px;
  box-shadow: 0 14px 30px -5px rgba(245, 158, 11, 0.2);
}

.podium-card.silver {
  border-color: #94a3b8;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.podium-card.bronze {
  border-color: #d97706;
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%);
}

.gold-crown {
  font-size: 2.2rem;
  margin-bottom: -10px;
}

.podium-step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  font-weight: 900;
  font-size: 1.1rem;
  margin-bottom: 12px;
}

.gold .podium-step {
  background: #f59e0b;
  color: white;
}

.silver .podium-step {
  background: #94a3b8;
  color: white;
}

.bronze .podium-step {
  background: #b45309;
  color: white;
}

.podium-flag-box {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}

.p-flag {
  width: 24px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.p-country {
  font-size: 0.85rem;
  font-weight: 700;
  color: #475569;
}

.p-price {
  font-size: 0.75rem;
  font-weight: 800;
  color: #b45309;
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 4px;
}

.p-name {
  margin: 0 0 14px 0;
  font-weight: 800;
  color: #0f172a;
}

.gold .p-name {
  font-size: 1.35rem;
}

.p-metrics {
  display: flex;
  justify-content: space-around;
  padding: 12px 0;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 14px;
}

.metric-dist .m-val {
  display: block;
  font-size: 1.3rem;
  font-weight: 800;
  color: #0369a1;
}

.metric-pts .m-val {
  display: block;
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
}

.m-label {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 600;
}

.p-badge {
  font-size: 0.8rem;
  color: #475569;
  background: rgba(0, 0, 0, 0.04);
  padding: 6px 12px;
  border-radius: 8px;
}

.p-badge strong {
  color: #0f172a;
}

.win-badge {
  background: #fef3c7;
  color: #92400e;
}

.win-badge strong {
  color: #b45309;
}

/* TABLE CARD */
.table-card {
  margin-top: 20px;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #f1f5f9;
}

.title-with-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
}

.title-with-legend h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.legend-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #0369a1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.legend-btn:hover {
  background: #e0f2fe;
}

/* SŁOWNIK POJĘĆ I PROFILI */
.legend-panel {
  background: #f8fafc;
  border-bottom: 1px solid #cbd5e1;
  padding: 18px 24px;
}

.legend-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 10px;
}

.legend-header-bar h4 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}

.legend-close-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.legend-close-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.legend-section {
  margin-bottom: 20px;
}

.legend-section:last-child {
  margin-bottom: 0;
}

.legend-subheading {
  margin: 0 0 10px 0;
  font-size: 0.84rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.legend-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 1200px) {
  .legend-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 700px) {
  .legend-grid {
    grid-template-columns: 1fr;
  }
}

.legend-item {
  background: white;
  border: 1px solid #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.legend-item p {
  margin: 8px 0 0 0;
  font-size: 0.78rem;
  color: #475569;
  line-height: 1.45;
}

.badge-scored {
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde047;
}

.badge-active {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}

.badge-esm {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.badge-top30 {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
}

.badge-podium {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.badge-form {
  background: #f3e8ff;
  color: #6b21a8;
  border: 1px solid #d8b4fe;
}

.badge-venue {
  background: #ccfbf1;
  color: #0f766e;
  border: 1px solid #5eead4;
}

.filter-pills {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill-btn {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}

.pill-btn:hover {
  background: #e2e8f0;
}

.pill-btn.active {
  background: #0284c7;
  border-color: #0284c7;
  color: white;
}

.search-input {
  padding: 8px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.88rem;
  width: 220px;
}

.search-input:focus {
  outline: none;
  border-color: #0284c7;
}

.table-responsive {
  overflow-x: auto;
  width: 100%;
  -webkit-overflow-scrolling: touch;
}

.predictions-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.82rem;
}

.predictions-table th {
  background: #f8fafc;
  color: #475569;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 8px;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}

.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s, color 0.15s;
}

.sortable-th:hover {
  background-color: #f1f5f9;
  color: #0284c7;
}

.sortable-th.sorted-th {
  color: #0284c7;
  background-color: #f0f9ff;
  border-bottom-color: #0284c7;
}

.sort-indicator {
  display: inline-block;
  margin-left: 4px;
  font-size: 0.72rem;
  color: #0284c7;
  vertical-align: middle;
}

.predictions-table td {
  padding: 7px 8px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.82rem;
  vertical-align: middle;
}

/* TH & TD SPECIFIC ALIGNMENTS AND SIZES */
.th-rank, .td-rank {
  width: 42px;
  text-align: center;
  padding-left: 10px;
}

.th-athlete, .td-athlete {
  min-width: 170px;
  max-width: 220px;
}

.th-price, .td-price {
  width: 66px;
  text-align: center;
  white-space: nowrap;
}

.price-badge {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.76rem;
  font-weight: 800;
}

.price-null {
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.85rem;
}

.th-dist, .td-dist {
  width: 100px;
}

.th-pts, .td-pts {
  width: 80px;
  white-space: nowrap;
}

.pts-bold {
  color: #0f172a;
  font-size: 0.92rem;
  font-weight: 800;
}

.pts-unit {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 500;
}

.th-top30, .td-top30 {
  width: 70px;
  text-align: center;
}

.th-chance, .td-chance {
  width: 80px;
}

.th-form, .td-form {
  width: 62px;
  text-align: center;
}

.th-profiles, .td-profiles {
  min-width: 160px;
}

.th-repeat, .td-repeat {
  width: 75px;
}

.th-action, .td-action {
  width: 36px;
  text-align: center;
  padding-right: 10px;
}

/* ROW HIGHLIGHTS */
.row-gold {
  background: #fffbeb !important;
}

.row-silver {
  background: #f8fafc !important;
}

.row-bronze {
  background: #fff7ed !important;
}

.row-top10 {
  background: #f0fdf4;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  font-weight: 800;
  font-size: 0.8rem;
  background: #f1f5f9;
  color: #334155;
}

.rank-1 {
  background: #f59e0b;
  color: white;
}

.rank-2 {
  background: #94a3b8;
  color: white;
}

.rank-3 {
  background: #b45309;
  color: white;
}

.athlete-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.mini-flag {
  width: 18px;
  height: 12px;
  border-radius: 2px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.athlete-link {
  font-weight: 700;
  color: #0f172a;
  text-decoration: none;
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.athlete-link:hover {
  color: #0284c7;
  text-decoration: underline;
}

.country-tag {
  font-size: 0.68rem;
  font-weight: 600;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.row-price-tag {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}

/* DIST BAR */
.dist-container {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 85px;
}

.dist-num {
  font-weight: 700;
  color: #0369a1;
  font-size: 0.82rem;
}

.dist-bar-track {
  height: 4px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.dist-bar-fill {
  height: 100%;
  background: #38bdf8;
  border-radius: 9999px;
}

.bar-top {
  background: #0284c7;
}

.bar-over-hs {
  background: #16a34a;
}

/* TOP 30 BADGE */
.top30-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}

.top30-high {
  background: #dcfce7;
  color: #15803d;
}

.top30-med {
  background: #fef9c3;
  color: #854d0e;
}

.top30-low {
  background: #f1f5f9;
  color: #64748b;
}

/* CHANCE */
.chance-box {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chance-bar {
  width: 36px;
  height: 4px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
  flex-shrink: 0;
}

.chance-fill {
  height: 100%;
  background: #f59e0b;
  border-radius: 9999px;
}

.chance-val {
  font-size: 0.74rem;
  font-weight: 700;
  color: #b45309;
  white-space: nowrap;
}

.chance-zero {
  font-size: 0.72rem;
  color: #94a3b8;
}

/* FORM PILLS */
.form-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  white-space: nowrap;
}

.form-high {
  background: #dcfce7;
  color: #15803d;
}

.form-med {
  background: #e0f2fe;
  color: #0369a1;
}

.form-low {
  background: #f1f5f9;
  color: #64748b;
}

/* PROFILES FLEX */
.profiles-flex {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
}

.profile-tag, .badge-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  cursor: help;
  white-space: nowrap;
}

.badge-clutch {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.badge-choker {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.badge-metronome {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.badge-volatile {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

.badge-flying {
  background: #fdf4ff;
  color: #a21caf;
  border: 1px solid #f0abfc;
}

.badge-balanced {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.badge-gem {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

/* REPEAT BOX */
.repeat-box {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: help;
  white-space: nowrap;
}

.repeat-circle {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.repeat-num {
  font-weight: 700;
  font-size: 0.78rem;
  color: #334155;
}

.btn-row-remove {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.85rem;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
}

.btn-row-remove:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* ========================================================
   STYLES: KORYTARZ POGODOWY I DYNAMIKA OKNA ZAWODÓW
   ======================================================== */
.corridor-status-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #0284c7;
  border-radius: 8px;
  padding: 12px 18px;
  margin-bottom: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.csc-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.corridor-pill {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.corridor-pill.risk-high {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}
.corridor-pill.risk-moderate {
  background: #fffbeb;
  color: #d97706;
  border: 1px solid #fde68a;
}
.corridor-pill.risk-low {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.csc-metrics {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 0.82rem;
  color: #475569;
}
.csc-metrics strong {
  color: #0f172a;
}

.csc-right {
  font-size: 0.78rem;
  color: #64748b;
  max-width: 380px;
  text-align: right;
  line-height: 1.35;
}

.dist-header-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.wind-micro-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}
.wind-head {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.wind-tail {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

@media (max-width: 900px) {
  .corridor-status-card {
    flex-direction: column;
    align-items: flex-start;
  }
  .csc-right {
    text-align: left;
  }
}

/* ========================================================
   STYLES: RANGA ZAWODÓW (LIGA FIS) & SZYBKIE PRESETY
   ======================================================== */
.tier-select {
  font-weight: 600;
  color: #1e293b;
  border-left: 4px solid #6366f1;
}

.quick-preset-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pill-quick-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pill-quick-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.pill-quick-btn.active {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.pill-quick-btn.highlight-gold,
.small-preset-btn.highlight-gold {
  background: #fefce8;
  border-color: #fde047;
  color: #854d0e;
}
.pill-quick-btn.highlight-gold:hover,
.small-preset-btn.highlight-gold:hover {
  background: #fef08a;
  color: #713f12;
}
.pill-quick-btn.highlight-gold.active,
.small-preset-btn.highlight-gold.active {
  background: #eab308;
  border-color: #ca8a04;
  color: #ffffff;
}

.debutant-pill {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
  white-space: nowrap;
}

.form-cell-wrapper {
  display: flex;
  align-items: center;
  gap: 5px;
}

.recent-form-tag {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 4px;
  white-space: nowrap;
}
.recent-form-tag.trend-up {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.recent-form-tag.trend-down {
  background: #fff1f2;
  color: #be123c;
  border: 1px solid #fecdd3;
}

/* --- BANER NAJBLIŻSZYCH ZAWODÓW (FIS CALENDAR) --- */
.upcoming-comp-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid #3b82f6;
  border-left: 5px solid #3b82f6;
  border-radius: 12px;
  padding: 14px 20px;
  margin-bottom: 24px;
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.15);
  gap: 16px;
  flex-wrap: wrap;
}

.upcoming-comp-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upcoming-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  font-weight: 800;
  color: #60a5fa;
  text-transform: uppercase;
}

.pulse-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  animation: pulse-blue 2s infinite;
}

@keyframes pulse-blue {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.upcoming-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.92rem;
  color: #f1f5f9;
}

.upcoming-event-title strong {
  color: #ffffff;
  font-size: 1.02rem;
}

.upcoming-hill-spec {
  color: #94a3b8;
  margin-left: 4px;
}

.upcoming-timing {
  color: #cbd5e1;
}

.upcoming-timing strong {
  color: #38bdf8;
}

.upcoming-comp-actions {
  display: flex;
  align-items: center;
}

.btn-apply-upcoming {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  border: 1px solid #60a5fa;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-apply-upcoming:hover {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
}

/* ========================================================
   MOBILE UX & STICKY TABLE COLUMNS (PROGNOZY)
   ======================================================== */
.dist-num,
.pts-bold,
.price-badge,
.p-val,
.meta-val {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .page-hero {
    padding: 20px 14px;
  }
  .model-meta-bar {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .meta-divider {
    display: none;
  }
  .container.main-layout {
    padding: 0 8px 40px;
  }
  .card-body {
    padding: 14px;
  }
  .upcoming-comp-banner {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 14px;
  }
  .btn-apply-upcoming {
    width: 100%;
    justify-content: center;
  }
  .table-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 14px;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
  }
  .title-with-legend {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .filter-pills {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 6px;
  }
  .pill-btn {
    flex-shrink: 0;
  }
  .search-input {
    width: 100%;
    box-sizing: border-box;
  }

  /* Zamrożone kolumny: Pozycja (#) i Zawodnik */
  .predictions-table th.th-rank,
  .predictions-table td.td-rank {
    position: sticky;
    left: 0;
    z-index: 8;
    background: #ffffff;
    width: 40px;
    min-width: 40px;
    padding: 6px 4px;
  }
  .predictions-table th.th-rank {
    z-index: 10;
    background: #f8fafc;
  }
  .predictions-table th.th-athlete,
  .predictions-table td.td-athlete {
    position: sticky;
    left: 40px;
    z-index: 8;
    background: #ffffff;
    min-width: 155px;
    max-width: 175px;
    box-shadow: 4px 0 6px -2px rgba(0, 0, 0, 0.08);
  }
  .predictions-table th.th-athlete {
    z-index: 10;
    background: #f8fafc;
  }
  .predictions-table tr.row-gold td.td-rank,
  .predictions-table tr.row-gold td.td-athlete {
    background-color: #fefce8 !important;
  }
  .predictions-table tr.row-silver td.td-rank,
  .predictions-table tr.row-silver td.td-athlete {
    background-color: #f8fafc !important;
  }
  .predictions-table tr.row-bronze td.td-rank,
  .predictions-table tr.row-bronze td.td-athlete {
    background-color: #fff7ed !important;
  }
  .predictions-table tr.row-top10 td.td-rank,
  .predictions-table tr.row-top10 td.td-athlete {
    background-color: #f0fdf4 !important;
  }
  .predictions-table tr.row-top30 td.td-rank,
  .predictions-table tr.row-top30 td.td-athlete {
    background-color: #ffffff !important;
  }
}

@media (max-width: 600px) {
  .form-row {
    flex-direction: column;
    gap: 10px;
  }
  .sliders-row {
    grid-template-columns: 1fr !important;
  }
  .manager-presets {
    display: flex;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 6px;
  }
  .small-preset-btn {
    flex-shrink: 0;
  }
}
</style>
