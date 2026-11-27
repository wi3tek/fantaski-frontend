import { computed } from 'vue'
import { useI18n } from '@/i18n'

export const PICKS_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8]
export const SEASON_OPTIONS = ['2027', '2026', '2025', '2024']

export function useDraftUiHelpers() {
  const { t, formatCategory } = useI18n()

  const tournamentOptions = computed(() => [
    { code: 'WC', label: formatCategory('WC') },
    { code: 'TCS', label: `${t('sessions.tournamentTcs')} (TCS)` },
    { code: 'RAW_AIR', label: `${t('sessions.tournamentRawAir')} (RAW_AIR)` },
    { code: 'PLANICA_7', label: `${t('sessions.tournamentPlanica7')} (PLANICA_7)` },
    { code: 'OWG', label: `🏅 ${formatCategory('OWG')}` },
    { code: 'WSC', label: `🌍 ${formatCategory('WSC')}` },
    { code: 'SFWC', label: `🦅 ${formatCategory('SFWC')}` },
    { code: 'GP', label: `☀️ ${formatCategory('GP')}` },
    { code: 'COC', label: formatCategory('COC') },
    { code: 'FC', label: formatCategory('FC') },
  ])

  const categoryLabels = computed<Record<string, string>>(() => ({
    WC: formatCategory('WC'),
    TCS: `${t('sessions.tournamentTcs')} (TCS)`,
    RAW_AIR: t('sessions.tournamentRawAir'),
    PLANICA_7: t('sessions.tournamentPlanica7'),
    OWG: `🏅 ${formatCategory('OWG')}`,
    WSC: `🌍 ${formatCategory('WSC')}`,
    SFWC: `🦅 ${formatCategory('SFWC')}`,
    GP: `☀️ ${formatCategory('GP')}`,
    COC: formatCategory('COC'),
    FC: formatCategory('FC'),
  }))

  const statusLabels = computed<Record<string, string>>(() => ({
    LOBBY: t('draft.statusLobby'),
    ACTIVE_DRAFT: t('draft.statusActiveDraft'),
    DRAFT_FINISHED: t('draft.statusFinished'),
    LEAGUE_ACTIVE: t('draft.statusLeagueActive'),
    COMPLETED: t('draft.statusLeagueActive'),
  }))

  const formatCutoffOptionLabel = (opt: any) => {
    const place = opt.place || ''
    const dateLabel = opt.date_label || opt.date || ''
    if (opt.status === 'COMPLETED') {
      return t('draft.optCompleted', { place, date: dateLabel })
    }
    if (opt.status === 'UPCOMING') {
      return t('draft.optUpcoming', { place, dateLabel, date: opt.date || dateLabel })
    }
    return opt.label || `${place} (${dateLabel})`
  }

  const getSelectedCutoffCompLabel = (dateVal: string, options: any[]) => {
    if (!dateVal) return t('draft.cutoffAll')
    const exact = options.find((o) => o.date === dateVal)
    if (exact) return `${exact.place} (${exact.date_label})`
    return t('draft.cutoffFrom', { date: dateVal })
  }

  const getAthleteInitials = (fullName?: string): string => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '⛷'
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase()
  }

  return {
    tournamentOptions,
    categoryLabels,
    statusLabels,
    formatCutoffOptionLabel,
    getSelectedCutoffCompLabel,
    getAthleteInitials,
  }
}
