import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeasonStateBadge } from './SeasonStateBadge'
import type { SeasonState } from '../lib/types'

const STATES: SeasonState[] = ['setup', 'draft', 'active', 'complete']

describe('SeasonStateBadge', () => {
  it('names the state it is given', () => {
    render(<SeasonStateBadge state="active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  // The point of taking the colour from the state rather than from an accent
  // somebody picked: two seasons at the same stage now look the same, and one
  // season looks different as it moves. Neither was true before.
  it('gives every state its own colour', () => {
    const classes = STATES.map((state) => {
      const { container, unmount } = render(<SeasonStateBadge state={state} />)
      const className = container.firstElementChild!.className
      unmount()
      return className
    })
    expect(new Set(classes).size).toBe(STATES.length)
  })

  it('leaves no state without a colour', () => {
    for (const state of STATES) {
      const { container, unmount } = render(<SeasonStateBadge state={state} />)
      // An unmapped state would reach the class string as `undefined`, which is
      // a pill with no background rather than an error anybody would notice.
      expect(container.firstElementChild!.className).not.toContain('undefined')
      unmount()
    }
  })
})
