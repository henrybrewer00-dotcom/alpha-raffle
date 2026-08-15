import type { InsForgeClient } from '@insforge/sdk'
import { asInt, handleToEmail, parseLoginIdentity } from './domain'
import { writeTokens } from './session'
import { anonKey, baseUrl, createHallClient } from './insforge'
import type { LedgerRow, Prize, PrizeEntry, Profile, Settings } from './types'

function rpcError(error: { message?: string } | null) {
  return error?.message ?? 'Something went wrong'
}

export async function hallLogin(input: {
  handle?: string
  password: string
  passcodeOnly?: boolean
}) {
  const response = await fetch(`${baseUrl}/functions/hall-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      handle: input.passcodeOnly ? 'guide' : parseLoginIdentity(input.handle ?? '').handle,
      password: input.password,
    }),
  })
  const payload = (await response.json()) as {
    error?: string
    message?: string
    accessToken?: string
    refreshToken?: string
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error || payload.message || 'Could not sign in')
  }
  if (!payload.accessToken || !payload.refreshToken) {
    throw new Error('Login did not return a session')
  }

  writeTokens({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
  })
  return createHallClient(payload.accessToken)
}

export async function loadProfile(client: InsForgeClient, userId: string) {
  const { data, error } = await client.database
    .from('profiles')
    .select('id, handle, display_name, role, active, daily_excluded, ticket_balance, created_at, updated_at')
    .eq('id', userId)
    .single()
  if (error) throw new Error(rpcError(error))
  return normalizeProfile(data as Profile)
}

export async function loadProfiles(client: InsForgeClient) {
  const { data, error } = await client.database
    .from('profiles')
    .select('id, handle, display_name, role, active, daily_excluded, ticket_balance, created_at, updated_at')
    .order('display_name', { ascending: true })
    .limit(400)
  if (error) throw new Error(rpcError(error))
  return ((data ?? []) as Profile[]).map(normalizeProfile)
}

export async function loadPrizes(client: InsForgeClient) {
  const { data, error } = await client.database
    .from('prizes')
    .select('id, name, description, min_tickets, status, sort_order, winner_id, awarded_at, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(rpcError(error))
  return ((data ?? []) as Prize[]).map((prize) => ({
    ...prize,
    min_tickets: asInt(prize.min_tickets, 1),
    sort_order: asInt(prize.sort_order),
  }))
}

export async function loadEntries(client: InsForgeClient) {
  const { data, error } = await client.database
    .from('prize_entries')
    .select('id, prize_id, user_id, tickets')
    .limit(2000)
  if (error) throw new Error(rpcError(error))
  return ((data ?? []) as PrizeEntry[]).map((entry) => ({
    ...entry,
    tickets: asInt(entry.tickets),
  }))
}

function normalizeProfile(profile: Profile) {
  return {
    ...profile,
    ticket_balance: asInt(profile.ticket_balance),
  }
}

export async function loadSettings(client: InsForgeClient) {
  const { data, error } = await client.database
    .from('settings')
    .select('id, daily_grant_amount, weekdays_only')
    .eq('id', 1)
    .single()
  if (error) throw new Error(rpcError(error))
  const settings = data as Settings
  return {
    ...settings,
    daily_grant_amount: asInt(settings.daily_grant_amount),
  }
}

export async function loadLedger(client: InsForgeClient, userId: string) {
  const { data, error } = await client.database
    .from('ticket_ledger')
    .select('id, user_id, delta, reason, prize_id, note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw new Error(rpcError(error))
  return ((data ?? []) as LedgerRow[]).map((row) => ({
    ...row,
    delta: asInt(row.delta),
  }))
}

export async function enterPrize(client: InsForgeClient, prizeId: string, tickets: number) {
  const { data, error } = await client.database.rpc('enter_prize', {
    p_prize_id: prizeId,
    p_tickets: tickets,
  })
  if (error) throw new Error(rpcError(error))
  return data
}

export async function withdrawPrize(client: InsForgeClient, prizeId: string, tickets: number) {
  const { data, error } = await client.database.rpc('withdraw_prize', {
    p_prize_id: prizeId,
    p_tickets: tickets,
  })
  if (error) throw new Error(rpcError(error))
  return data
}

export async function staffAdjust(
  client: InsForgeClient,
  userId: string,
  delta: number,
  note = '',
) {
  const { data, error } = await client.database.rpc('staff_adjust_tickets', {
    p_user_id: userId,
    p_delta: delta,
    p_note: note,
  })
  if (error) throw new Error(rpcError(error))
  return data
}

export async function runDailyGrant(client: InsForgeClient, force = false) {
  const { data, error } = await client.database.rpc('run_daily_grant', {
    p_force: force,
  })
  if (error) throw new Error(rpcError(error))
  return data as {
    ok?: boolean
    granted?: number
    already?: number
    amount?: number
    skipped?: string
    forced?: boolean
  }
}

export async function saveSettings(
  client: InsForgeClient,
  dailyGrantAmount: number,
  weekdaysOnly: boolean,
) {
  const { error } = await client.database.rpc('update_settings', {
    p_daily_grant_amount: dailyGrantAmount,
    p_weekdays_only: weekdaysOnly,
  })
  if (error) throw new Error(rpcError(error))
}

export async function setStudentFlags(
  client: InsForgeClient,
  userId: string,
  flags: { active?: boolean; daily_excluded?: boolean; display_name?: string },
) {
  const { error } = await client.database.rpc('set_student_flags', {
    p_user_id: userId,
    p_active: flags.active ?? null,
    p_daily_excluded: flags.daily_excluded ?? null,
    p_display_name: flags.display_name ?? null,
  })
  if (error) throw new Error(rpcError(error))
}

export async function upsertPrize(
  client: InsForgeClient,
  prize: {
    id?: string | null
    name: string
    description: string
    min_tickets: number
    status?: 'draft' | 'open' | 'closed'
  },
) {
  const { data, error } = await client.database.rpc('upsert_prize', {
    p_id: prize.id ?? null,
    p_name: prize.name,
    p_description: prize.description,
    p_min_tickets: prize.min_tickets,
    p_status: prize.status ?? 'draft',
  })
  if (error) throw new Error(rpcError(error))
  return data as { ok: boolean; id: string }
}

export async function startPrize(client: InsForgeClient, prizeId: string) {
  const { error } = await client.database.rpc('start_prize', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
}

export async function lockPrize(client: InsForgeClient, prizeId: string) {
  const { error } = await client.database.rpc('lock_prize', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
}

export async function reopenPrize(client: InsForgeClient, prizeId: string) {
  const { error } = await client.database.rpc('reopen_prize', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
}

export async function deletePrize(client: InsForgeClient, prizeId: string) {
  const { data, error } = await client.database.rpc('delete_prize', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
  return data as { ok: boolean; refunded: number }
}

export async function beginDraw(client: InsForgeClient, prizeId: string) {
  const { data, error } = await client.database.rpc('begin_draw', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
  return data as {
    ok: boolean
    run_id: string
    winner_id: string
    winner_name: string
    total_tickets: number
    resumed?: boolean
  }
}

export async function completeDraw(client: InsForgeClient, prizeId: string) {
  const { data, error } = await client.database.rpc('complete_draw', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
  return data as {
    ok: boolean
    winner_id: string
    winner_name: string
    prize_name: string
    total_tickets: number
  }
}

export async function drawPrize(client: InsForgeClient, prizeId: string) {
  const { data, error } = await client.database.rpc('draw_prize', { p_prize_id: prizeId })
  if (error) throw new Error(rpcError(error))
  return data as {
    ok: boolean
    winner_id: string
    winner_name: string
    total_tickets: number
  }
}

export async function manageUser(
  client: InsForgeClient,
  body: Record<string, unknown>,
) {
  const { data, error } = await client.functions.invoke('manage-users', { body })
  if (error) throw new Error(error.message)
  const payload = data as { error?: string; ok?: boolean; id?: string }
  if (payload?.error) throw new Error(payload.error)
  return payload
}

export { handleToEmail }
