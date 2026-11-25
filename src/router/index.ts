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
import { useNotice } from '@/stores/notice'

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
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true },
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
  const notice = useNotice()

  // If token exists but user profile is missing, refresh it
  if (auth.token.value && !auth.user.value) {
    await auth.fetchMe()
  }

  const handleBlockedRoute = (title: string, message: string, badge?: string, requiresLogin = false) => {
    notice.showNotice({
      title,
      message,
      badge,
      requiresLogin,
    })
    if (from.name) {
      return next(false)
    }
    return next('/athletes')
  }

  // Admin route protection
  if (to.meta.requiresAdmin) {
    if (!auth.isAdmin.value) {
      return handleBlockedRoute(
        'Brak dostępu',
        'Ta sekcja administracyjna jest zastrzeżona. Skontaktuj się z administratorem serwisu.',
        'ZABLOKOWANE'
      )
    }
  }

  // Auth route protection (np. klasyfikacja generalna dla każdego zalogowanego)
  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated.value) {
      return handleBlockedRoute(
        'Wymagane logowanie',
        'Przeglądanie oficjalnych klasyfikacji generalnych FIS wymaga zalogowania do serwisu.',
        'LOGOWANIE',
        true
      )
    }
  }

  // Search / Comparison route protection (LITE, PRO, ADMIN)
  if (to.meta.requiresSearch) {
    if (!auth.isAuthenticated.value) {
      return handleBlockedRoute(
        'Wymagane logowanie',
        'Dostęp do porównywarki i analizy skoczków wymaga logowania do serwisu.',
        'LOGOWANIE',
        true
      )
    }
    if (!auth.hasSearchAccess.value) {
      return handleBlockedRoute(
        'Wymagany pakiet FantaSKI LITE lub PRO',
        'Dostęp do porównywarki skoczków wymaga aktywnego pakietu FantaSKI LITE (do 2 zawodników) lub PRO (bez limitu). Skontaktuj się z administratorem, aby aktywować pakiet.',
        'LITE / PRO'
      )
    }
  }

  // PRO route protection (Przewidywania AI, wyceny Fantasy)
  if (to.meta.requiresPro) {
    if (!auth.isAuthenticated.value) {
      return handleBlockedRoute(
        'Wymagane logowanie',
        'Dostęp do modułu przewidywań AI wymaga logowania do serwisu.',
        'LOGOWANIE',
        true
      )
    }
    if (!auth.isPro.value) {
      return handleBlockedRoute(
        'Wymagany pakiet FantaSKI PRO',
        'Prognozy wyników i modele sztucznej inteligencji (AI) są dostępne wyłącznie w ramach pakietu FantaSKI PRO. Skontaktuj się z administratorem serwisu, aby aktywować pakiet.',
        'PRO'
      )
    }
  }

  next()
})

export default router
