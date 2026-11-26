<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getFlagUrl, normalizeCountryCode } from '@/utils/countries'

export type FlagSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number

const props = withDefaults(
  defineProps<{
    code?: string | null
    src?: string | null
    size?: FlagSize
    title?: string
    showCode?: boolean
  }>(),
  {
    code: '',
    src: null,
    size: 'sm',
    title: '',
    showCode: false,
  }
)

const hasImgError = ref(false)

watch(
  () => [props.code, props.src],
  () => {
    hasImgError.value = false
  }
)

const cleanedCode = computed(() => normalizeCountryCode(props.code))
const resolvedUrl = computed(() => {
  if (hasImgError.value) return null
  return getFlagUrl(props.code, props.src)
})

const widthPx = computed(() => {
  if (typeof props.size === 'number' && props.size > 0) return props.size
  switch (props.size) {
    case 'xs':
      return 18
    case 'sm':
      return 22
    case 'md':
      return 26
    case 'lg':
      return 32
    case 'xl':
      return 40
    default:
      return 22
  }
})

const heightPx = computed(() => Math.max(11, Math.round((widthPx.value * 2) / 3)))

const imgStyle = computed(() => ({
  width: `${widthPx.value}px`,
  height: `${heightPx.value}px`,
}))

const tooltipText = computed(() => props.title || cleanedCode.value || 'Kraj')
</script>

<template>
  <span class="cf-wrap" :title="tooltipText">
    <img
      v-if="resolvedUrl"
      :src="resolvedUrl"
      :alt="cleanedCode || 'Flaga'"
      :style="imgStyle"
      class="cf-img"
      loading="lazy"
      @error="hasImgError = true"
    />
    <span v-else class="cf-fallback" :style="{ minWidth: `${widthPx}px`, height: `${heightPx}px` }">
      {{ cleanedCode && cleanedCode !== '-' ? cleanedCode : '🏳️' }}
    </span>
    <span v-if="showCode && cleanedCode" class="cf-code">{{ cleanedCode }}</span>
  </span>
</template>

<style scoped>
.cf-wrap {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  vertical-align: middle;
  line-height: 1;
  flex-shrink: 0;
}

.cf-img {
  display: block;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid rgba(15, 23, 42, 0.16);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
  background-color: #f1f5f9;
  flex-shrink: 0;
}

.cf-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 3px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: #f1f5f9;
  color: #475569;
  font-size: 0.65rem;
  font-weight: 800;
  font-family: var(--font-mono, monospace);
  box-sizing: border-box;
  flex-shrink: 0;
}

.cf-code {
  font-size: 0.78em;
  font-weight: 700;
  letter-spacing: 0.03em;
}
</style>
