import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimerBanner } from './TimerBanner'

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
})
