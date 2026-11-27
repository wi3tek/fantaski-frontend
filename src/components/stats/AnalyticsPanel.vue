<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '@/stores/auth'
import { useI18n } from '@/i18n'

const auth = useAuth()
const { t } = useI18n()

const props = defineProps<{
  groupedRows: any[]
  filteredVisibleAthletes: any[]
  currentHillType?: string
}>()

const sortKey = ref<string>(auth.isPro.value ? 'pointsPerPrice' : 'avgRank')
const sortOrder = ref<'asc' | 'desc'>(auth.isPro.value ? 'desc' : 'asc')
const hoveredAthlete = ref<any | null>(null)
const expandedAthlete = ref<string | null>(null)
const mobileStatTab = ref<'basics' | 'rates' | 'hills'>('basics')

const mobileSortOptions = computed(() => {
  const opts = [
    ...(auth.isPro.value ? [{ key: 'pointsPerPrice', label: t('analytics.optEff') }] : []),
    { key: 'avgRank', label: t('analytics.optAvgRank') },
    { key: 'totalPoints', label: t('analytics.optTotalPts') },
    { key: 'avgPoints', label: t('analytics.optAvgPts') },
    { key: 'hitRate30', label: t('analytics.optTop30') },
    { key: 'hitRate10', label: t('analytics.optTop10') },
    { key: 'hitRate3', label: t('analytics.optPodium') },
    { key: 'trendDiff', label: t('analytics.optTrend') },
    { key: 'stdDev', label: t('analytics.optStd') },
    { key: 'jumpCount', label: t('analytics.optJumps') },
    ...(auth.isPro.value ? [{ key: 'price', label: t('analytics.optPrice') }] : []),
    { key: 'name', label: t('analytics.optName') },
  ]
  return opts
})

const getTrendX = (index: number, total: number) => {
  if (total <= 1) return 520
  return 44 + index * ((1000 - 80) / (total - 1))
}

const getTrendJumps = (name: string) => {
  return [...props.groupedRows]
    .reverse()
    .map((row) => row.athletes[name])
    .filter((j) => j != null)
}

const onMobileSortKeyChange = (event: Event) => {
  const nextKey = (event.target as HTMLSelectElement).value
  if (nextKey !== sortKey.value) {
    sortBy(nextKey)
  }
}

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
}

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
    preferenceCode?: string
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
        trendText: t('analytics.prefNoJumps'),
        trendDiff: null,
        hillBreakdown: {
          flyingCount: 0,
          flyingAvg: null,
          largeCount: 0,
          largeAvg: null,
          normalCount: 0,
          normalAvg: null,
          preferenceText: t('analytics.prefNoJumps'),
          preferenceCode: 'none'
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
    let trendText = t('analytics.trendNoData')
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
          trendText = `+${trendDiff.toFixed(1)} ${t('analytics.trendPosUnit')}`
        } else if (trendDiff < -2) {
          trendIcon = '⬇️'
          trendClass = 'trend-down'
          trendText = `${trendDiff.toFixed(1)} ${t('analytics.trendPosUnit')}`
        } else {
          trendIcon = '➡️'
          trendClass = 'trend-neutral'
          trendText = `${trendDiff > 0 ? '+' : ''}${trendDiff.toFixed(1)} ${t('analytics.trendPosUnit')}`
        }
      } else {
        trendText = t('analytics.trendTooFew')
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

    let preferenceText = t('analytics.prefBalanced')
    let preferenceCode = 'even'
    if (flyingAvg !== null && largeAvg !== null && flyingJumps.length >= 2 && flyingAvg < largeAvg - 2.5) {
      preferenceText = t('analytics.prefFlying', { diff: (largeAvg - flyingAvg).toFixed(1) })
      preferenceCode = 'flying'
    } else if (largeAvg !== null && flyingAvg !== null && largeJumps.length >= 2 && largeAvg < flyingAvg - 2.5) {
      preferenceText = t('analytics.prefLarge', { diff: (flyingAvg - largeAvg).toFixed(1) })
      preferenceCode = 'large'
    } else if (flyingJumps.length >= 2 && !largeJumps.length) {
      preferenceText = t('analytics.prefOnlyFlying')
      preferenceCode = 'flying'
    } else if (largeJumps.length >= 2 && !flyingJumps.length) {
      preferenceText = t('analytics.prefOnlyLarge')
      preferenceCode = 'large'
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
        preferenceText,
        preferenceCode
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

const scatterPlotPoints = computed(() => {
  const items = filteredAnalytics.value.filter((a) => a.hasData && a.price)
  const raw = items.map((ath) => {
    const x = ((ath.price || 0) / 3.0) * 600
    const y =
      ath.avgRank && ath.avgRank <= 20
        ? ((ath.avgRank - 1) / 19) * 200
        : 200 + ((Math.min(ath.avgRank || 40, 40) - 20) / 20) * 200
    const labelText = `${ath.name} (${Number(ath.price).toFixed(1)})`
    const estWidth = Math.min(180, Math.max(78, labelText.length * 5.8 + 14))
    return { ath, x, y, labelText, estWidth }
  })

  // Sort top-to-bottom so label placement is deterministic and avoids collisions
  raw.sort((a, b) => a.y - b.y || a.x - b.x)

  const placed: { x1: number; y1: number; x2: number; y2: number }[] = [
    // Reserve axis corner labels so athlete tags never collide with them
    { x1: 0, y1: 0, x2: 190, y2: 46 },
    { x1: 420, y1: 0, x2: 600, y2: 42 },
    { x1: 0, y1: 365, x2: 190, y2: 400 },
    { x1: 420, y1: 365, x2: 600, y2: 400 },
  ]

  const candidates: [number, number][] = [
    [0, -24],
    [0, 14],
    [12, -10],
    [-12, -10],
    [0, -40],
    [0, 30],
    [22, -24],
    [-22, -24],
  ]

  return raw.map((pt) => {
    let bestBox = { dx: 0, dy: -24, x1: pt.x - pt.estWidth / 2, y1: pt.y - 24, x2: pt.x + pt.estWidth / 2, y2: pt.y - 7 }
    let minOverlap = Infinity

    for (const [dx, dy] of candidates) {
      const cx = Math.max(pt.estWidth / 2 + 4, Math.min(600 - pt.estWidth / 2 - 4, pt.x + dx))
      const cy = Math.max(20, Math.min(375, pt.y + dy))
      const box = {
        dx: cx - pt.x,
        dy: cy - pt.y,
        x1: cx - pt.estWidth / 2,
        y1: cy - 9,
        x2: cx + pt.estWidth / 2,
        y2: cy + 9,
      }

      let overlapArea = 0
      for (const prev of placed) {
        const ox = Math.max(0, Math.min(box.x2, prev.x2) - Math.max(box.x1, prev.x1))
        const oy = Math.max(0, Math.min(box.y2, prev.y2) - Math.max(box.y1, prev.y1))
        overlapArea += ox * oy
      }

      if (overlapArea < minOverlap) {
        minOverlap = overlapArea
        bestBox = box
        if (overlapArea === 0) break
      }
    }

    placed.push({ x1: bestBox.x1, y1: bestBox.y1, x2: bestBox.x2, y2: bestBox.y2 })
    return {
      ...pt,
      labelDx: bestBox.dx,
      labelDy: bestBox.dy,
    }
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
  const athleteJumps = getTrendJumps(athleteName)
  if (athleteJumps.length < 2) return ''
  const height = 150
  const padding = 20
  const yScale = (rank: number) =>
    15 + ((Math.min(Math.max(rank, 1), 50) - 1) / 49) * (height - 15)
  return athleteJumps
    .map((j, i) => `${i === 0 ? 'M' : 'L'} ${getTrendX(i, athleteJumps.length)},${yScale(j.jump_rank)}`)
    .join(' ')
}
</script>

<template>
  <div>
    <div class="card analytics-card" v-if="rawAthleteAnalytics.length > 0">
      <div class="card-header">
        <div class="header-badge-row">
          <span class="math-badge">{{ t('analytics.mathBadge') }}</span>
          <span v-if="currentHillType" class="hill-filter-badge">
            {{ t('common.hill') }}: <strong>{{ currentHillType }}</strong>
          </span>
        </div>
        <h3>{{ t('analytics.title') }}</h3>
        <p class="subtitle">
          {{ t('analytics.sub') }}
        </p>
      </div>

      <!-- KAFELKI LIDERÓW STATYSTYCZNYCH Z PRÓB -->
      <div v-if="statisticalLeaders" class="insights-grid">
        <!-- 1. NAJWYŻSZA EFEKTYWNOŚĆ (PRO) -->
        <div v-if="auth.isPro.value && statisticalLeaders.mostEfficient" class="insight-card card-steal">
          <div class="insight-header">
            <span class="insight-badge">{{ t('analytics.leadEff') }}</span>
            <span class="insight-val">{{ statisticalLeaders.mostEfficient.pointsPerPrice?.toFixed(2) }} {{ t('analytics.effUnit') }}</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.mostEfficient.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">{{ t('common.price') }}: {{ Number(statisticalLeaders.mostEfficient.price).toFixed(1) }}</span>
              <span class="insight-tag">{{ t('analytics.avgPtsShort') }}: {{ statisticalLeaders.mostEfficient.avgPoints.toFixed(1) }}</span>
              <span class="insight-tag">{{ t('analytics.avgPosShort') }}: {{ statisticalLeaders.mostEfficient.avgRank?.toFixed(1) }}</span>
            </div>
            <p class="insight-hint">{{ t('analytics.leadEffHint') }}</p>
          </div>
        </div>

        <!-- 2. NAJWYŻSZA REGULARNOŚĆ TOP 30 -->
        <div v-if="statisticalLeaders.mostConsistent30" class="insight-card card-anchor">
          <div class="insight-header">
            <span class="insight-badge">{{ t('analytics.leadReg') }}</span>
            <span class="insight-val">{{ statisticalLeaders.mostConsistent30.hitRate30.toFixed(0) }}{{ t('analytics.leadRegVal') }}</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.mostConsistent30.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">{{ t('analytics.jumpsPrefix') }}: {{ statisticalLeaders.mostConsistent30.jumpCount }}</span>
              <span class="insight-tag">{{ t('analytics.avgPosShort') }}: {{ statisticalLeaders.mostConsistent30.avgRank?.toFixed(1) }}</span>
              <span class="insight-tag">{{ t('analytics.medianShort') }}: {{ statisticalLeaders.mostConsistent30.medianRank?.toFixed(1) }}</span>
            </div>
            <p class="insight-hint">{{ t('analytics.leadRegHint') }}</p>
          </div>
        </div>

        <!-- 3. NAJWIĘCEJ PODIUM / TOP 10 -->
        <div v-if="statisticalLeaders.topPodium" class="insight-card card-joker">
          <div class="insight-header">
            <span class="insight-badge">{{ t('analytics.leadPodium') }}</span>
            <span class="insight-val">{{ t('analytics.optPodium').replace(' (%)', '') }}: {{ statisticalLeaders.topPodium.hitRate3.toFixed(0) }}%</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.topPodium.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">Top 10: {{ statisticalLeaders.topPodium.hitRate10.toFixed(0) }}%</span>
              <span class="insight-tag">{{ t('analytics.bestPos', { rank: statisticalLeaders.topPodium.bestRank ?? '-' }) }}</span>
            </div>
            <p class="insight-hint">{{ t('analytics.leadPodiumHint') }}</p>
          </div>
        </div>

        <!-- 4. NAJWYŻSZA POWTARZALNOŚĆ (MIN. ODCHYLENIE SIGMA) -->
        <div v-if="statisticalLeaders.lowestVariance" class="insight-card card-trap">
          <div class="insight-header">
            <span class="insight-badge">{{ t('analytics.leadVar') }}</span>
            <span class="insight-val">σ = ±{{ statisticalLeaders.lowestVariance.stdDev?.toFixed(1) }}</span>
          </div>
          <div class="insight-body">
            <h4 class="insight-name">{{ statisticalLeaders.lowestVariance.name }}</h4>
            <div class="insight-meta">
              <span class="insight-tag">{{ t('analytics.avgPosShort') }}: {{ statisticalLeaders.lowestVariance.avgRank?.toFixed(1) }}</span>
              <span class="insight-tag">{{ t('analytics.triesPrefix') }}: {{ t('analytics.jumpsCount', { count: statisticalLeaders.lowestVariance.jumpCount }) }}</span>
            </div>
            <p class="insight-hint">{{ t('analytics.leadVarHint') }}</p>
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
            :placeholder="t('analytics.searchPh')"
            class="filter-search-input"
          />
          <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
        </div>

        <div class="filter-toggles-row">
          <label v-if="auth.isPro.value" class="filter-checkbox-label">
            <input type="checkbox" v-model="filterOnlyPriced" />
            <span>{{ t('analytics.onlyPriced') }}</span>
          </label>

          <label class="filter-checkbox-label">
            <input type="checkbox" v-model="filterOnlyScoring" />
            <span>{{ t('analytics.onlyScoring') }}</span>
          </label>

          <div class="filter-select-wrapper">
            <label class="select-prefix">{{ t('analytics.minJumps') }}</label>
            <select v-model.number="filterMinJumps" class="filter-inline-select">
              <option :value="1">{{ t('analytics.minJumpsAll') }}</option>
              <option :value="2">{{ t('analytics.minJumpsN', { n: 2 }) }}</option>
              <option :value="3">{{ t('analytics.minJumpsN', { n: 3 }) }}</option>
              <option :value="5">{{ t('analytics.minJumpsN', { n: 5 }) }}</option>
            </select>
          </div>

          <div class="filter-select-wrapper">
            <label class="select-prefix">{{ t('analytics.achievements') }}</label>
            <select v-model="filterAchievement" class="filter-inline-select">
              <option value="all">{{ t('analytics.achAll') }}</option>
              <option value="podium">{{ t('analytics.achPodium') }}</option>
              <option value="top10">{{ t('analytics.achTop10') }}</option>
            </select>
          </div>
        </div>

        <div class="filter-stats-badge">
          <span>{{ t('analytics.shownOf', { shown: filteredAnalytics.length, total: rawAthleteAnalytics.length }) }}</span>
          <button
            v-if="hasActiveFilters"
            class="btn-reset-filters"
            @click="resetFilters"
            :title="t('analytics.resetTitle')"
          >
            ✕ {{ t('common.reset') }}
          </button>
        </div>
      </div>

      <!-- PASEK SORTOWANIA I TRYBU WIDOKU NA MOBILCE -->
      <div class="mobile-analytics-controls mobile-only">
        <div class="mac-sort-row">
          <label for="analyticsMobileSort">{{ t('analytics.sortLabel') }}</label>
          <select
            id="analyticsMobileSort"
            :value="sortKey"
            class="mac-select"
            @change="onMobileSortKeyChange"
          >
            <option v-for="opt in mobileSortOptions" :key="opt.key" :value="opt.key">
              {{ opt.label }}
            </option>
          </select>
          <button type="button" class="mac-order-btn" @click="toggleSortOrder">
            {{ sortOrder === 'asc' ? t('analytics.orderAsc') : t('analytics.orderDesc') }}
          </button>
        </div>

        <div class="mobile-desktop-hint">
          {{ t('common.desktopHint') }}
        </div>

        <!-- 3 ZAKŁADKI TEMATYCZNE DLA KART NA MOBILCE -->
        <div class="mac-topic-tabs" role="tablist">
          <button
            type="button"
            class="mac-topic-tab"
            :class="{ active: mobileStatTab === 'basics' }"
            @click="mobileStatTab = 'basics'"
          >
            {{ t('analytics.tabBasics') }}
          </button>
          <button
            type="button"
            class="mac-topic-tab"
            :class="{ active: mobileStatTab === 'rates' }"
            @click="mobileStatTab = 'rates'"
          >
            {{ t('analytics.tabRates') }}
          </button>
          <button
            type="button"
            class="mac-topic-tab"
            :class="{ active: mobileStatTab === 'hills' }"
            @click="mobileStatTab = 'hills'"
          >
            {{ t('analytics.tabHills') }}
          </button>
        </div>
      </div>

      <!-- KARTY ANALITYCZNE NA MOBILCE (<= 768px / landscape) -->
      <div class="analytics-mobile-list mobile-only">
        <div v-if="filteredAnalytics.length === 0" class="no-data-msg">
          {{ t('analytics.noMatching') }}
        </div>

        <div
          v-for="stat in filteredAnalytics"
          :key="'m_' + stat.name"
          class="analytics-m-card"
          :class="{ 'is-expanded': expandedAthlete === stat.name }"
          @click="stat.hasData ? toggleAthleteExpansion(stat.name) : null"
        >
          <div class="amc-head">
            <div class="amc-title-wrap">
              <span v-if="stat.hasData" class="expansion-chevron">{{
                expandedAthlete === stat.name ? '▼' : '▶'
              }}</span>
              <strong class="amc-athlete-name">{{ stat.name }}</strong>
              <span v-if="auth.isPro.value && stat.price" class="badge price-badge-fantasy">
                {{ Number(stat.price).toFixed(1) }}
              </span>
            </div>
            <span v-if="stat.hasData" :class="['trend-badge', stat.trendClass]">
              {{ stat.trendIcon }} {{ stat.trendText }}
            </span>
          </div>

          <template v-if="stat.hasData">
            <!-- ZAKŁADKA 1: FORMA & PUNKTY -->
            <div v-if="mobileStatTab === 'basics'" class="amc-kpi-grid" :class="{ 'cols-3': !auth.isPro.value }">
              <div class="amc-kpi-box">
                <span class="amc-kpi-label">{{ t('analytics.colAvgRank') }}</span>
                <strong class="amc-kpi-val">{{ stat.avgRank?.toFixed(1) || '-' }}</strong>
              </div>
              <div class="amc-kpi-box">
                <span class="amc-kpi-label">{{ t('analytics.colTotalPts') }}</span>
                <strong class="amc-kpi-val points-val">{{ stat.totalPoints }}</strong>
                <small class="amc-kpi-sub">{{ t('analytics.avgPtsShort') }} {{ stat.avgPoints.toFixed(1) }}</small>
              </div>
              <div v-if="auth.isPro.value" class="amc-kpi-box">
                <span class="amc-kpi-label">{{ t('analytics.colVal') }}</span>
                <strong
                  v-if="stat.pointsPerPrice !== null"
                  class="amc-kpi-val"
                  :class="getValueScoreClass(stat.pointsPerPrice)"
                >
                  {{ stat.pointsPerPrice.toFixed(2) }}
                </strong>
                <span v-else class="text-null">-</span>
              </div>
              <div class="amc-kpi-box">
                <span class="amc-kpi-label">{{ t('analytics.colJumps') }}</span>
                <strong class="amc-kpi-val">{{ stat.jumpCount }}</strong>
              </div>
            </div>

            <!-- ZAKŁADKA 2: SKUTECZNOŚĆ % -->
            <div v-else-if="mobileStatTab === 'rates'" class="amc-rates-grid">
              <div class="amc-rate-item">
                <span class="amc-rate-lbl">Top 30</span>
                <div class="rate-cell">
                  <div class="rate-bar-track">
                    <div class="rate-bar-fill fill-top30" :style="{ width: Math.min(100, stat.hitRate30) + '%' }"></div>
                  </div>
                  <span class="rate-text">{{ stat.hitRate30.toFixed(0) }}%</span>
                </div>
              </div>
              <div class="amc-rate-item">
                <span class="amc-rate-lbl">Top 10</span>
                <div class="rate-cell">
                  <div class="rate-bar-track">
                    <div class="rate-bar-fill fill-top10" :style="{ width: Math.min(100, stat.hitRate10) + '%' }"></div>
                  </div>
                  <span class="rate-text">{{ stat.hitRate10.toFixed(0) }}%</span>
                </div>
              </div>
              <div class="amc-rate-item">
                <span class="amc-rate-lbl">{{ t('analytics.optPodium').replace(' (%)', '') }}</span>
                <div class="rate-cell">
                  <div class="rate-bar-track">
                    <div class="rate-bar-fill fill-podium" :style="{ width: Math.min(100, stat.hitRate3) + '%' }"></div>
                  </div>
                  <span class="rate-text">{{ stat.hitRate3.toFixed(0) }}%</span>
                </div>
              </div>
            </div>

            <!-- ZAKŁADKA 3: ZAKRES & SKOCZNIE -->
            <div v-else class="amc-hills-tab">
              <div class="amc-chips-row" style="border-top: none; padding-top: 0;">
                <span class="amc-chip">{{ t('analytics.colMedRank') }}: <strong>{{ stat.medianRank?.toFixed(1) || '-' }}</strong></span>
                <span v-if="stat.bestRank !== null" class="amc-chip">
                  {{ t('analytics.colRange') }}: <strong>{{ stat.bestRank }}. – {{ stat.worstRank }}.</strong>
                </span>
                <span
                  class="stat-badge"
                  :class="
                    stat.stdDev != null && stat.stdDev < 5
                      ? 'good'
                      : stat.stdDev != null && stat.stdDev > 8
                        ? 'bad'
                        : 'neutral'
                  "
                >
                  σ {{ stat.stdDev != null ? '±' + stat.stdDev.toFixed(1) : '-' }}
                </span>
              </div>
              <div class="amc-hill-detail-row">
                <span v-if="stat.hillBreakdown.flyingAvg !== null" class="amc-chip">
                  {{ t('hills.filterFlying') }}: <strong>{{ stat.hillBreakdown.flyingAvg.toFixed(1) }}</strong> ({{ stat.hillBreakdown.flyingCount }})
                </span>
                <span v-if="stat.hillBreakdown.largeAvg !== null" class="amc-chip">
                  {{ t('hills.filterLarge') }}: <strong>{{ stat.hillBreakdown.largeAvg.toFixed(1) }}</strong> ({{ stat.hillBreakdown.largeCount }})
                </span>
                <span v-if="stat.hillBreakdown.normalAvg !== null" class="amc-chip">
                  {{ t('hills.filterNormal') }}: <strong>{{ stat.hillBreakdown.normalAvg.toFixed(1) }}</strong> ({{ stat.hillBreakdown.normalCount }})
                </span>
              </div>
            </div>

            <!-- Wykres trendu po kliknięciu karty -->
            <div v-if="expandedAthlete === stat.name" class="trend-chart-container amc-chart" @click.stop>
              <div class="chart-info">
                <strong>{{ t('analytics.chartShortTitle') }}</strong>
                <button type="button" class="btn-close-chart" @click="expandedAthlete = null">{{ t('common.collapse') }} ▲</button>
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
                <path :d="getTrendPath(stat.name)" class="trend-path" />
              </svg>
            </div>
          </template>
          <div v-else class="no-data-msg" style="padding: 8px !important;">
            {{ t('analytics.noDataRange') }}
          </div>
        </div>
      </div>

      <!-- TABELA ANALITYCZNA (WYŁĄCZNIE DESKTOP / WIĘKSZY EKRAN) -->
      <div class="analytics-table-wrapper desktop-only">
        <table class="analytics-table">
          <thead>
            <tr>
              <th
                class="th-sticky th-athlete sortable-th"
                :class="{ 'sorted-th': sortKey === 'name' }"
                @click="sortBy('name')"
                :title="t('analytics.sortNameTitle')"
              >
                {{ t('analytics.colAthlete') }} {{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                v-if="auth.isPro.value"
                class="sortable-th th-price"
                :class="{ 'sorted-th': sortKey === 'price' }"
                @click="sortBy('price')"
                :title="t('analytics.sortPriceTitle')"
              >
                {{ t('analytics.colPrice') }} {{ sortKey === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-jumps"
                :class="{ 'sorted-th': sortKey === 'jumpCount' }"
                @click="sortBy('jumpCount')"
                :title="t('analytics.sortJumpsTitle')"
              >
                {{ t('analytics.colJumps') }} {{ sortKey === 'jumpCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-points"
                :class="{ 'sorted-th': sortKey === 'totalPoints' }"
                @click="sortBy('totalPoints')"
                :title="t('analytics.sortTotalPtsTitle')"
              >
                {{ t('analytics.colTotalPts') }} {{ sortKey === 'totalPoints' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-points"
                :class="{ 'sorted-th': sortKey === 'avgPoints' }"
                @click="sortBy('avgPoints')"
                :title="t('analytics.sortAvgPtsTitle')"
              >
                {{ t('analytics.colAvgPts') }} {{ sortKey === 'avgPoints' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                v-if="auth.isPro.value"
                class="sortable-th th-value"
                :class="{ 'sorted-th': sortKey === 'pointsPerPrice' }"
                @click="sortBy('pointsPerPrice')"
                :title="t('analytics.sortValTitle')"
              >
                {{ t('analytics.colVal') }} {{ sortKey === 'pointsPerPrice' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'avgRank' }"
                @click="sortBy('avgRank')"
                :title="t('analytics.sortAvgRankTitle')"
              >
                {{ t('analytics.colAvgRank') }} {{ sortKey === 'avgRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'medianRank' }"
                @click="sortBy('medianRank')"
                :title="t('analytics.sortMedRankTitle')"
              >
                {{ t('analytics.colMedRank') }} {{ sortKey === 'medianRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rank"
                :class="{ 'sorted-th': sortKey === 'bestRank' }"
                @click="sortBy('bestRank')"
                :title="t('analytics.sortRangeTitle')"
              >
                {{ t('analytics.thMinMax') }} {{ sortKey === 'bestRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate30' }"
                @click="sortBy('hitRate30')"
                :title="t('analytics.sortTop30Title')"
              >
                Top 30 {{ sortKey === 'hitRate30' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate10' }"
                @click="sortBy('hitRate10')"
                :title="t('analytics.sortTop10Title')"
              >
                Top 10 {{ sortKey === 'hitRate10' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-rate"
                :class="{ 'sorted-th': sortKey === 'hitRate3' }"
                @click="sortBy('hitRate3')"
                :title="t('analytics.sortPodiumTitle')"
              >
                {{ t('analytics.optPodium').replace(' (%)', '') }} {{ sortKey === 'hitRate3' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-trend"
                :class="{ 'sorted-th': sortKey === 'trendDiff' }"
                @click="sortBy('trendDiff')"
                :title="t('analytics.sortTrendTitle')"
              >
                {{ t('analytics.colTrend') }} {{ sortKey === 'trendDiff' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th
                class="sortable-th th-std"
                :class="{ 'sorted-th': sortKey === 'stdDev' }"
                @click="sortBy('stdDev')"
                :title="t('analytics.sortStdTitle')"
              >
                σ {{ sortKey === 'stdDev' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="th-profile" :title="t('analytics.sortHillsTitle')">
                {{ t('analytics.colHills') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-if="filteredAnalytics.length === 0">
              <tr>
                <td :colspan="auth.isPro.value ? 15 : 13" class="no-data-msg">
                  {{ t('analytics.noMatching') }}
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
                  <td v-if="auth.isPro.value" class="td-price">
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
                  <td v-if="auth.isPro.value" class="td-value">
                    <div
                      v-if="stat.pointsPerPrice !== null"
                      class="value-score-box"
                      :class="getValueScoreClass(stat.pointsPerPrice)"
                      :title="t('analytics.valTitle', { avg: stat.avgPoints.toFixed(1), price: stat.price !== null ? Number(stat.price).toFixed(1) : '-' })"
                    >
                      <span class="val-num">{{ stat.pointsPerPrice.toFixed(2) }}</span>
                      <span class="val-unit">{{ t('analytics.effUnitShort') }}</span>
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
                      :title="t('analytics.stdTitle', { val: stat.stdDev?.toFixed(2) || '-' })"
                    >
                      {{ stat.stdDev != null ? '±' + stat.stdDev.toFixed(1) : '-' }}
                    </span>
                  </td>

                  <!-- ROZKŁAD SKOCZNI -->
                  <td class="td-profile">
                    <span class="hill-note-tag" :title="stat.hillBreakdown.preferenceText">
                      {{
                        stat.hillBreakdown.preferenceCode === 'flying'
                          ? t('hills.filterFlying')
                          : stat.hillBreakdown.preferenceCode === 'large'
                            ? t('hills.filterLarge')
                            : stat.hillBreakdown.preferenceCode === 'none'
                              ? '—'
                              : t('analytics.prefEvenTag')
                      }}
                    </span>
                  </td>
                </template>

                <td v-else :colspan="auth.isPro.value ? 14 : 12" class="no-data-msg">{{ t('analytics.noDataRange') }}</td>
              </tr>

              <!-- PANEL ROZWINIĘCIA Z WYKRESEM SPARKLINE -->
              <tr v-if="expandedAthlete === stat.name" class="expansion-panel-row">
                <td :colspan="auth.isPro.value ? 15 : 13">
                  <div class="trend-chart-container">
                    <div class="chart-info">
                      <strong>{{ t('analytics.trendTitle') }}</strong>
                      <span>{{ t('analytics.collapseChartHint') }}</span>
                    </div>
                    <svg viewBox="-60 0 1060 190" class="trend-svg">
                      <line x1="0" y1="15" x2="1000" y2="15" class="guide-line top1" />
                      <text x="-12" y="19" text-anchor="end" class="axis-text axis-y">1</text>
                      <line x1="0" y1="42" x2="1000" y2="42" class="guide-line top10" />
                      <text x="-12" y="46" text-anchor="end" class="axis-text axis-y text-good">10</text>
                      <line x1="0" y1="96" x2="1000" y2="96" class="guide-line top30" />
                      <text x="-12" y="100" text-anchor="end" class="axis-text axis-y text-neutral">30</text>
                      <line x1="0" y1="150" x2="1000" y2="150" class="guide-line top50" />
                      <text x="-12" y="152" text-anchor="end" class="axis-text axis-y text-bad">50+</text>

                      <g v-if="getTrendJumps(stat.name).length > 1">
                        <g
                          v-for="(jump, i) in getTrendJumps(stat.name)"
                          :key="i"
                        >
                          <line
                            :x1="getTrendX(i, getTrendJumps(stat.name).length)"
                            y1="145"
                            :x2="getTrendX(i, getTrendJumps(stat.name).length)"
                            y2="150"
                            class="axis-tick"
                          />
                          <g
                            :transform="`translate(${getTrendX(i, getTrendJumps(stat.name).length)}, 164)`"
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

    <!-- SCATTER PLOT: CENA VS ŚREDNIA POZYCJA (PRO) -->
    <div
      v-if="auth.isPro.value && filteredAnalytics.some((a) => a.hasData && a.price)"
      class="card analytics-card scatter-card"
      style="margin-top: 25px"
    >
      <div class="card-header">
        <h2>{{ t('analytics.scatterTitle') }}</h2>
        <p class="subtitle">{{ t('analytics.scatterSub') }}</p>
      </div>

      <div class="scatter-container">
        <div
          class="scatter-wrapper"
          style="position: relative; width: 100%; max-width: 800px; margin: 0 auto"
        >
          <div class="quadrant quad-top-left">
            <span class="quad-title">{{ t('analytics.quadTopLeft') }}</span>
          </div>
          <div class="quadrant quad-top-right">
            <span class="quad-title">{{ t('analytics.quadTopRight') }}</span>
          </div>
          <div class="quadrant quad-bottom-left">
            <span class="quad-title">{{ t('analytics.quadBottomLeft') }}</span>
          </div>
          <div class="quadrant quad-bottom-right">
            <span class="quad-title">{{ t('analytics.quadBottomRight') }}</span>
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

            <g v-for="pt in scatterPlotPoints" :key="pt.ath.name">
              <g
                :transform="`translate(${pt.x}, ${pt.y})`"
                class="scatter-dot-group"
                @mouseenter="hoveredAthlete = pt.ath"
                @mouseleave="hoveredAthlete = null"
                @click="hoveredAthlete = hoveredAthlete?.name === pt.ath.name ? null : pt.ath"
              >
                <circle r="7" class="scatter-dot" />
                <foreignObject
                  :x="pt.labelDx - 100"
                  :y="pt.labelDy"
                  width="200"
                  height="26"
                  class="scatter-foreign"
                  :style="{ opacity: hoveredAthlete?.name === pt.ath.name ? 0 : 1 }"
                >
                  <div class="scatter-dot-text">{{ pt.labelText }}</div>
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

            <text x="5" y="15" fill="#94a3b8" font-size="11" font-weight="bold">{{ t('analytics.axisPlace1') }}</text>
            <text x="5" y="395" fill="#94a3b8" font-size="11" font-weight="bold">
              {{ t('analytics.axisPlace40') }}
            </text>
            <text x="5" y="215" fill="#94a3b8" font-size="10" font-weight="bold">{{ t('analytics.axisAvg20') }}</text>
            <text x="535" y="390" fill="#94a3b8" font-size="11" font-weight="bold">{{ t('analytics.axisPrice3') }}</text>
            <text x="265" y="390" fill="#94a3b8" font-size="10">{{ t('analytics.axisPrice15') }}</text>
          </svg>
        </div>
        <div v-if="hoveredAthlete" class="scatter-selected-banner mobile-only">
          <strong>{{ hoveredAthlete.name }}</strong>
          <span>{{ t('common.price') }}: {{ Number(hoveredAthlete.price).toFixed(1) }} • {{ t('analytics.avgPosShort') }}: {{ hoveredAthlete.avgRank?.toFixed(1) }}</span>
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
  font-size: 0.78rem;
  text-align: left;
  table-layout: auto;
}

.analytics-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  font-size: 0.74rem;
  padding: 8px 6px;
  border-bottom: 2px solid #e2e8f0;
  white-space: normal;
  line-height: 1.2;
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
  padding: 8px 6px;
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
  margin-right: 5px;
}

.athlete-name-text {
  font-weight: 700;
  color: #0f172a;
  display: inline-block;
  max-width: 165px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
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
  gap: 5px;
  min-width: 56px;
}

.rate-bar-track {
  flex: 1;
  min-width: 20px;
  height: 5px;
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
  top: 32px;
  left: 14px;
}

.quad-top-right {
  top: 12px;
  right: 12px;
}

.quad-bottom-left {
  bottom: 32px;
  left: 14px;
}

.quad-bottom-right {
  bottom: 32px;
  right: 12px;
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

/* ========================================================
   MOBILE UX & TABULAR NUMBERS (PORÓWNYWARKA ANALITYKA)
   ======================================================== */
.analytics-table td,
.insight-val {
  font-variant-numeric: tabular-nums;
}

.mobile-only {
  display: none;
}

@media (max-width: 768px), (max-width: 960px) and (max-height: 520px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: flex;
  }
  .amc-kpi-grid.cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .insights-grid {
    grid-template-columns: 1fr !important;
    gap: 10px;
  }
  .analytics-filters-toolbar {
    flex-direction: column;
    align-items: stretch;
    padding: 10px;
    gap: 8px;
  }
  .filter-search-box {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .filter-search-input {
    font-size: 0.8rem !important;
  }
  .filter-toggles-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
    align-items: end;
  }
  .filter-select-wrapper {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .filter-checkbox-label {
    grid-column: span 2;
    font-size: 0.76rem;
  }
  .select-prefix {
    font-size: 0.68rem;
  }
  .filter-inline-select {
    width: 100%;
    font-size: 0.78rem !important;
  }
  .mobile-analytics-controls {
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 10px;
  }
  .mac-sort-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  .mac-sort-row label {
    font-size: 0.72rem;
    font-weight: 700;
    color: #475569;
    white-space: nowrap;
  }
  .mac-select {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #0f172a;
    font-size: 0.8rem !important;
    font-weight: 600;
  }
  .mac-order-btn {
    padding: 5px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #0369a1;
    font-size: 0.74rem;
    font-weight: 700;
    min-height: 34px;
    flex-shrink: 0;
  }
  .mac-view-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: #e2e8f0;
    padding: 3px;
    border-radius: 8px;
  }
  .mac-switch-btn {
    border: none;
    background: transparent;
    color: #475569;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    min-height: 32px;
    cursor: pointer;
  }
  .mac-switch-btn.active {
    background: #ffffff;
    color: #0284c7;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .analytics-mobile-list {
    flex-direction: column;
    gap: 8px;
  }
  .analytics-m-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 10px 11px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.04);
  }
  .analytics-m-card.is-expanded {
    border-color: #93c5fd;
    background: #f8fbff;
  }
  .amc-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .amc-title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .amc-athlete-name {
    font-size: 0.87rem;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .amc-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 7px 6px;
  }
  .amc-kpi-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1px;
  }
  .amc-kpi-label {
    font-size: 0.62rem;
    text-transform: uppercase;
    font-weight: 700;
    color: #64748b;
  }
  .amc-kpi-val {
    font-size: 0.84rem;
    color: #0f172a;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .amc-kpi-val.score-high {
    color: #047857;
    background: transparent;
    border: none;
  }
  .amc-kpi-val.score-med {
    color: #1d4ed8;
    background: transparent;
    border: none;
  }
  .amc-kpi-val.score-low {
    color: #64748b;
    background: transparent;
    border: none;
  }
  .amc-kpi-sub {
    font-size: 0.68rem;
    color: #64748b;
  }
  .amc-rates-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .amc-rate-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .amc-rate-lbl {
    font-size: 0.68rem;
    font-weight: 700;
    color: #64748b;
  }
  .amc-chips-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid #f1f5f9;
  }
  .amc-chip {
    background: #f1f5f9;
    color: #334155;
    font-size: 0.72rem;
    padding: 2px 7px;
    border-radius: 5px;
  }
  .amc-chart {
    margin-top: 2px;
    padding: 10px;
  }
  .btn-close-chart {
    background: #eff6ff;
    border: 1px solid #93c5fd;
    color: #1d4ed8;
    border-radius: 5px;
    padding: 2px 8px;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }
  .analytics-table th:first-child,
  .analytics-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 8;
    background: #ffffff;
    box-shadow: 4px 0 6px -2px rgba(0, 0, 0, 0.08);
    min-width: 145px;
  }
  .analytics-table th:first-child {
    z-index: 10;
    background: #f8fafc;
  }
  .trend-svg,
  .scatter-svg {
    width: 100%;
    height: auto;
  }
  .scatter-wrapper {
    padding: 10px;
    overflow-x: auto;
  }
  .scatter-selected-banner {
    margin-top: 10px;
    padding: 8px 12px;
    background: #0f172a;
    color: #ffffff;
    border-radius: 8px;
    font-size: 0.82rem;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .quadrant {
    display: none;
  }
  .hill-matrix-grid,
  .comparison-cards-grid {
    grid-template-columns: 1fr !important;
  }

  .mac-fs-btn {
    width: 100%;
    padding: 6px 10px;
    border-radius: 7px;
    border: 1px solid #bae6fd;
    background: #f0f9ff;
    color: #0369a1;
    font-size: 0.74rem;
    font-weight: 700;
    cursor: pointer;
  }

  .mac-topic-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    background: #e2e8f0;
    padding: 3px;
    border-radius: 8px;
  }

  .mac-topic-tab {
    border: none;
    background: transparent;
    color: #475569;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 6px 4px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mac-topic-tab.active {
    background: #ffffff;
    color: #0284c7;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .amc-hills-tab {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .amc-hill-detail-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mobile-desktop-hint {
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .amc-kpi-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 8px !important;
  }

  .amc-rates-grid {
    grid-template-columns: 1fr !important;
    gap: 7px !important;
  }

  .amc-rate-item {
    flex-direction: row !important;
    align-items: center;
    justify-content: space-between;
    gap: 10px !important;
  }

  .amc-rate-lbl {
    min-width: 68px;
    font-size: 0.76rem !important;
  }

  .rate-cell {
    flex: 1;
  }
}
</style>
