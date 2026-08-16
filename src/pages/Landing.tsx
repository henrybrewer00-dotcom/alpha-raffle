import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import { useAuth } from '../lib/auth'
import { CITY, EMAIL_DOMAIN, SCHOOL } from '../lib/brand'

export default function Landing() {
  const { login, profile } = useAuth()
  const navigate = useNavigate()
  const [staff, setStaff] = useState(false)
  const [staffEmail, setStaffEmail] = useState(false)
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passcodeOnly = staff && !staffEmail

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const next = await login({
        handle: passcodeOnly ? 'guide' : handle,
        password,
        passcodeOnly,
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
          {SCHOOL}, {CITY}. Use your school email.
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          {passcodeOnly ? null : (
            <label className="block text-sm">
              <span className="font-medium text-ink">Email</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoComplete="username"
                placeholder={
                  staff ? `test@${EMAIL_DOMAIN}` : `test1@${EMAIL_DOMAIN}`
                }
                className="mt-1 w-full border border-line bg-white px-3 py-2.5"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="font-medium text-ink">
              {passcodeOnly ? 'Passcode' : 'Password'}
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

        <div className="mt-8 text-sm text-mute">
          {staff ? (
            <div className="space-y-2">
              {staffEmail ? (
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => {
                    setStaffEmail(false)
                    setHandle('')
                  }}
                >
                  Use the classroom passcode
                </button>
              ) : (
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => setStaffEmail(true)}
                >
                  Use an email instead
                </button>
              )}
              <div>
                <button
                  type="button"
                  className="hover:text-ink"
                  onClick={() => {
                    setStaff(false)
                    setStaffEmail(false)
                    setHandle('')
                    setPassword('')
                  }}
                >
                  Back to student sign in
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="hover:text-ink"
              onClick={() => setStaff(true)}
            >
              If you&apos;re a guide or admin
            </button>
          )}
        </div>

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
