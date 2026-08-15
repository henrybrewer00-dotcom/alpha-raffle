import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import NameWheel from '../components/NameWheel'
import WinnerModal from '../components/WinnerModal'
import { useAuth } from '../lib/auth'
import { beginDraw, completeDraw, loadEntries, loadPrizes, loadProfiles, startPrize } from '../lib/api'
import { asInt } from '../lib/domain'
import { useHallLive } from '../lib/live'
import {
  buildSegments,
  easeOutCubic,
  segmentAt,
  targetRotation,
} from '../lib/wheel'
import type { Prize, PrizeEntry, Profile } from '../lib/types'

export default function SpinFloor() {
  const { prizeId } = useParams()
  const navigate = useNavigate()
  const { client } = useAuth()
  const { tick } = useHallLive()
  const [prize, setPrize] = useState<Prize | null>(null)
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [entries, setEntries] = useState<PrizeEntry[]>([])
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frame = useRef<number | null>(null)
  const spinningRef = useRef(false)

  async function reloadBoard() {
    if (!prizeId) return
    const [nextPrizes, profiles, nextEntries] = await Promise.all([
      loadPrizes(client),
      loadProfiles(client),
      loadEntries(client),
    ])
    setPrizes(nextPrizes)
    setPrize(nextPrizes.find((p) => p.id === prizeId) ?? null)
    setPeople(profiles)
    setEntries(nextEntries.filter((e) => e.prize_id === prizeId))
  }

  useEffect(() => {
    if (!prizeId) return
    setRotation(0)
    setWinner(null)
    setSpinning(false)
    spinningRef.current = false
    setError(null)
    void reloadBoard().catch((err) => setError(err instanceof Error ? err.message : 'Could not load'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, prizeId])

  useEffect(() => {
    if (tick === 0 || spinningRef.current) return
    const timer = window.setTimeout(() => {
      void reloadBoard().catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  useEffect(() => {
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.display_name])), [people])
  const segments = useMemo(() => buildSegments(entries, names), [entries, names])
  const current = segmentAt(segments, rotation)
  const nextPrize = prizes.find((p) => p.id !== prizeId && p.status === 'draft')
  const ticketCount = entries.reduce((sum, e) => sum + asInt(e.tickets), 0)

  function animateTo(end: number, duration: number) {
    return new Promise<void>((resolve) => {
      const start = rotation
      const started = performance.now()
      const tickFrame = (now: number) => {
        const t = Math.min(1, (now - started) / duration)
        setRotation(start + (end - start) * easeOutCubic(t))
        if (t < 1) {
          frame.current = requestAnimationFrame(tickFrame)
        } else {
          resolve()
        }
      }
      frame.current = requestAnimationFrame(tickFrame)
    })
  }

  async function spin() {
    if (!prizeId || segments.length === 0 || spinning) return
    setError(null)
    setWinner(null)
    setSpinning(true)
    spinningRef.current = true
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    try {
      const result = await beginDraw(client, prizeId)
      const landing = segments.find((s) => s.userId === result.winner_id) ?? segments[0]
      const end = targetRotation(landing)
      await animateTo(end, reduce ? 400 : 7200)
      await completeDraw(client, prizeId)
      setWinner({ id: result.winner_id, name: result.winner_name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Draw failed')
    } finally {
      setSpinning(false)
      spinningRef.current = false
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-blue text-white">
      <header className="flex items-center justify-between px-6 py-5 text-sm">
        <Link to="/desk" className="text-white/80">
          Back
        </Link>
        <Link to="/hall" className="text-white/80">
          Tickets
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-6 pb-16 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">{prize?.name ?? 'Prize'}</h1>
        <p className="mt-2 text-sm text-white/70">
          {ticketCount} tickets · {segments.length} students
        </p>

        <div className="mt-8 w-full">
          <NameWheel segments={segments} rotation={rotation} />
        </div>

        {spinning || winner ? (
          <p className="mt-8 min-h-[3rem] text-3xl font-bold">
            {winner ? winner.name : current?.name ?? ''}
          </p>
        ) : (
          <div className="mt-8 min-h-[3rem]" />
        )}

        {error ? <p className="mt-4 text-sm">{error}</p> : null}

        {!winner ? (
          <button
            type="button"
            disabled={spinning || segments.length === 0}
            onClick={() => void spin()}
            className="mt-4 bg-white px-12 py-3 text-sm font-semibold text-blue disabled:opacity-50"
          >
            {spinning ? 'Spinning…' : 'Spin'}
          </button>
        ) : null}
      </main>

      {winner ? (
        <WinnerModal
          prizeName={prize?.name ?? 'Prize'}
          winnerName={winner.name}
          youWon={false}
          onClose={() => navigate('/desk')}
          nextLabel={nextPrize ? `Start ${nextPrize.name}` : undefined}
          onNext={
            nextPrize
              ? () => {
                  void startPrize(client, nextPrize.id).then(() => navigate(`/spin/${nextPrize.id}`))
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
