<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'

const route = useRoute()
const athlete = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  const fisCode = route.params.fis_code
  try {
    const res = await fetch(`http://127.0.0.1:8000/athletes/find?fis_code=${fisCode}`)
    if (res.ok) {
      athlete.value = await res.json()
    }
  } catch (e) {
    console.error('Błąd pobierania detali zawodnika:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <SkiLoader v-if="loading">Przygotowujemy profil zawodnika...</SkiLoader>
    <div v-else-if="!athlete" class="no-results">Nie znaleziono zawodnika o podanym kodzie.</div>

    <div v-else>
      <div class="profile-header">
        <RouterLink to="/athletes" class="btn-back">← Wróć do listy</RouterLink>

        <RouterLink
          :to="{ path: '/stats', query: { fis_code: athlete.fis_code } }"
          class="btn-stats"
        >
          📊 Zobacz historię skoków
        </RouterLink>
      </div>

      <div class="profile-card">
        <div class="pic-section">
          <img
            :src="
              'https://data.fis-ski.com/general/load-competitor-picture/' +
              athlete.competitor_id_from_url +
              '.html'
            "
            alt="Zdjęcie zawodnika"
            class="profile-pic"
            onerror="this.src = 'https://via.placeholder.com/150?text=Brak+zdjęcia'"
          />

          <div class="status-labels">
            <span v-if="athlete.status === 'Active'" class="label-active">✅ AKTYWNY</span>
            <span v-else class="label-inactive">🛑 KONIEC KARIERY</span>
          </div>
        </div>

        <div class="info">
          <h2>
            <img class="mini-flag" :src="athlete.flag" alt="Flaga" />
            {{ athlete.full_name }}
          </h2>

          <div class="data-grid">
            <div class="data-item">
              <span class="label">FIS Code</span>
              <span class="value">{{ athlete.fis_code }}</span>
            </div>
            <div class="data-item">
              <span class="label">Data urodzenia</span>
              <span class="value">{{
                athlete.birthdate ? new Date(athlete.birthdate).toLocaleDateString() : 'Brak danych'
              }}</span>
            </div>
            <div class="data-item">
              <span class="label">Kraj</span>
              <span class="value"
                ><strong>{{ athlete.country_code }}</strong></span
              >
            </div>
            <div class="data-item">
              <span class="label">Klub</span>
              <span class="value">{{ athlete.club || '-' }}</span>
            </div>
            <div class="data-item" v-if="athlete.price">
              <span class="label">Cena ESM</span>
              <span class="value price-value">{{ athlete.price.toFixed(2) }}</span>
            </div>
          </div>

          <div class="external-link">
            <a
              :href="athlete.profile_url"
              target="_blank"
              rel="noopener noreferrer"
              class="fis-btn"
            >
              Otwórz oficjalny profil FIS ↗
            </a>
          </div>
        </div>
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

/* Header z nawigacją */
.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 15px;
}
.btn-back {
  display: inline-block;
  padding: 8px 16px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #475569;
  border-radius: 4px;
  font-weight: bold;
  text-decoration: none;
}
.btn-back:hover {
  background: #e2e8f0;
}
.btn-stats {
  display: inline-block;
  padding: 8px 16px;
  background: #38bdf8;
  color: white;
  border-radius: 4px;
  font-weight: bold;
  text-decoration: none;
  box-shadow: 0 2px 4px rgba(56, 189, 248, 0.3);
  transition: background 0.2s;
}
.btn-stats:hover {
  background: #0284c7;
}

/* Karta Profilowa */
.profile-card {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}
@media (max-width: 768px) {
  .profile-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}

.pic-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}
.profile-pic {
  width: 160px;
  height: 160px;
  object-fit: cover;
  border-radius: 50%;
  border: 5px solid #e2e8f0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

/* Odznaki statusu */
.status-labels span {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85em;
  font-weight: bold;
  letter-spacing: 0.5px;
}
.label-active {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.label-inactive {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

/* Sekcja Danych */
.info h2 {
  margin: 0 0 20px 0;
  color: #0f172a;
  font-size: 2.2em;
  display: flex;
  align-items: center;
  gap: 15px;
}
.mini-flag {
  width: 36px;
  height: 24px;
  border-radius: 3px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  width: 100%;
  max-width: 500px;
}
.data-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.data-item .label {
  font-size: 0.8em;
  color: #64748b;
  text-transform: uppercase;
  font-weight: bold;
}
.data-item .value {
  font-size: 1.1em;
  color: #1e293b;
}

.external-link {
  margin-top: 25px;
}
.fis-btn {
  color: #0ea5e9;
  font-weight: bold;
  text-decoration: none;
}
.fis-btn:hover {
  text-decoration: underline;
  color: #0369a1;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 8px;
  font-style: italic;
}
.price-value { color: #16a34a; font-weight: bold; font-size: 1.2em; }
</style>
