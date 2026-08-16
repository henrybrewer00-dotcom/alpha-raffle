import { SESSION_KEY } from './domain'
import type { SessionTokens } from './types'
import { anonKey, baseUrl, createHallClient } from './insforge'

export function readTokens(): SessionTokens | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionTokens
    if (!parsed.accessToken || !parsed.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

export function writeTokens(tokens: SessionTokens) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem(SESSION_KEY)
}

export async function restoreClient() {
  const tokens = readTokens()
  if (!tokens) return { client: createHallClient(), tokens: null }

  try {
    const response = await fetch(`${baseUrl}/api/auth/refresh?client_type=mobile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await response.json()) as {
      accessToken?: string
      refreshToken?: string
    }
    if (!response.ok || !data.accessToken) {
      clearTokens()
      return { client: createHallClient(), tokens: null }
    }
    const next: SessionTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken ?? tokens.refreshToken,
    }
    writeTokens(next)
    return { client: createHallClient(next.accessToken), tokens: next }
  } catch {
    clearTokens()
    return { client: createHallClient(), tokens: null }
  }
}
