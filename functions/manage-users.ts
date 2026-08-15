import { createAdminClient, createClient } from 'npm:@insforge/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const ITERATIONS = 120000
const DOMAIN = Deno.env.get('EMAIL_DOMAIN') || 'alpha.school'

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

function randomBridge() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return `br_${bytesToB64(bytes).replace(/[+/=]/g, 'x')}`
}

function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '.')
}

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')
  const apiKey = Deno.env.get('API_KEY')
  const anonKey = Deno.env.get('ANON_KEY')
  if (!baseUrl || !apiKey || !anonKey) return json({ error: 'Server is missing keys' }, 500)

  const authHeader = req.headers.get('Authorization')
  const userToken = authHeader?.replace('Bearer ', '') ?? ''
  const userClient = createClient({ baseUrl, anonKey, accessToken: userToken })
  const { data: userData } = await userClient.auth.getCurrentUser()
  if (!userData?.user?.id) return json({ error: 'Unauthorized' }, 401)

  const admin = createAdminClient({ baseUrl, apiKey })
  const { data: caller } = await admin.database
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!caller || !caller.active || !['guide', 'admin'].includes(caller.role as string)) {
    return json({ error: 'Guides and admins only' }, 403)
  }

  const body = await req.json().catch(() => ({})) as {
    action?: string
    handle?: string
    displayName?: string
    password?: string
    role?: string
    userId?: string
  }

  if (body.action === 'create') {
    const rawHandle = String(body.handle ?? '').trim().toLowerCase()
    const handle = normalizeHandle(rawHandle.includes('@') ? (rawHandle.split('@')[0] ?? rawHandle) : rawHandle)
    const displayName = String(body.displayName ?? handle).trim()
    const password = String(body.password ?? '')
    const role = body.role ?? 'student'
    if (!handle || password.length < 4) return json({ error: 'Handle and a 4+ character password are required' }, 400)
    if (!['student', 'guide', 'admin'].includes(role)) return json({ error: 'Invalid role' }, 400)
    if (role !== 'student' && caller.role !== 'admin') return json({ error: 'Admins only for staff accounts' }, 403)

    const bridge = randomBridge()
    const createRes = await fetch(`${baseUrl}/api/auth/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `${handle}@${DOMAIN}`,
        password: bridge,
        name: displayName,
        profile: { handle, name: displayName },
      }),
    })
    const created = await createRes.json()
    if (!createRes.ok || !created.user?.id) {
      return json({ error: created.message ?? 'Could not create user' }, 400)
    }

    const userId = created.user.id as string
    await admin.database.from('profiles').update({ display_name: displayName }).eq('id', userId)
    if (role !== 'student') {
      await admin.database.rpc('set_profile_role', { p_user_id: userId, p_role: role })
    }

    await admin.database.from('login_secrets').insert([{
      user_id: userId,
      password_hash: await hashPassword(password),
      bridge,
    }])

    if (role === 'student') {
      const { data: settings } = await admin.database
        .from('settings')
        .select('daily_grant_amount')
        .eq('id', 1)
        .maybeSingle()
      const welcome = Number(settings?.daily_grant_amount ?? 4)
      if (welcome > 0) {
        await admin.database.from('ticket_ledger').insert([{
          user_id: userId,
          delta: welcome,
          reason: 'welcome',
          note: 'first pocket',
        }])
      }
    }

    return json({ ok: true, id: userId, handle })
  }

  if (body.action === 'password') {
    const userId = String(body.userId ?? '')
    const password = String(body.password ?? '')
    if (!userId || password.length < 4) return json({ error: 'User and password are required' }, 400)

    const { data: existing } = await admin.database
      .from('login_secrets')
      .select('bridge')
      .eq('user_id', userId)
      .maybeSingle()

    const bridge = (existing?.bridge as string | undefined) ?? randomBridge()
    const passwordHash = await hashPassword(password)
    if (existing) {
      await admin.database
        .from('login_secrets')
        .update({ password_hash: passwordHash, bridge })
        .eq('user_id', userId)
    } else {
      await admin.database.from('login_secrets').insert([{
        user_id: userId,
        password_hash: passwordHash,
        bridge,
      }])
    }
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
}
