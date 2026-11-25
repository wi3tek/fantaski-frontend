import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const envName = (env.VITE_ENV_NAME || (mode === 'test' ? 'TEST' : (mode === 'production' ? 'PROD' : 'DEV'))).toUpperCase()
  const badge = envName === 'TEST' ? '🧪 TEST' : (envName === 'PROD' ? '🚀 PROD' : '🛠️ DEV')

  // Komunikat potwierdzający profil w konsoli startowej Vite
  console.log('\n' + '='.repeat(60))
  console.log(`🎿  FantaSKI Frontend  |  Aktywny profil: [${badge}]`)
  console.log(`📡  Backend API URL:    ${env.VITE_API_URL || 'http://localhost:8000'}`)
  console.log(`⚙️   Tryb Vite (mode):   ${mode}`)
  console.log('='.repeat(60) + '\n')

  return {
    plugins: [
      vue(),
      vueDevTools({
        launchEditor: 'webstorm'
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
  }
})
