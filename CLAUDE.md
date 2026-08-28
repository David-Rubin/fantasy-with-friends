# Working notes for Claude

Durable context for this repo. Committed deliberately: Claude's sessions run in
ephemeral containers, so anything not in the repository is gone by the next one.

---

## Product model

### A league is one show

- A **league** is a group of friends playing **a single show**. The show is the
  league's identity, not an incidental detail of it.
- A **season** is one season **of that same show**.
- Seasons within a league do not change show. A group that wants to play a
  different show starts a different league.

The schema enforces this: `showName` lives on `LeagueDoc` and a season carries
only its `label` (`src/lib/types.ts`). Creating a league asks for the show;
creating a season does not. Leagues made before that move have no `showName`, so
reads tolerate it being absent — an owner sets it from the league's edit dialog.

### Dummy data must reflect that

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

---

## Where a rule belongs

Three places, in order of preference. Choosing the wrong one is the most
consequential mistake available in this codebase.

**1. A Firestore security rule** — the default. If a constraint can be expressed
in `firestore.rules`, it belongs there and the client can write directly. Most of
the join-request flow works this way: a requester writing their own pending
request and an owner writing their league's membership are both writes the rules
already authorise, so none of it needs a Cloud Function.

**2. A Cloud Function** — when a rule _cannot_ express the constraint. Rules
cannot query across a collection, read an unbounded set of documents, or compute
an aggregate. When the check needs one of those, the write path must be closed to
clients (`allow ...: if false`) and go through a callable instead. Precedents:

| Function             | Why a rule cannot do it                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `submitPick`         | Deriving whose turn it is means re-implementing snake order in a rule; detecting a finished draft needs an aggregate |
| `removeLeagueMember` | "Is this member in a season that is drafting or active?" is a query across `seasons` plus a read in each             |
| `listAllUsers`       | Keeps the `users` read rule own-document-only, so there is one audited path to anything wider                        |

A check left in the client when it belongs here is **advice, not a constraint** —
anyone with devtools ignores it.

**3. The client** — only for things that are genuinely UX, where the actor
already has the authority and the check protects them from their own slip. The
episode-count guard in `src/lib/seasonDetails.ts` is the example: admins can
already rewrite scores, so stopping them stranding a scored episode is a
courtesy, not a boundary. Say so in a comment when you do this.

**Derived state belongs to a trigger.** `LeagueDoc.memberCount` is recomputed by
`onLeagueMemberWritten` and is immutable to clients in the rules. A counter
maintained by the client drifts permanently the first time a write is
interrupted; recomputing is self-healing.

---

## Codebase conventions

### Pure logic stays free of Firebase

`src/lib/firebase.ts` builds a Firebase app at import time and throws without the
`VITE_FIREBASE_*` variables. Anything importing it — directly or transitively —
can only load where those exist. So decisions worth testing live in modules that
import nothing reaching it:

`src/lib/breadcrumbs.ts`, `src/lib/seasonDetails.ts`, `src/lib/draft.ts`,
`src/lib/scoring.ts`, `functions/src/membership.ts`, `functions/src/draft.ts`,
`functions/src/scoring.ts`.

The pattern is a pure module beside a thin writer: `seasonDetails.ts` decides,
`seasonApi.ts` writes. Keep it that way when adding logic worth asserting on.

### Every listener goes through `src/lib/listen.ts`

Use `listenDoc` / `listenQuery`, never a bare `onSnapshot`. Firestore discards
listener errors when no error callback is given, so a denied read shows up as a
panel that never fills — no exception, nothing in the console. That is how a
missing security rule once passed for a loading bug. Wrap async snapshot handlers
in `guarded` so a rejection inside one cannot leave a loading flag stuck on.

### Collection-group queries need a denormalised field

A nested `match /leagues/{id}/members/{uid}` rule does **not** authorise a
collection-group query — that needs a `match /{path=**}/members/{uid}` rule, and
such a rule can only be written against a _field_, since the path wildcard is
unbound during a list. Hence `uid` is copied onto every member and join-request
document. Removing that field silently breaks the dashboard's listeners.

`displayName` is denormalised for a different reason: `users/{uid}` is readable
only by its owner (it holds the email address), so a roster cannot look up names
and copies them at write time.

### Strings live in `src/i18n.json`

All user-facing text goes through `t()`. No inline copy in components.

### Audit consequential actions

Route them through `logAuditEvent` (`src/lib/audit.ts`). Membership decisions,
role changes, removals, score edits and proxy picks are all recorded.

---

## Working locally

### Running the app

`.env.local` is gitignored and must exist to point the app at the emulator:

```
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demo
VITE_FIREBASE_MEASUREMENT_ID=G-DEMO
VITE_USE_EMULATOR=true
VITE_TAB_SCOPED_AUTH=true
```

`VITE_TAB_SCOPED_AUTH` scopes a signed-in session to one tab instead of to the
whole browser, so several accounts can be driven side by side — which is what
makes testing a draft or a join request realistic. It is off unless set, so
production keeps Firebase's shared-across-tabs default until the same variable
is set in the hosting build config. Flipping it either way costs everyone
currently signed in one sign-out and nothing else; nothing persisted depends on
it. See `src/lib/authPersistence.ts`.

Then `npm run emulators` (builds the functions first, so the emulator can never
serve stale or missing function code) and `npm run dev`.

### Tests

`vite.config.ts` supplies dummy `VITE_FIREBASE_*` values to the test env and pins
`VITE_USE_EMULATOR` off — Vite loads `.env.local` in test mode too, so without
that pin a developer running the emulator would have tests behaving differently
from CI. **Mocks are for observing behaviour, not for getting a module to load.**
If a test mocks something only so it will import, the fix belongs in the config.

CI runs `lint`, `test` and `build` with **no `.env` at all**. A local `.env.local`
hides env-dependent breakage, so before claiming a change is green, run the
checks with that file moved aside.

### Verify in the browser before saying it works

Tests passing is not the same as the feature working. For anything user-facing,
drive it in the emulator with a real browser — sign up, click through, screenshot
— and check the data in Firestore afterwards. Several bugs in this repo's history
were invisible to unit tests and obvious on the first click.

---

## This container (Claude only)

- **`firebase-tools` is not a dependency.** Install it with `npm install --no-save
firebase-tools` when the emulator is needed.
- **The emulator must be started with the agent proxy unset**, or registering
  Firestore triggers fails with `Unable to parse JSON: ... "request bl"...`:
  `env -u https_proxy -u HTTPS_PROXY -u GLOBAL_AGENT_HTTPS_PROXY npm run emulators`.
  This is specific to Claude's sandbox — never put it in a committed script.
- **Chromium for Playwright** lives at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Do not run
  `playwright install`.
- **The user cannot reach these ports.** They run inside the container with no
  public ingress, so "the dev server is up" never means the user can open it.
  Offer screenshots, or the commands to run it themselves.
- **Pushes do not reach the user's checkout.** Being on the same branch name is
  not the same as having the commits; they need to `git pull`.
