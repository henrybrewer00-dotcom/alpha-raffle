# Color and type

This school is blue. Not a palette of seven blues. One blue, used like a stamp.

If a screen looks like a startup landing page, it is wrong.

## Tokens

| Token | Hex | Use |
|---|---|---|
| `--blue` | `#0000EF` | Buttons, links, the draw board, focus rings |
| `--blue-dark` | `#0000C4` | Pressed blue |
| `--blue-deep` | `#00006B` | Rare. Empty-wheel well only |
| `--gold` | `#FFB81C` | First pie slice. Accent, never decoration |
| `--red` | `#E31C3D` | Second slice, real errors |
| `--teal` | `#2EE6D6` | Third slice |
| `--sky` | `#47C4E6` | Soft accent, never a page background |
| `--paper` | `#F8F8F8` | Quiet panels |
| `--ink` | `#2D2D2D` | Body text |
| `--mute` | `#7A7A7A` | Secondary text |
| `--line` | `#E4E4E4` | Hairline borders |
| `--white` | `#FFFFFF` | Almost every page |

Defined in `src/index.css`. Tailwind aliases live in `tailwind.config.js`.

## Type

**Montserrat.** Weights 400, 500, 600, 700. No tracking-widest eyebrows. No invented wordmarks.

| Role | Size | Weight |
|---|---|---|
| Page title | `text-3xl` | 700 |
| School mark | 15px | 700 |
| Body | 14–16px | 400–500 |
| Button | 14px | 600 |
| Mute line | 13–14px | 400 |

Sentence case. Real words. “Sign in”, not “Let’s go”.

## Surfaces

- Hall, desk, and landing sit on white.
- The draw board is the only loud room: full `--blue`, white type, white wheel ring.
- Cards are white with a 1px `--line` border. No drop shadows except the wheel.

## The pie rule

The board is `#0000EF`. The first slice must never be `#0000EF`.

A one-student pie that uses page blue looks like an empty white ring. First slice is gold. Then red, teal, and the rest of `SLICE_COLORS` in `src/lib/wheel.ts`. After twelve students, colors keep going on a golden-angle hue that skips the page-blue neighborhood (hue ~240).

Empty board only: `#0b0b8c` well + “Waiting for tickets”.

## Do / don’t

Do

- One primary action per view, in `--blue`
- Names on the wheel, first name only
- One-student name at 12 o’clock, upright
- Leave room. White is part of the brand

Don’t

- Invent a second brand (no greens, no “hall” gimmicks, no ticket illustrations)
- Use navy, indigo, or page blue as a slice
- Center a 360° label at 6 o’clock (it reads upside-down)
- Add gradients, glass, or glow to make it “feel premium”
