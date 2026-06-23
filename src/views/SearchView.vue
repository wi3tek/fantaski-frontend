<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'

const route = useRoute()
const router = useRouter()

const hoveredAthlete = ref<any | null>(null)

// --- STAN APLIKACJI ---
const placeContainerRef = ref<HTMLElement | null>(null)
const athleteContainerRef = ref<HTMLElement | null>(null)

// Listy pobrane z bazy
const availableNames = ref<string[]>([])
const athletesWithPrices = ref<{ name: string; fis_code: number; price: number }[]>([])

// Stan selekcji skoczków
const selectedNames = ref<string[]>([])
const excludedNames = ref<string[]>([])
const searchedNames = ref<string[]>([])

// Tryb Cenowy ESM
const priceMode = ref(false)
const priceMin = ref(0.1)
const priceMax = ref(3.0)

// Autocomplete
const nameInput = ref('')
const showDropdown = ref(false)
const activeIndex = ref(-1)

const showCategoryDropdown = ref(false)

// Słowniki
const availablePlaces = ref<string[]>([])
const hillTypes = ref<Record<string, { pl: string; eng: string }>>({})
const categoriesDict = ref<Record<string, { pl: string; eng: string }>>({})
const sessionsDict = ref<Record<string, { pl: string; eng: string }>>({})
const showPlaceDropdown = ref(false)

// STAN FORMULARZA (Backend)
const searchForm = ref({
  place: '',
  hill_type: '',
  category: [] as string[], // Zmiana z '' na pustą tablicę
  session_type: '',
  date_from: '',
  date_to: '',
  limit: 10,
})

// STAN FILTRÓW WIDOKU (Frontend - Na żywo)
const onlyCommon = ref(false)
const hideEmptyAthletes = ref(false)
const highlightTopN = ref(50)

const results = shallowRef<any[]>([])
const loading = ref(false)

// Zmienne do wirtualnego okna wierszy
const rowStart = ref(0)
const rowsWindowSize = 15

// ==========================================
// DYNAMICZNE WIRTUALNE OKNO KOLUMN (RESPONSYWNE)
// ==========================================
const colStart = ref(0)
const athletesWindowSize = ref(1) // Inicjalne założenie, zmieni się od razu po załadowaniu
const tableWrapperRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const calculateVisibleColumns = () => {
  if (!tableWrapperRef.value) return
  const wrapperWidth = tableWrapperRef.value.clientWidth
  // Odejmujemy sztywne szerokości lewych kolumn: Data (100) + Miejsce (260) = 360
  // Dzielimy resztę przez szerokość jednej kolumny skoczka (140)
  const availableForAthletes = wrapperWidth - 360
  const maxCols = Math.floor(availableForAthletes / 140)

  athletesWindowSize.value = Math.max(1, maxCols) // Zawsze pokaż co najmniej jednego

  // Zabezpieczenie na wypadek, gdyby powiększenie ekranu wyrzuciło nas "poza tablicę"
  const maxStart = Math.max(0, filteredVisibleAthletes.value.length - athletesWindowSize.value)
  if (colStart.value > maxStart) {
    colStart.value = maxStart
  }
}

watch(tableWrapperRef, (newRef) => {
  if (resizeObserver) resizeObserver.disconnect()
  if (newRef) {
    resizeObserver = new ResizeObserver(() => calculateVisibleColumns())
    resizeObserver.observe(newRef)
    calculateVisibleColumns()
  }
})
// ==========================================

// --- FUNKCJE SYNCHRONIZACJI URL <-> STAN ---
const syncStateFromUrl = () => {
  const q = route.query

  if (q.names) {
    const namesArray = Array.isArray(q.names) ? q.names : [q.names]
    selectedNames.value = namesArray as string[]
  }

  searchForm.value.place = (q.place as string) || ''
  searchForm.value.hill_type = (q.hill_type as string) || ''

  if (q.category) {
    searchForm.value.category = Array.isArray(q.category) ? (q.category as string[]) : [q.category as string]
  } else {
    searchForm.value.category = []
  }

  searchForm.value.session_type = (q.session_type as string) || ''

  searchForm.value.session_type = (q.session_type as string) || ''
  searchForm.value.date_from = (q.date_from as string) || ''
  searchForm.value.date_to = (q.date_to as string) || ''
  searchForm.value.limit = q.limit ? parseInt(q.limit as string) : 10

  if (q.priceMode === 'true') {
    priceMode.value = true
    if (q.priceMin) priceMin.value = parseFloat(q.priceMin as string)
    if (q.priceMax) priceMax.value = parseFloat(q.priceMax as string)
  }

  if (q.onlyCommon === 'true') onlyCommon.value = true
  if (q.hideEmptyAthletes === 'true') hideEmptyAthletes.value = true
  if (q.highlightTopN) highlightTopN.value = parseInt(q.highlightTopN as string)
}

const updateUrlQueryParams = () => {
  const queryParams: Record<string, any> = { ...searchForm.value }

  Object.keys(queryParams).forEach((key) => {
    // Dodano warunek ignorujący puste tablice (np. odznaczono wszystkie checkboxy)
    if (queryParams[key] === '' || queryParams[key] === null || (Array.isArray(queryParams[key]) && queryParams[key].length === 0)) {
      delete queryParams[key]
    }
  })

  if (selectedNames.value.length > 0) queryParams.names = selectedNames.value
  if (onlyCommon.value) queryParams.onlyCommon = 'true'
  if (hideEmptyAthletes.value) queryParams.hideEmptyAthletes = 'true'
  queryParams.highlightTopN = highlightTopN.value

  if (priceMode.value) {
    queryParams.priceMode = 'true'
    queryParams.priceMin = priceMin.value
    queryParams.priceMax = priceMax.value
  }

  router.replace({ query: queryParams })
}

watch([onlyCommon, hideEmptyAthletes, highlightTopN], () => {
  updateUrlQueryParams()
})

// --- LOGIKA MULTI-SELECTA ZAWODNIKÓW ---
const filteredNames = computed(() => {
  if (!nameInput.value) return []
  const lowerInput = nameInput.value.toLowerCase()

  if (priceMode.value) {
    return athletesWithPrices.value
      .filter(
        (a) => a.name.toLowerCase().includes(lowerInput) && !selectedNames.value.includes(a.name),
      )
      .slice(0, 15)
  } else {
    return availableNames.value
      .filter((n) => n.toLowerCase().includes(lowerInput) && !selectedNames.value.includes(n))
      .map((n) => ({ name: n }))
      .slice(0, 15)
  }
})

const addName = (name: string) => {
  if (!selectedNames.value.includes(name)) {
    selectedNames.value.push(name)
  }
  nameInput.value = ''
  showDropdown.value = false
}

const removeName = (name: string) => {
  selectedNames.value = selectedNames.value.filter((n) => n !== name)
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
  if (placeContainerRef.value && !placeContainerRef.value.contains(event.target as Node)) {
    showPlaceDropdown.value = false
  }
  if (athleteContainerRef.value && !athleteContainerRef.value.contains(event.target as Node)) {
    showDropdown.value = false
  }
}

const filteredPlaces = computed(() => {
  if (!searchForm.value.place) return availablePlaces.value.slice(0, 10)
  const lowerInput = searchForm.value.place.toLowerCase()
  return availablePlaces.value.filter((p) => p.toLowerCase().includes(lowerInput)).slice(0, 10)
})

const selectPlace = (place: string) => {
  searchForm.value.place = place
  showPlaceDropdown.value = false
}

// --- WYSZUKIWANIE BAZOWE (BACKEND) ---
const performSearch = async () => {
  excludedNames.value = []
  let finalNamesToSearch: string[] = []

  if (priceMode.value) {
    const inRange = athletesWithPrices.value.filter(
      (a) => a.price >= priceMin.value && a.price <= priceMax.value,
    )

    if (selectedNames.value.length > 0) {
      finalNamesToSearch = inRange
        .filter((a) => selectedNames.value.includes(a.name))
        .map((a) => a.name)
    } else {
      finalNamesToSearch = inRange.map((a) => a.name)
    }

    if (finalNamesToSearch.length === 0) {
      alert('Brak zawodników spełniających kryteria cenowe!')
      return
    }
  } else {
    if (selectedNames.value.length === 0) {
      alert('Dodaj co najmniej jednego skoczka!')
      return
    }
    finalNamesToSearch = [...selectedNames.value]
  }

  searchedNames.value = finalNamesToSearch
  updateUrlQueryParams()

  loading.value = true
  colStart.value = 0
  rowStart.value = 0
  results.value = []

  const payload: any = Object.fromEntries(
    Object.entries(searchForm.value).filter(([_, v]) => {
      if (Array.isArray(v)) return v.length > 0
      return v !== '' && v !== null
    })
  )

  try {
    const res = await fetch('http://127.0.0.1:8000/stats/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      results.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd sieci', e)
  } finally {
    loading.value = false
  }
}

// --- WIDOK ZAWODNIKÓW NA FRONTENDZIE ---
const excludeAthlete = (name: string) => {
  if (!excludedNames.value.includes(name)) {
    excludedNames.value.push(name)
  }
}

const visibleAthletes = computed(() => {
  const active = searchedNames.value.filter((name) => !excludedNames.value.includes(name))

  const mapped = active.map((name) => {
    const found = athletesWithPrices.value.find((a) => a.name === name)
    return {
      name,
      price: found ? found.price : null,
    }
  })

  mapped.sort((a, b) => {
    const priceA = a.price ?? -1
    const priceB = b.price ?? -1
    return priceB - priceA
  })

  return mapped
})

// --- GRUPOWANIE WYNIKÓW ---
const groupedRows = computed(() => {
  const map: Record<string, any> = {}

  results.value.forEach((athleteData: any) => {
    const athleteName = athleteData.name
    if (excludedNames.value.includes(athleteName)) return

    athleteData.jumps.forEach((jump: any) => {
      const key = `${jump.codex}-${jump.round}`
      if (!map[key]) {
        map[key] = { meta: jump, athletes: {} }
      }
      map[key].athletes[athleteName] = jump
    })
  })

  let rows = Object.values(map)

  // POPRAWKA: Filtr "Wspólne zawody" sprawdza teraz TYLKO tych zawodników,
  // którzy nie zostali ukryci i mają faktycznie oddane jakiekolwiek skoki!
  if (onlyCommon.value && filteredVisibleAthletes.value.length > 0) {
    rows = rows.filter((row) => {
      return filteredVisibleAthletes.value.every((a) => row.athletes[a.name] !== undefined)
    })
  }

  rows.forEach((row) => {
    const jumps = Object.values(row.athletes) as any[]
    const distances = jumps.map((j) => j.distance).filter((v) => v != null)
    const points = jumps.map((j) => j.points).filter((v) => v != null)
    const ranks = jumps.map((j) => j.jump_rank).filter((v) => v != null)

    row.maxDist = Math.max(...distances)
    row.minDist = Math.min(...distances)
    row.maxPoints = Math.max(...points)
    row.minPoints = Math.min(...points)
    row.minRank = Math.min(...ranks)
    row.maxRank = Math.max(...ranks)
  })

  return rows.sort((a, b) => new Date(b.meta.date).getTime() - new Date(a.meta.date).getTime())
})

// NAJPIERW: Odfiltrowujemy pustych zawodników na podstawie surowych wyników z bazy
const filteredVisibleAthletes = computed(() => {
  let list = visibleAthletes.value

  if (hideEmptyAthletes.value) {
    // Sprawdzamy oryginalne wyniki z bazy - kto w ogóle ma przypisaną tablicę 'jumps'
    const namesWithData = new Set(
      results.value
        .filter((data: any) => data.jumps && data.jumps.length > 0)
        .map((data: any) => data.name),
    )
    list = list.filter((athlete) => namesWithData.has(athlete.name))
  }

  return list
})

const displayedAthletes = computed(() => {
  return filteredVisibleAthletes.value.slice(
    colStart.value,
    colStart.value + athletesWindowSize.value,
  )
})

const displayedRows = computed(() => {
  return groupedRows.value.slice(rowStart.value, rowStart.value + rowsWindowSize)
})

// --- LOGIKA SORTOWANIA PANELU ANALITYCZNEGO ---
const sortKey = ref<string>('roi') // Domyślnie sortujemy po ROI
const sortOrder = ref<'asc' | 'desc'>('asc')

const sortBy = (key: string) => {
  if (sortKey.value === key) {
    // Jeśli klikamy w tę samą kolumnę, odwracamy kierunek
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    // Intuicyjny domyślny kierunek dla różnych statystyk:
    // Wyższy hit rate, więcej skoków, wyższa cena -> malejąco (desc)
    // Lepsza pozycja (niższa liczba), mniejsze ROI, mniejsze odchylenie -> rosnąco (asc)
    if (['hitRate30', 'hitRate20', 'hitRate10', 'hitRate3', 'jumpCount', 'trendDiff', 'price'].includes(key)) {
      sortOrder.value = 'desc'
    } else {
      sortOrder.value = 'asc'
    }
  }
}

// ==========================================
// PANEL ANALITYCZNY ESM (OBLICZENIA Z MIEJSCAMI)
// ==========================================
const athleteAnalytics = computed(() => {
  if (groupedRows.value.length === 0) return []

  return filteredVisibleAthletes.value
    .map((athlete) => {
      const jumps: any[] = []
      groupedRows.value.forEach((row) => {
        if (row.athletes[athlete.name]) {
          jumps.push(row.athletes[athlete.name])
        }
      })

      if (jumps.length === 0) {
        return { name: athlete.name, price: athlete.price, hasData: false }
      }

      // Wycofujemy się ze średniej punktów, liczymy po MIEJSCACH (ranks)
      const ranksArr = jumps.map((j) => j.jump_rank).filter((r) => r != null)
      const count = ranksArr.length

      const avgRank = count ? ranksArr.reduce((a, b) => a + b, 0) / count : null

      // ROI (Współczynnik: Miejsce × Cena) -> Niższa wartość to lepiej dla nas
      const roi =
        athlete.price && athlete.price > 0 && avgRank !== null ? avgRank * athlete.price : null

      // Hit Rate (Procent skoków w Top 30)
      const hitRate30 = count ? (ranksArr.filter((r) => r <= 30).length / count) * 100 : 0
      const hitRate20 = count ? (ranksArr.filter((r) => r <= 20).length / count) * 100 : 0
      const hitRate10 = count ? (ranksArr.filter((r) => r <= 10).length / count) * 100 : 0
      const hitRate3 = count ? (ranksArr.filter((r) => r <= 3).length / count) * 100 : 0

      // Stabilność (Odchylenie standardowe miejsc)
      let stdDev = null
      if (count > 1 && avgRank !== null) {
        const variance = ranksArr.reduce((a, b) => a + Math.pow(b - avgRank, 2), 0) / count
        stdDev = Math.sqrt(variance)
      }

      // Wskaźnik Formy po Miejscach (ostatnie 3 vs wcześniejsze 3)
      let trendIcon = '➡️'
      let trendClass = 'trend-neutral'
      let trendText = 'Brak danych'
      let trendDiff = null // Inicjalizacja dla sortowania

      if (count >= 2) {
        const last3 = ranksArr.slice(0, 3)
        const prev3 = ranksArr.slice(3, 6)

        const avgLast3 = last3.reduce((a, b) => a + b, 0) / last3.length
        const avgPrev3 = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : null

        if (avgPrev3 !== null) {
          const diff = avgPrev3 - avgLast3
          trendDiff = diff // Zapisujemy czystą liczbę do sortowania
          if (diff > 2) {
            trendIcon = '⬆️'
            trendClass = 'trend-up'
            trendText = `+${diff.toFixed(1)} poz`
          } else if (diff < -2) {
            trendIcon = '⬇️'
            trendClass = 'trend-down'
            trendText = `${diff.toFixed(1)} poz`
          } else {
            trendIcon = '➡️'
            trendClass = 'trend-neutral'
            trendText = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} poz`
          }
        } else {
          trendText = 'Zbyt mało prób'
        }
      }


      return {
        name: athlete.name,
        price: athlete.price,
        hasData: true,
        avgRank,
        roi,
        hitRate30,
        hitRate20,
        hitRate10,
        hitRate3,
        stdDev,
        trendIcon,
        trendClass,
        trendText,
        jumpCount: count,
        trendDiff
      }
    }) // koniec .map
    .sort((a, b) => {
      // Zawodnicy bez danych zawsze lądują na samym dole niezależnie od sortowania
      if (!a.hasData && !b.hasData) return 0
      if (!a.hasData) return 1
      if (!b.hasData) return -1

      let valA = a[sortKey.value]
      let valB = b[sortKey.value]

      // Obsługa wartości pustych (null/undefined) w sortowaniu
      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1

      // Sortowanie alfabetyczne dla nazwisk
      if (typeof valA === 'string') {
        return sortOrder.value === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA)
      }

      // Sortowanie liczbowe
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    })
})



// ==========================================
// KONTROLA OKNA WIDOKU (Z UWZGLĘDNIENIEM NOWYCH ZMIENNYCH)
// ==========================================
const moveCol = (step: number) => {
  const maxStart = Math.max(0, filteredVisibleAthletes.value.length - athletesWindowSize.value)
  colStart.value = Math.max(0, Math.min(colStart.value + step, maxStart))
}

const moveRow = (step: number) => {
  const maxStart = Math.max(0, groupedRows.value.length - rowsWindowSize)
  rowStart.value = Math.max(0, Math.min(rowStart.value + step, maxStart))
}

watch(
  () => filteredVisibleAthletes.value.length,
  (newLen) => {
    const maxStart = Math.max(0, newLen - athletesWindowSize.value)
    if (colStart.value > maxStart) colStart.value = maxStart
  },
)
watch(
  () => groupedRows.value.length,
  (newLen) => {
    const maxStart = Math.max(0, newLen - rowsWindowSize)
    if (rowStart.value > maxStart) rowStart.value = maxStart
  },
)

// --- POBIERANIE SŁOWNIKÓW I STARTOWE ZAPYTANIA ---
const fetchFormData = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/stats/form-data')
    if (res.ok) {
      const data = await res.json()
      availablePlaces.value = data.places || []
      hillTypes.value = data.hill_types || {}
      categoriesDict.value = data.categories || {}
      sessionsDict.value = data.sessions || {}
    }
  } catch (e) {
    console.error('Błąd pobierania słowników', e)
  }
}

const fetchPricesData = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/stats/athletes/with-prices')
    if (res.ok) {
      athletesWithPrices.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd pobierania cenników', e)
  }
}

onMounted(async () => {
  document.addEventListener('click', handleClickOutside)

  await fetchFormData()
  await fetchPricesData()

  try {
    const res = await fetch('http://127.0.0.1:8000/athletes/names')
    if (res.ok) availableNames.value = await res.json()
  } catch (e) {
    console.error('Nie udało się pobrać nazwisk', e)
  }

  if (route.query.fis_code) {
    const fisCode = route.query.fis_code as string
    try {
      const athleteRes = await fetch(`http://127.0.0.1:8000/athletes/find?fis_code=${fisCode}`)
      if (athleteRes.ok) {
        const athleteData = await athleteRes.json()
        const exactName = athleteData.full_name
        if (!selectedNames.value.includes(exactName)) {
          selectedNames.value.push(exactName)
        }
        await performSearch()
      }
    } catch (e) {
      console.error('Błąd', e)
    }
  } else {
    syncStateFromUrl()
    if (selectedNames.value.length > 0 || priceMode.value) {
      performSearch()
    }
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (resizeObserver) resizeObserver.disconnect()
})

// --- POMOCNICZE FUNKCJE ---
const getStatClass = (val: number, bestVal: number, worstVal: number) => {
  if (val == null) return ''
  if (val === bestVal) return 'text-best'
  if (val === worstVal) return 'text-worst'
  return ''
}

const getHighlightClass = (rank: number | null | undefined) => {
  if (rank === null || rank === undefined) return ''
  if (rank <= highlightTopN.value) return 'jump-in-points'
  return 'jump-outside-points'
}

const getCategoryName = (code: string) => categoriesDict.value[code]?.pl || code
const getSessionName = (code: string) => sessionsDict.value[code]?.pl || code

// Stan rozwiniętego wiersza (przechowuje nazwę skoczka)
const expandedAthlete = ref<string | null>(null)

const toggleAthleteExpansion = (name: string) => {
  expandedAthlete.value = expandedAthlete.value === name ? null : name
}

// Funkcja generująca punkty dla wykresu SVG (Oś Y: Miejsce, Oś X: Konkursy)
const getTrendPath = (athleteName: string) => {
  // Pobieramy skoki chronologicznie (od najstarszego do najnowszego dla wykresu)
  const athleteJumps = [...groupedRows.value]
    .reverse()
    .map((row) => row.athletes[athleteName])
    .filter((j) => j != null)

  if (athleteJumps.length < 2) return ''

  const width = 1000
  const height = 150
  const padding = 20

  // Skalowanie X
  const xStep = (width - 2 * padding) / (athleteJumps.length - 1)

  // Skalowanie Y (zakładamy zakres miejsc 1-50, gdzie 1 jest na górze)
  const yScale = (rank: number) => {
    const minRank = 1
    const maxRank = 50
    const clampedRank = Math.min(Math.max(rank, minRank), maxRank)
    return padding + ((clampedRank - minRank) / (maxRank - minRank)) * (height - 2 * padding)
  }

  return athleteJumps
    .map((j, i) => {
      const x = padding + i * xStep
      const y = yScale(j.jump_rank)
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`
    })
    .join(' ')
}

// --- SYSTEM ZAPISYWANIA ZESTAWÓW (LOCAL STORAGE) ---
const savedSets = ref<Record<string, string[]>>({})
const newSetName = ref('')
const showSaveModal = ref(false)

// Ładowanie zapisanych zestawów z pamieci przy montowaniu komponentu
onMounted(() => {
  const stored = localStorage.getItem('esm_saved_athlete_sets')
  if (stored) {
    try {
      savedSets.value = JSON.parse(stored)
    } catch (e) {
      console.error(e)
    }
  }
})

const saveCurrentSet = () => {
  if (!newSetName.value.trim()) return
  savedSets.value[newSetName.value.trim()] = [...selectedNames.value]
  localStorage.setItem('esm_saved_athlete_sets', JSON.stringify(savedSets.value))
  newSetName.value = ''
  showSaveModal.value = false
}

const loadSet = (setName: string) => {
  if (savedSets.value[setName]) {
    selectedNames.value = [...savedSets.value[setName]]
  }
}

const deleteSet = (setName: string) => {
  delete savedSets.value[setName]
  localStorage.setItem('esm_saved_athlete_sets', JSON.stringify(savedSets.value))
}
</script>

<template>
  <div class="page">
    <h2>Ekspert System & Analiza (ESM)</h2>

    <div class="card search-card">
      <div class="card-header">
        <h3>🔍 Kryteria Wyszukiwania w Bazie (Krok 1)</h3>
        <p class="subtitle">
          Wypełnij filtry i kliknij "Wyszukaj Wyniki", aby pobrać dane historyczne z bazy.
        </p>
      </div>

      <form @submit.prevent="performSearch" class="search-form">
        <div class="options-container" style="border: none; margin-bottom: 10px; padding-top: 0">
          <label
            class="toggle-label toggle-esm"
            title="Włącza filtrowanie po cenie z Fantasy i pobiera z automatu wszystkich zawodników z przedziału."
          >
            <input v-model="priceMode" type="checkbox" />
            <span style="font-weight: bold">🎯 Analiza cen zawodników</span>
          </label>
        </div>

        <div v-if="priceMode" class="price-sliders-container" style="margin-bottom: 20px">
          <div class="slider-group">
            <div class="slider-header">
              <label>Minimalna cena (od):</label>
              <span class="price-badge">{{ priceMin }}</span>
            </div>
            <input
              type="range"
              class="styled-slider"
              v-model="priceMin"
              min="0.1"
              max="3.0"
              step="0.1"
            />
          </div>

          <div class="slider-group">
            <div class="slider-header">
              <label>Maksymalna cena (do):</label>
              <span class="price-badge">{{ priceMax }}</span>
            </div>
            <input
              type="range"
              class="styled-slider"
              v-model="priceMax"
              min="0.1"
              max="3.0"
              step="0.1"
            />
          </div>
        </div>

        <div class="multi-select-container" ref="athleteContainerRef">
          <label v-if="priceMode">Ogranicz zawężonych skoczków (opcjonalnie):</label>
          <label v-else>Wybierz skoczków do porównania:</label>

          <div class="chips-box">
            <span v-for="name in selectedNames" :key="name" class="chip">
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
                  priceMode ? 'Wybierz ulubieńców z przedziału...' : 'Wpisz nazwisko...'
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
                <select
                  id="set-select"
                  @change="loadSet(($event.target as HTMLSelectElement).value)"
                >
                  <option value="">-- Wybierz zapisany skład --</option>
                  <option v-for="(_, name) in savedSets" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>

              <button
                v-if="selectedNames.length > 0"
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
                  placeholder="Nazwa zestawu (np. Moje Asy)..."
                  @keyup.enter="saveCurrentSet"
                />
                <button @click="saveCurrentSet" class="btn-confirm-save">Zatwierdź</button>
                <button @click="showSaveModal = false" class="btn-cancel-save">Anuluj</button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-grid mt-4">
          <div class="filter-group autocomplete-container" ref="placeContainerRef">
            <label>Miejsce</label>
            <input
              type="text"
              v-model="searchForm.place"
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
            <select v-model="searchForm.hill_type">
              <option value="">Wszystkie</option>
              <option v-for="(info, code) in hillTypes" :key="code" :value="code">
                {{ info.pl }}
              </option>
            </select>
          </div>

          <div class="filter-group" style="position: relative;">
            <label>Kategoria / Cykl</label>

            <div
              class="dropdown-trigger"
              @click="showCategoryDropdown = !showCategoryDropdown"
            >
              <span>{{ searchForm.category.length > 0 ? `Wybrano (${searchForm.category.length})` : 'Wszystkie' }}</span>
              <span style="font-size: 0.8em; color: #94a3b8;">{{ showCategoryDropdown ? '▲' : '▼' }}</span>
            </div>

            <div
              v-if="showCategoryDropdown"
              class="checkbox-list-container custom-dropdown"
            >
              <label v-for="(info, code) in categoriesDict" :key="code" class="toggle-label list-checkbox">
                <input type="checkbox" :value="code" v-model="searchForm.category" />
                <span>{{ info.pl }}</span>
              </label>
            </div>
          </div>

          <div class="filter-group">
            <label>Typ sesji</label>
            <select v-model="searchForm.session_type">
              <option value="">Wszystkie</option>
              <option v-for="(info, code) in sessionsDict" :key="code" :value="code">
                {{ info.pl }}
              </option>
            </select>
          </div>

          <div class="filter-group">
            <label>Data od</label>
            <input type="date" v-model="searchForm.date_from" />
          </div>

          <div class="filter-group">
            <label>Data do</label>
            <input type="date" v-model="searchForm.date_to" />
          </div>

          <div class="filter-group slider-group" style="min-width: 200%">
            <div class="slider-header" style="margin-bottom: 5px">
              <label>Ostatnie skoki (Limit):</label>
              <span class="price-badge">{{ searchForm.limit }}</span>
            </div>
            <input
              type="range"
              class="styled-slider"
              v-model.number="searchForm.limit"
              min="1"
              max="200"
              step="1"
            />
          </div>
        </div>
        <div>
          <label
            class="toggle-label frontend-toggle"
            title="Pokaże tylko te serie, w których wszyscy aktualnie widoczni zawodnicy oddali skok"
          >
            <input v-model="onlyCommon" type="checkbox" />
            <span>Wyświetlaj tylko wspólne zawody</span>
          </label>
        </div>
        <br />

        <button type="submit" class="btn-submit" :disabled="loading">
          {{ loading ? 'Pobieranie Danych...' : 'Wyszukaj Wyniki' }}
        </button>
      </form>
    </div>

    <div v-if="loading" style="margin-top: 40px">
      <SkiLoader></SkiLoader>
    </div>

    <div v-else-if="groupedRows.length > 0" class="results-layout">
      <div class="card view-filters-card">
        <div class="card-header">
          <h3>⚡ Filtry Widoku (Na żywo - Krok 2)</h3>
          <p class="subtitle">
            Te filtry natychmiast modyfikują poniższą tabelę (nie wymagają pobierania z bazy).
          </p>
        </div>

        <div class="frontend-filters-row">
          <div class="filter-group" style="min-width: 200px">
            <label>Wyróżnij miejsca do (Top X)</label>
            <input type="number" v-model="highlightTopN" min="1" max="100" />
          </div>

          <div class="checkbox-filters">
            <label
              class="toggle-label frontend-toggle"
              title="Odznacza i ukrywa kolumny skoczków, którzy nie posiadają żadnych danych w wyszukanych zawodach."
            >
              <input v-model="hideEmptyAthletes" type="checkbox" />
              <span>Ukryj skoczków bez skoków</span>
            </label>
          </div>
        </div>
      </div>

      <div class="results-container">
        <div class="nav-horizontal">
          <div class="nav-info-group" style="display: flex; gap: 30px; flex-wrap: wrap;">
    <span class="nav-label">
      Wiersze (Zawody):
      <strong>
        {{ Math.min(rowStart + 1, groupedRows.length) }} -
        {{ Math.min(rowStart + rowsWindowSize, groupedRows.length) }} z {{ groupedRows.length }}
      </strong>
    </span>
            <span class="nav-label">
      Kolumny (Skoczkowie):
      <strong>
        {{ filteredVisibleAthletes.length > 0 ? Math.min(colStart + 1, filteredVisibleAthletes.length) : 0 }} -
        {{ Math.min(colStart + athletesWindowSize, filteredVisibleAthletes.length) }} z {{ filteredVisibleAthletes.length }}
      </strong>
    </span>
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
            <button
              class="nav-btn"
              @click="moveRow(-1)"
              :disabled="rowStart === 0"
              title="-1 Wiersz"
            >
              ▲ 1
            </button>
          </div>
        </div>

        <div class="table-layout-wrapper">
          <div class="nav-vertical nav-left">
            <div class="sticky-nav-buttons">
              <button
                class="nav-btn"
                @click="moveCol(-athletesWindowSize)"
                :disabled="colStart === 0"
                :title="`Cofa widok o cały dostępny ekran`"
              >
                ⏪ Strona
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
                        athlete.price
                      }}</span>
                      <span class="athlete-name" :title="athlete.name">{{ athlete.name }}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in displayedRows" :key="idx">
                  <td class="meta-cell sticky-col sticky-col-1">
                    {{ row.meta.date }}<br />
                    <small style="color: #64748b">{{ row.meta.time }}</small>
                  </td>
                  <td class="meta-cell sticky-col sticky-col-2">
                    <strong>{{ row.meta.place }} HS{{ row.meta.hill_size || '?' }}</strong
                    >: {{ getSessionName(row.meta.session_type) }}:
                    <a target="_self" style="color: darkred"
                      ><RouterLink :to="`/sessions/${row.meta.session_id}`" class="session-link"
                        >LINK</RouterLink
                      ></a
                    ><br />
                    <small
                      >{{ getCategoryName(row.meta.category) }} | Seria: {{ row.meta.round }}</small
                    >
                  </td>

                  <td v-for="athlete in displayedAthletes" :key="athlete.name" class="athlete-cell">
                    <div
                      v-if="row.athletes[athlete.name]"
                      :class="[
                        'jump-data',
                        getHighlightClass(row.athletes[athlete.name].jump_rank),
                      ]"
                    >
                      <span
                        :class="
                          getStatClass(
                            row.athletes[athlete.name].jump_rank,
                            row.minRank,
                            row.maxRank,
                          )
                        "
                      >
                        Poz: <strong>{{ row.athletes[athlete.name].jump_rank }}</strong>
                      </span>
                      <span
                        :class="
                          getStatClass(
                            row.athletes[athlete.name].distance,
                            row.maxDist,
                            row.minDist,
                          )
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
                :title="`Przesuwa widok o cały dostępny ekran`"
              >
                Strona ⏩
              </button>
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
          <span class="nav-label"
            >Skoczkowie:
            <strong
              >{{ Math.min(colStart + 1, filteredVisibleAthletes.length) }} -
              {{ Math.min(colStart + athletesWindowSize, filteredVisibleAthletes.length) }} z
              {{ filteredVisibleAthletes.length }}</strong
            ></span
          >
        </div>
      </div>

      <div class="card analytics-card" v-if="athleteAnalytics.length > 0">
        <div class="card-header">
          <h3>📊 Panel Analityczny (Wnioski Fantasy)</h3>
          <p class="subtitle">
            Analiza statystyczna widocznych powyżej zawodników na podstawie wczytanych wyników.
          </p>
        </div>

        <div class="analytics-table-wrapper">
          <table class="analytics-table">
            <thead>
            <tr>
              <th style="text-align: left;" class="sortable-th" @click="sortBy('name')">
                Zawodnik {{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable-th" @click="sortBy('price')">
                Cena ESM {{ sortKey === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable-th" @click="sortBy('jumpCount')">
                Skoki {{ sortKey === 'jumpCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Łączna liczba oddanych i zanalizowanych skoków zawodnika w wybranym okresie (maksymalnie tyle, ile wynosi ustawiony suwakiem limit).">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('avgRank')">
                Śr. Miejsce {{ sortKey === 'avgRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Suma zajętych miejsc podzielona przez liczbę oddanych skoków w wyświetlanych na ekranie konkursach.">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('roi')">
                Współczynnik ROI {{ sortKey === 'roi' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="(Średnie Miejsce × Cena ESM). Im NIŻSZY wynik, tym tańszy i lepiej skaczący zawodnik. Przykład: 10. miejsce skoczka za 0.5M daje świetny wynik 5.0. 10. miejsce skoczka za 2.0M daje słaby wynik 20.0.">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('hitRate30')">
                Hit Rate (Top 30) {{ sortKey === 'hitRate30' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 30-tce (wszedł do II serii). Pokazuje ogólną niezawodność skoczka.">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('hitRate20')">
                Top 20 {{ sortKey === 'hitRate20' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 20-tce.">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('hitRate10')">
                Top 10 {{ sortKey === 'hitRate10' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 10-tce. Pokazuje przynależność do ścisłej czołówki.">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('hitRate3')">
                Top 3 {{ sortKey === 'hitRate3' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Procent skoków zakończonych na podium (miejsca 1-3).">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('trendDiff')">
                Trend Formy {{ sortKey === 'trendDiff' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Porównanie średniego miejsca z 3 najnowszych skoków do średniej z 3 poprzednich. Zielona strzałka do góry (⬆️) oznacza, że skoczek zajmuje coraz wyższe lokaty (jego miejsca liczbowo maleją).">&#9432;</span>
              </th>
              <th class="sortable-th" @click="sortBy('stdDev')">
                Stabilność {{ sortKey === 'stdDev' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span class="info-icon" data-tooltip="Matematyczne odchylenie standardowe zajmowanych miejsc.
- Poniżej 5.0: Wybitna regularność (np. skacze na miejscach 10, 11, 12).
- Powyżej 12.0: Loteria (np. skacze na miejscach 5, 45, 15).">&#9432;</span>
              </th>
            </tr>
            </thead>
            <tbody>
              <template v-for="stat in athleteAnalytics" :key="stat.name">
                <tr
                  @click="toggleAthleteExpansion(stat.name)"
                  class="clickable-row"
                  :class="{ 'is-expanded': expandedAthlete === stat.name }"
                >
                  <td style="text-align: left; font-weight: bold">
                    <span class="expansion-chevron">{{
                      expandedAthlete === stat.name ? '▼' : '▶'
                    }}</span>
                    {{ stat.name }}
                  </td>

                  <template v-if="stat.hasData">
                    <td>
                      <span v-if="stat.price" class="badge price-autocomplete-badge">{{
                        stat.price
                      }}</span>
                    </td>
                    <td>
                      <span class="stat-badge neutral">{{ stat.jumpCount }}</span>
                    </td>
                    <td>{{ stat.avgRank?.toFixed(1) }}</td>
                    <td>
                      <span
                        :class="[
                          'stat-badge',
                          stat.roi < 10 ? 'good' : stat.roi > 35 ? 'bad' : 'neutral',
                        ]"
                        >{{ stat.roi.toFixed(1) }}</span
                      >
                    </td>
                    <td>
                      <span :class="['stat-badge', stat.hitRate30 > 75 ? 'good' : 'neutral']"
                        >{{ stat.hitRate30.toFixed(1) }}%</span
                      >
                    </td>
                    <td>
                      <span :class="['stat-badge', stat.hitRate20 > 50 ? 'good' : 'neutral']"
                        >{{ stat.hitRate20.toFixed(1) }}%</span
                      >
                    </td>
                    <td>
                      <span :class="['stat-badge', stat.hitRate10 > 30 ? 'good' : 'neutral']"
                        >{{ stat.hitRate10.toFixed(1) }}%</span
                      >
                    </td>
                    <td>
                      <span :class="['stat-badge', stat.hitRate3 > 15 ? 'good' : 'neutral']"
                        >{{ stat.hitRate3.toFixed(1) }}%</span
                      >
                    </td>
                    <td>
                      <span :class="['trend-badge', stat.trendClass]"
                        >{{ stat.trendIcon }} {{ stat.trendText }}</span
                      >
                    </td>
                    <td>
                      <span :class="['stat-badge', stat.stdDev < 5 ? 'good' : 'neutral']">{{
                        stat.stdDev?.toFixed(1)
                      }}</span>
                    </td>
                  </template>
                  <td v-else colspan="9" class="no-data-msg">Brak danych</td>
                </tr>

                <tr v-if="expandedAthlete === stat.name" class="expansion-panel-row">
                  <td colspan="11">
                    <div class="trend-chart-container">
                      <div class="chart-info">
                        <strong>Wykres Formy (Miejsca w serii):</strong>
                        <span>Góra = 1. miejsce, Dół = 50. miejsce</span>
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
                                {{jump.category }} | {{ jump.place }} (HS{{ jump.hill_size || '?' }})
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
      <div
        v-if="athleteAnalytics.some((a) => a.hasData && a.price)"
        class="card analytics-card scatter-card"
        style="margin-top: 25px"
      >
        <div class="card-header">
          <h2>📊 Korelacja: Cena vs Średnia Pozycja (Ćwiartki Opłacalności)</h2>
          <p class="subtitle">Wizualna lokalizacja tanich i skutecznych zawodników</p>
        </div>

        <div class="scatter-container">
          <div class="scatter-wrapper" style="position: relative; width: 100%; max-width: 800px; margin: 0 auto;">

            <div class="quadrant quad-top-left"><span class="quad-title">🎯 OKAZJE (Tani i w Top 20)</span></div>
            <div class="quadrant quad-top-right"><span class="quad-title">👑 ASY (Drodzy i w Top 20)</span></div>
            <div class="quadrant quad-bottom-left"><span class="quad-title">🎲 RYZYKO (Tani poza Top 20)</span></div>
            <div class="quadrant quad-bottom-right"><span class="quad-title">❌ NIEOPŁACALNI (Przepłaceni / Słabi)</span></div>

            <svg viewBox="0 0 600 400" class="scatter-svg" style="width: 100%; height: auto; overflow: visible;">
              <line x1="300" y1="0" x2="300" y2="400" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4" />
              <line x1="0" y1="200" x2="600" y2="200" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4" />

              <g v-for="ath in athleteAnalytics.filter(a => a.hasData && a.price)" :key="ath.name">
                <g
                  :transform="`translate(${(ath.price / 3.0) * 600}, ${ath.avgRank <= 20 ? ((ath.avgRank - 1) / 19) * 200 : 200 + ((Math.min(ath.avgRank, 40) - 20) / 20) * 200})`"
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
                    <div class="scatter-dot-text">{{ ath.name }} ({{ ath.price }})</div>
                  </foreignObject>
                </g>
              </g>

              <g
                v-if="hoveredAthlete"
                :transform="`translate(${(hoveredAthlete.price / 3.0) * 600}, ${hoveredAthlete.avgRank <= 20 ? ((hoveredAthlete.avgRank - 1) / 19) * 200 : 200 + ((Math.min(hoveredAthlete.avgRank, 40) - 20) / 20) * 200})`"
                style="pointer-events: none;"
              >
                <circle r="12" fill="#0ea5e9" stroke="white" stroke-width="2" />
                <foreignObject x="-100" y="-35" width="200" height="35" class="scatter-foreign">
                  <div class="scatter-dot-text active-tooltip">
                    {{ hoveredAthlete.name }} ({{ hoveredAthlete.price }})
                  </div>
                </foreignObject>
              </g>

              <text x="5" y="15" fill="#94a3b8" font-size="11" font-weight="bold">↑ Miejsce 1</text>
              <text x="5" y="395" fill="#94a3b8" font-size="11" font-weight="bold">↓ Miejsce 40+</text>
              <text x="5" y="215" fill="#94a3b8" font-size="10" font-weight="bold">Średnia 20</text>
              <text x="535" y="390" fill="#94a3b8" font-size="11" font-weight="bold">Cena 3.0→</text>
              <text x="265" y="390" fill="#94a3b8" font-size="10">Cena 1.5</text>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!loading && results.length === 0 && searchedNames.length > 0"
      class="no-results card"
    >
      Brak wyników do wyświetlenia. Zmień filtry w KROKU 1.
    </div>
  </div>
</template>

<style scoped>
/* POSZERZENIE GLOBALNE STRONY NA FULL HD */
.page {
  background: transparent;
  padding: 30px;
  width: 100%;
  max-width: 1900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 25px;
}

/* WSPÓLNY STYL KART (Wydzielenie wizualne) */
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  padding: 20px;
  border: 1px solid #e2e8f0;
}
.card-header {
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 10px;
  margin-bottom: 20px;
}
.card-header h3 {
  margin: 0 0 5px 0;
  color: #0f172a;
  font-size: 1.3em;
}
.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.9em;
}

/* KROK 1: FORMULARZ WYSZUKIWANIA */
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

.filter-group {
  display: flex;
  flex-direction: column;
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
  gap: 5px;
}
.filter-group input,
.filter-group select {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 1em;
  box-sizing: border-box;
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

/* KROK 2: FRONTEND FILTRY (Na żywo) */
.view-filters-card {
  background: #f8fafc; /* Lekko ciemniejsze dla odróżnienia od wyszukiwarki */
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

.badge {
  padding: 2px 6px;
  border-radius: 12px;
  font-weight: bold;
  font-size: 0.85em;
}
.price-autocomplete-badge {
  background: #fef08a;
  color: #854d0e;
}
.price-header-badge {
  background: #fcd34d;
  color: #78350f;

  margin-bottom: auto; /* Dopycha badge na samo dno */
}

.options-container {
  margin-bottom: 20px;
  padding-top: 15px;
}
.toggle-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-weight: normal;
  color: #1e293b;
}
.toggle-label input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: goldenrod;
}
.toggle-esm {
  background: lightgoldenrodyellow;

  padding: 8px 15px;
  border-radius: 6px;
  display: inline-flex;
  width: fit-content;
  border: dotted 2px;
}

.btn-submit {
  background: #38bdf8;
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 4px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  width: 100%;
}
.btn-submit:hover:not(:disabled) {
  background: #0284c7;
}

/* =========================================
   NOWY UKŁAD Z D-PADEM I WIRTUALNYM OKNEM
   ========================================= */
.results-container {
  margin-top: 10px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  padding: 0;
}
.table-layout-wrapper {
  display: flex;
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

/* MAGICZNY KONTENER: Strzałki zjeżdżają w dół podążając za Twoim wzrokiem! */
.sticky-nav-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 40vh; /* Element zawsze trzyma się na poziomie 40% ekranu w dół, na środku wzroku! */
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

/* KONTENER TABELI Z ODBLOKOWANYM SCROLLEM DLA PŁYWAJĄCEGO NAGŁÓWKA! */
.table-wrapper {
  flex-grow: 1;
  border-top: 1px solid #cbd5e1;
  border-bottom: 1px solid #cbd5e1;
  /* Usunięto ukrywanie scrolla dla zachowania funkcjonalności Sticky Header'a przeglądarki */
}

/* TABELA WYNIKOWA */
.results-table {
  width: max-content;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9em;
}

/* --- KLASY ZAMRAŻAJĄCE (STICKY) I SZTYWNE ROZMIARY KOMÓREK --- */
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  padding: 0;

  /* DODANO: Pływający nagłówek (Sticky do okna przeglądarki) */
  position: sticky;
  top: 0;
  z-index: 30; /* By nagłówek najeżdżał na wiersze */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15); /* Nowoczesny cień przy scrollu */
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
  z-index: 40; /* Przecięcie TOP i LEFT musi być NAJWYŻEJ */
  background-color: #e2e8f0;
  padding: 12px 10px;
}
.results-table td.sticky-col-1,
.results-table td.sticky-col-2 {
  background-color: #f8fafc;
}

/* KOMÓRKI ZAWODNIKÓW (Szerokość 140px na sztywno) */
.athlete-col,
.athlete-cell {
  border-left: 1px solid #475569;
  width: 140px;
  min-width: 140px;
  max-width: 140px;
  position: relative;
}
.athlete-cell {
  border-left: 1px solid #e2e8f0;
  text-align: center;
  vertical-align: middle;
}

/* WNĘTRZE NAGŁÓWKA - UELASTYCZNIONE! */
.th-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between; /* Wypycha tekst w górę, badge w dół */
  min-height: 100px; /* Nie ścina nagłówka */
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

/* ZMIANY PODŚWIETLANIA WYNIKÓW */
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
.no-results {
  text-align: center;
  color: #64748b;
  padding: 20px;
  font-style: italic;
}

/* =========================================
   SEKCJA 3: PANEL ANALITYCZNY ESM
   ========================================= */
.analytics-card {
  border-left: 4px solid #8b5cf6; /* Fioletowy akcent dla panelu pro */
}
.analytics-table-wrapper {
  overflow-x: visible;
}
.analytics-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 0.95em;
}
.analytics-table th {
  background: #f1f5f9;
  color: #334155;
  padding: 12px;
  border-bottom: 2px solid #cbd5e1;
  text-transform: uppercase;
  font-size: 0.85em;
}
.analytics-table td {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
}
.analytics-table tr:hover:not(.no-data-row) {
  background-color: #f8fafc;
}
.no-data-row {
  color: #94a3b8;
  font-style: italic;
}
.no-data-msg {
  text-align: center;
}
.empty-val {
  color: #cbd5e1;
}

/* Badges w analityce */
.stat-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: bold;
}
.stat-badge.good {
  background: #dcfce7;
  color: #166534;
}
.stat-badge.bad {
  background: #fee2e2;
  color: #991b1b;
}
.stat-badge.neutral {
  background: #f1f5f9;
  color: #475569;
}

.trend-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: bold;
  display: inline-block;
  min-width: 90px;
}
.trend-up {
  background: #dcfce7;
  color: #166534;
}
.trend-down {
  background: #fee2e2;
  color: #991b1b;
}
.trend-neutral {
  background: #f1f5f9;
  color: #475569;
}

.input-price {
  background-color: lightgoldenrodyellow;
}
/* Ikonka informacyjna (tooltip) w panelu analitycznym */
.info-icon {
  display: inline-block;
  margin-left: 6px;
  color: #94a3b8;
  font-size: 1.1em;
  transition: color 0.2s ease;
}

.info-icon:hover {
  color: #38bdf8;
}

/* =========================================
   STYLOWE SUWAKI CENOWE
   ========================================= */
.price-sliders-container {
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
  background: #f8fafc;
  padding: 15px 20px;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}

.slider-group {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slider-header label {
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
  margin: 0;
}

/* Wyróżniona wartość nad suwakiem */
.price-badge {
  background: #e0f2fe;
  color: #0284c7;
  font-weight: 800;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.9em;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* Reset natywnych stylów i wygląd paska */
.styled-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 4px;
  background: #cbd5e1; /* Szare tło ścieżki */
  outline: none;
  transition: opacity 0.2s;
}

/* Wygląd uchwytu (Chrome / Safari / Edge) */
.styled-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #38bdf8; /* Błękit aplikacji */
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition:
    background 0.2s,
    transform 0.1s;
}

.styled-slider::-webkit-slider-thumb:hover {
  background: #0284c7; /* Ciemniejszy błękit po najechaniu */
  transform: scale(1.15); /* Lekkie powiększenie */
}

/* Wygląd uchwytu (Firefox) */
.styled-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #38bdf8;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  border: none;
  transition:
    background 0.2s,
    transform 0.1s;
}

.styled-slider::-moz-range-thumb:hover {
  background: #0284c7;
  transform: scale(1.15);
}

.clickable-row {
  cursor: pointer;
  transition: background 0.2s;
}
.clickable-row:hover {
  background-color: #f0f9ff !important;
}
.is-expanded {
  background-color: #f8fafc;
  border-left: 4px solid #8b5cf6;
}
.expansion-chevron {
  display: inline-block;
  width: 20px;
  color: #8b5cf6;
  font-size: 0.8em;
}

.expansion-panel-row td {
  padding: 0 !important; /* Wykres musi wypełniać przestrzeń */
  background-color: #fcfcfc;
}

.trend-chart-container {
  padding: 20px 40px;
  animation: slideDown 0.3s ease-out;
}

.chart-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.8em;
  color: #64748b;
  margin-bottom: 10px;
}

.trend-svg {
  width: 100%;
  height: 120px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
}

.trend-path {
  fill: none;
  stroke: #8b5cf6;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.guide-line {
  stroke-dasharray: 4;
  stroke-width: 1;
}
.guide-line.top10 {
  stroke: #22c55e;
  opacity: 0.4;
}
.guide-line.top30 {
  stroke: #94a3b8;
  opacity: 0.3;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Style dla osi i skali wykresu */
.axis-text {
  font-size: 0.75rem;
  fill: #64748b;
  font-weight: 600;
}
.axis-y {
  text-anchor: end; /* Wyrównanie tekstu do prawej strony przed osią */
}
.axis-x {
  text-anchor: middle; /* Centrowanie numeru skoku pod kreseczką */
}
.axis-tick {
  stroke: #cbd5e1;
  stroke-width: 1.5;
}
.guide-line.top1 {
  stroke: #e0f2fe;
  opacity: 0.6;
  stroke-width: 1.5;
}
.guide-line.top50 {
  stroke: #fee2e2;
  opacity: 0.4;
}

.text-good {
  fill: #16a34a;
}
.text-neutral {
  fill: #475569;
}
.text-bad {
  fill: #dc2626;
}

/* Zwiększamy wysokość kontenera, by podpisy osi X się nie ucięły */
.trend-svg {
  width: 100%;
  height: 150px;
  overflow: visible; /* Kluczowe, by opisy z lewej strony wyszły poza ramkę viewboxa */
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.08));
}

.trend-svg {
  width: 100%;
  height: 180px; /* Zwiększamy wysokość, by zmieścić dwie linijki osi X */
  overflow: visible;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.08));
}
.date-label {
  font-weight: 700;
  fill: #475569;
}
.place-label {
  font-weight: 400;
  fill: #64748b;
  font-size: 0.68rem;
}
.saved-sets-toolbar {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
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
.scatter-card {
  border-left: 4px solid #0ea5e9 !important; /* Błękitny akcent dla wykresu korelacji */
}
.scatter-container {
  padding: 30px 20px;
  background: #f8fafc;
  border-radius: 8px;
}
.scatter-wrapper {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

/* Stylizowanie ćwiartek tła */
.quadrant {
  position: absolute;
  width: 50%;
  height: 50%;
  padding: 10px;
  pointer-events: none; /* Kropki pod spodem muszą pozostać klikalne */
  opacity: 0.04;
}
.quad-title {
  position: absolute;
  font-size: 0.75rem;
  font-weight: 800;
  color: black;
  opacity: 0.4;
}
.quad-top-left {
  top: 0;
  left: 0;
  background-color: #22c55e;
  opacity: 0.04;
}
.quad-top-left .quad-title {
  top: 10px;
  left: 10px;
  color: #16a34a;
  opacity: 0.8;
}

.quad-top-right {
  top: 0;
  right: 0;
  background-color: #3b82f6;
  opacity: 0.03;
}
.quad-top-right .quad-title {
  top: 10px;
  right: 10px;
  color: #2563eb;
  opacity: 0.8;
}

.quad-bottom-left {
  bottom: 0;
  left: 0;
  background-color: #eab308;
  opacity: 0.03;
}
.quad-bottom-left .quad-title {
  bottom: 10px;
  left: 10px;
  color: #ca8a04;
  opacity: 0.8;
}

.quad-bottom-right {
  bottom: 0;
  right: 0;
  background-color: #ef4444;
  opacity: 0.04;
}
.quad-bottom-right .quad-title {
  bottom: 10px;
  right: 10px;
  color: #dc2626;
  opacity: 0.8;
}

/* Kropki i etykiety tekstowe */
.scatter-svg {
  padding: 30px;
}
/* --- POPRAWIONE KROPKI WYKRESU (Brak migotania) --- */
.scatter-dot-group {
  cursor: pointer;
  /* ŻADNEGO hovera z transform na tej klasie! Grupa musi trzymać pozycję. */
}

/* W SVG do płynnego powiększania kropki używamy atrybutu 'r' */
.scatter-dot {
  fill: #8b5cf6;
  stroke: white;
  stroke-width: 2;
  transition: r 0.2s ease, fill 0.2s ease;
}

.scatter-dot-group:hover .scatter-dot {
  fill: #0ea5e9;
  r: 12px; /* Kropka powiększa się bezpiecznie wokół własnego środka */
}

/* --- KONTENER DLA TEKSTU HTML W SVG --- */
.scatter-foreign {
  pointer-events: none; /* Zapobiega migotaniu, kursor łapie tylko kropka */
  overflow: visible;
}

.scatter-dot-text {
  font-size: 10px;
  font-weight: 700;
  color: #1e293b;
  text-align: center;
  width: fit-content;
  margin: 0 auto; /* Centruje div dokładnie nad kropką */
  padding: 3px 6px;
  border-radius: 5px; /* Zaokrąglenie, o które prosiłeś */
  background-color: transparent;
  border: 1px solid transparent; /* Rezerwa miejsca, by tekst nie skakał */
  transition: all 0.2s ease;
}

/* EFEKT PO NAJECHANIU NA GRUPĘ (Kropka + Tekst) */
.scatter-dot-group:hover .scatter-dot-text {
  font-size: 11px;
  background-color: #ffffff; /* Śnieżnobiałe tło */
  border-color: #e2e8f0; /* Bardzo delikatna ramka */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15); /* Nowoczesny cień odcinający nazwisko od siatki */
  transform: translateY(-4px); /* Płynne uniesienie tekstu do góry */
  color: #0ea5e9; /* Zmiana koloru tekstu na błękitny */
}

/* Klasa dla aktywnego bąbelka wyciągniętego na sam wierzch wykresu */
.active-tooltip {
  font-size: 14px !important;
  background-color: #ffffff !important; /* Czyste białe tło */
  border-color: #e2e8f0 !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15) !important; /* Mocniejszy cień dla efektu unoszenia */
  transform: translateY(-4px) !important; /* Płynne podniesienie nad dużą kropkę */
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
  scrollbar-width: thin; /* Estetyczny suwak w Firefoxie */
}

.list-checkbox {
  font-size: 0.9em;
  margin-bottom: 0;
}

/* Przycisk rozwijania kategorii */
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

/* Modulo dla samej listy z checkboxami - wyciąga ją nad inne elementy */
.custom-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  margin-top: 4px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}
.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s ease, color 0.2s ease;
}
.sortable-th:hover {
  background-color: #e2e8f0 !important; /* Lekkie przyciemnienie po najechaniu */
  color: #0f172a !important;
}
</style>