const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

// ==========================================================================
// TODO: REMOVER ANTES DE IR PARA PRODUÇÃO — usuários de teste hardcoded
// Criado em 2026-08-31 para testar o fluxo completo sem backend rodando.
// ==========================================================================
const _MOCK_USERS = [
  { id: 9001, name: 'Admin Teste',    email: 'admin@teste.com',  cpf: '00000000000', password: 'admin123',  role: 'admin', plan: 'Individual' },
  { id: 9002, name: 'Usuário Normal', email: 'normal@teste.com', cpf: '11111111111', password: 'normal123', role: 'user',  plan: 'Família'    },
]
const _MOCK_DEPENDENTS = [
  { id: 9003, name: 'Criança Teste',      cpf: '22222222222', module: 'kids', birthDate: '15/06/2018' },
  { id: 9004, name: 'Adolescente Teste',  cpf: '33333333333', module: 'teen', birthDate: '10/03/2010' },
]
function _mockToken(payload) {
  // JWT fake (não valida assinatura, só para o frontend funcionar)
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '')
  return `${enc({ alg: 'HS256' })}.${enc({ ...payload, exp: Date.now() / 1000 + 86400 })}.mocksig`
}
function _mockAgeGroup(birthDate) {
  const [dd, mm, yyyy] = birthDate.split('/')
  const birth = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  const age = Math.floor((Date.now() - birth) / 31557600000)
  return age <= 10 ? 'kids' : age <= 17 ? 'teen' : 'adult'
}
function _mockIntercept(path, body) {
  if (path === '/auth/login') {
    const u = _MOCK_USERS.find((x) => (x.email === body?.username || x.cpf === body?.username) && x.password === body?.password)
    if (!u) return { ok: false, data: { message: 'Credenciais inválidas.' }, status: 401 }
    return { ok: true, data: { token: _mockToken({ sub: u.id, email: u.email, role: u.role }), user: { id: u.id, name: u.name, plan: u.plan, active: true, role: u.role, isDependent: false } } }
  }
  if (path === '/auth/login-kids') {
    const d = _MOCK_DEPENDENTS.find((x) => x.cpf === (body?.cpf ?? '').replace(/\D/g, ''))
    if (!d) return { ok: false, data: { message: 'CPF não encontrado.' }, status: 401 }
    const group = _mockAgeGroup(d.birthDate)
    if (group !== body?.module) return { ok: false, data: { message: 'Idade do dependente não é compatível com esta área.' }, status: 401 }
    return { ok: true, data: { token: _mockToken({ sub: d.id, scope: 'kids-teen' }), user: { id: d.id, name: d.name, isDependent: true, ageGroup: group, module: group } } }
  }
  return null
}
// ==========================================================================
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

  // TODO: REMOVER — intercepta login com usuários de teste hardcoded
  if (method === 'POST') {
    const mocked = _mockIntercept(path, body)
    if (mocked) {
      if (!mocked.ok) throw new ApiError(mocked.data.message, mocked.status)
      return mocked.data
    }
  }
  // TODO: FIM do bloco de teste

  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // Falha de rede (offline, servidor reiniciando, CORS): o fetch rejeita com um
    // "Failed to fetch" cru, que vazava para a tela do cliente. Status 0 = sem resposta.
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente em instantes.',
      0,
    )
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/logout')) {
      clearToken()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }
    }
    // 502/503/504 = servidor reiniciando ou fora do ar por instantes; a resposta vem
    // do nginx em HTML, sem message útil para o cliente.
    if ([502, 503, 504].includes(response.status)) {
      throw new ApiError(
        'O servidor está temporariamente indisponível. Aguarde alguns segundos e tente novamente.',
        response.status,
      )
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
