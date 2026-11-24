<!-- src/components/SkiLoader.vue -->
<template>
  <div class="loader-overlay">
    <!-- Kontener zawartości -->
    <div class="loader-content">
      <svg viewBox="0 0 300 200" width="300" height="120" xmlns="http://www.w3.org/2000/svg">
        <!-- Zeskok -->
        <line
          x1="-20"
          y1="-8"
          x2="320"
          y2="230"
          stroke="#f1f5f9"
          stroke-width="8"
          stroke-linecap="round"
        />
        <line
          x1="-20"
          y1="-8"
          x2="320"
          y2="230"
          stroke="#cbd5e1"
          stroke-width="2"
          stroke-dasharray="8 8"
        />

        <!-- Skoczek -->
        <g class="jumper">
          <line
            x1="-30"
            y1="-3"
            x2="50"
            y2="-3"
            stroke="#0284c7"
            stroke-width="4"
            stroke-linecap="round"
            opacity="0.6"
          />
          <line
            x1="-40"
            y1="0"
            x2="40"
            y2="0"
            stroke="#38bdf8"
            stroke-width="5"
            stroke-linecap="round"
          />
          <path
            d="M -5 0 L 10 -20 L -20 -25 L 15 -25"
            fill="none"
            stroke="#1e293b"
            stroke-width="7"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <line
            x1="15"
            y1="-25"
            x2="-15"
            y2="-17"
            stroke="#1e293b"
            stroke-width="5"
            stroke-linecap="round"
          />
          <circle cx="24" cy="-25" r="6.5" fill="#1e293b" />
          <line
            x1="24"
            y1="-26"
            x2="29"
            y2="-24"
            stroke="#ffffff"
            stroke-width="2"
            stroke-linecap="round"
          />
        </g>
      </svg>

      <!-- PRZENIESIONO: Teraz tekst jest wewnątrz .loader-content -->
      <div class="loading-text">
        <slot></slot>
        <span class="dots"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loader-overlay {
  position: fixed;
  top: 60px;
  left: 0;
  width: 100vw;
  height: calc(100vh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(2px);
  z-index: 900;
}

.loader-content {
  display: flex;
  flex-direction: column; /* Wymusza układ pionowy dla dzieci */
  align-items: center; /* Wyśrodkowuje w poziomie */
}

/* Animacja zjazdu */
.jumper {
  animation: slideDown 2.2s linear infinite; /* Wydłużono czas dla lepszej czytelności */
}

@keyframes slideDown {
  0% {
    /* Zmieniono wartości translate na startowe w połowie zeskoku */
    transform: translate(60px, 40px) rotate(35deg);
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translate(320px, 230px) rotate(35deg);
    opacity: 0;
  }
}

.loading-text {
  margin-top: 15px;
  font-size: 1.1em;
  color: #475569;
  font-weight: bold;
}


</style>
