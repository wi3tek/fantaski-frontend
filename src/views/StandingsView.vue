<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'

interface StandingAthlete {
  rank: number
  fis_code: number
  name: string
  country: string
  starts: number
  total_points: number
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
    const res = await fetch('http://127.0.0.1:8000/stats/standings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        season: selectedSeason.value,
        category: selectedCategory.value,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      standings.value = data.standings || []
      totalEvents.value = data.total_events || 0
    } else {
      console.error('Błąd serwera przy pobieraniu klasyfikacji')
      standings.value = []
      totalEvents.value = 0
    }
  } catch (e) {
    console.error('Błąd sieci:', e)
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
      <h2>🏆 Klasyfikacje Generalne</h2>
      <p v-if="!isLoading && totalEvents > 0" class="events-count">
        Przetworzono konkursów w sezonie: <strong>{{ totalEvents }}</strong>
      </p>
    </div>

    <div class="filters-container">
      <div class="filter-box">
        <label>Wybierz Sezon:</label>
        <select v-model="selectedSeason" class="filter-input">
          <option v-for="year in availableSeasons" :key="year" :value="year">
            Sezon {{ year }}
          </option>
        </select>
      </div>

      <div class="filter-box">
        <label>Wybierz Kategorię:</label>
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
      <table class="results-table" v-if="filteredStandings.length > 0">
        <thead>
          <tr>
            <th style="width: 80px; text-align: center">Miejsce</th>
            <th>Imię i Nazwisko</th>
            <th style="width: 120px; text-align: center">Kraj</th>
            <th style="width: 120px; text-align: center">Starty</th>
            <th style="width: 140px; text-align: right; padding-right: 25px">Punkty</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="athlete in filteredStandings"
            :key="athlete.fis_code"
            :class="{ 'top-three': athlete.rank <= 3 }"
          >
            <td style="text-align: center">
              <span :class="['rank-badge', `rank-${athlete.rank}`]">
                {{ athlete.rank }}
              </span>
            </td>
            <td>
              <RouterLink :to="'/athletes/' + athlete.fis_code" class="athlete-link">
                <strong>{{ athlete.name }}</strong>
              </RouterLink>
            </td>
            <td style="text-align: center">
              <span class="country-chip"><img class="mini-flag" :src="athlete.flag" /></span>
            </td>
            <td style="text-align: center" class="starts-col">{{ athlete.starts }}</td>
            <td style="text-align: right; padding-right: 25px" class="points-col">
              <strong>{{ athlete.total_points }}</strong> pkt
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="no-results">
        <span class="icon">🎿</span>
        <p>Brak danych o klasyfikacji dla wybranego roku oraz kategorii.</p>
        <small
          >Upewnij się, że sesje dla kategorii
          <strong> {{ categoriesMap[selectedCategory] }}</strong> w sezonie
          <strong>{{ selectedSeason }}</strong> zostały pobrane. <br>W tym celu skontaktuj się z adminsitracją serwisu
          .</small
        >
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

.standings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 15px;
}
.standings-header h2 {
  margin: 0;
  color: #0f172a;
}
.events-count {
  margin: 0;
  background: #e0f2fe;
  color: #0369a1;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.9em;
}

/* FILTRY */
.filters-container {
  display: flex;
  gap: 20px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 25px;
  border: 1px solid #e2e8f0;
  align-items: flex-end;
}
.filter-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}
.flex-grow {
  flex: 1;
}
.filter-box label {
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
}
.filter-input {
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 1em;
  background: white;
  width: 100%;
  box-sizing: border-box;
}

/* TABELA WYNIKÓW */
.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  margin-top: 10px;
}
.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  padding: 14px 12px;
  font-size: 0.9em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.results-table td {
  padding: 12px;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
}

/* Wiersze Podium */
.top-three {
  background-color: #fafbfd;
}
.rank-badge {
  display: inline-block;
  width: 28px;
  height: 28px;
  line-height: 28px;
  border-radius: 50%;
  font-weight: bold;
  font-size: 0.9em;
}
.rank-1 {
  background: #fef08a;
  color: #854d0e;
  border: 1px solid #fde047;
} /* Złoto */
.rank-2 {
  background: #e2e8f0;
  color: #475569;
  border: 1px solid #cbd5e1;
} /* Srebro */
.rank-3 {
  background: #ffedd5;
  color: #9a3412;
  border: 1px solid #fed7aa;
} /* Brąz */

.athlete-link {
  color: #0ea5e9;
  text-decoration: none;
}
.athlete-link:hover {
  text-decoration: underline;
  color: #0369a1;
}

.country-chip {
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: bold;
  font-family: monospace;
  color: #475569;
}
.starts-col {
  color: #64748b;
  font-weight: 500;
}
.points-col {
  font-size: 1.05em;
  color: #0f172a;
}

/* PUSTY STAN */
.no-results {
  text-align: center;
  padding: 50px 20px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}
.no-results .icon {
  font-size: 3em;
  display: block;
  margin-bottom: 10px;
}
.no-results p {
  margin: 0 0 8px 0;
  font-weight: bold;
  font-size: 1.1em;
  color: #334155;
}
</style>