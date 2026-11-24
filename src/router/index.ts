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
import { useAuth } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/athletes',
    },
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
      path: '/hills',
      name: 'hills',
      component: HillsView,
    },
    {
      path: '/standings',
      name: 'standings',
      component: StandingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/stats',
      name: 'stats',
      component: SearchView,
      meta: { requiresSearch: true },
    },
    {
      path: '/predictions',
      name: 'predictions',
      component: PredictionsView,
      meta: { requiresPro: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAdmin: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/athletes',
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuth()

  // If token exists but user profile is missing, refresh it
  if (auth.token.value && !auth.user.value) {
    await auth.fetchMe()
  }

  // Admin route protection
  if (to.meta.requiresAdmin) {
    if (!auth.isAdmin.value) {
      alert('Brak dostępu do tego zasobu. Skontaktuj się z administratorem serwisu.')
      return next('/athletes')
    }
  }

  // Auth route protection (np. klasyfikacja generalna dla każdego zalogowanego)
  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated.value) {
      auth.isAuthModalOpen.value = true
      alert('Przeglądanie klasyfikacji generalnych wymaga darmowego logowania do serwisu.')
      return next('/athletes')
    }
  }

  // Search / Comparison route protection (LITE, PRO, ADMIN)
  if (to.meta.requiresSearch) {
    if (!auth.isAuthenticated.value) {
      auth.isAuthModalOpen.value = true
      alert('Dostęp do porównywarki skoczków wymaga logowania.')
      return next('/athletes')
    }
    if (!auth.hasSearchAccess.value) {
      alert('Dostęp do porównywarki wymaga konta FantaSKI LITE lub PRO.\nSkontaktuj się z administratorem serwisu, aby aktywować pakiet.')
      return next('/athletes')
    }
  }

  // PRO route protection (Przewidywania AI, wyceny Fantasy)
  if (to.meta.requiresPro) {
    if (!auth.isAuthenticated.value) {
      auth.isAuthModalOpen.value = true
      alert('Dostęp do tej sekcji wymaga logowania.')
      return next('/athletes')
    }
    if (!auth.isPro.value) {
      alert('Ta sekcja jest dostępna wyłącznie w ramach konta FantaSKI PRO.\nSkontaktuj się z administratorem serwisu, aby aktywować pakiet PRO.')
      return next('/athletes')
    }
  }

  next()
})

export default router
