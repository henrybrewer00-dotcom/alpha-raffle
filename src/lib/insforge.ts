import { createClient, type InsForgeClient } from '@insforge/sdk'

const baseUrl = import.meta.env.VITE_INSFORGE_URL
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY

export function createHallClient(accessToken?: string): InsForgeClient {
  return createClient({
    baseUrl,
    anonKey,
    ...(accessToken ? { accessToken } : {}),
  })
}


export { baseUrl, anonKey }
