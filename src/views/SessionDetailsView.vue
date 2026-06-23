<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'

const route = useRoute()
const router = useRouter()
const sessionId = route.params.id

const session = ref<any>(null)
const loading = ref(true)

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

      <div class="results-section">
        <h3>Tabela Wyników</h3>
        <p v-if="session.results_data?.is_cancelled" class="cancelled-alert">
          ⚠️ Uwaga: Ta sesja została odwołana lub przerwana.
        </p>

        <table class="results-table" v-if="session.results_data?.results?.length > 0">
          <thead>
            <tr>
              <th style="width: 60px">Poz.</th>
              <th style="width: 50px">Bib</th>
              <th>Zawodnik</th>
              <th style="text-align: center">Kraj</th>
              <th style="text-align: center">Skok 1</th>
              <th style="text-align: center">Skok 2</th>
              <th style="text-align: right">Pkt Całkowite</th>
              <th style="text-align: right">Pkt PŚ/PK</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="athlete in session.results_data.results" :key="athlete.fis_code">
              <td>
                <strong>{{ athlete.rank || '-' }}</strong>
              </td>
              <td class="bib">{{ athlete.bib }}</td>
              <td>
                <RouterLink :to="`/athletes/${athlete.fis_code}`" class="athlete-link">
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
              <td style="text-align: right; color: #0ea5e9; font-weight: bold">
                {{ athlete.competition_points > 0 ? `+${athlete.competition_points}` : '-' }}
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
  margin-bottom: 30px;
}
.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 20px;
  border-radius: 8px;
}
.info-card h4 {
  margin: 0 0 15px 0;
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

/* Tabela */
.results-section h3 {
  color: #0f172a;
  margin-bottom: 15px;
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
</style>
