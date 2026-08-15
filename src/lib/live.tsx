import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InsForgeClient } from '@insforge/sdk'
import { useAuth } from './auth'

export type HallKind = 'opened' | 'entries' | 'prize' | 'tickets' | 'drawing' | 'finished'

export interface HallEvent {
  kind: HallKind
  prize_id?: string
  prize_name?: string
  winner_id?: string
  winner_name?: string
  status?: string
}

function readField(payload: Record<string, unknown>, key: string) {
  const value = payload[key]
  return value == null ? undefined : String(value)
}

export function useRaffleSocket(
  client: InsForgeClient,
  enabled: boolean,
  onEvent: (event: HallEvent) => void,
) {
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    if (!enabled) return
    let active = true

    const emit = (event: HallEvent) => {
      if (event.kind) onEventRef.current(event)
    }

    const onOpened = (payload: Record<string, unknown>) => {
      emit({
        kind: 'opened',
        prize_id: readField(payload, 'prize_id'),
        prize_name: readField(payload, 'prize_name'),
      })
    }

    const onHall = (payload: Record<string, unknown>) => {
      emit({
        kind: (readField(payload, 'kind') as HallKind) || 'entries',
        prize_id: readField(payload, 'prize_id'),
        status: readField(payload, 'status'),
      })
    }

    const onDrawStarted = (payload: Record<string, unknown>) => {
      emit({
        kind: 'drawing',
        prize_id: readField(payload, 'prize_id'),
        prize_name: readField(payload, 'prize_name'),
      })
    }

    const onDrawFinished = (payload: Record<string, unknown>) => {
      emit({
        kind: 'finished',
        prize_id: readField(payload, 'prize_id'),
        prize_name: readField(payload, 'prize_name'),
        winner_id: readField(payload, 'winner_id'),
        winner_name: readField(payload, 'winner_name'),
      })
    }

    void (async () => {
      try {
        await client.realtime.connect()
        if (!active) return
        const response = await client.realtime.subscribe('raffle:hall')
        if (!response.ok || !active) return
        client.realtime.on('prize_opened', onOpened)
        client.realtime.on('hall_changed', onHall)
        client.realtime.on('draw_started', onDrawStarted)
        client.realtime.on('draw_changed', onDrawFinished)
      } catch {
        // Board still works if a phone misses the socket.
      }
    })()

    return () => {
      active = false
      client.realtime.off('prize_opened', onOpened)
      client.realtime.off('hall_changed', onHall)
      client.realtime.off('draw_started', onDrawStarted)
      client.realtime.off('draw_changed', onDrawFinished)
      client.realtime.unsubscribe('raffle:hall')
    }
  }, [client, enabled])
}

interface LiveState {
  event: HallEvent | null
  tick: number
}

const LiveContext = createContext<LiveState>({ event: null, tick: 0 })

export function RaffleLiveProvider({ children }: { children: ReactNode }) {
  const { client, profile } = useAuth()
  const [event, setEvent] = useState<HallEvent | null>(null)
  const [tick, setTick] = useState(0)

  useRaffleSocket(client, Boolean(profile), (next) => {
    setEvent(next)
    setTick((n) => n + 1)
  })

  useEffect(() => {
    if (!profile) return
    const beat = () => {
      if (document.hidden) return
      setTick((n) => n + 1)
    }
    const id = window.setInterval(beat, 1000)
    document.addEventListener('visibilitychange', beat)
    window.addEventListener('focus', beat)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
      window.removeEventListener('focus', beat)
    }
  }, [profile])

  return <LiveContext.Provider value={{ event, tick }}>{children}</LiveContext.Provider>
}

export function useHallLive() {
  return useContext(LiveContext)
}

const SEEN_KEY = 'alpha-raffle-seen-wins'

export function seenWinIds() {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function markWinSeen(prizeId: string) {
  const next = [...new Set([...seenWinIds(), prizeId])]
  sessionStorage.setItem(SEEN_KEY, JSON.stringify(next))
}
