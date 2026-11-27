<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import CountryFlag from '@/components/CountryFlag.vue'
import { api, clearApiCache } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useI18n } from '@/i18n'

const auth = useAuth()
const { t, formatSessionsCount } = useI18n()

interface HillVersion {
  hill_id: string
  place?: string | null
  country_code?: string | null
  size?: number | null
  unit?: string | null
  type?: string | null
  k_point?: number | null
  meter_value?: number | null
  year_built?: number | null
  record?: number | null
  record_holder?: string | null
  is_current: boolean
  last_session_date?: string | null
  last_season?: string | null
  total_sessions?: number
}

interface HillTypeGroup {
  type: string
  label: string
  current_version: HillVersion
  versions: HillVersion[]
  versions_count: number
}

interface HillComplex {
  place: string
  country_code: string
  total_types: number
  types: HillTypeGroup[]
}

const complexes = ref<HillComplex[]>([])
const loading = ref(true)
const searchQuery = ref('')
const selectedTypeFilter = ref<string>('ALL') // 'ALL', 'FLYING', 'LARGE', 'NORMAL'

// Rozwijanie historii wersji (klucz: `${place}_${type}`)
const expandedHistories = ref<Record<string, boolean>>({})

// Zarządzanie wiadomościami
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)
const isSaving = ref(false)

// Modale
const showAddModal = ref(false)
const showEditModal = ref(false)
const showConfirmModal = ref(false)
const confirmAction = ref<{ title: string; text: string; action: () => Promise<void> } | null>(null)

// Formularze
const hillForm = ref<Partial<HillVersion> & { is_new_complex?: boolean }>({
  unit: 'HS',
  type: 'LARGE',
  is_current: true,
})

const editingVersionId = ref<string | null>(null)

// --- Łączenie duplikatów skoczni (Admin Merge) ---
const selectedMergeIds = ref<string[]>([])
const targetMergeId = ref<string>('')

const selectedMergeHills = computed(() => {
  const map: Record<string, HillVersion> = {}
  for (const c of complexes.value) {
    for (const tg of c.types) {
      for (const v of tg.versions) {
        map[v.hill_id] = v
      }
    }
  }
  return selectedMergeIds.value.map((id) => map[id]).filter((v): v is HillVersion => !!v)
})

const mergeCompatibilityError = computed(() => {
  const list = selectedMergeHills.value
  if (list.length < 2) return null
  const types = new Set(list.map((h) => (h.type || 'LARGE').toUpperCase()))
  const sizes = new Set(list.map((h) => Number(h.size || 0)))
  if (types.size > 1 || sizes.size > 1) {
    return t('hills.mergeCompatibilityErr')
  }
  return null
})

const toggleMergeSelection = (version: HillVersion) => {
  const idx = selectedMergeIds.value.indexOf(version.hill_id)
  if (idx > -1) {
    selectedMergeIds.value.splice(idx, 1)
  } else {
    selectedMergeIds.value.push(version.hill_id)
  }
  // Ustaw domyślny cel jeśli obecny nie jest już na liście
  if (!selectedMergeIds.value.includes(targetMergeId.value)) {
    const preferred =
      selectedMergeHills.value.find((h) => h.is_current) || selectedMergeHills.value[0]
    targetMergeId.value = preferred ? preferred.hill_id : ''
  }
}

const clearMergeSelection = () => {
  selectedMergeIds.value = []
  targetMergeId.value = ''
}

const handleMergeHills = () => {
  if (selectedMergeIds.value.length < 2 || mergeCompatibilityError.value) return
  const targetId = targetMergeId.value || selectedMergeIds.value[0] || ''
  const others = selectedMergeIds.value.filter((id) => id !== targetId).join(', ')
  confirmAction.value = {
    title: t('hills.mergeConfirmTitle', { count: selectedMergeIds.value.length }),
    text: t('hills.mergeConfirmText', { others, targetId }),
    action: async () => {
      try {
        const res = await api.post<any>('/hills/merge', {
          source_hill_ids: selectedMergeIds.value,
          target_hill_id: targetId,
        })
        clearApiCache('/hills')
        clearMergeSelection()
        showMessage('success', res.message || t('hills.mergeSuccess'))
        await fetchHierarchy()
      } catch (err: any) {
        showMessage('error', err.message || t('hills.mergeError'))
      }
    },
  }
  showConfirmModal.value = true
}

const getTypeIcon = (type: string) => {
  switch (type.toUpperCase()) {
    case 'FLYING':
      return '🦅'
    case 'LARGE':
      return '🏔️'
    case 'NORMAL':
    case 'MEDIUM':
      return '⛷️'
    default:
      return '🎿'
  }
}

const resolveDisplayHillType = (typeGroup: any) => {
  const size = Number(typeGroup?.current_version?.size || 0)
  const raw = String(typeGroup?.type || '').toUpperCase()
  if (size > 0 && size < 85) return 'MEDIUM'
  if (size >= 85 && size <= 109 && raw === 'LARGE') return 'NORMAL'
  return raw || 'LARGE'
}

const formatHillTypeName = (type: string) => {
  const code = String(type || '').toUpperCase()
  const key = `hill.${code}`
  const translated = t(key)
  if (translated !== key) return translated
  return t('common.hill')
}

// Pobieranie hierarchii z backendu
const fetchHierarchy = async () => {
  loading.value = true
  try {
    const data = await api.get<HillComplex[]>('/hills/hierarchy', { cacheTtlMs: 60000 })
    complexes.value = data
  } catch (e: any) {
    console.error('Błąd pobierania hierarchii skoczni:', e)
    showMessage('error', t('hills.errFetchHierarchy'))
  } finally {
    loading.value = false
  }
}

// Filtrowanie miejscowości i rodzajów
const filteredComplexes = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  const filterType = selectedTypeFilter.value

  return complexes.value
    .map((complex) => {
      // Filtr typu w ramach kompleksu
      let matchingTypes = complex.types
      if (filterType !== 'ALL') {
        matchingTypes = matchingTypes.filter((t) => t.type === filterType)
      }
      if (matchingTypes.length === 0) return null

      // Filtr wyszukiwarki (miejscowość, kraj, lub id/nazwisko rekordzisty w wersjach)
      if (q) {
        const placeMatch = complex.place.toLowerCase().includes(q)
        const countryMatch = complex.country_code.toLowerCase().includes(q)
        const versionMatch = matchingTypes.some((t) =>
          t.versions.some(
            (v) =>
              v.hill_id.toLowerCase().includes(q) ||
              (v.record_holder && v.record_holder.toLowerCase().includes(q))
          )
        )
        if (!placeMatch && !countryMatch && !versionMatch) return null
      }

      return {
        ...complex,
        types: matchingTypes,
      }
    })
    .filter((c): c is HillComplex => c !== null)
})

// Statystyki
const stats = computed(() => {
  let complexesCount = complexes.value.length
  let totalTypes = 0
  let totalVersions = 0

  complexes.value.forEach((c) => {
    totalTypes += c.types.length
    c.types.forEach((t) => {
      totalVersions += t.versions.length
    })
  })

  return { complexesCount, totalTypes, totalVersions }
})

const toggleHistory = (place: string, type: string) => {
  const key = `${place}_${type}`
  expandedHistories.value[key] = !expandedHistories.value[key]
}

const isHistoryExpanded = (place: string, type: string) => {
  return !!expandedHistories.value[`${place}_${type}`]
}

const showMessage = (type: 'success' | 'error', text: string) => {
  message.value = { type, text }
  setTimeout(() => {
    message.value = null
  }, 4500)
}

// --- ADMIN AKCJE ---

// 1. Oznaczanie wersji jako aktualnej
const handleSetCurrent = (version: HillVersion) => {
  confirmAction.value = {
    title: t('hills.setCurrentTitleConfirm'),
    text: t('hills.setCurrentTextConfirm', {
      hillId: version.hill_id,
      unit: version.unit || 'HS',
      size: version.size ?? '',
      kPoint: version.k_point || '?',
      place: version.place ?? '',
    }),
    action: async () => {
      try {
        await api.post(`/hills/${encodeURIComponent(version.hill_id)}/set-current`)
        clearApiCache('/hills')
        showMessage('success', t('hills.setCurrentSuccess', { hillId: version.hill_id }))
        await fetchHierarchy()
      } catch (err: any) {
        showMessage('error', err.message || t('hills.setCurrentError'))
      }
    },
  }
  showConfirmModal.value = true
}

// 2. Otwarcie modala dodawania nowej skoczni / nowej wersji
const openAddModal = (targetComplex?: HillComplex, targetType?: string) => {
  hillForm.value = {
    place: targetComplex ? targetComplex.place : '',
    country_code: targetComplex ? targetComplex.country_code : '',
    type: targetType || 'LARGE',
    unit: 'HS',
    is_current: true,
    size: undefined,
    k_point: undefined,
    meter_value: undefined,
    record: undefined,
    record_holder: '',
    year_built: undefined,
    is_new_complex: !targetComplex,
  }
  showAddModal.value = true
}

// 3. Zapisanie nowej wersji
const saveNewVersion = async () => {
  if (!auth.isAdmin.value) return
  if (!hillForm.value.place || !hillForm.value.size) {
    showMessage('error', t('hills.errRequiredFields'))
    return
  }

  isSaving.value = true
  try {
    const payload = {
      place: hillForm.value.place.trim(),
      country_code: (hillForm.value.country_code || 'UNK').toUpperCase().trim(),
      size: Number(hillForm.value.size),
      unit: hillForm.value.unit || 'HS',
      type: hillForm.value.type || 'LARGE',
      k_point: hillForm.value.k_point ? Number(hillForm.value.k_point) : null,
      meter_value: hillForm.value.meter_value ? Number(hillForm.value.meter_value) : null,
      record: hillForm.value.record ? Number(hillForm.value.record) : null,
      record_holder: hillForm.value.record_holder?.trim() || null,
      year_built: hillForm.value.year_built ? Number(hillForm.value.year_built) : null,
      is_current: !!hillForm.value.is_current,
    }

    await api.post('/hills/version', payload)
    clearApiCache('/hills')
    showAddModal.value = false
    showMessage('success', t('hills.addVersionSuccess', { place: payload.place }))
    await fetchHierarchy()
  } catch (err: any) {
    showMessage('error', err.message || t('hills.addVersionError'))
  } finally {
    isSaving.value = false
  }
}

// 4. Otwarcie modala edycji
const openEditModal = (version: HillVersion) => {
  editingVersionId.value = version.hill_id
  hillForm.value = {
    place: version.place,
    country_code: version.country_code,
    size: version.size,
    unit: version.unit || 'HS',
    type: version.type || 'LARGE',
    k_point: version.k_point,
    meter_value: version.meter_value,
    record: version.record,
    record_holder: version.record_holder || '',
    year_built: version.year_built,
    is_current: version.is_current,
  }
  showEditModal.value = true
}

// 5. Zapisanie edycji
const saveEditVersion = async () => {
  if (!auth.isAdmin.value) return
  if (!editingVersionId.value) return

  isSaving.value = true
  try {
    const payload = {
      place: hillForm.value.place?.trim(),
      country_code: hillForm.value.country_code?.toUpperCase().trim(),
      size: hillForm.value.size ? Number(hillForm.value.size) : null,
      unit: hillForm.value.unit || 'HS',
      type: hillForm.value.type,
      k_point: hillForm.value.k_point ? Number(hillForm.value.k_point) : null,
      meter_value: hillForm.value.meter_value ? Number(hillForm.value.meter_value) : null,
      record: hillForm.value.record ? Number(hillForm.value.record) : null,
      record_holder: hillForm.value.record_holder?.trim() || null,
      year_built: hillForm.value.year_built ? Number(hillForm.value.year_built) : null,
      is_current: hillForm.value.is_current,
    }

    await api.put(`/hills/${encodeURIComponent(editingVersionId.value)}`, payload)
    clearApiCache('/hills')
    showEditModal.value = false
    showMessage('success', t('hills.editVersionSuccess', { hillId: editingVersionId.value }))
    await fetchHierarchy()
  } catch (err: any) {
    showMessage('error', err.message || t('hills.editVersionError'))
  } finally {
    isSaving.value = false
  }
}

// 6. Usuwanie wersji
const handleDeleteVersion = (version: HillVersion) => {
  confirmAction.value = {
    title: t('hills.delConfirmTitle'),
    text: t('hills.delConfirmText', { hillId: version.hill_id }),
    action: async () => {
      try {
        await api.delete(`/hills/${encodeURIComponent(version.hill_id)}`)
        clearApiCache('/hills')
        showMessage('success', t('hills.delSuccess', { hillId: version.hill_id }))
        await fetchHierarchy()
      } catch (err: any) {
        showMessage('error', err.message || t('hills.delError'))
      }
    },
  }
  showConfirmModal.value = true
}

const executeConfirmAction = async () => {
  if (!confirmAction.value) return
  isSaving.value = true
  try {
    await confirmAction.value.action()
  } finally {
    isSaving.value = false
    showConfirmModal.value = false
    confirmAction.value = null
  }
}

onMounted(() => {
  fetchHierarchy()
})
</script>

<template>
  <div class="page">
    <!-- Nagłówek widoku -->
    <div class="header-row">
      <div>
        <div class="title-with-badge">
          <h2>{{ t('nav.hills') }}</h2>
          <span class="hierarchy-pill">{{ t('hills.hierarchyBadge') }}</span>
        </div>
        <p class="subtitle">
          {{ t('hills.desc') }}
        </p>
      </div>

      <button v-if="auth.isAdmin.value" @click="openAddModal()" class="btn-primary">
        {{ t('hills.addBtn') }}
      </button>
    </div>

    <!-- Pasek statystyk -->
    <div class="stats-overview">
      <div class="stat-box">
        <span class="stat-number">{{ stats.complexesCount }}</span>
        <span class="stat-label">{{ t('hills.statComplexes') }}</span>
      </div>
      <div class="stat-box">
        <span class="stat-number">{{ stats.totalTypes }}</span>
        <span class="stat-label">{{ t('hills.statTypes') }}</span>
      </div>
      <div class="stat-box">
        <span class="stat-number">{{ stats.totalVersions }}</span>
        <span class="stat-label">{{ t('hills.statVersions') }}</span>
      </div>
    </div>

    <!-- Pasek powiadomień -->
    <transition name="fade">
      <div v-if="message" :class="['alert', message.type]">
        <span>{{ message.text }}</span>
        <button class="alert-close" @click="message = null">✕</button>
      </div>
    </transition>

    <!-- Pasek filtrów -->
    <div class="filter-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          v-model="searchQuery"
          :placeholder="t('hills.searchPh')"
          class="search-input"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="clear-search">✕</button>
      </div>

      <!-- Filtry rodzajów skoczni -->
      <div class="type-filter-group">
        <button
          :class="['filter-btn', { active: selectedTypeFilter === 'ALL' }]"
          @click="selectedTypeFilter = 'ALL'"
        >
          {{ t('hills.filterAll') }}
        </button>
        <button
          :class="['filter-btn flying', { active: selectedTypeFilter === 'FLYING' }]"
          @click="selectedTypeFilter = 'FLYING'"
        >
          {{ t('hills.filterFlying') }}
        </button>
        <button
          :class="['filter-btn large', { active: selectedTypeFilter === 'LARGE' }]"
          @click="selectedTypeFilter = 'LARGE'"
        >
          {{ t('hills.filterLarge') }}
        </button>
        <button
          :class="['filter-btn normal', { active: selectedTypeFilter === 'NORMAL' }]"
          @click="selectedTypeFilter = 'NORMAL'"
        >
          {{ t('hills.filterNormal') }}
        </button>
      </div>

      <span class="count-badge">{{ t('hills.visibleCount', { count: filteredComplexes.length }) }}</span>
    </div>

    <!-- Pasek łączenia skoczni (tylko ADMIN) -->
    <div v-if="auth.isAdmin.value && selectedMergeHills.length > 0" class="admin-merge-sticky-bar">
      <div class="merge-bar-top">
        <div class="merge-title-row">
          <strong>{{ t('hills.mergeTitle', { count: selectedMergeHills.length }) }}</strong>
          <button type="button" @click="clearMergeSelection" class="btn-clear-merge">{{ t('common.clear') }}</button>
        </div>
        <div class="merge-chips">
          <span v-for="mh in selectedMergeHills" :key="mh.hill_id" class="merge-chip">
            <code>{{ mh.hill_id }}</code> ({{ mh.unit || 'HS' }}{{ mh.size }})
            <button type="button" @click="toggleMergeSelection(mh)">&times;</button>
          </span>
        </div>
      </div>

      <div v-if="mergeCompatibilityError" class="merge-error-msg">
        ⚠️ {{ mergeCompatibilityError }}
      </div>

      <div class="merge-bar-actions">
        <div v-if="selectedMergeHills.length >= 2 && !mergeCompatibilityError" class="merge-target-picker">
          <label>{{ t('hills.targetCanonical') }}</label>
          <select v-model="targetMergeId" class="form-input merge-select">
            <option v-for="mh in selectedMergeHills" :key="mh.hill_id" :value="mh.hill_id">
              {{ mh.place }} ({{ mh.hill_id }}) — {{ formatSessionsCount(mh.total_sessions || 0) }}
            </option>
          </select>
        </div>
        <button
          type="button"
          class="btn-merge-submit"
          :disabled="selectedMergeHills.length < 2 || !!mergeCompatibilityError || isSaving"
          @click="handleMergeHills"
        >
          {{ t('hills.mergeBtn', { count: selectedMergeHills.length }) }}
        </button>
      </div>
    </div>

    <!-- Stan ładowania -->
    <SkiLoader v-if="loading">{{ t('hills.loading') }}</SkiLoader>

    <!-- Lista Kompleksów (Poziom 1) -->
    <div v-else-if="filteredComplexes.length > 0" class="complexes-grid">
      <div
        v-for="complex in filteredComplexes"
        :key="complex.place"
        class="complex-card"
      >
        <!-- Nagłówek kompleksu (Poziom 1) -->
        <div class="complex-header">
          <div class="complex-title-group">
            <CountryFlag :code="complex.country_code" size="lg" />
            <div>
              <h3 class="complex-place">{{ complex.place }}</h3>
              <span class="complex-country-pill">{{ complex.country_code }}</span>
            </div>
          </div>

          <div class="complex-meta">
            <span class="types-count-tag">
              {{ complex.types.length }}
              {{ complex.types.length === 1 ? t('hills.objects1') : t('hills.objectsMany') }}
            </span>
            <button
              v-if="auth.isAdmin.value"
              @click="openAddModal(complex)"
              class="btn-subtle-add"
              :title="t('hills.addVersionTitle')"
            >
              {{ t('hills.addVersionBtn') }}
            </button>
          </div>
        </div>

        <!-- Lista rodzajów skoczni w kompleksie (Poziom 2) -->
        <div class="types-container">
          <div
            v-for="typeGroup in complex.types"
            :key="typeGroup.type"
            :class="['type-group-card', typeGroup.type.toLowerCase()]"
          >
            <!-- Nagłówek rodzaju skoczni -->
            <div class="type-header">
              <div class="type-label-box">
                <span class="type-icon">{{ getTypeIcon(resolveDisplayHillType(typeGroup)) }}</span>
                <div>
                  <h4 class="type-title">{{ formatHillTypeName(resolveDisplayHillType(typeGroup)) }}</h4>
                  <span class="type-tech-tag">{{ resolveDisplayHillType(typeGroup) }}</span>
                </div>
              </div>

              <!-- Flaga aktualnej wersji -->
              <div class="current-badge-pill">
                <span class="pulse-dot"></span>
                <span>{{ t('hills.currentBadge') }} {{ typeGroup.current_version.unit || 'HS' }} {{ typeGroup.current_version.size }}</span>
              </div>
            </div>

            <!-- Prezentacja AKTUALNEJ wersji skoczni (Poziom 3) -->
            <div class="current-version-panel">
              <div class="specs-grid">
                <div class="spec-cell highlight">
                  <span class="spec-title">{{ t('hills.hillSizeSpec') }}</span>
                  <span class="spec-value">{{ typeGroup.current_version.unit || 'HS' }} {{ typeGroup.current_version.size }}</span>
                </div>

                <div class="spec-cell">
                  <span class="spec-title">{{ t('hills.kPointSpec') }}</span>
                  <span class="spec-value">
                    {{ typeGroup.current_version.k_point ? `K-${typeGroup.current_version.k_point}` : '-' }}
                  </span>
                </div>

                <div class="spec-cell">
                  <span class="spec-title">{{ t('hills.recordSpec') }}</span>
                  <span class="spec-value record-val" v-if="typeGroup.current_version.record">
                    {{ typeGroup.current_version.record }} m
                    <small v-if="typeGroup.current_version.record_holder" class="holder-name">
                      ({{ typeGroup.current_version.record_holder }})
                    </small>
                  </span>
                  <span v-else class="spec-value text-dim">-</span>
                </div>

                <div class="spec-cell">
                  <span class="spec-title">{{ t('hills.activitySpec') }}</span>
                  <span class="spec-value" v-if="typeGroup.current_version.total_sessions">
                    {{ formatSessionsCount(typeGroup.current_version.total_sessions) }}
                    <small v-if="typeGroup.current_version.last_session_date" class="date-dim">
                      ({{ t('hills.lastDate') }} {{ typeGroup.current_version.last_session_date }})
                    </small>
                  </span>
                  <span v-else class="spec-value text-dim">{{ t('hills.noSessionsPlayed') }}</span>
                </div>
              </div>

              <!-- Narzędzia edycji i łączenia aktualnej dla Admina -->
              <div v-if="auth.isAdmin.value" class="admin-quick-actions">
                <label class="merge-checkbox-label" :title="t('hills.mergeCheckboxTitle')">
                  <input
                    type="checkbox"
                    :checked="selectedMergeIds.includes(typeGroup.current_version.hill_id)"
                    @change="toggleMergeSelection(typeGroup.current_version)"
                  />
                  <span>{{ t('hills.mergeCheckbox') }}</span>
                </label>
                <button
                  @click="openEditModal(typeGroup.current_version)"
                  class="btn-icon edit"
                  :title="t('hills.editCurrentTitle')"
                >
                  ✏️ {{ t('hills.editVerTitle') }}
                </button>
              </div>
            </div>

            <!-- Historia wersji (Rozwijana sekcja dla Poziomu 3) -->
            <div class="history-section">
              <button
                class="history-toggle-btn"
                @click="toggleHistory(complex.place, typeGroup.type)"
              >
                <span>
                  {{ t('hills.historyLabel', { count: typeGroup.versions.length }) }}
                </span>
                <span class="toggle-arrow">
                  {{ isHistoryExpanded(complex.place, typeGroup.type) ? `▲ ${t('common.collapse')}` : `▼ ${t('common.expand')}` }}
                </span>
              </button>

              <div
                v-if="isHistoryExpanded(complex.place, typeGroup.type)"
                class="history-table-wrapper"
              >
                <table class="history-table">
                  <thead>
                    <tr>
                      <th>{{ t('common.status') }}</th>
                      <th>{{ t('hills.thVersionId') }}</th>
                      <th>{{ t('hills.thParams') }}</th>
                      <th>{{ t('hills.thRecord') }}</th>
                      <th>{{ t('hills.thSessionsLast') }}</th>
                      <th v-if="auth.isAdmin.value" style="text-align: right">{{ t('hills.thManage') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="ver in typeGroup.versions"
                      :key="ver.hill_id"
                      :class="{ 'current-row': ver.is_current }"
                    >
                      <td>
                        <span v-if="ver.is_current" class="status-badge current">
                          {{ t('hills.statusCurrent') }}
                        </span>
                        <span v-else class="status-badge historical">
                          {{ t('hills.statusHistorical') }}
                        </span>
                      </td>
                      <td>
                        <code class="hill-code">{{ ver.hill_id }}</code>
                      </td>
                      <td>
                        <strong>{{ ver.unit || 'HS' }} {{ ver.size }}</strong>
                        <span v-if="ver.k_point" class="k-dim"> (K-{{ ver.k_point }})</span>
                      </td>
                      <td>
                        <span v-if="ver.record">
                          <strong>{{ ver.record }} m</strong>
                          <small v-if="ver.record_holder" class="holder-dim">
                            - {{ ver.record_holder }}
                          </small>
                        </span>
                        <span v-else class="text-dim">-</span>
                      </td>
                      <td>
                        <span v-if="ver.total_sessions">
                          {{ formatSessionsCount(ver.total_sessions) }}
                          <small v-if="ver.last_season" class="season-dim">
                            ({{ t('hills.lastSeason', { season: ver.last_season }) }})
                          </small>
                        </span>
                        <span v-else class="text-dim">-</span>
                      </td>
                      <td v-if="auth.isAdmin.value" style="text-align: right">
                        <div class="actions-flex">
                          <label class="merge-checkbox-label compact" :title="t('hills.mergeCompactTitle')">
                            <input
                              type="checkbox"
                              :checked="selectedMergeIds.includes(ver.hill_id)"
                              @change="toggleMergeSelection(ver)"
                            />
                          </label>
                          <button
                            v-if="!ver.is_current"
                            @click="handleSetCurrent(ver)"
                            class="btn-set-current"
                            :title="t('hills.setCurrentTitle')"
                          >
                            {{ t('hills.setCurrentBtn') }}
                          </button>
                          <button
                            @click="openEditModal(ver)"
                            class="btn-mini edit"
                            :title="t('hills.editVerTitle')"
                          >
                            ✏️
                          </button>
                          <button
                            @click="handleDeleteVersion(ver)"
                            class="btn-mini delete"
                            :title="t('hills.delVerTitle')"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Pusty wynik filtrowania -->
    <div v-else class="no-results-card">
      <span class="no-results-icon">🏔️</span>
      <h3>{{ t('hills.emptyTitle') }}</h3>
      <p>{{ t('hills.emptyDesc') }}</p>
      <button @click="searchQuery = ''; selectedTypeFilter = 'ALL'" class="btn-primary">
        {{ t('common.clearFilters') }}
      </button>
    </div>

    <!-- Modal dodawania nowej skoczni / wersji -->
    <div v-if="showAddModal && auth.isAdmin.value" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ t('hills.modalAddTitle') }}</h3>
          <button class="modal-close-btn" @click="showAddModal = false">✕</button>
        </div>
        <p class="modal-subtitle">
          {{ t('hills.modalAddSub') }}
        </p>

        <div class="form-grid">
          <div class="form-group">
            <label>{{ t('hills.labelPlaceReq') }}</label>
            <input
              v-model="hillForm.place"
              :placeholder="t('hills.phPlace')"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelCountryReq') }}</label>
            <input
              v-model="hillForm.country_code"
              :placeholder="t('hills.phCountry')"
              maxlength="3"
              class="form-input uppercase"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelHillTypeReq') }}</label>
            <select v-model="hillForm.type" class="form-input">
              <option value="LARGE">{{ t('hills.optLarge') }}</option>
              <option value="NORMAL">{{ t('hills.optNormal') }}</option>
              <option value="FLYING">{{ t('hills.optFlying') }}</option>
              <option value="SMALL">{{ t('hills.optSmall') }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelUnit') }}</label>
            <select v-model="hillForm.unit" class="form-input">
              <option value="HS">{{ t('hills.optHsFull') }}</option>
              <option value="K">{{ t('hills.optKFull') }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelSizeReq') }}</label>
            <input
              type="number"
              v-model="hillForm.size"
              placeholder="140"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelKPoint') }}</label>
            <input
              type="number"
              step="0.5"
              v-model="hillForm.k_point"
              placeholder="125.0"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelRecord') }}</label>
            <input
              type="number"
              step="0.5"
              v-model="hillForm.record"
              placeholder="147.0"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelHolder') }}</label>
            <input
              v-model="hillForm.record_holder"
              placeholder="Yukiya Sato"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelMeterVal') }}</label>
            <input
              type="number"
              step="0.1"
              v-model="hillForm.meter_value"
              placeholder="1.8"
              class="form-input"
            />
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="hillForm.is_current" />
              <span>{{ t('hills.markCurrent') }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button @click="showAddModal = false" class="btn-cancel" :disabled="isSaving">
            {{ t('common.cancel') }}
          </button>
          <button @click="saveNewVersion" class="btn-primary" :disabled="isSaving">
            {{ isSaving ? t('hills.saving') : t('hills.saveNewBtn') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal edycji wersji -->
    <div v-if="showEditModal && auth.isAdmin.value" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>{{ t('hills.modalEditTitleId', { id: editingVersionId || '' }) }}</h3>
          <button class="modal-close-btn" @click="showEditModal = false">✕</button>
        </div>
        <p class="modal-subtitle">
          {{ t('hills.modalEditSub') }}
        </p>

        <div class="form-grid">
          <div class="form-group">
            <label>{{ t('hills.labelPlaceShort') }}</label>
            <input v-model="hillForm.place" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelCountryShort') }}</label>
            <input v-model="hillForm.country_code" maxlength="3" class="form-input uppercase" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelHillTypeShort') }}</label>
            <select v-model="hillForm.type" class="form-input">
              <option value="LARGE">{{ t('hills.optLarge') }}</option>
              <option value="NORMAL">{{ t('hills.optNormal') }}</option>
              <option value="FLYING">{{ t('hills.optFlying') }}</option>
              <option value="SMALL">{{ t('hills.optSmall') }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelUnitShort') }}</label>
            <select v-model="hillForm.unit" class="form-input">
              <option value="HS">HS</option>
              <option value="K">K</option>
            </select>
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelSizeShort') }}</label>
            <input type="number" v-model="hillForm.size" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelKShort') }}</label>
            <input type="number" step="0.5" v-model="hillForm.k_point" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelRecordShort') }}</label>
            <input type="number" step="0.5" v-model="hillForm.record" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelHolder') }}</label>
            <input v-model="hillForm.record_holder" class="form-input" />
          </div>

          <div class="form-group">
            <label>{{ t('hills.labelMeterShort') }}</label>
            <input type="number" step="0.1" v-model="hillForm.meter_value" class="form-input" />
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="hillForm.is_current" />
              <span>{{ t('hills.markCurrentEdit') }}</span>
            </label>
          </div>
        </div>

        <div class="modal-actions">
          <button @click="showEditModal = false" class="btn-cancel" :disabled="isSaving">
            {{ t('common.cancel') }}
          </button>
          <button @click="saveEditVersion" class="btn-primary" :disabled="isSaving">
            {{ isSaving ? t('hills.saving') : t('hills.saveEditBtn') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Niestandardowy modal potwierdzenia akcji (zamiast window.confirm) -->
    <div v-if="showConfirmModal && confirmAction && auth.isAdmin.value" class="modal-overlay" @click.self="showConfirmModal = false">
      <div class="modal-card confirm-dialog">
        <div class="confirm-icon">⚠️</div>
        <h3>{{ confirmAction.title }}</h3>
        <p class="confirm-text">{{ confirmAction.text }}</p>

        <div class="modal-actions">
          <button @click="showConfirmModal = false" class="btn-cancel" :disabled="isSaving">
            {{ t('common.cancel') }}
          </button>
          <button @click="executeConfirmAction" class="btn-primary" :disabled="isSaving">
            {{ isSaving ? t('common.processing') : t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 24px 28px;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-row h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.55em;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.hierarchy-pill {
  background: #e0f2fe;
  color: #0284c7;
  font-size: 0.76em;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.subtitle {
  margin: 6px 0 0 0;
  color: #64748b;
  font-size: 0.9em;
  line-height: 1.4;
}

/* Pasek statystyk */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-size: 1.6em;
  font-weight: 800;
  color: #0284c7;
}

.stat-label {
  font-size: 0.82em;
  color: #64748b;
  font-weight: 500;
}

/* Alert */
.alert {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  font-weight: 500;
  font-size: 0.9em;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.alert.success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.alert.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.alert-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 1.1em;
  cursor: pointer;
  padding: 0 4px;
}

/* Filtry */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 14px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 280px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 0.9em;
}

.search-input {
  width: 100%;
  padding: 9px 36px 9px 34px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.9em;
  box-sizing: border-box;
  background: #f8fafc;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #0284c7;
  background: white;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

.clear-search {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.9em;
}

.type-filter-group {
  display: flex;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 8px;
}

.filter-btn {
  background: none;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.84em;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-btn:hover {
  color: #0f172a;
}

.filter-btn.active {
  background: white;
  color: #0284c7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.count-badge {
  background: #f1f5f9;
  padding: 6px 12px;
  border-radius: 20px;
  color: #475569;
  font-size: 0.82em;
  font-weight: 600;
}

/* Siatka kompleksów (Poziom 1) */
.complexes-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.complex-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transition: border-color 0.2s;
}

.complex-card:hover {
  border-color: #cbd5e1;
}

.complex-header {
  background: #f8fafc;
  padding: 8px 14px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.complex-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.complex-flag {
  font-size: 1.35em;
  line-height: 1;
}

.complex-place {
  margin: 0;
  font-size: 1.1em;
  font-weight: 700;
  color: #0f172a;
}

.complex-country-pill {
  font-family: monospace;
  font-weight: 700;
  color: #64748b;
  font-size: 0.78em;
  letter-spacing: 0.5px;
}

.complex-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.types-count-tag {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.74em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-subtle-add {
  background: white;
  border: 1px solid #cbd5e1;
  color: #0284c7;
  font-size: 0.78em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-subtle-add:hover {
  background: #f0f9ff;
  border-color: #38bdf8;
}

/* Kontener rodzajów skoczni (Poziom 2) */
.types-container {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-group-card {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px 10px;
}

.type-group-card.large {
  border-left: 4px solid #f59e0b;
}

.type-group-card.normal {
  border-left: 4px solid #3b82f6;
}

.type-group-card.flying {
  border-left: 4px solid #ef4444;
}

.type-group-card.small {
  border-left: 4px solid #10b981;
}

.type-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 6px;
}

.type-label-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-icon {
  font-size: 1.15em;
}

.type-title {
  margin: 0;
  font-size: 0.95em;
  font-weight: 700;
  color: #1e293b;
}

.type-tech-tag {
  font-size: 0.7em;
  font-family: monospace;
  color: #64748b;
  font-weight: 600;
}

.current-badge-pill {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  font-size: 0.74em;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

/* Panel aktualnej wersji (Poziom 3) */
.current-version-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.specs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  flex: 1;
}

.spec-cell {
  display: flex;
  flex-direction: column;
}

.spec-title {
  font-size: 0.68em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.spec-value {
  font-size: 0.92em;
  font-weight: 700;
  color: #0f172a;
  margin-top: 1px;
}

.spec-cell.highlight .spec-value {
  color: #0284c7;
  font-size: 1.0em;
}

.record-val {
  color: #b45309;
}

.holder-name {
  color: #64748b;
  font-weight: 500;
  font-size: 0.8em;
}

.date-dim {
  color: #94a3b8;
  font-weight: normal;
  font-size: 0.78em;
}

.admin-quick-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  border-radius: 5px;
  font-size: 0.78em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: #334155;
}
.btn-icon:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
  color: #0369a1;
}

/* Sekcja historii wersji */
.history-section {
  margin-top: 4px;
}

.history-toggle-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.78em;
  font-weight: 600;
  cursor: pointer;
  padding: 3px 0;
  display: flex;
  justify-content: space-between;
  width: 100%;
  transition: color 0.2s;
}

.history-toggle-btn:hover {
  color: #0284c7;
}

.toggle-arrow {
  color: #0284c7;
}

.history-table-wrapper {
  margin-top: 4px;
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82em;
  text-align: left;
}

.history-table th {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 5px 8px;
  border-bottom: 1px solid #e2e8f0;
}

.history-table td {
  padding: 4px 8px;
  border-bottom: 1px solid #f1f5f9;
}

.history-table tr.current-row {
  background: #f0fdf4;
}

.status-badge {
  font-size: 0.72em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.status-badge.current {
  background: #dcfce7;
  color: #15803d;
}
.status-badge.historical {
  background: #f1f5f9;
  color: #64748b;
}

.hill-code {
  font-family: monospace;
  font-size: 0.88em;
  color: #475569;
}

.k-dim {
  color: #64748b;
  font-size: 0.9em;
}

.holder-dim {
  color: #64748b;
  font-size: 0.85em;
}

.season-dim {
  color: #94a3b8;
  font-size: 0.85em;
}

.actions-flex {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}

.btn-set-current {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 0.78em;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.btn-set-current:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.btn-mini {
  background: white;
  border: 1px solid #cbd5e1;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
}
.btn-mini.edit:hover {
  background: #e0f2fe;
}
.btn-mini.delete:hover {
  background: #fee2e2;
  border-color: #f87171;
}

/* Brak wyników */
.no-results-card {
  text-align: center;
  padding: 60px 20px;
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  margin-top: 20px;
}

.no-results-icon {
  font-size: 3em;
  display: block;
  margin-bottom: 12px;
}

.no-results-card h3 {
  margin: 0 0 6px 0;
  color: #1e293b;
}

.no-results-card p {
  margin: 0 0 16px 0;
  color: #64748b;
}

/* Przyciski standardowe */
.btn-primary {
  background: #0284c7;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #0369a1;
}

.btn-cancel {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.btn-cancel:hover {
  background: #e2e8f0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.modal-card {
  background: white;
  border-radius: 12px;
  max-width: 620px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.modal-header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 1.25em;
  font-weight: 800;
}

.modal-close-btn {
  background: none;
  border: none;
  font-size: 1.2em;
  color: #94a3b8;
  cursor: pointer;
}

.modal-subtitle {
  margin: 0 0 18px 0;
  color: #64748b;
  font-size: 0.88em;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 0.78em;
  font-weight: 600;
  color: #475569;
}

.form-input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9em;
}

.form-input:focus {
  outline: none;
  border-color: #0284c7;
}

.checkbox-group {
  grid-column: span 2;
  margin-top: 6px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.86em;
  font-weight: 600;
  color: #1e293b;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

/* Potwierdzenie dialog */
.confirm-dialog {
  max-width: 440px;
  text-align: center;
}

.confirm-icon {
  font-size: 2.5em;
  margin-bottom: 10px;
}

.confirm-text {
  color: #475569;
  font-size: 0.92em;
  line-height: 1.5;
  margin: 10px 0 20px 0;
}

.uppercase {
  text-transform: uppercase;
}
.text-dim {
  color: #94a3b8;
}

/* Admin Merge Bar & Checkboxes */
.admin-merge-sticky-bar {
  position: sticky;
  top: 66px;
  z-index: 90;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #f8fafc;
  border: 1px solid #334155;
  border-left: 4px solid #10b981;
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.merge-bar-top {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merge-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-clear-merge {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #475569;
  color: #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.78em;
  cursor: pointer;
}

.merge-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.merge-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #0b1329;
  border: 1px solid #334155;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.8em;
}
.merge-chip code {
  color: #38bdf8;
  font-family: var(--font-mono);
}
.merge-chip button {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 2px;
}

.merge-error-msg {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid #ef4444;
  color: #fecaca;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.84em;
  font-weight: 600;
}

.merge-bar-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.merge-target-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 240px;
}
.merge-target-picker label {
  color: #cbd5e1;
  font-size: 0.82em;
  white-space: nowrap;
}
.merge-select {
  background: #0f172a;
  color: white;
  border-color: #475569;
  flex: 1;
}

.btn-merge-submit {
  background: #10b981;
  color: #064e3b;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  padding: 9px 16px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-merge-submit:hover:not(:disabled) {
  background: #34d399;
}
.btn-merge-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.merge-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78em;
  font-weight: 600;
  color: #0369a1;
  background: #e0f2fe;
  border: 1px solid #bae6fd;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.merge-checkbox-label.compact {
  padding: 3px 6px;
}

.history-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px), (max-width: 960px) and (max-height: 520px) {
  .page {
    padding: 12px 10px;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: clip;
    box-sizing: border-box;
  }
  .filter-bar,
  .search-box,
  .complexes-grid,
  .complex-card,
  .type-group-card,
  .current-version-panel {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }
  .search-input {
    min-width: 0;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  .header-row {
    flex-direction: column;
    align-items: stretch;
  }
  .stats-overview {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .stat-box {
    padding: 8px 10px;
  }
  .stat-number {
    font-size: 1.25em;
  }
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .search-box {
    min-width: 0;
    flex: none;
  }
  .type-filter-group {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    gap: 6px;
    padding-bottom: 2px;
  }
  .filter-btn {
    flex-shrink: 0;
  }
  .complexes-grid {
    grid-template-columns: 1fr !important;
  }
  .specs-grid {
    grid-template-columns: 1fr 1fr !important;
  }
  .type-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .checkbox-group {
    grid-column: span 1;
  }
  .merge-bar-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .merge-target-picker {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 480px) {
  .stats-overview {
    grid-template-columns: 1fr;
  }
  .specs-grid {
    grid-template-columns: 1fr !important;
  }
}
</style>
