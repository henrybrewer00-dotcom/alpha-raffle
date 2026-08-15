import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<Client>(() => createHallClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hydrate = useCallback(async () => {
    setLoading(true)
    try {
      const restored = await restoreClient()
      setClient(restored.client)
      if (!restored.tokens) {
        setUserId(null)
        setProfile(null)
        return
      }
      const { data, error: userError } = await restored.client.auth.getCurrentUser()
      const id = data?.user?.id ?? null
      if (userError || !id) {
        clearTokens()
        setClient(createHallClient())
        setUserId(null)
        setProfile(null)
        return
      }
      const nextProfile = await loadProfile(restored.client, id)
      setUserId(id)
      setProfile(nextProfile)
    } catch (err) {
      clearTokens()
      setClient(createHallClient())
      setUserId(null)
      setProfile(null)
      setError(err instanceof Error ? err.message : 'Could not restore session')
    } finally {
      setLoading(false)
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
    const nextClient = await hallLogin(input)
    const { data, error: userError } = await nextClient.auth.getCurrentUser()
    if (userError || !data?.user?.id) throw new Error('Signed in, but no user came back')
    const nextProfile = await loadProfile(nextClient, data.user.id)
    if (!nextProfile.active) {
      await nextClient.auth.signOut()
      clearTokens()
      throw new Error('This account is paused. Ask a guide.')
    }
    setClient(nextClient)
    setUserId(data.user.id)
    setProfile(nextProfile)
    return nextProfile
  }, [])

  const logout = useCallback(async () => {
    await client.auth.signOut()
    clearTokens()
    setClient(createHallClient())
    setUserId(null)
    setProfile(null)
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
