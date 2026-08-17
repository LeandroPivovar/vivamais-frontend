const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const TOKEN_KEY = 'acesso_saude_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      clearToken()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }
    }
    throw new ApiError(data?.message ?? 'Erro na comunicação com o servidor.', response.status)
  }
  return data
}

/** Busca endereço por CEP (proxy ViaCEP no backend). Retorna null se inválido/não achado. */
export async function lookupCep(cep) {
  const digits = (cep ?? '').replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    return await request(`/content/cep/${digits}`)
  } catch {
    return null
  }
}

/** Envia um arquivo (multipart) e devolve { url, name, mime } — o backend grava em disco. */
export async function uploadFile(file) {
  const fd = new FormData()
  fd.append('file', file)
  const token = getToken()
  const response = await fetch(`${BASE_URL}/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : null
  if (!response.ok) throw new ApiError(data?.message ?? 'Falha ao enviar o arquivo.', response.status)
  return data
}

/**
 * Tokeniza o cartão direto na Pagar.me (public key) — o número NÃO passa pelo nosso
 * backend. Devolve o token id. `card` = { number, holder_name, exp_month, exp_year, cvv }.
 */
export async function tokenizeCard(publicKey, card, billingAddress) {
  const cardBody = billingAddress ? { ...card, billing_address: billingAddress } : card
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(publicKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'card', card: cardBody }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.id) throw new ApiError(data?.message ?? 'Não foi possível validar o cartão.', res.status)
  return data.id
}

export const api = {
  get: (path) => request(path),
  upload: (file) => uploadFile(file),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
