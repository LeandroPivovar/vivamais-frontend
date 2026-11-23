// Build do app Android (Capacitor): `npm run build:app` (vite --mode app).
// O app roda em https://localhost dentro do WebView, então API, socket e links
// públicos precisam apontar para o site de produção.
export const IS_NATIVE_APP = import.meta.env.MODE === 'app'
export const SITE_ORIGIN = 'https://conta.vivamaisclub.com'
// Viva Kids e Viva Teens ficam fora do app por enquanto (só no site).
export const KIDS_TEEN_ENABLED = !IS_NATIVE_APP
