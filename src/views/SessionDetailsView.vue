<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'

const route = useRoute()
const router = useRouter()
const sessionId = route.params.id

const session = ref<any>(null)
const loading = ref(true)

// ========================================================
// --- SYSTEM PAKIETÓW ZAWODNIKÓW (SMART PORÓWNYWARKA) ---
// ========================================================
export interface AthletePackage {
  id: string
  name: string
  athletes: string[] // Lista nazwisk zawodników (agnostyczna do konkursu)
}

const STORAGE_KEY = 'fantaski_athlete_packages'
const selectedAthletes = ref<string[]>([])
const newPackageName = ref('')
const savedPackages = ref<AthletePackage[]>([])
const editingPackageId = ref<string | null>(null)
const editingPackageName = ref('')
const showPackageDrawer = ref(false)
const pricesMap = ref<Record<string, number>>({})

const fetchPrices = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/stats/athletes/with-prices')
    if (res.ok) {
      const data: { name: string; fis_code: number; price: number }[] = await res.json()
      const map: Record<string, number> = {}
      for (const item of data) {
        if (item.fis_code != null) map[String(item.fis_code)] = item.price
        if (item.name) map[item.name.toLowerCase().trim()] = item.price
      }
      pricesMap.value = map
    }
  } catch (e) {
    // cichy fallback offline
  }
}

const getAthletePrice = (athlete: any): number | null => {
  if (athlete?.price != null) return Number(athlete.price)
  if (athlete?.fis_code != null && pricesMap.value[String(athlete.fis_code)] !== undefined) {
    return pricesMap.value[String(athlete.fis_code)] ?? null
  }
  const cleanName = athlete?.name?.toLowerCase().trim()
  if (cleanName && pricesMap.value[cleanName] !== undefined) {
    return pricesMap.value[cleanName] ?? null
  }
  return null
}

const getAthletePriceByName = (name: string): number | null => {
  if (!name) return null
  const cleanName = name.toLowerCase().trim()
  return pricesMap.value[cleanName] ?? null
}

const calcPackagePrice = (athleteNames: string[]): number => {
  return athleteNames.reduce((acc, name) => {
    const p = getAthletePriceByName(name)
    return acc + (p || 0)
  }, 0)
}

const currentSelectionPrice = computed(() => {
  return calcPackagePrice(selectedAthletes.value)
})

const loadPackagesFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      savedPackages.value = JSON.parse(raw)
    }
  } catch (e) {
    console.error('Błąd odczytu pakietów z localStorage:', e)
  }
}

const savePackagesToStorage = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPackages.value))
  } catch (e) {
    console.error('Błąd zapisu pakietów do localStorage:', e)
  }
}

// Mapowanie wyników bieżącego konkursu dla szybkiego dostępu { [name]: competition_points }
const sessionPointsMap = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  if (!session.value?.results_data?.results) return map
  for (const r of session.value.results_data.results) {
    if (r.name) {
      map[r.name.trim().toUpperCase()] = Number(r.competition_points) || 0
    }
  }
  return map
})

// Obliczanie punktów PŚ dla dowolnej listy zawodników w tym konkursie
const getAthletePts = (name: string): number => {
  if (!name) return 0
  return sessionPointsMap.value[name.trim().toUpperCase()] || 0
}

const calcPackagePoints = (athleteNames: string[]): number => {
  return athleteNames.reduce((acc, name) => {
    return acc + getAthletePts(name)
  }, 0)
}

// Suma punktów PŚ aktualnie zaznaczonych zawodników
const currentSelectionPoints = computed(() => {
  return calcPackagePoints(selectedAthletes.value)
})

// Najwyższy wynik punktowy wśród zapisanych pakietów
const bestPackagePoints = computed(() => {
  if (savedPackages.value.length === 0) return 0
  return Math.max(...savedPackages.value.map(p => calcPackagePoints(p.athletes)))
})

// Przełączanie zaznaczenia zawodnika
const toggleAthlete = (name: string) => {
  const idx = selectedAthletes.value.indexOf(name)
  if (idx !== -1) {
    selectedAthletes.value.splice(idx, 1)
  } else {
    if (selectedAthletes.value.length >= 8) {
      alert('Możesz zaznaczyć maksymalnie 8 zawodników w jednym pakiecie!')
      return
    }
    selectedAthletes.value.push(name)
  }
}

const isAthleteSelected = (name: string): boolean => {
  return selectedAthletes.value.includes(name)
}

const clearSelection = () => {
  selectedAthletes.value = []
}

// Zapisanie bieżącego pakietu do localStorage
const saveCurrentPackage = () => {
  if (selectedAthletes.value.length === 0) {
    alert('Zaznacz przynajmniej jednego zawodnika w tabeli!')
    return
  }

  const name = newPackageName.value.trim() || `Pakiet #${savedPackages.value.length + 1} (${selectedAthletes.value.length} skoczków)`

  const newPkg: AthletePackage = {
    id: 'pkg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    athletes: [...selectedAthletes.value],
  }

  savedPackages.value.push(newPkg)
  savePackagesToStorage()
  newPackageName.value = ''
  showPackageDrawer.value = true // Automatycznie pokazujemy panel porównania po zapisie
}

// Zastosowanie zapisanego pakietu jako bieżące zaznaczenie
const applyPackageToSelection = (pkg: AthletePackage) => {
  selectedAthletes.value = [...pkg.athletes.slice(0, 8)]
}

// Usunięcie pakietu
const deletePackage = (id: string) => {
  savedPackages.value = savedPackages.value.filter((p) => p.id !== id)
  savePackagesToStorage()
}

// Usunięcie zawodnika z pakietu
const removeAthleteFromPackage = (pkgId: string, athleteName: string) => {
  const pkg = savedPackages.value.find((p) => p.id === pkgId)
  if (!pkg) return
  pkg.athletes = pkg.athletes.filter((a) => a !== athleteName)
  savePackagesToStorage()
}

// Dodanie aktualnie zaznaczonych zawodników do istniejącego pakietu
const addSelectionToPackage = (pkgId: string) => {
  const pkg = savedPackages.value.find((p) => p.id === pkgId)
  if (!pkg) return
  const merged = Array.from(new Set([...pkg.athletes, ...selectedAthletes.value]))
  pkg.athletes = merged
  savePackagesToStorage()
}

// Edycja nazwy pakietu
const startRenamePackage = (pkg: AthletePackage) => {
  editingPackageId.value = pkg.id
  editingPackageName.value = pkg.name
}

const saveRenamePackage = (pkgId: string) => {
  const pkg = savedPackages.value.find((p) => p.id === pkgId)
  if (pkg && editingPackageName.value.trim()) {
    pkg.name = editingPackageName.value.trim()
    savePackagesToStorage()
  }
  editingPackageId.value = null
}

const fetchDetails = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:8000/stats/sessions/${sessionId}`)
    if (res.ok) {
      session.value = await res.json()
    } else {
      alert('Nie znaleziono sesji.')
      router.push('/sessions')
    }
  } catch (e) {
    console.error('Błąd:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPackagesFromStorage()
  fetchDetails()
  fetchPrices()
})
</script>

<template>
  <div class="page">
    <SkiLoader v-if="loading">Ładowanie szczegółów zawodów...</SkiLoader>

    <div v-else-if="session" class="session-container">
      <!-- HEADER ZAWODÓW -->
      <div class="header">
        <button @click="router.back()" class="btn-back">← Powrót</button>
        <div class="title-section">
          <div class="place-row">
            <h2>{{ session.event_place }}</h2>
            <span v-if="session.event_country" class="country-badge">{{ session.event_country }}</span>
          </div>
          <h3 class="session-sub">{{ session.title }}</h3>
        </div>
        <div class="badges">
          <span class="badge blue">{{ session.category_code }}</span>
          <span class="badge gray">{{ session.session_type }}</span>
          <a v-if="session.raceUrl" :href="session.raceUrl" target="_blank" class="btn-fis" title="Oficjalny protokół FIS">
            Wyniki FIS ↗
          </a>
        </div>
      </div>

      <!-- KARTY INFORMACYJNE O SKOCZNI I SESJI -->
      <div class="info-grid">
        <div class="info-card">
          <div class="card-icon">📅</div>
          <div class="card-text">
            <span class="card-label">Termin</span>
            <strong>{{ session.date }}</strong>
            <small class="time-dim">{{ session.time || 'Godz. b/d' }}</small>
          </div>
        </div>
        <div class="info-card">
          <div class="card-icon">🏔️</div>
          <div class="card-text">
            <span class="card-label">Skocznia</span>
            <strong>{{ session.hillType || 'Normalna / Duża' }}</strong>
            <small class="time-dim">HS: {{ session.hillSize || 'Brak danych' }}</small>
          </div>
        </div>
        <div class="info-card" v-if="session.documents && session.documents.length > 0">
          <div class="card-icon">📄</div>
          <div class="card-text">
            <span class="card-label">Protokoły PDF</span>
            <div class="doc-links">
              <a v-for="doc in session.documents.slice(0, 2)" :key="doc.url" :href="doc.url" target="_blank" class="doc-link">
                {{ doc.type }} ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- SMART PANEL PAKIETÓW ZAWODNIKÓW (KOMPAKTOWY, ERGONOMICZNY) -->
      <!-- ======================================================== -->
      <div class="smart-package-hub">
        <!-- Pasek główny Smart Bar -->
        <div class="hub-main-bar">
          <div class="hub-left">
            <div class="hub-title">
              <span class="ski-icon">🎿</span>
              <strong>Porównywarka Pakietów</strong>
            </div>
            <!-- Licznik 8 miejsc -->
            <div class="selection-pill" :class="{ active: selectedAthletes.length > 0, full: selectedAthletes.length >= 8 }">
              <span class="dots-meter">
                <span
                  v-for="i in 8"
                  :key="i"
                  class="dot"
                  :class="{ filled: i <= selectedAthletes.length }"
                ></span>
              </span>
              <span class="count-text">{{ selectedAthletes.length }}/8</span>
            </div>
          </div>

          <!-- Wynik bieżącego wyboru -->
          <div class="hub-center">
            <div class="active-score" v-if="selectedAthletes.length > 0">
              <span class="score-caption">Suma Pkt PŚ:</span>
              <span class="score-val">+{{ currentSelectionPoints }}</span>
              <span v-if="currentSelectionPrice > 0" class="score-price">
                (Koszt: {{ currentSelectionPrice.toFixed(1) }})
              </span>
            </div>
            <span v-else class="hub-hint">
              Kliknij skoczków na liście poniżej, aby złożyć pakiet (max 8)
            </span>
          </div>

          <!-- Akcje i przełącznik porównania -->
          <div class="hub-right">
            <button
              v-if="savedPackages.length > 0"
              @click="showPackageDrawer = !showPackageDrawer"
              class="btn-toggle-drawer"
              :class="{ open: showPackageDrawer }"
            >
              ⚖️ Porównaj pakiety ({{ savedPackages.length }})
              <span class="arrow-icon">{{ showPackageDrawer ? '▴' : '▾' }}</span>
            </button>
            <button
              v-if="selectedAthletes.length > 0"
              @click="clearSelection"
              class="btn-clear-micro"
              title="Wyczyść bieżące zaznaczenie"
            >
              ✕ Wyczyść
            </button>
          </div>
        </div>

        <!-- Pasek edycji bieżącego zaznaczenia (widoczny tylko gdy zaznaczono skoczków) -->
        <div class="selection-detail-strip" v-if="selectedAthletes.length > 0">
          <div class="selected-chips-scroll">
            <span
              v-for="athName in selectedAthletes"
              :key="athName"
              class="athlete-micro-chip"
            >
              <span class="chip-name">{{ athName }}</span>
              <span v-if="getAthletePriceByName(athName) != null" class="chip-price">
                {{ getAthletePriceByName(athName)!.toFixed(1) }}
              </span>
              <strong class="chip-pts">+{{ getAthletePts(athName) }}</strong>
              <button
                @click="toggleAthlete(athName)"
                class="chip-x"
                title="Usuń z pakietu"
              >
                ✕
              </button>
            </span>
          </div>

          <div class="quick-save-form">
            <input
              type="text"
              v-model="newPackageName"
              placeholder="Nazwa pakietu (np. Team A)..."
              class="save-input-compact"
              @keyup.enter="saveCurrentPackage"
            />
            <button @click="saveCurrentPackage" class="btn-save-compact">
              💾 Zapisz pakiet
            </button>
          </div>
        </div>

        <!-- Rozwijana sekcja porównawcza zapisanych pakietów -->
        <div class="drawer-content" v-if="showPackageDrawer && savedPackages.length > 0">
          <div class="drawer-header">
            <span class="drawer-title">
              📊 Wyniki zapisanych zestawów w tym konkursie ({{ session.event_place }})
            </span>
            <small class="drawer-subtitle">
              Pakiety automatycznie przeliczają punkty PŚ w każdym wybranym konkursie.
            </small>
          </div>

          <div class="packages-compact-grid">
            <div
              v-for="pkg in savedPackages"
              :key="pkg.id"
              class="pkg-compact-card"
              :class="{ 'is-leader': calcPackagePoints(pkg.athletes) === bestPackagePoints && bestPackagePoints > 0 }"
            >
              <div class="card-top">
                <div v-if="editingPackageId === pkg.id" class="rename-inline">
                  <input
                    v-model="editingPackageName"
                    class="rename-input-sm"
                    @keyup.enter="saveRenamePackage(pkg.id)"
                  />
                  <button @click="saveRenamePackage(pkg.id)" class="btn-micro-ok">OK</button>
                </div>
                <div v-else class="title-with-actions">
                  <strong class="pkg-label">{{ pkg.name }}</strong>
                  <button
                    @click="startRenamePackage(pkg)"
                    class="btn-icon-rename"
                    title="Zmień nazwę"
                  >
                    ✏️
                  </button>
                </div>

                <div class="card-corner-actions">
                  <button
                    @click="applyPackageToSelection(pkg)"
                    class="btn-apply-micro"
                    title="Załaduj jako bieżący wybór"
                  >
                    Wczytaj
                  </button>
                  <button
                    @click="deletePackage(pkg.id)"
                    class="btn-delete-micro"
                    title="Usuń ten pakiet"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Pasek punktów ze statusem lidera i deltą -->
              <div class="card-score-row">
                <div class="score-cluster">
                  <span class="pts-big">+{{ calcPackagePoints(pkg.athletes) }}</span>
                  <span class="pts-unit">pkt PŚ</span>
                </div>
                <div class="score-meta">
                  <span
                    v-if="calcPackagePoints(pkg.athletes) === bestPackagePoints && bestPackagePoints > 0"
                    class="leader-badge"
                  >
                    👑 Lider
                  </span>
                  <span
                    v-else-if="bestPackagePoints > calcPackagePoints(pkg.athletes)"
                    class="delta-badge"
                  >
                    {{ calcPackagePoints(pkg.athletes) - bestPackagePoints }} pkt
                  </span>
                  <span class="count-tag">{{ pkg.athletes.length }} skoczków</span>
                  <span v-if="calcPackagePrice(pkg.athletes) > 0" class="price-tag">
                    {{ calcPackagePrice(pkg.athletes).toFixed(1) }} ESM
                  </span>
                </div>
              </div>

              <!-- Lista zawodników w kompaktowych pigułkach -->
              <div class="compact-athletes-list">
                <div
                  v-for="ath in pkg.athletes"
                  :key="ath"
                  class="ath-pill"
                >
                  <span class="ath-pill-name" :title="ath">{{ ath }}</span>
                  <span v-if="getAthletePriceByName(ath) != null" class="ath-pill-price">
                    {{ getAthletePriceByName(ath)!.toFixed(1) }}
                  </span>
                  <span class="ath-pill-pts" :class="{ zero: getAthletePts(ath) === 0 }">
                    +{{ getAthletePts(ath) }}
                  </span>
                  <button
                    @click="removeAthleteFromPackage(pkg.id, ath)"
                    class="ath-pill-remove"
                    title="Usuń z pakietu"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <!-- Opcjonalne dodanie bieżących zaznaczonych -->
              <div class="card-bottom-action" v-if="selectedAthletes.length > 0">
                <button
                  @click="addSelectionToPackage(pkg.id)"
                  class="btn-merge-selection"
                >
                  + Dodaj zaznaczonych ({{ selectedAthletes.length }})
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- TABELA WYNIKÓW ZAWODÓW (FIS LIVE FEEL, PODIUM, RESPONSYWNA) -->
      <!-- ======================================================== -->
      <div class="results-section">
        <div class="results-toolbar">
          <div class="toolbar-left">
            <h3>Oficjalne Wyniki Konkursu</h3>
            <span class="results-count" v-if="session.results_data?.results">
              {{ session.results_data.results.length }} skoczków
            </span>
          </div>
          <span class="table-tip">
            💡 Kliknij wiersz lub pole 📦 aby dodać skoczka do pakietu
          </span>
        </div>

        <p v-if="session.results_data?.is_cancelled" class="cancelled-alert">
          ⚠️ Uwaga: Ta sesja została oficjalnie odwołana lub przerwana.
        </p>

        <div class="table-responsive" v-if="session.results_data?.results?.length > 0">
          <table class="results-table">
            <thead>
              <tr>
                <th class="th-pkg" title="Dodaj do pakietu">📦</th>
                <th class="th-rank">Poz.</th>
                <th class="th-bib">Bib</th>
                <th class="th-name">Zawodnik</th>
                <th class="th-price">Cena ESM</th>
                <th class="th-country">Kraj</th>
                <th class="th-jump">Seria 1</th>
                <th class="th-jump">Seria 2</th>
                <th class="th-total">Łączna nota</th>
                <th class="th-points">Pkt PŚ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="athlete in session.results_data.results"
                :key="athlete.fis_code"
                :class="{
                  'row-selected': isAthleteSelected(athlete.name),
                  'podium-gold': athlete.rank === 1,
                  'podium-silver': athlete.rank === 2,
                  'podium-bronze': athlete.rank === 3,
                }"
                @click="toggleAthlete(athlete.name)"
              >
                <!-- Checkbox dodania do pakietu -->
                <td class="td-pkg" @click.stop>
                  <input
                    type="checkbox"
                    :checked="isAthleteSelected(athlete.name)"
                    @change="toggleAthlete(athlete.name)"
                    :disabled="!isAthleteSelected(athlete.name) && selectedAthletes.length >= 8"
                    class="smart-checkbox"
                    :aria-label="'Wybierz ' + athlete.name"
                  />
                </td>

                <!-- Pozycja z odznakami podium -->
                <td class="td-rank">
                  <span v-if="athlete.rank === 1" class="rank-badge gold" title="1. Miejsce">🥇 1</span>
                  <span v-else-if="athlete.rank === 2" class="rank-badge silver" title="2. Miejsce">🥈 2</span>
                  <span v-else-if="athlete.rank === 3" class="rank-badge bronze" title="3. Miejsce">🥉 3</span>
                  <strong v-else class="rank-normal">{{ athlete.rank || '-' }}</strong>
                </td>

                <!-- Numer startowy bib -->
                <td class="td-bib">
                  <span class="bib-tag">{{ athlete.bib }}</span>
                </td>

                <!-- Imię i Nazwisko -->
                <td class="td-name">
                  <RouterLink
                    :to="`/athletes/${athlete.fis_code}`"
                    class="athlete-link"
                    @click.stop
                  >
                    {{ athlete.name }}
                  </RouterLink>
                  <span v-if="athlete.status && athlete.status !== 'Classified'" class="status-dns">
                    {{ athlete.status }}
                  </span>
                </td>

                <!-- Cena ESM -->
                <td class="td-price">
                  <span v-if="getAthletePrice(athlete) != null" class="price-chip">
                    {{ getAthletePrice(athlete)!.toFixed(1) }}
                  </span>
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Kraj -->
                <td class="td-country">
                  <span class="country-pill">{{ athlete.country }}</span>
                </td>

                <!-- Skok 1 -->
                <td class="td-jump">
                  <div v-if="athlete.jumps && athlete.jumps[0]" class="jump-block">
                    <span class="distance-main">{{ athlete.jumps[0].distance }} m</span>
                    <span class="jump-sub">
                      {{ athlete.jumps[0].points }} pkt ({{ athlete.jumps[0].rank }}.)
                    </span>
                  </div>
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Skok 2 -->
                <td class="td-jump">
                  <div v-if="athlete.jumps && athlete.jumps[1]" class="jump-block">
                    <span class="distance-main">{{ athlete.jumps[1].distance }} m</span>
                    <span class="jump-sub">
                      {{ athlete.jumps[1].points }} pkt ({{ athlete.jumps[1].rank }}.)
                    </span>
                  </div>
                  <span v-else class="dim-dash">-</span>
                </td>

                <!-- Punkty łączne -->
                <td class="td-total">
                  <strong>{{ athlete.total_points || '-' }}</strong>
                </td>

                <!-- Punkty Pucharu Świata -->
                <td class="td-points">
                  <span
                    class="comp-pts-chip"
                    :class="{ active: athlete.competition_points > 0 }"
                  >
                    {{ athlete.competition_points > 0 ? `+${athlete.competition_points}` : '-' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* HEADER SESJI */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 14px;
  margin-bottom: 16px;
  gap: 15px;
  flex-wrap: wrap;
}
.btn-back {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  color: #475569;
  font-weight: 600;
  font-size: 0.85em;
  transition: all 0.2s;
}
.btn-back:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.title-section {
  flex: 1;
  min-width: 220px;
}
.place-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.place-row h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.5em;
  font-weight: 800;
}
.country-badge {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.8em;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
}
.session-sub {
  margin: 2px 0 0 0;
  color: #64748b;
  font-weight: 500;
  font-size: 0.95em;
}

.badges {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 700;
  text-transform: uppercase;
}
.badge.blue {
  background: #e0f2fe;
  color: #0284c7;
}
.badge.gray {
  background: #f1f5f9;
  color: #475569;
}
.btn-fis {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.8em;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.2s;
}
.btn-fis:hover {
  background: #d1fae5;
}

/* KARTY INFORMACYJNE O SKOCZNI */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 10px 14px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.card-icon {
  font-size: 1.4em;
}
.card-text {
  display: flex;
  flex-direction: column;
}
.card-label {
  font-size: 0.72em;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.info-card strong {
  font-size: 0.92em;
  color: #1e293b;
}
.time-dim {
  color: #64748b;
  font-size: 0.8em;
}
.doc-links {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.doc-link {
  color: #0284c7;
  font-size: 0.82em;
  font-weight: 600;
  text-decoration: none;
}
.doc-link:hover {
  text-decoration: underline;
}

/* ======================================================== */
/* SMART PANEL PAKIETÓW (WINTER SPORTS ERGONOMICS) */
/* ======================================================== */
.smart-package-hub {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  color: white;
  margin-bottom: 20px;
  overflow: hidden;
  box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.25);
}

/* Główny pasek statusu (kompaktowy ~48px) */
.hub-main-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  gap: 12px;
  flex-wrap: wrap;
}
.hub-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hub-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.95em;
  color: #38bdf8;
}
.ski-icon {
  font-size: 1.1em;
}

.selection-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #0f172a;
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid #334155;
}
.selection-pill.active {
  border-color: #38bdf8;
}
.selection-pill.full {
  border-color: #f59e0b;
}
.dots-meter {
  display: flex;
  gap: 3px;
}
.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #475569;
}
.dot.filled {
  background: #38bdf8;
}
.selection-pill.full .dot.filled {
  background: #f59e0b;
}
.count-text {
  font-size: 0.78em;
  font-weight: 700;
  color: #cbd5e1;
}

.hub-center {
  display: flex;
  align-items: center;
}
.hub-hint {
  color: #94a3b8;
  font-size: 0.82em;
}
.active-score {
  display: flex;
  align-items: baseline;
  gap: 6px;
  background: #0f172a;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.score-caption {
  font-size: 0.75em;
  color: #94a3b8;
  text-transform: uppercase;
}
.score-val {
  font-size: 1.15em;
  font-weight: 800;
  color: #38bdf8;
}

.hub-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.btn-toggle-drawer {
  background: #0284c7;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82em;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}
.btn-toggle-drawer:hover {
  background: #0369a1;
}
.btn-toggle-drawer.open {
  background: #0369a1;
}
.arrow-icon {
  font-size: 0.8em;
}
.btn-clear-micro {
  background: none;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.78em;
  cursor: pointer;
}
.btn-clear-micro:hover {
  color: #f87171;
  border-color: #f87171;
}

/* Pasek z mikropigułkami skoczków i formularzem zapisu */
.selection-detail-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  background: #0b132b;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
}
.selected-chips-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}
.athlete-micro-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}
.chip-name {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-pts {
  color: #38bdf8;
  font-size: 0.88em;
}
.chip-x {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 1px;
  font-size: 0.85em;
  line-height: 1;
}
.chip-x:hover {
  color: #f87171;
}

.quick-save-form {
  display: flex;
  gap: 6px;
  align-items: center;
}
.save-input-compact {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  color: white;
  padding: 5px 9px;
  font-size: 0.82em;
  min-width: 180px;
}
.save-input-compact:focus {
  outline: none;
  border-color: #38bdf8;
}
.btn-save-compact {
  background: #10b981;
  color: #064e3b;
  font-weight: 700;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.82em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-save-compact:hover {
  background: #34d399;
}

/* ROZWIJANY DRAWER PORÓWNANIA PAKIETÓW */
.drawer-content {
  padding: 14px 16px;
  background: #0f172a;
}
.drawer-header {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
}
.drawer-title {
  font-weight: 700;
  color: #e2e8f0;
  font-size: 0.9em;
}
.drawer-subtitle {
  color: #64748b;
  font-size: 0.78em;
}

.packages-compact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.pkg-compact-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s;
}
.pkg-compact-card.is-leader {
  border-color: #eab308;
  background: linear-gradient(180deg, rgba(234, 179, 8, 0.08) 0%, #1e293b 100%);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.title-with-actions {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
}
.pkg-label {
  color: #38bdf8;
  font-size: 0.88em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-icon-rename {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75em;
  opacity: 0.7;
}
.btn-icon-rename:hover {
  opacity: 1;
}

.rename-inline {
  display: flex;
  gap: 4px;
}
.rename-input-sm {
  background: #0f172a;
  border: 1px solid #38bdf8;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.8em;
}
.btn-micro-ok {
  background: #38bdf8;
  color: #0f172a;
  border: none;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
}

.card-corner-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-apply-micro {
  background: #334155;
  color: #cbd5e1;
  border: none;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.72em;
  font-weight: 600;
  cursor: pointer;
}
.btn-apply-micro:hover {
  background: #475569;
  color: white;
}
.btn-delete-micro {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.7;
}
.btn-delete-micro:hover {
  opacity: 1;
}

.card-score-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0f172a;
  padding: 6px 10px;
  border-radius: 4px;
}
.score-cluster {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.pts-big {
  font-size: 1.25em;
  font-weight: 800;
  color: #22c55e;
}
.pts-unit {
  font-size: 0.75em;
  color: #94a3b8;
}
.score-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}
.leader-badge {
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.delta-badge {
  color: #94a3b8;
  font-size: 0.75em;
  font-family: monospace;
}
.count-tag {
  color: #64748b;
  font-size: 0.75em;
}

.compact-athletes-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 140px;
  overflow-y: auto;
  padding-right: 2px;
}
.ath-pill {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78em;
  padding: 3px 6px;
  background: #0f172a;
  border-radius: 3px;
}
.ath-pill-name {
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.ath-pill-pts {
  color: #22c55e;
  font-weight: 700;
  margin: 0 6px;
}
.ath-pill-pts.zero {
  color: #64748b;
  font-weight: normal;
}
.ath-pill-remove {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.8em;
}
.ath-pill-remove:hover {
  color: #ef4444;
}

.card-bottom-action {
  border-top: 1px solid #334155;
  padding-top: 6px;
}
.btn-merge-selection {
  width: 100%;
  background: none;
  border: 1px dashed #475569;
  color: #38bdf8;
  padding: 4px;
  border-radius: 3px;
  font-size: 0.75em;
  cursor: pointer;
}
.btn-merge-selection:hover {
  background: #0f172a;
}

/* ======================================================== */
/* TABELA WYNIKÓW (SPORTOWY STANDARD, PODIUM) */
/* ======================================================== */
.results-section {
  margin-top: 8px;
}
.results-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-left h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.15em;
  font-weight: 700;
}
.results-count {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75em;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 12px;
}
.table-tip {
  color: #64748b;
  font-size: 0.8em;
}

.cancelled-alert {
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: 600;
  margin-bottom: 10px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88em;
}
.results-table th,
.results-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.78em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
  white-space: nowrap;
}
.results-table tbody tr {
  cursor: pointer;
  transition: background-color 0.15s;
}
.results-table tbody tr:hover {
  background-color: #f8fafc;
}

/* Wiersz wybrany */
.results-table tbody tr.row-selected {
  background-color: rgba(56, 189, 248, 0.12) !important;
}

/* Podium highlights */
.podium-gold {
  background-color: rgba(254, 243, 199, 0.4);
}
.podium-silver {
  background-color: rgba(241, 245, 249, 0.6);
}
.podium-bronze {
  background-color: rgba(254, 237, 213, 0.3);
}

.rank-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 800;
  font-size: 0.85em;
}
.rank-badge.gold {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}
.rank-badge.silver {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.rank-badge.bronze {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fed7aa;
}
.rank-normal {
  color: #1e293b;
}

.smart-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #0284c7;
}

.th-pkg, .td-pkg { width: 36px; text-align: center; }
.th-rank, .td-rank { width: 55px; text-align: center; }
.th-bib, .td-bib { width: 45px; text-align: center; }
.th-price, .td-price { width: 75px; text-align: center; }
.th-country, .td-country { width: 65px; text-align: center; }
.th-jump, .td-jump { width: 110px; text-align: center; }
.th-total, .td-total { width: 100px; text-align: right; }
.th-points, .td-points { width: 85px; text-align: right; }

.price-chip {
  display: inline-block;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
  font-size: 0.82em;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid #a7f3d0;
  font-family: monospace;
}
.score-price {
  font-size: 0.82em;
  color: #047857;
  font-weight: 600;
  margin-left: 6px;
}
.chip-price {
  font-size: 0.75em;
  color: #047857;
  background: #ecfdf5;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
  margin-right: 2px;
  border: 1px solid #a7f3d0;
}
.ath-pill-price {
  font-size: 0.72em;
  color: #047857;
  background: #ecfdf5;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
  margin-right: 2px;
  border: 1px solid #a7f3d0;
}
.price-tag {
  background: #ecfdf5;
  color: #047857;
  font-size: 0.72em;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  border: 1px solid #a7f3d0;
}

.bib-tag {
  color: #64748b;
  font-family: monospace;
  font-size: 0.9em;
}
.athlete-link {
  color: #0f172a;
  text-decoration: none;
  font-weight: 600;
}
.athlete-link:hover {
  color: #0284c7;
  text-decoration: underline;
}
.status-dns {
  margin-left: 6px;
  background: #fee2e2;
  color: #991b1b;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.72em;
  font-weight: 700;
}
.country-pill {
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.82em;
  color: #475569;
}

.jump-block {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.distance-main {
  font-weight: 700;
  color: #0f172a;
}
.jump-sub {
  font-size: 0.75em;
  color: #64748b;
}
.dim-dash {
  color: #cbd5e1;
}

.comp-pts-chip {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 10px;
  font-size: 0.82em;
  font-weight: 700;
  color: #94a3b8;
}
.comp-pts-chip.active {
  background: #e0f2fe;
  color: #0284c7;
}

/* RESPONSYWNOŚĆ */
@media (max-width: 768px) {
  .page {
    padding: 14px;
  }
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
  .hub-main-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .hub-right {
    width: 100%;
    justify-content: space-between;
  }
  .selection-detail-strip {
    flex-direction: column;
    align-items: stretch;
  }
  .quick-save-form {
    width: 100%;
  }
  .save-input-compact {
    flex: 1;
    min-width: 0;
  }
}
</style>
