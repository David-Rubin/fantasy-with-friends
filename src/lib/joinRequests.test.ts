import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The approval path writes to several collections at once and decides which
 * seasons a new member lands in. Both are easy to get wrong in ways no type
 * catches — a member admitted to a season already drafting would sit in the
 * roster with no pick position — so the batch contents are asserted directly.
 */

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  batchSet: vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
  logAuditEvent: vi.fn(),
}))

// Only what the assertions need: the audit call is spied on, and every
// Firestore write is captured below. ./firebase is deliberately NOT mocked —
// the test env in vite.config.ts makes importing it safe.
vi.mock('./audit', () => ({ logAuditEvent: mocks.logAuditEvent }))

// A partial mock: only the calls these tests assert on are replaced, so
// firebase.ts keeps its real getFirestore and cannot break this test by
// importing something new from the module later.
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collectionGroup: (_db: unknown, id: string) => ({ path: id }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  query: (base: { path: string }, ...constraints: unknown[]) => ({ base, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  writeBatch: () => ({
    set: mocks.batchSet,
    update: mocks.batchUpdate,
    commit: mocks.batchCommit,
  }),
}))

const { requestToJoin, approveJoinRequest, rejectJoinRequest } = await import('./joinRequests')

const request = {
  uid: 'user-1',
  displayName: 'Ada',
  status: 'pending' as const,
  requestedAt: 1000,
  decidedAt: null,
  decidedBy: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getDocs.mockResolvedValue({ docs: [] })
})

describe('requestToJoin', () => {
  it('writes a pending request keyed by the requester, with no decision', async () => {
    await requestToJoin('league-1', 'user-1', 'Ada')

    const [ref, data] = mocks.setDoc.mock.calls[0]
    expect(ref.path).toBe('leagues/league-1/joinRequests/user-1')
    expect(data).toMatchObject({
      uid: 'user-1',
      displayName: 'Ada',
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
    })
  })
})

describe('approveJoinRequest', () => {
  it('only considers seasons that have not started', async () => {
    await approveJoinRequest('league-1', request, 'owner-1')

    const { base, constraints } = mocks.getDocs.mock.calls[0][0]
    expect(base.path).toBe('seasons')
    expect(constraints).toEqual([
      { field: 'leagueId', op: '==', value: 'league-1' },
      { field: 'state', op: '==', value: 'setup' },
    ])
  })

  it('admits the member to the league and to every setup season', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'season-a' }, { id: 'season-b' }] })

    await approveJoinRequest('league-1', request, 'owner-1')

    const written = Object.fromEntries(
      mocks.batchSet.mock.calls.map(([ref, data]) => [ref.path, data])
    )

    expect(written['leagues/league-1/members/user-1']).toMatchObject({
      uid: 'user-1',
      displayName: 'Ada',
      role: 'member',
    })
    for (const seasonId of ['season-a', 'season-b']) {
      expect(written[`seasons/${seasonId}/members/user-1`]).toMatchObject({
        uid: 'user-1',
        displayName: 'Ada',
        teamName: "Ada's Team",
        pickPosition: null,
      })
    }
  })

  it('records who decided, and commits every write together', async () => {
    mocks.getDocs.mockResolvedValue({ docs: [{ id: 'season-a' }] })

    await approveJoinRequest('league-1', request, 'owner-1')

    const [ref, data] = mocks.batchUpdate.mock.calls[0]
    expect(ref.path).toBe('leagues/league-1/joinRequests/user-1')
    expect(data).toMatchObject({ status: 'approved', decidedBy: 'owner-1' })
    // The membership and the decision are one atomic write, never two.
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('rejectJoinRequest', () => {
  it('marks the request rejected without granting membership', async () => {
    await rejectJoinRequest('league-1', 'user-1', 'owner-1')

    const [ref, data] = mocks.updateDoc.mock.calls[0]
    expect(ref.path).toBe('leagues/league-1/joinRequests/user-1')
    expect(data).toMatchObject({ status: 'rejected', decidedBy: 'owner-1' })
    // Kept, not deleted: the owner keeps the history and the user can ask again.
    expect(mocks.batchSet).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
