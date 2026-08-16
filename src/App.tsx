import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Landing from './pages/Landing'
import StudentHall from './pages/StudentHall'
import StaffDesk from './pages/StaffDesk'
import SpinFloor from './pages/SpinFloor'

function Gate({
  allow,
  children,
}: {
  allow: Array<'student' | 'guide' | 'admin'>
  children: ReactNode
}) {
  const { loading, profile } = useAuth()
  if (loading && !profile) {
    return (
      <div className="grid min-h-screen place-items-center text-mute">
        Loading…
      </div>
    )
  }
  if (!profile || !allow.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/hall"
        element={
          <Gate allow={['student', 'guide', 'admin']}>
            <StudentHall />
          </Gate>
        }
      />
      <Route
        path="/desk"
        element={
          <Gate allow={['guide', 'admin']}>
            <StaffDesk />
          </Gate>
        }
      />
      <Route
        path="/spin/:prizeId"
        element={
          <Gate allow={['guide', 'admin']}>
            <SpinFloor />
          </Gate>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
