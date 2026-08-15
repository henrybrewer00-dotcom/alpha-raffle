import { EMAIL_DOMAIN } from './brand'

export { CITY, EMAIL_DOMAIN, SCHOOL, SCHOOL_SHORT } from './brand'

export const SESSION_KEY = 'stub-hall-session'

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '.')
}

export function parseLoginIdentity(value: string) {
  const raw = value.trim().toLowerCase()
  if (!raw) return { handle: '', email: null as string | null }
  if (raw.includes('@')) {
    const local = raw.split('@')[0] ?? raw
    return { handle: normalizeHandle(local), email: raw }
  }
  return { handle: normalizeHandle(raw), email: null }
}

export function handleToEmail(handle: string) {
  return `${normalizeHandle(handle)}@${EMAIL_DOMAIN}`
}

export function emailToHandle(email: string) {
  return parseLoginIdentity(email).handle
}

export function asInt(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) ? n : fallback
}

export function formatTickets(value: unknown) {
  const n = asInt(value)
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`
}

export function digitValue(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return String(parseInt(digits, 10))
}

export function parseAmount(raw: string, fallback: number) {
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
