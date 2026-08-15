import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const ITERATIONS = 120000
const DOMAIN = Deno.env.get('EMAIL_DOMAIN') || 'alpha.school'
const LEGACY_DOMAINS = ['raffle.alphahigh.school', 'alpha.school']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bytesToB64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function b64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hashPassword(password: string) {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return `pbkdf2$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iter || !saltB64 || !hashB64) return false
  const enc = new TextEncoder()
  const salt = b64ToBytes(saltB64)
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: Number(iter), hash: 'SHA-256' },
    key,
    256,
  )
  return bytesToB64(new Uint8Array(bits)) === hashB64
}

async function emailForUser(
  baseUrl: string,
  apiKey: string,
  userId: string,
  handle: string,
  typedEmail: string | null,
) {
  const direct = await fetch(`${baseUrl}/api/auth/users/${userId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (direct.ok) {
    const data = await direct.json()
    const email = data.user?.email ?? data.email
    if (typeof email === 'string' && email.includes('@')) return email
  }

  const list = await fetch(`${baseUrl}/api/auth/users?limit=200`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (list.ok) {
    const data = await list.json()
    const users = data.users ?? data.data ?? []
    const found = users.find((user: { id?: string; email?: string }) => user.id === userId)
    if (found?.email) return found.email
  }

  if (typedEmail?.includes('@')) return typedEmail
  const domains = [DOMAIN, ...LEGACY_DOMAINS.filter((item) => item !== DOMAIN)]
  return `${handle}@${domains[0]}`
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('API_KEY')
  const anonKey = Deno.env.get('ANON_KEY')
  if (!baseUrl || !apiKey || !anonKey) return json({ error: 'Server is missing keys' }, 500)

  const body = await req.json().catch(() => ({})) as { handle?: string; email?: string; password?: string }
  const raw = String(body.handle ?? body.email ?? '').trim().toLowerCase()
  const handle = raw.includes('@') ? (raw.split('@')[0] ?? raw) : raw.replace(/\s+/g, '.')
  const password = String(body.password ?? '')
  if (!handle || !password) return json({ error: 'Email and password are required' }, 400)

  const admin = createAdminClient({ baseUrl, apiKey })
  const { data: profile, error: profileError } = await admin.database
    .from('profiles')
    .select('id, handle, active')
    .eq('handle', handle)
    .maybeSingle()

  if (profileError) return json({ error: profileError.message }, 400)
  if (!profile) return json({ error: 'Unknown account' }, 401)
  if (!profile.active) return json({ error: 'This account is paused' }, 403)

  const { data: secret } = await admin.database
    .from('login_secrets')
    .select('password_hash, bridge')
    .eq('user_id', profile.id)
    .maybeSingle()

  const email = await emailForUser(baseUrl, apiKey, profile.id, handle, raw.includes('@') ? raw : null)
  let bridge = secret?.bridge as string | undefined

  if (secret?.password_hash) {
    const ok = await verifyPassword(password, secret.password_hash as string)
    if (!ok) return json({ error: 'Wrong password' }, 401)
  } else {
    const probe = createClient({ baseUrl, anonKey, isServerMode: true })
    const { error: signError } = await probe.auth.signInWithPassword({ email, password })
    if (signError) return json({ error: 'Wrong password' }, 401)
    bridge = password
    const passwordHash = await hashPassword(password)
    await admin.database.from('login_secrets').insert([{
      user_id: profile.id,
      password_hash: passwordHash,
      bridge,
    }])
  }

  const sessionRes = await fetch(`${baseUrl}/api/auth/sessions?client_type=mobile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: bridge }),
  })
  const session = await sessionRes.json()
  if (!sessionRes.ok || !session.accessToken || !session.refreshToken) {
    return json({ error: session.message ?? 'Could not open a session' }, 401)
  }

  return json({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
  })
}
