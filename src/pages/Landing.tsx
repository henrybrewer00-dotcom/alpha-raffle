import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { useAuth } from '../lib/auth'
import { CITY, EMAIL_DOMAIN, SCHOOL } from '../lib/brand'

type Door = 'student' | 'guide' | 'admin'

export default function Landing() {
  const { login, profile } = useAuth()
  const navigate = useNavigate()
  const [door, setDoor] = useState<Door>('student')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await login({
        handle: door === 'guide' && !handle.trim() ? 'guide' : handle,
        password,
        passcodeOnly: door === 'guide' && !handle.trim(),
      })
      if (next.role === 'student') navigate('/hall')
      else navigate('/desk')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBar />
      <main className="mx-auto max-w-md px-5 py-16">
        <h1 className="text-3xl font-bold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-mute">
          {SCHOOL}, {CITY}. Students sign in with their school email. Guides use
          the classroom passcode.
        </p>

        <div className="mt-8 flex gap-6 border-b border-line text-sm">
          {(['student', 'guide', 'admin'] as Door[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDoor(key)}
              className={`-mb-px border-b-2 pb-2 capitalize ${
                door === key
                  ? 'border-blue font-semibold text-blue'
                  : 'border-transparent text-mute'
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          {door !== 'guide' || handle.length > 0 ? (
            <label className="block text-sm">
              <span className="font-medium text-ink">
                {door === 'guide' ? 'Guide email (optional)' : 'Email'}
              </span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoComplete="username"
                placeholder={
                  door === 'student'
                    ? `test1@${EMAIL_DOMAIN}`
                    : `test@${EMAIL_DOMAIN}`
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2.5"
              />
            </label>
          ) : (
            <button
              type="button"
              className="text-sm text-blue underline"
              onClick={() => setHandle('guide')}
            >
              Sign in with a guide email instead
            </button>
          )}

          <label className="block text-sm">
            <span className="font-medium text-ink">
              {door === 'guide' && !handle ? 'Passcode' : 'Password'}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full border border-line bg-white px-3 py-2.5"
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {profile ? (
          <button
            type="button"
            onClick={() => navigate(profile.role === 'student' ? '/hall' : '/desk')}
            className="mt-6 text-sm text-blue"
          >
            Continue as {profile.display_name}
          </button>
        ) : null}
      </main>
    </div>
  )
}
