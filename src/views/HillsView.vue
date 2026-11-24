<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import SkiLoader from '@/components/SkiLoader.vue'
import { api, clearApiCache } from '@/api/client'
import { useAuth } from '@/stores/auth'

const auth = useAuth()

interface Hill {
  hill_id: string
  place?: string | null
  country_code?: string | null
  size?: number | null
  unit?: string | null
  type?: string | null
  k_point?: number | null
  year_built?: number | null
  record?: number | null
  record_holder?: string | null
}

const hills = ref<Hill[]>([])
const loading = ref(true)
const searchQuery = ref('')
const editingHillId = ref<string | null>(null)
const editForm = ref<Partial<Hill>>({})
const isSaving = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const showAddModal = ref(false)
const newHillForm = ref<Partial<Hill>>({
  unit: 'HS',
  type: 'LARGE'
})

const fetchHills = async () => {
  loading.value = true
  try {
    const data = await api.get('/hills/list', { cacheTtlMs: 60000 })
    hills.value = data
  } catch (e) {
    console.error('Błąd pobierania skoczni:', e)
    showMessage('error', 'Błąd połączenia z serwerem.')
  } finally {
    loading.value = false
  }
}

const filteredHills = computed(() => {
  if (!searchQuery.value.trim()) return hills.value
  const q = searchQuery.value.toLowerCase().trim()
  return hills.value.filter(
    (h) =>
      (h.place && h.place.toLowerCase().includes(q)) ||
      (h.country_code && h.country_code.toLowerCase().includes(q)) ||
      (h.hill_id && h.hill_id.toLowerCase().includes(q))
  )
})

const startEdit = (hill: Hill) => {
  editingHillId.value = hill.hill_id
  editForm.value = { ...hill }
}

const cancelEdit = () => {
  editingHillId.value = null
  editForm.value = {}
}

const saveEdit = async (hillId: string) => {
  isSaving.value = true
  try {
    const payload = {
      place: editForm.value.place,
      country_code: editForm.value.country_code,
      size: editForm.value.size ? Number(editForm.value.size) : null,
      unit: editForm.value.unit || 'HS',
      type: editForm.value.type,
      k_point: editForm.value.k_point ? Number(editForm.value.k_point) : null,
      year_built: editForm.value.year_built ? Number(editForm.value.year_built) : null,
      record: editForm.value.record ? Number(editForm.value.record) : null,
      record_holder: editForm.value.record_holder || null,
    }

    await api.put(`/hills/${encodeURIComponent(hillId)}`, payload)
    const idx = hills.value.findIndex((h) => h.hill_id === hillId)
    if (idx !== -1) {
      hills.value[idx] = { ...hills.value[idx], ...payload, hill_id: hillId }
    }
    editingHillId.value = null
    clearApiCache('/hills/list')
    showMessage('success', `Zaktualizowano dane skoczni ${hillId}.`)
  } catch (e: any) {
    console.error(e)
    showMessage('error', e.message || 'Błąd połączenia z serwerem.')
  } finally {
    isSaving.value = false
  }
}

const deleteHill = async (hillId: string) => {
  if (!confirm(`Czy na pewno chcesz usunąć skocznię ${hillId}?`)) return

  try {
    await api.delete(`/hills/${encodeURIComponent(hillId)}`)
    hills.value = hills.value.filter((h) => h.hill_id !== hillId)
    clearApiCache('/hills/list')
    showMessage('success', `Usunięto skocznię ${hillId}.`)
  } catch (e: any) {
    console.error(e)
    showMessage('error', e.message || 'Błąd połączenia z serwerem.')
  }
}

const saveNewHill = async () => {
  if (!newHillForm.value.place || !newHillForm.value.size) {
    alert('Podaj miejscowość i rozmiar HS skoczni!')
    return
  }

  const unit = newHillForm.value.unit || 'HS'
  const place = newHillForm.value.place.toUpperCase().trim()
  const size = Number(newHillForm.value.size)
  const hillId = `${place}_${unit}${size}`

  isSaving.value = true
  try {
    const payload = {
      place: newHillForm.value.place,
      country_code: (newHillForm.value.country_code || '').toUpperCase(),
      size: size,
      unit: unit,
      type: newHillForm.value.type || 'LARGE',
      k_point: newHillForm.value.k_point ? Number(newHillForm.value.k_point) : null,
      year_built: newHillForm.value.year_built ? Number(newHillForm.value.year_built) : null,
      record: newHillForm.value.record ? Number(newHillForm.value.record) : null,
      record_holder: newHillForm.value.record_holder || null,
    }

    await api.put(`/hills/${encodeURIComponent(hillId)}`, payload)
    hills.value.unshift({ ...payload, hill_id: hillId })
    showAddModal.value = false
    newHillForm.value = { unit: 'HS', type: 'LARGE' }
    clearApiCache('/hills/list')
    showMessage('success', `Dodano nową skocznię ${hillId}.`)
  } catch (e: any) {
    console.error(e)
    showMessage('error', e.message || 'Błąd połączenia z serwerem.')
  } finally {
    isSaving.value = false
  }
}

const showMessage = (type: 'success' | 'error', text: string) => {
  message.value = { type, text }
  setTimeout(() => {
    message.value = null
  }, 4000)
}

onMounted(() => {
  fetchHills()
})
</script>

<template>
  <div class="page">
    <div class="header-row">
      <div>
        <h2>🏔️ Baza Skoczni Narciarskich</h2>
        <p class="subtitle">Zarządzanie parametrami skoczni (HS, punkt K, rozmiar, typ) zapisanymi w MongoDB.</p>
      </div>
      <button v-if="auth.isAdmin.value" @click="showAddModal = true" class="btn-primary">
        + Dodaj nową skocznię
      </button>
    </div>

    <!-- Alert wiadomości -->
    <div v-if="message" :class="['alert', message.type]">
      {{ message.text }}
    </div>

    <!-- Filtrowanie -->
    <div class="filter-bar">
      <input
        type="text"
        v-model="searchQuery"
        placeholder="Szukaj po miejscowości, kodzie kraju lub ID..."
        class="search-input"
      />
      <span class="count-badge">Łącznie: {{ filteredHills.length }}</span>
    </div>

    <SkiLoader v-if="loading">Ładowanie bazy skoczni...</SkiLoader>

    <div v-else>
      <div class="table-responsive" v-if="filteredHills.length > 0">
        <table class="results-table">
        <thead>
          <tr>
            <th>ID / Miejscowość</th>
            <th style="width: 80px; text-align: center">Kraj</th>
            <th style="width: 110px">HS / Rozmiar</th>
            <th style="width: 100px">Punkt K</th>
            <th style="width: 130px">Typ skoczni</th>
            <th>Rekord</th>
            <th v-if="auth.isAdmin.value" style="width: 160px; text-align: right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="hill in filteredHills" :key="hill.hill_id">
            <!-- Wiersz w trybie edycji -->
            <tr v-if="editingHillId === hill.hill_id" class="edit-row">
              <td>
                <span class="hill-id-tag">{{ hill.hill_id }}</span>
                <input
                  v-model="editForm.place"
                  placeholder="Miejscowość"
                  class="input-inline"
                />
              </td>
              <td style="text-align: center">
                <input
                  v-model="editForm.country_code"
                  placeholder="KOD"
                  maxlength="3"
                  class="input-inline text-center uppercase"
                  style="width: 60px"
                />
              </td>
              <td>
                <div style="display: flex; gap: 4px; align-items: center">
                  <select v-model="editForm.unit" class="input-inline" style="width: 60px">
                    <option value="HS">HS</option>
                    <option value="K">K</option>
                  </select>
                  <input
                    type="number"
                    v-model="editForm.size"
                    placeholder="Rozmiar"
                    class="input-inline"
                    style="width: 70px"
                  />
                </div>
              </td>
              <td>
                <input
                  type="number"
                  step="0.5"
                  v-model="editForm.k_point"
                  placeholder="K-Point"
                  class="input-inline"
                  style="width: 80px"
                />
              </td>
              <td>
                <select v-model="editForm.type" class="input-inline">
                  <option value="NORMAL">Normalna</option>
                  <option value="LARGE">Duża</option>
                  <option value="FLYING">Mamucia</option>
                  <option value="SMALL">Mała</option>
                </select>
              </td>
              <td>
                <div style="display: flex; flex-direction: column; gap: 4px">
                  <input
                    type="number"
                    step="0.5"
                    v-model="editForm.record"
                    placeholder="Dystans (m)"
                    class="input-inline"
                  />
                  <input
                    type="text"
                    v-model="editForm.record_holder"
                    placeholder="Rekordzista"
                    class="input-inline"
                  />
                </div>
              </td>
              <td style="text-align: right">
                <button
                  @click="saveEdit(hill.hill_id)"
                  :disabled="isSaving"
                  class="btn-action save"
                  title="Zapisz zmiany"
                >
                  💾
                </button>
                <button
                  @click="cancelEdit"
                  :disabled="isSaving"
                  class="btn-action cancel"
                  title="Anuluj"
                >
                  ✖
                </button>
              </td>
            </tr>

            <!-- Wiersz w trybie podglądu -->
            <tr v-else>
              <td>
                <strong>{{ hill.place || '-' }}</strong>
                <small class="hill-id-dim">{{ hill.hill_id }}</small>
              </td>
              <td style="text-align: center">
                <span class="country-pill">{{ hill.country_code || '-' }}</span>
              </td>
              <td>
                <span class="hs-badge" v-if="hill.size">
                  {{ hill.unit || 'HS' }} {{ hill.size }}
                </span>
                <span v-else class="text-dim">-</span>
              </td>
              <td>
                <span v-if="hill.k_point">K-{{ hill.k_point }}</span>
                <span v-else class="text-dim">-</span>
              </td>
              <td>
                <span :class="['type-tag', hill.type?.toLowerCase()]">
                  {{ hill.type || '-' }}
                </span>
              </td>
              <td>
                <div v-if="hill.record">
                  <strong>{{ hill.record }} m</strong>
                  <small v-if="hill.record_holder" class="record-holder"> ({{ hill.record_holder }})</small>
                </div>
                <span v-else class="text-dim">-</span>
              </td>
              <td v-if="auth.isAdmin.value" style="text-align: right">
                <button
                  @click="startEdit(hill)"
                  class="btn-action edit"
                  title="Edytuj dane skoczni"
                >
                  ✏️
                </button>
                <button
                  @click="deleteHill(hill.hill_id)"
                  class="btn-action delete"
                  title="Usuń skocznię"
                >
                  🗑️
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      </div>

      <div v-else class="no-results">
        Brak skoczni spełniających kryteria.
      </div>
    </div>

    <!-- Modal dodawania nowej skoczni -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-card">
        <h3>Dodaj nową skocznię</h3>
        <p class="subtitle">Wprowadź parametry skoczni, która zostanie utworzona w MongoDB.</p>

        <div class="form-grid">
          <div class="form-group">
            <label>Miejscowość *</label>
            <input v-model="newHillForm.place" placeholder="np. Zakopane" class="form-input" />
          </div>

          <div class="form-group">
            <label>Kod kraju (IOC 3 znaki) *</label>
            <input
              v-model="newHillForm.country_code"
              placeholder="np. POL"
              maxlength="3"
              class="form-input uppercase"
            />
          </div>

          <div class="form-group">
            <label>Jednostka</label>
            <select v-model="newHillForm.unit" class="form-input">
              <option value="HS">HS</option>
              <option value="K">K</option>
            </select>
          </div>

          <div class="form-group">
            <label>Rozmiar skoczni (HS) *</label>
            <input
              type="number"
              v-model="newHillForm.size"
              placeholder="np. 140"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>Punkt K</label>
            <input
              type="number"
              step="0.5"
              v-model="newHillForm.k_point"
              placeholder="np. 125"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>Typ skoczni</label>
            <select v-model="newHillForm.type" class="form-input">
              <option value="NORMAL">Normalna</option>
              <option value="LARGE">Duża</option>
              <option value="FLYING">Mamucia</option>
              <option value="SMALL">Mała</option>
            </select>
          </div>

          <div class="form-group">
            <label>Oficjalny rekord (m)</label>
            <input
              type="number"
              step="0.5"
              v-model="newHillForm.record"
              placeholder="np. 147.5"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>Rekordzista</label>
            <input
              v-model="newHillForm.record_holder"
              placeholder="np. Yukiya Sato"
              class="form-input"
            />
          </div>
        </div>

        <div class="modal-actions">
          <button @click="showAddModal = false" class="btn-cancel" :disabled="isSaving">
            Anuluj
          </button>
          <button @click="saveNewHill" class="btn-primary" :disabled="isSaving">
            {{ isSaving ? 'Zapisywanie...' : 'Zapisz skocznię' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  background: white;
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
}

.header-row h2 {
  margin: 0 0 4px 0;
  color: #0f172a;
  font-size: 1.45em;
  font-weight: 800;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.88em;
}

.alert {
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-weight: 500;
  font-size: 0.88em;
}
.alert.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}
.alert.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  max-width: 450px;
  padding: 6px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.88em;
}

.count-badge {
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 12px;
  color: #475569;
  font-size: 0.8em;
  font-weight: bold;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88em;
}

.results-table th,
.results-table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
}

.results-table th {
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.75em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hill-id-dim {
  display: block;
  color: #94a3b8;
  font-size: 0.8em;
  font-family: monospace;
}

.hill-id-tag {
  display: block;
  font-family: monospace;
  font-size: 0.8em;
  color: #0284c7;
  margin-bottom: 4px;
}

.country-pill {
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-weight: bold;
  color: #334155;
  font-size: 0.85em;
}

.hs-badge {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: bold;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.9em;
}

.type-tag {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
  text-transform: uppercase;
}
.type-tag.large {
  background: #fef08a;
  color: #854d0e;
}
.type-tag.normal {
  background: #e0e7ff;
  color: #3730a3;
}
.type-tag.flying {
  background: #fee2e2;
  color: #991b1b;
}

.record-holder {
  color: #64748b;
  font-size: 0.85em;
}

.text-dim {
  color: #cbd5e1;
}

.edit-row {
  background-color: #f0fdf4 !important;
}

.input-inline {
  padding: 6px 8px;
  border: 1px solid #94a3b8;
  border-radius: 4px;
  font-size: 0.9em;
  background: white;
  width: 100%;
  box-sizing: border-box;
}

.text-center {
  text-align: center;
}
.uppercase {
  text-transform: uppercase;
}

.btn-primary {
  background: #0284c7;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #0369a1;
}

.btn-action {
  background: none;
  border: 1px solid #cbd5e1;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 6px;
  font-size: 1em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.btn-action.edit:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
}
.btn-action.delete:hover {
  background: #fee2e2;
  border-color: #f87171;
}
.btn-action.save {
  background: #22c55e;
  border-color: #16a34a;
  color: white;
}
.btn-action.save:hover {
  background: #16a34a;
}
.btn-action.cancel:hover {
  background: #f1f5f9;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: #64748b;
  font-style: italic;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}
.modal-card {
  background: white;
  border-radius: 8px;
  max-width: 600px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}
.modal-card h3 {
  margin: 0 0 6px 0;
  color: #0f172a;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin: 20px 0;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 0.78em;
  font-weight: 500;
  color: #475569;
  height: 16px;
  line-height: 16px;
}
.form-input {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.9em;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
.btn-cancel {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}
.btn-cancel:hover {
  background: #e2e8f0;
}
</style>
