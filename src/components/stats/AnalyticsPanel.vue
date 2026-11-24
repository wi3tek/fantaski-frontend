<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  groupedRows: any[]
  filteredVisibleAthletes: any[]
}>()

const sortKey = ref<string>('roi')
const sortOrder = ref<'asc' | 'desc'>('asc')
const hoveredAthlete = ref<any | null>(null)
const expandedAthlete = ref<string | null>(null)

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

const athleteAnalytics = computed(() => {
  if (props.groupedRows.length === 0) return []

  return props.filteredVisibleAthletes
    .map((athlete) => {
      const jumps: any[] = []
      props.groupedRows.forEach((row) => {
        if (row.athletes[athlete.name]) jumps.push(row.athletes[athlete.name])
      })

      if (jumps.length === 0) return { name: athlete.name, price: athlete.price, hasData: false }

      const ranksArr = jumps.map((j) => j.jump_rank).filter((r) => r != null)
      const count = ranksArr.length
      const avgRank = count ? ranksArr.reduce((a, b) => a + b, 0) / count : null
      const roi =
        athlete.price && athlete.price > 0 && avgRank !== null ? avgRank * athlete.price : null

      const hitRate30 = count ? (ranksArr.filter((r) => r <= 30).length / count) * 100 : 0
      const hitRate20 = count ? (ranksArr.filter((r) => r <= 20).length / count) * 100 : 0
      const hitRate10 = count ? (ranksArr.filter((r) => r <= 10).length / count) * 100 : 0
      const hitRate3 = count ? (ranksArr.filter((r) => r <= 3).length / count) * 100 : 0

      let stdDev = null
      if (count > 1 && avgRank !== null) {
        const variance = ranksArr.reduce((a, b) => a + Math.pow(b - avgRank, 2), 0) / count
        stdDev = Math.sqrt(variance)
      }

      let trendIcon = '➡️'
      let trendClass = 'trend-neutral'
      let trendText = 'Brak danych'
      let trendDiff = null
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
        trendDiff,
      }
    })
    .sort((a, b) => {
      if (!a.hasData && !b.hasData) return 0
      if (!a.hasData) return 1
      if (!b.hasData) return -1

      let valA = a[sortKey.value as keyof typeof a]
      let valB = b[sortKey.value as keyof typeof b]

      if (valA === null || valA === undefined) return 1
      if (valB === null || valB === undefined) return -1

      if (typeof valA === 'string')
        return sortOrder.value === 'asc'
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA)
      return sortOrder.value === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number)
    })
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
              <th style="text-align: left" class="sortable-th" @click="sortBy('name')">
                Zawodnik {{ sortKey === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable-th" @click="sortBy('price')">
                Cena Fantasy {{ sortKey === 'price' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
              </th>
              <th class="sortable-th" @click="sortBy('jumpCount')">
                Skoki {{ sortKey === 'jumpCount' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Łączna liczba oddanych i zanalizowanych skoków zawodnika w wybranym okresie."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('avgRank')">
                Śr. Miejsce {{ sortKey === 'avgRank' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Suma zajętych miejsc podzielona przez liczbę oddanych skoków."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('roi')">
                Współczynnik ROI {{ sortKey === 'roi' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="(Średnie Miejsce × Cena Fantasy). Im NIŻSZY wynik, tym tańszy i lepiej skaczący zawodnik."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('hitRate30')">
                Hit Rate (Top 30)
                {{ sortKey === 'hitRate30' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 30-tce."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('hitRate20')">
                Top 20 {{ sortKey === 'hitRate20' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 20-tce."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('hitRate10')">
                Top 10 {{ sortKey === 'hitRate10' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Procent skoków, w których zawodnik zajął miejsce w pierwszej 10-tce."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('hitRate3')">
                Top 3 {{ sortKey === 'hitRate3' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Procent skoków zakończonych na podium (miejsca 1-3)."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('trendDiff')">
                Trend Formy {{ sortKey === 'trendDiff' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Porównanie średniego miejsca z 3 najnowszych skoków do średniej z 3 poprzednich."
                  >&#9432;</span
                >
              </th>
              <th class="sortable-th" @click="sortBy('stdDev')">
                Stabilność {{ sortKey === 'stdDev' ? (sortOrder === 'asc' ? '▲' : '▼') : '' }}
                <span
                  class="info-icon"
                  data-tooltip="Matematyczne odchylenie standardowe zajmowanych miejsc. Poniżej 5.0: Wybitna regularność."
                  >&#9432;</span
                >
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
                      Number(stat.price).toFixed(1)
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
                        stat.roi && stat.roi < 10
                          ? 'good'
                          : stat.roi && stat.roi > 35
                            ? 'bad'
                            : 'neutral',
                      ]"
                      >{{ stat.roi?.toFixed(1) }}</span
                    >
                  </td>
                  <td>
                    <span :class="['stat-badge', (stat.hitRate30 ?? 0) > 75 ? 'good' : 'neutral']"
                      >{{ (stat.hitRate30 ?? 0).toFixed(1) }}%</span
                    >
                  </td>
                  <td>
                    <span :class="['stat-badge', (stat.hitRate20 ?? 0) > 50 ? 'good' : 'neutral']"
                      >{{ (stat.hitRate20 ?? 0).toFixed(1) }}%</span
                    >
                  </td>
                  <td>
                    <span :class="['stat-badge', (stat.hitRate10 ?? 0) > 30 ? 'good' : 'neutral']"
                      >{{ (stat.hitRate10 ?? 0).toFixed(1) }}%</span
                    >
                  </td>
                  <td>
                    <span :class="['stat-badge', (stat.hitRate3 ?? 0) > 15 ? 'good' : 'neutral']"
                      >{{ (stat.hitRate3 ?? 0).toFixed(1) }}%</span
                    >
                  </td>
                  <td>
                    <span :class="['trend-badge', stat.trendClass]"
                      >{{ stat.trendIcon }} {{ stat.trendText }}</span
                    >
                  </td>
                  <td>
                    <span
                      :class="[
                        'stat-badge',
                        stat.stdDev != null && stat.stdDev < 5 ? 'good' : 'neutral',
                      ]"
                      >{{ stat.stdDev?.toFixed(1) }}</span
                    >
                  </td>
                </template>
                <td v-else colspan="10" class="no-data-msg">Brak danych</td>
              </tr>
              <tr v-if="expandedAthlete === stat.name" class="expansion-panel-row">
                <td colspan="11">
                  <div class="trend-chart-container">
                    <div class="chart-info">
                      <strong>Wykres Formy (Miejsca w serii):</strong
                      ><span>Góra = 1. miejsce, Dół = 50. miejsce</span>
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
        <div
          class="scatter-wrapper"
          style="position: relative; width: 100%; max-width: 800px; margin: 0 auto"
        >
          <div class="quadrant quad-top-left">
            <span class="quad-title">🎯 OKAZJE (Tani i w Top 20)</span>
          </div>
          <div class="quadrant quad-top-right">
            <span class="quad-title">👑 ASY (Drodzy i w Top 20)</span>
          </div>
          <div class="quadrant quad-bottom-left">
            <span class="quad-title">🎲 RYZYKO (Tani poza Top 20)</span>
          </div>
          <div class="quadrant quad-bottom-right">
            <span class="quad-title">❌ NIEOPŁACALNI (Przepłaceni / Słabi)</span>
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

            <g v-for="ath in athleteAnalytics.filter((a) => a.hasData && a.price)" :key="ath.name">
              <g
                :transform="`translate(${(ath.price / 3.0) * 600}, ${ath.avgRank && ath.avgRank <= 20 ? ((ath.avgRank - 1) / 19) * 200 : 200 + ((Math.min(ath.avgRank || 50, 40) - 20) / 20) * 200})`"
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
              :transform="`translate(${(hoveredAthlete.price / 3.0) * 600}, ${hoveredAthlete.avgRank <= 20 ? ((hoveredAthlete.avgRank - 1) / 19) * 200 : 200 + ((Math.min(hoveredAthlete.avgRank, 40) - 20) / 20) * 200})`"
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
  border-left: 4px solid #8b5cf6;
}

.analytics-table {
  width: 100%;
  border-collapse: collapse;
  text-align: center;
  font-size: 0.95em;
}
.analytics-table-wrapper {
  overflow: visible; /* Zdejmujemy ucinanie tooltipów na desktopie */
}

.analytics-table th {
  background: #f1f5f9;
  color: #334155;
  padding: 12px;
  border-bottom: 2px solid #cbd5e1;
  text-transform: uppercase;
  font-size: 0.85em;
  position: relative; /* DODANE: Pozwala by z-index z main.css zadziałał poprawnie */
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
.sortable-th {
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.sortable-th:hover {
  background-color: #e2e8f0 !important;
  color: #0f172a !important;
}
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
.price-autocomplete-badge {
  background: #fef08a;
  color: #854d0e;
  padding: 2px 6px;
  border-radius: 12px;
  font-weight: bold;
  font-size: 0.85em;
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
  padding: 0 !important;
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
  height: 180px;
  overflow: visible;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.08));
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
.guide-line.top1 {
  stroke: #e0f2fe;
  opacity: 0.6;
  stroke-width: 1.5;
}
.guide-line.top50 {
  stroke: #fee2e2;
  opacity: 0.4;
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
.axis-text {
  font-size: 0.75rem;
  fill: #64748b;
  font-weight: 600;
}
.axis-y {
  text-anchor: end;
}
.axis-x {
  text-anchor: middle;
}
.axis-tick {
  stroke: #cbd5e1;
  stroke-width: 1.5;
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
.date-label {
  font-weight: 700;
  fill: #475569;
}
.place-label {
  font-weight: 400;
  fill: #64748b;
  font-size: 0.68rem;
}
.scatter-card {
  border-left: 4px solid #0ea5e9 !important;
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
.quadrant {
  position: absolute;
  width: 50%;
  height: 50%;
  padding: 10px;
  pointer-events: none;
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
.scatter-svg {
  padding: 30px;
}
.scatter-dot-group {
  cursor: pointer;
}
.scatter-dot {
  fill: #8b5cf6;
  stroke: white;
  stroke-width: 2;
  transition:
    r 0.2s ease,
    fill 0.2s ease;
}
.scatter-dot-group:hover .scatter-dot {
  fill: #0ea5e9;
  r: 12px;
}
.scatter-foreign {
  pointer-events: none;
  overflow: visible;
}
.scatter-dot-text {
  font-size: 10px;
  font-weight: 700;
  color: #1e293b;
  text-align: center;
  width: fit-content;
  margin: 0 auto;
  padding: 3px 6px;
  border-radius: 5px;
  background-color: transparent;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}
.scatter-dot-group:hover .scatter-dot-text {
  font-size: 11px;
  background-color: #ffffff;
  border-color: #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
  transform: translateY(-4px);
  color: #0ea5e9;
}
.active-tooltip {
  font-size: 14px !important;
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15) !important;
  transform: translateY(-4px) !important;
}

/* Responsive Analytics & Charts */
@media (max-width: 1024px) {
  /* Tabela analityczna staje się przewijana horyzontalnie */
  .analytics-table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .analytics-table {
    min-width: 900px; /* Wymusza scroll zamiast zgniatania tekstu */
  }

  /* Wykres punktowy (Scatter Plot) */
  .scatter-container {
    padding: 15px 5px;
  }
  .scatter-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .scatter-svg {
    min-width: 600px; /* Wykres się nie psuje, na telefonie po prostu po nim "jeździmy" */
  }

  /* Informacje o wykresie trendu */
  .chart-info {
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }
}

@media (max-width: 768px) {
  .trend-chart-container {
    padding: 10px;
  }
  .card-header h3,
  .card-header h2 {
    font-size: 1.1em;
  }
  .subtitle {
    font-size: 0.8em;
  }
}
</style>
