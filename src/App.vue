<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { ref, onMounted, onUnmounted } from 'vue'

const isMenuOpen = ref<boolean>(false)
const isStatsDropdownOpen = ref<boolean>(false)

// Zamykanie dropdowna po kliknięciu gdziekolwiek indziej na ekranie
const closeDropdown = (e: Event) => {
  const target = e.target as HTMLElement
  if (!target.closest('.dropdown-container')) {
    isStatsDropdownOpen.value = false
  }
}

const closeNavigation = () => {
  isMenuOpen.value = false
  isStatsDropdownOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="header-container">
        <RouterLink to="/" @click="closeNavigation" class="brand-link">
          <div class="logo">
            <span class="logo-ski-icon">🎿</span>
            <span class="logo-text">DATA<strong>SKI</strong></span>
            <span class="logo-badge">FIS ANALYTICS</span>
          </div>
        </RouterLink>

        <button
          class="menu-toggle"
          @click.stop="isMenuOpen = !isMenuOpen"
          aria-label="Menu"
          :class="{ active: isMenuOpen }"
        >
          <span></span><span></span><span></span>
        </button>

        <nav class="nav-links" :class="{ open: isMenuOpen }">
          <RouterLink to="/athletes" @click="closeNavigation">Baza skoczków</RouterLink>

          <RouterLink to="/sessions" @click="closeNavigation">Baza sesji</RouterLink>

          <div class="dropdown-container">
            <button class="dropdown-btn" @click.stop="isStatsDropdownOpen = !isStatsDropdownOpen">
              Statystyki <span class="arrow" :class="{ up: isStatsDropdownOpen }">▼</span>
            </button>
            <div class="dropdown-menu" v-if="isStatsDropdownOpen">
              <RouterLink to="/standings" @click="closeNavigation"> 🏆 Klasyfikacje </RouterLink>
              <RouterLink to="/stats" @click="closeNavigation"> ⚖️ Porównywarka </RouterLink>
            </div>
          </div>

          <RouterLink to="/hills" @click="closeNavigation">Baza skoczni</RouterLink>

          <RouterLink to="/predictions" @click="closeNavigation" class="predictions-nav-link">
            🔮 Przewidywania
          </RouterLink>

          <RouterLink to="/admin" class="admin-link" @click="closeNavigation">
            ⚙️ Ustawienia
          </RouterLink>
          <a href="#" class="login-btn" @click="closeNavigation">Zaloguj</a>
        </nav>
      </div>
    </header>

    <div v-if="isMenuOpen" class="menu-overlay" @click="isMenuOpen = false"></div>

    <main class="app-content">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>DataSKI &bull; Centrum Analityczne Skoków Narciarskich FIS &bull; 2026</p>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
}

/* --- STICKY HEADER (NOWOCZESNY, ALPEJSKI) --- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 10000;
  background-color: #0f172a;
  border-bottom: 1px solid #1e293b;
  color: white;
  padding: 10px 0;
  box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.25);
}

.header-container {
  max-width: 1350px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.brand-link {
  text-decoration: none;
  color: white;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.15em;
  letter-spacing: 0.5px;
}

.logo-ski-icon {
  font-size: 1.2em;
}

.logo-text strong {
  color: #38bdf8;
}

.logo-badge {
  background: #1e293b;
  border: 1px solid #334155;
  color: #38bdf8;
  font-size: 0.6em;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.nav-links {
  display: flex;
  gap: 18px;
  align-items: center;
}

.nav-links a {
  color: #94a3b8;
  text-decoration: none;
  font-size: 0.88em;
  font-weight: 500;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.nav-links a:hover {
  color: white;
  background-color: #1e293b;
}

.nav-links a.router-link-active {
  color: #38bdf8;
  background-color: rgba(56, 189, 248, 0.12);
}

.admin-link {
  color: #cbd5e1 !important;
}

.login-btn {
  background: #0284c7;
  color: white !important;
  font-weight: 500;
  padding: 5px 12px !important;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.login-btn:hover {
  background: #0369a1 !important;
}

/* --- DROPDOWN MENU --- */
.dropdown-container {
  position: relative;
}

.dropdown-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 0.88em;
  font-weight: 500;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  transition: all 0.2s;
}

.dropdown-btn:hover {
  color: white;
  background-color: #1e293b;
}

.arrow {
  font-size: 0.65em;
  transition: transform 0.2s;
}
.arrow.up {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  box-shadow: 0 10px 20px -3px rgba(0, 0, 0, 0.5);
  z-index: 10001;
}

.dropdown-menu a {
  padding: 8px 14px;
  color: #cbd5e1;
  display: block;
  font-size: 0.85em;
}

.dropdown-menu a:hover {
  background-color: #1e293b;
  color: #38bdf8;
}

/* --- KONTENER GŁÓWNY --- */
.app-content {
  flex: 1;
  width: 100%;
  max-width: 1350px;
  margin: 0 auto;
  padding: 16px 20px;
  box-sizing: border-box;
}

.app-footer {
  background-color: #0f172a;
  border-top: 1px solid #1e293b;
  color: #64748b;
  text-align: center;
  padding: 14px 20px;
  font-size: 0.8em;
  width: 100%;
}

.menu-toggle {
  display: none;
  flex-direction: column;
  justify-content: space-around;
  width: 24px;
  height: 20px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.menu-toggle span {
  display: block;
  width: 100%;
  height: 2px;
  background-color: #cbd5e1;
  border-radius: 2px;
  transition: all 0.2s;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }
  .nav-links {
    display: none;
    flex-direction: column;
    position: absolute;
    top: 52px;
    left: 0;
    width: 100%;
    background-color: #0f172a;
    border-bottom: 1px solid #334155;
    padding: 14px 20px;
    box-sizing: border-box;
    gap: 8px;
    align-items: stretch;
  }
  .nav-links.open {
    display: flex;
    z-index: 10002;
  }
  .dropdown-menu {
    position: static;
    transform: none;
    background-color: #1e293b;
    border: 1px solid #334155;
    box-shadow: none;
    margin-top: 4px;
  }
  .app-content {
    padding: 10px 12px;
  }
}
</style>
