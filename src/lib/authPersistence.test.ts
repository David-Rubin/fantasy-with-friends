import { describe, it, expect } from 'vitest'
import { tabScopedAuthEnabled } from './authPersistence'

/**
 * The risk in a flag that changes where credentials are stored is it turning
 * itself on somewhere nobody asked for it, so the default is what these pin.
 */
describe('tabScopedAuthEnabled', () => {
  it('is off when the variable is absent', () => {
    expect(tabScopedAuthEnabled({})).toBe(false)
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: undefined })).toBe(false)
  })

  it('only the exact string true opts in', () => {
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: 'true' })).toBe(true)
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: '1' })).toBe(false)
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: 'True' })).toBe(false)
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: 'false' })).toBe(false)
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: '' })).toBe(false)
  })

  it('does not treat a truthy non-string as on', () => {
    expect(tabScopedAuthEnabled({ VITE_TAB_SCOPED_AUTH: true })).toBe(false)
  })
})
