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
import { translate } from '@/i18n'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'welcome',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
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
    },
    {
      path: '/stats',
      name: 'stats',
      component: SearchView,
      meta: { requiresAuth: true },
    },
    {
      path: '/predictions',
      name: 'predictions',
      component: PredictionsView,
      meta: { requiresPro: true },
    },
    {
      path: '/draft',
      name: 'draft',
      component: () => import('@/views/DraftView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/draft/league/:id',
      name: 'draft-league',
      component: () => import('@/views/DraftLeagueView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
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

const isProtectedRouteMeta = (meta: Record<string, any>) =>
  Boolean(meta?.requiresAuth || meta?.requiresPro || meta?.requiresAdmin)

router.beforeEach(async (to, from, next) => {
  const auth = useAuth()
  const notice = useNotice()

  if (auth.token.value && auth.isTokenExpired()) {
    auth.expireSession()
    if (isProtectedRouteMeta(to.meta)) {
      return next({ path: '/login', query: { expired: '1', redirect: to.fullPath } })
    }
  }

  // If token exists but user profile is missing, refresh it
  if (auth.token.value && !auth.user.value) {
    await auth.fetchMe()
    if (!auth.isAuthenticated.value && isProtectedRouteMeta(to.meta)) {
      return next({ path: '/login', query: { expired: '1', redirect: to.fullPath } })
    }
  }

  if ((to.path === '/login' || to.path === '/') && auth.isAuthenticated.value) {
    return next('/dashboard')
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
    return next(auth.isAuthenticated.value ? '/dashboard' : '/athletes')
  }

  // Admin route protection
  if (to.meta.requiresAdmin) {
    if (!auth.isAuthenticated.value) {
      return next({
        path: '/login',
        query: {
          ...(auth.sessionExpiredReason.value === 'expired' ? { expired: '1' } : {}),
          redirect: to.fullPath,
        },
      })
    }
    if (!auth.isAdmin.value) {
      return handleBlockedRoute(
        translate('router.noAccess'),
        translate('router.noAccessMsg'),
        translate('router.blockedBadge')
      )
    }
  }

  // Auth route protection (Porównywarka, Draft, Profil)
  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated.value) {
      return handleBlockedRoute(
        translate('router.loginReqTitle'),
        translate('router.loginReqMsg'),
        translate('router.loginReqBadge'),
        true
      )
    }
  }

  // PRO route protection (Przewidywania AI, wyceny Fantasy)
  if (to.meta.requiresPro) {
    if (!auth.isAuthenticated.value) {
      return handleBlockedRoute(
        translate('router.proLoginTitle'),
        translate('router.proLoginMsg'),
        'PRO',
        true
      )
    }
    if (!auth.isPro.value) {
      return handleBlockedRoute(
        translate('router.proReqTitle'),
        translate('router.proReqMsg'),
        'PRO'
      )
    }
  }

  next()
})

export default router
