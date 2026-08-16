import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { useAuth } from '../lib/auth'
import {
  loadEntries,
  loadPrizes,
  loadProfiles,
  loadSettings,
  deletePrize,
  lockPrize,
  manageUser,
  reopenPrize,
  startPrize,
  runDailyGrant,
  saveSettings,
  setStudentFlags,
  staffAdjust,
  upsertPrize,
} from '../lib/api'
import { SCHOOL } from '../lib/brand'
import { asInt, digitValue, formatTickets, parseAmount, parseLoginIdentity } from '../lib/domain'
import { useHallLive } from '../lib/live'
import type { Prize, PrizeEntry, Profile, Settings } from '../lib/types'

type Tab = 'students' | 'prizes' | 'daily' | 'draw'

const TABS: { key: Tab; label: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'prizes', label: 'Prizes' },
  { key: 'daily', label: 'Daily tickets' },
  { key: 'draw', label: 'Draw' },
]

export default function StaffDesk() {
  const { client, profile, logout, refreshProfile } = useAuth()
  const { tick } = useHallLive()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('students')
  const [people, setPeople] = useState<Profile[]>([])
  const [prizes, setPrizes] = useState<Prize[]>([])
  const [entries, setEntries] = useState<PrizeEntry[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newName, setNewName] = useState('')
  const [newHandle, setNewHandle] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [prizeName, setPrizeName] = useState('')
  const [prizeDesc, setPrizeDesc] = useState('')
  const [prizeMin, setPrizeMin] = useState('4')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [grantAmount, setGrantAmount] = useState('4')
  const [weekdaysOnly, setWeekdaysOnly] = useState(true)
  const [adjustAmounts, setAdjustAmounts] = useState<Record<string, string>>({})
  const [accountOpen, setAccountOpen] = useState(false)
  const [ownPassword, setOwnPassword] = useState('')
  const [ownAgain, setOwnAgain] = useState('')
  const [staffPasswords, setStaffPasswords] = useState<Record<string, string>>({})
  const grantTouched = useRef(false)

  async function reload() {
    const [nextPeople, nextPrizes, nextEntries, nextSettings] = await Promise.all([
      loadProfiles(client),
      loadPrizes(client),
      loadEntries(client),
      loadSettings(client),
    ])
    setPeople(nextPeople)
    setPrizes(nextPrizes)
    setEntries(nextEntries)
    setSettings(nextSettings)
    if (!grantTouched.current) {
      setGrantAmount(String(asInt(nextSettings.daily_grant_amount, 4)))
      setWeekdaysOnly(nextSettings.weekdays_only)
    }
    await refreshProfile()
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : 'Could not load'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tick === 0) return
    const timer = window.setTimeout(() => {
      void reload().catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  const students = useMemo(
    () =>
      people
        .filter((p) => p.role === 'student')
        .filter((p) => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          return (
            p.display_name.toLowerCase().includes(q) ||
            p.handle.toLowerCase().includes(q)
          )
        }),
    [people, query],
  )

  async function wrap(action: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await reload()
      if (ok) setNotice(ok)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That failed')
    } finally {
      setBusy(false)
    }
  }

  async function addStudent(event: FormEvent) {
    event.preventDefault()
    await wrap(async () => {
      await manageUser(client, {
        action: 'create',
        handle: parseLoginIdentity(newHandle).handle,
        displayName: newName,
        password: newPassword,
        role: 'student',
      })
      setNewName('')
      setNewHandle('')
      setNewPassword('')
    }, `Added ${newName || newHandle}`)
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-white">
      <TopBar
        right={
          <>
            <Link to="/hall" className="text-ink">
              Tickets
            </Link>
            <button type="button" onClick={() => void logout()} className="text-mute">
              Sign out
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="text-3xl font-bold text-ink">
          {profile.role === 'admin' ? 'Admin' : 'Guide'}
        </h1>
        <p className="mt-1 text-sm text-mute">
          {profile.display_name} · {SCHOOL}
          {' · '}
          <button
            type="button"
            className="hover:text-ink"
            onClick={() => setAccountOpen((open) => !open)}
          >
            If this is you
          </button>
        </p>

        {accountOpen ? (
          <form
            className="mt-4 max-w-md space-y-3 border border-line p-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (ownPassword !== ownAgain) {
                setError('Those passwords do not match')
                return
              }
              void wrap(async () => {
                await manageUser(client, {
                  action: 'password',
                  userId: profile.id,
                  password: ownPassword,
                })
                setOwnPassword('')
                setOwnAgain('')
                setAccountOpen(false)
              }, 'Your password is updated')
            }}
          >
            <p className="text-sm text-ink">
              {profile.role === 'guide'
                ? 'This is yours only. If you use the classroom passcode, this changes that too.'
                : 'This is your admin password. You can also change anyone else below.'}
            </p>
            <input
              type="password"
              required
              minLength={4}
              placeholder="New password"
              value={ownPassword}
              onChange={(e) => setOwnPassword(e.target.value)}
              className="w-full border border-line px-3 py-2.5"
            />
            <input
              type="password"
              required
              minLength={4}
              placeholder="Again"
              value={ownAgain}
              onChange={(e) => setOwnAgain(e.target.value)}
              className="w-full border border-line px-3 py-2.5"
            />
            <button
              disabled={busy}
              className="bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save
            </button>
          </form>
        ) : null}

        <nav className="mt-8 flex gap-6 border-b border-line text-sm">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 pb-2 ${
                tab === key
                  ? 'border-blue font-semibold text-blue'
                  : 'border-transparent text-mute'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {notice ? <p className="mt-4 text-sm text-blue">{notice}</p> : null}

        {tab === 'students' ? (
          <section className="mt-8 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <form onSubmit={addStudent} className="space-y-3">
              <h2 className="text-lg font-semibold text-ink">Add a student</h2>
              <input
                required
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full border border-line px-3 py-2.5"
              />
              <input
                required
                placeholder="test1@alpha.school"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                className="w-full border border-line px-3 py-2.5"
              />
              <input
                required
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-line px-3 py-2.5"
              />
              <button
                disabled={busy}
                className="w-full bg-blue py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Add student
              </button>
            </form>

            <div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a student"
                className="w-full border border-line px-3 py-2.5"
              />
              <div className="mt-2 divide-y divide-line border-y border-line">
                {students.map((student) => (
                  <article key={student.id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-ink">{student.display_name}</div>
                        <div className="text-sm text-mute">
                          {student.handle} · {formatTickets(student.ticket_balance)}
                          {student.daily_excluded ? ' · skipped today' : ''}
                          {!student.active ? ' · paused' : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          inputMode="numeric"
                          placeholder="4"
                          value={adjustAmounts[student.id] ?? ''}
                          onChange={(e) =>
                            setAdjustAmounts((prev) => ({
                              ...prev,
                              [student.id]: digitValue(e.target.value),
                            }))
                          }
                          className="w-16 border border-line px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const amount = parseAmount(adjustAmounts[student.id] ?? '', 4)
                            void wrap(
                              () => staffAdjust(client, student.id, amount, adjustNote),
                              `+${amount} for ${student.display_name}`,
                            )
                          }}
                          className="bg-blue px-3 py-1 text-sm font-semibold text-white"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const amount = parseAmount(adjustAmounts[student.id] ?? '', 4)
                            void wrap(
                              () => staffAdjust(client, student.id, -amount, adjustNote),
                              `−${amount} for ${student.display_name}`,
                            )
                          }}
                          className="border border-line px-3 py-1 text-sm text-ink"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-blue">
                      <button
                        type="button"
                        onClick={() =>
                          void wrap(() =>
                            setStudentFlags(client, student.id, {
                              daily_excluded: !student.daily_excluded,
                            }),
                          )
                        }
                      >
                        {student.daily_excluded ? 'Include in daily' : 'Exclude from daily'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void wrap(() =>
                            setStudentFlags(client, student.id, { active: !student.active }),
                          )
                        }
                      >
                        {student.active ? 'Pause' : 'Unpause'}
                      </button>
                      {profile.role === 'admin' ? (
                        <button
                          type="button"
                          className="text-mute hover:text-ink"
                          onClick={() => {
                            const password = window.prompt(`New password for ${student.display_name}`)
                            if (!password) return
                            void wrap(
                              () =>
                                manageUser(client, {
                                  action: 'password',
                                  userId: student.id,
                                  password,
                                }),
                              `Password updated for ${student.display_name}`,
                            )
                          }}
                        >
                          password
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              {profile.role === 'admin' ? (
                <div className="mt-10">
                  <button
                    type="button"
                    className="text-sm text-mute hover:text-ink"
                    onClick={() => setAccountOpen(true)}
                  >
                    If you need to change someone else
                  </button>
                  {accountOpen ? (
                    <div className="mt-3 divide-y divide-line border-y border-line">
                      {people
                        .filter((person) => person.id !== profile.id && person.role !== 'student')
                        .map((person) => (
                          <div
                            key={person.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <div>
                              <div className="text-sm font-medium text-ink">{person.display_name}</div>
                              <div className="text-sm text-mute">
                                {person.handle} · {person.role}
                              </div>
                            </div>
                            <form
                              className="flex gap-2"
                              onSubmit={(event) => {
                                event.preventDefault()
                                const password = staffPasswords[person.id] ?? ''
                                if (password.length < 4) return
                                void wrap(async () => {
                                  await manageUser(client, {
                                    action: 'password',
                                    userId: person.id,
                                    password,
                                  })
                                  setStaffPasswords((prev) => ({ ...prev, [person.id]: '' }))
                                }, `Password updated for ${person.display_name}`)
                              }}
                            >
                              <input
                                type="password"
                                minLength={4}
                                placeholder="New password"
                                value={staffPasswords[person.id] ?? ''}
                                onChange={(e) =>
                                  setStaffPasswords((prev) => ({
                                    ...prev,
                                    [person.id]: e.target.value,
                                  }))
                                }
                                className="w-40 border border-line px-2 py-1 text-sm"
                              />
                              <button
                                disabled={busy}
                                className="text-sm text-mute hover:text-ink disabled:opacity-60"
                              >
                                save
                              </button>
                            </form>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <label className="mt-4 block text-sm text-mute">
                Note on ticket changes
                <input
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="mt-1 w-full border border-line px-3 py-2.5 text-ink"
                />
              </label>
            </div>
          </section>
        ) : null}

        {tab === 'prizes' ? (
          <section className="mt-8 grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void wrap(async () => {
                  const current = prizes.find((p) => p.id === editingId)
                  await upsertPrize(client, {
                    id: editingId,
                    name: prizeName,
                    description: prizeDesc,
                    min_tickets: parseAmount(prizeMin, 1),
                    status:
                      current?.status === 'open' || current?.status === 'closed'
                        ? current.status
                        : 'draft',
                  })
                  setPrizeName('')
                  setPrizeDesc('')
                  setPrizeMin('4')
                  setEditingId(null)
                }, editingId ? 'Prize updated' : 'Prize added')
              }}
            >
              <h2 className="text-lg font-semibold text-ink">
                {editingId ? 'Edit prize' : 'New prize'}
              </h2>
              <input
                required
                placeholder="Digital camera"
                value={prizeName}
                onChange={(e) => setPrizeName(e.target.value)}
                className="w-full border border-line px-3 py-2.5"
              />
              <textarea
                placeholder="What they win"
                value={prizeDesc}
                onChange={(e) => setPrizeDesc(e.target.value)}
                className="min-h-24 w-full border border-line px-3 py-2.5"
              />
              <label className="block text-sm text-ink">
                Minimum tickets to enter
                <input
                  inputMode="numeric"
                  value={prizeMin}
                  onChange={(e) => setPrizeMin(digitValue(e.target.value))}
                  className="mt-1 w-full border border-line px-3 py-2.5"
                />
              </label>
              <button
                disabled={busy}
                className="w-full bg-blue py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {editingId ? 'Save prize' : 'Add prize'}
              </button>
            </form>
            <div className="divide-y divide-line border-y border-line">
              {prizes.map((prize) => {
                const total = entries
                  .filter((e) => e.prize_id === prize.id)
                  .reduce((sum, e) => sum + asInt(e.tickets), 0)
                return (
                  <article key={prize.id} className="py-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{prize.name}</h3>
                        <p className="text-sm text-mute">
                          {prize.status === 'draft' ? 'waiting' : prize.status} · min{' '}
                          {asInt(prize.min_tickets, 1)} · {formatTickets(total)} in
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-blue">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(prize.id)
                            setPrizeName(prize.name)
                            setPrizeDesc(prize.description)
                            setPrizeMin(String(asInt(prize.min_tickets, 1)))
                          }}
                        >
                          Edit
                        </button>
                        {prize.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => void wrap(() => lockPrize(client, prize.id), 'Locked')}
                          >
                            Lock
                          </button>
                        ) : null}
                        {prize.status === 'drawing' ? (
                          <button
                            type="button"
                            onClick={() => void wrap(() => reopenPrize(client, prize.id), 'Draw cancelled')}
                          >
                            Cancel draw
                          </button>
                        ) : null}
                        {prize.status !== 'drawing' ? (
                          <button
                            type="button"
                            className="text-red-600"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Delete ${prize.name}? Tickets already in it go back to students.`,
                                )
                              ) {
                                return
                              }
                              void wrap(() => deletePrize(client, prize.id), `Deleted ${prize.name}`)
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        {tab === 'daily' ? (
          <section className="mt-8 max-w-lg">
            <h2 className="text-lg font-semibold text-ink">Daily tickets</h2>
            <p className="mt-2 text-sm text-mute">
              Weekday mornings add this many tickets automatically. Give tickets now
              always pays out, even if they already got today&apos;s set.
            </p>
            <label className="mt-6 block text-sm text-ink">
              Tickets per student
                <input
                  inputMode="numeric"
                  value={grantAmount}
                  onChange={(e) => {
                    grantTouched.current = true
                    setGrantAmount(digitValue(e.target.value))
                  }}
                  className="mt-1 w-full border border-line px-3 py-2.5"
                />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={weekdaysOnly}
                onChange={(e) => {
                  grantTouched.current = true
                  setWeekdaysOnly(e.target.checked)
                }}
              />
              Weekdays only
            </label>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void wrap(
                    async () => {
                      await saveSettings(client, asInt(grantAmount), weekdaysOnly)
                      grantTouched.current = false
                    },
                    'Saved',
                  )
                }
                className="bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void wrap(async () => {
                    const result = await runDailyGrant(client, true)
                    setNotice(
                      result.skipped
                        ? `Skipped: ${result.skipped}`
                        : `Gave ${result.amount} tickets to ${result.granted} students`,
                    )
                  })
                }
                className="border border-line px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
              >
                Give tickets now
              </button>
            </div>
            {settings ? (
              <p className="mt-4 text-sm text-mute">
                Current: {settings.daily_grant_amount} / day
                {settings.weekdays_only ? ', weekdays' : ', every day'}
              </p>
            ) : null}
          </section>
        ) : null}

        {tab === 'draw' ? (
          <section className="mt-8">
            <p className="text-sm text-mute">
              Start a prize to open tickets. The board updates live as people
              put tickets in. Spin when you are ready.
            </p>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {prizes
                .filter((p) => ['draft', 'open', 'locked', 'drawing'].includes(p.status))
                .map((prize) => {
                  const pool = entries.filter((e) => e.prize_id === prize.id)
                  const total = pool.reduce((sum, e) => sum + asInt(e.tickets), 0)
                  const live = prize.status === 'open'
                  return (
                    <article
                      key={prize.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-5"
                    >
                      <div>
                        <h3 className="text-lg font-semibold text-ink">{prize.name}</h3>
                        <p className="text-sm text-mute">
                          {pool.length} students · {formatTickets(total)} · min {asInt(prize.min_tickets, 1)}
                          {prize.status === 'draft' ? ' · not started' : ''}
                          {live ? ' · open for tickets' : ''}
                          {prize.status === 'drawing' ? ' · spinning' : ''}
                        </p>
                      </div>
                      {prize.status === 'draft' || prize.status === 'closed' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void wrap(async () => {
                              await startPrize(client, prize.id)
                              navigate(`/spin/${prize.id}`)
                            })
                          }
                          className="bg-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Start
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => navigate(`/spin/${prize.id}`)}
                          className="bg-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {prize.status === 'drawing' ? 'Resume' : 'Board'}
                        </button>
                      )}
                    </article>
                  )
                })}
            </div>
            {prizes.some((p) => p.status === 'awarded') ? (
              <ul className="mt-8 space-y-2 text-sm text-mute">
                {prizes
                  .filter((p) => p.status === 'awarded')
                  .map((prize) => (
                    <li key={prize.id} className="flex justify-between border-b border-line py-2">
                      <span>{prize.name}</span>
                      <span>done</span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
