// Maps a published best window onto the 06:00-18:00 daylight track the
// ranked-list bar renders. Pure and clock-free like everything in the render
// layer: strings in, percentages out. The one law (proven in
// tests/unit/best-window-span.test.ts): a window the track cannot represent
// honestly returns undefined — a stated absence renders no bar, never an
// invented one.

export interface WindowSpan {
  readonly left: number;
  readonly width: number;
}

const TRACK_START_MIN = 6 * 60;
const TRACK_END_MIN = 18 * 60;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(text: string): number | undefined {
  if (!CLOCK.test(text)) return undefined;
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
}

export function bestWindowSpan(window: { readonly start: string; readonly end: string }): WindowSpan | undefined {
  const start = minutesOf(window.start);
  const end = minutesOf(window.end);
  if (start === undefined || end === undefined) return undefined;
  const lo = Math.max(start, TRACK_START_MIN);
  const hi = Math.min(end, TRACK_END_MIN);
  if (hi <= lo) return undefined;
  const span = TRACK_END_MIN - TRACK_START_MIN;
  return {
    left: ((lo - TRACK_START_MIN) / span) * 100,
    width: ((hi - lo) / span) * 100,
  };
}
