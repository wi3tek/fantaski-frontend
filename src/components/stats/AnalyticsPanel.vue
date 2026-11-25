<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  groupedRows: any[]
  filteredVisibleAthletes: any[]
  currentHillType?: string
}>()

const sortKey = ref<string>('pointsPerPrice')
const sortOrder = ref<'asc' | 'desc'>('desc')
const hoveredAthlete = ref<any | null>(null)
const expandedAthlete = ref<string | null>(null)

// --- FILTRY WEWNĘTRZNE PANELU ANALITYCZNEGO ---
const searchQuery = ref('')
const filterOnlyPriced = ref(false)
const filterOnlyScoring = ref(false)
const filterMinJumps = ref(1)
const filterAchievement = ref<'all' | 'podium' | 'top10'>('all')

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== '' ||
    filterOnlyPriced.value ||
    filterOnlyScoring.value ||
    filterMinJumps.value > 1 ||
    filterAchievement.value !== 'all'
  )
})

const resetFilters = () => {
  searchQuery.value = ''
  filterOnlyPriced.value = false
  filterOnlyScoring.value = false
  filterMinJumps.value = 1
  filterAchievement.value = 'all'
}

const toggleAthleteExpansion = (name: string) => {
  expandedAthlete.value = expandedAthlete.value === name ? null : name
}

const sortBy = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    if (
      [
        'pointsPerPrice',
        'totalPoints',
        'avgPoints',
        'hitRate30',
        'hitRate20',
        'hitRate10',
        'hitRate3',
        'jumpCount',
        'trendDiff',
        'price',
      ].includes(key)
    ) {
      sortOrder.value = 'desc'
    } else {
      sortOrder.value = 'asc'
    }
  }
}

// Punkty FIS za miejsca 1-30 (oficjalna tabela Pucharu Świata)
const getPlacePoints = (rank: number): number => {
  const table: Record<number, number> = {
    1: 100, 2: 80, 3: 60, 4: 50, 5: 45, 6: 40, 7: 36, 8: 32, 9: 29, 10: 26,
    11: 24, 12: 22, 13: 20, 14: 18, 15: 16, 16: 15, 17: 14, 18: 13, 19: 12, 20: 11,
    21: 10, 22: 9, 23: 8, 24: 7, 25: 6, 26: 5, 27: 4, 28: 3, 29: 2, 30: 1
  }
  return table[rank] || 0
}

const computeMedian = (arr: number[]): number | null => {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const valMid = sorted[mid]
  if (valMid === undefined) return null
  if (sorted.length % 2 !== 0) {
    return valMid
  }
  const valPrev = sorted[mid - 1]
  if (valPrev === undefined) return valMid
  return (valPrev + valMid) / 2
}

interface AthleteStat {
  name: string
  price: number | null
  hasData: boolean
  jumpCount: number
  totalPoints: number
  avgPoints: number
  pointsPerPrice: number | null
  avgRank: number | null
  medianRank: number | null
  bestRank: number | null
  worstRank: number | null
  hitRate30: number
  hitRate20: number
  hitRate10: number
  hitRate3: number
  stdDev: number | null
  trendIcon: string
  trendClass: string
  trendText: string
  trendDiff: number | null
  hillBreakdown: {
    flyingCount: number
    flyingAvg: number | null
    largeCount: number
    largeAvg: number | null
    normalCount: number
    normalAvg: number | null
    preferenceText: string
  }
}

const getValueScoreClass = (val: number | null): string => {
  if (val === null) return ''
  if (val >= 25.0) return 'score-high'
  if (val >= 12.0) return 'score-med'
  return 'score-low'
}

// Obliczenie surowych wskaźników statystycznych dla każdego zawodnika
const rawAthleteAnalytics = computed<AthleteStat[]>(() => {
  if (props.groupedRows.length === 0) return []

  return props.filteredVisibleAthletes.map((athlete): AthleteStat => {
    const jumps: any[] = []
    props.groupedRows.forEach((row) => {
      if (row.athletes[athlete.name]) jumps.push(row.athletes[athlete.name])
    })

    if (jumps.length === 0) {
      return {
        name: athlete.name,
        price: athlete.price,
        hasData: false,
        jumpCount: 0,
        totalPoints: 0,
        avgPoints: 0,
        pointsPerPrice: null,
        avgRank: null,
        medianRank: null,
        bestRank: null,
        worstRank: null,
        hitRate30: 0,
        hitRate20: 0,
        hitRate10: 0,
        hitRate3: 0,
        stdDev: null,
        trendIcon: '➡️',
        trendClass: 'trend-neutral',
        trendText: 'Brak prób',
        trendDiff: null,
        hillBreakdown: {
          flyingCount: 0,
          flyingAvg: null,
          largeCount: 0,
          largeAvg: null,
          normalCount: 0,
          normalAvg: null,
          preferenceText: 'Brak prób'
        }
      }
    }

    const ranksArr = jumps.map((j) => j.jump_rank).filter((r) => r != null && !isNaN(r))
    const count = ranksArr.length

    // Statystyki pozycji
    const avgRank = count ? ranksArr.reduce((a, b) => a + b, 0) / count : null
    const medianRank = computeMedian(ranksArr)
    const bestRank = count ? Math.min(...ranksArr) : null
    const worstRank = count ? Math.max(...ranksArr) : null

    // Skuteczność progowa (%)
    const hitRate30 = count ? (ranksArr.filter((r) => r <= 30).length / count) * 100 : 0
    const hitRate20 = count ? (ranksArr.filter((r) => r <= 20).length / count) * 100 : 0
    const hitRate10 = count ? (ranksArr.filter((r) => r <= 10).length / count) * 100 : 0
    const hitRate3 = count ? (ranksArr.filter((r) => r <= 3).length / count) * 100 : 0

    // Odchylenie standardowe (stabilność)
    let stdDev: number | null = null
    if (count > 1 && avgRank !== null) {
      const variance = ranksArr.reduce((a, b) => a + Math.pow(b - avgRank, 2), 0) / count
      stdDev = Math.sqrt(variance)
    }

    // Punkty FIS (suma i średnia na skok)
    const totalPoints = ranksArr.reduce((sum, rank) => sum + getPlacePoints(rank), 0)
    const avgPoints = count > 0 ? totalPoints / count : 0

    // Efektywność punktowa w przeliczeniu na cenę (Pkt / Cena)
    const pointsPerPrice =
      athlete.price && athlete.price > 0 && totalPoints > 0
        ? Number((avgPoints / athlete.price).toFixed(2))
        : null

    // Trend formy (porównanie średniej 3 ostatnich skoków do 3 poprzednich)
    let trendIcon = '➡️'
    let trendClass = 'trend-neutral'
    let trendText = 'Brak danych'
    let trendDiff: number | null = null
    if (count >= 2) {
      const last3 = ranksArr.slice(0, 3)
      const prev3 = ranksArr.slice(3, 6)
      const avgLast3 = last3.reduce((a, b) => a + b, 0) / last3.length
      const avgPrev3 = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : null

      if (avgPrev3 !== null) {
        trendDiff = avgPrev3 - avgLast3
        if (trendDiff > 2) {
          trendIcon = '⬆️'
          trendClass = 'trend-up'
          trendText = `+${trendDiff.toFixed(1)} poz`
        } else if (trendDiff < -2) {
          trendIcon = '⬇️'
          trendClass = 'trend-down'
          trendText = `${trendDiff.toFixed(1)} poz`
        } else {
          trendIcon = '➡️'
          trendClass = 'trend-neutral'
          trendText = `${trendDiff > 0 ? '+' : ''}${trendDiff.toFixed(1)} poz`
        }
      } else {
        trendText = 'Zbyt mało prób'
      }
    }

    // Matematyczny rozkład na typy obiektów
    const flyingJumps = jumps.filter((j) => (j.hill_type || '').toUpperCase() === 'FLYING' && j.jump_rank != null)
    const largeJumps = jumps.filter((j) => (j.hill_type || '').toUpperCase() === 'LARGE' && j.jump_rank != null)
    const normalJumps = jumps.filter((j) => (j.hill_type || '').toUpperCase() === 'NORMAL' && j.jump_rank != null)

    const flyingAvg = flyingJumps.length
      ? flyingJumps.reduce((s, j) => s + j.jump_rank, 0) / flyingJumps.length
      : null
    const largeAvg = largeJumps.length
      ? largeJumps.reduce((s, j) => s + j.jump_rank, 0) / largeJumps.length
      : null
    const normalAvg = normalJumps.length
      ? normalJumps.reduce((s, j) => s + j.jump_rank, 0) / normalJumps.length
      : null

    let preferenceText = 'Zrównoważony'
    if (flyingAvg !== null && largeAvg !== null && flyingJumps.length >= 2 && flyingAvg < largeAvg - 2.5) {
      preferenceText = `Wyższe lokaty na mamutach (+${(largeAvg - flyingAvg).toFixed(1)} poz.)`
    } else if (largeAvg !== null && flyingAvg !== null && largeJumps.length >= 2 && largeAvg < flyingAvg - 2.5) {
      preferenceText = `Wyższe lokaty na dużych (+${(flyingAvg - largeAvg).toFixed(1)} poz.)`
    } else if (flyingJumps.length >= 2 && !largeJumps.length) {
      preferenceText = 'Tylko skoki mamucie'
    } else if (largeJumps.length >= 2 && !flyingJumps.length) {
      preferenceText = 'Tylko skocznie duże'
    }

    return {
      name: athlete.name,
      price: athlete.price,
      hasData: true,
      jumpCount: count,
      totalPoints,
      avgPoints,
      pointsPerPrice,
      avgRank,
      medianRank,
      bestRank,
      worstRank,
      hitRate30,
      hitRate20,
      hitRate10,
      hitRate3,
      stdDev,
      trendIcon,
      trendClass,
      trendText,
      trendDiff,
      hillBreakdown: {
        flyingCount: flyingJumps.length,
        flyingAvg,
        largeCount: largeJumps.length,
        largeAvg,
        normalCount: normalJumps.length,
        normalAvg,
        preferenceText
      }
    }
  })
})

// Filtrowanie i sortowanie listy zawodników
const filteredAnalytics = computed<AthleteStat[]>(() => {
  let list = rawAthleteAnalytics.value

  // 1. Wyszukiwanie po nazwisku
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter((a) => a.name.toLowerCase().includes(q))
  }

  // 2. Tylko wycenieni
  if (filterOnlyPriced.value) {
    list = list.filter((a) => a.price !== null && a.price > 0)
  }

  // 3. Tylko punktujący (Top 30 > 0)
  if (filterOnlyScoring.value) {
    list = list.filter((a) => a.totalPoints > 0 || a.hitRate30 > 0)
  }

  // 4. Minimalna liczba skoków
  if (filterMinJumps.value > 1) {
    list = list.filter((a) => a.jumpCount >= filterMinJumps.value)
  }

  // 5. Osiągnięcia w czołówce
  if (filterAchievement.value === 'podium') {
    list = list.filter((a) => a.hitRate3 > 0)
  } else if (filterAchievement.value === 'top10') {
    list = list.filter((a) => a.hitRate10 > 0)
  }

  // Sortowanie
  return [...list].sort((a, b) => {
    if (!a.hasData && !b.hasData) return 0
    if (!a.hasData) return 1
    if (!b.hasData) return -1

    const key = sortKey.value as keyof AthleteStat
    const valA = a[key]
    const valB = b[key]

    if (valA === null || valA === undefined) return 1
    if (valB === null || valB === undefined) return -1

    if (typeof valA === 'string') {
      return sortOrder.value === 'asc'
        ? (valA as string).localeCompare(valB as string, 'pl')
        : (valB as string).localeCompare(valA as string, 'pl')
    }

    return sortOrder.value === 'asc'
      ? (valA as number) - (valB as number)
      : (valB as number) - (valA as number)
  })
})

// Liderzy Statystyczni w Wybranych Zawodach (Obiektywne Fakty Liczbowe)
const statisticalLeaders = computed(() => {
  const active = rawAthleteAnalytics.value.filter((a) => a.hasData && a.jumpCount > 0)
  if (active.length === 0) return null

  // 1. Najwyższy wskaźnik efektywności (Pkt / Cena) - min. 2 skoki i cena
  const pricedAndScoring = active.filter(
    (a) => a.price && a.price > 0 && a.totalPoints > 0 && a.jumpCount >= 2 && a.pointsPerPrice !== null
  )
  const mostEfficient = pricedAndScoring.length > 0
    ? [...pricedAndScoring].sort((a, b) => (b.pointsPerPrice ?? 0) - (a.pointsPerPrice ?? 0))[0]
    : null

  // 2. Najwyższa regularność Top 30 (min. 2 skoki)
  const regulars = active.filter((a) => a.jumpCount >= 2 && a.hitRate30 > 0)
  const mostConsistent30 = regulars.length > 0
    ? [...regulars].sort((a, b) => {
        if (b.hitRate30 !== a.hitRate30) return b.hitRate30 - a.hitRate30
        return (a.avgRank ?? 99) - (b.avgRank ?? 99)
      })[0]
    : null

  // 3. Najwięcej miejsc na podium / w Top 10
  const podiumAthletes = active.filter((a) => a.hitRate3 > 0 || a.hitRate10 > 0)
  const topPodium = podiumAthletes.length > 0
    ? [...podiumAthletes].sort((a, b) => {
        if (b.hitRate3 !== a.hitRate3) return b.hitRate3 - a.hitRate3
        if (b.hitRate10 !== a.hitRate10) return b.hitRate10 - a.hitRate10
        return (a.avgRank ?? 99) - (b.avgRank ?? 99)
      })[0]
    : null

  // 4. Najwyższa powtarzalność odległości (najniższe odchylenie standardowe sigma, min. 3 skoki)
  const stable = active.filter((a) => a.jumpCount >= 3 && a.stdDev !== null)
  const lowestVariance = stable.length > 0
    ? [...stable].sort((a, b) => (a.stdDev ?? 99) - (b.stdDev ?? 99))[0]
    : null

  return { mostEfficient, mostConsistent30, topPodium, lowestVariance }
})

const getTrendPath = (athleteName: string) => {
  const athleteJumps = [...props.groupedRows]
    .reverse()
    .map((row) => row.athletes[athleteName])
    .filter((j) => j != null)
  if (athleteJumps.length < 2) return ''
  const width = 1000
  const height = 150
  const padding = 20
  const xStep = (width - 2 * padding) / (athleteJumps.length - 1)
  const yScale = (rank: number) =>
    padding + ((Math.min(Math.max(rank, 1), 50) - 1) / 49) * (height - 2 * padding)
  return athleteJumps
    .map((j, i) => `${i === 0 ? 'M' : 'L'} ${padding + i * xStep},${yScale(j.jump_rank)}`)
    .join(' ')
}
</script>

<template>
  <div>
    <div class="card analytics-card" v-if="rawAthleteAnalytics.length > 0">
      <div class="card-header">
        <div class="header-badge-row">
          <span class="math-badge">📐 ANALIZA STATYSTYCZNO-MATEMATYCZNA</span>
          <span v-if="currentHillType" class="hill-filter-badge">
            Skocznia: <strong>{{ currentHillType }}</strong>
          </span>
        </div>
        <h3>📊 Panel Analityczno-Statystyczny Zawodników</h3>
        <p class="subtitle">
          Obiektywne zestawienie matematyczne dla wybranego zakresu zawodów: średnie, mediany, skuteczność punktowa, stabilność odległości i profile obiektów.
        </p>
      </div>

      <!-- KAFELKI LIDERÓW STATYSTYCZNYCH Z PRÓB -->
      <div v-if="statisticalLeaders" class="insights-grid">
        <!-- 1. NAJWYŻSZA EFEKTYWNOŚĆ -->
        <div v-if="statisticalLeaders.mostEfficient" class="insight-card card-steal">
          <div class="insight-header">
            <span class="insight-badge">💎 NAJWYŻSZA EFEKTYWNOŚĆ</span>
            <span class="insight-val">{{ statisticalLeaders.mostEfficient.pointsPerPrice?.toFixed(2) }} pkt/cena</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.mostEfficient.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">Cena: {{ Number(statisticalLeaders.mostEfficient.price).toFixed(1) }}</span>
              <span class="insight-tag">Śr. Pkt: {{ statisticalLeaders.mostEfficient.avgPoints.toFixed(1) }}</span>
              <span class="insight-tag">Śr. msc: {{ statisticalLeaders.mostEfficient.avgRank?.toFixed(1) }}</span>
            </div>
            <p class="insight-hint">Najwyższy stosunek zdobywanych punktów do ceny (wymóg: min. 1 pkt i 2 skoki).</p>
          </div>
        </div>

        <!-- 2. NAJWYŻSZA REGULARNOŚĆ TOP 30 -->
        <div v-if="statisticalLeaders.mostConsistent30" class="insight-card card-anchor">
          <div class="insight-header">
            <span class="insight-badge">🎯 REGULARNOŚĆ TOP 30</span>
            <span class="insight-val">{{ statisticalLeaders.mostConsistent30.hitRate30.toFixed(0) }}% awansów</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.mostConsistent30.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">Skoki: {{ statisticalLeaders.mostConsistent30.jumpCount }}</span>
              <span class="insight-tag">Śr. msc: {{ statisticalLeaders.mostConsistent30.avgRank?.toFixed(1) }}</span>
              <span class="insight-tag">Mediana: {{ statisticalLeaders.mostConsistent30.medianRank?.toFixed(1) }}</span>
            </div>
            <p class="insight-hint">Najwyższy odsetek awansów do serii finałowej (Top 30) w analizowanym okresie.</p>
          </div>
        </div>

        <!-- 3. NAJWIĘCEJ PODIUM / TOP 10 -->
        <div v-if="statisticalLeaders.topPodium" class="insight-card card-joker">
          <div class="insight-header">
            <span class="insight-badge">🏆 CZOŁÓWKA &amp; PODIUM</span>
            <span class="insight-val">Podium: {{ statisticalLeaders.topPodium.hitRate3.toFixed(0) }}%</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.topPodium.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">Top 10: {{ statisticalLeaders.topPodium.hitRate10.toFixed(0) }}%</span>
              <span class="insight-tag">Najlepsze: {{ statisticalLeaders.topPodium.bestRank }}. msc</span>
            </div>
            <p class="insight-hint">Największa częstotliwość finiszów na podium lub w pierwszej dziesiątce.</p>
          </div>
        </div>

        <!-- 4. NAJWYŻSZA POWTARZALNOŚĆ (MIN. ODCHYLENIE SIGMA) -->
        <div v-if="statisticalLeaders.lowestVariance" class="insight-card card-trap">
          <div class="insight-header">
            <span class="insight-badge">📐 NAJWYŻSZA POWTARZALNOŚĆ</span>
            <span class="insight-val">σ = ±{{ statisticalLeaders.lowestVariance.stdDev?.toFixed(1) }}</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.lowestVariance.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">Śr. msc: {{ statisticalLeaders.lowestVariance.avgRank?.toFixed(1) }}</span>
              <span class="insight-tag">Próby: {{ statisticalLeaders.lowestVariance.jumpCount }} skoków</span>
            </div>
            <p class="insight-hint">Minimalne odchylenie standardowe miejsc – najbardziej powtarzalne skoki bez wahań.</p>
          </div>
        </div>
      </div>

      <!-- PASEK FILTRÓW STATYSTYCZNYCH -->
      <div class="analytics-filters-toolbar">
        <div class="filter-search-box">
          <span class="search-lens">🔍</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filtruj po nazwisku skoczka..."
            class="filter-search-input"
          />
          <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
        </div>

        <div class="filter-toggles-row">
          <label class="filter-checkbox-label">
            <input type="checkbox" v-model="filterOnlyPriced" />
            <span>💰 Tylko z wyceną</span>
          </label>

          <label class="filter-checkbox-label">
            <input type="checkbox" v-model="filterOnlyScoring" />
            <span>🎯 Tylko punktujący (Top 30)</span>
          </label>

          <div class="filter-select-wrapper">
            <label class="select-prefix">Min. skoków:</label>
            <select v-model.number="filterMinJumps" class="filter-inline-select">
              <option :value="1">Wszystkie (1+)</option>
              <option :value="2">Min. 2 skoki</option>
              <option :value="3">Min. 3 skoki</option>
              <option :value="5">Min. 5 skoków</option>
            </select>
          </div>

          <div class="filter-select-wrapper">
            <label class="select-prefix">Osiągnięcia:</label>
            <select v-model="filterAchievement" class="filter-inline-select">
              <option value="all">Wszyscy</option>
              <option value="podium">Przynajmniej 1x Podium</option>
              <option value="top10">Przynajmniej 1x Top 10</option>
            </select>
          </div>
        </div>

        <div class="filter-stats-badge">
          <span>Pokazano: <strong>{{ filteredAnalytics.length }}</strong> z {{ rawAthleteAnalytics.length }}</span>
          <button
            v-if="hasActiveFilters"
            class="btn-reset-filters"
            @click="resetFilters"
            title="Zresetuj wszystkie filtry tabeli"
          >
            ✕ Reset
          </button>
        </div>
      </div>

      <!-- TABELA ANALITYCZNA Z PRZYPIĘTYMI NAGŁÓWKAMI I PIERWSZĄ KOLUMNĄ -->
      <div class="analytics-table-wrapper">
        <table class="analytics-table">
          <thead>
            <tr>
              <th
                class="th-sticky th-athlete sortable-th"
                :class="{ 'sorted-th': sortKey === 'name' }"
                @click="sortBy('name')"
                title="Sortuj alfabetycznie po nazwisku"
              >
                Zawodnik {{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-price"
                :class="{ 'sorted-th': sortKey === 'price' }"
                @click="sortBy('price')"
                title="Cena w Fantasy Ski Jumping"
              >
                Cena {{ sortKey === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-jumps"
                :class="{ 'sorted-th': sortKey === 'jumpCount' }"
                @click="sortBy('jumpCount')"
                title="Liczba oddanych i zanalizowanych skoków w wybranym zakresie"
              >
                Skoki {{ sortKey === 'jumpCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-points"
                :class="{ 'sorted-th': sortKey === 'totalPoints' }"
                @click="sortBy('totalPoints')"
                title="Suma punktów według oficjalnego klucza Pucharu Świata (miejsca 1-30)"
              >
                Suma Pkt {{ sortKey === 'totalPoints' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-points"
                :class="{ 'sorted-th': sortKey === 'avgPoints' }"
                @click="sortBy('avgPoints')"
                title="Średnia liczba punktów FIS zdobywana na jeden skok"
              >
                Śr. Pkt {{ sortKey === 'avgPoints' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-value"
                :class="{ 'sorted-th': sortKey === 'pointsPerPrice' }"
                @click="sortBy('pointsPerPrice')"
                title="Wskaźnik efektywności: średnie punkty FIS dzielone przez cenę (Pkt/Cena)"
              >
                Pkt / Cena {{ sortKey === 'pointsPerPrice' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'avgRank' }"
                @click="sortBy('avgRank')"
                title="Średnie zajmowane miejsce (niższe = lepsze)"
              >
                Śr. Msc {{ sortKey === 'avgRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'medianRank' }"
                @click="sortBy('medianRank')"
                title="Mediana miejsc (odporna na pojedyncze anomalie i upadki)"
              >
                Mediana {{ sortKey === 'medianRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'bestRank' }"
                @click="sortBy('bestRank')"
                title="Zakres zajmowanych miejsc (Najlepsze - Najgorsze)"
              >
                Zakres (Min-Max) {{ sortKey === 'bestRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate30' }"
                @click="sortBy('hitRate30')"
                title="Procent skoków w czołowej 30-tce (punkty / awans do II serii)"
              >
                Top 30 {{ sortKey === 'hitRate30' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate10' }"
                @click="sortBy('hitRate10')"
                title="Procent skoków w pierwszej dziesiątce"
              >
                Top 10 {{ sortKey === 'hitRate10' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate3' }"
                @click="sortBy('hitRate3')"
                title="Procent skoków zakończonych na podium"
              >
                Podium {{ sortKey === 'hitRate3' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-trend"
                :class="{ 'sorted-th': sortKey === 'trendDiff' }"
                @click="sortBy('trendDiff')"
                title="Trend: porównanie średniej 3 ostatnich skoków do 3 poprzednich"
              >
                Trend {{ sortKey === 'trendDiff' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-std"
                :class="{ 'sorted-th': sortKey === 'stdDev' }"
                @click="sortBy('stdDev')"
                title="Odchylenie standardowe miejsc (im mniejsza liczba, tym większa powtarzalność)"
              >
                Stabilność (σ) {{ sortKey === 'stdDev' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="th-profile" title="Rozkład pozycji w zależności od rozmiaru skoczni">
                Rozkład Obiektów
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-if="filteredAnalytics.length === 0">
              <tr>
                <td colspan="15" class="no-data-msg">
                  Brak zawodników spełniających nałożone kryteria filtrów.
                </td>
              </tr>
            </template>
            <template v-for="stat in filteredAnalytics" :key="stat.name">
              <tr
                @click="toggleAthleteExpansion(stat.name)"
                class="clickable-row"
                :class="{ 'is-expanded': expandedAthlete === stat.name }"
              >
                <!-- ZAWODNIK (STICKY COLUMN) -->
                <td class="td-sticky td-athlete">
                  <span class="expansion-chevron">{{
                    expandedAthlete === stat.name ? '▼' : '▶'
                  }}</span>
                  <span class="athlete-name-text">{{ stat.name }}</span>
                </td>

                <template v-if="stat.hasData">
                  <!-- CENA -->
                  <td class="td-price">
                    <span v-if="stat.price" class="badge price-badge-fantasy">
                      {{ Number(stat.price).toFixed(1) }}
                    </span>
                    <span v-else class="text-null">-</span>
                  </td>

                  <!-- SKOKI -->
                  <td class="td-jumps">
                    <span class="stat-badge neutral">{{ stat.jumpCount }}</span>
                  </td>

                  <!-- SUMA PUNKTÓW FIS -->
                  <td class="td-points">
                    <strong class="points-val">{{ stat.totalPoints }}</strong>
                  </td>

                  <!-- ŚREDNIA PUNKTÓW -->
                  <td class="td-points">
                    <span class="avg-points-val">{{ stat.avgPoints.toFixed(1) }}</span>
                  </td>

                  <!-- WARTOŚĆ (PKT/CENA) -->
                  <td class="td-value">
                    <div
                      v-if="stat.pointsPerPrice !== null"
                      class="value-score-box"
                      :class="getValueScoreClass(stat.pointsPerPrice)"
                      :title="`Średnio ${stat.avgPoints.toFixed(1)} pkt FIS na ${stat.price !== null ? Number(stat.price).toFixed(1) : '-'} ceny`"
                    >
                      <span class="val-num">{{ stat.pointsPerPrice.toFixed(2) }}</span>
                      <span class="val-unit">pkt/c</span>
                    </div>
                    <span v-else class="text-null">-</span>
                  </td>

                  <!-- ŚREDNIE MIEJSCE -->
                  <td class="td-rank">
                    <strong class="rank-bold">{{ stat.avgRank?.toFixed(1) }}</strong>
                  </td>

                  <!-- MEDIANA MIEJSC -->
                  <td class="td-rank">
                    <span class="median-val">{{ stat.medianRank?.toFixed(1) }}</span>
                  </td>

                  <!-- ZAKRES (MIN - MAX) -->
                  <td class="td-rank">
                    <span class="range-text" v-if="stat.bestRank !== null">
                      {{ stat.bestRank }}. - {{ stat.worstRank }}.
                    </span>
                    <span v-else class="text-null">-</span>
                  </td>

                  <!-- HIT RATE TOP 30 (Z MIKRO-PASKA) -->
                  <td class="td-rate">
                    <div class="rate-cell">
                      <div class="rate-bar-track">
                        <div
                          class="rate-bar-fill fill-top30"
                          :style="{ width: Math.min(100, stat.hitRate30) + '%' }"
                        ></div>
                      </div>
                      <span class="rate-text">{{ stat.hitRate30.toFixed(0) }}%</span>
                    </div>
                  </td>

                  <!-- HIT RATE TOP 10 (Z MIKRO-PASKA) -->
                  <td class="td-rate">
                    <div class="rate-cell">
                      <div class="rate-bar-track">
                        <div
                          class="rate-bar-fill fill-top10"
                          :style="{ width: Math.min(100, stat.hitRate10) + '%' }"
                        ></div>
                      </div>
                      <span class="rate-text">{{ stat.hitRate10.toFixed(0) }}%</span>
                    </div>
                  </td>

                  <!-- HIT RATE PODIUM (Z MIKRO-PASKA) -->
                  <td class="td-rate">
                    <div class="rate-cell">
                      <div class="rate-bar-track">
                        <div
                          class="rate-bar-fill fill-podium"
                          :style="{ width: Math.min(100, stat.hitRate3) + '%' }"
                        ></div>
                      </div>
                      <span class="rate-text">{{ stat.hitRate3.toFixed(0) }}%</span>
                    </div>
                  </td>

                  <!-- TREND -->
                  <td class="td-trend">
                    <span :class="['trend-badge', stat.trendClass]">
                      {{ stat.trendIcon }} {{ stat.trendText }}
                    </span>
                  </td>

                  <!-- STABILNOŚĆ (σ) -->
                  <td class="td-std">
                    <span
                      class="stat-badge"
                      :class="
                        stat.stdDev != null && stat.stdDev < 5
                          ? 'good'
                          : stat.stdDev != null && stat.stdDev > 8
                            ? 'bad'
                            : 'neutral'
                      "
                      :title="'Odchylenie standardowe miejsc: ' + (stat.stdDev?.toFixed(2) || 'brak')"
                    >
                      {{ stat.stdDev != null ? '±' + stat.stdDev.toFixed(1) : '-' }}
                    </span>
                  </td>

                  <!-- ROZKŁAD SKOCZNI -->
                  <td class="td-profile">
                    <span class="hill-note-tag" :title="stat.hillBreakdown.preferenceText">
                      {{ stat.hillBreakdown.preferenceText }}
                    </span>
                  </td>
                </template>

                <td v-else colspan="14" class="no-data-msg">Brak danych dla wybranego zakresu</td>
              </tr>

              <!-- PANEL ROZWINIĘCIA Z WYKRESEM SPARKLINE -->
              <tr v-if="expandedAthlete === stat.name" class="expansion-panel-row">
                <td colspan="15">
                  <div class="trend-chart-container">
                    <div class="chart-info">
                      <strong>Wykres Kolejnych Miejsc w Serii (Góra = 1. miejsce, Dół = 50. miejsce):</strong>
                      <span>Kliknij wiersz ponownie, aby zwinąć</span>
                    </div>
                    <svg viewBox="-60 0 1060 180" class="trend-svg">
                      <line x1="0" y1="15" x2="1000" y2="15" class="guide-line top1" />
                      <text x="-10" y="19" class="axis-text axis-y">1</text>
                      <line x1="0" y1="42" x2="1000" y2="42" class="guide-line top10" />
                      <text x="-10" y="46" class="axis-text axis-y text-good">10</text>
                      <line x1="0" y1="96" x2="1000" y2="96" class="guide-line top30" />
                      <text x="-10" y="100" class="axis-text axis-y text-neutral">30</text>
                      <line x1="0" y1="150" x2="1000" y2="150" class="guide-line top50" />
                      <text x="-10" y="154" class="axis-text axis-y text-bad">50+</text>

                      <g
                        v-if="
                          [...groupedRows]
                            .reverse()
                            .map((row) => row.athletes[stat.name])
                            .filter((j) => j != null).length > 1
                        "
                      >
                        <g
                          v-for="(jump, i) in [...groupedRows]
                            .reverse()
                            .map((row) => row.athletes[stat.name])
                            .filter((j) => j != null)"
                          :key="i"
                        >
                          <line
                            :x1="
                              20 +
                              i *
                                ((1000 - 40) /
                                  ([...groupedRows]
                                    .reverse()
                                    .map((row) => row.athletes[stat.name])
                                    .filter((j) => j != null).length -
                                    1))
                            "
                            y1="135"
                            :x2="
                              20 +
                              i *
                                ((1000 - 40) /
                                  ([...groupedRows]
                                    .reverse()
                                    .map((row) => row.athletes[stat.name])
                                    .filter((j) => j != null).length -
                                    1))
                            "
                            y2="140"
                            class="axis-tick"
                          />
                          <g
                            :transform="`translate(${
                              20 +
                              i *
                                ((1000 - 40) /
                                  ([...groupedRows]
                                    .reverse()
                                    .map((row) => row.athletes[stat.name])
                                    .filter((j) => j != null).length -
                                    1))
                            }, 152)`"
                          >
                            <text class="axis-text axis-x date-label" y="0">{{ jump.date }}</text>
                            <text class="axis-text axis-x place-label" y="12">
                              {{ jump.category }} | {{ jump.place }} (HS{{ jump.hill_size || '?' }})
                            </text>
                          </g>
                        </g>
                      </g>
                      <path :d="getTrendPath(stat.name)" class="trend-path" />
                    </svg>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <!-- SCATTER PLOT: CENA VS ŚREDNIA POZYCJA -->
    <div
      v-if="filteredAnalytics.some((a) => a.hasData && a.price)"
      class="card analytics-card scatter-card"
      style="margin-top: 25px"
    >
      <div class="card-header">
        <h2>📊 Korelacja: Cena vs Średnia Pozycja (Rozkład Kwadrantowy)</h2>
        <p class="subtitle">Wizualizacja zależności pomiędzy wyceną a średnią pozycją w stawce</p>
      </div>

      <div class="scatter-container">
        <div
          class="scatter-wrapper"
          style="position: relative; width: 100%; max-width: 800px; margin: 0 auto"
        >
          <div class="quadrant quad-top-left">
            <span class="quad-title">Cena ≤ 2.0 • Wysoka pozycja (≤ 20)</span>
          </div>
          <div class="quadrant quad-top-right">
            <span class="quad-title">Cena > 2.0 • Wysoka pozycja (≤ 20)</span>
          </div>
          <div class="quadrant quad-bottom-left">
            <span class="quad-title">Cena ≤ 2.0 • Dalsza pozycja (> 20)</span>
          </div>
          <div class="quadrant quad-bottom-right">
            <span class="quad-title">Cena > 2.0 • Dalsza pozycja (> 20)</span>
          </div>

          <svg
            viewBox="0 0 600 400"
            class="scatter-svg"
            style="width: 100%; height: auto; overflow: visible"
          >
            <line
              x1="300"
              y1="0"
              x2="300"
              y2="400"
              stroke="#cbd5e1"
              stroke-width="2"
              stroke-dasharray="4"
            />
            <line
              x1="0"
              y1="200"
              x2="600"
              y2="200"
              stroke="#cbd5e1"
              stroke-width="2"
              stroke-dasharray="4"
            />

            <g v-for="ath in filteredAnalytics.filter((a) => a.hasData && a.price)" :key="ath.name">
              <g
                :transform="`translate(${((ath.price || 0) / 3.0) * 600}, ${ath.avgRank && ath.avgRank <= 20 ? ((ath.avgRank - 1) / 19) * 200 : 200 + ((Math.min(ath.avgRank || 50, 40) - 20) / 20) * 200})`"
                class="scatter-dot-group"
                @mouseenter="hoveredAthlete = ath"
                @mouseleave="hoveredAthlete = null"
              >
                <circle r="7" class="scatter-dot" />
                <foreignObject
                  x="-100"
                  y="-30"
                  width="200"
                  height="30"
                  class="scatter-foreign"
                  :style="{ opacity: hoveredAthlete?.name === ath.name ? 0 : 1 }"
                >
                  <div class="scatter-dot-text">{{ ath.name }} ({{ Number(ath.price).toFixed(1) }})</div>
                </foreignObject>
              </g>
            </g>

            <g
              v-if="hoveredAthlete"
              :transform="`translate(${((hoveredAthlete.price || 0) / 3.0) * 600}, ${hoveredAthlete.avgRank <= 20 ? ((hoveredAthlete.avgRank - 1) / 19) * 200 : 200 + ((Math.min(hoveredAthlete.avgRank, 40) - 20) / 20) * 200})`"
              style="pointer-events: none"
            >
              <circle r="12" fill="#0ea5e9" stroke="white" stroke-width="2" />
              <foreignObject x="-100" y="-35" width="200" height="35" class="scatter-foreign">
                <div class="scatter-dot-text active-tooltip">
                  {{ hoveredAthlete.name }} ({{ Number(hoveredAthlete.price).toFixed(1) }})
                </div>
              </foreignObject>
            </g>

            <text x="5" y="15" fill="#94a3b8" font-size="11" font-weight="bold">↑ Miejsce 1</text>
            <text x="5" y="395" fill="#94a3b8" font-size="11" font-weight="bold">
              ↓ Miejsce 40+
            </text>
            <text x="5" y="215" fill="#94a3b8" font-size="10" font-weight="bold">Średnia 20</text>
            <text x="535" y="390" fill="#94a3b8" font-size="11" font-weight="bold">Cena 3.0→</text>
            <text x="265" y="390" fill="#94a3b8" font-size="10">Cena 1.5</text>
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-card {
  border-left: 4px solid #2563eb;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  margin-top: 24px;
}

.header-badge-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.math-badge {
  display: inline-flex;
  align-items: center;
  background: linear-gradient(135deg, #1e3a8a, #2563eb);
  color: white;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.hill-filter-badge {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  font-size: 0.76rem;
  padding: 2px 8px;
  border-radius: 6px;
}

/* LIDERZY STATYSTYCZNI GRID */
.insights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
  margin: 18px 0 24px 0;
}

.insight-card {
  border-radius: 10px;
  padding: 14px 16px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.insight-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 12px -2px rgba(0, 0, 0, 0.08);
}

.card-steal {
  border-top: 4px solid #10b981;
  background: linear-gradient(180deg, #ecfdf5 0%, #ffffff 40%);
}

.card-anchor {
  border-top: 4px solid #3b82f6;
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 40%);
}

.card-joker {
  border-top: 4px solid #f59e0b;
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 40%);
}

.card-trap {
  border-top: 4px solid #6366f1;
  background: linear-gradient(180deg, #eef2ff 0%, #ffffff 40%);
}

.insight-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.insight-badge {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  color: #1e293b;
}

.insight-val {
  font-size: 0.85rem;
  font-weight: 800;
  color: #0f172a;
}

.insight-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
}

.insight-meta {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.insight-tag {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-size: 0.72rem;
  padding: 1px 6px;
  border-radius: 4px;
  color: #475569;
  font-weight: 600;
}

.insight-hint {
  font-size: 0.75rem;
  color: #64748b;
  line-height: 1.35;
  margin: 0;
}

/* PASEK FILTRÓW TABELI */
.analytics-filters-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 16px;
}

.filter-search-box {
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 8px;
  min-width: 200px;
}

.search-lens {
  font-size: 0.85rem;
  margin-right: 6px;
  opacity: 0.6;
}

.filter-search-input {
  border: none;
  outline: none;
  font-size: 0.82rem;
  width: 100%;
}

.clear-search-btn {
  background: transparent;
  border: none;
  font-size: 0.75rem;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 4px;
}

.clear-search-btn:hover {
  color: #0f172a;
}

.filter-toggles-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}

.filter-select-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.select-prefix {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}

.filter-inline-select {
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.78rem;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

.filter-stats-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  color: #64748b;
}

.btn-reset-filters {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-reset-filters:hover {
  background: #fca5a5;
}

/* TABELA */
.analytics-table-wrapper {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  max-height: 650px;
}

.analytics-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  text-align: left;
}

.analytics-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  padding: 10px 12px;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
  user-select: none;
  position: sticky;
  top: 0;
  z-index: 2;
}

.sortable-th {
  cursor: pointer;
  transition: background 0.15s;
}

.sortable-th:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.sorted-th {
  color: #2563eb !important;
  background: #eff6ff !important;
}

.th-sticky,
.td-sticky {
  position: sticky;
  left: 0;
  background: white;
  z-index: 3;
}

.th-sticky {
  z-index: 4;
  background: #f8fafc;
}

.analytics-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.clickable-row:hover td {
  background: #f8fafc;
}

.clickable-row:hover .td-sticky {
  background: #f8fafc;
}

.is-expanded td {
  background: #eff6ff !important;
}

.expansion-chevron {
  font-size: 0.7rem;
  color: #94a3b8;
  margin-right: 6px;
}

.athlete-name-text {
  font-weight: 700;
  color: #0f172a;
}

.price-badge-fantasy {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.points-val {
  color: #2563eb;
  font-weight: 700;
}

.avg-points-val {
  color: #475569;
  font-weight: 600;
}

.value-score-box {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
}

.score-high {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}

.score-med {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.score-low {
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.val-num {
  font-size: 0.9rem;
}

.val-unit {
  font-size: 0.65rem;
  opacity: 0.8;
}

.rank-bold {
  color: #0f172a;
  font-size: 0.92rem;
}

.median-val {
  color: #64748b;
  font-weight: 600;
}

.range-text {
  color: #64748b;
  font-size: 0.8rem;
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 90px;
}

.rate-bar-track {
  flex: 1;
  height: 6px;
  background: #f1f5f9;
  border-radius: 3px;
  overflow: hidden;
}

.rate-bar-fill {
  height: 100%;
  border-radius: 3px;
}

.fill-top30 {
  background: #3b82f6;
}

.fill-top10 {
  background: #10b981;
}

.fill-podium {
  background: #f59e0b;
}

.rate-text {
  font-size: 0.78rem;
  font-weight: 700;
  width: 32px;
  text-align: right;
  color: #334155;
}

.trend-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.trend-up {
  background: #ecfdf5;
  color: #047857;
}

.trend-down {
  background: #fef2f2;
  color: #b91c1c;
}

.trend-neutral {
  background: #f1f5f9;
  color: #64748b;
}

.stat-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 700;
}

.stat-badge.good {
  background: #ecfdf5;
  color: #047857;
}

.stat-badge.bad {
  background: #fef2f2;
  color: #b91c1c;
}

.stat-badge.neutral {
  background: #f1f5f9;
  color: #475569;
}

.hill-note-tag {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 0.72rem;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 200px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-null {
  color: #cbd5e1;
}

.no-data-msg {
  text-align: center;
  color: #94a3b8;
  padding: 24px !important;
  font-style: italic;
}

/* ROZSZERZENIE Z WYKRESEM */
.expansion-panel-row td {
  background: #f8fafc;
  padding: 16px !important;
}

.trend-chart-container {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
}

.chart-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 0.8rem;
  color: #475569;
}

.trend-svg {
  width: 100%;
  height: 180px;
  overflow: visible;
}

.guide-line {
  stroke: #e2e8f0;
  stroke-dasharray: 4;
}

.guide-line.top1 {
  stroke: #f59e0b;
}

.guide-line.top10 {
  stroke: #10b981;
}

.guide-line.top30 {
  stroke: #3b82f6;
}

.axis-text {
  font-size: 10px;
  fill: #94a3b8;
}

.axis-x {
  font-size: 8px;
  text-anchor: middle;
}

.date-label {
  fill: #64748b;
  font-weight: bold;
}

.place-label {
  fill: #94a3b8;
}

.axis-tick {
  stroke: #cbd5e1;
  stroke-width: 1;
}

.trend-path {
  fill: none;
  stroke: #2563eb;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

/* SCATTER PLOT */
.scatter-card {
  margin-top: 24px;
}

.scatter-container {
  padding: 16px 0;
}

.scatter-wrapper {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 20px;
}

.quadrant {
  position: absolute;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  pointer-events: none;
}

.quad-title {
  color: #64748b;
}

.quad-top-left {
  top: 10px;
  left: 10px;
}

.quad-top-right {
  top: 10px;
  right: 10px;
}

.quad-bottom-left {
  bottom: 10px;
  left: 10px;
}

.quad-bottom-right {
  bottom: 10px;
  right: 10px;
}

.scatter-dot {
  fill: #2563eb;
  stroke: white;
  stroke-width: 2;
  cursor: pointer;
  transition: r 0.15s ease, fill 0.15s ease;
}

.scatter-dot:hover {
  r: 9;
  fill: #1d4ed8;
}

.scatter-dot-text {
  font-size: 10px;
  font-weight: 600;
  color: #1e293b;
  text-align: center;
  background: rgba(255, 255, 255, 0.85);
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.active-tooltip {
  background: #0f172a;
  color: white;
  font-weight: 700;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
}
</style>
