import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DraftPickToasts } from './DraftPickToasts'
import { DRAFT_TOAST_MS, type DraftToast } from '../lib/draftToast'

function toast(overrides: Partial<DraftToast> = {}): DraftToast {
  return {
    id: 'c1',
    contestantName: 'Sandra',
    photoUrl: 'https://example.test/sandra.jpg',
    teamName: "Ada's Traitors",
    mine: false,
    ...overrides,
  }
}

describe('DraftPickToasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('names the contestant and the team that took them', () => {
    render(<DraftPickToasts toasts={[toast()]} onDismiss={() => {}} />)
    expect(screen.getByText("Sandra was drafted to team Ada's Traitors!")).toBeInTheDocument()
  })

  // The team that picked is told what they did, not who did it.
  it('speaks to the picking team in the second person', () => {
    render(<DraftPickToasts toasts={[toast({ mine: true })]} onDismiss={() => {}} />)
    expect(screen.getByText('You chose Sandra!')).toBeInTheDocument()
    expect(screen.queryByText(/drafted to team/)).not.toBeInTheDocument()
  })

  it('shows the contestant photo', () => {
    render(<DraftPickToasts toasts={[toast()]} onDismiss={() => {}} />)
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.test/sandra.jpg')
  })

  it('retires itself after five seconds', () => {
    const onDismiss = vi.fn()
    render(<DraftPickToasts toasts={[toast()]} onDismiss={onDismiss} />)

    act(() => void vi.advanceTimersByTime(DRAFT_TOAST_MS - 1))
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledWith('c1')
  })

  it('can be dismissed by hand before then', async () => {
    // Real timers here: userEvent waits on its own, and the clock this test
    // cares about is the reader's patience rather than the five seconds.
    vi.useRealTimers()
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<DraftPickToasts toasts={[toast()]} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledWith('c1')
  })

  // The stack is a fixed overlay across the bottom of the screen. If it took
  // pointer events, it would sit on top of the pick buttons on a phone for
  // five seconds after every pick — while the clock kept running.
  it('lets clicks through everywhere except the cards themselves', () => {
    render(<DraftPickToasts toasts={[toast()]} onDismiss={() => {}} />)
    const stack = screen.getByRole('status')
    expect(stack.className).toContain('pointer-events-none')
    expect((stack.firstElementChild as HTMLElement).className).toContain('pointer-events-auto')
  })

  it('draws nothing at all when there is nothing to announce', () => {
    render(<DraftPickToasts toasts={[]} onDismiss={() => {}} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
