import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { markTabSignedIn, tabHasHostedSignIn } from './tabSession'

describe('tabSession', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts clean in a tab nobody has signed in to', () => {
    expect(tabHasHostedSignIn()).toBe(false)
  })

  it('remembers a sign-in', () => {
    markTabSignedIn()
    expect(tabHasHostedSignIn()).toBe(true)
  })

  it('keeps remembering after a sign-out — that is the point', () => {
    markTabSignedIn()
    markTabSignedIn()
    expect(tabHasHostedSignIn()).toBe(true)
  })

  it('degrades to forgetting rather than throwing when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    expect(() => markTabSignedIn()).not.toThrow()
    expect(tabHasHostedSignIn()).toBe(false)
  })
})
