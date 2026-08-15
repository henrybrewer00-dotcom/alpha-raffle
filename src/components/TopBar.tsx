import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { SCHOOL_SHORT } from '../lib/brand'

export default function TopBar({
  right,
}: {
  right?: ReactNode
}) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link to="/" className="flex items-baseline gap-3 text-ink no-underline">
          <span className="text-[15px] font-bold tracking-tight">{SCHOOL_SHORT}</span>
          <span className="text-sm text-mute">Raffle</span>
        </Link>
        <div className="flex items-center gap-5 text-sm">{right}</div>
      </div>
    </header>
  )
}
