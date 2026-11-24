<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import { api } from '@/api/client'

interface StandingAthlete {
  rank: number
  fis_code: number
  name: string
  country: string
  starts: number
  total_points: number
  flag?: string
}

// --- Stan Komponentu ---
const standings = ref<StandingAthlete[]>([])
const totalEvents = ref(0)
const isLoading = ref(true)
const searchSearchQuery = ref('') // Filtr tekstowy do szybkiego szukania w tabeli

// --- Stan Filtrów (Wysłany do MongoDB) ---
const selectedSeason = ref(new Date().getFullYear().toString())
const selectedCategory = ref('WC')

// Słownik kategorii (spójny z main.py)
const categoriesMap: Record<string, string> = {
  WC: 'Puchar Świata (WC)',
  COC: 'Puchar Kontynentalny (COC)',
  FC: 'FIS Cup (FC)',
  GP: 'Letnie Grand Prix (GP)',
  OWG: 'Igrzyska Olimpijskie (OWG)',
  WSC: 'Mistrzostwa Świata (WSC)',
  SFWC: 'MŚ w Lotach (SFWC)',
  WJC: 'MŚ Juniorów (WJC)',
  FESA: 'Puchar FESA Alpencup (FESA)',
}

// Generowanie lat (20 lat wstecz)
const availableSeasons = computed(() => {
  const currentYear = new Date().getFullYear() + 1
  const years = []
  for (let i = 0; i <= 30; i++) {
    years.push((currentYear - i).toString())
  }
  return years
})

// --- Pobieranie Danych z MongoDB ---
const loadStandings = async () => {
  isLoading.value = true
  try {
    const data = await api.post('/stats/standings', {
      season: selectedSeason.value,
      category: selectedCategory.value,
    })
    standings.value = data.standings || []
    totalEvents.value = data.total_events || 0
  } catch (e) {
    console.error('Błąd pobierania klasyfikacji:', e)
    standings.value = []
    totalEvents.value = 0
  } finally {
    isLoading.value = false
  }
}

// Reaguj natychmiast na zmianę sezonu lub kategorii turnieju
watch([selectedSeason, selectedCategory], () => {
  loadStandings()
})

// --- Lokalny Filtr Tabeli ---
const filteredStandings = computed(() => {
  if (!searchSearchQuery.value) return standings.value
  const query = searchSearchQuery.value.toLowerCase()
  return standings.value.filter(
    (athlete) =>
      athlete.name.toLowerCase().includes(query) || athlete.country.toLowerCase().includes(query),
  )
})

onMounted(() => {
  loadStandings()
})
</script>

<template>
  <div class="page">
    <SkiLoader v-if="isLoading">Generowanie klasyfikacji generalnej z bazy danych</SkiLoader>

    <div class="standings-header">
      <h2>🏆 Klasyfikacje Generalne FIS</h2>
      <p v-if="!isLoading && totalEvents > 0" class="events-count">
        Przetworzono konkursów: <strong>{{ totalEvents }}</strong>
      </p>
    </div>

    <div class="filters-container">
      <div class="filter-box">
        <label>Sezon:</label>
        <select v-model="selectedSeason" class="filter-input">
          <option v-for="year in availableSeasons" :key="year" :value="year">
            Sezon {{ year }}
          </option>
        </select>
      </div>

      <div class="filter-box">
        <label>Kategoria:</label>
        <select v-model="selectedCategory" class="filter-input">
          <option v-for="(name, code) in categoriesMap" :key="code" :value="code">
            {{ name }}
          </option>
        </select>
      </div>

      <div class="filter-box flex-grow">
        <label>Filtruj skoczka na liście:</label>
        <input
          v-model="searchSearchQuery"
          type="text"
          placeholder="Wpisz nazwisko lub kraj..."
          class="filter-input"
        />
      </div>
    </div>

    <div v-if="!isLoading">
      <div class="table-responsive" v-if="filteredStandings.length > 0">
        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 70px; text-align: center">Miejsce</th>
              <th>Imię i Nazwisko</th>
              <th style="width: 90px; text-align: center">Kraj</th>
              <th style="width: 90px; text-align: center">Starty</th>
              <th style="width: 120px; text-align: right; padding-right: 15px">Punkty</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="athlete in filteredStandings"
              :key="athlete.fis_code"
              :class="{
                'podium-gold': athlete.rank === 1,
                'podium-silver': athlete.rank === 2,
                'podium-bronze': athlete.rank === 3,
              }"
            >
              <td style="text-align: center">
                <span v-if="athlete.rank === 1" class="rank-badge gold">🥇 1</span>
                <span v-else-if="athlete.rank === 2" class="rank-badge silver">🥈 2</span>
                <span v-else-if="athlete.rank === 3" class="rank-badge bronze">🥉 3</span>
                <span v-else class="rank-badge normal">{{ athlete.rank }}</span>
              </td>
              <td>
                <RouterLink :to="'/athletes/' + athlete.fis_code" class="athlete-link">
                  {{ athlete.name }}
                </RouterLink>
              </td>
              <td style="text-align: center">
                <span class="country-chip"><img class="mini-flag" :src="athlete.flag" alt="" /></span>
              </td>
              <td style="text-align: center" class="starts-col">{{ athlete.starts }}</td>
              <td style="text-align: right; padding-right: 15px" class="points-col">
                <strong>{{ athlete.total_points }}</strong> pkt
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="no-results">
        <span class="icon">🎿</span>
        <p>Brak danych o klasyfikacji dla wybranego roku oraz kategorii.</p>
        <small
          >Upewnij się, że sesje dla kategorii
          <strong> {{ categoriesMap[selectedCategory] }}</strong> w sezonie
          <strong>{{ selectedSeason }}</strong> zostały pobrane.</small
        >
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

.standings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 10px;
  flex-wrap: wrap;
  gap: 10px;
}
.standings-header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.45em;
  font-weight: 800;
}
.events-count {
  margin: 0;
  background: #e0f2fe;
  color: #0369a1;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 600;
}

/* FILTRY */
.filters-container {
  display: flex;
  gap: 10px;
  background: #f8fafc;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
  align-items: flex-end;
  flex-wrap: wrap;
}
.filter-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  flex: 1 1 140px;
}
.flex-grow {
  flex: 2 1 200px;
}
.filter-box label {
  font-size: 0.75em;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  height: 16px;
  line-height: 16px;
}
.filter-input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.88em;
  background: white;
  width: 100%;
  box-sizing: border-box;
  color: #1e293b;
}
.filter-input:focus {
  outline: none;
  border-color: #0284c7;
}

/* TABELA WYNIKÓW */
.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88em;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  padding: 8px 10px;
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.results-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
}
.results-table tbody tr {
  transition: background-color 0.15s;
}
.results-table tbody tr:hover {
  background-color: #f8fafc;
}

/* Podium Highlights */
.podium-gold { background-color: rgba(254, 243, 199, 0.4); }
.podium-silver { background-color: rgba(241, 245, 249, 0.6); }
.podium-bronze { background-color: rgba(254, 237, 213, 0.3); }

.rank-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
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
.rank-badge.normal {
  color: #475569;
}

.athlete-link {
  color: #0284c7;
  text-decoration: none;
  font-weight: 500;
}
.athlete-link:hover {
  text-decoration: underline;
  color: #0284c7;
}

.country-chip {
  padding: 2px 6px;
}
.mini-flag {
  width: 24px;
  height: 16px;
  object-fit: contain;
  vertical-align: middle;
  border-radius: 2px;
}

.starts-col {
  color: #64748b;
  font-weight: 500;
}
.points-col {
  font-size: 0.95em;
  color: #0f172a;
}

/* PUSTY STAN */
.no-results {
  text-align: center;
  padding: 35px 20px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}
.no-results .icon {
  font-size: 2.2em;
  display: block;
  margin-bottom: 8px;
}
.no-results p {
  margin: 0 0 6px 0;
  font-weight: 700;
  font-size: 1em;
  color: #334155;
}

@media (max-width: 768px) {
  .page {
    padding: 12px;
  }
  .filters-container {
    flex-direction: column;
    align-items: stretch;
  }
  .filter-box {
    width: 100%;
  }
}
</style>