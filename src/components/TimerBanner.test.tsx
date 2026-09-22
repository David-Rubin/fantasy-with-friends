import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimerBanner } from './TimerBanner'
import { recordClockSample, resetClock } from '../lib/serverClock'

function renderBanner(secondsUntilDeadline: number, durationSeconds = 60) {
  render(
    <TimerBanner
      pickerName="Ada Owner"
      timerExpiresAt={Date.now() + secondsUntilDeadline * 1000}
      durationSeconds={durationSeconds}
      isYourTurn={false}
    />
  )
  return screen.getByRole('progressbar')
}

describe('TimerBanner', () => {
  // The banner is unmounted while the clock is stopped, so resuming mounts it
  // afresh. Seeded from the duration instead of the deadline, its first paint
  // was a full bar whatever the clock said, and the width transition then swept
  // it down to the truth — which is what a resume looked like. The first render
  // has to be right on its own, before any tick has run.
  it('starts at the deadline it was given, not at a full bar', () => {
    const bar = renderBanner(30)
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%')
    expect(bar.getAttribute('aria-valuenow')).toBe('30')
  })

  it('is already near empty when it resumes with little left', () => {
    const bar = renderBanner(6)
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('10%')
  })

  it('shows a full bar only when the clock really is full', () => {
    const bar = renderBanner(60)
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  // A deadline further out than the duration — a season whose timer was raised
  // while a turn was already running — filled the track to 750% of its width.
  it('never draws a bar wider than its track', () => {
    const bar = renderBanner(900, 120)
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })

  // A device whose own clock is fast used to shorten every turn it drew: a
  // sixty-second draft opened at forty on a phone twenty seconds ahead. The
  // deadline is a moment on the server's clock, so the countdown is read
  // against the server's clock.
  describe('on a device whose clock is wrong', () => {
    afterEach(() => resetClock())

    it('counts the time the server actually left on the turn', () => {
      const now = Date.now()
      // This device is 20s ahead: it says `now` where the server says now-20s.
      recordClockSample(now, now - 20_000, now + 20)
      // The server set a deadline 60s from its own now, which this device
      // reads as 40s from its own.
      render(
        <TimerBanner
          pickerName="Ada Owner"
          timerExpiresAt={now + 40_000}
          durationSeconds={60}
          isYourTurn={false}
        />
      )
      const bar = screen.getByRole('progressbar')
      expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(59)
      expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
    })
  })
})
