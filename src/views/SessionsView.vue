<script setup lang="ts">
import { ref, onMounted } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import { RouterLink } from 'vue-router'

interface SessionLight {
  _id: string
  title?: string
  date?: string
  time?: string
  event_place?: string
  event_country?: string
  category_code?: string
  session_type?: string
  hillType?: string
}

interface Country {
  code: string
  name: string
}

const sessions = ref<SessionLight[]>([])
const countries = ref<Record<string, string>>({}) // Słownik { "POL": "Polska" }
const loading = ref(true)
const loadingMore = ref(false)
const errorMessage = ref<string | null>(null)

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
    errorMessage.value = null
  }

  try {
    const res = await fetch('http://127.0.0.1:8000/stats/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filters.value),
    })

    if (res.ok) {
      const data: SessionLight[] = await res.json()
      if (append) {
        sessions.value = [...sessions.value, ...data]
      } else {
        sessions.value = data
      }
    } else {
      errorMessage.value = `Błąd serwera (${res.status}): Nie udało się pobrać listy sesji.`
    }
  } catch (e) {
    console.error('Błąd pobierania sesji:', e)
    errorMessage.value = 'Błąd połączenia z serwerem. Upewnij się, że backend jest uruchomiony.'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const getFlagUrl = (fisCode?: string | null): string | null => {
  if (!fisCode || typeof fisCode !== 'string') return null
  const cleaned = fisCode.trim().toUpperCase()
  if (!cleaned) return null
  const iso = fisToIso[cleaned] || cleaned.toLowerCase().substring(0, 2)
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

onMounted(() => {
  fetchCountries()
  fetchSessions()
})
</script>

<template>
  <div class="page">
    <div class="view-header">
      <div class="title-cluster">
        <h2>🎿 Kalendarz i Baza Sesji FIS</h2>
        <span class="sub-counter" v-if="sessions.length > 0">
          Wyświetlono {{ sessions.length }} sesji
        </span>
      </div>
    </div>

    <!-- KOMPAKTOWY PASEK FILTRÓW -->
    <div class="filters-toolbar">
      <div class="filter-item">
        <label>Od daty:</label>
        <input
          type="date"
          v-model="filters.date_from"
          class="filter-input-sm"
          @change="applyFilters"
        />
      </div>

      <div class="filter-item">
        <label>Do daty:</label>
        <input
          type="date"
          v-model="filters.date_to"
          class="filter-input-sm"
          @change="applyFilters"
        />
      </div>

      <div class="filter-item">
        <label>Typ sesji:</label>
        <select v-model="filters.session_type" class="filter-input-sm" @change="applyFilters">
          <option value="">-- Wszystkie typy --</option>
          <option value="COMPETITION">🏆 Konkurs Główny</option>
          <option value="QUA">🎯 Kwalifikacje</option>
          <option value="TRAINING">⏱️ Trening</option>
          <option value="TRIAL">🔄 Seria próbna</option>
        </select>
      </div>

      <div class="filter-item">
        <label>Ranga:</label>
        <select v-model="filters.category" class="filter-input-sm" @change="applyFilters">
          <option value="">-- Wszystkie rangi --</option>
          <option value="WC">Puchar Świata (WC)</option>
          <option value="COC">Puchar Kontynentalny (COC)</option>
          <option value="OWG">Igrzyska Olimpijskie (OWG)</option>
          <option value="WSC">Mistrzostwa Świata (WSC)</option>
        </select>
      </div>

      <div class="filter-item filter-actions">
        <button @click="clearFilters" class="btn-clear-sm" title="Zresetuj wszystkie filtry">
          ✕ Wyczyść
        </button>
      </div>
    </div>

    <SkiLoader v-if="loading">Ładowanie bazy sesji...</SkiLoader>

    <div v-else>
      <div v-if="errorMessage" class="error-container">
        <p class="error-text">⚠️ {{ errorMessage }}</p>
        <button @click="fetchSessions(false)" class="btn-retry">Spróbuj ponownie 🔄</button>
      </div>

      <div class="table-responsive" v-else-if="sessions.length > 0">
        <table class="sessions-table">
          <thead>
            <tr>
              <th style="width: 140px">Termin</th>
              <th style="width: 80px; text-align: center">Ranga</th>
              <th>Miejscowość / Wydarzenie</th>
              <th style="width: 160px">Typ Sesji</th>
              <th style="width: 110px; text-align: right">Akcja</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sessions" :key="s._id">
              <td>
                <div class="date-block">
                  <span class="date-main">{{ s.date || 'Brak daty' }}</span>
                  <span v-if="s.time" class="time-tag">{{ s.time }}</span>
                </div>
              </td>
              <td style="text-align: center">
                <span class="cat-chip">{{ s.category_code || '-' }}</span>
              </td>
              <td>
                <div class="location-row">
                  <span class="place-name">{{ s.event_place || 'Brak miejsca' }}</span>
                  <img
                    v-if="s.event_country && getFlagUrl(s.event_country)"
                    :src="getFlagUrl(s.event_country)!"
                    class="flag-img"
                    :title="countries[s.event_country] || s.event_country"
                    alt=""
                  />
                  <span
                    v-else-if="s.event_country"
                    class="country-fallback"
                    :title="countries[s.event_country] || s.event_country"
                  >
                    {{ s.event_country }}
                  </span>
                </div>
                <small v-if="s.title" class="session-sub-title">{{ s.title }}</small>
              </td>
              <td>
                <span
                  :class="[
                    'session-type-chip',
                    (s.session_type || '').includes('COMPETITION') ? 'comp' : (s.session_type || '').includes('QUA') ? 'qua' : 'other',
                  ]"
                >
                  {{ (s.session_type && sessionTypeMap[s.session_type]) || s.session_type || 'Nieznany' }}
                </span>
              </td>
              <td style="text-align: right">
                <RouterLink :to="`/sessions/${s._id}`" class="btn-details-sm">
                  Szczegóły ↗
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!errorMessage && sessions.length >= filters.limit" class="load-more-container">
        <button @click="loadMore" :disabled="loadingMore" class="btn-load-more">
          {{ loadingMore ? 'Ładowanie...' : 'Pokaż starsze sesje ↓' }}
        </button>
      </div>

      <div v-if="!errorMessage && sessions.length === 0" class="no-results">
        🎿 Brak sesji spełniających kryteria wyszukiwania.
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

.view-header {
  margin-bottom: 14px;
}
.title-cluster {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.title-cluster h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.45em;
  font-weight: 800;
}
.sub-counter {
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.78em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
}

/* PASEK FILTRÓW */
.filters-toolbar {
  display: flex;
  gap: 10px;
  background: #f8fafc;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 18px;
  border: 1px solid #e2e8f0;
  flex-wrap: wrap;
  align-items: flex-end;
}
.filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 150px;
  min-width: 130px;
}
.filter-item label {
  font-size: 0.75em;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  height: 16px;
  line-height: 16px;
}
.filter-input-sm {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  font-size: 0.85em;
  color: #1e293b;
  width: 100%;
  box-sizing: border-box;
}
.filter-input-sm:focus {
  outline: none;
  border-color: #0284c7;
}

.filter-actions {
  flex: 0 0 auto;
  min-width: auto;
  justify-content: flex-end;
}
.btn-clear-sm {
  background: none;
  border: 1px dashed #94a3b8;
  color: #64748b;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82em;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.2s;
  height: 33px;
}
.btn-clear-sm:hover {
  border-color: #0f172a;
  color: #0f172a;
  background: #f1f5f9;
}

/* TABELA SESJI */
.sessions-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88em;
}
.sessions-table th,
.sessions-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #e2e8f0;
}
.sessions-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 700;
}
.sessions-table tbody tr {
  transition: background-color 0.15s;
}
.sessions-table tbody tr:hover {
  background-color: #f8fafc;
}

.date-block {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.date-main {
  color: #0f172a;
  font-size: 0.95em;
}
.time-tag {
  color: #64748b;
  font-size: 0.78em;
}

.cat-chip {
  background: #e0f2fe;
  color: #0369a1;
  padding: 3px 7px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8em;
  font-family: monospace;
}

.location-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.place-name {
  color: #0f172a;
  font-size: 0.95em;
}
.flag-img {
  width: 22px;
  height: auto;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  cursor: help;
}
.country-fallback {
  background: #f1f5f9;
  color: #475569;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.72em;
  font-weight: 700;
}
.session-sub-title {
  color: #64748b;
  font-size: 0.8em;
  display: block;
  margin-top: 2px;
}

.session-type-chip {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 700;
}
.session-type-chip.comp {
  background: #dcfce7;
  color: #15803d;
}
.session-type-chip.qua {
  background: #e0f2fe;
  color: #0284c7;
}
.session-type-chip.other {
  background: #fef3c7;
  color: #92400e;
}

.btn-details-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  background: #0284c7;
  color: white;
  padding: 5px 12px;
  border-radius: 4px;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.82em;
  transition: background 0.2s;
}
.btn-details-sm:hover {
  background: #0369a1;
}

.load-more-container {
  text-align: center;
  margin-top: 18px;
}
.btn-load-more {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 8px 20px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 0.85em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  transition: all 0.2s;
}
.btn-load-more:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.error-container {
  padding: 20px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  text-align: center;
  margin: 15px 0;
}
.error-text {
  color: #b91c1c;
  font-weight: 700;
  font-size: 0.95em;
  margin-bottom: 10px;
}
.btn-retry {
  background: #ef4444;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85em;
}

.no-results {
  text-align: center;
  color: #64748b;
  padding: 30px;
  font-style: italic;
  font-size: 0.9em;
}

@media (max-width: 768px) {
  .page {
    padding: 12px;
  }
  .filters-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .filter-item {
    width: 100%;
  }
}
</style>
