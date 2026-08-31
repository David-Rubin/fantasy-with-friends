import { describe, it, expect } from 'vitest'
import { avatarFileProblem, MAX_AVATAR_BYTES } from './avatarFile'

describe('avatarFileProblem', () => {
  it('accepts png and jpeg', () => {
    expect(avatarFileProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(avatarFileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('rejects anything else, whatever it is called', () => {
    expect(avatarFileProblem({ type: 'image/gif', size: 10 })).toBe('type')
    expect(avatarFileProblem({ type: 'application/pdf', size: 10 })).toBe('type')
    // A renamed executable reports its real type, not its extension.
    expect(avatarFileProblem({ type: 'application/x-msdownload', size: 10 })).toBe('type')
    expect(avatarFileProblem({ type: '', size: 10 })).toBe('type')
  })

  it('rejects a file over the limit', () => {
    expect(avatarFileProblem({ type: 'image/png', size: MAX_AVATAR_BYTES + 1 })).toBe('size')
  })

  it('accepts a file exactly on the limit, as the storage rule does', () => {
    expect(avatarFileProblem({ type: 'image/png', size: MAX_AVATAR_BYTES })).toBeNull()
  })

  it('reports the wrong type before the size, so the clearer problem wins', () => {
    expect(avatarFileProblem({ type: 'image/gif', size: MAX_AVATAR_BYTES + 1 })).toBe('type')
  })
})
