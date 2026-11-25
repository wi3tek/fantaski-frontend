import { ref } from 'vue'

export interface NoticeOptions {
  title: string
  message: string
  badge?: string
  requiresLogin?: boolean
}

const isOpen = ref(false)
const noticeData = ref<NoticeOptions>({
  title: '',
  message: '',
  badge: '',
  requiresLogin: false,
})

export function useNotice() {
  const showNotice = (options: NoticeOptions) => {
    noticeData.value = options
    isOpen.value = true
  }

  const closeNotice = () => {
    isOpen.value = false
  }

  return {
    isOpen,
    noticeData,
    showNotice,
    closeNotice,
  }
}
