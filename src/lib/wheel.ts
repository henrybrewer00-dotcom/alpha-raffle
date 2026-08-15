export interface WheelSegment {
  userId: string
  name: string
  tickets: number
  start: number
  sweep: number
  color: string
}

const SLICE_COLORS = [
  '#FFB81C',
  '#E31C3D',
  '#2EE6D6',
  '#F15A22',
  '#C2185B',
  '#7CFF6B',
  '#9B59FF',
  '#FF6B9D',
  '#FFE566',
  '#00C2A8',
  '#FF8A4C',
  '#4D9FFF',
]

function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function colorForSlice(index: number) {
  if (index < SLICE_COLORS.length) return SLICE_COLORS[index]
  let hue = (index * 137.508) % 360
  const dist = Math.abs(((hue - 240 + 180) % 360) - 180)
  if (dist < 28) hue = (hue + 55) % 360
  return hslToHex(hue, 78, 50)
}

export function buildSegments(
  entries: Array<{ user_id: string; tickets: number }>,
  names: Map<string, string>,
): WheelSegment[] {
  const pooled = new Map<string, number>()
  entries.forEach((entry) => {
    pooled.set(entry.user_id, (pooled.get(entry.user_id) ?? 0) + entry.tickets)
  })
  const rows = [...pooled.entries()]
    .filter(([, tickets]) => tickets > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  const total = rows.reduce((sum, [, tickets]) => sum + tickets, 0)
  if (total <= 0) return []

  let cursor = 0
  return rows.map(([userId, tickets], index) => {
    const start = cursor
    const sweep = index === rows.length - 1 ? 360 - start : (tickets / total) * 360
    cursor += sweep
    return {
      userId,
      name: names.get(userId) ?? 'Student',
      tickets,
      start,
      sweep,
      color: colorForSlice(index),
    }
  })
}

export function sliceLabelLight(color: string) {
  const n = parseInt(color.slice(1), 16)
  if (Number.isNaN(n)) return true
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 165
}

export function segmentAt(segments: WheelSegment[], rotation: number) {
  if (segments.length === 0) return null
  const angle = ((360 - (rotation % 360)) + 360) % 360
  return (
    segments.find((segment) => angle >= segment.start && angle < segment.start + segment.sweep) ??
    segments[segments.length - 1]
  )
}

export function targetRotation(segment: WheelSegment, extraSpins = 7) {
  const mid = segment.start + segment.sweep / 2
  return extraSpins * 360 + (360 - mid)
}

export function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

export const WHEEL_COLORS = SLICE_COLORS
