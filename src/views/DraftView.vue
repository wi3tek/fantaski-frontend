<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useNotifications } from '@/stores/notifications'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const { fetchNotifications, lastDraftEvent } = useNotifications()

const myUserId = computed(() => auth.user.value?.id || '')

const isLoadingList = ref(true)
const isLoadingDetail = ref(false)
const isBusy = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const eligibility = ref<{ eligible: boolean; reason: string; active_leagues_count: number; role: string }>({
  eligible: true,
  reason: '',
  active_leagues_count: 0,
  role: 'USER',
})
const leagues = ref<any[]>([])
const selectedLeagueId = ref<string | null>(null)
const selectedLeague = ref<any>(null)

const picksCountOptions = [3, 4, 5, 6, 7, 8]

const tournamentOptions = [
  { code: 'WC', label: 'Puchar Świata (WC)' },
  { code: 'TCS', label: '🦅 Turniej Czterech Skoczni (TCS)' },
  { code: 'RAW_AIR', label: '🇳🇴 Raw Air (RAW_AIR)' },
  { code: 'PLANICA_7', label: '🇸🇮 Planica 7 (PLANICA_7)' },
  { code: 'OWG', label: '🏅 Igrzyska Olimpijskie (OWG)' },
  { code: 'WSC', label: '🌍 Mistrzostwa Świata (WSC)' },
  { code: 'SFWC', label: '🦅 MŚ w Lotach (SFWC)' },
  { code: 'GP', label: '☀️ Letnie Grand Prix (GP)' },
  { code: 'COC', label: 'Puchar Kontynentalny (COC)' },
  { code: 'FC', label: 'FIS Cup (FC)' },
]

// Kreator nowej ligi i dołączanie kodem
const showCreateBox = ref(false)
const showJoinBox = ref(false)
const joinCodeInput = ref('')
const codeCopied = ref(false)
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

// Edycja konfiguracji lobby
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
  recommended_scoring_to_date: '',
  recommended_scoring_from_date: '',
})
const lobbyShowCustomDates = ref(false)

// Zakładka widoku ligi: Główny widok (Tabela / Draft / Lobby) vs Kalendarz Ligi
const activeLeagueSubTab = ref<'main' | 'calendar'>('main')
const leagueCalendarEvents = ref<any[]>([])
const isLoadingCalendar = ref(false)
const calendarFilterMode = ref<'all' | 'participating' | 'upcoming' | 'excluded'>('all')

// Zapraszanie graczy
const inviteQuery = ref('')
const inviteCandidates = ref<any[]>([])
const isSearchingUsers = ref(false)
let inviteDebounce: any = null

// Pula aktywnych zawodników do wyboru + modal potwierdzenia misclicka
const athleteQuery = ref('')
const athleteCountry = ref('')
const activeAthletes = ref<any[]>([])
const isLoadingAthletes = ref(false)
const pendingPickAthlete = ref<any>(null)
const failedAthleteAvatars = ref<Record<string, boolean>>({})

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

const getAthleteInitials = (fullName?: string): string => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '⛷'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase()
}

// Wielokrotne rozwijanie graczy w tabeli klasyfikacji
const expandedStandingUserIds = ref<string[]>([])
const detailsModalPlayer = ref<any | null>(null)
const expandedModalAthletes = ref<Record<string, boolean>>({})

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
  if (isStandingExpanded(userId)) {
    expandedStandingUserIds.value = expandedStandingUserIds.value.filter((id) => id !== userId)
  } else {
    expandedStandingUserIds.value = [...expandedStandingUserIds.value, userId]
  }
}

const expandAllStandings = () => {
  const rows = selectedLeague.value?.standings || []
  expandedStandingUserIds.value = rows.map((r: any) => r.user_id)
}

const collapseAllStandings = () => {
  expandedStandingUserIds.value = []
}

let fallbackPollTimer: any = null

const categoryLabels: Record<string, string> = {
  WC: 'Puchar Świata (WC)',
  TCS: '🦅 Turniej Czterech Skoczni (TCS)',
  RAW_AIR: '🇳🇴 Raw Air',
  PLANICA_7: '🇸🇮 Planica 7',
  OWG: '🏅 Igrzyska Olimpijskie (OWG)',
  WSC: '🌍 Mistrzostwa Świata (WSC)',
  SFWC: '🦅 MŚ w Lotach (SFWC)',
  GP: '☀️ Letnie Grand Prix (GP)',
  COC: 'Puchar Kontynentalny (COC)',
  FC: 'FIS Cup (FC)',
}

const statusLabels: Record<string, string> = {
  LOBBY: 'Oczekuje na START',
  ACTIVE_DRAFT: 'Trwa DRAFT (Snake)',
  DRAFT_FINISHED: 'Draft zakończony — uruchom Ligę',
  LEAGUE_ACTIVE: 'Liga aktywna',
  COMPLETED: 'Liga aktywna',
}

const myParticipant = computed(() => {
  if (!selectedLeague.value) return null
  return (selectedLeague.value.participants || []).find((p: any) => p.user_id === myUserId.value) || null
})

const isCreator = computed(() => {
  return Boolean(selectedLeague.value && selectedLeague.value.creator_id === myUserId.value)
})

const isMyTurn = computed(() => {
  return Boolean(
    selectedLeague.value &&
      selectedLeague.value.status === 'ACTIVE_DRAFT' &&
      selectedLeague.value.current_turn_user_id === myUserId.value
  )
})

const currentTurnPlayerName = computed(() => {
  if (!selectedLeague.value?.current_turn_user_id) return ''
  const p = (selectedLeague.value.participants || []).find(
    (x: any) => x.user_id === selectedLeague.value.current_turn_user_id
  )
  return p?.name || 'Gracz'
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

const invitedParticipants = computed(() => {
  if (!selectedLeague.value) return []
  return (selectedLeague.value.participants || []).filter((p: any) => p.status === 'INVITED')
})

const fetchLeagueCalendar = async (leagueId?: string) => {
  const id = leagueId || selectedLeague.value?.id
  if (!id) return
  isLoadingCalendar.value = true
  try {
    const data = await api.get<any>(`/draft/leagues/${encodeURIComponent(id)}/calendar`)
    leagueCalendarEvents.value = data.events || []
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się pobrać kalendarza ligi.'
  } finally {
    isLoadingCalendar.value = false
  }
}

const openLeagueCalendarTab = async () => {
  activeLeagueSubTab.value = 'calendar'
  await fetchLeagueCalendar()
}

const filteredLeagueCalendarEvents = computed(() => {
  if (calendarFilterMode.value === 'participating') {
    return leagueCalendarEvents.value.filter((ev) => ev.participates)
  }
  if (calendarFilterMode.value === 'upcoming') {
    return leagueCalendarEvents.value.filter((ev) => ev.status === 'UPCOMING')
  }
  if (calendarFilterMode.value === 'excluded') {
    return leagueCalendarEvents.value.filter((ev) => !ev.participates)
  }
  return leagueCalendarEvents.value
})

const getSelectedCutoffCompLabel = (dateVal: string, options: any[]) => {
  if (!dateVal) return 'Wszystkie konkursy w turnieju'
  const exact = options.find((o) => o.date === dateVal)
  if (exact) return `${exact.place} (${exact.date_label})`
  return `Od daty ${dateVal}`
}

const onCutoffCompetitionChange = (target: 'create' | 'lobby', ev: Event) => {
  const val = (ev.target as HTMLSelectElement).value
  if (val === '__CUSTOM__') {
    if (target === 'create') createShowCustomDates.value = true
    else lobbyShowCustomDates.value = true
    return
  }
  if (target === 'create') {
    createForm.value.scoring_from_date = val
  } else {
    lobbyForm.value.scoring_from_date = val
  }
}

const loadCutoffPreview = async (season: string, categoryCode: string, target: 'create' | 'lobby') => {
  try {
    const data = await api.get<any>(
      `/draft/cutoff-preview?season=${encodeURIComponent(season)}&category_code=${encodeURIComponent(categoryCode)}`
    )
    const normalized = {
      finished_competitions: data.finished_competitions || [],
      upcoming_competitions: data.upcoming_competitions || [],
      competition_options: data.competition_options || [],
      recommended_scoring_from_date: data.recommended_scoring_from_date || '',
      recommended_scoring_to_date: data.recommended_scoring_to_date || '',
    }
    if (target === 'create') {
      createCutoffPreview.value = normalized
      createForm.value.scoring_from_date = normalized.recommended_scoring_from_date
      createForm.value.scoring_to_date = normalized.recommended_scoring_to_date
    } else {
      lobbyCutoffPreview.value = normalized
    }
  } catch {
    // ignore
  }
}

watch(
  () => [createForm.value.season, createForm.value.category_code],
  ([s, c]) => {
    if (showCreateBox.value && s && c) {
      loadCutoffPreview(String(s), String(c), 'create')
    }
  }
)

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

const openCreateBox = async () => {
  showJoinBox.value = false
  showCreateBox.value = true
  await loadCutoffPreview(createForm.value.season, createForm.value.category_code, 'create')
}

const openJoinBox = () => {
  errorMsg.value = ''
  successMsg.value = ''
  showCreateBox.value = false
  showJoinBox.value = true
}

const onJoinCodeInput = () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

const joinByCode = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  const code = joinCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 6) {
    errorMsg.value = 'Podaj poprawny kod zaproszenia (np. 8 znaków alfanumerycznych).'
    return
  }
  isBusy.value = true
  try {
    const joined = await api.post<any>('/draft/leagues/join-by-code', { code })
    showJoinBox.value = false
    joinCodeInput.value = ''
    successMsg.value = `Dołączono do ligi '${joined.name}'!`
    await fetchLeaguesList(false)
    await selectLeague(joined.id)
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się dołączyć do ligi po tym kodzie.'
  } finally {
    isBusy.value = false
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
    errorMsg.value = `Kod zaproszenia: ${code} (skopiuj ręcznie).`
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
  loadCutoffPreview(lobbyForm.value.season, lobbyForm.value.category_code, 'lobby')
}

const fetchLeaguesList = async (keepSelection = true, silent = false) => {
  if (!silent) isLoadingList.value = true
  try {
    const data = await api.get<any>('/draft/leagues')
    eligibility.value = data.eligibility || eligibility.value
    leagues.value = data.leagues || []

    const queryLeagueId = typeof route.query.league === 'string' ? route.query.league : null
    if (queryLeagueId && leagues.value.some((l) => l.id === queryLeagueId)) {
      selectedLeagueId.value = queryLeagueId
    } else if (!keepSelection || !selectedLeagueId.value || !leagues.value.some((l) => l.id === selectedLeagueId.value)) {
      selectedLeagueId.value = leagues.value[0]?.id || null
    }

    if (selectedLeagueId.value) {
      await fetchLeagueDetail(selectedLeagueId.value, silent)
    } else {
      selectedLeague.value = null
    }
  } catch (e: any) {
    if (!silent) errorMsg.value = e.message || 'Nie udało się pobrać lig drafta.'
  } finally {
    if (!silent) isLoadingList.value = false
  }
}

const fetchLeagueDetail = async (id: string, silent = false) => {
  if (!silent) isLoadingDetail.value = true
  try {
    const data = await api.get<any>(`/draft/leagues/${encodeURIComponent(id)}`)
    selectedLeague.value = data
    selectedLeagueId.value = data.id
    if (data.status === 'LOBBY') {
      syncLobbyFormFromLeague(data)
    } else if (data.status === 'ACTIVE_DRAFT' && activeAthletes.value.length === 0) {
      await fetchActiveAthletes()
    }
  } catch (e: any) {
    if (!silent) errorMsg.value = e.message || 'Błąd pobierania szczegółów ligi.'
  } finally {
    if (!silent) isLoadingDetail.value = false
  }
}

const selectLeague = async (id: string) => {
  errorMsg.value = ''
  successMsg.value = ''
  activeLeagueSubTab.value = 'main'
  leagueCalendarEvents.value = []
  selectedLeagueId.value = id
  router.replace({ path: '/draft', query: { league: id } })
  await fetchLeagueDetail(id)
  searchUsersToInvite()
}

const createLeague = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  if (!createForm.value.name.trim()) {
    errorMsg.value = 'Podaj nazwę ligi drafta.'
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
    showCreateBox.value = false
    createForm.value.name = ''
    successMsg.value = `Utworzono ligę '${created.name}' (${created.picks_per_player} zawodników/gracz)! Zaproś teraz graczy.`
    await fetchLeaguesList(false)
    await selectLeague(created.id)
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się utworzyć ligi.'
  } finally {
    isBusy.value = false
  }
}

const searchUsersToInvite = async () => {
  isSearchingUsers.value = true
  try {
    inviteCandidates.value = await api.get<any[]>(
      `/draft/users/search?q=${encodeURIComponent(inviteQuery.value.trim())}`
    )
  } catch (e: any) {
    errorMsg.value = e.message || 'Błąd wyszukiwania graczy.'
  } finally {
    isSearchingUsers.value = false
  }
}

const onInviteSearchInput = () => {
  if (inviteDebounce) clearTimeout(inviteDebounce)
  inviteDebounce = setTimeout(() => {
    searchUsersToInvite()
  }, 220)
}

const inviteUser = async (userId: string) => {
  if (!selectedLeague.value) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/invite`, {
      user_id: userId,
    })
    selectedLeague.value = updated
    successMsg.value = 'Wysłano zaproszenie do ligi!'
    await searchUsersToInvite()
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się wysłać zaproszenia.'
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
    if (action === 'decline') {
      successMsg.value = 'Odrzucono zaproszenie.'
      await fetchLeaguesList(false)
    } else {
      selectedLeague.value = updated
      successMsg.value = 'Dołączono do ligi drafta!'
      await fetchLeaguesList(true)
    }
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się odpowiedzieć na zaproszenie.'
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
    errorMsg.value = e.message || 'Nie udało się usunąć gracza.'
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
    successMsg.value = 'Zapisano konfigurację ligi.'
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się zapisać konfiguracji.'
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
  if (!confirm('Rozpocząć DRAFT (kolejność Snake)? Po starcie nie będzie można zmienić ustawień ani dodać nowych graczy.')) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/start`, {})
    selectedLeague.value = updated
    successMsg.value = 'DRAFT ROZPOCZĘTY! Pierwszy gracz otrzymał powiadomienie.'
    await fetchActiveAthletes()
    await fetchNotifications()
    await fetchLeaguesList(true, true)
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się uruchomić drafta.'
  } finally {
    isBusy.value = false
  }
}

const launchSeasonLeague = async () => {
  if (!selectedLeague.value) return
  if (!confirm('Rozpocząć ligę i opublikować tabelę klasyfikacji generalnej dla wszystkich uczestników?')) return
  errorMsg.value = ''
  successMsg.value = ''
  isBusy.value = true
  try {
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/launch-league`, {})
    selectedLeague.value = updated
    successMsg.value = 'Liga rozpoczęta! Tabela klasyfikacji generalnej jest już aktywna dla wszystkich graczy.'
    await fetchNotifications()
    await fetchLeaguesList(true, true)
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się rozpocząć ligi.'
  } finally {
    isBusy.value = false
  }
}

const deleteLeague = async () => {
  if (!selectedLeague.value) return
  if (!confirm(`Czy na pewno usunąć ligę '${selectedLeague.value.name}'?`)) return
  isBusy.value = true
  try {
    await api.delete(`/draft/leagues/${selectedLeague.value.id}`)
    successMsg.value = 'Usunięto ligę drafta.'
    selectedLeagueId.value = null
    selectedLeague.value = null
    await fetchLeaguesList(false)
    await fetchNotifications()
  } catch (e: any) {
    errorMsg.value = e.message || 'Błąd usuwania ligi.'
  } finally {
    isBusy.value = false
  }
}

const fetchActiveAthletes = async () => {
  isLoadingAthletes.value = true
  try {
    activeAthletes.value = await api.get<any[]>(
      `/draft/athletes/active?q=${encodeURIComponent(athleteQuery.value.trim())}&country=${encodeURIComponent(athleteCountry.value.trim())}`
    )
  } catch {
    // ignore
  } finally {
    isLoadingAthletes.value = false
  }
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
    const updated = await api.post<any>(`/draft/leagues/${selectedLeague.value.id}/pick`, {
      fis_code: ath.fis_code,
    })
    selectedLeague.value = updated
    successMsg.value = `Wybrano zawodnika: ${ath.full_name}!`
    await fetchNotifications()
    await fetchLeaguesList(true, true)
  } catch (e: any) {
    errorMsg.value = e.message || 'Nie udało się zatwierdzić wyboru.'
  } finally {
    isBusy.value = false
  }
}

const isAthleteAlreadyPicked = (fisCode: number | string): string | null => {
  const map = selectedLeague.value?.picked_athletes_map || {}
  return map[String(fisCode)] || null
}

// Natychmiastowe odświeżanie po zdarzeniu SSE z drugiego konta!
watch(lastDraftEvent, (ev) => {
  if (!ev) return
  fetchLeaguesList(true, true)
})

watch(
  () => route.query.league,
  (newLid) => {
    if (typeof newLid === 'string' && newLid && newLid !== selectedLeagueId.value) {
      selectLeague(newLid)
    }
  }
)

onMounted(async () => {
  await fetchLeaguesList(false)
  await searchUsersToInvite()
  fallbackPollTimer = setInterval(() => {
    if (selectedLeague.value && selectedLeague.value.status === 'ACTIVE_DRAFT') {
      fetchLeagueDetail(selectedLeague.value.id, true)
    }
  }, 15000)
})

onUnmounted(() => {
  if (fallbackPollTimer) clearInterval(fallbackPollTimer)
  if (inviteDebounce) clearTimeout(inviteDebounce)
})
</script>

<template>
  <div class="draft-page">
    <div class="draft-container">
      <!-- NAGŁÓWEK -->
      <div class="draft-hero">
        <div>
          <h1>⚡ Draft Fantasy Skoki</h1>
          <p class="hero-sub">
            Twórz ligi drafta (3–8 skoczków w systemie Snake), zapraszaj innych graczy po nazwie i rywalizuj o sumę punktów klasyfikacji generalnej sezonu.
          </p>
        </div>
        <div class="hero-right">
          <span class="plan-pill">
            {{ auth.isPro.value ? '👑 PRO: Nielimitowane ligi' : `🆓 Darmowe: ${eligibility.active_leagues_count}/1 liga` }}
          </span>
          <button
            type="button"
            class="btn-hero-join"
            :disabled="!eligibility.eligible"
            :title="!eligibility.eligible ? eligibility.reason : 'Dołącz do ligi po 8-znakowym kodzie zaproszenia'"
            @click="showJoinBox ? (showJoinBox = false) : openJoinBox()"
          >
            {{ showJoinBox ? '✕ Zamknij dołączanie' : '🔑 Dołącz do ligi' }}
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!eligibility.eligible"
            :title="!eligibility.eligible ? eligibility.reason : 'Utwórz nową ligę drafta'"
            @click="showCreateBox ? (showCreateBox = false) : openCreateBox()"
          >
            {{ showCreateBox ? '✕ Zamknij kreator' : '+ Nowa liga drafta' }}
          </button>
        </div>
      </div>

      <div v-if="!eligibility.eligible" class="alert-box warn">
        <span>⚠️</span> {{ eligibility.reason }}
      </div>
      <div v-if="errorMsg" class="alert-box error"><span>❌</span> {{ errorMsg }}</div>
      <div v-if="successMsg" class="alert-box success"><span>✅</span> {{ successMsg }}</div>

      <!-- DOŁĄCZANIE DO LIGI PO KODZIE -->
      <div v-if="showJoinBox" class="card join-code-card">
        <div class="card-header">
          <h3>🔑 Dołącz do ligi po kodzie</h3>
          <p class="subtitle">Wpisz 8-znakowy kod zaproszenia otrzymany od założyciela ligi (liga musi znajdować się w fazie Lobby).</p>
        </div>
        <div class="card-body join-code-row">
          <input
            v-model="joinCodeInput"
            type="text"
            class="form-input invite-code-input"
            maxlength="12"
            placeholder="np. A7K9M2P4"
            @input="onJoinCodeInput"
            @keyup.enter="joinByCode"
          />
          <button
            type="button"
            class="btn-primary"
            :disabled="isBusy || joinCodeInput.trim().length < 6"
            @click="joinByCode"
          >
            ✅ Dołącz do ligi
          </button>
        </div>
      </div>

      <!-- KREATOR NOWEJ LIGI -->
      <div v-if="showCreateBox" class="card create-card">
        <div class="card-header">
          <h3>🆕 Nowa liga drafta</h3>
          <p class="subtitle">Skonfiguruj turniej, liczbę zawodników (3–8) oraz wybierz od którego konkursu liczymy punkty.</p>
        </div>
        <div class="card-body create-grid">
          <div class="form-group">
            <label>Nazwa ligi</label>
            <input v-model="createForm.name" type="text" class="form-input" placeholder="np. Ekipa PŚ 2027" />
          </div>
          <div class="form-group">
            <label>Turniej (rodzaj punktów)</label>
            <select v-model="createForm.category_code" class="form-select">
              <option v-for="t in tournamentOptions" :key="t.code" :value="t.code">
                {{ t.label }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Sezon</label>
            <select v-model="createForm.season" class="form-select">
              <option value="2027">2027 (obecny)</option>
              <option value="2026">2026 (wsteczny)</option>
              <option value="2025">2025 (wsteczny)</option>
              <option value="2024">2024 (wsteczny)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Liczba zawodników w drafcie</label>
            <select v-model.number="createForm.picks_per_player" class="form-select">
              <option v-for="cnt in picksCountOptions" :key="cnt" :value="cnt">
                {{ cnt }} zawodników{{ cnt === 6 ? ' (domyślnie)' : '' }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Kolejność startowa (Snake Draft)</label>
            <select v-model="createForm.order_mode" class="form-select">
              <option value="CUSTOM">Ustalona przez głównego gracza</option>
              <option value="RANDOM">Losowa przy starcie</option>
            </select>
          </div>
          <div class="form-group">
            <label>Licz punkty od konkursu</label>
            <select
              class="form-select"
              :value="createCutoffPreview.competition_options.some((o) => o.date === createForm.scoring_from_date) ? createForm.scoring_from_date : '__CUSTOM__'"
              @change="onCutoffCompetitionChange('create', $event)"
            >
              <option value="">Wszystkie konkursy turnieju</option>
              <option v-for="opt in createCutoffPreview.competition_options" :key="opt.key" :value="opt.date">
                {{ opt.label }}
              </option>
              <option value="__CUSTOM__">📅 Własna data (ręcznie)...</option>
            </select>
          </div>
          <template v-if="createShowCustomDates || !createCutoffPreview.competition_options.length">
            <div class="form-group">
              <label>Dokładna data od (&gt;=)</label>
              <input v-model="createForm.scoring_from_date" type="date" class="form-input" />
            </div>
            <div class="form-group">
              <label>Dokładna data do (&lt;=, opcjonalnie)</label>
              <input v-model="createForm.scoring_to_date" type="date" class="form-input" />
            </div>
          </template>
          <div class="form-group checkbox-group">
            <div class="cutoff-toggle-line">
              <small class="hint-text">
                💡 Wybrany start punktacji: <strong>{{ getSelectedCutoffCompLabel(createForm.scoring_from_date, createCutoffPreview.competition_options) }}</strong>
                <template v-if="createForm.scoring_to_date"> • do {{ createForm.scoring_to_date }}</template>.
              </small>
              <button type="button" class="btn-link-xs" @click="createShowCustomDates = !createShowCustomDates">
                {{ createShowCustomDates ? 'Ukryj ręczne daty' : 'Dostosuj ręcznie daty od/do' }}
              </button>
            </div>
          </div>
        </div>
        <div class="create-footer">
          <button type="button" class="btn-primary" :disabled="isBusy" @click="createLeague">
            {{ isBusy ? 'Tworzenie...' : '✓ Utwórz ligę (Lobby)' }}
          </button>
        </div>
      </div>

      <SkiLoader v-if="isLoadingList" text="Wczytywanie Twoich lig drafta..." />

      <!-- UKŁAD GŁÓWNY: LISTA LIG + SZCZEGÓŁY -->
      <div v-else class="draft-workspace">
        <!-- LEWA KOLUMNA: MOJE LIGI -->
        <aside class="leagues-sidebar card">
          <div class="card-header">
            <h3>🏆 Twoje Ligi ({{ leagues.length }})</h3>
          </div>
          <div v-if="leagues.length === 0" class="empty-side">
            Nie uczestniczysz jeszcze w żadnej lidze. Utwórz nową ligę lub poczekaj na zaproszenie od znajomego!
          </div>
          <div v-else class="leagues-list">
            <button
              v-for="lg in leagues"
              :key="lg.id"
              type="button"
              class="league-list-item"
              :class="{ active: selectedLeagueId === lg.id }"
              @click="selectLeague(lg.id)"
            >
              <div class="lg-item-top">
                <strong>{{ lg.name }}</strong>
                <span class="lg-cat-badge">{{ lg.category_code }} {{ lg.season }}</span>
              </div>
              <div class="lg-item-meta">
                <span class="status-dot" :class="lg.status.toLowerCase()"></span>
                <span>{{ statusLabels[lg.status] || lg.status }}</span>
              </div>
              <div class="lg-item-alerts">
                <span
                  v-if="lg.participants?.some((p: any) => p.user_id === myUserId && p.status === 'INVITED')"
                  class="mini-alert invite"
                >
                  📩 Zaproszenie!
                </span>
                <span
                  v-else-if="lg.status === 'ACTIVE_DRAFT' && lg.current_turn_user_id === myUserId"
                  class="mini-alert turn"
                >
                  🎯 Twoja kolej!
                </span>
                <span
                  v-else-if="lg.status === 'DRAFT_FINISHED' && lg.creator_id === myUserId"
                  class="mini-alert invite"
                >
                  🏁 Uruchom ligę!
                </span>
              </div>
            </button>
          </div>
        </aside>

        <!-- PRAWA KOLUMNA: AKTYWNA LIGA -->
        <section class="league-main">
          <div v-if="!selectedLeague" class="card empty-main">
            <h3>Wybierz lub utwórz ligę drafta</h3>
            <p>Zaproś innych graczy (LITE, PRO lub ADMIN), skonfiguruj turniej i wystartuj Draft w formacie Snake.</p>
          </div>

          <template v-else>
            <!-- BANER ZAPROSZENIA DLA ZAPROSZONEGO GRACZA -->
            <div v-if="myParticipant?.status === 'INVITED'" class="card invite-banner">
              <div>
                <h3>📩 Masz zaproszenie do ligi „{{ selectedLeague.name }}”</h3>
                <p>
                  Twórca: <strong>{{ selectedLeague.creator_name }}</strong> • Turniej: <strong>{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }} {{ selectedLeague.season }}</strong> • Skład: <strong>{{ selectedLeague.picks_per_player }} skoczków</strong> • Od: <strong>{{ selectedLeague.scoring_from_date }}</strong>
                </p>
              </div>
              <div class="invite-banner-actions">
                <button type="button" class="btn-accept" :disabled="isBusy" @click="respondToInvite('accept')">
                  ✓ Akceptuj udział
                </button>
                <button type="button" class="btn-decline" :disabled="isBusy" @click="respondToInvite('decline')">
                  ✕ Odrzuć
                </button>
              </div>
            </div>

            <!-- NAGŁÓWEK WYBRANEJ LIGI -->
            <div class="card league-top-card" :class="{ 'compact-active-header': selectedLeague.status === 'LEAGUE_ACTIVE' || selectedLeague.status === 'COMPLETED' }">
              <div class="league-top-row">
                <div>
                  <div class="league-badges-line">
                    <span class="status-pill" :class="selectedLeague.status.toLowerCase()">
                      {{ statusLabels[selectedLeague.status] || selectedLeague.status }}
                    </span>
                    <span class="meta-pill">{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }}</span>
                    <span class="meta-pill">Sezon {{ selectedLeague.season }}</span>
                    <span class="meta-pill">{{ selectedLeague.picks_per_player }} skoczków</span>
                  </div>
                  <h2>{{ selectedLeague.name }}</h2>
                  <small class="hint-text">
                    Gospodarz: <strong>{{ selectedLeague.creator_name }}</strong> • Liczone od: <strong>{{ selectedLeague.scoring_from_date || 'wszystkie' }}</strong>
                    <template v-if="selectedLeague.scoring_to_date"> do <strong>{{ selectedLeague.scoring_to_date }}</strong></template>
                  </small>
                </div>
                <div class="league-top-actions">
                  <button type="button" class="btn-secondary" @click="fetchLeagueDetail(selectedLeague.id)">
                    🔄 Odśwież
                  </button>
                  <button
                    v-if="isCreator || auth.isAdmin.value"
                    type="button"
                    class="btn-danger-sm"
                    :disabled="isBusy"
                    @click="deleteLeague"
                  >
                    🗑️ Usuń
                  </button>
                </div>
              </div>

              <!-- Zakładki nawigacji wewnątrz ligi (Główny widok vs Kalendarz Ligi) -->
              <div class="league-subtabs-bar">
                <button
                  type="button"
                  class="league-subtab-btn"
                  :class="{ active: activeLeagueSubTab === 'main' }"
                  @click="activeLeagueSubTab = 'main'"
                >
                  {{ (selectedLeague.status === 'LEAGUE_ACTIVE' || selectedLeague.status === 'COMPLETED') ? '🏆 Tabela Ligi' : '⚡ Przebieg Ligi' }}
                </button>
                <button
                  type="button"
                  class="league-subtab-btn"
                  :class="{ active: activeLeagueSubTab === 'calendar' }"
                  @click="openLeagueCalendarTab"
                >
                  📅 Kalendarz Ligi (rozegrane i przyszłe)
                </button>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- ZAKŁADKA: KALENDARZ LIGI DRAFT             -->
            <!-- ========================================== -->
            <div v-if="activeLeagueSubTab === 'calendar'" class="card calendar-league-card">
              <div class="card-header flex-between">
                <div>
                  <h3>📅 Kalendarz konkursów ligi ({{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }} {{ selectedLeague.season }})</h3>
                  <p class="subtitle">
                    Zakres ligi: od <strong>{{ selectedLeague.scoring_from_date || 'początku' }}</strong>
                    <template v-if="selectedLeague.scoring_to_date"> do <strong>{{ selectedLeague.scoring_to_date }}</strong></template>.
                    Zielone przystanki biorą udział w punktacji Twojego Drafta.
                  </p>
                </div>
                <button type="button" class="btn-secondary" :disabled="isLoadingCalendar" @click="fetchLeagueCalendar()">
                  🔄 Odśwież kalendarz
                </button>
              </div>
              <div class="card-body">
                <div class="cal-filter-pills">
                  <button
                    type="button"
                    class="cal-filter-btn"
                    :class="{ active: calendarFilterMode === 'all' }"
                    @click="calendarFilterMode = 'all'"
                  >
                    Wszystkie ({{ leagueCalendarEvents.length }})
                  </button>
                  <button
                    type="button"
                    class="cal-filter-btn"
                    :class="{ active: calendarFilterMode === 'participating' }"
                    @click="calendarFilterMode = 'participating'"
                  >
                    ✅ Biorące udział ({{ leagueCalendarEvents.filter((e) => e.participates).length }})
                  </button>
                  <button
                    type="button"
                    class="cal-filter-btn"
                    :class="{ active: calendarFilterMode === 'upcoming' }"
                    @click="calendarFilterMode = 'upcoming'"
                  >
                    ⏳ Przyszłe ({{ leagueCalendarEvents.filter((e) => e.status === 'UPCOMING').length }})
                  </button>
                  <button
                    type="button"
                    class="cal-filter-btn"
                    :class="{ active: calendarFilterMode === 'excluded' }"
                    @click="calendarFilterMode = 'excluded'"
                  >
                    🚫 Poza zakresem ({{ leagueCalendarEvents.filter((e) => !e.participates).length }})
                  </button>
                </div>

                <SkiLoader v-if="isLoadingCalendar" text="Pobieranie kalendarza turnieju..." />
                <div v-else-if="filteredLeagueCalendarEvents.length === 0" class="empty-side">
                  Brak konkursów pasujących do wybranego filtra.
                </div>
                <div v-else class="cal-events-list">
                  <div
                    v-for="ev in filteredLeagueCalendarEvents"
                    :key="ev.event_id"
                    class="cal-event-item"
                    :class="{ 'cal-in-scope': ev.participates, 'cal-excluded': !ev.participates }"
                  >
                    <div class="cal-ev-main">
                      <div class="cal-ev-top">
                        <CountryFlag v-if="ev.country" :code="ev.country" size="sm" />
                        <strong class="cal-ev-place">{{ ev.place }}</strong>
                        <span class="cal-ev-dates">{{ ev.date_label }}</span>
                      </div>
                      <div class="cal-ev-badges">
                        <span v-if="ev.participates && ev.status === 'COMPLETED'" class="cal-pill active-done">
                          ✅ Rozegrany — wliczony ({{ ev.counted_sessions_count }}/{{ ev.sessions?.length || 0 }})
                        </span>
                        <span v-else-if="ev.status === 'CANCELLED'" class="cal-pill excluded">
                          🚫 Odwołany (nie punktowany)
                        </span>
                        <span v-else-if="ev.participates && ev.status === 'UPCOMING'" class="cal-pill active-future">
                          🎯 Przyszły — bierze udział w punktacji
                        </span>
                        <span v-else-if="ev.participates" class="cal-pill active-future">
                          ⏳ Oczekiwanie na wyniki — w zakresie dat ligi
                        </span>
                        <span v-else class="cal-pill excluded">
                          🚫 Poza zakresem dat ligi
                        </span>
                      </div>
                    </div>
                    <div v-if="ev.sessions?.length" class="cal-ev-sessions">
                      <RouterLink
                        v-for="s in ev.sessions"
                        :key="s.id"
                        :to="`/sessions/${s.id}`"
                        class="cal-session-link"
                      >
                        📊 {{ s.date }} — Wyniki ↗
                      </RouterLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- TRYB 1: LOBBY (KONFIGURATOR + ZAPROSZENIA) -->
            <!-- ========================================== -->
            <template v-else>
            <div v-if="selectedLeague.status === 'LOBBY'" class="lobby-grid">
              <div class="card">
                <div class="card-header">
                  <h3>⚙️ Konfigurator przed STARTEM</h3>
                </div>
                <div class="card-body form-stack">
                  <div class="form-row-2">
                    <div class="form-group">
                      <label>Nazwa ligi</label>
                      <input v-model="lobbyForm.name" :disabled="!isCreator" type="text" class="form-input" />
                    </div>
                    <div class="form-group">
                      <label>Turniej</label>
                      <select v-model="lobbyForm.category_code" :disabled="!isCreator" class="form-select">
                        <option v-for="t in tournamentOptions" :key="t.code" :value="t.code">
                          {{ t.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row-2">
                    <div class="form-group">
                      <label>Sezon</label>
                      <select v-model="lobbyForm.season" :disabled="!isCreator" class="form-select">
                        <option value="2027">2027</option>
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Liczba zawodników (3–8)</label>
                      <select v-model.number="lobbyForm.picks_per_player" :disabled="!isCreator" class="form-select">
                        <option v-for="cnt in picksCountOptions" :key="cnt" :value="cnt">
                          {{ cnt }} zawodników{{ cnt === 6 ? ' (domyślnie)' : '' }}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="form-row-2">
                    <div class="form-group">
                      <label>Kolejność startowa (Snake)</label>
                      <select v-model="lobbyForm.order_mode" :disabled="!isCreator" class="form-select">
                        <option value="CUSTOM">Ustalona przez gospodarza</option>
                        <option value="RANDOM">Losowa przy START</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Licz punkty od konkursu</label>
                      <select
                        :disabled="!isCreator"
                        class="form-select"
                        :value="lobbyCutoffPreview.competition_options.some((o) => o.date === lobbyForm.scoring_from_date) ? lobbyForm.scoring_from_date : '__CUSTOM__'"
                        @change="onCutoffCompetitionChange('lobby', $event)"
                      >
                        <option value="">Wszystkie konkursy turnieju</option>
                        <option v-for="opt in lobbyCutoffPreview.competition_options" :key="opt.key" :value="opt.date">
                          {{ opt.label }}
                        </option>
                        <option value="__CUSTOM__">📅 Własna data (ręcznie)...</option>
                      </select>
                    </div>
                  </div>
                  <div v-if="lobbyShowCustomDates || !lobbyCutoffPreview.competition_options.length" class="form-row-2">
                    <div class="form-group">
                      <label>Dokładna data od (&gt;=)</label>
                      <input v-model="lobbyForm.scoring_from_date" :disabled="!isCreator" type="date" class="form-input" />
                    </div>
                    <div class="form-group">
                      <label>Dokładna data do (&lt;=, opcjonalnie)</label>
                      <input v-model="lobbyForm.scoring_to_date" :disabled="!isCreator" type="date" class="form-input" />
                    </div>
                  </div>
                  <div class="cutoff-toggle-line">
                    <small class="hint-text">
                      Start punktacji: <strong>{{ getSelectedCutoffCompLabel(lobbyForm.scoring_from_date, lobbyCutoffPreview.competition_options) }}</strong>
                    </small>
                    <button v-if="isCreator" type="button" class="btn-link-xs" @click="lobbyShowCustomDates = !lobbyShowCustomDates">
                      {{ lobbyShowCustomDates ? 'Ukryj ręczne daty' : 'Dostosuj ręcznie daty od/do' }}
                    </button>
                  </div>

                  <div class="snake-hint-box">
                    🐍 <strong>System Snake (wężyk):</strong> w rundach nieparzystych kolejność idzie <code>1 → N</code>, a w parzystych od końca <code>N → 1</code> (ostatni wybiera 2 razy z rzędu na nawrocie!).
                  </div>

                  <div v-if="selectedLeague.excluded_competitions?.length" class="cutoff-info-box">
                    <strong>🚫 Wykluczone rozegrane wcześniej konkursy ({{ selectedLeague.excluded_competitions.length }}):</strong>
                    <span>
                      {{ selectedLeague.excluded_competitions.map((c: any) => `${c.event_place} (${c.date})`).join(', ') }}
                    </span>
                  </div>

                  <div v-if="isCreator" class="lobby-actions-row">
                    <button type="button" class="btn-secondary" :disabled="isBusy" @click="saveLobbyConfig()">
                      💾 Zapisz ustawienia
                    </button>
                    <button
                      type="button"
                      class="btn-start-draft"
                      :disabled="isBusy || acceptedParticipantsInOrder.length < 2"
                      @click="startDraft"
                    >
                      🚀 START DRAFTU ({{ acceptedParticipantsInOrder.length }} graczy)
                    </button>
                  </div>
                  <small v-if="isCreator && acceptedParticipantsInOrder.length < 2" class="hint-text">
                    Aby uruchomić START, co najmniej 2 graczy musi zaakceptować udział w lidze.
                  </small>
                </div>
              </div>

              <!-- Uczestnicy, kolejność & zapraszanie po nazwie -->
              <div class="card">
                <div class="card-header flex-between">
                  <div>
                    <h3>👥 Uczestnicy i Kolejność ({{ acceptedParticipantsInOrder.length }} gotowych)</h3>
                  </div>
                  <button
                    v-if="isCreator && acceptedParticipantsInOrder.length >= 2"
                    type="button"
                    class="btn-secondary"
                    :disabled="isBusy"
                    @click="randomizeOrderPreview"
                  >
                    🎲 Losuj kolejność
                  </button>
                </div>
                <div class="card-body">
                  <div class="participants-list">
                    <div
                      v-for="(p, idx) in acceptedParticipantsInOrder"
                      :key="p.user_id"
                      class="participant-row"
                    >
                      <span class="order-num">#{{ idx + 1 }}</span>
                      <img v-if="p.picture" :src="p.picture" class="p-avatar" alt="Avatar" />
                      <div class="p-info">
                        <strong>{{ p.name }}</strong>
                        <small>{{ p.user_id === selectedLeague.creator_id ? 'Gospodarz' : 'Zaakceptowano' }}</small>
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
                        <small>Oczekuje na akceptację zaproszenia</small>
                      </div>
                      <button
                        v-if="isCreator"
                        type="button"
                        class="btn-tiny danger"
                        :disabled="isBusy"
                        @click="removeLobbyParticipant(p.user_id)"
                      >
                        Cofnij
                      </button>
                    </div>
                  </div>

                  <!-- Kod zaproszenia do ligi -->
                  <div v-if="selectedLeague.invite_code" class="invite-code-box">
                    <div class="invite-code-meta">
                      <strong>🔑 Kod zaproszenia do ligi</strong>
                      <small>Udostępnij ten 8-znakowy kod znajomym — mogą użyć przycisku „Dołącz do ligi”.</small>
                    </div>
                    <div class="invite-code-actions">
                      <code class="invite-code-pill">{{ selectedLeague.invite_code }}</code>
                      <button
                        type="button"
                        class="btn-copy-code"
                        @click="copyInviteCode(selectedLeague.invite_code)"
                      >
                        {{ codeCopied ? '✓ Skopiowano' : '📋 Kopiuj kod' }}
                      </button>
                    </div>
                  </div>

                  <!-- Wyszukiwarka użytkowników po nazwie -->
                  <div v-if="isCreator" class="invite-search-box">
                    <h4>📨 Zaproś gracza po nazwie</h4>
                    <div class="search-bar-row">
                      <input
                        v-model="inviteQuery"
                        type="text"
                        class="form-input"
                        placeholder="Wpisz nazwę gracza..."
                        @input="onInviteSearchInput"
                        @keyup.enter="searchUsersToInvite"
                      />
                      <button type="button" class="btn-secondary" :disabled="isSearchingUsers" @click="searchUsersToInvite">
                        Szukaj
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
                              ? 'W lidze'
                              : u.eligible
                                ? '+ Zaproś'
                                : 'Niedostępny'
                          }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- TRYB 2: ACTIVE DRAFT (SNAKE + POTWIERDZENIE) -->
            <!-- ========================================== -->
            <div v-if="selectedLeague.status === 'ACTIVE_DRAFT'" class="active-draft-section">
              <div class="card turn-banner" :class="{ 'my-turn': isMyTurn }">
                <div>
                  <span class="round-tag">
                    🐍 Snake Draft • Runda {{ selectedLeague.current_round }} / {{ selectedLeague.picks_per_player }} • Wybór {{ selectedLeague.current_pick_index + 1 }} / {{ selectedLeague.total_picks }}
                  </span>
                  <h3 v-if="isMyTurn">🎯 TWOJA KOLEJ! Wybierz 1 aktywnego zawodnika poniżej.</h3>
                  <h3 v-else>⏳ Teraz wybiera: <strong>{{ currentTurnPlayerName }}</strong> (dostaniesz powiadomienie na żywo, gdy nadejdzie Twoja tura).</h3>
                </div>
                <div class="turn-progress-bar">
                  <div
                    class="turn-progress-fill"
                    :style="{ width: `${Math.round((selectedLeague.current_pick_index / Math.max(1, selectedLeague.total_picks)) * 100)}%` }"
                  ></div>
                </div>
                <div v-if="selectedLeague.upcoming_turns?.length" class="snake-queue-strip">
                  <span class="queue-label">Kolejka Snake:</span>
                  <span
                    v-for="t in selectedLeague.upcoming_turns"
                    :key="t.pick_number"
                    class="queue-pill"
                    :class="{ current: t.is_current, me: t.user_id === myUserId }"
                  >
                    R{{ t.round }}.{{ t.pick_number }}: {{ t.name }}
                  </span>
                </div>
              </div>

              <div class="draft-board-grid">
                <!-- Pula aktywnych skoczków -->
                <div class="card pool-card">
                  <div class="card-header">
                    <h3>🎿 Pula aktywnych skoczków (Active)</h3>
                    <div class="pool-filters">
                      <input
                        v-model="athleteQuery"
                        type="text"
                        class="form-input"
                        placeholder="Szukaj po nazwisku lub kodzie FIS..."
                        @input="fetchActiveAthletes"
                      />
                      <input
                        v-model="athleteCountry"
                        type="text"
                        class="form-input country-in"
                        placeholder="Kraj (np. POL)"
                        maxlength="3"
                        @input="fetchActiveAthletes"
                      />
                    </div>
                  </div>
                  <div class="card-body pool-list">
                    <SkiLoader v-if="isLoadingAthletes" text="Ładowanie aktywnych skoczków..." />
                    <div v-else v-for="ath in activeAthletes" :key="ath.fis_code" class="pool-athlete-row">
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
                        <div>
                          <strong>{{ ath.full_name }}</strong>
                          <small class="hint-text">FIS: {{ ath.fis_code }}<template v-if="ath.price != null"> • Cena ESM: {{ Number(ath.price).toFixed(1) }}</template></small>
                        </div>
                      </div>
                      <div>
                        <span v-if="isAthleteAlreadyPicked(ath.fis_code)" class="picked-by-tag">
                          Wybrany: {{ isAthleteAlreadyPicked(ath.fis_code) }}
                        </span>
                        <button
                          v-else
                          type="button"
                          class="btn-pick"
                          :disabled="!isMyTurn || isBusy"
                          @click="requestPickConfirmation(ath)"
                        >
                          ✓ Wybierz
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Postęp składów uczestników w drafcie -->
                <div class="card">
                  <div class="card-header">
                    <h3>📋 Aktualne wybory graczy</h3>
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
                          <CountryFlag :code="pk.country_code" size="xs" />
                          <span>{{ pk.full_name }}</span>
                        </span>
                        <small v-if="!p.picks?.length" class="hint-text">Brak wyborów</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- TRYB 3: DRAFT ZAKOŃCZONY -> ROZPOCZNIJ LIGĘ -->
            <!-- ========================================== -->
            <div v-if="selectedLeague.status === 'DRAFT_FINISHED'" class="draft-finished-section">
              <div class="card launch-banner">
                <div>
                  <h3>🏁 Draft zakończony! Wszystkie składy ({{ selectedLeague.picks_per_player }} skoczków) są gotowe.</h3>
                  <p v-if="isCreator">
                    Jako gospodarz kliknij <strong>„Rozpocznij Ligę”</strong>, aby uruchomić dla wszystkich uczestników oficjalną tabelę klasyfikacji generalnej sezonu {{ selectedLeague.season }}.
                  </p>
                  <p v-else>
                    Oczekiwanie na gospodarza (<strong>{{ selectedLeague.creator_name }}</strong>), aż kliknie <strong>„Rozpocznij Ligę”</strong> i otworzy tabelę klasyfikacji generalnej.
                  </p>
                </div>
                <button
                  v-if="isCreator"
                  type="button"
                  class="btn-start-draft"
                  :disabled="isBusy"
                  @click="launchSeasonLeague"
                >
                  🏁 Rozpocznij Ligę
                </button>
              </div>

              <div class="card">
                <div class="card-header">
                  <h3>📋 Sfinalizowane składy po Drafcie</h3>
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
                        <CountryFlag :code="pk.country_code" size="xs" />
                        <span>{{ pk.full_name }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- TRYB 4: LIGA AKTYWNA -> WYRÓŻNIONA TABELA  -->
            <!-- ========================================== -->
            <div v-if="selectedLeague.status === 'LEAGUE_ACTIVE' || selectedLeague.status === 'COMPLETED'" class="dashboard-section">
              <div class="card standings-showcase-card">
                <div class="standings-showcase-header flex-between">
                  <div>
                    <div class="showcase-eyebrow">🏆 TABELA KLASYFIKACJI GENERALNEJ DRAFTU</div>
                    <h3>{{ categoryLabels[selectedLeague.category_code] || selectedLeague.category_code }} • Sezon {{ selectedLeague.season }}</h3>
                    <p class="showcase-sub">
                      Punkty liczone od {{ selectedLeague.scoring_from_date || 'początku' }}
                      <template v-if="selectedLeague.scoring_to_date"> do {{ selectedLeague.scoring_to_date }}</template>.
                      Kliknij gracza, aby rozwinąć skład (remis pkt rozstrzyga kolejność wyboru w drafcie).
                    </p>
                  </div>
                  <div class="league-top-actions">
                    <button type="button" class="btn-dark-ghost" @click="expandAllStandings">▾ Rozwiń wszystkich</button>
                    <button
                      v-if="expandedStandingUserIds.length > 0"
                      type="button"
                      class="btn-dark-ghost"
                      @click="collapseAllStandings"
                    >
                      ▴ Zwiń
                    </button>
                  </div>
                </div>
                <div class="standings-showcase-body">
                  <div class="standings-table-wrap">
                    <table class="standings-table dark-table">
                      <thead>
                        <tr>
                          <th class="col-rank-th">Msc.</th>
                          <th>Gracz</th>
                          <th class="col-roster-th">Skład</th>
                          <th class="th-pts">Suma Pkt</th>
                        </tr>
                      </thead>
                      <tbody>
                        <template v-for="(row, rIdx) in (selectedLeague.standings as any[])" :key="row.user_id">
                          <tr
                            class="dark-standing-row"
                            :class="{
                              'me-row': row.user_id === myUserId,
                              expanded: isStandingExpanded(row.user_id),
                            }"
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
                                    <span v-if="row.user_id === myUserId" class="me-tag">Ty</span>
                                  </strong>
                                  <span class="mobile-roster-pill">
                                    {{ row.picks_count }} skoczków {{ isStandingExpanded(row.user_id) ? '▴' : '▾' }}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td class="td-roster-toggle">
                              <span class="roster-expand-pill dark">
                                {{ row.picks_count }} skoczków {{ isStandingExpanded(row.user_id) ? '▴' : '▾' }}
                              </span>
                            </td>
                            <td class="td-total-pts">
                              <strong>{{ row.total_points }}</strong> <span class="pts-unit">pkt</span>
                            </td>
                          </tr>
                          <tr v-if="isStandingExpanded(row.user_id)" class="dark-breakdown">
                            <td colspan="4">
                              <div class="breakdown-panel">
                                <div class="breakdown-top-bar">
                                  <span class="breakdown-title">Skład: <strong>{{ row.name }}</strong></span>
                                  <button
                                    type="button"
                                    class="details-modal-link"
                                    @click.stop="openPlayerDetailsModal(row)"
                                  >
                                    📊 Szczegóły punktacji ↗
                                  </button>
                                </div>
                                <table class="roster-points-table">
                                  <thead>
                                    <tr>
                                      <th style="width: 44px">Kraj</th>
                                      <th>Zawodnik</th>
                                      <th style="text-align: right; width: 96px">Punkty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr v-for="pk in row.picks" :key="pk.fis_code">
                                      <td>
                                        <CountryFlag :code="pk.country_code" size="xs" />
                                      </td>
                                      <td class="rp-name">{{ pk.full_name }}</td>
                                      <td class="rp-pts">+{{ pk.points }} pkt</td>
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

                  <!-- Zakres punktacji ligi + szybkie przejście do kalendarza -->
                  <div class="competitions-scope-grid">
                    <div class="scope-box dark-counted">
                      <h5>✅ Wliczone konkursy ({{ selectedLeague.counted_competitions?.length || 0 }})</h5>
                      <p v-if="selectedLeague.counted_competitions?.length">
                        {{ selectedLeague.counted_competitions.map((c: any) => `${c.event_place} (${c.date})`).join(', ') }}
                      </p>
                      <p v-else class="dark-muted">
                        Brak jeszcze zakończonych konkursów od {{ selectedLeague.scoring_from_date }}. Punkty naliczą się automatycznie po najbliższym konkursie {{ selectedLeague.category_code }} {{ selectedLeague.season }}.
                      </p>
                    </div>
                    <div class="scope-box dark-excluded">
                      <div class="scope-head-row">
                        <h5>📅 Kalendarz i wykluczenia ({{ selectedLeague.excluded_competitions?.length || 0 }})</h5>
                        <button type="button" class="btn-dark-link" @click="openLeagueCalendarTab">
                          Pełny kalendarz (przyszłe i rozegrane) →
                        </button>
                      </div>
                      <p v-if="selectedLeague.excluded_competitions?.length">
                        Wykluczone: {{ selectedLeague.excluded_competitions.map((c: any) => `${c.event_place} (${c.date})`).join(', ') }}
                      </p>
                      <p v-else class="dark-muted">Wszystkie rozegrane konkursy w tym turnieju mieszczą się w zakresie dat.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </template>
          </template>
        </section>
      </div>
    </div>

    <!-- MODAL POTWIERDZENIA WYBORU (OCHRONA PRZED MISCLICKIEM) -->
    <div v-if="pendingPickAthlete" class="confirm-overlay" @click.self="cancelPickConfirmation">
      <div class="confirm-modal">
        <h3>🎯 Potwierdź wybór w Drafcie</h3>
        <p class="confirm-player-line">
          Czy na pewno chcesz wybrać zawodnika
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
          (kod FIS: {{ pendingPickAthlete.fis_code }})?
        </p>
        <p class="confirm-sub">Po zatwierdzeniu wyboru tura przejdzie automatycznie do kolejnego gracza.</p>
        <div class="confirm-actions">
          <button type="button" class="btn-secondary" :disabled="isBusy" @click="cancelPickConfirmation">
            ✕ Anuluj
          </button>
          <button type="button" class="btn-start-draft" :disabled="isBusy" @click="confirmPickAthlete">
            ✓ Tak, wybieram
          </button>
        </div>
      </div>
    </div>

    <!-- MAŁE OKNO MODALNE ZE SZCZEGÓŁAMI PUNKTACJI ZAWODNIKÓW GRACZA -->
    <div v-if="detailsModalPlayer" class="confirm-overlay" @click.self="closePlayerDetailsModal">
      <div class="score-details-modal">
        <div class="sdm-header">
          <div>
            <h3>📊 Szczegóły punktacji — {{ detailsModalPlayer.name }}</h3>
            <small class="sdm-sub">
              Łącznie: <strong>{{ detailsModalPlayer.total_points }} pkt</strong> • Kliknij skoczka, aby zobaczyć punkty na poszczególnych skoczniach.
            </small>
          </div>
          <button type="button" class="sdm-close-btn" @click="closePlayerDetailsModal" aria-label="Zamknij">&times;</button>
        </div>
        <div class="sdm-body">
          <div v-for="pk in detailsModalPlayer.picks" :key="pk.fis_code" class="sdm-athlete-item">
            <button
              type="button"
              class="sdm-athlete-toggle"
              @click="toggleModalAthlete(pk.fis_code)"
            >
              <span class="sdm-ath-left">
                <CountryFlag :code="pk.country_code" size="xs" />
                <strong>{{ pk.full_name }}</strong>
              </span>
              <span class="sdm-ath-right">
                <strong class="sdm-ath-pts">+{{ pk.points }} pkt</strong>
                <span class="sdm-arrow">{{ expandedModalAthletes[String(pk.fis_code)] ? '▴' : '▾' }}</span>
              </span>
            </button>
            <div v-if="expandedModalAthletes[String(pk.fis_code)]" class="sdm-athlete-events">
              <table v-if="pk.events?.length" class="sdm-events-table">
                <thead>
                  <tr>
                    <th>Skocznia</th>
                    <th>Data</th>
                    <th style="text-align: center">Msc.</th>
                    <th style="text-align: right">Pkt</th>
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
              <p v-else class="sdm-no-events">Brak zdobytych punktów w wybranym zakresie konkursu.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.draft-page {
  padding: 20px 16px;
  background: #f8fafc;
  min-height: calc(100vh - 70px);
  max-width: 100%;
  overflow-x: clip;
  box-sizing: border-box;
}

.draft-container {
  max-width: 1320px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.draft-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  color: #ffffff;
  border-radius: 14px;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.draft-hero h1 {
  margin: 0 0 6px 0;
  font-size: 1.5rem;
}

.hero-sub {
  margin: 0;
  color: #cbd5e1;
  font-size: 0.9rem;
  max-width: 740px;
}

.hero-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.plan-pill {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
}

.btn-hero-join {
  background: rgba(255, 255, 255, 0.14);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}

.btn-hero-join:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}

.btn-hero-join:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.join-code-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.invite-code-input {
  max-width: 240px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.invite-code-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: #eff6ff;
  border: 1px dashed #60a5fa;
  border-radius: 10px;
  padding: 10px 12px;
}

.invite-code-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.invite-code-meta strong {
  font-size: 0.86rem;
  color: #0f172a;
}

.invite-code-meta small {
  font-size: 0.75rem;
  color: #475569;
}

.invite-code-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.invite-code-pill {
  background: #0f172a;
  color: #f8fafc;
  padding: 5px 11px;
  border-radius: 7px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.96rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.btn-copy-code {
  background: #ffffff;
  color: #0369a1;
  border: 1px solid #93c5fd;
  border-radius: 7px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-copy-code:hover {
  background: #e0f2fe;
}

.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  min-width: 0;
}

.card-header {
  padding: 14px 18px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.card-header h3 {
  margin: 0;
  font-size: 1.02rem;
  color: #0f172a;
}

.subtitle {
  margin: 4px 0 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.card-body {
  padding: 16px 18px;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

.alert-box.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.alert-box.success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.alert-box.warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
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

.btn-primary:hover:not(:disabled) {
  background: #0369a1;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f1f5f9;
  color: #1e293b;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-danger-sm {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 7px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}

.form-input,
.form-select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.88rem;
  background: #ffffff;
  box-sizing: border-box;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.form-group label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}

.create-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.checkbox-group {
  grid-column: span 3;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.create-footer {
  padding: 0 18px 16px;
  display: flex;
  justify-content: flex-end;
}

.hint-text {
  font-size: 0.78rem;
  color: #64748b;
}

.draft-workspace {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 18px;
  align-items: start;
  min-width: 0;
}

.leagues-list {
  display: flex;
  flex-direction: column;
  padding: 10px;
  gap: 8px;
}

.empty-side,
.empty-main {
  padding: 24px;
  text-align: center;
  color: #64748b;
}

.league-list-item {
  width: 100%;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  white-space: normal;
  word-break: break-word;
  gap: 5px;
}

.league-list-item.active {
  background: #eff6ff;
  border-color: #3b82f6;
}

.lg-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.lg-cat-badge {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 5px;
}

.lg-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #475569;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-dot.lobby { background: #f59e0b; }
.status-dot.active_draft { background: #2563eb; }
.status-dot.draft_finished { background: #a855f7; }
.status-dot.league_active,
.status-dot.completed { background: #16a34a; }

.lg-item-alerts {
  display: flex;
  gap: 6px;
}

.mini-alert {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 999px;
}

.mini-alert.turn {
  background: #dcfce7;
  color: #166534;
}

.mini-alert.invite {
  background: #fef3c7;
  color: #92400e;
}

.league-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.invite-banner,
.launch-banner {
  background: #eff6ff;
  border-color: #93c5fd;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.launch-banner {
  background: #faf5ff;
  border-color: #d8b4fe;
}

.invite-banner h3,
.launch-banner h3 {
  margin: 0 0 4px 0;
  color: #1e3a8a;
}

.launch-banner h3 {
  color: #6b21a8;
}

.invite-banner p,
.launch-banner p {
  margin: 0;
  font-size: 0.86rem;
  color: #334155;
}

.invite-banner-actions {
  display: flex;
  gap: 8px;
}

.btn-accept {
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn-decline {
  background: #ffffff;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}

.league-top-card {
  padding: 16px 20px;
}

.league-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
}

.league-top-row h2 {
  margin: 6px 0 4px 0;
  color: #0f172a;
}

.league-badges-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-pill,
.meta-pill {
  font-size: 0.74rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
}

.status-pill.lobby { background: #fef3c7; color: #92400e; }
.status-pill.active_draft { background: #dbeafe; color: #1d4ed8; }
.status-pill.draft_finished { background: #f3e8ff; color: #7e22ce; }
.status-pill.league_active,
.status-pill.completed { background: #dcfce7; color: #166534; }
.meta-pill { background: #f1f5f9; color: #334155; }

.league-top-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lobby-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.snake-hint-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 0.8rem;
  color: #0369a1;
}

.cutoff-info-box {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.8rem;
  color: #9a3412;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lobby-actions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 6px;
}

.btn-start-draft {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  font-weight: 800;
  font-size: 0.92rem;
  cursor: pointer;
}

.btn-start-draft:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.participant-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}

.participant-row.invited {
  background: #fffbeb;
  border-color: #fde68a;
}

.order-num {
  font-weight: 800;
  color: #0284c7;
  min-width: 24px;
}

.p-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.p-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.p-info small {
  font-size: 0.74rem;
  color: #64748b;
}

.order-btns {
  display: flex;
  gap: 4px;
}

.btn-tiny {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 5px;
  padding: 3px 7px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-tiny.danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.invite-search-box {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invite-search-box h4 {
  margin: 0;
  font-size: 0.9rem;
}

.search-bar-row {
  display: flex;
  gap: 8px;
}

.invite-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.invite-user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.u-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.u-left > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.btn-invite-sm {
  border: 1px solid #0284c7;
  background: #0284c7;
  color: #ffffff;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-invite-sm:disabled {
  background: #e2e8f0;
  border-color: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
}

.active-draft-section,
.draft-finished-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.turn-banner {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #fffbeb;
  border-color: #fcd34d;
}

.turn-banner.my-turn {
  background: #f0fdf4;
  border-color: #22c55e;
}

.turn-banner h3 {
  margin: 4px 0 0 0;
}

.round-tag {
  font-size: 0.78rem;
  font-weight: 800;
  color: #475569;
  text-transform: uppercase;
}

.turn-progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}

.turn-progress-fill {
  height: 100%;
  background: #0284c7;
  transition: width 0.25s ease;
}

.snake-queue-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
}

.queue-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
}

.queue-pill {
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 2px 7px;
  border-radius: 999px;
}

.queue-pill.current {
  background: #0284c7;
  border-color: #0284c7;
  color: #ffffff;
}

.queue-pill.me:not(.current) {
  border-color: #22c55e;
  color: #15803d;
}

.draft-board-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 16px;
}

.finished-rosters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.pool-filters {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.country-in {
  max-width: 110px;
  text-transform: uppercase;
}

.pool-list {
  max-height: 460px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pool-athlete-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
}

.ath-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ath-mini-avatar-wrap {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid #cbd5e1;
  background: #f1f5f9;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ath-mini-avatar-wrap.small {
  width: 24px;
  height: 24px;
}

.ath-mini-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

.ath-mini-avatar-fallback {
  font-size: 0.68rem;
  font-weight: 800;
  color: #475569;
  line-height: 1;
  letter-spacing: 0.02em;
}

.ath-meta > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.country-chip {
  font-size: 0.72rem;
  font-weight: 800;
  background: #e2e8f0;
  color: #334155;
  padding: 2px 6px;
  border-radius: 5px;
  flex-shrink: 0;
}

.btn-pick {
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 7px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.btn-pick:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.picked-by-tag {
  font-size: 0.75rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.live-rosters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 460px;
  overflow-y: auto;
}

.roster-box {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 9px 11px;
  background: #f8fafc;
}

.roster-box.is-on-clock {
  border-color: #2563eb;
  background: #eff6ff;
}

.roster-top {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.88rem;
}

.roster-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.pick-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 0.74rem;
}

.pick-r {
  font-weight: 700;
  color: #64748b;
}

.cutoff-toggle-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-link-xs {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  text-decoration: underline;
}

.league-subtabs-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}

.league-subtab-btn {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 7px 13px;
  font-size: 0.84rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.league-subtab-btn.active {
  background: #0f172a;
  color: #ffffff;
  border-color: #0f172a;
}

/* Kalendarz Ligi Draft */
.cal-filter-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.cal-filter-btn {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.cal-filter-btn.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}

.cal-events-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cal-event-item {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.cal-event-item.cal-in-scope {
  border-left: 4px solid #16a34a;
  background: #f0fdf4;
}

.cal-event-item.cal-excluded {
  border-left: 4px solid #cbd5e1;
  background: #f8fafc;
  opacity: 0.86;
}

.cal-ev-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.cal-ev-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cal-ev-place {
  color: #0f172a;
  font-size: 0.94rem;
}

.cal-ev-dates {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
}

.cal-pill {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
}

.cal-pill.active-done {
  background: #dcfce7;
  color: #166534;
}

.cal-pill.active-future {
  background: #dbeafe;
  color: #1d4ed8;
}

.cal-pill.excluded {
  background: #e2e8f0;
  color: #475569;
}

.cal-ev-sessions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cal-session-link {
  font-size: 0.75rem;
  font-weight: 700;
  color: #0369a1;
  background: #ffffff;
  border: 1px solid #bae6fd;
  padding: 3px 9px;
  border-radius: 6px;
}

/* Wyróżniona ciemna tabela Klasyfikacji Generalnej Drafta */
.standings-showcase-card {
  background: linear-gradient(160deg, #0f172a 0%, #172554 100%) !important;
  border: 1px solid #1e3a8a !important;
  color: #f8fafc;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.28);
}

.standings-showcase-header {
  padding: 18px 20px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  background: #0b1329;
}

.showcase-eyebrow {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #38bdf8;
  margin-bottom: 3px;
}

.standings-showcase-header h3 {
  margin: 0;
  font-size: 1.15rem;
  color: #ffffff;
}

.showcase-sub {
  margin: 4px 0 0 0;
  font-size: 0.8rem;
  color: #cbd5e1;
}

.btn-dark-ghost {
  background: rgba(255, 255, 255, 0.09);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 8px;
  padding: 6px 11px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-dark-ghost:hover {
  background: rgba(255, 255, 255, 0.16);
}

.standings-showcase-body {
  padding: 14px 18px 18px;
}

.standings-table-wrap {
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: #0b1329;
}

.standings-table.dark-table {
  width: 100%;
  border-collapse: collapse;
  background: #0f172a;
}

.standings-table.dark-table th,
.standings-table.dark-table td {
  padding: 11px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  text-align: left;
  vertical-align: middle;
}

.standings-table.dark-table th {
  font-size: 0.73rem;
  text-transform: uppercase;
  color: #cbd5e1;
  background: #091022;
  letter-spacing: 0.05em;
}

.col-rank-th { width: 64px; }
.col-roster-th { width: 140px; }

.dark-standing-row {
  cursor: pointer;
  background: #0f172a;
  color: #f8fafc;
  transition: background 0.15s;
}

.dark-standing-row td {
  background: transparent;
  color: #f8fafc;
}

.dark-standing-row:hover {
  background: #1a2847;
}

.dark-standing-row.me-row {
  background: #122447;
  box-shadow: inset 3px 0 0 #38bdf8;
}

.dark-standing-row.me-row:hover {
  background: #18305c;
}

.dark-standing-row.expanded {
  background: #172544;
}

.rank-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.86rem;
  padding: 3px 8px;
  border-radius: 7px;
  white-space: nowrap;
}

.rank-pill.gold { background: rgba(250, 204, 21, 0.22); color: #fde047; }
.rank-pill.silver { background: rgba(203, 213, 225, 0.2); color: #e2e8f0; }
.rank-pill.bronze { background: rgba(251, 146, 60, 0.22); color: #fdba74; }
.rank-pill.rest { color: #cbd5e1; background: rgba(148, 163, 184, 0.14); }

.player-name-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.player-name-text {
  color: #f8fafc;
  font-size: 0.94rem;
  word-break: break-word;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.me-tag {
  font-size: 0.68rem;
  font-weight: 800;
  background: rgba(56, 189, 248, 0.2);
  color: #7dd3fc;
  border: 1px solid rgba(56, 189, 248, 0.45);
  padding: 1px 6px;
  border-radius: 999px;
}

.mobile-roster-pill {
  display: none;
  font-size: 0.72rem;
  font-weight: 700;
  color: #7dd3fc;
}

.roster-expand-pill {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}

.roster-expand-pill.dark {
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #7dd3fc;
}

.th-pts,
.td-total-pts {
  text-align: right !important;
  white-space: nowrap;
}

.dark-table .td-total-pts strong {
  font-size: 1.15rem;
  color: #38bdf8;
}

.pts-unit {
  font-size: 0.78rem;
  color: #cbd5e1;
}

.dark-breakdown td {
  background: #091022;
  padding: 10px 12px 14px;
}

.breakdown-panel {
  background: #131f3b;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 9px;
  overflow: hidden;
}

.breakdown-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(9, 16, 34, 0.6);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.breakdown-title {
  font-size: 0.8rem;
  color: #cbd5e1;
}

.breakdown-title strong {
  color: #ffffff;
}

.details-modal-link {
  background: rgba(56, 189, 248, 0.14);
  color: #7dd3fc;
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}

.details-modal-link:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.roster-points-table {
  width: 100%;
  border-collapse: collapse;
}

.roster-points-table th,
.roster-points-table td {
  padding: 7px 10px !important;
  font-size: 0.8rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
  color: #e2e8f0;
  background: transparent !important;
}

.roster-points-table th {
  font-size: 0.68rem !important;
  color: #94a3b8 !important;
  text-transform: uppercase;
  background: rgba(9, 16, 34, 0.35) !important;
}

.roster-points-table tr:last-child td {
  border-bottom: none !important;
}

.rp-name {
  font-weight: 600;
  color: #f8fafc !important;
}

.rp-pts {
  text-align: right !important;
  font-weight: 800;
  color: #4ade80 !important;
  white-space: nowrap;
}

/* Małe okno modalne ze szczegółami punktacji gracza */
.score-details-modal {
  background: #ffffff;
  color: #0f172a;
  border-radius: 14px;
  max-width: 560px;
  width: 100%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 22px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.sdm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: #0f172a;
  color: #ffffff;
}

.sdm-header h3 {
  margin: 0 0 3px 0;
  font-size: 1.05rem;
  color: #ffffff;
}

.sdm-sub {
  font-size: 0.78rem;
  color: #cbd5e1;
}

.sdm-close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.sdm-close-btn:hover {
  color: #ffffff;
}

.sdm-body {
  padding: 14px 18px 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sdm-athlete-item {
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  overflow: hidden;
  background: #f8fafc;
}

.sdm-athlete-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #ffffff;
  border: none;
  cursor: pointer;
  text-align: left;
  color: #0f172a;
}

.sdm-athlete-toggle:hover {
  background: #f1f5f9;
}

.sdm-ath-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 0.88rem;
}

.sdm-ath-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sdm-ath-pts {
  color: #16a34a;
  font-size: 0.86rem;
}

.sdm-arrow {
  color: #64748b;
  font-size: 0.82rem;
}

.sdm-athlete-events {
  padding: 8px 12px 10px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.sdm-events-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.sdm-events-table th,
.sdm-events-table td {
  padding: 5px 6px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
}

.sdm-events-table th {
  font-size: 0.68rem;
  text-transform: uppercase;
  color: #64748b;
}

.sdm-events-table tr:last-child td {
  border-bottom: none;
}

.sdm-no-events {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  font-style: italic;
}

.dark-muted {
  color: #94a3b8;
}

.scope-box.dark-counted {
  background: rgba(22, 163, 74, 0.14);
  border: 1px solid rgba(74, 222, 128, 0.3);
  color: #dcfce7;
}

.scope-box.dark-excluded {
  background: rgba(251, 146, 60, 0.12);
  border: 1px solid rgba(251, 146, 60, 0.3);
  color: #ffedd5;
}

.scope-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.btn-dark-link {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #7dd3fc;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.confirm-player-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.competitions-scope-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.scope-box {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.82rem;
}

.scope-box h5 {
  margin: 0 0 4px 0;
  font-size: 0.82rem;
}

.scope-box p {
  margin: 0;
}

/* Modal potwierdzenia wyboru zawodnika */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(3px);
  z-index: 20500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.confirm-modal {
  background: #ffffff;
  border-radius: 14px;
  max-width: 440px;
  width: 100%;
  padding: 22px 24px;
  box-shadow: 0 20px 30px rgba(0, 0, 0, 0.25);
}

.confirm-modal h3 {
  margin: 0 0 10px 0;
  color: #0f172a;
}

.confirm-modal p {
  margin: 0 0 8px 0;
  color: #334155;
  font-size: 0.94rem;
}

.confirm-sub {
  font-size: 0.8rem !important;
  color: #64748b !important;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@media (max-width: 960px) {
  .draft-workspace,
  .lobby-grid,
  .draft-board-grid,
  .create-grid,
  .competitions-scope-grid {
    grid-template-columns: 1fr;
  }
  .checkbox-group {
    grid-column: span 1;
  }
  .form-row-2 {
    grid-template-columns: 1fr;
  }
  /* Kompaktowy pasek lig na urządzeniach mobilnych, żeby główna tabela była od razu na górze */
  .leagues-sidebar .card-header {
    padding: 10px 12px;
  }
  .leagues-list {
    flex-direction: row;
    overflow-x: auto;
    padding: 8px 10px;
    gap: 8px;
  }
  .league-list-item {
    flex: 0 0 auto;
    min-width: 195px;
    max-width: 240px;
  }
}

@media (max-width: 680px) {
  .col-roster-th,
  .td-roster-toggle {
    display: none;
  }
  .mobile-roster-pill {
    display: inline-block;
  }
  .col-rank-th {
    width: 44px;
  }
  .standings-table.dark-table th,
  .standings-table.dark-table td {
    padding: 9px 6px;
  }
  .standings-showcase-header,
  .standings-showcase-body {
    padding: 12px;
  }
  .compact-athletes-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .draft-page {
    padding: 12px 10px;
  }
  .draft-hero {
    padding: 16px;
  }
  .card-body,
  .card-header {
    padding: 12px;
  }
  .pool-filters,
  .search-bar-row {
    flex-direction: column;
  }
  .country-in {
    max-width: none;
  }
}
</style>
