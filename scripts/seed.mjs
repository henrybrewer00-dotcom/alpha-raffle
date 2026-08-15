import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.VITE_INSFORGE_URL || 'https://ak29gamq.us-east.insforge.app'
const API_KEY = process.env.INSFORGE_API_KEY
const DOMAIN = process.env.EMAIL_DOMAIN || 'alpha.school'

if (!API_KEY) {
  console.error('INSFORGE_API_KEY is required')
  process.exit(1)
}

const ITERATIONS = 120000

function hashPassword(password) {
  const salt = randomBytes(16)
  const bits = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${bits.toString('base64')}`
}

function randomBridge() {
  return `br_${randomBytes(18).toString('base64').replace(/[+/=]/g, 'x')}`
}

function q(value) {
  return String(value).replace(/'/g, "''")
}

async function listUsers() {
  const res = await fetch(`${BASE}/api/auth/users?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })
  const data = await res.json()
  return data.users ?? data.data ?? data ?? []
}

async function createUser({ handle, name, password }) {
  const email = `${handle}@${DOMAIN}`
  const bridge = randomBridge()
  const res = await fetch(`${BASE}/api/auth/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: bridge,
      name,
      profile: { handle, name },
    }),
  })
  const data = await res.json()
  if (res.ok && data.user?.id) return { id: data.user.id, bridge, email }

  const users = await listUsers()
  const existing = users.find((user) => {
    const userEmail = String(user.email ?? '').toLowerCase()
    return userEmail === email || userEmail.startsWith(`${handle}@`)
  })
  if (!existing) throw new Error(`${handle}: ${data.message || res.status}`)
  return { id: existing.id, email: existing.email, existing: true }
}

const planned = [
  { handle: 'test', name: 'Test Admin', password: 'alpha-hall', role: 'admin' },
  { handle: 'admin', name: 'Hall Admin', password: 'alpha-hall', role: 'admin' },
  { handle: 'guide', name: 'Classroom Guide', password: '2468', role: 'guide' },
  { handle: 'test1', name: 'Test One', password: 'alpha', role: 'student' },
  { handle: 'test2', name: 'Test Two', password: 'alpha', role: 'student' },
  { handle: 'test3', name: 'Test Three', password: 'alpha', role: 'student' },
  { handle: 'test4', name: 'Test Four', password: 'alpha', role: 'student' },
  { handle: 'test5', name: 'Test Five', password: 'alpha', role: 'student' },
  { handle: 'test6', name: 'Test Six', password: 'alpha', role: 'student' },
  { handle: 'mia', name: 'Mia Chen', password: 'alpha', role: 'student' },
  { handle: 'leo', name: 'Leo Ramirez', password: 'alpha', role: 'student' },
  { handle: 'jules', name: 'Jules Patel', password: 'alpha', role: 'student' },
  { handle: 'nora', name: 'Nora Kim', password: 'alpha', role: 'student' },
  { handle: 'kai', name: 'Kai Brooks', password: 'alpha', role: 'student' },
]

const ready = []
for (const user of planned) {
  const row = await createUser(user)
  ready.push({ ...user, ...row })
  console.log(`ready ${user.handle}@${DOMAIN} ${row.id}`)
}

const statements = []
for (const user of ready) {
  const hash = hashPassword(user.password)
  statements.push(
    `UPDATE public.profiles SET role = '${q(user.role)}', display_name = '${q(user.name)}', handle = '${q(user.handle)}', active = true WHERE id = '${user.id}'`,
  )
  if (user.existing) {
    statements.push(
      `INSERT INTO public.login_secrets (user_id, password_hash, bridge) VALUES ('${user.id}', '${q(hash)}', '${q(user.password)}') ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    )
  } else {
    statements.push(
      `INSERT INTO public.login_secrets (user_id, password_hash, bridge) VALUES ('${user.id}', '${q(hash)}', '${q(user.bridge)}') ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, bridge = EXCLUDED.bridge`,
    )
  }
  if (user.role === 'student') {
    statements.push(
      `INSERT INTO public.ticket_ledger (user_id, delta, reason, note) SELECT '${user.id}', 12, 'welcome', 'opening pocket' WHERE NOT EXISTS (SELECT 1 FROM public.ticket_ledger WHERE user_id = '${user.id}' AND reason = 'welcome')`,
    )
  }
}

statements.push(`DELETE FROM auth.users WHERE email = 'probe@${DOMAIN}'`)
statements.push(`DELETE FROM auth.users WHERE email = 'probe@raffle.alphahigh.school'`)

for (const sql of statements) {
  execFileSync('npx', ['-y', '@insforge/cli', 'db', 'query', sql], { stdio: 'inherit' })
}

console.log('seed complete')
console.log(`sign in as test@${DOMAIN} / test1@${DOMAIN} … test6@${DOMAIN}`)
