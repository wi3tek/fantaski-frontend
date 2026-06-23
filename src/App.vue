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

// NOWA FUNKCJA - rozwiązuje problem z formaterem i błędem w <template>
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
        <RouterLink to="/" @click="closeNavigation">
          <div class="logo">DATA<strong>SKI</strong></div>
        </RouterLink>

        <button class="menu-toggle" @click.stop="isMenuOpen = !isMenuOpen">
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
      <p>&copy; 2026 DataSKI</p>
    </footer>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: sans-serif;
  background-color: #f8fafc;
}

/* --- STICKY HEADER --- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background-color: #1e293b;
  color: white;
  padding: 15px 0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.logo strong {
  color: #38bdf8;
}

.nav-links {
  display: flex;
  gap: 20px;
  align-items: center;
}

.nav-links a {
  color: #cbd5e1;
  text-decoration: none;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: white;
}

/* --- DROPDOWN MENU --- */
.dropdown-container {
  position: relative;
}

.dropdown-btn {
  background: none;
  border: none;
  color: #cbd5e1;
  font-size: 1em;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: color 0.2s;
}

.dropdown-btn:hover {
  color: white;
}

.arrow {
  font-size: 0.7em;
  transition: transform 0.2s;
}
.arrow.up {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 150%;
  left: 50%;
  transform: translateX(-50%);
  background-color: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 10px 0;
  display: flex;
  flex-direction: column;
  min-width: 180px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
}

.dropdown-menu a {
  padding: 10px 20px;
  color: #e2e8f0;
  display: block;
}

.dropdown-menu a:hover {
  background-color: #1e293b;
  color: #38bdf8;
}

.app-content {
  flex: 1;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
}

.app-footer {
  background-color: #0f172a;
  color: #94a3b8;
  text-align: center;
  padding: 0;
  width: 100%;
}

.menu-toggle {
  display: none;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
}

.menu-toggle span {
  display: block;
  width: 22px;
  height: 2px;
  background-color: white;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 5;
}

@media (max-width: 768px) {
  .menu-toggle {
    display: flex;
  }
  .nav-links {
    display: none;
    flex-direction: column;
    position: absolute;
    top: 55px;
    left: 0;
    width: 100%;
    background-color: #1e293b;
    padding: 20px;
    box-sizing: border-box;
  }
  .nav-links.open {
    display: flex;
  }
  .dropdown-menu {
    position: static;
    transform: none;
    background-color: transparent;
    border: none;
    box-shadow: none;
    padding-left: 20px;
  }
}
</style>
