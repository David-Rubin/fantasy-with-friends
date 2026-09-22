/**
 * The draft's clock, measured against the server rather than the device.
 *
 * A turn's deadline is a moment in time written by a Cloud Function from the
 * server's clock, and the countdown is the difference between that and now.
 * Taking "now" from the device meant the countdown was only as accurate as the
 * device's clock: a phone twenty seconds fast opened every turn of a
 * sixty-second draft at forty, counted down to zero twenty seconds early, and
 * looked — from that phone, and only from that phone — like a season whose
 * timer setting was being ignored.
 *
 * So the offset between the two clocks is measured once and applied to every
 * reading. The server is the authority in both directions already: it sets the
 * deadline and it decides when a turn has expired, so a corrected client is a
 * client that agrees with the arithmetic that actually governs the draft.
 *
 * Nothing here reaches Firebase — the measurement is handed in by whoever made
 * the call that produced it (see DraftRoom's warm-up).
 */

/** The current best estimate, and how good the sample that produced it was. */
let offsetMs = 0
let bestRoundTripMs = Number.POSITIVE_INFINITY

/**
 * A round trip that took longer than this says nothing useful: the estimate
 * assumes the server's reading falls halfway through it, and over ten seconds
 * that assumption is worth less than the error it is trying to correct.
 */
const MAX_USEFUL_ROUND_TRIP_MS = 10_000

/**
 * The offset implied by one round trip, the way NTP reads one: the server's
 * reading is assumed to have been taken halfway between the call leaving and
 * the answer arriving, so the error left over is at most half the round trip.
 */
export function clockOffset(sentAt: number, serverNow: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2
}

/**
 * Record a measurement, keeping the one from the fastest round trip seen.
 *
 * Fastest rather than most recent, because a slow call's estimate is a worse
 * one and arriving later does not make it better — the quantity being measured
 * is a clock difference, which does not move.
 */
export function recordClockSample(sentAt: number, serverNow: number, receivedAt: number): void {
  const roundTrip = receivedAt - sentAt
  if (roundTrip < 0 || roundTrip > MAX_USEFUL_ROUND_TRIP_MS) return
  if (roundTrip >= bestRoundTripMs) return
  bestRoundTripMs = roundTrip
  offsetMs = clockOffset(sentAt, serverNow, receivedAt)
}

/** Now, on the server's clock. `Date.now()` until a sample says otherwise. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** What has been measured so far. Zero until a sample lands. */
export function clockOffsetMs(): number {
  return offsetMs
}

/** Tests only: forget what has been measured. */
export function resetClock(): void {
  offsetMs = 0
  bestRoundTripMs = Number.POSITIVE_INFINITY
}
