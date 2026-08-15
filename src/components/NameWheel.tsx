import { sliceLabelLight, type WheelSegment } from '../lib/wheel'

export default function NameWheel({
  segments,
  rotation,
}: {
  segments: WheelSegment[]
  rotation: number
}) {
  const gradient = segments
    .map((segment) => {
      const from = segment.start
      const to = segment.start + segment.sweep
      return `${segment.color} ${from}deg ${to}deg`
    })
    .join(', ')

  return (
    <div className="relative mx-auto size-[min(86vw,28rem)]">
      <div
        aria-hidden
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        style={{
          width: 0,
          height: 0,
          borderLeft: '14px solid transparent',
          borderRight: '14px solid transparent',
          borderTop: '22px solid #fff',
        }}
      />
      <div
        className="relative size-full overflow-hidden rounded-full border-[10px] border-white shadow-xl"
        style={{
          background: segments.length
            ? `conic-gradient(from -90deg, ${gradient})`
            : '#0b0b8c',
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {segments.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
            Waiting for tickets
          </div>
        ) : null}
        {segments.length === 1 ? (
          <span
            className={`absolute left-1/2 top-[18%] -translate-x-1/2 text-sm font-semibold md:text-base ${
              sliceLabelLight(segments[0].color) ? 'text-white' : 'text-ink'
            }`}
          >
            {segments[0].name.split(' ')[0]}
          </span>
        ) : (
          segments.map((segment) => {
            if (segment.sweep < 14) return null
            const mid = segment.start + segment.sweep / 2
            const flip = mid > 90 && mid < 270
            return (
              <div
                key={segment.userId}
                className="absolute inset-0"
                style={{ transform: `rotate(${mid}deg)` }}
              >
                <span
                  className={`absolute left-1/2 top-[12%] -translate-x-1/2 text-[11px] font-semibold md:text-sm ${
                    sliceLabelLight(segment.color) ? 'text-white' : 'text-ink'
                  }`}
                  style={{ transform: flip ? 'rotate(180deg)' : undefined }}
                >
                  {segment.name.split(' ')[0]}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
