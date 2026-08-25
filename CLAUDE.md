# Working notes for Claude

Durable context for this repo. Committed deliberately: Claude's sessions run in
ephemeral containers, so anything not in the repository is gone by the next one.

## A league is one show

- A **league** is a group of friends playing **a single show**. The show is the
  league's identity, not an incidental detail of it.
- A **season** is one season **of that same show**.
- Seasons within a league do not change show. A group that wants to play a
  different show starts a different league.

This is the intended product model. Note that nothing enforces it yet:
`SeasonDoc.showName` is stored per season (`src/lib/types.ts`), so two seasons of
one league can currently name different shows. Treat that as a gap, not as
permission — do not design around leagues being show-agnostic.

## Dummy data must reflect that

Test data gets read by a human following along in the browser, so it has to be
recognisable at a glance. Keep the show consistent within a league, and make the
league name say which show it is.

Good:

| League | Seasons |
| --- | --- |
| Traitors — Thursday Night Crew | The Traitors — Season 2, The Traitors — Season 3 |
| Survivor Superfans | Survivor — Season 49, Survivor — Season 50 |

Wrong — a generic league name with unrelated shows under it, which is what makes
a screenshot impossible to read:

| League | Seasons |
| --- | --- |
| Bravo League | Survivor, Big Brother |
| Delta League | The Traitors, Love Island |

Naming people is free-form, but keep it obvious who is who — `Ada Owner`,
`Bob Member`, `Mia Requester` read better in a screenshot than three plain names.
