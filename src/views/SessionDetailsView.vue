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
// --- SYSTEM PAKIETÓW ZAWODNIKÓW (PORÓWNYWARKA) ---
// ========================================================
// TODO: W przyszłości przenieść pakiety do MongoDB aby były trwałe i współdzielone między urządzeniami
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
    alert('Zaznacz przynajmniej jednego zawodnika!')
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
})
</script>

<template>
  <div class="page">
    <SkiLoader v-if="loading">Ładowanie szczegółów zawodów...</SkiLoader>

    <div v-else-if="session">
      <div class="header">
        <button @click="router.back()" class="btn-back">← Powrót</button>
        <div class="title-section">
          <h2>{{ session.event_place }} ({{ session.event_country }})</h2>
          <h3>{{ session.title }}</h3>
        </div>
        <div class="badges">
          <span class="badge blue">{{ session.category_code }}</span>
          <span class="badge gray">{{ session.session_type }}</span>
          <span class="badge green"
            ><a v-if="session.raceUrl" :href="session.raceUrl" target="_blank" class="btn-fis">
              Wyniki FIS ↗
            </a></span
          >
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <h4>Data i Czas</h4>
          <p>📅 {{ session.date }}</p>
          <p>🕒 {{ session.time }}</p>
        </div>
        <div class="info-card">
          <h4>Dane Skoczni</h4>
          <p>
            🏔️ Typ: <strong>{{ session.hillType }}</strong>
          </p>
          <p>
            📏 HS: <strong>{{ session.hillSize || 'Brak danych' }}</strong>
          </p>
        </div>
        <div class="info-card">
          <h4>Oficjalne Dokumenty (PDF)</h4>
          <ul class="doc-list">
            <li v-for="doc in session.documents" :key="doc.url">
              <a :href="doc.url" target="_blank">📄 {{ doc.type }}</a>
            </li>
          </ul>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PANEL PAKIETÓW ZAWODNIKÓW I PORÓWNYWARKI (PUNKTY PŚ) -->
      <!-- ======================================================== -->
      <div class="packages-master-panel">
        <div class="panel-header">
          <div class="panel-title-group">
            <h3>📦 Porównywarka Pakietów Zawodników (Punkty PŚ)</h3>
            <span class="panel-hint">
              Zaznacz do 8 zawodników w tabeli poniżej. Pakiety są agnostyczne — liczą punkty w aktualnie przeglądanym konkursie!
            </span>
          </div>
          <div class="selection-counter" :class="{ full: selectedAthletes.length >= 8 }">
            Zaznaczono: <strong>{{ selectedAthletes.length }} / 8</strong>
          </div>
        </div>

        <!-- 1. PASEK AKTUALNEGO WYBORU -->
        <div class="current-selection-bar" v-if="selectedAthletes.length > 0">
          <div class="selection-summary">
            <div class="points-box">
              <span class="points-label">Suma Pkt PŚ bieżącego wyboru</span>
              <span class="points-total">+{{ currentSelectionPoints }} pkt</span>
            </div>

            <div class="selected-chips">
              <span
                v-for="athName in selectedAthletes"
                :key="athName"
                class="athlete-chip"
              >
                {{ athName }}
                <strong class="chip-pts">+{{ getAthletePts(athName) }}</strong>
                <button
                  @click="toggleAthlete(athName)"
                  class="chip-remove"
                  title="Usuń z zaznaczenia"
                >
                  ✕
                </button>
              </span>
            </div>
          </div>

          <div class="save-package-row">
            <input
              type="text"
              v-model="newPackageName"
              placeholder="Wpisz nazwę pakietu (np. Mój Zespół A)..."
              class="package-input"
              @keyup.enter="saveCurrentPackage"
            />
            <button @click="saveCurrentPackage" class="btn-save-package">
              💾 Zapisz pakiet do porównania
            </button>
            <button @click="clearSelection" class="btn-clear-selection">
              Wyczyść zaznaczenie
            </button>
          </div>
        </div>

        <!-- 2. LISTA I PORÓWNANIE ZAPISANYCH PAKIETÓW -->
        <div class="saved-packages-section" v-if="savedPackages.length > 0">
          <h4 class="section-title">
            ⚖️ Twoje Zapisane Pakiety (Wyniki w tym konkursie: {{ session.event_place }})
          </h4>

          <div class="packages-grid">
            <div
              v-for="pkg in savedPackages"
              :key="pkg.id"
              class="package-card"
            >
              <div class="pkg-card-header">
                <div v-if="editingPackageId === pkg.id" class="rename-box">
                  <input
                    v-model="editingPackageName"
                    class="rename-input"
                    @keyup.enter="saveRenamePackage(pkg.id)"
                  />
                  <button @click="saveRenamePackage(pkg.id)" class="btn-mini">OK</button>
                </div>
                <div v-else class="pkg-name-wrapper">
                  <strong class="pkg-title">{{ pkg.name }}</strong>
                  <button
                    @click="startRenamePackage(pkg)"
                    class="btn-icon-subtle"
                    title="Zmień nazwę"
                  >
                    ✏️
                  </button>
                </div>

                <div class="pkg-header-actions">
                  <button
                    @click="applyPackageToSelection(pkg)"
                    class="btn-apply-pkg"
                    title="Wczytaj jako aktywne zaznaczenie"
                  >
                    Wczytaj do zaznaczenia
                  </button>
                  <button
                    @click="deletePackage(pkg.id)"
                    class="btn-delete-pkg"
                    title="Usuń pakiet"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Duży licznik punktów -->
              <div class="pkg-score-banner">
                <div class="score-main">
                  <span class="score-value">+{{ calcPackagePoints(pkg.athletes) }}</span>
                  <span class="score-unit">pkt PŚ</span>
                </div>
                <div class="pkg-count-tag">
                  {{ pkg.athletes.length }} zawodników
                </div>
              </div>

              <!-- Lista zawodników w pakiecie ze szczegółami -->
              <div class="pkg-athletes-list">
                <div
                  v-for="ath in pkg.athletes"
                  :key="ath"
                  class="pkg-athlete-row"
                >
                  <span class="ath-name">{{ ath }}</span>
                  <span class="ath-score" :class="{ zero: getAthletePts(ath) === 0 }">
                    {{ getAthletePts(ath) > 0 ? `+${getAthletePts(ath)} pkt` : '0 pkt' }}
                  </span>
                  <button
                    @click="removeAthleteFromPackage(pkg.id, ath)"
                    class="ath-remove-btn"
                    title="Usuń zawodnika z tego pakietu"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div class="pkg-card-footer" v-if="selectedAthletes.length > 0">
                <button
                  @click="addSelectionToPackage(pkg.id)"
                  class="btn-add-selected-to-pkg"
                >
                  + Dodaj zaznaczonych ({{ selectedAthletes.length }}) do tego pakietu
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="selectedAthletes.length === 0" class="packages-empty-hint">
          💡 Zaznacz zawodników w tabeli poniżej checkboxami, aby stworzyć swój pierwszy pakiet i porównać sumę punktów PŚ!
        </div>
      </div>

      <div class="results-section">
        <div class="results-header-row">
          <h3>Tabela Wyników</h3>
          <span class="results-instruction">
            Kliknij wiersz lub zaznacz pole wyboru po lewej stronie, aby dodać skoczka do pakietu.
          </span>
        </div>

        <p v-if="session.results_data?.is_cancelled" class="cancelled-alert">
          ⚠️ Uwaga: Ta sesja została odwołana lub przerwana.
        </p>

        <table class="results-table" v-if="session.results_data?.results?.length > 0">
          <thead>
            <tr>
              <th style="width: 44px; text-align: center">📦</th>
              <th style="width: 60px">Poz.</th>
              <th style="width: 50px">Bib</th>
              <th>Zawodnik</th>
              <th style="text-align: center">Kraj</th>
              <th style="text-align: center">Skok 1</th>
              <th style="text-align: center">Skok 2</th>
              <th style="text-align: right">Pkt Całkowite</th>
              <th style="text-align: right; width: 120px">Pkt PŚ/PK</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="athlete in session.results_data.results"
              :key="athlete.fis_code"
              :class="{ 'row-selected': isAthleteSelected(athlete.name) }"
              @click="toggleAthlete(athlete.name)"
              style="cursor: pointer"
            >
              <!-- Checkbox wyboru do pakietu -->
              <td style="text-align: center" @click.stop>
                <input
                  type="checkbox"
                  :checked="isAthleteSelected(athlete.name)"
                  @change="toggleAthlete(athlete.name)"
                  :disabled="!isAthleteSelected(athlete.name) && selectedAthletes.length >= 8"
                  class="package-checkbox"
                />
              </td>

              <td>
                <strong>{{ athlete.rank || '-' }}</strong>
              </td>
              <td class="bib">{{ athlete.bib }}</td>
              <td>
                <RouterLink
                  :to="`/athletes/${athlete.fis_code}`"
                  class="athlete-link"
                  @click.stop
                >
                  {{ athlete.name }}
                </RouterLink>
                <span v-if="athlete.status !== 'Classified'" class="status-dns">{{
                  athlete.status
                }}</span>
              </td>
              <td style="text-align: center">
                <span class="country">{{ athlete.country }}</span>
              </td>

              <td style="text-align: center">
                <div v-if="athlete.jumps && athlete.jumps[0]">
                  <strong>{{ athlete.jumps[0].distance }} m</strong><br />
                  <small
                    >{{ athlete.jumps[0].points }} pkt (Poz. {{ athlete.jumps[0].rank }})</small
                  >
                </div>
                <div v-else>-</div>
              </td>

              <td style="text-align: center">
                <div v-if="athlete.jumps && athlete.jumps[1]">
                  <strong>{{ athlete.jumps[1].distance }} m</strong><br />
                  <small
                    >{{ athlete.jumps[1].points }} pkt (Poz. {{ athlete.jumps[1].rank }})</small
                  >
                </div>
                <div v-else>-</div>
              </td>

              <td style="text-align: right; font-weight: bold; font-size: 1.1em">
                {{ athlete.total_points || '-' }}
              </td>
              <td style="text-align: right; color: #0ea5e9; font-weight: bold; font-size: 1.05em">
                <span class="competition-pts-chip" :class="{ zero: !(athlete.competition_points > 0) }">
                  {{ athlete.competition_points > 0 ? `+${athlete.competition_points}` : '-' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 20px;
  margin-bottom: 20px;
}
.title-section h2 {
  margin: 0;
  color: #0f172a;
  font-size: 2em;
}
.title-section h3 {
  margin: 5px 0 0 0;
  color: #64748b;
  font-weight: normal;
}
.btn-back {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
  font-weight: bold;
}
.btn-back:hover {
  background: #e2e8f0;
}

.badges {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
  text-transform: uppercase;
}
.badge.blue {
  background: #e0f2fe;
  color: #0369a1;
}
.badge.gray {
  background: #f1f5f9;
  color: #475569;
}
.badge.green {
  background: #dcfce7;
  color: #166534;
}

/* Grid info */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 25px;
}
.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 18px;
  border-radius: 8px;
}
.info-card h4 {
  margin: 0 0 12px 0;
  color: #334155;
  text-transform: uppercase;
  font-size: 0.85em;
}
.info-card p {
  margin: 5px 0;
}
.doc-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 120px;
  overflow-y: auto;
}
.doc-list li {
  margin-bottom: 5px;
}
.doc-list a {
  color: #0ea5e9;
  text-decoration: none;
  font-size: 0.9em;
}
.doc-list a:hover {
  text-decoration: underline;
}

/* ======================================================== */
/* STYLE DLA PANELU PAKIETÓW ZAWODNIKÓW */
/* ======================================================== */
.packages-master-panel {
  background: #1e293b;
  color: white;
  padding: 24px;
  border-radius: 8px;
  margin-bottom: 30px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #334155;
  padding-bottom: 15px;
}
.panel-title-group h3 {
  margin: 0 0 6px 0;
  color: #38bdf8;
  font-size: 1.4em;
}
.panel-hint {
  color: #94a3b8;
  font-size: 0.9em;
}

.selection-counter {
  background: #334155;
  color: #f1f5f9;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.9em;
  white-space: nowrap;
}
.selection-counter.full {
  background: #f59e0b;
  color: #78350f;
  font-weight: bold;
}

/* Pasek bieżącego wyboru */
.current-selection-bar {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.selection-summary {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.points-box {
  display: flex;
  flex-direction: column;
  background: #1e293b;
  padding: 10px 16px;
  border-radius: 6px;
  border: 1px solid #38bdf8;
}
.points-label {
  font-size: 0.75em;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: bold;
}
.points-total {
  font-size: 1.6em;
  font-weight: 800;
  color: #38bdf8;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: 1;
}
.athlete-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #334155;
  color: #f8fafc;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 0.85em;
  border: 1px solid #475569;
}
.chip-pts {
  color: #38bdf8;
  font-size: 0.95em;
}
.chip-remove {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 2px;
  font-size: 0.9em;
}
.chip-remove:hover {
  color: #f87171;
}

.save-package-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.package-input {
  flex: 1;
  min-width: 250px;
  padding: 10px 14px;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 6px;
  color: white;
  font-size: 0.95em;
}
.package-input:focus {
  outline: none;
  border-color: #38bdf8;
}
.btn-save-package {
  background: #0284c7;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-save-package:hover {
  background: #0369a1;
}
.btn-clear-selection {
  background: none;
  border: 1px dashed #64748b;
  color: #94a3b8;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-clear-selection:hover {
  color: #f1f5f9;
  border-color: #94a3b8;
}

/* Zapisane pakiety */
.saved-packages-section {
  margin-top: 15px;
}
.section-title {
  margin: 0 0 15px 0;
  color: #f8fafc;
  font-size: 1.1em;
}

.packages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.package-card {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pkg-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.pkg-name-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pkg-title {
  color: #38bdf8;
  font-size: 1.05em;
}
.btn-icon-subtle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 0.85em;
  opacity: 0.7;
}
.btn-icon-subtle:hover {
  opacity: 1;
}

.rename-box {
  display: flex;
  gap: 4px;
}
.rename-input {
  background: #1e293b;
  border: 1px solid #38bdf8;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
}
.btn-mini {
  background: #38bdf8;
  border: none;
  color: #0f172a;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  cursor: pointer;
}

.pkg-header-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.btn-apply-pkg {
  background: #334155;
  color: #e2e8f0;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75em;
  font-weight: bold;
  cursor: pointer;
}
.btn-apply-pkg:hover {
  background: #475569;
  color: white;
}
.btn-delete-pkg {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
  font-size: 0.95em;
}
.btn-delete-pkg:hover {
  filter: brightness(1.2);
}

.pkg-score-banner {
  background: #1e293b;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.score-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.score-value {
  font-size: 1.8em;
  font-weight: 800;
  color: #22c55e;
}
.score-unit {
  font-size: 0.9em;
  color: #94a3b8;
  font-weight: bold;
}
.pkg-count-tag {
  background: #334155;
  color: #cbd5e1;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}

.pkg-athletes-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}
.pkg-athlete-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
  padding: 4px 8px;
  background: #1e293b;
  border-radius: 4px;
}
.ath-name {
  color: #f1f5f9;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ath-score {
  color: #22c55e;
  font-weight: bold;
  margin-left: 8px;
}
.ath-score.zero {
  color: #64748b;
  font-weight: normal;
}
.ath-remove-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  margin-left: 6px;
  padding: 0 4px;
}
.ath-remove-btn:hover {
  color: #ef4444;
}

.pkg-card-footer {
  border-top: 1px solid #1e293b;
  padding-top: 10px;
}
.btn-add-selected-to-pkg {
  width: 100%;
  background: none;
  border: 1px dashed #475569;
  color: #38bdf8;
  padding: 6px;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
}
.btn-add-selected-to-pkg:hover {
  background: #1e293b;
  border-color: #38bdf8;
}

.packages-empty-hint {
  color: #94a3b8;
  font-style: italic;
  font-size: 0.9em;
  padding: 6px 0;
}

/* ======================================================== */
/* Tabela wyników */
/* ======================================================== */
.results-section h3 {
  color: #0f172a;
  margin-bottom: 4px;
}
.results-header-row {
  margin-bottom: 15px;
}
.results-instruction {
  color: #64748b;
  font-size: 0.85em;
}

.cancelled-alert {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px;
  border-radius: 4px;
  font-weight: bold;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.results-table th,
.results-table td {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.9em;
  text-transform: uppercase;
}
.results-table tr:hover {
  background-color: #f8fafc;
}

/* Podświetlenie zaznaczonego wiersza */
.results-table tr.row-selected {
  background-color: rgba(56, 189, 248, 0.12) !important;
}
.results-table tr.row-selected td {
  border-bottom-color: #bae6fd;
}

.package-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #0ea5e9;
}

.bib {
  color: #94a3b8;
  font-family: monospace;
}
.athlete-link {
  color: #0f172a;
  text-decoration: none;
  font-weight: bold;
}
.athlete-link:hover {
  color: #0ea5e9;
  text-decoration: underline;
}
.country {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #475569;
}
.status-dns {
  margin-left: 8px;
  background: #fee2e2;
  color: #991b1b;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: bold;
}

.competition-pts-chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: bold;
}
.competition-pts-chip.zero {
  background: transparent;
  color: #94a3b8;
  font-weight: normal;
}
</style>
