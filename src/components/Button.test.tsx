import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('is not clickable while it is working', () => {
    render(<Button loading>Save changes</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  // jsdom has no layout engine, so the width cannot be measured here. What can
  // be pinned is the arrangement that keeps the width fixed: the spinner sits
  // outside the flow and the label keeps its box rather than being replaced.
  // In the flow the spinner added its own width plus a gap, and the label
  // jumped sideways the moment the button was clicked.
  it('lays the spinner over the label instead of beside it', () => {
    const { rerender } = render(<Button>Save changes</Button>)
    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toBeNull()

    rerender(<Button loading>Save changes</Button>)
    const spinner = button.querySelector('svg')!
    expect(spinner.parentElement!.className).toContain('absolute')
    // Still rendered, still occupying its space — merely not shown.
    expect(screen.getByText('Save changes').className).toContain('invisible')
  })
})
