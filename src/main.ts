import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/main.css'

// Potwierdzenie aktywnego profilu w konsoli przeglądarki (DevTools)
const envName = (import.meta.env.VITE_ENV_NAME || (import.meta.env.MODE === 'test' ? 'TEST' : (import.meta.env.PROD ? 'PROD' : 'DEV'))).toUpperCase()
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
console.log(
  `%c🎿 FantaSKI %c Profil: ${envName} %c API: ${apiUrl} `,
  'background: #0284c7; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
  `background: ${envName === 'TEST' ? '#f59e0b' : '#10b981'}; color: white; font-weight: bold; padding: 4px 8px;`,
  'background: #1e293b; color: #94a3b8; padding: 4px 8px; border-radius: 0 4px 4px 0;'
)

const app = createApp(App)

app.use(router)

app.mount('#app')
