import { ref, computed } from 'vue'
import { api, API_BASE_URL } from '@/api/client'
import { useAuth } from '@/stores/auth'

export interface DraftNotification {
  id: string
  type: 'DRAFT_TURN' | 'DRAFT_INVITE' | 'DRAFT_COMPLETED' | 'LEAGUE_STARTED' | string
  title: string
  message: string
  league_id?: string | null
  link: string
  is_read: boolean
  created_at?: string
}

const unreadCount = ref<number>(0)
const notifications = ref<DraftNotification[]>([])
const unreadNotifications = computed(() => notifications.value.filter((n) => !n.is_read))
const isLoadingNotifs = ref<boolean>(false)
const activeToast = ref<DraftNotification | null>(null)
const lastDraftEvent = ref<{ event: string; league_id?: string; ts: number } | null>(null)

let eventSource: EventSource | null = null
let toastTimer: any = null

export function useNotifications() {
  const auth = useAuth()

  const dismissToast = () => {
    activeToast.value = null
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
  }

  const showToast = (notif: DraftNotification) => {
    activeToast.value = notif
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      activeToast.value = null
    }, 8000)
  }

  const fetchNotifications = async (limit = 100) => {
    if (!auth.isAuthenticated.value) {
      unreadCount.value = 0
      notifications.value = []
      return
    }
    isLoadingNotifs.value = true
    try {
      const data = await api.get<{ unread_count: number; items: DraftNotification[] }>(
        `/draft/notifications?limit=${limit}`
      )
      unreadCount.value = data.unread_count || 0
      notifications.value = data.items || []
    } catch {
      // Cichy fallback np. przy wylogowaniu
    } finally {
      isLoadingNotifs.value = false
    }
  }

  const stopEventStream = () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  const startEventStream = () => {
    if (typeof window === 'undefined' || !auth.token.value || !auth.isAuthenticated.value) {
      stopEventStream()
      return
    }
    if (eventSource) return

    const url = `${API_BASE_URL}/draft/events/stream?token=${encodeURIComponent(auth.token.value)}`
    eventSource = new EventSource(url)

    eventSource.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (!data || data.event === 'connected') return

        if (data.event === 'notification') {
          const item: DraftNotification = {
            id: data.id,
            type: data.type,
            title: data.title,
            message: data.message,
            league_id: data.league_id,
            link: data.link || '/draft',
            is_read: false,
            created_at: data.created_at,
          }
          if (!notifications.value.some((n) => n.id === item.id)) {
            notifications.value = [item, ...notifications.value].slice(0, 100)
            unreadCount.value += 1
          }
          showToast(item)
          lastDraftEvent.value = { event: 'notification', league_id: data.league_id, ts: Date.now() }
        } else if (data.event === 'league_update' || data.event === 'league_deleted') {
          lastDraftEvent.value = { event: data.event, league_id: data.league_id, ts: Date.now() }
          fetchNotifications()
        }
      } catch {
        // ignore parse errors
      }
    }

    eventSource.onerror = () => {
      if (!auth.isAuthenticated.value) {
        stopEventStream()
      }
    }
  }

  const markAsRead = async (id: string) => {
    try {
      await api.post(`/draft/notifications/${encodeURIComponent(id)}/read`, {})
      const target = notifications.value.find((n) => n.id === id)
      if (target && !target.is_read) {
        target.is_read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
    } catch {
      // ignore
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.post('/draft/notifications/read-all', {})
      notifications.value.forEach((n) => (n.is_read = true))
      unreadCount.value = 0
    } catch {
      // ignore
    }
  }

  return {
    unreadCount,
    notifications,
    unreadNotifications,
    isLoadingNotifs,
    activeToast,
    lastDraftEvent,
    dismissToast,
    fetchNotifications,
    startEventStream,
    stopEventStream,
    markAsRead,
    markAllAsRead,
  }
}
