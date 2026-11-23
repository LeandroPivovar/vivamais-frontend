// Build dos apps Android (Capacitor). O app roda em https://localhost dentro do WebView,
// então API, socket e links públicos precisam apontar para o site de produção.
//   npm run build:app       → Viva Mais (titular)      --mode app
//   npm run build:app:kids  → Viva Mais Kids           --mode app-kids
//   npm run build:app:teen  → Viva Mais Teens          --mode app-teen
const MODE = import.meta.env.MODE
export const IS_NATIVE_APP = MODE === 'app' || MODE === 'app-kids' || MODE === 'app-teen'
// App dedicado a uma área: abre direto nela e não navega para o resto da conta.
export const APP_MODULE = MODE === 'app-kids' ? 'kids' : MODE === 'app-teen' ? 'teen' : null
export const SITE_ORIGIN = 'https://conta.vivamaisclub.com'
// No app principal, Viva Kids/Teens ficam de fora (eles têm app próprio).
export const KIDS_TEEN_ENABLED = !IS_NATIVE_APP || APP_MODULE !== null
