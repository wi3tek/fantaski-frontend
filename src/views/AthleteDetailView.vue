<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SkiLoader from '@/components/SkiLoader.vue'
import { API_BASE_URL } from '@/api/client'
import { useAuth } from '@/stores/auth'

const auth = useAuth()
const route = useRoute()
const athlete = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  const fisCode = route.params.fis_code
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_BASE_URL}/athletes/find?fis_code=${fisCode}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
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
          :to="{ path: '/stats', query: { fis_code: athlete.fis_code, name: athlete.full_name } }"
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
              <span class="value">{{ athlete.country_code }}</span>
            </div>
            <div class="data-item">
              <span class="label">Klub</span>
              <span class="value">{{ athlete.club || '-' }}</span>
            </div>
            <div class="data-item" v-if="auth.isPro.value && athlete.price != null">
              <span class="label">Wycena Fantasy</span>
              <span class="value price-value">{{ Number(athlete.price).toFixed(1) }}</span>
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
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Header z nawigacją */
.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
}
.btn-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  padding: 6px 14px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  color: #475569;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85em;
  text-decoration: none;
  transition: all 0.2s;
}
.btn-back:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.btn-stats {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  padding: 6px 14px;
  background: #0284c7;
  color: white;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85em;
  text-decoration: none;
  box-shadow: 0 1px 3px rgba(2, 132, 199, 0.3);
  transition: background 0.2s;
}
.btn-stats:hover {
  background: #0369a1;
}

/* Karta Profilowa */
.profile-card {
  display: flex;
  gap: 28px;
  align-items: flex-start;
}
@media (max-width: 768px) {
  .page {
    padding: 14px;
  }
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
  gap: 10px;
}
.profile-pic {
  width: 125px;
  height: 125px;
  object-fit: cover;
  border-radius: 50%;
  border: 4px solid #e0f2fe;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

/* Odznaki statusu */
.status-labels span {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.78em;
  font-weight: 500;
  letter-spacing: 0.4px;
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
  margin: 0 0 14px 0;
  color: #0f172a;
  font-size: 1.55em;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}
.mini-flag {
  width: 30px;
  height: 20px;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.data-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  background: #f8fafc;
  padding: 14px 16px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  width: 100%;
  max-width: 480px;
}
.data-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.data-item .label {
  font-size: 0.75em;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 500;
  letter-spacing: 0.4px;
}
.data-item .value {
  font-size: 0.95em;
  color: #1e293b;
}

.external-link {
  margin-top: 18px;
}
.fis-btn {
  color: #0284c7;
  font-weight: 500;
  font-size: 0.88em;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fis-btn:hover {
  text-decoration: underline;
  color: #0369a1;
}

.no-results {
  text-align: center;
  padding: 30px;
  color: #64748b;
  background: #f8fafc;
  border-radius: 6px;
  font-style: italic;
  font-size: 0.9em;
}
.price-value { color: #16a34a; font-weight: 700; font-size: 1.1em; }
</style>
