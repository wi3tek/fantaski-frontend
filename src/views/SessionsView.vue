<script setup lang="ts">
import { ref, onMounted } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'

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

// Zakładka: Baza sesji vs Kalendarz PŚ/FIS
const activeViewTab = ref<'sessions' | 'calendar'>('sessions')
const calendarSeason = ref('2027')
const calendarCategory = ref('WC')
const calendarEvents = ref<any[]>([])
const loadingCalendar = ref(false)
const calendarError = ref<string | null>(null)
const expandedCalendarKeys = ref<Record<string, boolean>>({})

const getCalendarEventKey = (ev: any): string =>
  String(ev?.event_id || `${ev?.place || ''}_${ev?.date_label || ''}`)

const isCalendarEventExpanded = (ev: any): boolean =>
  Boolean(expandedCalendarKeys.value[getCalendarEventKey(ev)])

const toggleCalendarEvent = (ev: any) => {
  if (!ev?.sessions || ev.sessions.length === 0) return
  const key = getCalendarEventKey(ev)
  expandedCalendarKeys.value[key] = !expandedCalendarKeys.value[key]
}

const fetchCalendar = async () => {
  loadingCalendar.value = true
  calendarError.value = null
  expandedCalendarKeys.value = {}
  try {
    const data = await api.get<any>(
      `/stats/calendar?season=${encodeURIComponent(calendarSeason.value)}&category=${encodeURIComponent(calendarCategory.value)}`
    )
    calendarEvents.value = data.events || []
  } catch (e: any) {
    calendarError.value = e.message || 'Nie udało się pobrać kalendarza FIS.'
  } finally {
    loadingCalendar.value = false
  }
}

const openCalendarTab = () => {
  activeViewTab.value = 'calendar'
  if (calendarEvents.value.length === 0) {
    fetchCalendar()
  }
}

const tournamentBadgeLabel = (tag?: string | null) => {
  if (tag === 'TCS') return '🦅 Turniej Czterech Skoczni'
  if (tag === 'RAW_AIR') return '🇳🇴 Raw Air'
  if (tag === 'PLANICA_7') return '🇸🇮 Planica 7'
  return ''
}

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

const fetchCountries = async () => {
  try {
    const data: Country[] = await api.get('/athletes/countries', { cacheTtlMs: 300000 })
    countries.value = data.reduce(
      (acc, curr) => {
        acc[curr.code] = curr.name
        return acc
      },
      {} as Record<string, string>,
    )
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
    const data: SessionLight[] = await api.post('/stats/sessions', filters.value)
    if (append) {
      sessions.value = [...sessions.value, ...data]
    } else {
      sessions.value = data
    }
  } catch (e: any) {
    console.error('Błąd pobierania sesji:', e)
    errorMessage.value = e.message || 'Błąd połączenia z serwerem. Upewnij się, że backend jest uruchomiony.'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
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
        <span class="sub-counter" v-if="activeViewTab === 'sessions' && sessions.length > 0">
          Wyświetlono {{ sessions.length }} sesji
        </span>
        <span class="sub-counter" v-else-if="activeViewTab === 'calendar' && calendarEvents.length > 0">
          Przystanki w kalendarzu: {{ calendarEvents.length }}
        </span>
      </div>
      <div class="view-mode-tabs">
        <button
          type="button"
          class="view-tab-btn"
          :class="{ active: activeViewTab === 'sessions' }"
          @click="activeViewTab = 'sessions'"
        >
          📋 Baza sesji i wyników
        </button>
        <button
          type="button"
          class="view-tab-btn"
          :class="{ active: activeViewTab === 'calendar' }"
          @click="openCalendarTab"
        >
          📅 Kalendarz Pucharu Świata / FIS
        </button>
      </div>
    </div>

    <!-- ZAKŁADKA KALENDARZ PUCHARU ŚWIATA I CYKLI FIS -->
    <div v-if="activeViewTab === 'calendar'" class="calendar-section">
      <div class="filters-toolbar">
        <div class="filter-item">
          <label>Sezon:</label>
          <select v-model="calendarSeason" class="filter-input-sm" @change="fetchCalendar">
            <option value="2027">2026/2027 (Sezon 2027)</option>
            <option value="2026">2025/2026 (Sezon 2026)</option>
            <option value="2025">2024/2025 (Sezon 2025)</option>
          </select>
        </div>
        <div class="filter-item">
          <label>Cykl / Ranga:</label>
          <select v-model="calendarCategory" class="filter-input-sm" @change="fetchCalendar">
            <option value="WC">Puchar Świata (WC)</option>
            <option value="GP">Letnie Grand Prix (GP)</option>
            <option value="COC">Puchar Kontynentalny (COC)</option>
            <option value="FC">FIS Cup (FC)</option>
            <option value="WSC">Mistrzostwa Świata (WSC)</option>
            <option value="OWG">Igrzyska Olimpijskie (OWG)</option>
            <option value="SFWC">MŚ w Lotach (SFWC)</option>
          </select>
        </div>
        <div class="filter-item filter-actions">
          <button type="button" class="btn-clear-sm" @click="fetchCalendar" :disabled="loadingCalendar">
            🔄 Odśwież kalendarz
          </button>
        </div>
      </div>

      <SkiLoader v-if="loadingCalendar">Pobieranie oficjalnego kalendarza FIS...</SkiLoader>
      <div v-else-if="calendarError" class="error-container">
        <p class="error-text">⚠️ {{ calendarError }}</p>
        <button @click="fetchCalendar" class="btn-retry">Spróbuj ponownie 🔄</button>
      </div>
      <div v-else-if="calendarEvents.length > 0" class="table-responsive">
        <table class="sessions-table">
          <thead>
            <tr>
              <th style="width: 170px">Termin</th>
              <th>Miejscowość / Turniej</th>
              <th style="width: 160px">Status</th>
              <th style="width: 190px; text-align: right">Sesje / Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="ev in calendarEvents" :key="getCalendarEventKey(ev)">
              <tr
                :class="{
                  'cal-row-expandable': ev.sessions && ev.sessions.length > 0,
                  'cal-row-expanded': isCalendarEventExpanded(ev),
                }"
                @click="toggleCalendarEvent(ev)"
              >
                <td>
                  <strong>{{ ev.date_label }}</strong>
                </td>
                <td>
                  <div class="location-row">
                    <CountryFlag
                      v-if="ev.country && ev.country !== 'FIS'"
                      :code="ev.country"
                      size="sm"
                      :title="countries[ev.country] || ev.country"
                    />
                    <span class="place-name">{{ ev.place }}</span>
                    <span v-if="ev.tournament_tag" class="cal-tourney-badge">
                      {{ tournamentBadgeLabel(ev.tournament_tag) }}
                    </span>
                  </div>
                </td>
                <td>
                  <span v-if="ev.status === 'COMPLETED'" class="cal-status-pill done">
                    ✅ Rozegrane ({{ ev.sessions_count }})
                  </span>
                  <span v-else-if="ev.status === 'IN_PROGRESS'" class="cal-status-pill progress">
                    🟢 W trakcie ({{ ev.sessions_count }})
                  </span>
                  <span v-else-if="ev.status === 'CANCELLED'" class="cal-status-pill cancelled">
                    🚫 Odwołane
                  </span>
                  <span v-else-if="ev.status === 'AWAITING_RESULTS' || ev.status === 'PAST'" class="cal-status-pill awaiting">
                    ⏳ Oczekiwanie na wyniki
                  </span>
                  <span v-else class="cal-status-pill upcoming">
                    ⏳ Nadchodzące
                  </span>
                </td>
                <td style="text-align: right">
                  <div class="cal-actions">
                    <button
                      v-if="ev.sessions && ev.sessions.length > 0"
                      type="button"
                      class="btn-cal-expand"
                      :class="{ active: isCalendarEventExpanded(ev) }"
                      :aria-expanded="isCalendarEventExpanded(ev)"
                      :title="isCalendarEventExpanded(ev) ? 'Zwiń listę sesji' : 'Rozwiń wszystkie rozegrane sesje'"
                      @click.stop="toggleCalendarEvent(ev)"
                    >
                      <span>Sesje ({{ ev.sessions.length }})</span>
                      <span class="cal-arrow">{{ isCalendarEventExpanded(ev) ? '▲' : '▼' }}</span>
                    </button>
                    <a
                      v-if="ev.url"
                      :href="ev.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="cal-fis-link"
                      @click.stop
                    >
                      FIS ↗
                    </a>
                  </div>
                </td>
              </tr>

              <!-- Rozwinięta lista wszystkich rozegranych sesji dla weekendu -->
              <tr
                v-if="isCalendarEventExpanded(ev) && ev.sessions && ev.sessions.length > 0"
                class="cal-sessions-drawer-row"
              >
                <td colspan="4">
                  <div class="cal-sessions-panel">
                    <div class="cal-sessions-panel-head">
                      <span>📋 Rozegrane sesje: <strong>{{ ev.place }}</strong> ({{ ev.date_label }})</span>
                      <small>{{ ev.sessions.length }} {{ ev.sessions.length === 1 ? 'sesja' : ev.sessions.length < 5 ? 'sesje' : 'sesji' }}</small>
                    </div>
                    <div class="cal-sessions-list">
                      <div
                        v-for="s in ev.sessions"
                        :key="s.id"
                        class="cal-session-item"
                      >
                        <div class="cal-session-main">
                          <span class="cal-session-date">
                            {{ s.date }}<template v-if="s.time"> · {{ s.time }}</template>
                          </span>
                          <span
                            class="cal-session-type-pill"
                            :class="(s.session_type || '').toLowerCase()"
                          >
                            {{ sessionTypeMap[s.session_type] || s.session_type || 'Sesja' }}
                          </span>
                          <span class="cal-session-title">
                            {{ s.title || ev.place }}
                          </span>
                          <span v-if="s.hillSize" class="cal-session-hill">
                            HS {{ s.hillSize }}
                          </span>
                          <span v-if="s.is_cancelled" class="cal-session-cancelled">
                            🚫 Odwołana
                          </span>
                        </div>
                        <RouterLink
                          :to="`/sessions/${s.id}`"
                          class="btn-details-sm"
                        >
                          Wyniki ↗
                        </RouterLink>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-else class="no-results">
        📅 Brak pozycji w kalendarzu FIS dla wybranego sezonu i rangi.
      </div>
    </div>

    <template v-if="activeViewTab === 'sessions'">
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
                  <CountryFlag
                    v-if="s.event_country"
                    :code="s.event_country"
                    size="sm"
                    :title="countries[s.event_country] || s.event_country"
                  />
                  <span class="place-name">{{ s.event_place || 'Brak miejsca' }}</span>
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
    </template>
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
  .results-table th:first-child,
  .results-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 8;
    background: #ffffff;
    box-shadow: 4px 0 6px -2px rgba(0, 0, 0, 0.08);
  }
  .results-table th:first-child {
    z-index: 10;
    background: #f1f5f9;
  }
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.view-mode-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.view-tab-btn {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.85em;
  font-weight: 700;
  cursor: pointer;
}

.view-tab-btn.active {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.cal-aggregate-row {
  background: #f0f9ff;
}

.cal-tourney-badge {
  display: inline-block;
  font-size: 0.72em;
  font-weight: 800;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  padding: 2px 7px;
  border-radius: 999px;
}

.cal-status-pill {
  display: inline-block;
  font-size: 0.76em;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}

.cal-status-pill.done {
  background: #dcfce7;
  color: #166534;
}

.cal-status-pill.progress {
  background: #fef3c7;
  color: #92400e;
}

.cal-status-pill.upcoming {
  background: #dbeafe;
  color: #1d4ed8;
}

.cal-status-pill.past,
.cal-status-pill.awaiting {
  background: #f1f5f9;
  color: #475569;
}

.cal-status-pill.cancelled {
  background: #fee2e2;
  color: #b91c1c;
}

.cal-session-cancelled {
  font-size: 0.72em;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  white-space: nowrap;
}

.cal-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.cal-row-expandable {
  cursor: pointer;
}

.cal-row-expandable:hover {
  background: #f8fafc;
}

.cal-row-expanded {
  background: #eff6ff;
}

.btn-cal-expand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78em;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.btn-cal-expand:hover,
.btn-cal-expand.active {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.cal-arrow {
  font-size: 0.72em;
  line-height: 1;
}

.cal-sessions-drawer-row > td {
  background: #f8fafc;
  padding: 10px 14px 14px;
  border-bottom: 1px solid #cbd5e1;
}

.cal-sessions-panel {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}

.cal-sessions-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.82em;
  color: #334155;
}

.cal-sessions-list {
  display: flex;
  flex-direction: column;
}

.cal-session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.cal-session-item:last-child {
  border-bottom: none;
}

.cal-session-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.cal-session-date {
  font-size: 0.8em;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.cal-session-type-pill {
  font-size: 0.72em;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  white-space: nowrap;
}

.cal-session-type-pill.competition {
  background: #dcfce7;
  color: #166534;
}

.cal-session-type-pill.qualification {
  background: #dbeafe;
  color: #1d4ed8;
}

.cal-session-type-pill.training {
  background: #f1f5f9;
  color: #475569;
}

.cal-session-type-pill.trial {
  background: #fef3c7;
  color: #92400e;
}

.cal-session-title {
  font-size: 0.85em;
  color: #0f172a;
  font-weight: 600;
}

.cal-session-hill {
  font-size: 0.75em;
  color: #64748b;
  font-weight: 700;
}

.cal-fis-link {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.78em;
  font-weight: 600;
}
</style>
