<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useNotifications } from '@/stores/notifications'
import { useI18n } from '@/i18n'
import { PICKS_COUNT_OPTIONS, SEASON_OPTIONS, useDraftUiHelpers } from '@/utils/draftUi'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'

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
  getAthleteInitials,
} = useDraftUiHelpers()

const myUserId = computed(() => auth.user.value?.id || '')
const leagueId = computed(() => String(route.params.id || '').trim())

const isLoadingDetail = ref(true)
const isBusy = ref(false)
const errorMsg = ref('')
const successMsg = ref('')
const codeCopied = ref(false)

const myLeaguesMini = ref<any[]>([])
const selectedLeague = ref<any>(null)

// Kontekstowe zakładki pokoju ligi
const activeRoomTab = ref<string>('main')
const leagueCalendarEvents = ref<any[]>([])
const isLoadingCalendar = ref(false)
const calendarFilterMode = ref<'all' | 'completed' | 'upcoming'>('all')

// Konfigurator Lobby (Host)
const lobbyForm = ref({
  name: '',
  category_code: 'WC',
  season: '2027',
  picks_per_player: 6,
  order_mode: 'CUSTOM',
  scoring_from_date: '',
  scoring_to_date: '',
})
const lobbyCutoffPreview = ref<{
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
const lobbyShowCustomDates = ref(false)

// Zapraszanie graczy
const inviteQuery = ref('')
const inviteCandidates = ref<any[]>([])
const isSearchingUsers = ref(false)
let inviteDebounce: any = null

// Pula skoczków (ACTIVE_DRAFT)
const athleteQuery = ref('')
const selectedCountries = ref<string[]>([])
const availableCountries = ref<Array<{ code: string; count: number }>>([])
const showCountryDropdown = ref(false)
const countrySearchQuery = ref('')
const countryDropdownRef = ref<HTMLElement | null>(null)
const showPickedAthletes = ref(false)
const athleteSortBy = ref<'wc_points' | 'price' | 'name'>('wc_points')
const activeAthletes = ref<any[]>([])
const isLoadingAthletes = ref(false)
const pendingPickAthlete = ref<any>(null)
const failedAthleteAvatars = ref<Record<string, boolean>>({})

// Tabela & Modal punktów
const expandedStandingUserIds = ref<string[]>([])
const detailsModalPlayer = ref<any | null>(null)
const expandedModalAthletes = ref<Record<string, boolean>>({})
let fallbackPollTimer: any = null

const getAthleteAvatarUrl = (ath: any): string | null => {
  if (!ath) return null
  const key = String(ath.fis_code || ath.full_name || '')
  if (key && failedAthleteAvatars.value[key]) return null
  if (ath.competitor_id_from_url) {
    return `https://data.fis-ski.com/general/load-competitor-picture/${ath.competitor_id_from_url}.html`
  }
  return null
}

const markAthleteAvatarFailed = (ath: any) => {
  const key = String(ath?.fis_code || ath?.full_name || '')
  if (key) {
    failedAthleteAvatars.value = { ...failedAthleteAvatars.value, [key]: true }
  }
}

const openPlayerDetailsModal = (row: any) => {
  detailsModalPlayer.value = row
  expandedModalAthletes.value = {}
}

const closePlayerDetailsModal = () => {
  detailsModalPlayer.value = null
}

const toggleModalAthlete = (fisCode: string | number) => {
  const key = String(fisCode)
  expandedModalAthletes.value = {
    ...expandedModalAthletes.value,
    [key]: !expandedModalAthletes.value[key],
  }
}

const isStandingExpanded = (userId: string) => expandedStandingUserIds.value.includes(userId)
const toggleStandingRow = (userId: string) => {
  expandedStandingUserIds.value = isStandingExpanded(userId)
    ? expandedStandingUserIds.value.filter((id) => id !== userId)
    : [...expandedStandingUserIds.value, userId]
}
const expandAllStandings = () => {
  expandedStandingUserIds.value = (selectedLeague.value?.standings || []).map((r: any) => r.user_id)
}
const collapseAllStandings = () => {
  expandedStandingUserIds.value = []
}

const myParticipant = computed(() => {
  if (!selectedLeague.value) return null
  return (selectedLeague.value.participants || []).find((p: any) => p.user_id === myUserId.value) || null
})

const isCreator = computed(() => Boolean(selectedLeague.value && selectedLeague.value.creator_id === myUserId.value))

const isMyTurn = computed(() =>
  Boolean(
    selectedLeague.value &&
      selectedLeague.value.status === 'ACTIVE_DRAFT' &&
      selectedLeague.value.current_turn_user_id === myUserId.value
  )
)

const currentTurnPlayerName = computed(() => {
  if (!selectedLeague.value?.current_turn_user_id) return ''
  const p = (selectedLeague.value.participants || []).find(
    (x: any) => x.user_id === selectedLeague.value.current_turn_user_id
  )
  return p?.name || t('draft.playerFallback')
})

const acceptedParticipantsInOrder = computed(() => {
  if (!selectedLeague.value) return []
  const orderIds: string[] = selectedLeague.value.draft_order_user_ids || []
  const map = new Map<string, any>()
  for (const p of selectedLeague.value.participants || []) {
    if (p.status === 'ACCEPTED') map.set(p.user_id, p)
  }
  const ordered: any[] = []
  for (const uid of orderIds) {
    if (map.has(uid)) {
      ordered.push(map.get(uid))
      map.delete(uid)
    }
  }
  for (const p of map.values()) ordered.push(p)
  return ordered
})

const invitedParticipants = computed(() =>
  (selectedLeague.value?.participants || []).filter((p: any) => p.status === 'INVITED')
)

const phaseStepIndex = computed(() => {
  const st = selectedLeague.value?.status
  if (st === 'LOBBY') return 1
  if (st === 'ACTIVE_DRAFT' || st === 'DRAFT_FINISHED') return 2
  return 3
})

const isLeagueStandingsPhase = computed(() =>
  ['LEAGUE_ACTIVE', 'COMPLETED'].includes(selectedLeague.value?.status || '')
)

const leaderPoints = computed(() => {
  const rows = selectedLeague.value?.standings || []
  return rows.length > 0 ? Number(rows[0].total_points || 0) : 0
})

const filteredDropdownCountries = computed(() => {
  const q = countrySearchQuery.value.trim().toLowerCase()
  if (!q) return availableCountries.value
  return availableCountries.value.filter((c) => c.code.toLowerCase().includes(q))
})

const displayedPoolAthletes = computed(() => {
  let list = [...activeAthletes.value]
  if (!showPickedAthletes.value) {
    list = list.filter((a) => !isAthleteAlreadyPicked(a.fis_code))
  }
  if (athleteSortBy.value === 'name') {
    list.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
  } else if (athleteSortBy.value === 'price') {
    list.sort(
      (a, b) =>
        Number(b.price ?? -1) - Number(a.price ?? -1) ||
        Number(b.wc_points ?? 0) - Number(a.wc_points ?? 0)
    )
  } else {
    list.sort(
      (a, b) =>
        Number(b.wc_points ?? 0) - Number(a.wc_points ?? 0) ||
        Number(b.price ?? -1) - Number(a.price ?? -1) ||
        String(a.full_name || '').localeCompare(String(b.full_name || ''))
    )
  }
  return list
})

const mySquadSlots = computed(() => {
  const n = Number(selectedLeague.value?.picks_per_player || 6)
  const picks = myParticipant.value?.picks || []
  const slots: Array<{ slotNum: number; pick: any | null }> = []
  for (let i = 0; i < n; i++) {
    slots.push({ slotNum: i + 1, pick: picks[i] || null })
  }
  return slots
})

const snakeMatrixRows = computed(() => {
  const lg = selectedLeague.value
  const mgrs = acceptedParticipantsInOrder.value
  if (!lg || mgrs.length === 0) return []
  const roundsCount = Number(lg.picks_per_player || 6)
  const n = mgrs.length
  const rows: Array<{ round: number; isReverse: boolean; cells: any[] }> = []
  for (let r = 1; r <= roundsCount; r++) {
    const isReverse = r % 2 === 0
    const cells = mgrs.map((mgr, colIdx) => {
      const pick = (mgr.picks || []).find((pk: any) => Number(pk.round) === r) || null
      const orderInRound = isReverse ? n - 1 - colIdx : colIdx
      const pickNum = (r - 1) * n + orderInRound + 1
      const isCurrent = lg.status === 'ACTIVE_DRAFT' && pickNum - 1 === Number(lg.current_pick_index || 0)
      return {
        managerId: mgr.user_id,
        pickNum,
        pick,
        isCurrent,
      }
    })
    rows.push({ round: r, isReverse, cells })
  }
  return rows
})

const ensureValidActiveTab = () => {
  const st = selectedLeague.value?.status
  if (st === 'ACTIVE_DRAFT') {
    if (!['pool', 'grid', 'calendar'].includes(activeRoomTab.value)) {
      activeRoomTab.value = 'pool'
    }
  } else if (st === 'LEAGUE_ACTIVE' || st === 'COMPLETED') {
    if (!['standings', 'squads', 'calendar'].includes(activeRoomTab.value)) {
      activeRoomTab.value = 'standings'
    }
  } else {
    if (!['main', 'calendar'].includes(activeRoomTab.value)) {
      activeRoomTab.value = 'main'
    }
  }
}

const fetchLeagueCalendar = async () => {
  if (!leagueId.value) return
  isLoadingCalendar.value = true
  try {
    const data = await api.get<any>(`/draft/leagues/${encodeURIComponent(leagueId.value)}/calendar`)
    leagueCalendarEvents.value = data.events || []
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errCalendar')
  } finally {
    isLoadingCalendar.value = false
  }
}

const openCalendarTab = async () => {
  activeRoomTab.value = 'calendar'
  await fetchLeagueCalendar()
}

const scoringStartDisplay = computed(() => {
  const fromDt = selectedLeague.value?.scoring_from_date
  if (!fromDt) return t('draft.calSubStart')
  const exactOpt = (lobbyCutoffPreview.value?.competition_options || []).find((o: any) => o.date === fromDt)
  if (exactOpt) return `${exactOpt.place} (${exactOpt.date_label || exactOpt.date})`
  const counted = selectedLeague.value?.counted_competitions || []
  if (counted.length > 0 && counted[0].date >= fromDt) {
    return `${counted[0].event_place} (${counted[0].date})`
  }
  return fromDt
})

const filteredLeagueCalendarEvents = computed(() => {
  if (calendarFilterMode.value === 'completed') {
    return leagueCalendarEvents.value.filter((ev) => ev.status === 'COMPLETED')
  }
  if (calendarFilterMode.value === 'upcoming') {
    return leagueCalendarEvents.value.filter((ev) => ev.status !== 'COMPLETED' && ev.status !== 'CANCELLED')
  }
  return leagueCalendarEvents.value
})

const loadCutoffPreview = async (season: string, categoryCode: string) => {
  try {
    const data = await api.get<any>(
      `/draft/cutoff-preview?season=${encodeURIComponent(season)}&category_code=${encodeURIComponent(categoryCode)}`
    )
    lobbyCutoffPreview.value = {
      finished_competitions: data.finished_competitions || [],
      upcoming_competitions: data.upcoming_competitions || [],
      competition_options: data.competition_options || [],
      recommended_scoring_from_date: data.recommended_scoring_from_date || '',
      recommended_scoring_to_date: data.recommended_scoring_to_date || '',
    }
  } catch {
    // ignore
  }
}

const syncLobbyFormFromLeague = (lg: any) => {
  if (!lg) return
  lobbyForm.value = {
    name: lg.name || '',
    category_code: lg.category_code || 'WC',
    season: String(lg.season || '2027'),
    picks_per_player: Number(lg.picks_per_player || 6),
    order_mode: lg.order_mode || 'CUSTOM',
    scoring_from_date: lg.scoring_from_date || '',
    scoring_to_date: lg.scoring_to_date || '',
  }
  loadCutoffPreview(lobbyForm.value.season, lobbyForm.value.category_code)
}

watch(
  () => [lobbyForm.value.season, lobbyForm.value.category_code],
  ([s, c]) => {
    if (selectedLeague.value?.status === 'LOBBY' && isCreator.value && s && c) {
      api
        .get<any>(`/draft/cutoff-preview?season=${encodeURIComponent(String(s))}&category_code=${encodeURIComponent(String(c))}`)
        .then((data) => {
          lobbyCutoffPreview.value = data
          if (String(c) !== selectedLeague.value?.category_code || String(s) !== String(selectedLeague.value?.season)) {
            lobbyForm.value.scoring_from_date = data.recommended_scoring_from_date || ''
            lobbyForm.value.scoring_to_date = data.recommended_scoring_to_date || ''
          }
        })
        .catch(() => {})
    }
  }
)

const onCutoffCompetitionChange = (ev: Event) => {
  const val = (ev.target as HTMLSelectElement).value
  if (val === '__CUSTOM__') {
    lobbyShowCustomDates.value = true
    return
  }
  lobbyForm.value.scoring_from_date = val
}

const fetchSwitcherLeagues = async () => {
  try {
    const data = await api.get<any>('/draft/leagues')
    myLeaguesMini.value = data.leagues || []
  } catch {
    // ignore
  }
}

const fetchLeagueDetail = async (silent = false) => {
  if (!leagueId.value) return
  if (!silent) isLoadingDetail.value = true
  try {
    const data = await api.get<any>(`/draft/leagues/${encodeURIComponent(leagueId.value)}`)
    selectedLeague.value = data
    ensureValidActiveTab()
    if (data.status === 'LOBBY') {
      syncLobbyFormFromLeague(data)
    } else if (data.status === 'ACTIVE_DRAFT' && activeAthletes.value.length === 0) {
      await Promise.all([
        fetchActiveAthletes(),
        availableCountries.value.length === 0 ? fetchAvailableCountries() : Promise.resolve(),
      ])
    }
  } catch (e: any) {
    if (!silent) errorMsg.value = e.message || t('draft.errLoadDetail')
  } finally {
    if (!silent) isLoadingDetail.value = false
  }
}

const switchToOtherLeague = (ev: Event) => {
  const val = (ev.target as HTMLSelectElement).value
  if (val && val !== leagueId.value) {
    router.push(`/draft/league/${encodeURIComponent(val)}`)
  }
}

const copyInviteCode = async (code: string) => {
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    codeCopied.value = true
    setTimeout(() => {
      codeCopied.value = false
    }, 2200)
  } catch {
    errorMsg.value = t('draft.errClipboard', { code })
  }
}

const searchUsersToInvite = async () => {
  isSearchingUsers.value = true
  try {
    inviteCandidates.value = await api.get<any[]>(
      `/draft/users/search?q=${encodeURIComponent(inviteQuery.value.trim())}`
    )
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errSearchUsers')
  } finally {
    isSearchingUsers.value = false
  }
}

const onInviteSearchInput = () => {
  if (inviteDebounce) clearTimeout(inviteDebounce)
  inviteDebounce = setTimeout(() => searchUsersToInvite(), 220)
}

const inviteUser = async (userId: string) => {
  if (!selectedLeague.value) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    selectedLeague.value = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/invite`, { user_id: userId })
    successMsg.value = t('draft.okInvited')
    await searchUsersToInvite()
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errInvite')
  } finally {
    isBusy.value = false
  }
}

const respondToInvite = async (action: 'accept' | 'decline') => {
  if (!selectedLeague.value) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/respond`, { action })
    await fetchNotifications()
    if (action === 'decline') {
      router.replace('/draft')
    } else {
      selectedLeague.value = updated
      successMsg.value = t('draft.okJoinedSimple')
    }
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errRespond')
  } finally {
    isBusy.value = false
  }
}

const removeLobbyParticipant = async (userId: string) => {
  if (!selectedLeague.value) return
  isBusy.value = true
  try {
    selectedLeague.value = await api.delete<any>(
      `/draft/leagues/${selectedLeague.value.id}/participants/${encodeURIComponent(userId)}`
    )
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errRemovePlayer')
  } finally {
    isBusy.value = false
  }
}

const saveLobbyConfig = async (customOrder?: string[]) => {
  if (!selectedLeague.value) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const payload: any = {
      name: lobbyForm.value.name.trim(),
      category_code: lobbyForm.value.category_code,
      season: lobbyForm.value.season,
      picks_per_player: Number(lobbyForm.value.picks_per_player || 6),
      order_mode: lobbyForm.value.order_mode,
      scoring_from_date: lobbyForm.value.scoring_from_date || '',
      scoring_to_date: lobbyForm.value.scoring_to_date || '',
    }
    if (customOrder) payload.ordered_user_ids = customOrder
    const updated = await api.put<any>(`/draft/leagues/${selectedLeague.value.id}/config`, payload)
    selectedLeague.value = updated
    syncLobbyFormFromLeague(updated)
    successMsg.value = t('draft.okSavedConfig')
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errSaveConfig')
  } finally {
    isBusy.value = false
  }
}

const moveOrder = async (idx: number, delta: -1 | 1) => {
  const list = acceptedParticipantsInOrder.value.map((p: any) => p.user_id)
  const target = idx + delta
  if (target < 0 || target >= list.length) return
  const tmp = list[idx]!
  list[idx] = list[target]!
  list[target] = tmp
  lobbyForm.value.order_mode = 'CUSTOM'
  await saveLobbyConfig(list)
}

const randomizeOrderPreview = async () => {
  const list = acceptedParticipantsInOrder.value.map((p: any) => p.user_id)
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = list[i]!
    list[i] = list[j]!
    list[j] = tmp
  }
  lobbyForm.value.order_mode = 'CUSTOM'
  await saveLobbyConfig(list)
}

const startDraft = async () => {
  if (!selectedLeague.value) return
  if (!confirm(t('draft.confirmStartDraft'))) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/start`, {})
    selectedLeague.value = updated
    activeRoomTab.value = 'pool'
    successMsg.value = t('draft.okDraftStarted')
    await Promise.all([
      fetchActiveAthletes(),
      availableCountries.value.length === 0 ? fetchAvailableCountries() : Promise.resolve(),
    ])
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errStartDraft')
  } finally {
    isBusy.value = false
  }
}

const launchSeasonLeague = async () => {
  if (!selectedLeague.value) return
  if (!confirm(t('draft.confirmStartLeague'))) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/launch-league`, {})
    selectedLeague.value = updated
    activeRoomTab.value = 'standings'
    successMsg.value = t('draft.okLeagueStarted')
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errStartLeague')
  } finally {
    isBusy.value = false
  }
}

const deleteLeague = async () => {
  if (!selectedLeague.value) return
  if (!confirm(t('draft.confirmDeleteLeague', { name: selectedLeague.value.name }))) return
  isBusy.value = true
  try {
    await api.delete(`/draft/leagues/${selectedLeague.value.id}`)
    await fetchNotifications()
    router.replace('/draft')
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errDeleteLeague')
  } finally {
    isBusy.value = false
  }
}

const leaveLeague = async () => {
  if (!selectedLeague.value || isCreator.value) return
  if (!confirm(t('draft.confirmLeaveLeague', { name: selectedLeague.value.name }))) return
  errorMsg.value = ''
  isBusy.value = true
  try {
    await api.post(`/draft/leagues/${selectedLeague.value.id}/leave`, {})
    await fetchNotifications()
    router.replace('/draft')
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errLeaveLeague')
  } finally {
    isBusy.value = false
  }
}

const fetchAvailableCountries = async () => {
  try {
    availableCountries.value = await api.get<Array<{ code: string; count: number }>>('/draft/athletes/countries')
  } catch {
    // ignore
  }
}

const fetchActiveAthletes = async () => {
  isLoadingAthletes.value = true
  try {
    const params = new URLSearchParams()
    if (athleteQuery.value.trim()) params.set('q', athleteQuery.value.trim())
    if (selectedCountries.value.length > 0) params.set('countries', selectedCountries.value.join(','))
    params.set('sort_by', athleteSortBy.value)
    activeAthletes.value = await api.get<any[]>(`/draft/athletes/active?${params.toString()}`)
  } catch {
    // ignore
  } finally {
    isLoadingAthletes.value = false
  }
}

const toggleCountrySelection = (cc: string) => {
  if (selectedCountries.value.includes(cc)) {
    selectedCountries.value = selectedCountries.value.filter((c) => c !== cc)
  } else {
    selectedCountries.value = [...selectedCountries.value, cc]
  }
  fetchActiveAthletes()
}

const clearSelectedCountries = () => {
  if (selectedCountries.value.length === 0) return
  selectedCountries.value = []
  fetchActiveAthletes()
}

const handleCountryDropdownOutsideClick = (event: MouseEvent) => {
  if (!showCountryDropdown.value) return
  const target = event.target as HTMLElement | null
  if (countryDropdownRef.value && target && !countryDropdownRef.value.contains(target)) {
    showCountryDropdown.value = false
  }
}

const isAthleteAlreadyPicked = (fisCode: number | string): string | null => {
  const map = selectedLeague.value?.picked_athletes_map || {}
  return map[String(fisCode)] || null
}

const requestPickConfirmation = (ath: any) => {
  if (!selectedLeague.value || !isMyTurn.value || isBusy.value) return
  pendingPickAthlete.value = ath
}

const cancelPickConfirmation = () => {
  pendingPickAthlete.value = null
}

const confirmPickAthlete = async () => {
  const ath = pendingPickAthlete.value
  if (!ath || !selectedLeague.value || !isMyTurn.value) return
  pendingPickAthlete.value = null
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    selectedLeague.value = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/pick`, {
      fis_code: ath.fis_code,
    })
    ensureValidActiveTab()
    successMsg.value = t('draft.okPicked', { name: ath.full_name })
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || t('draft.errPick')
  } finally {
    isBusy.value = false
  }
}

watch(lastDraftEvent, (ev) => {
  if (!ev) return
  if (ev.event === 'league_deleted' && ev.league_id === leagueId.value) {
    router.replace('/draft')
    return
  }
  fetchLeagueDetail(true)
})

watch(leagueId, async () => {
  errorMsg.value = ''
  successMsg.value = ''
  expandedStandingUserIds.value = []
  leagueCalendarEvents.value = []
  await fetchLeagueDetail(false)
  if (selectedLeague.value?.status === 'LOBBY') {
    await searchUsersToInvite()
  }
})

onMounted(async () => {
  document.addEventListener('click', handleCountryDropdownOutsideClick)
  await Promise.all([fetchLeagueDetail(false), fetchSwitcherLeagues()])
  if (selectedLeague.value?.status === 'LOBBY') {
    await searchUsersToInvite()
  }
  fallbackPollTimer = setInterval(() => {
    if (selectedLeague.value && selectedLeague.value.status === 'ACTIVE_DRAFT') {
      fetchLeagueDetail(true)
    }
  }, 15000)
})

onUnmounted(() => {
  document.removeEventListener('click', handleCountryDropdownOutsideClick)
  if (fallbackPollTimer) clearInterval(fallbackPollTimer)
  if (inviteDebounce) clearTimeout(inviteDebounce)
})
</script>

<template>
  <div class="league-room-page">
    <div class="league-room-container">
      <!-- GÓRNY PASEK NAWIGACJI KONTEKSTU LIGI -->
      <div class="room-top-nav">
        <RouterLink to="/draft" class="btn-back-hub">{{ t('draft.backToHub') }}</RouterLink>
        <div class="room-top-right">
          <select
            v-if="myLeaguesMini.length > 1"
            class="league-switcher-select"
            :value="leagueId"
            @change="switchToOtherLeague($event)"
          >
            <option value="" disabled>{{ t('draft.switchLeaguePlaceholder') }}</option>
            <option v-for="ml in myLeaguesMini" :key="ml.id" :value="ml.id">
              {{ ml.name }} ({{ ml.category_code }} {{ ml.season }})
            </option>
          </select>
        </div>
      </div>

      <SkiLoader v-if="isLoadingDetail" :text="t('draft.loadingLeagues')" />

      <div v-else-if="errorMsg && !selectedLeague" class="alert-box error">
        <span>❌</span> {{ errorMsg }}
      </div>

      <template v-else-if="selectedLeague">
        <div v-if="errorMsg" class="alert-box error"><span>❌</span> {{ errorMsg }}</div>
        <div v-if="successMsg" class="alert-box success"><span>✅</span> {{ successMsg }}</div>

        <!-- BANER ZAPROSZENIA DLA ZAPROSZONEGO GRACZA -->
        <div v-if="myParticipant?.status === 'INVITED'" class="invite-banner">
          <div>
            <h3>{{ t('draft.inviteBannerTitle', { name: selectedLeague.name }) }}</h3>
            <p>
              {{ t('draft.creatorLabel') }} <strong>{{ selectedLeague.creator_name }}</strong> •
              {{ t('draft.tournamentLabel') }} <strong>{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }} {{ selectedLeague.season }}</strong> •
              {{ t('draft.squadLabel') }} <strong>{{ formatJumpersCount(selectedLeague.picks_per_player) }}</strong> •
              {{ t('draft.fromLabel') }} <strong>{{ selectedLeague.scoring_from_date || t('draft.allFeminine') }}</strong>
            </p>
          </div>
          <div class="invite-banner-actions">
            <button type="button" class="btn-accept" :disabled="isBusy" @click="respondToInvite('accept')">
              {{ t('draft.acceptInvite') }}
            </button>
            <button type="button" class="btn-decline" :disabled="isBusy" @click="respondToInvite('decline')">
              {{ t('draft.declineInvite') }}
            </button>
          </div>
        </div>

        <!-- GŁÓWNY MASTHEAD LIGI (FPL DRAFT INSPIRATION W KOLORACH FANTASKI) -->
        <header class="league-masthead">
          <div class="lm-top-row">
            <div class="lm-title-col">
              <div class="lm-stepper">
                <span class="step-pill" :class="{ done: phaseStepIndex > 1, active: phaseStepIndex === 1 }">
                  1. {{ t('draft.stepLobby') }}
                </span>
                <span class="step-sep">→</span>
                <span class="step-pill" :class="{ done: phaseStepIndex > 2, active: phaseStepIndex === 2 }">
                  2. {{ t('draft.stepDraft') }}
                </span>
                <span class="step-sep">→</span>
                <span class="step-pill" :class="{ active: phaseStepIndex === 3 }">
                  3. {{ t('draft.stepLeague') }}
                </span>
              </div>

              <h1>{{ selectedLeague.name }}</h1>

              <div class="lm-badges-line">
                <span class="status-pill" :class="String(selectedLeague.status || '').toLowerCase()">
                  {{ statusLabels[selectedLeague.status] || selectedLeague.status }}
                </span>
                <span class="meta-pill">{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }}</span>
                <span class="meta-pill">{{ t('common.season') }} {{ selectedLeague.season }}</span>
                <span class="meta-pill">{{ formatJumpersCount(selectedLeague.picks_per_player) }}</span>
              </div>
              <small class="lm-sub">
                {{ t('draft.hostLabel') }} <strong>{{ selectedLeague.creator_name }}</strong> •
                {{ t('draft.countedFrom') }} <strong>{{ selectedLeague.scoring_from_date || t('draft.allFeminine') }}</strong>
                <template v-if="selectedLeague.scoring_to_date"> {{ t('draft.toPrefix') }} <strong>{{ selectedLeague.scoring_to_date }}</strong></template>
              </small>
            </div>

            <div class="lm-actions-col">
              <button
                v-if="selectedLeague.status === 'LOBBY' && selectedLeague.invite_code"
                type="button"
                class="btn-glass-code"
                @click="copyInviteCode(selectedLeague.invite_code)"
                :title="t('draft.copyCode')"
              >
                🔑 <code>{{ selectedLeague.invite_code }}</code>
                <span>{{ codeCopied ? '✓' : '📋' }}</span>
              </button>
              <button type="button" class="btn-glass" @click="fetchLeagueDetail(false)">
                {{ t('common.refresh') }}
              </button>
              <button
                v-if="myParticipant?.status === 'ACCEPTED' && !isCreator"
                type="button"
                class="btn-glass-danger"
                :disabled="isBusy"
                @click="leaveLeague"
              >
                {{ t('draft.leaveBtn') }}
              </button>
              <button
                v-if="isCreator || auth.isAdmin.value"
                type="button"
                class="btn-glass-danger"
                :disabled="isBusy"
                @click="deleteLeague"
              >
                {{ t('draft.deleteBtn') }}
              </button>
            </div>
          </div>

          <!-- Pasek Zakładek Kontekstowych wewnątrz Ligi -->
          <div class="lm-tabs-bar">
            <template v-if="selectedLeague.status === 'ACTIVE_DRAFT'">
              <button
                type="button"
                class="lm-tab-btn"
                :class="{ active: activeRoomTab === 'pool' }"
                @click="activeRoomTab = 'pool'"
              >
                {{ t('draft.subTabPool') }}
              </button>
              <button
                type="button"
                class="lm-tab-btn"
                :class="{ active: activeRoomTab === 'grid' }"
                @click="activeRoomTab = 'grid'"
              >
                {{ t('draft.subTabGrid') }}
              </button>
            </template>

            <template v-else-if="isLeagueStandingsPhase">
              <button
                type="button"
                class="lm-tab-btn"
                :class="{ active: activeRoomTab === 'standings' }"
                @click="activeRoomTab = 'standings'"
              >
                {{ t('draft.subTabTable') }}
              </button>
              <button
                type="button"
                class="lm-tab-btn"
                :class="{ active: activeRoomTab === 'squads' }"
                @click="activeRoomTab = 'squads'"
              >
                {{ t('draft.subTabSquads', { count: acceptedParticipantsInOrder.length }) }}
              </button>
            </template>

            <template v-else>
              <button
                type="button"
                class="lm-tab-btn"
                :class="{ active: activeRoomTab === 'main' }"
                @click="activeRoomTab = 'main'"
              >
                {{ t('draft.subTabFlow') }}
              </button>
            </template>

            <button
              type="button"
              class="lm-tab-btn"
              :class="{ active: activeRoomTab === 'calendar' }"
              @click="openCalendarTab"
            >
              {{ t('draft.subTabCal') }}
            </button>
          </div>
        </header>

        <!-- ========================================== -->
        <!-- ZAKŁADKA WSPÓLNA: KALENDARZ TURNIEJU       -->
        <!-- ========================================== -->
        <div v-if="activeRoomTab === 'calendar'" class="card calendar-league-card">
          <div class="card-header flex-between">
            <div>
              <h3>{{ t('draft.calHeader', { title: `${categoryLabels[selectedLeague.category_code] || selectedLeague.category_code} ${selectedLeague.season}` }) }}</h3>
              <p class="subtitle">
                {{ t('draft.calSimpleSubHint') }} • {{ t('draft.scoringFromPrefix') }} <strong>{{ scoringStartDisplay }}</strong><template v-if="selectedLeague.scoring_to_date"> {{ t('draft.scoringToPrefix') }} <strong>{{ selectedLeague.scoring_to_date }}</strong></template>.
              </p>
            </div>
            <button type="button" class="btn-secondary" :disabled="isLoadingCalendar" @click="fetchLeagueCalendar">
              {{ t('draft.calRefresh') }}
            </button>
          </div>
          <div class="card-body">
            <div class="cal-filter-pills">
              <button type="button" class="cal-filter-btn" :class="{ active: calendarFilterMode === 'all' }" @click="calendarFilterMode = 'all'">
                {{ t('draft.calFilterAll', { count: leagueCalendarEvents.length }) }}
              </button>
              <button type="button" class="cal-filter-btn" :class="{ active: calendarFilterMode === 'completed' }" @click="calendarFilterMode = 'completed'">
                {{ t('draft.calFilterDone', { count: leagueCalendarEvents.filter((e) => e.status === 'COMPLETED').length }) }}
              </button>
              <button type="button" class="cal-filter-btn" :class="{ active: calendarFilterMode === 'upcoming' }" @click="calendarFilterMode = 'upcoming'">
                {{ t('draft.calFilterFuture', { count: leagueCalendarEvents.filter((e) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED').length }) }}
              </button>
            </div>

            <SkiLoader v-if="isLoadingCalendar" :text="t('draft.calLoading')" />
            <div v-else-if="filteredLeagueCalendarEvents.length === 0" class="empty-side">{{ t('draft.calEmpty') }}</div>
            <div v-else class="cal-events-list">
              <div
                v-for="ev in filteredLeagueCalendarEvents"
                :key="ev.event_id"
                class="cal-event-item"
              >
                <div class="cal-ev-main">
                  <div class="cal-ev-top">
                    <CountryFlag v-if="ev.country" :code="ev.country" size="sm" />
                    <strong class="cal-ev-place">{{ ev.place }}</strong>
                    <span class="cal-ev-dates">{{ ev.date_label }}</span>
                  </div>
                  <div class="cal-ev-badges">
                    <span v-if="ev.status === 'COMPLETED'" class="cal-pill active-done">
                      {{ t('draft.calStatusDone') }}
                    </span>
                    <span v-else-if="ev.status === 'CANCELLED'" class="cal-pill excluded">
                      {{ t('draft.calPillCancelled') }}
                    </span>
                    <span v-else class="cal-pill active-future">
                      {{ t('draft.calStatusFuture') }}
                    </span>
                  </div>
                </div>
                <div v-if="ev.sessions?.length" class="cal-ev-sessions">
                  <RouterLink v-for="s in ev.sessions" :key="s.id" :to="`/sessions/${s.id}`" class="cal-session-link">
                    {{ t('draft.calResultsLink', { date: s.date }) }}
                  </RouterLink>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- FAZA 1: LOBBY                              -->
        <!-- ========================================== -->
        <div v-else-if="selectedLeague.status === 'LOBBY'" class="lobby-grid">
          <!-- LEWA KOLUMNA: KONFIGURATOR (HOST) LUB KARTY ZASAD (GOŚĆ) -->
          <div class="card">
            <div class="card-header">
              <h3>{{ isCreator ? t('draft.lobbyTitle') : t('draft.rulesSummaryTitle') }}</h3>
            </div>

            <div v-if="isCreator" class="card-body form-stack">
              <div class="form-row-2">
                <div class="form-group">
                  <label>{{ t('draft.leagueName') }}</label>
                  <input v-model="lobbyForm.name" type="text" class="form-input" />
                </div>
                <div class="form-group">
                  <label>{{ t('draft.tournamentShort') }}</label>
                  <select v-model="lobbyForm.category_code" class="form-select">
                    <option v-for="tOpt in tournamentOptions" :key="tOpt.code" :value="tOpt.code">
                      {{ tOpt.label }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label>{{ t('common.season') }}</label>
                  <select v-model="lobbyForm.season" class="form-select">
                    <option v-for="yr in SEASON_OPTIONS" :key="yr" :value="yr">{{ yr }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>{{ t('draft.picksRangeLabel') }}</label>
                  <select v-model.number="lobbyForm.picks_per_player" class="form-select">
                    <option v-for="cnt in PICKS_COUNT_OPTIONS" :key="cnt" :value="cnt">
                      {{ cnt === 6 ? t('draft.picksDefault', { n: cnt }) : t('draft.picksOpt', { n: cnt }) }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label>{{ t('draft.snakeShort') }}</label>
                  <select v-model="lobbyForm.order_mode" class="form-select">
                    <option value="CUSTOM">{{ t('draft.hostDecides') }}</option>
                    <option value="RANDOM">{{ t('draft.randomOnStart') }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>{{ t('draft.countFrom') }}</label>
                  <select
                    class="form-select"
                    :value="lobbyCutoffPreview.competition_options.some((o) => o.date === lobbyForm.scoring_from_date) ? lobbyForm.scoring_from_date : '__CUSTOM__'"
                    @change="onCutoffCompetitionChange($event)"
                  >
                    <option value="">{{ t('draft.allTournaments') }}</option>
                    <option v-for="opt in lobbyCutoffPreview.competition_options" :key="opt.key" :value="opt.date">
                      {{ formatCutoffOptionLabel(opt) }}
                    </option>
                    <option value="__CUSTOM__">{{ t('draft.customDateOpt') }}</option>
                  </select>
                </div>
              </div>
              <div v-if="lobbyShowCustomDates || !lobbyCutoffPreview.competition_options.length" class="form-row-2">
                <div class="form-group">
                  <label>{{ t('draft.dateFromExact') }}</label>
                  <input v-model="lobbyForm.scoring_from_date" type="date" class="form-input" />
                </div>
                <div class="form-group">
                  <label>{{ t('draft.dateToExact') }}</label>
                  <input v-model="lobbyForm.scoring_to_date" type="date" class="form-input" />
                </div>
              </div>
              <div class="cutoff-toggle-line">
                <small class="hint-text">
                  {{ t('draft.scoringStartLabel') }} <strong>{{ getSelectedCutoffCompLabel(lobbyForm.scoring_from_date, lobbyCutoffPreview.competition_options) }}</strong>
                </small>
                <button type="button" class="btn-link-xs" @click="lobbyShowCustomDates = !lobbyShowCustomDates">
                  {{ lobbyShowCustomDates ? t('draft.hideManualDates') : t('draft.adjustManualDates') }}
                </button>
              </div>

              <div class="snake-hint-box">{{ t('draft.snakeRule') }}</div>

              <div class="cutoff-info-box info-clean">
                <span>
                  {{ t('draft.scoringFromPrefix') }} <strong>{{ scoringStartDisplay }}</strong>
                  <template v-if="selectedLeague.scoring_to_date"> {{ t('draft.scoringToPrefix') }} <strong>{{ selectedLeague.scoring_to_date }}</strong></template>
                </span>
              </div>

              <div class="lobby-actions-row">
                <button type="button" class="btn-secondary" :disabled="isBusy" @click="saveLobbyConfig()">
                  {{ t('draft.saveConfig') }}
                </button>
                <button
                  type="button"
                  class="btn-start-draft"
                  :disabled="isBusy || acceptedParticipantsInOrder.length < 2"
                  @click="startDraft"
                >
                  {{ t('draft.startDraftCount', { count: acceptedParticipantsInOrder.length }) }}
                </button>
              </div>
              <small v-if="acceptedParticipantsInOrder.length < 2" class="hint-text">{{ t('draft.minPlayersHint') }}</small>
            </div>

            <!-- Czysty widok zasad dla zaproszonego / uczestnika -->
            <div v-else class="card-body form-stack">
              <div class="rules-summary-grid">
                <div class="rule-tile">
                  <span>{{ t('draft.ruleTournament') }}</span>
                  <strong>{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }}</strong>
                </div>
                <div class="rule-tile">
                  <span>{{ t('draft.ruleSeason') }}</span>
                  <strong>{{ selectedLeague.season }}</strong>
                </div>
                <div class="rule-tile">
                  <span>{{ t('draft.ruleSquadSize') }}</span>
                  <strong>{{ formatJumpersCount(selectedLeague.picks_per_player) }}</strong>
                </div>
                <div class="rule-tile">
                  <span>{{ t('draft.ruleOrder') }}</span>
                  <strong>{{ selectedLeague.order_mode === 'RANDOM' ? t('draft.randomOnStart') : t('draft.hostDecides') }}</strong>
                </div>
                <div class="rule-tile">
                  <span>{{ t('draft.ruleScoringFrom') }}</span>
                  <strong>{{ selectedLeague.scoring_from_date || t('draft.allFeminine') }}</strong>
                </div>
              </div>
              <div class="snake-hint-box">{{ t('draft.snakeRule') }}</div>
              <div class="cutoff-info-box info-clean">
                <span>
                  {{ t('draft.scoringFromPrefix') }} <strong>{{ scoringStartDisplay }}</strong>
                  <template v-if="selectedLeague.scoring_to_date"> {{ t('draft.scoringToPrefix') }} <strong>{{ selectedLeague.scoring_to_date }}</strong></template>
                </span>
              </div>
            </div>
          </div>

          <!-- PRAWA KOLUMNA: MENEDŻEROWIE I ZAPROSZENIA -->
          <div class="card">
            <div class="card-header flex-between">
              <h3>{{ t('draft.participantsTitle', { count: acceptedParticipantsInOrder.length }) }}</h3>
              <button
                v-if="isCreator && acceptedParticipantsInOrder.length >= 2"
                type="button"
                class="btn-secondary"
                :disabled="isBusy"
                @click="randomizeOrderPreview"
              >
                {{ t('draft.shuffleOrder') }}
              </button>
            </div>
            <div class="card-body form-stack">
              <div class="participants-list">
                <div v-for="(p, idx) in acceptedParticipantsInOrder" :key="p.user_id" class="participant-row">
                  <span class="order-num">#{{ idx + 1 }}</span>
                  <img v-if="p.picture" :src="p.picture" class="p-avatar" alt="Avatar" />
                  <div class="p-info">
                    <strong>{{ p.name }}</strong>
                    <small>{{ p.user_id === selectedLeague.creator_id ? t('draft.roleHost') : t('draft.roleAccepted') }}</small>
                  </div>
                  <div v-if="isCreator" class="order-btns">
                    <button type="button" class="btn-tiny" :disabled="idx === 0 || isBusy" @click="moveOrder(idx, -1)">↑</button>
                    <button
                      type="button"
                      class="btn-tiny"
                      :disabled="idx === acceptedParticipantsInOrder.length - 1 || isBusy"
                      @click="moveOrder(idx, 1)"
                    >
                      ↓
                    </button>
                    <button
                      v-if="p.user_id !== selectedLeague.creator_id"
                      type="button"
                      class="btn-tiny danger"
                      :disabled="isBusy"
                      @click="removeLobbyParticipant(p.user_id)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div v-for="p in invitedParticipants" :key="p.user_id" class="participant-row invited">
                  <span class="order-num">⏳</span>
                  <img v-if="p.picture" :src="p.picture" class="p-avatar" alt="Avatar" />
                  <div class="p-info">
                    <strong>{{ p.name }}</strong>
                    <small>{{ t('draft.awaitingInvite') }}</small>
                  </div>
                  <button
                    v-if="isCreator"
                    type="button"
                    class="btn-tiny danger"
                    :disabled="isBusy"
                    @click="removeLobbyParticipant(p.user_id)"
                  >
                    {{ t('draft.revoke') }}
                  </button>
                </div>
              </div>

              <!-- Kod zaproszenia do ligi -->
              <div v-if="selectedLeague.invite_code" class="invite-code-box">
                <div class="invite-code-meta">
                  <strong>{{ t('draft.inviteCodeTitle') }}</strong>
                  <small>{{ t('draft.inviteCodeSub') }}</small>
                </div>
                <div class="invite-code-actions">
                  <code class="invite-code-pill">{{ selectedLeague.invite_code }}</code>
                  <button type="button" class="btn-copy-code" @click="copyInviteCode(selectedLeague.invite_code)">
                    {{ codeCopied ? t('draft.codeCopied') : t('draft.copyCode') }}
                  </button>
                </div>
              </div>

              <!-- Wyszukiwarka graczy -->
              <div v-if="isCreator" class="invite-search-box">
                <h4>{{ t('draft.inviteTitle') }}</h4>
                <div class="search-bar-row">
                  <input
                    v-model="inviteQuery"
                    type="text"
                    class="form-input"
                    :placeholder="t('draft.invitePh')"
                    @input="onInviteSearchInput"
                    @keyup.enter="searchUsersToInvite"
                  />
                  <button type="button" class="btn-secondary" :disabled="isSearchingUsers" @click="searchUsersToInvite">
                    {{ t('common.search') }}
                  </button>
                </div>
                <div class="invite-results">
                  <div v-for="u in inviteCandidates" :key="u.user_id" class="invite-user-row">
                    <div class="u-left">
                      <img v-if="u.picture" :src="u.picture" class="p-avatar" alt="Avatar" />
                      <div>
                        <strong>{{ u.name }}</strong>
                        <small v-if="!u.eligible" class="hint-text">{{ u.ineligible_reason }}</small>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn-invite-sm"
                      :disabled="
                        !u.eligible ||
                        isBusy ||
                        selectedLeague.participants?.some((x: any) => x.user_id === u.user_id)
                      "
                      @click="inviteUser(u.user_id)"
                    >
                      {{
                        selectedLeague.participants?.some((x: any) => x.user_id === u.user_id)
                          ? t('draft.inLeague')
                          : u.eligible
                            ? t('draft.inviteBtn')
                            : t('draft.unavailable')
                      }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- FAZA 2: ACTIVE DRAFT (FPL DRAFT ROOM)      -->
        <!-- ========================================== -->
        <div v-else-if="selectedLeague.status === 'ACTIVE_DRAFT'" class="active-draft-section">
          <!-- ON-THE-CLOCK BANNER -->
          <div class="turn-banner" :class="{ 'my-turn': isMyTurn }">
            <div class="tb-top-row">
              <div>
                <span class="round-tag">
                  {{ t('draft.snakeRoundInfo', { round: selectedLeague.current_round, picks: selectedLeague.picks_per_player, pick: selectedLeague.current_pick_index + 1, total: selectedLeague.total_picks }) }}
                </span>
                <h2 v-if="isMyTurn">{{ t('draft.yourTurn') }}</h2>
                <h2 v-else>{{ t('draft.otherTurnPrefix') }} <strong>{{ currentTurnPlayerName }}</strong> {{ t('draft.otherTurnHint') }}</h2>
              </div>
            </div>
            <div class="turn-progress-bar">
              <div
                class="turn-progress-fill"
                :style="{ width: `${Math.round((selectedLeague.current_pick_index / Math.max(1, selectedLeague.total_picks)) * 100)}%` }"
              ></div>
            </div>
            <div v-if="selectedLeague.upcoming_turns?.length" class="snake-queue-strip">
              <span class="queue-label">{{ t('draft.snakeQueue') }}</span>
              <span
                v-for="tItem in selectedLeague.upcoming_turns"
                :key="tItem.pick_number"
                class="queue-pill"
                :class="{ current: tItem.is_current, me: tItem.user_id === myUserId }"
              >
                R{{ tItem.round }}.{{ tItem.pick_number }}: {{ tItem.name }}
              </span>
            </div>
          </div>

          <!-- WIDOK A: PULA SKOCZKÓW + TWÓJ SKŁAD -->
          <div v-if="activeRoomTab === 'pool'" class="draft-board-grid">
            <div class="card pool-card">
              <div class="card-header pool-header-stack">
                <div class="flex-between">
                  <h3>{{ t('draft.poolTitle') }}</h3>
                  <div class="pool-right-controls">
                    <label class="hide-picked-toggle">
                      <input type="checkbox" v-model="showPickedAthletes" />
                      <span>{{ t('draft.poolShowPicked') }}</span>
                    </label>
                    <select v-model="athleteSortBy" class="form-select sort-select-sm" @change="fetchActiveAthletes">
                      <option value="wc_points">{{ t('draft.poolSortWcPoints') }}</option>
                      <option value="price">{{ t('draft.poolSortPrice') }}</option>
                      <option value="name">{{ t('draft.poolSortName') }}</option>
                    </select>
                  </div>
                </div>
                <div class="pool-filters-bar">
                  <div class="pool-filters-row">
                    <input
                      v-model="athleteQuery"
                      type="text"
                      class="form-input"
                      :placeholder="t('draft.poolSearchPh')"
                      @input="fetchActiveAthletes"
                    />
                    <div ref="countryDropdownRef" class="country-dropdown-wrap">
                      <button
                        type="button"
                        class="country-dd-trigger"
                        :class="{ active: selectedCountries.length > 0 }"
                        @click="showCountryDropdown = !showCountryDropdown"
                      >
                        <span v-if="selectedCountries.length === 0" class="country-dd-placeholder">
                          🌍 {{ t('draft.countryDropdownBtn') }}: {{ t('draft.poolAllCountries') }}
                        </span>
                        <span v-else class="country-dd-selected-tags">
                          <span v-for="cc in selectedCountries.slice(0, 3)" :key="cc" class="country-dd-mini-tag">
                            <CountryFlag :code="cc" size="xs" /> {{ cc }}
                          </span>
                          <span v-if="selectedCountries.length > 3" class="country-dd-more">
                            +{{ selectedCountries.length - 3 }}
                          </span>
                        </span>
                        <span class="country-dd-caret">▾</span>
                      </button>

                      <div v-if="showCountryDropdown" class="country-dd-menu">
                        <div class="country-dd-header">
                          <input
                            v-model="countrySearchQuery"
                            type="text"
                            class="country-dd-search"
                            :placeholder="t('draft.countrySearchPh')"
                            @click.stop
                          />
                          <button
                            v-if="selectedCountries.length > 0"
                            type="button"
                            class="country-dd-clear-btn"
                            @click.stop="clearSelectedCountries"
                          >
                            {{ t('draft.countryClearBtn') }}
                          </button>
                        </div>
                        <div v-if="selectedCountries.length > 0" class="country-dd-summary">
                          {{ t('draft.countrySelectedCount', { count: selectedCountries.length }) }}
                        </div>
                        <div class="country-dd-list">
                          <div v-if="filteredDropdownCountries.length === 0" class="country-dd-empty">
                            {{ t('draft.countryEmptySearch') }}
                          </div>
                          <label
                            v-for="c in filteredDropdownCountries"
                            :key="c.code"
                            class="country-dd-item"
                            :class="{ checked: selectedCountries.includes(c.code) }"
                          >
                            <input
                              type="checkbox"
                              :checked="selectedCountries.includes(c.code)"
                              @change="toggleCountrySelection(c.code)"
                            />
                            <CountryFlag :code="c.code" size="xs" />
                            <span class="country-dd-code">{{ c.code }}</span>
                            <span class="country-dd-count">{{ c.count }}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card-body pool-list">
                <SkiLoader v-if="isLoadingAthletes" :text="t('draft.poolLoading')" />
                <div v-else-if="displayedPoolAthletes.length === 0" class="empty-side">
                  {{ t('draft.poolEmptyFilter') }}
                </div>
                <div v-else v-for="ath in displayedPoolAthletes" :key="ath.fis_code" class="pool-athlete-row">
                  <div class="ath-meta">
                    <CountryFlag :code="ath.country_code" size="sm" />
                    <span class="ath-mini-avatar-wrap">
                      <img
                        v-if="getAthleteAvatarUrl(ath)"
                        :src="getAthleteAvatarUrl(ath)!"
                        :alt="ath.full_name"
                        class="ath-mini-avatar"
                        loading="lazy"
                        @error="markAthleteAvatarFailed(ath)"
                      />
                      <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(ath.full_name) }}</span>
                    </span>
                    <div class="ath-text-col">
                      <strong>{{ ath.full_name }}</strong>
                      <small class="hint-text">
                        FIS {{ ath.fis_code }}
                        • <span class="wc-pts-pill">{{ t('draft.poolWcPtsBadge', { pts: ath.wc_points ?? 0 }) }}</span>
                        <template v-if="ath.price != null"> • <span class="esm-price-pill">{{ Number(ath.price).toFixed(1) }}</span></template>
                      </small>
                    </div>
                  </div>
                  <div class="ath-action-col">
                    <span v-if="isAthleteAlreadyPicked(ath.fis_code)" class="picked-by-tag">
                      {{ isAthleteAlreadyPicked(ath.fis_code) }}
                    </span>
                    <button
                      v-else
                      type="button"
                      class="btn-pick"
                      :disabled="!isMyTurn || isBusy"
                      @click="requestPickConfirmation(ath)"
                    >
                      {{ t('draft.pickBtn') }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- PRAWA KOLUMNA STICKY: TWÓJ SKŁAD (SLOTY 1..N) + POSTĘP -->
            <div class="draft-side-stack">
              <div class="card my-squad-card">
                <div class="card-header">
                  <h3>{{ t('draft.mySquadTitle', { filled: myParticipant?.picks?.length || 0, total: selectedLeague.picks_per_player }) }}</h3>
                </div>
                <div class="card-body my-squad-slots">
                  <div
                    v-for="slot in mySquadSlots"
                    :key="slot.slotNum"
                    class="squad-slot-row"
                    :class="{ filled: Boolean(slot.pick), empty: !slot.pick }"
                  >
                    <span class="slot-index">{{ slot.slotNum }}</span>
                    <template v-if="slot.pick">
                      <span class="ath-mini-avatar-wrap small">
                        <img
                          v-if="getAthleteAvatarUrl(slot.pick)"
                          :src="getAthleteAvatarUrl(slot.pick)!"
                          :alt="slot.pick.full_name"
                          class="ath-mini-avatar"
                          loading="lazy"
                          @error="markAthleteAvatarFailed(slot.pick)"
                        />
                        <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(slot.pick.full_name) }}</span>
                      </span>
                      <CountryFlag :code="slot.pick.country_code" size="xs" />
                      <strong class="slot-ath-name">{{ slot.pick.full_name }}</strong>
                      <span class="slot-round-tag">R{{ slot.pick.round }}</span>
                    </template>
                    <span v-else class="slot-empty-text">{{ t('draft.emptySlotLabel', { slot: slot.slotNum }) }}</span>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header">
                  <h3>{{ t('draft.allManagersTitle') }}</h3>
                </div>
                <div class="card-body live-rosters">
                  <div
                    v-for="p in acceptedParticipantsInOrder"
                    :key="p.user_id"
                    class="roster-box"
                    :class="{ 'is-on-clock': p.user_id === selectedLeague.current_turn_user_id }"
                  >
                    <div class="roster-top">
                      <strong>{{ p.name }}</strong>
                      <span>{{ p.picks?.length || 0 }}/{{ selectedLeague.picks_per_player }}</span>
                    </div>
                    <div class="roster-chips">
                      <span v-for="pk in p.picks" :key="pk.fis_code" class="pick-chip">
                        <span class="pick-r">R{{ pk.round }}.</span>
                        <span class="ath-mini-avatar-wrap xs">
                          <img
                            v-if="getAthleteAvatarUrl(pk)"
                            :src="getAthleteAvatarUrl(pk)!"
                            :alt="pk.full_name"
                            class="ath-mini-avatar"
                            loading="lazy"
                            @error="markAthleteAvatarFailed(pk)"
                          />
                          <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pk.full_name) }}</span>
                        </span>
                        <CountryFlag :code="pk.country_code" size="xs" />
                        <span>{{ pk.full_name }}</span>
                      </span>
                      <small v-if="!p.picks?.length" class="hint-text">{{ t('draft.noPicksYet') }}</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- WIDOK B: TABLICA DRAFTA (FPL SNAKE MATRIX) -->
          <div v-else-if="activeRoomTab === 'grid'" class="card matrix-card">
            <div class="card-header">
              <h3>{{ t('draft.subTabGrid') }}</h3>
            </div>
            <div class="card-body table-responsive">
              <table class="draft-matrix-table">
                <thead>
                  <tr>
                    <th class="th-round">{{ t('draft.matrixRoundCol') }}</th>
                    <th v-for="(mgr, mIdx) in acceptedParticipantsInOrder" :key="mgr.user_id">
                      <div class="matrix-mgr-head" :class="{ me: mgr.user_id === myUserId }">
                        <span>#{{ mIdx + 1 }} {{ mgr.name }}</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in snakeMatrixRows" :key="row.round">
                    <td class="td-round">
                      <strong>R{{ row.round }}</strong>
                      <span class="snake-dir">{{ row.isReverse ? '←' : '→' }}</span>
                    </td>
                    <td
                      v-for="cell in row.cells"
                      :key="`${row.round}_${cell.managerId}`"
                      class="matrix-cell"
                      :class="{ filled: Boolean(cell.pick), active: cell.isCurrent }"
                    >
                      <div v-if="cell.pick" class="matrix-pick-card">
                        <div class="mpc-top">
                          <span class="mpc-num">#{{ cell.pickNum }}</span>
                          <CountryFlag :code="cell.pick.country_code" size="xs" />
                        </div>
                        <strong class="mpc-name">{{ cell.pick.full_name }}</strong>
                      </div>
                      <div v-else-if="cell.isCurrent" class="matrix-now-badge">
                        🎯 {{ t('draft.matrixPickNow') }} (#{{ cell.pickNum }})
                      </div>
                      <div v-else class="matrix-pending-slot">
                        #{{ cell.pickNum }} • {{ t('draft.matrixEmptySlot') }}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- FAZA 3: DRAFT ZAKOŃCZONY                   -->
        <!-- ========================================== -->
        <div v-else-if="selectedLeague.status === 'DRAFT_FINISHED'" class="draft-finished-section">
          <div class="launch-banner">
            <div>
              <h3>{{ t('draft.finishedBannerTitle', { count: selectedLeague.picks_per_player }) }}</h3>
              <p v-if="isCreator">{{ t('draft.finishedCreatorHint', { season: selectedLeague.season }) }}</p>
              <p v-else>{{ t('draft.finishedGuestHint', { host: selectedLeague.creator_name }) }}</p>
            </div>
            <button v-if="isCreator" type="button" class="btn-start-draft" :disabled="isBusy" @click="launchSeasonLeague">
              {{ t('draft.startLeagueBtn') }}
            </button>
          </div>

          <div class="card">
            <div class="card-header">
              <h3>{{ t('draft.finalRosters') }}</h3>
            </div>
            <div class="card-body finished-rosters-grid">
              <div v-for="p in acceptedParticipantsInOrder" :key="p.user_id" class="roster-box">
                <div class="roster-top">
                  <strong>{{ p.name }}</strong>
                  <span>{{ p.picks?.length || 0 }}/{{ selectedLeague.picks_per_player }}</span>
                </div>
                <div class="roster-chips">
                  <span v-for="pk in p.picks" :key="pk.fis_code" class="pick-chip">
                    <span class="pick-r">{{ pk.round }}.</span>
                    <span class="ath-mini-avatar-wrap xs">
                      <img
                        v-if="getAthleteAvatarUrl(pk)"
                        :src="getAthleteAvatarUrl(pk)!"
                        :alt="pk.full_name"
                        class="ath-mini-avatar"
                        loading="lazy"
                        @error="markAthleteAvatarFailed(pk)"
                      />
                      <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pk.full_name) }}</span>
                    </span>
                    <CountryFlag :code="pk.country_code" size="xs" />
                    <span>{{ pk.full_name }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- FAZA 4: LIGA AKTYWNA (TABELA / SKŁADY)     -->
        <!-- ========================================== -->
        <div v-else-if="isLeagueStandingsPhase" class="dashboard-section">
          <!-- ZAKŁADKA: SKŁADY MENEDŻERÓW -->
          <div v-if="activeRoomTab === 'squads'" class="squads-comparison-grid">
            <div
              v-for="(row, rIdx) in (selectedLeague.standings as any[])"
              :key="row.user_id"
              class="squad-manager-card"
              :class="{ 'me-squad': row.user_id === myUserId }"
            >
              <div class="smc-header">
                <div class="u-left">
                  <span class="smc-rank">#{{ rIdx + 1 }}</span>
                  <img v-if="row.picture" :src="row.picture" class="p-avatar" alt="Avatar" />
                  <div>
                    <strong>{{ row.name }}</strong>
                    <small v-if="rIdx === 0" class="gap-leader">{{ t('draft.gapLeader') }}</small>
                    <small v-else class="gap-behind">{{ t('draft.gapBehind', { pts: Math.round((leaderPoints - row.total_points) * 10) / 10 }) }}</small>
                  </div>
                </div>
                <div class="smc-total-pts">
                  <strong>{{ row.total_points }}</strong> <span>{{ t('common.pts') }}</span>
                </div>
              </div>

              <div class="smc-roster-list">
                <div v-if="!row.picks?.length" class="empty-side">{{ t('draft.noSquadPicks') }}</div>
                <div v-for="pk in row.picks" :key="pk.fis_code" class="smc-athlete-row">
                  <div class="u-left">
                    <span class="ath-mini-avatar-wrap small">
                      <img
                        v-if="getAthleteAvatarUrl(pk)"
                        :src="getAthleteAvatarUrl(pk)!"
                        :alt="pk.full_name"
                        class="ath-mini-avatar"
                        loading="lazy"
                        @error="markAthleteAvatarFailed(pk)"
                      />
                      <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pk.full_name) }}</span>
                    </span>
                    <CountryFlag :code="pk.country_code" size="xs" />
                    <span>{{ pk.full_name }}</span>
                  </div>
                  <strong class="smc-ath-pts">+{{ pk.points }} {{ t('common.pts') }}</strong>
                </div>
              </div>

              <div class="smc-footer">
                <button type="button" class="details-modal-link" @click="openPlayerDetailsModal(row)">
                  {{ t('draft.viewEventsBtn') }}
                </button>
              </div>
            </div>
          </div>

          <!-- ZAKŁADKA: TABELA LIGI -->
          <div v-else class="card standings-showcase-card">
            <div class="standings-showcase-header flex-between">
              <div>
                <div class="showcase-eyebrow">{{ t('draft.standingsEyebrow') }}</div>
                <h3>{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }} • {{ t('common.season') }} {{ selectedLeague.season }}</h3>
                <p class="showcase-sub">
                  {{ t('draft.standingsSubStart') }} {{ selectedLeague.scoring_from_date || t('draft.calSubStart') }}
                  <template v-if="selectedLeague.scoring_to_date"> {{ t('draft.toPrefix') }} {{ selectedLeague.scoring_to_date }}</template>.
                  {{ t('draft.standingsTieHint') }}
                </p>
              </div>
              <div class="league-top-actions">
                <button type="button" class="btn-dark-ghost" @click="expandAllStandings">{{ t('draft.expandAll') }}</button>
                <button v-if="expandedStandingUserIds.length > 0" type="button" class="btn-dark-ghost" @click="collapseAllStandings">
                  {{ t('draft.collapseBtn') }}
                </button>
              </div>
            </div>

            <div class="standings-showcase-body">
              <div class="standings-table-wrap">
                <table class="standings-table dark-table">
                  <thead>
                    <tr>
                      <th class="col-rank-th">{{ t('draft.thPos') }}</th>
                      <th>{{ t('draft.thPlayer') }}</th>
                      <th class="col-roster-th">{{ t('draft.thSquad') }}</th>
                      <th class="th-pts">{{ t('draft.thSumPts') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(row, rIdx) in (selectedLeague.standings as any[])" :key="row.user_id">
                      <tr
                        class="dark-standing-row"
                        :class="{ 'me-row': row.user_id === myUserId, expanded: isStandingExpanded(row.user_id) }"
                        @click="toggleStandingRow(row.user_id)"
                      >
                        <td class="td-rank">
                          <span v-if="rIdx === 0" class="rank-pill gold">🥇 1</span>
                          <span v-else-if="rIdx === 1" class="rank-pill silver">🥈 2</span>
                          <span v-else-if="rIdx === 2" class="rank-pill bronze">🥉 3</span>
                          <span v-else class="rank-pill rest">{{ rIdx + 1 }}</span>
                        </td>
                        <td class="td-player">
                          <div class="u-left">
                            <img v-if="row.picture" :src="row.picture" class="p-avatar" alt="Avatar" />
                            <div class="player-name-stack">
                              <strong class="player-name-text">
                                {{ row.name }}
                                <span v-if="row.user_id === myUserId" class="me-tag">{{ t('draft.youTag') }}</span>
                              </strong>
                              <span class="mobile-roster-pill">
                                {{ formatJumpersCount(row.picks_count) }} {{ isStandingExpanded(row.user_id) ? '▴' : '▾' }}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td class="td-roster-toggle">
                          <span class="roster-expand-pill dark">
                            {{ formatJumpersCount(row.picks_count) }} {{ isStandingExpanded(row.user_id) ? '▴' : '▾' }}
                          </span>
                        </td>
                        <td class="td-total-pts">
                          <strong>{{ row.total_points }}</strong> <span class="pts-unit">{{ t('common.pts') }}</span>
                          <div v-if="rIdx > 0" class="pts-gap-sub">
                            {{ t('draft.gapBehind', { pts: Math.round((leaderPoints - row.total_points) * 10) / 10 }) }}
                          </div>
                        </td>
                      </tr>
                      <tr v-if="isStandingExpanded(row.user_id)" class="dark-breakdown">
                        <td colspan="4">
                          <div class="breakdown-panel">
                            <div class="breakdown-top-bar">
                              <span class="breakdown-title">{{ t('draft.squadLabel') }} <strong>{{ row.name }}</strong></span>
                              <button type="button" class="details-modal-link" @click.stop="openPlayerDetailsModal(row)">
                                {{ t('draft.scoringDetails') }}
                              </button>
                            </div>
                            <table class="roster-points-table">
                              <thead>
                                <tr>
                                  <th style="width: 44px">{{ t('common.country') }}</th>
                                  <th>{{ t('draft.thAthlete') }}</th>
                                  <th style="text-align: right; width: 96px">{{ t('common.points') }}</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="pk in row.picks" :key="pk.fis_code">
                                  <td><CountryFlag :code="pk.country_code" size="xs" /></td>
                                  <td class="rp-name">
                                    <div class="rp-ath-cell">
                                      <span class="ath-mini-avatar-wrap small">
                                        <img
                                          v-if="getAthleteAvatarUrl(pk)"
                                          :src="getAthleteAvatarUrl(pk)!"
                                          :alt="pk.full_name"
                                          class="ath-mini-avatar"
                                          loading="lazy"
                                          @error="markAthleteAvatarFailed(pk)"
                                        />
                                        <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pk.full_name) }}</span>
                                      </span>
                                      <span>{{ pk.full_name }}</span>
                                    </div>
                                  </td>
                                  <td class="rp-pts">+{{ pk.points }} {{ t('common.pts') }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <div class="scope-box dark-scope-summary">
                <div class="scope-head-row">
                  <div>
                    <h5>{{ t('draft.scoringRangeTitle') }}</h5>
                    <p>
                      {{ t('draft.scoringFromPrefix') }} <strong>{{ scoringStartDisplay }}</strong>
                      <template v-if="selectedLeague.scoring_to_date"> • {{ t('draft.scoringToPrefix') }} <strong>{{ selectedLeague.scoring_to_date }}</strong></template>
                    </p>
                  </div>
                  <button type="button" class="btn-dark-link" @click="openCalendarTab">{{ t('draft.fullCalLink') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- MODAL POTWIERDZENIA WYBORU (MISCLICK GUARD) -->
    <div v-if="pendingPickAthlete" class="confirm-overlay" @click.self="cancelPickConfirmation">
      <div class="confirm-modal">
        <h3>{{ t('draft.pickConfirmTitle') }}</h3>
        <p class="confirm-player-line">
          {{ t('draft.confirmPickText') }}
          <CountryFlag :code="pendingPickAthlete.country_code" size="sm" :show-code="true" />
          <span class="ath-mini-avatar-wrap small">
            <img
              v-if="getAthleteAvatarUrl(pendingPickAthlete)"
              :src="getAthleteAvatarUrl(pendingPickAthlete)!"
              :alt="pendingPickAthlete.full_name"
              class="ath-mini-avatar"
              @error="markAthleteAvatarFailed(pendingPickAthlete)"
            />
            <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pendingPickAthlete.full_name) }}</span>
          </span>
          <strong>{{ pendingPickAthlete.full_name }}</strong>
          {{ t('draft.confirmFisCode', { code: pendingPickAthlete.fis_code }) }}
        </p>
        <p class="confirm-sub">{{ t('draft.confirmPickSub') }}</p>
        <div class="confirm-actions">
          <button type="button" class="btn-secondary" :disabled="isBusy" @click="cancelPickConfirmation">
            ✕ {{ t('common.cancel') }}
          </button>
          <button type="button" class="btn-start-draft" :disabled="isBusy" @click="confirmPickAthlete">
            {{ t('draft.confirmPickYes') }}
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL SZCZEGÓŁÓW PUNKTACJI GRACZA -->
    <div v-if="detailsModalPlayer" class="confirm-overlay" @click.self="closePlayerDetailsModal">
      <div class="score-details-modal">
        <div class="sdm-header">
          <div>
            <h3>{{ t('draft.scoreDetailsTitle', { name: detailsModalPlayer.name }) }}</h3>
            <small class="sdm-sub">
              {{ t('draft.scoreDetailsTotal') }} <strong>{{ detailsModalPlayer.total_points }} {{ t('common.pts') }}</strong> • {{ t('draft.scoreDetailsClickHint') }}
            </small>
          </div>
          <button type="button" class="sdm-close-btn" @click="closePlayerDetailsModal" :aria-label="t('common.close')">&times;</button>
        </div>
        <div class="sdm-body">
          <div v-for="pk in detailsModalPlayer.picks" :key="pk.fis_code" class="sdm-athlete-item">
            <button type="button" class="sdm-athlete-toggle" @click="toggleModalAthlete(pk.fis_code)">
              <span class="sdm-ath-left">
                <span class="ath-mini-avatar-wrap small">
                  <img
                    v-if="getAthleteAvatarUrl(pk)"
                    :src="getAthleteAvatarUrl(pk)!"
                    :alt="pk.full_name"
                    class="ath-mini-avatar"
                    loading="lazy"
                    @error="markAthleteAvatarFailed(pk)"
                  />
                  <span v-else class="ath-mini-avatar-fallback">{{ getAthleteInitials(pk.full_name) }}</span>
                </span>
                <CountryFlag :code="pk.country_code" size="xs" />
                <strong>{{ pk.full_name }}</strong>
              </span>
              <span class="sdm-ath-right">
                <strong class="sdm-ath-pts">+{{ pk.points }} {{ t('common.pts') }}</strong>
                <span class="sdm-arrow">{{ expandedModalAthletes[String(pk.fis_code)] ? '▴' : '▾' }}</span>
              </span>
            </button>
            <div v-if="expandedModalAthletes[String(pk.fis_code)]" class="sdm-athlete-events">
              <table v-if="pk.events?.length" class="sdm-events-table">
                <thead>
                  <tr>
                    <th>{{ t('common.hill') }}</th>
                    <th>{{ t('common.date') }}</th>
                    <th style="text-align: center">{{ t('draft.thPos') }}</th>
                    <th style="text-align: right">{{ t('common.pts') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(ev, eIdx) in pk.events" :key="`${ev.session_id}_${eIdx}`">
                    <td>{{ ev.event_place }}</td>
                    <td>{{ ev.date }}</td>
                    <td style="text-align: center">{{ ev.rank || '-' }}</td>
                    <td style="text-align: right; color: #16a34a; font-weight: 700">+{{ ev.points }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="sdm-no-events">{{ t('draft.noEventPoints') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.league-room-page {
  padding: 18px 16px 48px;
  background: #f8fafc;
  min-height: calc(100vh - 70px);
}

.league-room-container {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.room-top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-back-hub {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 9px;
  padding: 7px 13px;
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
}

.btn-back-hub:hover {
  border-color: #0284c7;
  color: #0284c7;
}

.league-switcher-select {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #0f172a;
  border-radius: 9px;
  padding: 7px 12px;
  font-size: 0.84rem;
  font-weight: 700;
}

/* Masthead Ligi */
.league-masthead {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  color: #ffffff;
  border-radius: 16px;
  padding: 20px 24px 0;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lm-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
}

.lm-stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.step-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #94a3b8;
}

.step-pill.done {
  background: rgba(34, 197, 94, 0.22);
  color: #86efac;
}

.step-pill.active {
  background: #38bdf8;
  color: #0f172a;
  font-weight: 800;
}

.step-sep {
  color: #64748b;
  font-size: 0.78rem;
}

.lm-title-col h1 {
  margin: 0 0 8px;
  font-size: 1.55rem;
}

.lm-badges-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.meta-pill {
  background: rgba(255, 255, 255, 0.14);
  color: #e2e8f0;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 7px;
}

.lm-sub {
  color: #cbd5e1;
  font-size: 0.82rem;
}

.lm-actions-col {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-glass,
.btn-glass-code,
.btn-glass-danger {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-glass-code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.1em;
}

.btn-glass-danger {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(252, 165, 165, 0.4);
  color: #fecaca;
}

.lm-tabs-bar {
  display: flex;
  gap: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  padding-top: 12px;
  overflow-x: auto;
}

.lm-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: #cbd5e1;
  padding: 8px 14px 12px;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.lm-tab-btn.active {
  color: #ffffff;
  border-bottom-color: #38bdf8;
}

/* Status pills */
.status-pill {
  font-size: 0.74rem;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 999px;
}
.status-pill.lobby { background: #fef3c7; color: #92400e; }
.status-pill.active_draft { background: #bae6fd; color: #0c4a6e; }
.status-pill.draft_finished { background: #f3e8ff; color: #6b21a8; }
.status-pill.league_active, .status-pill.completed { background: #bbf7d0; color: #14532d; }

/* Alerts & Banners */
.alert-box { padding: 11px 14px; border-radius: 10px; font-size: 0.88rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.alert-box.error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }
.alert-box.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

.invite-banner,
.launch-banner {
  background: #eff6ff;
  border: 1.5px solid #93c5fd;
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.launch-banner { background: #faf5ff; border-color: #d8b4fe; }
.invite-banner h3, .launch-banner h3 { margin: 0 0 4px; color: #1e3a8a; }
.launch-banner h3 { color: #6b21a8; }

.invite-banner-actions { display: flex; gap: 8px; }
.btn-accept { background: #16a34a; color: #ffffff; border: none; border-radius: 8px; padding: 9px 14px; font-weight: 700; cursor: pointer; }
.btn-decline { background: #ffffff; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 9px 14px; font-weight: 700; cursor: pointer; }

/* Karty wspólne */
.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  min-width: 0;
}
.card-header { padding: 14px 18px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
.card-header h3 { margin: 0; font-size: 1rem; color: #0f172a; }
.subtitle { margin: 4px 0 0; font-size: 0.82rem; color: #64748b; }
.card-body { padding: 16px 18px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.form-stack { display: flex; flex-direction: column; gap: 12px; }
.form-row-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 5px; }
.form-group label { font-size: 0.8rem; font-weight: 700; color: #334155; }
.form-input, .form-select { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 0.88rem; background: #ffffff; box-sizing: border-box; }
.hint-text { font-size: 0.78rem; color: #64748b; }
.btn-secondary { background: #f1f5f9; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 13px; font-weight: 700; font-size: 0.82rem; cursor: pointer; }
.btn-start-draft { background: linear-gradient(135deg, #16a34a, #22c55e); color: #ffffff; border: none; border-radius: 9px; padding: 10px 16px; font-weight: 800; font-size: 0.88rem; cursor: pointer; }
.btn-start-draft:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-link-xs { background: none; border: none; color: #0284c7; font-size: 0.78rem; font-weight: 700; cursor: pointer; padding: 0; }
.cutoff-toggle-line { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Lobby */
.lobby-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; align-items: start; }
.rules-summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.rule-tile { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.rule-tile span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748b; }
.rule-tile strong { font-size: 0.92rem; color: #0f172a; }
.snake-hint-box { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 10px 12px; border-radius: 9px; font-size: 0.82rem; font-weight: 600; }
.cutoff-info-box { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; padding: 10px 12px; border-radius: 9px; font-size: 0.8rem; display: flex; flex-direction: column; gap: 3px; }
.lobby-actions-row { display: flex; gap: 10px; flex-wrap: wrap; }

.participants-list { display: flex; flex-direction: column; gap: 8px; }
.participant-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
.participant-row.invited { border-style: dashed; background: #fffbeb; }
.order-num { font-weight: 800; color: #0284c7; min-width: 24px; }
.p-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.p-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.p-info small { color: #64748b; font-size: 0.74rem; }
.order-btns { display: flex; gap: 4px; }
.btn-tiny { border: 1px solid #cbd5e1; background: #ffffff; border-radius: 6px; padding: 4px 8px; font-weight: 800; cursor: pointer; }
.btn-tiny.danger { color: #b91c1c; border-color: #fecaca; }

.invite-code-box { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; background: #eff6ff; border: 1px dashed #60a5fa; border-radius: 10px; padding: 10px 12px; }
.invite-code-meta { display: flex; flex-direction: column; gap: 2px; }
.invite-code-meta strong { font-size: 0.86rem; color: #0f172a; }
.invite-code-meta small { font-size: 0.75rem; color: #475569; }
.invite-code-actions { display: flex; align-items: center; gap: 8px; }
.invite-code-pill { background: #0f172a; color: #f8fafc; padding: 5px 11px; border-radius: 7px; font-family: ui-monospace, monospace; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.1em; }
.btn-copy-code { background: #ffffff; color: #0369a1; border: 1px solid #93c5fd; border-radius: 7px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }

.invite-search-box h4 { margin: 0 0 8px; font-size: 0.9rem; color: #0f172a; }
.search-bar-row { display: flex; gap: 8px; margin-bottom: 10px; }
.invite-results { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.invite-user-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 8px; }
.u-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.btn-invite-sm { background: #0284c7; color: #ffffff; border: none; border-radius: 7px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.btn-invite-sm:disabled { background: #e2e8f0; color: #64748b; cursor: not-allowed; }

/* FAZA 2: FPL DRAFT ROOM */
.active-draft-section { display: flex; flex-direction: column; gap: 16px; }

.turn-banner {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #ffffff;
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 2px solid #334155;
}
.turn-banner.my-turn {
  background: linear-gradient(135deg, #064e3b 0%, #0f172a 100%);
  border-color: #22c55e;
  box-shadow: 0 8px 24px rgba(34, 197, 94, 0.22);
}
.round-tag { display: inline-block; font-size: 0.75rem; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
.turn-banner.my-turn .round-tag { color: #86efac; }
.turn-banner h2 { margin: 0; font-size: 1.18rem; }

.turn-progress-bar { height: 7px; background: rgba(255, 255, 255, 0.14); border-radius: 999px; overflow: hidden; }
.turn-progress-fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #22c55e); border-radius: 999px; transition: width 0.3s ease; }

.snake-queue-strip { display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.queue-label { font-size: 0.75rem; font-weight: 700; color: #94a3b8; white-space: nowrap; }
.queue-pill { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; border-radius: 7px; padding: 4px 9px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
.queue-pill.current { background: #38bdf8; color: #0f172a; font-weight: 800; }
.queue-pill.me { border: 1px solid #22c55e; }

.draft-board-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: 16px; align-items: start; }
.pool-header-stack { display: flex; flex-direction: column; gap: 10px; }
.pool-right-controls { display: flex; align-items: center; gap: 10px; }
.hide-picked-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 0.78rem; font-weight: 700; color: #334155; cursor: pointer; }
.sort-select-sm { width: auto; padding: 5px 8px; font-size: 0.78rem; }
.pool-filters-bar { display: flex; flex-direction: column; gap: 8px; }
.pool-filters-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
.country-dropdown-wrap { position: relative; }
.country-dd-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
  min-width: 190px; max-width: 280px; padding: 8px 11px;
  background: #ffffff; color: #334155; border: 1px solid #cbd5e1; border-radius: 9px;
  font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: border-color 0.14s, background 0.14s;
}
.country-dd-trigger:hover { border-color: #94a3b8; background: #f8fafc; }
.country-dd-trigger.active { border-color: #0284c7; background: #f0f9ff; color: #0f172a; }
.country-dd-placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.country-dd-selected-tags { display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap; overflow: hidden; }
.country-dd-mini-tag { display: inline-flex; align-items: center; gap: 3px; background: #e0f2fe; color: #0369a1; border-radius: 5px; padding: 1px 5px; font-size: 0.74rem; font-weight: 800; }
.country-dd-more { font-size: 0.74rem; color: #0369a1; font-weight: 800; }
.country-dd-caret { font-size: 0.72rem; color: #64748b; flex-shrink: 0; }
.country-dd-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
  width: 270px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16); padding: 8px; display: flex; flex-direction: column; gap: 6px;
}
.country-dd-header { display: flex; align-items: center; gap: 6px; }
.country-dd-search {
  flex: 1; min-width: 0; padding: 6px 9px; font-size: 0.78rem;
  border: 1px solid #cbd5e1; border-radius: 7px; outline: none;
}
.country-dd-search:focus { border-color: #0284c7; }
.country-dd-clear-btn {
  background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 7px;
  padding: 5px 8px; font-size: 0.72rem; font-weight: 800; cursor: pointer; white-space: nowrap;
}
.country-dd-summary { font-size: 0.72rem; font-weight: 700; color: #0369a1; padding: 0 4px; }
.country-dd-list { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.country-dd-empty { padding: 12px 8px; text-align: center; font-size: 0.78rem; color: #64748b; }
.country-dd-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px;
  font-size: 0.8rem; font-weight: 700; color: #1e293b; cursor: pointer; transition: background 0.1s;
}
.country-dd-item:hover { background: #f1f5f9; }
.country-dd-item.checked { background: #f0f9ff; color: #0f172a; }
.country-dd-code { font-weight: 800; letter-spacing: 0.02em; }
.country-dd-count { margin-left: auto; font-size: 0.72rem; color: #64748b; font-weight: 600; }
.wc-pts-pill { background: #dcfce7; color: #166534; font-weight: 800; padding: 1px 6px; border-radius: 5px; }

.pool-list { max-height: 600px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.pool-athlete-row {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 10px; transition: border-color 0.14s;
}
.pool-athlete-row:hover { border-color: #93c5fd; background: #f8fafc; }
.ath-meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ath-text-col { display: flex; flex-direction: column; min-width: 0; }
.esm-price-pill { background: #e0f2fe; color: #0369a1; font-weight: 800; padding: 1px 6px; border-radius: 5px; }

.ath-mini-avatar-wrap {
  width: 34px; height: 34px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
  border: 1px solid #cbd5e1; background: #f1f5f9; display: inline-flex; align-items: center; justify-content: center;
}
.ath-mini-avatar-wrap.small { width: 28px; height: 28px; border: 1.5px solid #cbd5e1; }
.ath-mini-avatar-wrap.xs { width: 20px; height: 20px; border: 1px solid #cbd5e1; }
.ath-mini-avatar-wrap.xs .ath-mini-avatar-fallback { font-size: 0.56rem; }
.rp-ath-cell { display: flex; align-items: center; gap: 8px; }
.cutoff-info-box.info-clean { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
.ath-mini-avatar { width: 100%; height: 100%; object-fit: cover; }
.ath-mini-avatar-fallback { font-size: 0.72rem; font-weight: 800; color: #1e3a8a; }

.picked-by-tag { background: #f1f5f9; color: #64748b; padding: 5px 10px; border-radius: 7px; font-size: 0.75rem; font-weight: 700; }
.btn-pick { background: #0284c7; color: #ffffff; border: none; border-radius: 8px; padding: 7px 14px; font-weight: 800; font-size: 0.82rem; cursor: pointer; }
.btn-pick:disabled { opacity: 0.4; cursor: not-allowed; }

/* Sticky Your Squad Panel */
.draft-side-stack { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 82px; }
.my-squad-slots { display: flex; flex-direction: column; gap: 6px; }
.squad-slot-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 9px; font-size: 0.84rem; }
.squad-slot-row.filled { background: #f0fdf4; border: 1px solid #bbf7d0; }
.squad-slot-row.empty { background: #f8fafc; border: 1px dashed #cbd5e1; color: #94a3b8; }
.slot-index { width: 22px; height: 22px; border-radius: 6px; background: #0f172a; color: #ffffff; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.squad-slot-row.empty .slot-index { background: #e2e8f0; color: #64748b; }
.slot-ath-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #0f172a; }
.slot-round-tag { background: #dcfce7; color: #166534; font-size: 0.72rem; font-weight: 800; padding: 2px 6px; border-radius: 5px; }

.live-rosters { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; }
.roster-box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #f8fafc; }
.roster-box.is-on-clock { border-color: #2563eb; background: #eff6ff; }
.roster-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.84rem; }
.roster-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.pick-chip { display: inline-flex; align-items: center; gap: 4px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 999px; padding: 3px 8px; font-size: 0.74rem; font-weight: 700; }
.pick-r { color: #0284c7; }

/* Tablica Drafta Matrix */
.table-responsive { width: 100%; overflow-x: auto; }
.draft-matrix-table { width: 100%; border-collapse: separate; border-spacing: 6px; min-width: 680px; }
.draft-matrix-table th { text-align: left; font-size: 0.8rem; color: #475569; padding: 6px 8px; }
.th-round { width: 76px; }
.matrix-mgr-head { background: #f1f5f9; border-radius: 8px; padding: 6px 10px; font-weight: 800; color: #0f172a; }
.matrix-mgr-head.me { background: #0f172a; color: #38bdf8; }
.td-round { background: #f8fafc; border-radius: 8px; padding: 8px; text-align: center; font-size: 0.82rem; color: #0f172a; }
.snake-dir { display: block; color: #0284c7; font-size: 0.9rem; }
.matrix-cell { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 9px; padding: 8px 10px; min-width: 145px; vertical-align: middle; }
.matrix-cell.filled { background: #f0f9ff; border: 1px solid #93c5fd; }
.matrix-cell.active { background: #dcfce7; border: 2px solid #16a34a; }
.mpc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
.mpc-num { font-size: 0.7rem; font-weight: 800; color: #0284c7; }
.mpc-name { font-size: 0.82rem; color: #0f172a; }
.matrix-now-badge { font-size: 0.78rem; font-weight: 800; color: #166534; }
.matrix-pending-slot { font-size: 0.75rem; color: #94a3b8; }

.finished-rosters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }

/* FAZA 4: TABELA LIGI & SKŁADY */
.standings-showcase-card { background: linear-gradient(180deg, #0f172a 0%, #172554 100%); color: #f8fafc; border-color: #1e3a8a; }
.standings-showcase-header { padding: 20px 22px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); }
.showcase-eyebrow { font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; color: #38bdf8; margin-bottom: 4px; }
.standings-showcase-header h3 { margin: 0 0 4px; font-size: 1.2rem; color: #ffffff; }
.showcase-sub { margin: 0; font-size: 0.82rem; color: #cbd5e1; }
.league-top-actions { display: flex; gap: 8px; }
.btn-dark-ghost { background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.24); color: #f8fafc; border-radius: 8px; padding: 6px 11px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.standings-showcase-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 16px; }
.standings-table-wrap { overflow-x: auto; }
.standings-table.dark-table { width: 100%; border-collapse: collapse; }
.standings-table.dark-table th { text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; padding: 8px 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); }
.th-pts { text-align: right !important; }
.dark-standing-row { cursor: pointer; transition: background 0.14s; }
.dark-standing-row:hover { background: rgba(255, 255, 255, 0.05); }
.dark-standing-row.me-row { background: rgba(56, 189, 248, 0.12); }
.dark-standing-row td { padding: 12px 10px; border-bottom: 1px solid rgba(148, 163, 184, 0.14); }
.rank-pill { display: inline-block; font-size: 0.78rem; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
.rank-pill.gold { background: #fef08a; color: #713f12; }
.rank-pill.silver { background: #e2e8f0; color: #1e293b; }
.rank-pill.bronze { background: #fed7aa; color: #7c2d12; }
.rank-pill.rest { background: rgba(255, 255, 255, 0.12); color: #e2e8f0; }
.me-tag { background: #38bdf8; color: #0f172a; font-size: 0.68rem; font-weight: 900; padding: 1px 6px; border-radius: 5px; margin-left: 6px; }
.mobile-roster-pill { display: none; font-size: 0.74rem; color: #94a3b8; }
.roster-expand-pill.dark { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; padding: 4px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 700; }
.td-total-pts { text-align: right; white-space: nowrap; }
.td-total-pts strong { font-size: 1.08rem; color: #38bdf8; }
.pts-unit { font-size: 0.76rem; color: #94a3b8; }
.pts-gap-sub { font-size: 0.7rem; color: #94a3b8; margin-top: 2px; }

.breakdown-panel { background: #ffffff; color: #0f172a; border-radius: 10px; padding: 12px 14px; margin: 6px 0; }
.breakdown-top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
.details-modal-link { background: #e0f2fe; color: #0369a1; border: none; border-radius: 7px; padding: 5px 10px; font-size: 0.78rem; font-weight: 800; cursor: pointer; }
.roster-points-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.roster-points-table th { text-align: left; color: #64748b; font-size: 0.72rem; border-bottom: 1px solid #e2e8f0; padding: 5px 6px; }
.roster-points-table td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
.rp-pts { text-align: right; color: #16a34a; font-weight: 800; }

.competitions-scope-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.scope-box { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 10px; padding: 12px 14px; font-size: 0.8rem; }
.scope-box h5 { margin: 0 0 6px; font-size: 0.84rem; color: #e2e8f0; }
.scope-box p { margin: 0; color: #cbd5e1; line-height: 1.45; }
.dark-muted { color: #94a3b8 !important; }
.scope-head-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.btn-dark-link { background: none; border: none; color: #38bdf8; font-size: 0.78rem; font-weight: 700; cursor: pointer; padding: 0; }

/* Porównanie Składów */
.squads-comparison-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
.squad-manager-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 3px 10px rgba(15, 23, 42, 0.04); }
.squad-manager-card.me-squad { border: 2px solid #0284c7; }
.smc-header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.smc-rank { background: rgba(255, 255, 255, 0.16); padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.8rem; }
.smc-header small { display: block; font-size: 0.72rem; }
.gap-leader { color: #86efac; }
.gap-behind { color: #cbd5e1; }
.smc-total-pts strong { font-size: 1.15rem; color: #38bdf8; }
.smc-total-pts span { font-size: 0.72rem; color: #cbd5e1; }
.smc-roster-list { padding: 10px 14px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
.smc-athlete-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.84rem; padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
.smc-ath-pts { color: #16a34a; font-weight: 800; white-space: nowrap; }
.smc-footer { padding: 10px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }

/* Kalendarz */
.cal-filter-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.cal-filter-btn { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 999px; padding: 5px 11px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.cal-filter-btn.active { background: #0f172a; color: #ffffff; border-color: #0f172a; }
.cal-events-list { display: flex; flex-direction: column; gap: 8px; }
.cal-event-item { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.cal-event-item.cal-in-scope { border-left: 4px solid #16a34a; }
.cal-event-item.cal-excluded { border-left: 4px solid #94a3b8; opacity: 0.8; }
.cal-ev-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.cal-ev-dates { font-size: 0.78rem; color: #64748b; }
.cal-pill { font-size: 0.72rem; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
.cal-pill.active-done { background: #dcfce7; color: #166534; }
.cal-pill.active-future { background: #dbeafe; color: #1e40af; }
.cal-pill.excluded { background: #f1f5f9; color: #64748b; }
.cal-ev-sessions { display: flex; flex-wrap: wrap; gap: 6px; }
.cal-session-link { background: #eff6ff; color: #0369a1; text-decoration: none; padding: 4px 9px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; }

/* Modale */
.confirm-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.56); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 1300; }
.confirm-modal, .score-details-modal { background: #ffffff; border-radius: 14px; padding: 20px 22px; width: 100%; max-width: 520px; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.28); }
.confirm-player-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 0.94rem; }
.confirm-sub { color: #64748b; font-size: 0.84rem; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.score-details-modal { max-width: 580px; padding: 0; overflow: hidden; }
.sdm-header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: flex-start; }
.sdm-header h3 { margin: 0 0 3px; font-size: 1.05rem; }
.sdm-sub { color: #cbd5e1; font-size: 0.8rem; }
.sdm-close-btn { background: rgba(255, 255, 255, 0.16); color: #ffffff; border: none; width: 28px; height: 28px; border-radius: 7px; font-size: 1.15rem; cursor: pointer; }
.sdm-body { padding: 14px 18px; max-height: 68vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.sdm-athlete-item { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
.sdm-athlete-toggle { width: 100%; background: #f8fafc; border: none; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.sdm-ath-left { display: flex; align-items: center; gap: 8px; }
.sdm-ath-right { display: flex; align-items: center; gap: 8px; }
.sdm-ath-pts { color: #16a34a; }
.sdm-events-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.sdm-events-table th { text-align: left; color: #64748b; font-size: 0.72rem; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
.sdm-events-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
.sdm-no-events { padding: 10px 12px; margin: 0; color: #64748b; font-size: 0.82rem; }
.empty-side { padding: 20px; text-align: center; color: #64748b; }

@media (max-width: 960px) {
  .lobby-grid, .draft-board-grid, .competitions-scope-grid { grid-template-columns: 1fr; }
  .draft-side-stack { position: static; }
}
@media (max-width: 640px) {
  .form-row-2, .rules-summary-grid, .pool-filters-row { grid-template-columns: 1fr; }
  .pool-header-stack .flex-between { flex-wrap: wrap; gap: 8px; }
  .pool-right-controls { width: 100%; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .pool-athlete-row { padding: 8px 10px; gap: 8px; }
  .ath-meta { gap: 7px; overflow: hidden; }
  .ath-text-col strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.9rem; }
  .ath-action-col { flex-shrink: 0; }
  .picked-by-tag { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; padding: 4px 8px; font-size: 0.72rem; }
  .btn-pick { padding: 6px 11px; font-size: 0.78rem; }
  .country-dd-trigger { width: 100%; max-width: none; }
  .country-dd-menu { left: 0; right: auto; width: 100%; }
  .league-masthead { padding: 14px 14px 0; }
  .lm-tabs-bar { flex-wrap: wrap; overflow-x: visible; gap: 4px; }
  .lm-tab-btn { padding: 7px 10px 10px; font-size: 0.78rem; }
  .standings-showcase-header { padding: 14px 14px; }
  .standings-showcase-body { padding: 12px 10px; }
  .standings-table.dark-table th { padding: 6px 4px; font-size: 0.68rem; }
  .dark-standing-row td { padding: 9px 4px; font-size: 0.84rem; }
  .col-roster-th, .td-roster-toggle { display: none; }
  .mobile-roster-pill { display: inline-block; margin-top: 3px; }
}
</style>
