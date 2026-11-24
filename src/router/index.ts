// router/index.ts (dodany nowy wpis)
import { createRouter, createWebHistory } from 'vue-router'
import SearchView from '@/views/SearchView.vue'
import AthleteDetailView from '@/views/AthleteDetailView.vue'
import AthletesView from '@/views/AthletesView.vue'
import AdminView from '@/views/AdminView.vue'
import StandingsView from '@/views/StandingsView.vue'
import SessionsView from '@/views/SessionsView.vue'
import SessionDetailsView from '@/views/SessionDetailsView.vue'
import HillsView from '@/views/HillsView.vue'
import PredictionsView from '@/views/PredictionsView.vue'
// Zakładam, że stworzysz taki plik w widokach dla nowej klasyfikacji

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/athletes',
      name: 'athletes',
      component: AthletesView,
    },
    {
      path: '/athletes/:fis_code',
      name: 'athlete-detail',
      component: AthleteDetailView,
    },
    {
      path: '/stats', // "Porównywarka"
      name: 'stats',
      component: SearchView,
    },
    {
      path: '/standings', // NOWY WIDOK "Klasyfikacje"
      name: 'standings',
      component: StandingsView,
    },
    {
      path: '/',
      redirect: '/athletes',
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
    },
    {
      path: '/hills',
      name: 'hills',
      component: HillsView,
    },
    {
      path: '/sessions',
      name: 'sessions',
      component: SessionsView,
    },
    {
      path: '/sessions/:id',
      name: 'session-detail',
      component: SessionDetailsView,
    },
    {
      path: '/predictions',
      name: 'predictions',
      component: PredictionsView,
    },
  ],
})

export default router
