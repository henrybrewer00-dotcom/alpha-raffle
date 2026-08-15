import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TopBar from '../components/TopBar'
import WinnerModal from '../components/WinnerModal'
import { useAuth } from '../lib/auth'
import {
  enterPrize,
  loadEntries,
  loadLedger,
  loadPrizes,
  loadProfiles,
  withdrawPrize,
} from '../lib/api'
import { asInt, digitValue, formatTickets, parseAmount } from '../lib/domain'
import { markWinSeen, useHallLive } from '../lib/live'
import type { LedgerRow, Prize, PrizeEntry, Profile } from '../lib/types'

function reasonLabel(reason: string) {
  if (reason === 'daily_grant') return 'Daily tickets'
  if (reason === 'staff_adjust') return 'Guide adjustment'
  if (reason === 'prize_enter') return 'Entered a prize'
  if (reason === 'prize_withdraw') return 'Took tickets back'
  if (reason === 'welcome') return 'Starting tickets'
  return reason.replace('_', ' ')
}

export default function StudentHall() {
  const { client, profile, logout, refreshProfile } = useAuth()
  const { event, tick } = useHallLive()
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [entries, setEntries] = useState<PrizeEntry[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState<{ prizeName: string } | null>(null)
  const [win, setWin] = useState<{
    prizeId: string
    prizeName: string
    winnerName: string
    youWon: boolean
  } | null>(null)
  const seenAwarded = useRef(new Set<string>())
  const ready = useRef(false)

  async function reload() {
    if (!profile) return
    const [nextPrizes, nextEntries, nextPeople, nextLedger] = await Promise.all([
      loadPrizes(client),
      loadEntries(client),
      loadProfiles(client),
      loadLedger(client, profile.id),
    ])
    setPrizes(nextPrizes)
    setEntries(nextEntries)
    setPeople(nextPeople)
    setLedger(nextLedger)
    await refreshProfile()

    const drawingPrize = nextPrizes.find((p) => p.status === 'drawing')
    if (drawingPrize) setDrawing({ prizeName: drawingPrize.name })
    else if (nextPrizes.every((p) => p.status !== 'drawing')) setDrawing(null)

    if (ready.current) {
      const fresh = nextPrizes.find(
        (p) => p.status === 'awarded' && p.winner_id && !seenAwarded.current.has(p.id),
      )
      if (fresh) {
        setWin({
          prizeId: fresh.id,
          prizeName: fresh.name,
          winnerName:
            nextPeople.find((p) => p.id === fresh.winner_id)?.display_name ?? 'A student',
          youWon: fresh.winner_id === profile.id,
        })
      }
    }
    nextPrizes
      .filter((p) => p.status === 'awarded')
      .forEach((p) => seenAwarded.current.add(p.id))
    ready.current = true
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Could not load'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (tick === 0) return
    const timer = window.setTimeout(() => {
      void reload().catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  useEffect(() => {
    if (!event || !profile) return
    if (event.kind === 'drawing' && event.prize_name) {
      setDrawing({ prizeName: event.prize_name })
    }
    if (event.kind === 'finished' && event.prize_id && event.winner_id) {
      setDrawing(null)
      setWin({
        prizeId: event.prize_id,
        prizeName: event.prize_name ?? 'Prize',
        winnerName: event.winner_name ?? 'A student',
        youWon: event.winner_id === profile.id,
      })
    }
  }, [event, profile])

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.display_name])), [people])

  async function moveTickets(prize: Prize, direction: 1 | -1) {
    if (!profile) return
    const amount = parseAmount(amounts[prize.id] ?? '', asInt(prize.min_tickets, 1))
    setBusyId(prize.id)
    setError(null)
    try {
      if (direction === 1) await enterPrize(client, prize.id, amount)
      else await withdrawPrize(client, prize.id, amount)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move tickets')
    } finally {
      setBusyId(null)
    }
  }

  if (!profile) return null

  const openPrizes = prizes.filter((p) => p.status === 'open')
  const livePrizes = prizes.filter((p) => p.status === 'locked' || p.status === 'drawing')
  const closedPrizes = prizes.filter((p) => p.status === 'awarded' || p.status === 'closed')

  return (
    <div className="min-h-screen bg-white">
      <TopBar
        right={
          <>
            {profile.role !== 'student' ? (
              <>
                {openPrizes[0] ? (
                  <Link to={`/spin/${openPrizes[0].id}`} className="text-ink">
                    Board
                  </Link>
                ) : null}
                <Link to="/desk" className="text-ink">
                  Guide
                </Link>
              </>
            ) : null}
            <button type="button" onClick={() => void logout()} className="text-mute">
              Sign out
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink">{profile.display_name}</h1>
            <p className="mt-1 text-mute">
              When a guide starts a prize, put in as many tickets as you want. Bigger
              prizes have a higher minimum. You can take tickets back until they draw.
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-blue">{profile.ticket_balance}</div>
            <div className="text-sm text-mute">tickets left</div>
          </div>
        </div>

        {drawing ? (
          <p className="mt-6 border border-blue bg-paper px-4 py-3 text-sm text-blue">
            Drawing {drawing.prizeName} now. Watch the spinner.
          </p>
        ) : null}

        {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}

        {livePrizes.length ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-ink">Drawing</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {livePrizes.map((prize) => (
                <li key={prize.id} className="flex justify-between border-b border-line py-2">
                  <span>{prize.name}</span>
                  <span className="text-blue">
                    {prize.status === 'drawing' ? 'Spinning' : 'Starting'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Open prizes</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {openPrizes.length === 0 ? (
              <p className="py-6 text-sm text-mute">
                No prize is open yet. A guide will start one when it is time.
              </p>
            ) : null}
            {openPrizes.map((prize) => {
              const mine = entries.find((e) => e.prize_id === prize.id && e.user_id === profile.id)
              const total = entries
                .filter((e) => e.prize_id === prize.id)
                .reduce((sum, e) => sum + asInt(e.tickets), 0)
              const mineTickets = asInt(mine?.tickets)
              const odds = mineTickets && total ? Math.round((mineTickets / total) * 100) : 0
              return (
                <article key={prize.id} className="grid gap-4 py-6 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <h3 className="text-xl font-semibold text-ink">{prize.name}</h3>
                    {prize.description ? (
                      <p className="mt-1 text-sm text-mute">{prize.description}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-ink">
                      {formatTickets(mine?.tickets)} of yours · {formatTickets(total)} total
                      {odds ? ` · ${odds}%` : ''} · min {asInt(prize.min_tickets, 1)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      inputMode="numeric"
                      placeholder={String(asInt(prize.min_tickets, 1))}
                      value={amounts[prize.id] ?? ''}
                      onChange={(e) =>
                        setAmounts((prev) => ({
                          ...prev,
                          [prize.id]: digitValue(e.target.value),
                        }))
                      }
                      className="w-20 border border-line px-2 py-2"
                    />
                    <button
                      type="button"
                      disabled={busyId === prize.id}
                      onClick={() => void moveTickets(prize, 1)}
                      className="bg-blue px-4 py-2 text-sm font-semibold text-white"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      disabled={busyId === prize.id}
                      onClick={() => void moveTickets(prize, -1)}
                      className="border border-line px-4 py-2 text-sm font-semibold text-ink"
                    >
                      Remove
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {closedPrizes.length ? (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-ink">Finished</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {closedPrizes.map((prize) => (
                <li key={prize.id} className="flex justify-between border-b border-line py-2">
                  <span>{prize.name}</span>
                  <span className="text-mute">
                    {prize.status === 'awarded' && prize.winner_id
                      ? `Won by ${names.get(prize.winner_id) ?? 'a student'}`
                      : prize.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-12 mb-16">
          <h2 className="text-lg font-semibold text-ink">History</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {ledger.map((row) => (
              <li key={row.id} className="flex justify-between border-b border-line py-2">
                <span>{reasonLabel(row.reason)}</span>
                <span className={row.delta > 0 ? 'text-blue' : 'text-ink'}>
                  {row.delta > 0 ? '+' : ''}
                  {row.delta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {win ? (
        <WinnerModal
          prizeName={win.prizeName}
          winnerName={win.winnerName}
          youWon={win.youWon}
          onClose={() => {
            markWinSeen(win.prizeId)
            setWin(null)
          }}
        />
      ) : null}
    </div>
  )
}
