export type Role = 'student' | 'guide' | 'admin'
export type PrizeStatus = 'draft' | 'open' | 'locked' | 'drawing' | 'awarded' | 'closed'

export interface Profile {
  id: string
  handle: string
  display_name: string
  role: Role
  active: boolean
  daily_excluded: boolean
  ticket_balance: number
  created_at: string
  updated_at: string
}

export interface Prize {
  id: string
  name: string
  description: string
  min_tickets: number
  status: PrizeStatus
  sort_order: number
  winner_id: string | null
  awarded_at: string | null
  created_at: string
}

export interface PrizeEntry {
  id: string
  prize_id: string
  user_id: string
  tickets: number
}

export interface Settings {
  id: number
  daily_grant_amount: number
  weekdays_only: boolean
}

export interface LedgerRow {
  id: string
  user_id: string
  delta: number
  reason: string
  prize_id: string | null
  note: string
  created_at: string
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}
