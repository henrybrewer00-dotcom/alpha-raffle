import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { createClient } from '@insforge/sdk'
import { hallLogin, loadProfile } from './api'
import { createHallClient } from './insforge'
import { clearTokens, restoreClient } from './session'
import type { Profile } from './types'

type Client = ReturnType<typeof createClient>

interface AuthState {
  client: Client
  userId: string | null
  profile: Profile | null
  loading: boolean
  error: string | null
  login: (input: {
    handle?: string
    password: string
    passcodeOnly?: boolean
  }) => Promise<Profile>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client>(() => createHallClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const boot = useRef(0)

  const hydrate = useCallback(async () => {
    const generation = boot.current
    setLoading(true)
    try {
      const restored = await withTimeout(restoreClient(), 6000, 'Session restore')
      if (generation !== boot.current) return
      setClient(restored.client)
      if (!restored.tokens) {
        setUserId(null)
        setProfile(null)
        return
      }
      const { data, error: userError } = await withTimeout(
        restored.client.auth.getCurrentUser(),
        6000,
        'Session',
      )
      if (generation !== boot.current) return
      const id = data?.user?.id ?? null
      if (userError || !id) {
        clearTokens()
        setClient(createHallClient())
        setUserId(null)
        setProfile(null)
        return
      }
      const nextProfile = await withTimeout(loadProfile(restored.client, id), 6000, 'Profile')
      if (generation !== boot.current) return
      setUserId(id)
      setProfile(nextProfile)
    } catch {
      if (generation !== boot.current) return
      clearTokens()
      setClient(createHallClient())
      setUserId(null)
      setProfile(null)
    } finally {
      if (generation === boot.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const login = useCallback(async (input: {
    handle?: string
    password: string
    passcodeOnly?: boolean
  }) => {
    setError(null)
    boot.current += 1
    const nextClient = await withTimeout(hallLogin(input), 15000, 'Sign in')
    const { data, error: userError } = await withTimeout(
      nextClient.auth.getCurrentUser(),
      8000,
      'Sign in',
    )
    if (userError || !data?.user?.id) throw new Error('Signed in, but no user came back')
    const nextProfile = await withTimeout(
      loadProfile(nextClient, data.user.id),
      8000,
      'Profile',
    )
    if (!nextProfile.active) {
      await nextClient.auth.signOut()
      clearTokens()
      throw new Error('This account is paused. Ask a guide.')
    }
    setClient(nextClient)
    setUserId(data.user.id)
    setProfile(nextProfile)
    setLoading(false)
    return nextProfile
  }, [])

  const logout = useCallback(async () => {
    boot.current += 1
    await client.auth.signOut()
    clearTokens()
    setClient(createHallClient())
    setUserId(null)
    setProfile(null)
    setLoading(false)
  }, [client])

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const next = await loadProfile(client, userId)
    setProfile(next)
  }, [client, userId])

  const value = useMemo(
    () => ({
      client,
      userId,
      profile,
      loading,
      error,
      login,
      logout,
      refreshProfile,
    }),
    [client, userId, profile, loading, error, login, logout, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
