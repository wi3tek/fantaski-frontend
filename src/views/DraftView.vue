<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useNotifications } from '@/stores/notifications'
import { useI18n } from '@/i18n'
import { PICKS_COUNT_OPTIONS, SEASON_OPTIONS, useDraftUiHelpers } from '@/utils/draftUi'
import SkiLoader from '@/components/SkiLoader.vue'

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const { t, formatJumpersCount } = useI18n()
const { fetchNotifications, lastDraftEvent } = useNotifications()
const {
  tournamentOptions,
  categoryLabels,
  statusLabels,
  formatCutoffOptionLabel,
  getSelectedCutoffCompLabel,
} = useDraftUiHelpers()

const myUserId = computed(() => auth.user.value?.id || '')

const isLoadingList = ref(true)
const isBusy = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const hubFilter = ref<'all' | 'active' | 'lobby' | 'invites'>('all')

const eligibility = ref<{ eligible: boolean; reason: string; active_leagues_count: number; role: string }>({
  eligible: true,
  reason: '',
  active_leagues_count: 0,
  role: 'USER',
})
const leagues = ref<any[]>([])

// Modale tworzenia i dołączania (odseparowane od listy lig)
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const joinCodeInput = ref('')
const createForm = ref({
  name: '',
  category_code: 'WC',
  season: '2027',
  picks_per_player: 6,
  order_mode: 'CUSTOM',
  scoring_from_date: '',
  scoring_to_date: '',
})
const createCutoffPreview = ref<{
  finished_competitions: any[]
  upcoming_competitions: any[]
  competition_options: any[]
  recommended_scoring_from_date: string
  recommended_scoring_to_date: string
}>({
  finished_competitions: [],
  upcoming_competitions: [],
  competition_options: [],
  recommended_scoring_from_date: '',
  recommended_scoring_to_date: '',
})
const createShowCustomDates = ref(false)

const getParticipantStatus = (lg: any) =>
  (lg.participants || []).find((p: any) => p.user_id === myUserId.value)?.status || ''

const acceptedCount = (lg: any) =>
  (lg.participants || []).filter((p: any) => p.status === 'ACCEPTED').length

const pendingInvites = computed(() =>
  leagues.value.filter((lg) => lg.status === 'LOBBY' && getParticipantStatus(lg) === 'INVITED')
)

const activeLeagues = computed(() =>
  leagues.value.filter((lg) => lg.status !== 'LOBBY' && getParticipantStatus(lg) === 'ACCEPTED')
)

const lobbyLeagues = computed(() =>
  leagues.value.filter((lg) => lg.status === 'LOBBY' && getParticipantStatus(lg) === 'ACCEPTED')
)

const filteredLeagues = computed(() => {
  if (hubFilter.value === 'invites') return pendingInvites.value
  if (hubFilter.value === 'active') return activeLeagues.value
  if (hubFilter.value === 'lobby') return lobbyLeagues.value
  return leagues.value
})

const myStandingRow = (lg: any) =>
  (lg.standings || []).find((r: any) => r.user_id === myUserId.value) || null

const currentTurnPlayerName = (lg: any) => {
  if (!lg?.current_turn_user_id) return ''
  const p = (lg.participants || []).find((x: any) => x.user_id === lg.current_turn_user_id)
  return p?.name || t('draft.playerFallback')
}

const loadCutoffPreview = async (season: string, categoryCode: string) => {
  try {
    const data = await api.get<any>(
      `/draft/cutoff-preview?season=${encodeURIComponent(season)}&category_code=${encodeURIComponent(categoryCode)}`
    )
    createCutoffPreview.value = {
      finished_competitions: data.finished_competitions || [],
      upcoming_competitions: data.upcoming_competitions || [],
      competition_options: data.competition_options || [],
      recommended_scoring_from_date: data.recommended_scoring_from_date || '',
      recommended_scoring_to_date: data.recommended_scoring_to_date || '',
    }
    createForm.value.scoring_from_date = createCutoffPreview.value.recommended_scoring_from_date
    createForm.value.scoring_to_date = createCutoffPreview.value.recommended_scoring_to_date
  } catch {
    // ignore
  }
}

watch(
  () => [createForm.value.season, createForm.value.category_code],
  ([s, c]) => {
    if (showCreateModal.value && s && c) {
      loadCutoffPreview(String(s), String(c))
    }
  }
)

const onCutoffCompetitionChange = (ev: Event) => {
  const val = (ev.target as HTMLSelectElement).value
  if (val === '__CUSTOM__') {
    createShowCustomDates.value = true
    return
  }
  createForm.value.scoring_from_date = val
}

const openCreateModal = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  showJoinModal.value = false
  showCreateModal.value = true
  await loadCutoffPreview(createForm.value.season, createForm.value.category_code)
}

const openJoinModal = () => {
  errorMsg.value = ''
  successMsg.value = ''
  showCreateModal.value = false
  showJoinModal.value = true
}

const onJoinCodeInput = () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

const hydrateActiveLeagues = async (list: any[]) => {
  const targets = list.filter((lg) => lg.status === 'LEAGUE_ACTIVE' || lg.status === 'COMPLETED')
  if (targets.length === 0) return
  const details = await Promise.all(
    targets.map((lg) => api.get<any>(`/draft/leagues/${encodeURIComponent(lg.id)}`).catch(() => null))
  )
  const byId = new Map<string, any>()
  for (const d of details) {
    if (d?.id) byId.set(d.id, d)
  }
  leagues.value = leagues.value.map((lg) => (byId.has(lg.id) ? byId.get(lg.id) : lg))
}

const fetchLeaguesList = async (silent = false) => {
  if (!silent) isLoadingList.value = true
  try {
    const data = await api.get<any>('/draft/leagues')
    eligibility.value = data.eligibility || eligibility.value
    leagues.value = data.leagues || []
    await hydrateActiveLeagues(leagues.value)
  } catch (e: any) {
    if (!silent) errorMsg.value = e.message || t('draft.errLoadLeagues')
  } finally {
    if (!silent) isLoadingList.value = false
  }
}

const createLeague = async () => {
  errorMsg.value = ''
  if (!createForm.value.name.trim()) {
    errorMsg.value = t('draft.errLeagueName')
    return
  }
  isBusy.value = true
  try {
    const created = await api.post<any>('/draft/leagues', {
      name: createForm.value.name.trim(),
      category_code: createForm.value.category_code,
      season: createForm.value.season,
      picks_per_player: Number(createForm.value.picks_per_player || 6),
      order_mode: createForm.value.order_mode,
      scoring_from_date: createForm.value.scoring_from_date || '',
      scoring_to_date: createForm.value.scoring_to_date || '',
    })
    showCreateModal.value = false
    createForm.value.name = ''
    await fetchNotifications()
    router.push(`/draft/league/${created.id}`)
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errCreate')
  } finally {
    isBusy.value = false
  }
}

const joinByCode = async () => {
  errorMsg.value = ''
  const code = joinCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 6) {
    errorMsg.value = t('draft.errBadCode')
    return
  }
  isBusy.value = true
  try {
    const joined = await api.post<any>('/draft/leagues/join-by-code', { code })
    showJoinModal.value = false
    joinCodeInput.value = ''
    await fetchNotifications()
    router.push(`/draft/league/${joined.id}`)
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errJoin')
  } finally {
    isBusy.value = false
  }
}

const respondInviteFromHub = async (leagueId: string, action: 'accept' | 'decline') => {
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    await api.post<any>(`/draft/leagues/${encodeURIComponent(leagueId)}/respond`, { action })
    await fetchNotifications()
    if (action === 'accept') {
      router.push(`/draft/league/${leagueId}`)
    } else {
      successMsg.value = t('draft.okDeclined')
      await fetchLeaguesList(true)
    }
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errRespond')
  } finally {
    isBusy.value = false
  }
}

// Pełna kompatybilność wsteczna ze starymi linkami /draft?league=<id>
const redirectIfLegacyLeagueQuery = () => {
  const qLid = route.query.league
  if (typeof qLid === 'string' && qLid.trim()) {
    router.replace(`/draft/league/${encodeURIComponent(qLid.trim())}`)
    return true
  }
  return false
}

watch(
  () => route.query.league,
  () => {
    redirectIfLegacyLeagueQuery()
  }
)

watch(lastDraftEvent, (ev) => {
  if (!ev) return
  fetchLeaguesList(true)
})

onMounted(async () => {
  if (redirectIfLegacyLeagueQuery()) return
  await fetchLeaguesList(false)
})
</script>

<template>
  <div class="draft-hub-page">
    <div class="draft-hub-container">
      <!-- HERO HUB -->
      <header class="hub-hero">
        <div class="hub-hero-copy">
          <div class="hub-eyebrow">FantaSKI DRAFT</div>
          <h1>{{ t('nav.draft') }} {{ t('draft.heroSuffix') }}</h1>
          <p class="hero-sub">{{ t('draft.subtitle') }}</p>
        </div>
        <div class="hub-hero-actions">
          <span class="plan-pill">
            {{ auth.isPro.value ? t('draft.proPill') : t('draft.freePill', { count: eligibility.active_leagues_count }) }}
          </span>
          <button
            type="button"
            class="btn-hero-join"
            :disabled="!eligibility.eligible"
            :title="!eligibility.eligible ? eligibility.reason : t('draft.joinTooltip')"
            @click="openJoinModal"
          >
            {{ t('draft.joinBtn') }}
          </button>
          <button
            type="button"
            class="btn-hero-create"
            :disabled="!eligibility.eligible"
            :title="!eligibility.eligible ? eligibility.reason : t('draft.createTooltip')"
            @click="openCreateModal"
          >
            {{ t('draft.createBtn') }}
          </button>
        </div>
      </header>

      <div v-if="!eligibility.eligible" class="alert-box warn"><span>⚠️</span> {{ eligibility.reason }}</div>
      <div v-if="errorMsg" class="alert-box error"><span>❌</span> {{ errorMsg }}</div>
      <div v-if="successMsg" class="alert-box success"><span>✅</span> {{ successMsg }}</div>

      <!-- SEKCJA ZAPROSZEŃ (WYSUNIĘTA NA PIERWSZY PLAN) -->
      <section v-if="pendingInvites.length > 0" class="invites-spotlight">
        <div class="section-heading">
          <h2>{{ t('draft.invitesSectionTitle', { count: pendingInvites.length }) }}</h2>
        </div>
        <div class="invites-cards-grid">
          <div v-for="inv in pendingInvites" :key="inv.id" class="invite-spotlight-card">
            <div class="inv-card-info">
              <div class="inv-badges">
                <span class="cat-chip">{{ categoryLabels[inv.category_code] || inv.category_code }}</span>
                <span class="season-chip">{{ inv.season }}</span>
              </div>
              <h3>{{ inv.name }}</h3>
              <p>
                {{ t('draft.creatorLabel') }} <strong>{{ inv.creator_name }}</strong>
                • {{ formatJumpersCount(inv.picks_per_player) }}
                • {{ t('draft.fromLabel') }} <strong>{{ inv.scoring_from_date || t('draft.allFeminine') }}</strong>
              </p>
            </div>
            <div class="inv-card-actions">
              <button
                type="button"
                class="btn-accept"
                :disabled="isBusy"
                @click="respondInviteFromHub(inv.id, 'accept')"
              >
                {{ t('draft.acceptInvite') }}
              </button>
              <button
                type="button"
                class="btn-decline"
                :disabled="isBusy"
                @click="respondInviteFromHub(inv.id, 'decline')"
              >
                {{ t('draft.declineInvite') }}
              </button>
              <RouterLink :to="`/draft/league/${inv.id}`" class="btn-outline-dark">
                {{ t('draft.openRoomBtn') }}
              </RouterLink>
            </div>
          </div>
        </div>
      </section>

      <SkiLoader v-if="isLoadingList" :text="t('draft.loadingLeagues')" />

      <!-- TWOJE LIGI DRAFTA -->
      <section v-else class="hub-leagues-section">
        <div class="hub-bar">
          <h2>{{ t('draft.myLeaguesCount', { count: leagues.length }) }}</h2>
          <div v-if="leagues.length > 0" class="hub-filter-pills">
            <button
              type="button"
              class="hub-pill"
              :class="{ active: hubFilter === 'all' }"
              @click="hubFilter = 'all'"
            >
              {{ t('draft.hubFilterAll', { count: leagues.length }) }}
            </button>
            <button
              type="button"
              class="hub-pill"
              :class="{ active: hubFilter === 'active' }"
              @click="hubFilter = 'active'"
            >
              {{ t('draft.hubFilterActive', { count: activeLeagues.length }) }}
            </button>
            <button
              type="button"
              class="hub-pill"
              :class="{ active: hubFilter === 'lobby' }"
              @click="hubFilter = 'lobby'"
            >
              {{ t('draft.hubFilterLobby', { count: lobbyLeagues.length }) }}
            </button>
            <button
              v-if="pendingInvites.length > 0"
              type="button"
              class="hub-pill pill-warn"
              :class="{ active: hubFilter === 'invites' }"
              @click="hubFilter = 'invites'"
            >
              {{ t('draft.hubFilterInvites', { count: pendingInvites.length }) }}
            </button>
          </div>
        </div>

        <div v-if="leagues.length === 0" class="hub-empty-card">
          <div class="hub-empty-icon">🏆</div>
          <h3>{{ t('draft.noLeagues') }}</h3>
          <p>{{ t('draft.hubNoLeaguesSub') }}</p>
          <div class="hub-empty-actions">
            <button type="button" class="btn-primary" @click="openCreateModal">{{ t('draft.createBtn') }}</button>
            <button type="button" class="btn-secondary" @click="openJoinModal">{{ t('draft.joinBtn') }}</button>
          </div>
        </div>

        <div v-else class="hub-cards-grid">
          <RouterLink
            v-for="lg in filteredLeagues"
            :key="lg.id"
            :to="`/draft/league/${lg.id}`"
            class="league-hub-card"
            :class="{
              'is-my-turn': lg.status === 'ACTIVE_DRAFT' && lg.current_turn_user_id === myUserId,
              'is-invited': lg.status === 'LOBBY' && getParticipantStatus(lg) === 'INVITED',
            }"
          >
            <div class="lhc-top">
              <div class="lhc-chips">
                <span class="cat-chip">{{ lg.category_code }}</span>
                <span class="season-chip">{{ lg.season }}</span>
              </div>
              <span class="status-pill" :class="String(lg.status || '').toLowerCase()">
                <span class="status-dot" :class="String(lg.status || '').toLowerCase()"></span>
                {{ statusLabels[lg.status] || lg.status }}
              </span>
            </div>

            <div class="lhc-title-block">
              <h3>{{ lg.name }}</h3>
              <small>{{ t('draft.hostLabel') }} <strong>{{ lg.creator_name }}</strong></small>
            </div>

            <div class="lhc-stats-strip">
              <div class="lhc-stat">
                <span class="lhc-stat-label">{{ t('draft.ruleSquadSize') }}</span>
                <strong>{{ formatJumpersCount(lg.picks_per_player) }}</strong>
              </div>
              <div class="lhc-stat">
                <span class="lhc-stat-label">{{ t('draft.thPlayer') }}</span>
                <strong>{{ t('draft.hubPlayersCount', { count: acceptedCount(lg) }) }}</strong>
              </div>
              <div class="lhc-stat">
                <span class="lhc-stat-label">{{ t('draft.ruleScoringFrom') }}</span>
                <strong>{{ lg.scoring_from_date || t('draft.allFeminine') }}</strong>
              </div>
            </div>

            <!-- Live status strip wewnątrz karty -->
            <div class="lhc-live-area">
              <template v-if="lg.status === 'LOBBY' && getParticipantStatus(lg) === 'INVITED'">
                <span class="mini-alert invite">{{ t('draft.miniInvite') }}</span>
              </template>
              <template v-else-if="lg.status === 'ACTIVE_DRAFT'">
                <div class="lhc-draft-progress">
                  <div class="lhc-dp-top">
                    <span v-if="lg.current_turn_user_id === myUserId" class="mini-alert turn">{{ t('draft.miniMyTurn') }}</span>
                    <span v-else class="lhc-turn-other">{{ t('draft.hubCurrentTurn') }} <strong>{{ currentTurnPlayerName(lg) }}</strong></span>
                    <small>{{ t('draft.hubDraftProgress', { pick: (lg.current_pick_index ?? 0) + 1, total: lg.total_picks ?? 0, round: lg.current_round || 1 }) }}</small>
                  </div>
                  <div class="lhc-progress-track">
                    <div
                      class="lhc-progress-fill"
                      :style="{ width: `${Math.round(((lg.current_pick_index || 0) / Math.max(1, lg.total_picks || 1)) * 100)}%` }"
                    ></div>
                  </div>
                </div>
              </template>
              <template v-else-if="lg.status === 'DRAFT_FINISHED'">
                <span v-if="lg.creator_id === myUserId" class="mini-alert launch">{{ t('draft.miniLaunch') }}</span>
                <span v-else class="lhc-turn-other">{{ t('draft.statusFinished') }}</span>
              </template>
              <template v-else-if="(lg.status === 'LEAGUE_ACTIVE' || lg.status === 'COMPLETED') && myStandingRow(lg)">
                <div class="lhc-standing-row">
                  <span class="lhc-rank-badge">
                    {{ t('draft.hubYourRank') }}: <strong>#{{ myStandingRow(lg).rank }} / {{ acceptedCount(lg) }}</strong>
                  </span>
                  <span class="lhc-pts-badge">
                    <strong>{{ myStandingRow(lg).total_points }}</strong> {{ t('common.pts') }}
                  </span>
                </div>
              </template>
            </div>

            <div class="lhc-footer">
              <span class="lhc-cta">{{ t('draft.openRoomBtn') }}</span>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>

    <!-- MODAL: DOŁĄCZ DO LIGI PO KODZIE -->
    <div v-if="showJoinModal" class="draft-modal-overlay" @click.self="showJoinModal = false">
      <div class="draft-modal-card compact">
        <div class="dm-header">
          <div>
            <h3>{{ t('draft.joinTitle') }}</h3>
            <p class="subtitle">{{ t('draft.joinSub') }}</p>
          </div>
          <button type="button" class="dm-close" @click="showJoinModal = false" :aria-label="t('common.close')">&times;</button>
        </div>
        <div class="dm-body">
          <div v-if="errorMsg" class="alert-box error mb-2"><span>❌</span> {{ errorMsg }}</div>
          <div class="join-code-row">
            <input
              v-model="joinCodeInput"
              type="text"
              class="form-input invite-code-input"
              maxlength="12"
              :placeholder="t('draft.joinPh')"
              @input="onJoinCodeInput"
              @keyup.enter="joinByCode"
            />
            <button
              type="button"
              class="btn-primary"
              :disabled="isBusy || joinCodeInput.trim().length < 6"
              @click="joinByCode"
            >
              {{ t('draft.joinConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: KREATOR NOWEJ LIGI -->
    <div v-if="showCreateModal" class="draft-modal-overlay" @click.self="showCreateModal = false">
      <div class="draft-modal-card wide">
        <div class="dm-header">
          <div>
            <h3>{{ t('draft.createTitle') }}</h3>
            <p class="subtitle">{{ t('draft.createSub') }}</p>
          </div>
          <button type="button" class="dm-close" @click="showCreateModal = false" :aria-label="t('common.close')">&times;</button>
        </div>
        <div class="dm-body">
          <div v-if="errorMsg" class="alert-box error mb-2"><span>❌</span> {{ errorMsg }}</div>
          <div class="create-grid">
            <div class="form-group">
              <label>{{ t('draft.leagueName') }}</label>
              <input v-model="createForm.name" type="text" class="form-input" :placeholder="t('draft.leagueNamePh')" />
            </div>
            <div class="form-group">
              <label>{{ t('draft.tournament') }}</label>
              <select v-model="createForm.category_code" class="form-select">
                <option v-for="tOpt in tournamentOptions" :key="tOpt.code" :value="tOpt.code">
                  {{ tOpt.label }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('common.season') }}</label>
              <select v-model="createForm.season" class="form-select">
                <option v-for="(yr, idx) in SEASON_OPTIONS" :key="yr" :value="yr">
                  {{ idx === 0 ? t('draft.seasonCurrent', { y: yr }) : t('draft.seasonBack', { y: yr }) }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('draft.picksCount') }}</label>
              <select v-model.number="createForm.picks_per_player" class="form-select">
                <option v-for="cnt in PICKS_COUNT_OPTIONS" :key="cnt" :value="cnt">
                  {{ cnt === 6 ? t('draft.picksDefault', { n: cnt }) : t('draft.picksOpt', { n: cnt }) }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('draft.snakeOrder') }}</label>
              <select v-model="createForm.order_mode" class="form-select">
                <option value="CUSTOM">{{ t('draft.orderCustom') }}</option>
                <option value="RANDOM">{{ t('draft.orderRandom') }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>{{ t('draft.countFrom') }}</label>
              <select
                class="form-select"
                :value="createCutoffPreview.competition_options.some((o) => o.date === createForm.scoring_from_date) ? createForm.scoring_from_date : '__CUSTOM__'"
                @change="onCutoffCompetitionChange($event)"
              >
                <option value="">{{ t('draft.allTournaments') }}</option>
                <option v-for="opt in createCutoffPreview.competition_options" :key="opt.key" :value="opt.date">
                  {{ formatCutoffOptionLabel(opt) }}
                </option>
                <option value="__CUSTOM__">{{ t('draft.customDateOpt') }}</option>
              </select>
            </div>
            <template v-if="createShowCustomDates || !createCutoffPreview.competition_options.length">
              <div class="form-group">
                <label>{{ t('draft.dateFromExact') }}</label>
                <input v-model="createForm.scoring_from_date" type="date" class="form-input" />
              </div>
              <div class="form-group">
                <label>{{ t('draft.dateToExact') }}</label>
                <input v-model="createForm.scoring_to_date" type="date" class="form-input" />
              </div>
            </template>
            <div class="form-group checkbox-group">
              <div class="cutoff-toggle-line">
                <small class="hint-text">
                  {{ t('draft.chosenStart') }} <strong>{{ getSelectedCutoffCompLabel(createForm.scoring_from_date, createCutoffPreview.competition_options) }}</strong>
                  <template v-if="createForm.scoring_to_date"> • {{ t('draft.toPrefix') }} {{ createForm.scoring_to_date }}</template>.
                </small>
                <button type="button" class="btn-link-xs" @click="createShowCustomDates = !createShowCustomDates">
                  {{ createShowCustomDates ? t('draft.hideManualDates') : t('draft.adjustManualDates') }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="dm-footer">
          <button type="button" class="btn-secondary" @click="showCreateModal = false">{{ t('common.cancel') }}</button>
          <button type="button" class="btn-primary" :disabled="isBusy" @click="createLeague">
            {{ isBusy ? t('draft.creating') : t('draft.createSubmit') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draft-hub-page {
  padding: 22px 16px 48px;
  background: #f8fafc;
  min-height: calc(100vh - 70px);
}

.draft-hub-container {
  max-width: 1260px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hub-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  color: #ffffff;
  border-radius: 16px;
  padding: 24px 26px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
}

.hub-eyebrow {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #38bdf8;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.hub-hero h1 {
  margin: 0 0 6px;
  font-size: 1.65rem;
}

.hero-sub {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.92rem;
  max-width: 680px;
}

.hub-hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.plan-pill {
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.btn-hero-join {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 9px;
  padding: 10px 15px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.btn-hero-join:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}

.btn-hero-create {
  background: linear-gradient(135deg, #0284c7, #0ea5e9);
  color: #ffffff;
  border: none;
  border-radius: 9px;
  padding: 10px 16px;
  font-weight: 800;
  font-size: 0.88rem;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(2, 132, 199, 0.35);
}

.btn-hero-create:hover:not(:disabled) {
  filter: brightness(1.07);
}

.btn-hero-join:disabled,
.btn-hero-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alert-box {
  padding: 11px 14px;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.alert-box.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
.alert-box.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.alert-box.warn { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.mb-2 { margin-bottom: 12px; }

/* Zaproszenia */
.invites-spotlight {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  color: #1e3a8a;
}

.invites-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

.invite-spotlight-card {
  background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
  border: 1.5px solid #93c5fd;
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.inv-badges {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}

.inv-card-info h3 {
  margin: 0 0 4px;
  color: #0f172a;
  font-size: 1.08rem;
}

.inv-card-info p {
  margin: 0;
  color: #475569;
  font-size: 0.84rem;
}

.inv-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-accept {
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 13px;
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
}

.btn-decline {
  background: #ffffff;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
}

.btn-outline-dark {
  background: #0f172a;
  color: #ffffff;
  text-decoration: none;
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.82rem;
}

/* Główny pasek lig */
.hub-leagues-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hub-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.hub-bar h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}

.hub-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hub-pill {
  background: #ffffff;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.hub-pill.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

.hub-pill.pill-warn.active {
  background: #d97706;
  border-color: #d97706;
}

.hub-empty-card {
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.hub-empty-icon {
  font-size: 2.5rem;
}

.hub-empty-card h3 {
  margin: 0;
  color: #0f172a;
}

.hub-empty-card p {
  margin: 0;
  max-width: 480px;
  color: #64748b;
  font-size: 0.9rem;
}

.hub-empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

/* Siatka Kart Lig */
.hub-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 16px;
}

.league-hub-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.league-hub-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.09);
  border-color: #38bdf8;
}

.league-hub-card.is-my-turn {
  border-color: #22c55e;
  box-shadow: 0 6px 18px rgba(34, 197, 94, 0.14);
}

.league-hub-card.is-invited {
  border-color: #60a5fa;
}

.lhc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.lhc-chips {
  display: flex;
  gap: 6px;
}

.cat-chip {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
}

.season-chip {
  background: #f1f5f9;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 6px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
}

.status-pill.lobby { background: #fef3c7; color: #92400e; }
.status-pill.active_draft { background: #dbeafe; color: #1d4ed8; }
.status-pill.draft_finished { background: #f3e8ff; color: #6b21a8; }
.status-pill.league_active,
.status-pill.completed { background: #dcfce7; color: #166534; }

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
}
.status-dot.lobby { background: #f59e0b; }
.status-dot.active_draft { background: #2563eb; }
.status-dot.draft_finished { background: #9333ea; }
.status-dot.league_active,
.status-dot.completed { background: #16a34a; }

.lhc-title-block h3 {
  margin: 0 0 3px;
  font-size: 1.12rem;
  color: #0f172a;
}

.lhc-title-block small {
  color: #64748b;
  font-size: 0.8rem;
}

.lhc-stats-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 9px 10px;
}

.lhc-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.lhc-stat-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  font-weight: 700;
}

.lhc-stat strong {
  font-size: 0.82rem;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lhc-live-area {
  min-height: 28px;
  display: flex;
  align-items: center;
}

.mini-alert {
  font-size: 0.76rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 999px;
}
.mini-alert.turn { background: #dcfce7; color: #166534; }
.mini-alert.invite { background: #fef3c7; color: #92400e; }
.mini-alert.launch { background: #f3e8ff; color: #6b21a8; }

.lhc-draft-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lhc-dp-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
}

.lhc-turn-other {
  font-size: 0.8rem;
  color: #475569;
}

.lhc-progress-track {
  height: 7px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

.lhc-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0284c7, #22c55e);
  border-radius: 999px;
}

.lhc-standing-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0f172a;
  color: #f8fafc;
  padding: 8px 12px;
  border-radius: 9px;
  font-size: 0.82rem;
}

.lhc-pts-badge strong {
  color: #38bdf8;
  font-size: 0.94rem;
}

.lhc-footer {
  border-top: 1px solid #f1f5f9;
  padding-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.lhc-cta {
  font-size: 0.84rem;
  font-weight: 800;
  color: #0284c7;
}

/* Modale Tworzenia / Dołączania */
.draft-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.58);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1200;
}

.draft-modal-card {
  background: #ffffff;
  border-radius: 16px;
  width: 100%;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.28);
  overflow: hidden;
}
.draft-modal-card.compact { max-width: 480px; }
.draft-modal-card.wide { max-width: 820px; }

.dm-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.dm-header h3 { margin: 0 0 4px; font-size: 1.12rem; }
.dm-header .subtitle { margin: 0; font-size: 0.82rem; color: #cbd5e1; }

.dm-close {
  background: rgba(255, 255, 255, 0.14);
  border: none;
  color: #ffffff;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 1.2rem;
  cursor: pointer;
}

.dm-body {
  padding: 18px 20px;
  overflow-y: auto;
}

.dm-footer {
  padding: 12px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-primary {
  background: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 9px 15px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: #f1f5f9;
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 700;
  font-size: 0.86rem;
  cursor: pointer;
}

.join-code-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.invite-code-input {
  flex: 1;
  min-width: 180px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.checkbox-group { grid-column: span 3; }

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.form-group label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}
.form-input, .form-select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.88rem;
  background: #ffffff;
  box-sizing: border-box;
}

.cutoff-toggle-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.hint-text { font-size: 0.78rem; color: #64748b; }
.btn-link-xs {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

@media (max-width: 780px) {
  .create-grid { grid-template-columns: 1fr; }
  .checkbox-group { grid-column: span 1; }
  .hub-cards-grid { grid-template-columns: 1fr; }
}
</style>
