# Working notes for Claude

Durable context for this repo. Committed deliberately: Claude's sessions run in
ephemeral containers, so anything not in the repository is gone by the next one.

## A league is one show

- A **league** is a group of friends playing **a single show**. The show is the
  league's identity, not an incidental detail of it.
- A **season** is one season **of that same show**.
- Seasons within a league do not change show. A group that wants to play a
  different show starts a different league.

The schema enforces this: `showName` lives on `LeagueDoc` and a season carries
only its `label` (`src/lib/types.ts`). Creating a league asks for the show;
creating a season does not. Leagues made before that move have no `showName`, so
reads tolerate it being absent — an owner sets it from the league's edit dialog.

## Dummy data must reflect that

Test data gets read by a human following along in the browser, so it has to be
recognisable at a glance. Keep the show consistent within a league, and make the
league name say which show it is.

Good:

| League                         | Seasons                                          |
| ------------------------------ | ------------------------------------------------ |
| Traitors — Thursday Night Crew | The Traitors — Season 2, The Traitors — Season 3 |
| Survivor Superfans             | Survivor — Season 49, Survivor — Season 50       |

Wrong — a generic league name with unrelated shows under it, which is what makes
a screenshot impossible to read:

| League       | Seasons                   |
| ------------ | ------------------------- |
| Bravo League | Survivor, Big Brother     |
| Delta League | The Traitors, Love Island |

Naming people is free-form, but keep it obvious who is who — `Ada Owner`,
`Bob Member`, `Mia Requester` read better in a screenshot than three plain names.
