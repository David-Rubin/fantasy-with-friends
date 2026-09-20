import { describe, it, expect } from 'vitest'
import { photoFileProblem, MAX_PHOTO_BYTES } from './photoFile'

describe('photoFileProblem', () => {
  it('accepts png and jpeg', () => {
    expect(photoFileProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(photoFileProblem({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('rejects anything else, whatever it is called', () => {
    expect(photoFileProblem({ type: 'image/gif', size: 10 })).toBe('type')
    expect(photoFileProblem({ type: 'application/pdf', size: 10 })).toBe('type')
    // A renamed executable reports its real type, not its extension.
    expect(photoFileProblem({ type: 'application/x-msdownload', size: 10 })).toBe('type')
    expect(photoFileProblem({ type: '', size: 10 })).toBe('type')
  })

  it('rejects a file over the limit', () => {
    expect(photoFileProblem({ type: 'image/png', size: MAX_PHOTO_BYTES + 1 })).toBe('size')
  })

  it('accepts a file exactly on the limit, as the storage rule does', () => {
    expect(photoFileProblem({ type: 'image/png', size: MAX_PHOTO_BYTES })).toBeNull()
  })

  it('reports the wrong type before the size, so the clearer problem wins', () => {
    expect(photoFileProblem({ type: 'image/gif', size: MAX_PHOTO_BYTES + 1 })).toBe('type')
  })
})
