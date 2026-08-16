export default function WinnerModal({
  prizeName,
  winnerName,
  youWon,
  onClose,
  nextLabel,
  onNext,
}: {
  prizeName: string
  winnerName: string
  youWon: boolean
  onClose: () => void
  nextLabel?: string
  onNext?: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 px-5">
      <div
        role="dialog"
        aria-labelledby="winner-title"
        className="w-full max-w-md bg-white p-8 text-center shadow-lg"
      >
        <p className="text-sm text-mute">{prizeName}</p>
        <h2 id="winner-title" className="mt-3 text-4xl font-bold text-blue">
          {youWon ? 'You won!' : `${winnerName} won`}
        </h2>
        {!youWon ? (
          <p className="mt-3 text-ink">{winnerName} takes the {prizeName}.</p>
        ) : (
          <p className="mt-3 text-ink">Come pick up the {prizeName}.</p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {onNext ? (
            <button
              type="button"
              onClick={onNext}
              className="bg-blue py-3 text-sm font-semibold text-white"
            >
              {nextLabel ?? 'Next prize'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={onNext ? 'text-sm text-mute' : 'bg-blue py-3 text-sm font-semibold text-white'}
          >
            {onNext ? 'Keep this up' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
