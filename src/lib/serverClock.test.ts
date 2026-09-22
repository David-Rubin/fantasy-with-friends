import { describe, it, expect, beforeEach } from 'vitest'
import { clockOffset, clockOffsetMs, recordClockSample, resetClock, serverNow } from './serverClock'

describe('clockOffset', () => {
  it('reads the server as having answered halfway through the round trip', () => {
    // Sent at 1000 on this device, answered at 1200; the server said 1600.
    expect(clockOffset(1000, 1600, 1200)).toBe(500)
  })

  it('is zero for two clocks that agree, whatever the round trip', () => {
    expect(clockOffset(1000, 1100, 1200)).toBe(0)
  })
})

describe('the measured clock', () => {
  beforeEach(() => resetClock())

  it('is the device clock until something has been measured', () => {
    expect(clockOffsetMs()).toBe(0)
    expect(Math.abs(serverNow() - Date.now())).toBeLessThan(50)
  })

  // The bug this exists for: a device twenty seconds fast opened every turn of
  // a sixty-second draft at forty.
  it('corrects a device whose clock runs fast', () => {
    const now = Date.now()
    recordClockSample(now, now - 20_000, now + 100)
    expect(clockOffsetMs()).toBeCloseTo(-20_050, -2)
    expect(serverNow()).toBeLessThan(Date.now())
  })

  it('keeps the estimate from the fastest round trip, not the latest', () => {
    const now = Date.now()
    recordClockSample(now, now + 5_000, now + 40)
    const fromFastSample = clockOffsetMs()
    // A later, slower call: a worse measurement of a quantity that has not moved.
    recordClockSample(now, now + 9_000, now + 4_000)
    expect(clockOffsetMs()).toBe(fromFastSample)
  })

  it('ignores a round trip too slow to say anything', () => {
    const now = Date.now()
    recordClockSample(now, now + 30_000, now + 11_000)
    expect(clockOffsetMs()).toBe(0)
  })
})
