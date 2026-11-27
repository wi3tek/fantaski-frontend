<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useI18n } from '@/i18n'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'

interface NextCompetition {
  found: boolean
  place?: string
  country?: string
  country_code?: string
  hill_size?: number
  hill_type?: string
  date?: string
  time?: string
  competition_type?: string
  session_title?: string
  qualification?: {
    date?: string | null
    time?: string | null
    title?: string | null
  } | null
}

interface PodiumEntry {
  rank: number
  fis_code?: string | number | null
  name: string
  country: string
  total_points?: number | null
  distances?: number[]
}

interface RecentSessionItem {
  id: string
  title: string
  date: string
  time: string
  event_place: string
  event_country: string
  category_code: string
  session_type: string
  hillSize?: number | null
  hillType?: string
  season?: string
  podium: PodiumEntry[]
}

interface StandingsEntry {
  rank: number
  fis_code: string | number
  name: string
  country: string
  starts: number
  total_points: number
  flag?: string
}

interface DashboardStatsPayload {
  next_competition?: NextCompetition
  latest_competition_id?: string | null
  latest_sessions?: RecentSessionItem[]
  standings?: {
    season?: string
    category?: string
    total_events?: number
    top5?: StandingsEntry[]
  }
}

interface DraftStandingRow {
  user_id: string
  name: string
  rank: number
  total_points: number
}

interface DraftLeagueSummary {
  id: string
  name: string
  status: string
  category_code?: string
  season?: string
  creator_id?: string
  current_turn_user_id?: string | null
  current_pick_index?: number
  total_picks?: number
  current_round?: number | null
  participants?: Array<{
    user_id: string
    name: string
    status: string
  }>
  standings?: DraftStandingRow[]
}

interface EsmStarter {
  fis_code?: string | number | null
  name?: string | null
  fis_name?: string | null
  esm_fullname?: string | null
  country?: string
  flag?: string | null
  price?: number | null
  points?: number | null
}

interface EsmStatusPayload {
  connected: boolean
  team_id?: string | null
  last_synced_at?: string | null
  my_team?: {
    team_name?: string
    value?: number | null
    squad_value?: number | null
    total_points?: number | null
    starters?: EsmStarter[]
    bench?: EsmStarter[]
  } | null
}

const auth = useAuth()
const { t, bcp47Locale, formatSessionType, formatHillType, formatStarts } = useI18n()

const isLoading = ref(true)
const dashboardData = ref<DashboardStatsPayload | null>(null)
const draftLeagues = ref<DraftLeagueSummary[]>([])
const esmStatus = ref<EsmStatusPayload | null>(null)
const statsError = ref<string | null>(null)

const myUserId = computed(() => String(auth.user.value?.id || ''))
const firstName = computed(() => {
  const full = (auth.user.value?.name || '').trim()
  if (!full) return 'Skoczku'
  return full.split(/\s+/)[0]
})

const todayLabel = computed(() => {
  try {
    return new Intl.DateTimeFormat(bcp47Locale.value, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date())
  } catch {
    return ''
  }
})

const nextComp = computed(() => dashboardData.value?.next_competition || { found: false })
const latestSessions = computed(() => dashboardData.value?.latest_sessions || [])
const topStandings = computed(() => dashboardData.value?.standings?.top5 || [])
const standingsSeason = computed(() => dashboardData.value?.standings?.season || '2027')
const standingsTotalEvents = computed(() => dashboardData.value?.standings?.total_events || 0)
const latestCompId = computed(() => dashboardData.value?.latest_competition_id || null)

const sessionTypeLabel = (type?: string) => formatSessionType(type)

const hillTypeLabel = (type?: string) => (type ? formatHillType(type) : '')

const formatSeasonLabel = (season?: string) => {
  const yr = Number(season)
  if (!Number.isFinite(yr) || yr < 2000) return season || ''
  return `${yr - 1}/${yr}`
}

const formatShortDate = (iso?: string | null) => {
  if (!iso) return ''
  const clean = String(iso).slice(0, 10)
  const parts = clean.split('-')
  if (parts.length !== 3) return clean
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

const formatPoints = (val?: number | null) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—'
  return Number(val).toFixed(1).replace(/\.0$/, '')
}

const formatMln = (val?: number | null) => {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—'
  return `${Number(val).toFixed(2).replace(/\.?0+$/, '')} ${t('common.mln')}`
}

const getStarterName = (p: EsmStarter) =>
  p.fis_name || p.esm_fullname || p.name || (p.fis_code ? `#${p.fis_code}` : '')

const formatStartsLabel = (count?: number | null) => formatStarts(Number(count || 0))

const getParticipantStatus = (lg: DraftLeagueSummary) => {
  const p = (lg.participants || []).find((item) => item.user_id === myUserId.value)
  return p?.status || ''
}

const draftActionAlerts = computed(() => {
  const uid = myUserId.value
  const alerts: Array<{
    leagueId: string
    leagueName: string
    kind: 'turn' | 'invite' | 'launch'
    badge: string
    message: string
    ctaLabel: string
  }> = []

  for (const lg of draftLeagues.value) {
    const pStatus = getParticipantStatus(lg)
    if (lg.status === 'ACTIVE_DRAFT' && lg.current_turn_user_id === uid) {
      alerts.push({
        leagueId: lg.id,
        leagueName: lg.name,
        kind: 'turn',
        badge: '🔥',
        message: t('dash.alertTurnMsg', { name: lg.name, round: lg.current_round || 1 }),
        ctaLabel: t('dash.alertTurnCta'),
      })
    } else if (pStatus === 'INVITED' && lg.status === 'LOBBY') {
      alerts.push({
        leagueId: lg.id,
        leagueName: lg.name,
        kind: 'invite',
        badge: '📩',
        message: t('dash.alertInviteMsg', { name: lg.name, cat: lg.category_code || 'WC' }),
        ctaLabel: t('dash.alertInviteCta'),
      })
    } else if (lg.status === 'DRAFT_FINISHED' && lg.creator_id === uid) {
      alerts.push({
        leagueId: lg.id,
        leagueName: lg.name,
        kind: 'launch',
        badge: '🚀',
        message: t('dash.alertStartMsg', { name: lg.name }),
        ctaLabel: t('dash.alertStartCta'),
      })
    }
  }
  return alerts
})

const draftStatusInfo = (status: string) => {
  switch (status) {
    case 'ACTIVE_DRAFT':
      return { label: t('dash.statusActiveDraft'), cls: 'pill-amber' }
    case 'LEAGUE_ACTIVE':
      return { label: t('dash.statusLeagueActive'), cls: 'pill-green' }
    case 'DRAFT_FINISHED':
      return { label: t('dash.statusDraftDone'), cls: 'pill-blue' }
    case 'LOBBY':
      return { label: t('dash.statusLobby'), cls: 'pill-slate' }
    case 'COMPLETED':
      return { label: t('dash.statusCompleted'), cls: 'pill-slate' }
    default:
      return { label: status, cls: 'pill-slate' }
  }
}

const getMyDraftStanding = (lg: DraftLeagueSummary): DraftStandingRow | null => {
  if (!lg.standings || lg.standings.length === 0) return null
  return lg.standings.find((row) => row.user_id === myUserId.value) || null
}

const displayedDraftLeagues = computed(() => {
  const rankWeight = (lg: DraftLeagueSummary) => {
    if (lg.status === 'ACTIVE_DRAFT' && lg.current_turn_user_id === myUserId.value) return 0
    if (getParticipantStatus(lg) === 'INVITED') return 1
    if (lg.status === 'ACTIVE_DRAFT') return 2
    if (lg.status === 'LEAGUE_ACTIVE') return 3
    if (lg.status === 'DRAFT_FINISHED') return 4
    return 5
  }
  return [...draftLeagues.value].sort((a, b) => rankWeight(a) - rankWeight(b)).slice(0, 4)
})

const hasEsmTeam = computed(() => Boolean(esmStatus.value?.connected && esmStatus.value?.my_team))
const esmTeam = computed(() => esmStatus.value?.my_team || null)
const esmStarters = computed(() => esmTeam.value?.starters || [])
const esmDisplayValue = computed(() => {
  if (!esmTeam.value) return null
  return esmTeam.value.squad_value ?? esmTeam.value.value ?? null
})

const hydrateActiveLeagueStandings = async (leagues: DraftLeagueSummary[]) => {
  const activeIds = leagues
    .filter((lg) => lg.status === 'LEAGUE_ACTIVE' && (!lg.standings || lg.standings.length === 0))
    .slice(0, 3)
    .map((lg) => lg.id)

  if (activeIds.length === 0) return

  const details = await Promise.all(
    activeIds.map((id) =>
      api.get<DraftLeagueSummary>(`/draft/leagues/${encodeURIComponent(id)}`).catch(() => null),
    ),
  )

  const byId = new Map<string, DraftLeagueSummary>()
  for (const d of details) {
    if (d && d.id) byId.set(d.id, d)
  }

  draftLeagues.value = draftLeagues.value.map((lg) => byId.get(lg.id) || lg)
}

const loadDashboard = async () => {
  isLoading.value = true
  statsError.value = null

  const [statsRes, draftRes, esmRes] = await Promise.allSettled([
    api.get<DashboardStatsPayload>('/stats/dashboard'),
    api.get<{ leagues?: DraftLeagueSummary[] }>('/draft/leagues'),
    api.get<EsmStatusPayload>('/esm/status'),
  ])

  if (statsRes.status === 'fulfilled') {
    dashboardData.value = statsRes.value
  } else {
    statsError.value = statsRes.reason?.message || t('dash.errLoadStartData')
  }

  if (draftRes.status === 'fulfilled') {
    draftLeagues.value = draftRes.value?.leagues || []
    hydrateActiveLeagueStandings(draftLeagues.value)
  }

  if (esmRes.status === 'fulfilled') {
    esmStatus.value = esmRes.value
  }

  isLoading.value = false
}

onMounted(loadDashboard)
</script>

<template>
  <div class="dashboard-page">
    <SkiLoader v-if="isLoading">{{ t('dash.loading') }}</SkiLoader>

    <template v-else>
      <!-- POWITANIE -->
      <header class="dash-welcome">
        <div class="dash-welcome-copy">
          <span v-if="todayLabel" class="dash-date-eyebrow">{{ todayLabel }}</span>
          <h1>{{ t('dash.greeting') }}, {{ firstName }}! 🎿</h1>
          <p class="dash-subtitle">{{ t('dash.subtitle') }}</p>
        </div>
        <div class="dash-quick-links">
          <RouterLink to="/athletes" class="quick-chip">{{ t('nav.athletes') }}</RouterLink>
          <RouterLink to="/stats" class="quick-chip">📊 {{ t('dash.statsChip') }}</RouterLink>
          <RouterLink v-if="auth.isPro.value" to="/predictions" class="quick-chip quick-chip-pro">
            {{ t('nav.predictions') }}
          </RouterLink>
        </div>
      </header>

      <div v-if="statsError" class="card dash-error-banner">
        <span>⚠️ {{ statsError }}</span>
        <button type="button" class="btn-retry-sm" @click="loadDashboard">{{ t('common.refresh') }}</button>
      </div>

      <!-- 1. NAJBLIŻSZE ZAWODY -->
      <section class="dash-panel next-comp-panel" :aria-label="t('dash.ariaNextComp')">
        <div class="panel-top-row">
          <span class="eyebrow-pill">{{ t('dash.nextCompEyebrow') }}</span>
          <span v-if="nextComp.found && nextComp.hill_size" class="hs-pill">
            HS {{ nextComp.hill_size }}
            <template v-if="hillTypeLabel(nextComp.hill_type)"> · {{ hillTypeLabel(nextComp.hill_type) }}</template>
          </span>
        </div>

        <div v-if="nextComp.found" class="next-comp-body">
          <div class="next-comp-main">
            <div class="next-comp-place-row">
              <CountryFlag :code="nextComp.country_code || nextComp.country" size="lg" />
              <div>
                <h2 class="next-comp-title">{{ nextComp.place }}</h2>
                <p class="next-comp-sub">
                  {{ nextComp.session_title || t('dash.mainComp') }}
                  <span v-if="nextComp.competition_type"> ({{ nextComp.competition_type }})</span>
                </p>
              </div>
            </div>

            <div class="next-comp-schedule">
              <div class="schedule-chip">
                <span class="schedule-label">{{ t('dash.mainComp') }}</span>
                <strong class="schedule-val">
                  {{ formatShortDate(nextComp.date) }}
                  <span v-if="nextComp.time"> · {{ nextComp.time }}</span>
                </strong>
              </div>
              <div v-if="nextComp.qualification?.date" class="schedule-chip schedule-chip-muted">
                <span class="schedule-label">{{ t('dash.qualifications') }}</span>
                <strong class="schedule-val">
                  {{ formatShortDate(nextComp.qualification.date) }}
                  <span v-if="nextComp.qualification.time"> · {{ nextComp.qualification.time }}</span>
                </strong>
              </div>
            </div>
          </div>

          <div class="next-comp-actions">
            <RouterLink v-if="auth.isPro.value" to="/predictions" class="btn-dash-primary">
              {{ t('dash.ctaPredictions') }}
            </RouterLink>
            <RouterLink v-else to="/profile?tab=plan" class="btn-dash-pro-teaser">
              {{ t('dash.ctaProTeaser') }}
            </RouterLink>
            <RouterLink to="/sessions?tab=calendar" class="btn-dash-secondary">
              {{ t('dash.ctaCalendar') }}
            </RouterLink>
          </div>
        </div>

        <div v-else class="next-comp-empty">
          <p>{{ t('dash.noUpcoming') }}</p>
          <RouterLink to="/sessions?tab=calendar" class="btn-dash-secondary">{{ t('dash.ctaCalendar') }}</RouterLink>
        </div>
      </section>

      <!-- 2. TWOJE LIGI DRAFTA & AKCJA -->
      <section class="card dash-panel" :aria-label="t('dash.ariaDraftLeagues')">
        <div class="panel-header">
          <div>
            <h2>{{ t('dash.draftTitle') }}</h2>
            <p class="panel-desc">{{ t('dash.draftDesc') }}</p>
          </div>
          <RouterLink to="/draft" class="panel-link">{{ t('dash.openDraft') }}</RouterLink>
        </div>

        <div v-if="draftActionAlerts.length > 0" class="draft-alerts-stack">
          <div
            v-for="alert in draftActionAlerts"
            :key="`${alert.leagueId}-${alert.kind}`"
            class="draft-alert-bar"
            :class="`alert-${alert.kind}`"
          >
            <div class="draft-alert-copy">
              <span class="alert-badge">{{ alert.badge }}</span>
              <span class="alert-msg">{{ alert.message }}</span>
            </div>
            <RouterLink :to="`/draft/league/${alert.leagueId}`" class="btn-alert-cta">{{ alert.ctaLabel }} →</RouterLink>
          </div>
        </div>

        <div v-if="displayedDraftLeagues.length > 0" class="draft-leagues-grid">
          <RouterLink
            v-for="lg in displayedDraftLeagues"
            :key="lg.id"
            :to="`/draft/league/${lg.id}`"
            class="draft-league-tile"
          >
            <div class="tile-top">
              <strong class="tile-title">{{ lg.name }}</strong>
              <span class="status-pill" :class="draftStatusInfo(lg.status).cls">
                {{ draftStatusInfo(lg.status).label }}
              </span>
            </div>

            <div class="tile-meta">
              <span>{{ lg.category_code || 'WC' }} · {{ formatSeasonLabel(lg.season) }}</span>
              <span>{{ (lg.participants || []).filter((p) => p.status === 'ACCEPTED').length }} {{ t('common.player5') }}</span>
            </div>

            <div class="tile-bottom">
              <template v-if="lg.status === 'ACTIVE_DRAFT'">
                <span v-if="lg.current_turn_user_id === myUserId" class="turn-highlight">
                  {{ t('dash.yourTurnRound', { round: lg.current_round || 1 }) }}
                </span>
                <span v-else class="tile-muted">
                  {{ t('dash.draftProgress', { current: lg.current_pick_index ?? 0, total: lg.total_picks ?? '?' }) }}
                </span>
              </template>
              <template v-else-if="getMyDraftStanding(lg)">
                <span class="standing-chip">
                  {{ t('dash.standingPos') }} <strong>#{{ getMyDraftStanding(lg)?.rank }}</strong>
                </span>
                <span class="points-chip">
                  <strong>{{ formatPoints(getMyDraftStanding(lg)?.total_points) }}</strong> {{ t('common.pts') }}
                </span>
              </template>
              <template v-else-if="getParticipantStatus(lg) === 'INVITED'">
                <span class="invite-highlight">{{ t('dash.awaitingAccept') }}</span>
              </template>
              <template v-else>
                <span class="tile-muted">{{ t('dash.clickToOpen') }}</span>
              </template>
            </div>
          </RouterLink>
        </div>

        <div v-else class="dash-empty-box">
          <p>{{ t('dash.emptyDraft') }}</p>
          <RouterLink to="/draft" class="btn-dash-primary-sm">{{ t('dash.newDraft') }}</RouterLink>
        </div>
      </section>

      <!-- 3. NAJNOWSZE WYNIKI + TOP 5 KLASYFIKACJI GENERALNEJ -->
      <section class="dash-two-col" :aria-label="t('dash.ariaRecentAndStandings')">
        <!-- LEWA: NAJNOWSZE WYNIKI -->
        <div class="card dash-panel">
          <div class="panel-header">
            <div>
              <h2>{{ t('dash.recentTitle') }}</h2>
              <p class="panel-desc">{{ t('dash.recentDesc') }}</p>
            </div>
            <RouterLink to="/sessions" class="panel-link">{{ t('dash.allSessions') }}</RouterLink>
          </div>

          <div v-if="latestSessions.length > 0" class="recent-sessions-list">
            <RouterLink
              v-for="s in latestSessions"
              :key="s.id"
              :to="`/sessions/${s.id}`"
              class="recent-session-card"
            >
              <div class="rs-header">
                <div class="rs-place-wrap">
                  <CountryFlag :code="s.event_country" size="sm" />
                  <span class="rs-place">{{ s.event_place || s.title }}</span>
                  <span v-if="s.hillSize" class="rs-hs">HS{{ s.hillSize }}</span>
                </div>
                <span class="rs-date">{{ formatShortDate(s.date) }}</span>
              </div>

              <div class="rs-tags">
                <span class="rs-badge" :class="s.session_type === 'COMPETITION' ? 'rs-badge-comp' : ''">
                  {{ sessionTypeLabel(s.session_type) }}
                </span>
                <span v-if="s.category_code" class="rs-cat">{{ s.category_code }}</span>
                <span v-if="s.title && s.event_place && s.title !== s.event_place" class="rs-sub-title">
                  {{ s.title }}
                </span>
              </div>

              <div v-if="s.podium && s.podium.length > 0" class="rs-podium">
                <div v-for="p in s.podium" :key="`${s.id}-${p.rank}`" class="rs-podium-row">
                  <span class="medal-badge" :class="`medal-${p.rank}`">
                    {{ p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : '🥉' }}
                  </span>
                  <CountryFlag :code="p.country" size="xs" />
                  <span class="podium-name">{{ p.name }}</span>
                  <span class="podium-pts">{{ formatPoints(p.total_points) }} {{ t('common.pts') }}</span>
                </div>
              </div>
            </RouterLink>
          </div>
          <div v-else class="dash-empty-box">
            <p>{{ t('dash.noSessions') }}</p>
          </div>
        </div>

        <!-- PRAWA: TOP 5 KLASYFIKACJI GENERALNEJ -->
        <div class="card dash-panel">
          <div class="panel-header">
            <div>
              <h2>{{ t('dash.top5Title') }}</h2>
              <p class="panel-desc">
                {{ t('common.season') }} {{ formatSeasonLabel(standingsSeason) }}
                <template v-if="standingsTotalEvents > 0"> · {{ t('dash.afterComps', { count: standingsTotalEvents }) }}</template>
              </p>
            </div>
            <RouterLink to="/standings" class="panel-link">{{ t('dash.fullStandings') }}</RouterLink>
          </div>

          <div v-if="topStandings.length > 0" class="top5-list">
            <div v-for="a in topStandings" :key="`${a.rank}-${a.fis_code}`" class="top5-row">
              <div class="top5-left">
                <span class="rank-circle" :class="a.rank <= 3 ? `rank-top-${a.rank}` : ''">
                  {{ a.rank }}
                </span>
                <CountryFlag :code="a.country" size="sm" />
                <div class="top5-name-col">
                  <RouterLink
                    v-if="a.fis_code"
                    :to="`/athletes/${a.fis_code}`"
                    class="top5-athlete-link"
                  >
                    {{ a.name }}
                  </RouterLink>
                  <span v-else class="top5-athlete-link">{{ a.name }}</span>
                  <span class="top5-meta">{{ a.country }} · {{ formatStartsLabel(a.starts) }}</span>
                </div>
              </div>
              <div class="top5-points">
                <strong>{{ formatPoints(a.total_points) }}</strong>
                <span>{{ t('common.pts') }}</span>
              </div>
            </div>
          </div>
          <div v-else class="dash-empty-box">
            <p>{{ t('dash.noStandings') }}</p>
          </div>
        </div>
      </section>

      <!-- 4. MÓJ SKŁAD ESM (JEŚLI PODŁĄCZONY) -->
      <section v-if="hasEsmTeam && esmTeam" class="card dash-panel esm-panel" :aria-label="t('dash.ariaEsmLineup')">
        <div class="panel-header">
          <div>
            <h2>{{ t('dash.esmPanelTitle') }} {{ esmTeam.team_name || t('dash.esmTeamFallback') }}</h2>
            <p class="panel-desc">{{ t('dash.esmDesc') }}</p>
          </div>
          <div class="esm-header-actions">
            <RouterLink
              v-if="latestCompId"
              :to="`/sessions/${latestCompId}`"
              class="btn-dash-secondary-sm"
            >
              {{ t('dash.esmCompareLabel') }}
            </RouterLink>
            <RouterLink to="/profile?tab=esm" class="panel-link">{{ t('dash.manage') }}</RouterLink>
          </div>
        </div>

        <div class="esm-kpi-row">
          <div class="esm-kpi-box">
            <span class="esm-kpi-label">{{ t('dash.esmValue') }}</span>
            <strong class="esm-kpi-val">{{ formatMln(esmDisplayValue) }}</strong>
          </div>
          <div class="esm-kpi-box">
            <span class="esm-kpi-label">{{ t('dash.esmPoints') }}</span>
            <strong class="esm-kpi-val">{{ formatPoints(esmTeam.total_points) }} pkt</strong>
          </div>
          <div class="esm-kpi-box">
            <span class="esm-kpi-label">{{ t('dash.esmStarters') }}</span>
            <strong class="esm-kpi-val">{{ esmStarters.length }} {{ t('dash.jumpersCount') }}</strong>
          </div>
        </div>

        <div v-if="esmStarters.length > 0" class="esm-starters-grid">
          <component
            :is="p.fis_code ? RouterLink : 'div'"
            v-for="(p, idx) in esmStarters"
            :key="`${p.fis_code || getStarterName(p)}-${idx}`"
            :to="p.fis_code ? `/athletes/${p.fis_code}` : undefined"
            class="esm-player-chip"
          >
            <CountryFlag :code="p.country" :src="p.flag" size="xs" />
            <span class="esm-player-name">{{ getStarterName(p) }}</span>
            <span v-if="p.price !== null && p.price !== undefined" class="esm-player-price">
              {{ Number(p.price).toFixed(2).replace(/\.?0+$/, '') }}M
            </span>
          </component>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  width: 100%;
}

.dash-welcome {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.dash-date-eyebrow {
  display: block;
  font-size: var(--text-xs, 0.72rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #0284c7;
  margin-bottom: 0.2rem;
}

.dash-welcome h1 {
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.2;
}

.dash-subtitle {
  margin: 0.25rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.dash-quick-links {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.quick-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.78rem;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.16s ease;
}

.quick-chip:hover {
  border-color: #0284c7;
  color: #0284c7;
  background: #f0f9ff;
}

.quick-chip-pro {
  border-color: #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
}

.dash-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
  font-size: 0.88rem;
}

.btn-retry-sm {
  border: 1px solid #fca5a5;
  background: #ffffff;
  color: #991b1b;
  border-radius: 7px;
  padding: 0.35rem 0.7rem;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
}

.dash-panel {
  padding: 1.15rem 1.25rem;
}

/* 1. NAJBLIŻSZE ZAWODY */
.next-comp-panel {
  background: linear-gradient(135deg, #0f172a 0%, #0c4a6e 58%, #0284c7 100%);
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 10px 24px -12px rgba(2, 132, 199, 0.55);
  border: 1px solid rgba(186, 230, 253, 0.25);
}

.panel-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}

.eyebrow-pill {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #bae6fd;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(186, 230, 253, 0.25);
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
}

.hs-pill {
  font-size: 0.75rem;
  font-weight: 700;
  color: #e0f2fe;
  background: rgba(15, 23, 42, 0.45);
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.next-comp-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  flex-wrap: wrap;
}

.next-comp-main {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  flex: 1 1 380px;
}

.next-comp-place-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.next-comp-title {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.15;
}

.next-comp-sub {
  margin: 0.2rem 0 0;
  font-size: 0.86rem;
  color: #bae6fd;
}

.next-comp-schedule {
  display: flex;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.schedule-chip {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.45rem 0.75rem;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.schedule-chip-muted {
  background: rgba(15, 23, 42, 0.35);
}

.schedule-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #bae6fd;
  font-weight: 600;
}

.schedule-val {
  font-size: 0.88rem;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.next-comp-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  align-items: center;
}

.btn-dash-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.62rem 1rem;
  border-radius: 9px;
  background: #ffffff;
  color: #0369a1;
  font-weight: 800;
  font-size: 0.86rem;
  text-decoration: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  transition: transform 0.15s ease, background 0.15s ease;
}

.btn-dash-primary:hover {
  transform: translateY(-1px);
  background: #f0f9ff;
}

.btn-dash-pro-teaser {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.58rem 0.92rem;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: #ffffff;
  font-weight: 700;
  font-size: 0.84rem;
  text-decoration: none;
}

.btn-dash-secondary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.58rem 0.92rem;
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(186, 230, 253, 0.32);
  color: #e0f2fe;
  font-weight: 600;
  font-size: 0.84rem;
  text-decoration: none;
}

.btn-dash-secondary:hover {
  background: rgba(15, 23, 42, 0.6);
}

.next-comp-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  color: #e0f2fe;
}

.next-comp-empty p {
  margin: 0;
  font-size: 0.9rem;
}

/* SHARED PANEL HEADER */
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.9rem;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 800;
  color: #0f172a;
}

.panel-desc {
  margin: 0.18rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}

.panel-link {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0284c7;
  text-decoration: none;
  white-space: nowrap;
}

.panel-link:hover {
  text-decoration: underline;
}

/* 2. DRAFT ALERTS & LEAGUES */
.draft-alerts-stack {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-bottom: 0.9rem;
}

.draft-alert-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid #fde68a;
  background: #fffbeb;
}

.draft-alert-bar.alert-turn {
  border-color: #f59e0b;
  background: linear-gradient(90deg, #fffbeb 0%, #fef3c7 100%);
}

.draft-alert-bar.alert-invite {
  border-color: #93c5fd;
  background: #eff6ff;
}

.draft-alert-bar.alert-launch {
  border-color: #6ee7b7;
  background: #ecfdf5;
}

.draft-alert-copy {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.alert-badge {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: #0f172a;
}

.alert-msg {
  font-size: 0.84rem;
  font-weight: 600;
  color: #1e293b;
}

.btn-alert-cta {
  padding: 0.38rem 0.75rem;
  border-radius: 7px;
  background: #0284c7;
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.draft-leagues-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(235px, 1fr));
  gap: 0.75rem;
}

.draft-league-tile {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem;
  border-radius: 11px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.draft-league-tile:hover {
  border-color: #38bdf8;
  background: #ffffff;
  box-shadow: 0 6px 14px -8px rgba(2, 132, 199, 0.3);
  transform: translateY(-1px);
}

.tile-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tile-title {
  font-size: 0.92rem;
  color: #0f172a;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 0.16rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}

.pill-amber {
  background: #fef3c7;
  color: #92400e;
}

.pill-green {
  background: #dcfce7;
  color: #166534;
}

.pill-blue {
  background: #dbeafe;
  color: #1e40af;
}

.pill-slate {
  background: #e2e8f0;
  color: #475569;
}

.tile-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
  color: #64748b;
}

.tile-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.15rem;
  padding-top: 0.45rem;
  border-top: 1px dashed #e2e8f0;
  font-size: 0.8rem;
}

.turn-highlight {
  color: #b45309;
  font-weight: 800;
}

.invite-highlight {
  color: #1d4ed8;
  font-weight: 700;
}

.standing-chip {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.points-chip {
  color: #0284c7;
  font-variant-numeric: tabular-nums;
}

.tile-muted {
  color: #64748b;
  font-size: 0.78rem;
}

.dash-empty-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border-radius: 10px;
  border: 1px dashed #cbd5e1;
  background: #f8fafc;
}

.dash-empty-box p {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
}

.btn-dash-primary-sm {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  background: #0284c7;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
}

/* 3. DWUKOLUMNOWA SEKCJA: WYNIKI + TOP 5 */
.dash-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 1.15rem;
  align-items: start;
}

.recent-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.recent-session-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.8rem 0.9rem;
  border-radius: 11px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.recent-session-card:hover {
  border-color: #38bdf8;
  background: #ffffff;
}

.rs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.rs-place-wrap {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.rs-place {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.rs-hs {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  background: #e2e8f0;
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  font-variant-numeric: tabular-nums;
}

.rs-date {
  font-size: 0.76rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rs-tags {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.rs-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
}

.rs-badge-comp {
  background: #e0f2fe;
  color: #0369a1;
}

.rs-cat {
  font-size: 0.68rem;
  font-weight: 700;
  color: #64748b;
}

.rs-sub-title {
  font-size: 0.74rem;
  color: #64748b;
}

.rs-podium {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.4rem;
  border-top: 1px dashed #e2e8f0;
}

.rs-podium-row {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  font-size: 0.8rem;
}

.medal-badge {
  width: 20px;
  text-align: center;
  font-size: 0.85rem;
}

.podium-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: #1e293b;
}

.podium-pts {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0284c7;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* TOP 5 KLASYFIKACJA */
.top5-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.top5-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.62rem 0.75rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.top5-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}

.rank-circle {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.78rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.rank-top-1 {
  background: #fef08a;
  color: #854d0e;
}

.rank-top-2 {
  background: #e2e8f0;
  color: #1e293b;
}

.rank-top-3 {
  background: #fed7aa;
  color: #9a3412;
}

.top5-name-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.top5-athlete-link {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top5-athlete-link:hover {
  color: #0284c7;
  text-decoration: underline;
}

.top5-meta {
  font-size: 0.72rem;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.top5-points {
  display: flex;
  align-items: baseline;
  gap: 0.22rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.top5-points strong {
  font-size: 0.96rem;
  color: #0284c7;
  font-weight: 800;
}

.top5-points span {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 600;
}

/* 4. MÓJ SKŁAD ESM */
.esm-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn-dash-secondary-sm {
  padding: 0.38rem 0.72rem;
  border-radius: 8px;
  border: 1px solid #bae6fd;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.esm-kpi-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

.esm-kpi-box {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.esm-kpi-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
}

.esm-kpi-val {
  font-size: 0.96rem;
  font-weight: 800;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
}

.esm-starters-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.esm-player-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.42rem 0.68rem;
  border-radius: 9px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #0f172a;
  text-decoration: none;
  font-size: 0.82rem;
  transition: border-color 0.15s ease, background 0.15s ease;
}

a.esm-player-chip:hover {
  border-color: #0284c7;
  background: #f0f9ff;
}

.esm-player-name {
  font-weight: 600;
}

.esm-player-price {
  font-size: 0.73rem;
  font-weight: 700;
  color: #0369a1;
  background: #e0f2fe;
  padding: 0.08rem 0.38rem;
  border-radius: 5px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .dash-two-col {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dashboard-page {
    gap: 0.85rem;
  }

  .dash-welcome h1 {
    font-size: 1.25rem;
  }

  .dash-subtitle {
    font-size: 0.8rem;
  }

  .quick-chip {
    font-size: 0.75rem;
    padding: 0.34rem 0.62rem;
  }

  .dash-panel {
    padding: 0.9rem 0.95rem;
  }

  .next-comp-title {
    font-size: 1.18rem;
  }

  .next-comp-sub {
    font-size: 0.78rem;
  }

  .schedule-label {
    font-size: 0.64rem;
  }

  .schedule-val {
    font-size: 0.8rem;
  }

  .btn-dash-primary,
  .btn-dash-secondary,
  .btn-dash-pro-teaser {
    font-size: 0.78rem;
    padding: 0.5rem 0.78rem;
  }

  .panel-header h2 {
    font-size: 0.96rem;
  }

  .panel-desc,
  .panel-link {
    font-size: 0.74rem;
  }

  .draft-leagues-grid {
    grid-template-columns: 1fr;
  }

  .tile-title {
    font-size: 0.86rem;
  }

  .tile-meta,
  .tile-bottom {
    font-size: 0.74rem;
  }

  .rs-place {
    font-size: 0.84rem;
  }

  .rs-podium-row {
    font-size: 0.76rem;
  }

  .top5-athlete-link {
    font-size: 0.82rem;
  }

  .top5-meta {
    font-size: 0.68rem;
  }

  .top5-points strong {
    font-size: 0.88rem;
  }

  .esm-kpi-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .esm-kpi-box {
    padding: 0.5rem 0.55rem;
  }

  .esm-kpi-label {
    font-size: 0.66rem;
  }

  .esm-kpi-val {
    font-size: 0.82rem;
  }

  .esm-player-chip {
    font-size: 0.76rem;
    padding: 0.34rem 0.56rem;
  }
}
</style>
