import { ref, computed } from 'vue'
import { api, API_BASE_URL } from '@/api/client'
import { useAuth } from '@/stores/auth'

export interface DraftNotification {
  id: string
  type:
    | 'DRAFT_TURN'
    | 'DRAFT_INVITE'
    | 'DRAFT_INVITE_ACCEPTED'
    | 'DRAFT_JOINED'
    | 'DRAFT_STARTED'
    | 'DRAFT_COMPLETED'
    | 'LEAGUE_STARTED'
    | 'SEASON_STARTED'
    | 'DRAFT_LEFT'
    | string
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

let sseAbortController: AbortController | null = null
let sseReconnectTimer: any = null
let sseReconnectAttempt = 0
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
    if (sseReconnectTimer) {
      clearTimeout(sseReconnectTimer)
      sseReconnectTimer = null
    }
    if (sseAbortController) {
      sseAbortController.abort()
      sseAbortController = null
    }
    sseReconnectAttempt = 0
  }

  const handleSsePayload = (rawJson: string) => {
    try {
      const data = JSON.parse(rawJson)
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

  const scheduleReconnect = () => {
    if (!auth.isAuthenticated.value || !auth.token.value) return
    if (sseReconnectTimer) return
    const delayMs = Math.min(30000, 3000 * Math.pow(2, sseReconnectAttempt))
    sseReconnectAttempt = Math.min(sseReconnectAttempt + 1, 4)
    sseReconnectTimer = setTimeout(() => {
      sseReconnectTimer = null
      startEventStream()
    }, delayMs)
  }

  const startEventStream = async () => {
    if (typeof window === 'undefined' || !auth.token.value || !auth.isAuthenticated.value) {
      stopEventStream()
      return
    }
    if (sseAbortController) return

    const controller = new AbortController()
    sseAbortController = controller

    try {
      const response = await fetch(`${API_BASE_URL}/draft/events/stream`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.token.value}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      })

      if (response.status === 401) {
        stopEventStream()
        return
      }
      if (!response.ok || !response.body) {
        sseAbortController = null
        scheduleReconnect()
        return
      }

      sseReconnectAttempt = 0
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split(/\r?\n\r?\n/)
        buffer = frames.pop() || ''
        for (const frame of frames) {
          const dataLines = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
          if (dataLines.length > 0) {
            handleSsePayload(dataLines.join('\n'))
          }
        }
      }
    } catch {
      // Połączenie przerwane lub wyłączone przez AbortController
    } finally {
      if (sseAbortController === controller) {
        sseAbortController = null
        if (!controller.signal.aborted && auth.isAuthenticated.value && auth.token.value) {
          scheduleReconnect()
        }
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
