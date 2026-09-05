import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewSeasonModal } from './NewSeasonModal'
import type { Season } from '../lib/types'

// The writes are mocked to be watched, not to make the module load: what this
// file is about is which documents a set of answers turns into, and that is the
// argument createSeason is called with. Everything it is called with is decided
// in ../lib/seasonCarryOver, which is tested without any of this.
const createSeason = vi.hoisted(() => vi.fn(async () => 'new-season'))
const readCarryOverSource = vi.hoisted(() => vi.fn())

vi.mock('../lib/seasonApi', () => ({ createSeason, readCarryOverSource }))

const lastSeason: Season = {
  id: 'season-2',
  leagueId: 'league-1',
  label: 'The Traitors — Season 2',
  episodeCount: 10,
  state: 'complete',
  draftFormat: 'snake',
  pickOrderMethod: 'randomized',
  timerSeconds: 90,
  timerExpiry: 'skip',
  createdAt: 200,
  firstEpisodeScoredAt: 1,
  teamTotals: {},
  teamEpisodeTotals: {},
}

const leagueMembers = [
  { uid: 'u1', displayName: 'Ada Owner' },
  { uid: 'u2', displayName: 'Bob Member' },
  { uid: 'u3', displayName: 'Mia Requester' },
]

const lastSeasonData = {
  // Ada and Bob played last season; Mia joined the league afterwards.
  members: [
    {
      uid: 'u2',
      displayName: 'Bob Member',
      teamName: "Bob's Traitors",
      pickPosition: 1,
      joinedAt: 1,
    },
    {
      uid: 'u1',
      displayName: 'Ada Owner',
      teamName: "Ada's Faithful",
      pickPosition: 2,
      joinedAt: 1,
    },
  ],
  scoringRules: [
    {
      id: 'r1',
      type: 'binary' as const,
      name: 'Survives a banishment',
      points: 5,
      episodeNumbers: null,
    },
    { id: 'r2', type: 'binary' as const, name: 'Wins the final', points: 20, episodeNumbers: [10] },
  ],
}

function renderModal(seasons: Season[] = [lastSeason]) {
  const onCreated = vi.fn()
  render(
    <NewSeasonModal
      open
      onClose={() => {}}
      leagueId="league-1"
      seasons={seasons}
      leagueMembers={leagueMembers}
      onCreated={onCreated}
    />
  )
  return { onCreated }
}

async function fillInTheSeason(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/season label/i), 'The Traitors — Season 3')
  await user.type(screen.getByLabelText(/number of episodes/i), '8')
}

/** Answer one of the three questions. */
async function answer(
  user: ReturnType<typeof userEvent.setup>,
  question: RegExp,
  choice: 'Yes' | 'No'
) {
  const group = screen.getByRole('group', { name: question })
  await user.click(within(group).getByRole('radio', { name: choice }))
}

const participantsQuestion = /automatically add all of the participants/i
const rulesQuestion = /copy all of the same scoring rules/i
const settingsQuestion = /copy all of the draft configuration settings/i

beforeEach(() => {
  vi.clearAllMocks()
  readCarryOverSource.mockResolvedValue(lastSeasonData)
})

describe('NewSeasonModal without a season to copy', () => {
  it('asks nothing when the league has never played a season', async () => {
    renderModal([{ ...lastSeason, id: 'season-1', state: 'setup' }])
    expect(await screen.findByLabelText(/season label/i)).toBeInTheDocument()
    expect(screen.queryByText(participantsQuestion)).not.toBeInTheDocument()
    expect(readCarryOverSource).not.toHaveBeenCalled()
  })

  it('starts the season with the league as it stands, as it always did', async () => {
    const user = userEvent.setup()
    renderModal([])
    await fillInTheSeason(user)
    await user.click(screen.getByRole('button', { name: /create season/i }))

    await waitFor(() => expect(createSeason).toHaveBeenCalled())
    const input = createSeason.mock.calls[0][0]
    expect(input.members.map((m: { uid: string }) => m.uid)).toEqual(['u1', 'u2', 'u3'])
    expect(input.scoringRules).toEqual([])
    expect(input.draftSettings).toEqual({
      draftFormat: 'snake',
      pickOrderMethod: 'admin-set',
      timerSeconds: 60,
      timerExpiry: 'auto-pick',
    })
  })
})

describe('NewSeasonModal with a season to copy', () => {
  it('names the season it would copy from in every question', async () => {
    renderModal()
    for (const question of [participantsQuestion, rulesQuestion, settingsQuestion]) {
      const legend = await screen.findByText(question)
      expect(legend.textContent).toContain('The Traitors — Season 2')
    }
  })

  it('copies from the most recent played season, not the newest one', async () => {
    renderModal([
      lastSeason,
      {
        ...lastSeason,
        id: 'season-3',
        label: 'The Traitors — Season 3',
        state: 'setup',
        createdAt: 300,
      },
    ])
    await waitFor(() => expect(readCarryOverSource).toHaveBeenCalledWith('season-2'))
  })

  it('shows and hides last season’s participants', async () => {
    const user = userEvent.setup()
    renderModal()
    const toggle = await screen.findByRole('button', { name: 'Show participants' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    const hide = screen.getByRole('button', { name: 'Hide participants' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    // By name, so the list reads the same however Firestore returned it.
    const listed = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(listed.map((li) => li.textContent)).toEqual(['Ada Owner', 'Bob Member'])

    await user.click(hide)
    expect(screen.getByRole('button', { name: 'Show participants' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('shows last season’s scoring rules and draft settings behind their own toggles', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(await screen.findByRole('button', { name: 'Show scoring rules' }))
    expect(screen.getByText(/Survives a banishment/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Show draft settings' }))
    // The settings as they were, not the defaults a season is created with.
    expect(screen.getByText('Randomized')).toBeVisible()
    expect(screen.getByText('90 seconds')).toBeVisible()
    expect(screen.getByText('Skip their turn')).toBeVisible()
  })

  it('copies everything the admin said yes to', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(participantsQuestion)
    await fillInTheSeason(user)
    await answer(user, participantsQuestion, 'Yes')
    await answer(user, rulesQuestion, 'Yes')
    await answer(user, settingsQuestion, 'Yes')
    await user.click(screen.getByRole('button', { name: /create season/i }))

    await waitFor(() => expect(createSeason).toHaveBeenCalled())
    const input = createSeason.mock.calls[0][0]
    expect(input.label).toBe('The Traitors — Season 3')
    expect(input.members).toEqual([
      {
        uid: 'u2',
        displayName: 'Bob Member',
        teamName: "Bob's Traitors",
        pickPosition: null,
        joinedAt: expect.any(Number),
      },
      {
        uid: 'u1',
        displayName: 'Ada Owner',
        teamName: "Ada's Faithful",
        pickPosition: null,
        joinedAt: expect.any(Number),
      },
    ])
    // Episode 10 is beyond the eight this season runs, so the rule that named
    // it comes across scoring nowhere rather than scoring everywhere.
    expect(input.scoringRules).toEqual([
      { type: 'binary', name: 'Survives a banishment', points: 5, episodeNumbers: null },
      { type: 'binary', name: 'Wins the final', points: 20, episodeNumbers: [] },
    ])
    expect(input.draftSettings).toEqual({
      draftFormat: 'snake',
      pickOrderMethod: 'randomized',
      timerSeconds: 90,
      timerExpiry: 'skip',
    })
    expect(input.copiedFromSeasonId).toBe('season-2')
  })

  it('copies nothing the admin said no to, and starts with an empty roster', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(participantsQuestion)
    await fillInTheSeason(user)
    await answer(user, participantsQuestion, 'No')
    await answer(user, rulesQuestion, 'No')
    await answer(user, settingsQuestion, 'No')
    await user.click(screen.getByRole('button', { name: /create season/i }))

    await waitFor(() => expect(createSeason).toHaveBeenCalled())
    const input = createSeason.mock.calls[0][0]
    // Not the league's roster: the admin was asked, and said no.
    expect(input.members).toEqual([])
    expect(input.scoringRules).toEqual([])
    expect(input.draftSettings.timerSeconds).toBe(60)
    expect(input.copiedFromSeasonId).toBeUndefined()
  })

  it('answers the three questions independently', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(participantsQuestion)
    await fillInTheSeason(user)
    await answer(user, participantsQuestion, 'No')
    await answer(user, rulesQuestion, 'Yes')
    await answer(user, settingsQuestion, 'No')
    await user.click(screen.getByRole('button', { name: /create season/i }))

    await waitFor(() => expect(createSeason).toHaveBeenCalled())
    const input = createSeason.mock.calls[0][0]
    expect(input.members).toEqual([])
    expect(input.scoringRules).toHaveLength(2)
    expect(input.draftSettings.timerSeconds).toBe(60)
  })

  it('creates nothing while a question is unanswered', async () => {
    const user = userEvent.setup()
    renderModal()
    await screen.findByText(participantsQuestion)
    await fillInTheSeason(user)
    await answer(user, participantsQuestion, 'Yes')
    await user.click(screen.getByRole('button', { name: /create season/i }))

    expect(createSeason).not.toHaveBeenCalled()
  })

  it('falls back to the league roster when last season cannot be read', async () => {
    const user = userEvent.setup()
    readCarryOverSource.mockRejectedValue(new Error('permission-denied'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderModal()

    expect(await screen.findByText(/Couldn't read The Traitors — Season 2/)).toBeInTheDocument()
    expect(screen.queryByText(participantsQuestion)).not.toBeInTheDocument()

    await fillInTheSeason(user)
    await user.click(screen.getByRole('button', { name: /create season/i }))
    await waitFor(() => expect(createSeason).toHaveBeenCalled())
    expect(createSeason.mock.calls[0][0].members).toHaveLength(3)
  })
})
