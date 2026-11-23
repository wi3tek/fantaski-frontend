<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import { RouterLink } from 'vue-router'

interface SessionLight {
  _id: string
  title: string
  date: string
  time: string
  event_place: string
  event_country: string
  category_code: string
  session_type: string
  hillType: string
}

interface Country {
  code: string
  name: string
}

const sessions = ref<SessionLight[]>([])
const countries = ref<Record<string, string>>({}) // Słownik { "POL": "Polska" }
const loading = ref(true)
const loadingMore = ref(false)

// Filtry
const filters = ref({
  date_from: '',
  date_to: '',
  session_type: '',
  category: '',
  limit: 20,
  skip: 0,
})

// Słownik tłumaczeń typów sesji
const sessionTypeMap: Record<string, string> = {
  COMPETITION: 'Konkurs Główny',
  QUALIFICATION: 'Kwalifikacje',
  TRAINING: 'Trening',
  TRIAL: 'Seria próbna',
}

// Mapowanie kodów FIS (3-literowe) na ISO (2-literowe) dla flag
const fisToIso: Record<string, string> = {
  POL: 'pl',
  GER: 'de',
  AUT: 'at',
  SLO: 'si',
  NOR: 'no',
  FIN: 'fi',
  JPN: 'jp',
  SUI: 'ch',
  USA: 'us',
  CAN: 'ca',
  FRA: 'fr',
  ITA: 'it',
  CZE: 'cz',
  EST: 'ee',
  KAZ: 'kz',
  BUL: 'bg',
  UKR: 'ua',
  SVK: 'sk',
}

const fetchCountries = async () => {
  try {
    const res = await fetch('http://127.0.0.1:8000/athletes/countries')
    if (res.ok) {
      const data: Country[] = await res.json()
      // Przekształcamy tablicę w obiekt dla szybkiego dostępu
      countries.value = data.reduce(
        (acc, curr) => {
          acc[curr.code] = curr.name
          return acc
        },
        {} as Record<string, string>,
      )
    }
  } catch (e) {
    console.error('Błąd pobierania krajów:', e)
  }
}

const fetchSessions = async (append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    filters.value.skip = 0
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/stats/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters.value),
    })

    if (res.ok) {
      const data = await res.json()
      if (append) {
        sessions.value = [...sessions.value, ...data]
      } else {
        sessions.value = data
      }
    }
  } catch (e) {
    console.error('Błąd pobierania sesji:', e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const getFlagUrl = (fisCode: string) => {
  const iso = fisToIso[fisCode.toUpperCase()] || fisCode.toLowerCase().substring(0, 2)
  return `https://flagcdn.com/w40/${iso}.png`
}

const loadMore = () => {
  filters.value.skip += filters.value.limit
  fetchSessions(true)
}

const applyFilters = () => {
  fetchSessions(false)
}

const clearFilters = () => {
  filters.value = { date_from: '', date_to: '', session_type: '', category: '', limit: 20, skip: 0 }
  fetchSessions(false)
}

onMounted(async () => {
  await fetchCountries() // Pobierz kraje przed sesjami
  fetchSessions()
})
</script>

<template>
  <div class="page">
    <h2>Baza Sesji (Konkursy, Kwalifikacje, Treningi)</h2>

    <div class="filters-container">
      <div class="filter-box">
        <label>Od daty:</label>
        <input
          type="date"
          v-model="filters.date_from"
          class="filter-input"
          @change="applyFilters"
        />
      </div>
      <div class="filter-box">
        <label>Do daty:</label>
        <input type="date" v-model="filters.date_to" class="filter-input" @change="applyFilters" />
      </div>
      <div class="filter-box">
        <label>Typ sesji:</label>
        <select v-model="filters.session_type" class="filter-input" @change="applyFilters">
          <option value="">-- Wszystkie --</option>
          <option value="COMPETITION">Konkurs</option>
          <option value="QUA">Kwalifikacje</option>
          <option value="TRAINING">Trening / Oficjalny Trening</option>
          <option value="TRIAL">Seria próbna</option>
        </select>
      </div>
      <div class="filter-box">
        <label>Kategoria:</label>
        <select v-model="filters.category" class="filter-input" @change="applyFilters">
          <option value="">-- Wszystkie --</option>
          <option value="WC">Puchar Świata (WC)</option>
          <option value="COC">Puchar Kontynentalny (COC)</option>
          <option value="OWG">Igrzyska (OWG)</option>
          <option value="WSC">MŚ (WSC)</option>
        </select>
      </div>
      <div class="filter-box flex-end">
        <button @click="clearFilters" class="btn-clear">Wyczyść filtry</button>
      </div>
    </div>

    <SkiLoader v-if="loading">Ładowanie sesji...</SkiLoader>

    <div v-else>
      <table class="results-table" v-if="sessions.length > 0">
        <thead>
          <tr>
            <th>Data i Czas</th>
            <th>Kategoria</th>
            <th>Miejsce</th>
            <th>Typ Sesji</th>
            <th style="text-align: right">Akcja</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sessions" :key="s._id">
            <td>
              <strong>{{ s.date }}</strong> <span class="time-dim">{{ s.time }}</span>
            </td>
            <td>
              <span class="chip-cat">{{ s.category_code }}</span>
            </td>
            <td>
              <div class="location-cell">
                <strong>{{ s.event_place }}</strong>
                <img
                  :src="getFlagUrl(s.event_country)"
                  class="flag-img"
                  :title="countries[s.event_country] || s.event_country"
                />
              </div>
              <small class="session-title-small">{{ s.title }}</small>
            </td>
            <td>
              <span
                :class="['chip-type', s.session_type.includes('COMPETITION') ? 'comp' : 'other']"
              >
                {{ sessionTypeMap[s.session_type] || s.session_type }}
              </span>
            </td>
            <td style="text-align: right">
              <RouterLink :to="`/sessions/${s._id}`" class="btn-details"> Szczegóły ↗ </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="sessions.length >= filters.limit" class="load-more-container">
        <button @click="loadMore" :disabled="loadingMore" class="btn-load-more">
          {{ loadingMore ? 'Ładowanie...' : 'Pokaż starsze sesje ↓' }}
        </button>
      </div>

      <div v-if="sessions.length === 0" class="no-results">
        Brak sesji spełniających kryteria wyszukiwania.
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Istniejące style + poprawki dla flagi */

.location-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flag-img {
  width: 24px;
  height: auto;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: help; /* Kursor wskazujący na tooltip */
}

.session-title-small {
  color: #64748b;
  font-size: 0.85em;
  display: block;
  margin-top: 2px;
}

/* Reszta Twoich styli pozostaje bez zmian */
.page {
  background: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}
.filters-container {
  display: flex;
  gap: 15px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 25px;
  border: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
.filter-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 150px;
}
.filter-box label {
  font-size: 0.9em;
  color: #475569;
  font-weight: bold;
}
.filter-input {
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  width: 100%;
}
.flex-end {
  justify-content: flex-end;
}
.btn-clear {
  background: none;
  border: 1px dashed #94a3b8;
  color: #64748b;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
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
}
.time-dim {
  color: #94a3b8;
  font-size: 0.9em;
}
.chip-cat {
  background: #e2e8f0;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-family: monospace;
}
.chip-type {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
}
.chip-type.comp {
  background: #dcfce7;
  color: #166534;
}
.chip-type.other {
  background: #fef08a;
  color: #854d0e;
}
.btn-details {
  display: inline-block;
  background: #38bdf8;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  text-decoration: none;
  font-weight: bold;
}
.btn-load-more {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 12px 24px;
  border-radius: 20px;
  font-weight: bold;
  cursor: pointer;
}
</style>
