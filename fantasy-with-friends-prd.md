# Product Requirements Document: Fantasy With Friends

**Version**: 1.0
**Date**: 2026-06-28
**Status**: Draft

---

## 1. Project Overview

### 1.1 App Name
Fantasy With Friends

### 1.2 Summary
Fantasy With Friends is a React web application that lets small groups of friends run fantasy-style draft leagues for reality TV shows and similar episodic competitions. The initial use case is The Great British Bake Off (GBBO): once a new season's contestants are announced, participants blind-draft a team, then earn points each week based on customizable scoring rules tied to episode outcomes.

The app is designed to be show-agnostic from day one. The data model, scoring engine, and draft system are all parameterized so the same app can be reused for any competition — Survivor, The Bachelor, Drag Race, etc. — without code changes.

### 1.3 Goals
1. Allow a league admin to set up a new season (show, contestants, scoring rules) in under 10 minutes.
2. Support a real-time blind snake draft so all participants pick simultaneously during a live session.
3. Display a live leaderboard that updates weekly as episode scores are entered.
4. Be extensible: new shows, draft formats, and scoring rule types can be added without rearchitecting core data or UI.

### 1.4 Target Users
- **Primary**: Small friend groups (3–20 people) who want a structured, competitive way to watch reality TV together.
- **MVP scope**: Invite-only leagues. A user creates a league and shares an invite link or code with friends. There is no public discovery.
- **Future scope**: Any user can sign up and create their own public or private leagues.

### 1.5 Tech Stack (Recommended)
- **Frontend**: React (existing scaffolding), React Router, TailwindCSS
- **Backend/Database**: Firebase (Firestore for data, Firebase Auth for authentication, Firestore `onSnapshot` for live draft sync)
- **Hosting**: Firebase Hosting or Vercel
- **Rationale**: Firebase's real-time sync capabilities make the live snake draft session straightforward to implement. The flexible Firestore document model accommodates per-season customization (different contestants, rules, and scoring per show). The free tier comfortably handles small friend groups.

### 1.6 Non-Goals (for MVP)
- Mobile native apps (responsive web only)
- Public league discovery or social features
- Automated score ingestion from external sources (scores are entered manually by an admin)

---

## 2. Existing Behavior

The existing codebase is a basic React scaffold with no implemented features. This document describes the full application to be built on top of that scaffold.

---

## 3. New Behavior & Features

### 3.1 League Management

**3.1.1 Create a League**
- Any authenticated user can create a league by providing a name and optional description.
- The creator is automatically assigned the Owner role.
- The Owner receives an invite link (and shareable code) to distribute to friends.

**3.1.2 Join a League**
- League membership is scoped to seasons, not the league itself. Being in a league does not automatically include you in any of its seasons.
- Users join a specific season via a season-level invite link or code distributed by an Admin.
- A user must have an account to be added to a season.

**3.1.3 Admin Roles**
- **Owner**: Full control — can create/delete seasons, manage members, grant/revoke Admin role.
- **Admin**: Can create/edit seasons, add contestants, define scoring rules, enter episode scores, and manage the draft. Cannot remove the Owner.
- **Member**: Read-only access to league data; participates in drafts.
- The Owner can promote any Member to Admin (and demote Admins back to Member).

---

### 3.2 Season Management

**3.2.1 Create a Season**
- Admins create a season within a league by specifying:
  - Show name (e.g. "The Great British Bake Off")
  - Season label (e.g. "Season 15 — 2026")
  - Number of episodes (can be updated later)
- A season exists in one of four states: `setup`, `draft`, `active`, `complete`.
- Season configuration (contestants, scoring rules, draft settings) can be saved at any point during `setup` without opening the draft. This allows Admins to prepare a season in advance and open the draft at a later date.

**3.2.2 Season Invites**
- Each season has its own invite link and 6-character code, independent of any league-level invite.
- When creating a new season, the Admin sees a checklist of all users who participated in any prior season within the same league. The Admin can select any subset to auto-send a season invite.
- The Admin can also generate and share the season invite link to add new players not previously in the league.
- A user who receives a season invite and does not yet have an account is directed through the sign-up flow first, then auto-joined to the season.

**3.2.3 Add Contestants**
- Admins add contestants to a season before the draft opens.
- Each contestant record includes: name, photo (URL or upload), and a free-text bio.
- Contestants can be added/edited while the season is in `setup` state.
- Once the draft begins, the contestant list is locked.

**3.2.4 Define Scoring Rules**
- Admins define a set of scoring rules per season. Three rule types are supported:

  | Rule Type       | Description                                               | Example                           |
  |-----------------|-----------------------------------------------------------|-----------------------------------|
  | Binary event    | A named yes/no outcome worth a fixed point value          | "Star Baker" = +3 pts             |
  | Numeric value   | Admin rates a contestant on a named scale each episode    | "Performance score" 1–5 = raw pts |
  | Bonus challenge | A named event awarding points to one contestant           | "Technical win" = +2 pts          |

- Rules can have positive or negative point values.
- **Bonus challenge scope**: Each bonus challenge rule has a configurable scope that determines when it applies:

  | Scope            | Description                                              | Example                                     |
  |------------------|----------------------------------------------------------|---------------------------------------------|
  | Per-episode      | Available to award every episode                         | "Technical win" each week                   |
  | Specific episode | Applies only to one or more designated episode numbers   | "Bread Week Star Baker" on episode 4 only   |
  | Season-level     | Awarded once for the entire season, not tied to an episode | "Series winner" = +10 pts at season end   |

- Season-level challenges are entered separately from the weekly episode scoring interface, in a dedicated "Season Awards" section.
- Rules are locked once the season moves to `active` (to preserve score integrity). Admins can unlock and re-edit with a confirmation dialog.

---

### 3.3 Live Snake Draft

**3.3.1 Opening the Draft**
- An Admin transitions the season from `setup` → `draft`.
- Draft settings are configured during season setup and can be saved before the draft is officially opened.
- Before opening, the Admin configures draft settings:

  **Pick order methodology** (default: Randomized):
  | Option       | Description                                                         |
  |--------------|---------------------------------------------------------------------|
  | Randomized   | App randomly assigns pick positions when the draft opens (default)  |
  | Admin-set    | Admin manually specifies the exact pick order before the draft      |

  *(Additional pick order methods — e.g. auction, weighted random — can be added in future iterations.)*

  **Timer expiry behavior** (what happens when a player's pick clock runs out):
  | Option       | Description                                                                    |
  |--------------|--------------------------------------------------------------------------------|
  | Auto-pick    | App automatically selects the first available contestant (default)             |
  | Admin picks  | Draft pauses and an Admin selects on the player's behalf                       |
  | Skip         | Player's turn is skipped. They receive no makeup picks. Their next opportunity is their natural next turn in the snake order. |

- All league members can see the draft lobby and their assigned pick position once the draft opens.

**3.3.2 Draft Session (Real-Time)**
- All participants must be present in the draft room for the draft to begin. Admin can override and start without all members present; absent members are subject to the configured timer-expiry behavior.
- The app displays:
  - Current picker (visible to all participants at all times) and a countdown timer
  - All contestants, ordered as follows at all times:
    1. **Available contestants** (not yet drafted) — shown first, fully interactive for the active picker
    2. **Drafted contestants** — shown at the end, greyed out and read-only; bio remains visible on hover/tap; owner name displayed on the card
  - Each player's team roster as it fills up
- When a player's turn comes, only they see active "Pick" buttons on available contestant cards.
- **Admin proxy picks**: At any point during the draft, an Admin can select on behalf of any member — useful when a friend phones in their pick separately. The Admin sees a "Pick for [Member]" option on any available contestant card during that member's turn.
- Picks propagate in real-time to all participants via Firestore `onSnapshot`.

**3.3.3 Team Naming**
- Each player can set a name for their team at any point before, during, or after the draft.
- Team name defaults to "[Player name]'s Team" if not set.
- Once the first episode's scores are submitted for a season, team names are locked and can no longer be changed.
- Team names are displayed throughout the app wherever a team is referenced (leaderboard, draft rosters, season detail).

**3.3.4 Draft Completion**
- When all contestants are drafted (or all picks are exhausted), the draft closes automatically.
- Any remaining undrafted contestants are placed on a **free-agent bench**.
- The season transitions to `active`.

**3.3.5 Free-Agent Bench**
- Admins can assign free-agent contestants to a player's team mid-season (e.g. if rules change or a player wants to pick up an unowned contestant).
- Free agents are visible to all members on the season page.

---

### 3.4 Weekly Episode Scoring

**3.4.1 Enter Episode Scores**
- After each episode airs, an Admin opens the scoring interface for that episode number.
- For each non-eliminated contestant, the Admin fills in values for each scoring rule scoped to that episode:
  - Binary events: checkbox per contestant.
  - Numeric values: number input per contestant.
  - Per-episode bonus challenges: dropdown to select which contestant earned it.
  - Specific-episode bonus challenges: shown only when the current episode number matches the rule's designated episode(s).
- Season-level bonus challenges are entered separately in the "Season Awards" section and are not part of the weekly episode flow.
- Once submitted, scores are locked. Admins can unlock and re-edit with a confirmation step.
- Once the first episode's scores are submitted, all team names in the season are permanently locked.

**3.4.2 Contestant Elimination**
- When entering scores, the Admin can mark a contestant as eliminated.
- Eliminated contestants are visually flagged (greyed out, badge) throughout the app.
- Eliminated contestants cannot receive points in any subsequent episode. They remain on their owner's team roster for display purposes.

**3.4.3 Score Calculation**
- The app automatically sums point contributions across all scoring rules for each contestant per episode.
- Team score = sum of all points earned by all contestants on that team across all episodes and season-level awards to date.

---

### 3.5 Leaderboard

- Available once the season is `active`.
- Top-level view: ranked list of teams (team name, total points, point delta since last episode).
- Drill-down (click/tap a team): reveals each contestant on the team, their status (active/eliminated), and a per-episode score breakdown.
- Leaderboard updates in real-time as episode scores are submitted.
- Historical snapshots per episode are preserved (Admin can view the leaderboard as it stood after any given episode).

---

### 3.6 Extensibility Hooks (MVP foundations)

- **Draft format**: The draft engine is implemented behind an interface; snake draft is the default. Other formats (randomized, async, auction) can be added as alternative implementations without changing core data structures.
- **Pick order methodology**: Stored as a typed enum on the season; new methods can be added without restructuring the draft session.
- **Scoring rule types**: New rule types and scopes can be added by extending the rule type enum and the score-calculation function.
- **Show type**: Seasons are not GBBO-specific; the show name and structure are fully parameterized.

---

## 4. User Flows & UX

### 4.1 Navigation Structure

```
/                          → Landing / marketing page (logged-out)
/login                     → Login
/signup                    → Sign up
/invite/:code              → Invite landing (redirects post-auth)
/dashboard                 → Home after login
/leagues/:leagueId         → League detail (members, seasons)
/leagues/:leagueId/seasons/:seasonId                        → Season detail
/leagues/:leagueId/seasons/:seasonId/draft                  → Draft room
/leagues/:leagueId/seasons/:seasonId/score/:episodeNumber   → Episode scoring (admin)
/leagues/:leagueId/seasons/:seasonId/awards                 → Season awards (admin)
```

### 4.2 Auth Flow

**Sign Up**
1. User lands on `/signup`, enters display name and email address. No password is required.
2. Firebase Auth creates the account and sends a unique 6-digit PIN to the provided email address.
3. The PIN is the user's permanent credential for future logins. It is communicated only via email and is not set by the user.
4. If a pending invite code exists in session storage (set when they hit `/invite/:code` before auth), they are auto-joined to that season after account creation.
5. Redirect to `/dashboard`.

*(Note: User-provided passwords may be supported in a future iteration. The PIN-only approach avoids storing user-chosen passwords that may be reused across services.)*

**Log In**
1. User enters email on `/login`.
2. A PIN input field (labeled **"PIN"**, not "Password") is shown.
3. User enters their 6-digit PIN.
4. On success, redirect to `/dashboard` (or the originally requested URL if they were redirected mid-flow).
5. Error state: incorrect PIN → "Incorrect PIN. Check your email or request a new one." with a "Resend PIN" link.
6. After 5 consecutive failed attempts, the account is locked for 15 minutes.

**Invite Link Flow**
1. User hits `/invite/:code`.
2. If not logged in: store invite code in session storage, redirect to `/signup` (or `/login` with a toggle).
3. After auth: app reads the stored code, joins the user to the season, clears session storage, redirects to that season's page.
4. If already logged in: join immediately and redirect to the season page.
5. Error states: invalid code → error page with "Check the link or ask for a new one"; already a member → confirmation message with redirect to season.

---

### 4.3 Dashboard

- If the user has one or more active seasons (state = `active` or `draft`), the most recently updated one is surfaced prominently at the top:
  - Show name, season label, current episode number, and the user's team name.
  - Current rank is intentionally not shown — users discover their rank by opening the season, preserving suspense after each new episode.
  - CTA button: "View Season" or "Join Draft" depending on season state.
- Below the featured season: a list of all leagues the user belongs to, each showing its name and most recent season status.
- Empty state (no leagues/seasons): prompt to create a league or enter an invite code.

---

### 4.4 League Setup Flow (Admin)

1. Admin clicks "Create League" from the dashboard.
2. Enters league name (required) and optional description.
3. League is created; Admin lands on the league detail page.
4. Admin copies and shares the invite link or 6-character code.
5. Admin clicks "New Season" to begin season setup.

---

### 4.5 Season Setup Flow (Admin)

1. Admin enters: show name, season label, episode count.
2. **Invite players**:
   - A checklist of all users from prior seasons in this league is shown. Admin selects any to auto-send a season invite.
   - Admin can also copy the season invite link to share externally.
3. Admin adds contestants (name + optional photo + bio). Minimum 2 required to proceed to draft.
4. Admin defines scoring rules (type, point value, scope). Minimum 1 required.
5. Admin configures draft settings:
   - Pick order methodology (Randomized default / Admin-set).
   - If Admin-set: a drag-to-reorder list of league members.
   - Timer duration per pick (default 60 seconds).
   - Timer expiry behavior (Auto-pick / Admin picks / Skip).
6. **Admin can save progress at any point** using a "Save Draft Setup" button. The season remains in `setup` state; no invite or draft is triggered yet.
7. When ready, Admin clicks "Open Draft" — season transitions to `draft` state and the draft lobby becomes visible to invited members.

---

### 4.6 Draft Room Flow

**Lobby (season state = `draft`, draft not yet started)**
- All members see the draft lobby: participant list with pick positions (if already assigned), draft settings summary, and a "Waiting for Admin to start" message.
- Admin sees a "Start Draft" button (enabled once at least 2 members are present, or always if Admin chooses to override).

**Active Draft**
- Layout (desktop): contestant list on the left, team rosters panel on the right, active picker + timer banner at the top.
- Layout (mobile): stacked — timer banner, then tabs to switch between "Contestants" and "Teams."
- **Active picker banner**: visible to all participants at all times. Displays "[Player name]'s pick" and the countdown timer.
- Contestant list ordering (maintained in real time):
  1. Available contestants — shown first. Active picker sees "Pick" buttons; all others see cards as non-interactive.
  2. Drafted contestants — shown at the end, greyed out, bio still accessible on hover/tap, owner name displayed on the card.
- Admin sees "Pick for [Member]" affordance on available cards during that member's turn.
- **Team naming**: Each player sees an editable team name field in their team roster panel at all times during the draft. Name defaults to "[Player name]'s Team."
- **Skip expiry**: When a player's timer expires and the behavior is set to "Skip," their turn is forfeited with no makeup picks. Their next pick opportunity is their natural next turn in the snake order.

**Draft Complete**
- Completion banner: "Draft complete! Your team is [team name]."
- Players can still edit their team name until first episode scores are submitted.
- Remaining undrafted contestants listed as free agents.
- CTA: "View Season" navigates to the season detail page.

---

### 4.7 Season Detail Page

- **Leaderboard tab** (default): ranked by team name with total points and delta since last episode. Clicking a team expands the drill-down: contestant list with per-episode score breakdown.
- **Roster tab**: all contestants with owner name, status (active/eliminated), and cumulative points.
- **Free Agents tab**: unowned contestants (Admin sees "Assign to team" action).
- **Episodes tab**: list of episodes with scoring status (scored / not yet scored). Admin sees "Score Episode" and "Unlock" actions.
- **Season Awards tab**: season-level bonus challenges, with "Award" action for Admin.

---

### 4.8 Episode Scoring Flow (Admin)

1. Admin navigates to an unscored episode and clicks "Score Episode."
2. A form lists each non-eliminated contestant as a row, with columns for each applicable scoring rule.
3. Admin fills in values (checkboxes for binary, number inputs for numeric, contestant dropdowns for bonus challenges).
4. Admin optionally marks one or more contestants as eliminated using a toggle in their row. A confirmation prompt appears: "Mark [name] as eliminated? They will not be eligible for future episode points."
5. Admin clicks "Submit Scores." A summary preview is shown before final confirmation.
6. On confirm: scores are saved, team totals recalculate, leaderboard updates in real time for all users.
7. To edit after submission: Admin clicks "Unlock Episode" on the Episodes tab, confirms the unlock, and the scoring form reopens.

---

### 4.9 Key Empty & Error States

| Scenario                           | Behavior                                                     |
|------------------------------------|--------------------------------------------------------------|
| No leagues yet                     | Dashboard shows empty state with "Create League" CTA         |
| Season in `setup` with no rules    | "Open Draft" is disabled with tooltip explanation            |
| Draft room — player disconnects    | Reconnects automatically; pick timer continues server-side   |
| Invite code not found              | Error page with "Check the link or ask for a new one"        |
| Episode already scored             | "Score Episode" replaced with "View Scores" + "Unlock"       |
| All contestants eliminated         | Season can still be marked `complete` manually by Admin      |

---

## 5. Styling & Visual Design

### 5.1 Design System

- **Framework**: TailwindCSS utility classes throughout. No separate CSS files unless unavoidable.
- **Component approach**: Small, reusable components (cards, badges, buttons, modals, form inputs) built with Tailwind. No third-party component library required, but Headless UI or Radix UI primitives may be used for accessibility-sensitive components (dropdowns, modals, tooltips).

---

### 5.2 Color Palette

The app uses a neutral base palette. Accent colors are customizable at the show, season, and team level and are used for highlights, headers, and branded UI elements within that context.

**Base palette (neutral):**
| Token                    | Value   | Usage                              |
|--------------------------|---------|------------------------------------|
| `color-bg`               | #F9FAFB | App background                     |
| `color-surface`          | #FFFFFF | Cards, panels                      |
| `color-border`           | #E5E7EB | Dividers, input borders            |
| `color-text-primary`     | #111827 | Body text, headings                |
| `color-text-secondary`   | #6B7280 | Labels, captions, secondary info   |
| `color-text-disabled`    | #9CA3AF | Disabled/eliminated state          |

**Semantic colors (fixed):**
| Token            | Value   | Usage                                      |
|------------------|---------|--------------------------------------------|
| `color-success`  | #16A34A | Scores submitted, confirmed actions        |
| `color-error`    | #DC2626 | Errors, destructive actions                |
| `color-warning`  | #D97706 | Timer low (< 10s), caution states          |
| `color-info`     | #2563EB | Informational banners                      |

**Custom accent colors (per entity):**
- **Show**, **Season**, and **Team** each have a user-selectable accent color.
- Accent color is chosen from a predefined palette of ~12 options (no free-form hex input in MVP — prevents accessibility and contrast issues).
- Accent colors are used for: entity header backgrounds, badges, leaderboard row highlights, draft pick indicators, and team name labels.
- The app ensures sufficient contrast between the accent color and white text using a fixed approved palette only.

---

### 5.3 Typography

- **Font**: System font stack (no custom font loading in MVP — fast and consistent across devices).
  `font-family: ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Scale** (Tailwind defaults):

  | Role            | Class                    |
  |-----------------|--------------------------|
  | Page heading    | `text-2xl font-bold`     |
  | Section heading | `text-lg font-semibold`  |
  | Body            | `text-sm` or `text-base` |
  | Caption/label   | `text-xs text-secondary` |

---

### 5.4 Spacing & Layout

- Base spacing unit: 4px (Tailwind default scale).
- Page max-width: `max-w-5xl` centered with horizontal padding.
- Cards use `rounded-xl shadow-sm border border-color-border`.
- Consistent inner padding on cards: `p-4` (mobile) / `p-6` (desktop).

---

### 5.5 Key Component Patterns

**Contestant Card (Draft Room)**
- Shows: photo thumbnail, name, bio (truncated to 2 lines; full bio on hover/tap via tooltip or expand).
- Available state: full color, "Pick" button visible to active picker.
- Drafted state: greyed out (`opacity-50`), owner name badge in accent color, bio still accessible, "Pick" button hidden.
- Eliminated state (season view): greyed out with an "Eliminated" badge.

**Timer Banner**
- Full-width banner at top of draft room.
- Displays current picker's name and avatar.
- Timer bar depletes visually left-to-right.
- Color shifts: neutral → `color-warning` at 10s remaining → `color-error` at 5s remaining.
- Timer state is always accompanied by a text label (e.g. "5s remaining") — color alone is never the sole indicator.

**Leaderboard Row**
- Team accent color shown as a left-border stripe on each row.
- Rank number, team name, player name, total points, episode delta (↑/↓).
- Expandable on click to show contestant breakdown.

---

### 5.6 Responsive Behavior

**Priority**: Desktop-primary. The app is designed for desktop and tablet first. Mobile receives a fully functional stacked layout. The draft room in particular benefits from a larger screen.

**Breakpoints (Tailwind defaults):**
| Breakpoint | Width   | Layout behavior                                                                                     |
|------------|---------|-----------------------------------------------------------------------------------------------------|
| Mobile     | < 768px | Single column, stacked. Draft room uses tab navigation between contestant list and team rosters.    |
| Tablet     | 768px+  | Two-column where applicable (e.g. draft room side panel).                                           |
| Desktop    | 1024px+ | Full layout with side panels, expanded leaderboard.                                                 |

**Responsive rules:**
- No horizontal scrolling on any screen size.
- All tap targets minimum 44×44px on mobile.
- Tables (leaderboard, scoring form) collapse to card-list format on mobile.
- Modals are full-screen drawers on mobile, centered overlays on desktop.
- The episode scoring form stacks contestant rows vertically on mobile (one contestant expanded at a time).

---

## 6. Accessibility

### 6.1 Target Standard
WCAG 2.1 AA as a guiding reference, applied pragmatically. The goal is a solid, non-embarrassing baseline — not a formal compliance audit.

### 6.2 Core Requirements

**Semantic HTML**
- Use appropriate HTML elements throughout: `<nav>`, `<main>`, `<section>`, `<button>`, `<form>`, `<label>`, etc.
- Never use `<div>` or `<span>` for interactive elements that should be `<button>` or `<a>`.

**Keyboard Navigation**
- All interactive elements (buttons, links, form inputs, dropdowns) must be reachable and operable via keyboard (Tab, Enter, Space, Escape).
- Focus order must follow visual reading order.
- Visible focus ring on all interactive elements (Tailwind's `ring` utilities; do not suppress outline without a replacement).
- The draft room pick action must be triggerable via keyboard.

**Color Contrast**
- Text on background: minimum 4.5:1 contrast ratio (AA).
- The predefined accent color palette (Section 5.2) is vetted to meet this ratio against both white text and the neutral background.
- Timer warning/error color shifts (Section 5.5) pair color with a text label — color is never the sole indicator.

**Forms & Inputs**
- All inputs have associated `<label>` elements (not just placeholder text).
- Error messages are associated with their input via `aria-describedby`.
- Required fields marked with `aria-required`.

**Images & Icons**
- Contestant photos have descriptive `alt` text (contestant name).
- Decorative icons have `aria-hidden="true"`.
- Icon-only buttons (e.g. close, edit) have an `aria-label`.

**Motion**
- Respect `prefers-reduced-motion` for any animations (timer bar, leaderboard transitions). Provide a no-animation fallback.

### 6.3 Out of Scope for MVP
- Screen reader optimization beyond semantic HTML (no formal NVDA/VoiceOver testing)
- Internationalisation or RTL layout support
- Formal WCAG audit or automated accessibility CI checks

---

## 7. Security

### 7.1 Authentication

- **Mechanism**: Email + 6-digit PIN. PINs are generated server-side, stored as a hashed value (never plaintext), and delivered to the user via email at account creation.
- **PIN expiry**: PINs do not expire. Users can request a new PIN at any time via a "Resend PIN" flow, which invalidates the previous PIN.
- **Brute-force protection**: After 5 consecutive failed login attempts for a given email, the account is locked for 15 minutes. The user is notified via the login UI. After the cooldown, attempts reset.
- **Session management**: Firebase Auth session tokens are used post-login. Sessions persist across browser restarts (standard Firebase behavior). No manual session expiry in MVP.
- **Future consideration**: User-provided passwords and/or OAuth (Google) sign-in may be added in a future iteration.

### 7.2 Authorization

- All Firestore reads and writes are protected by Firebase Security Rules — no data is publicly readable or writable.
- **League data**: Only league members (any role) can read league, season, and contestant data.
- **Season membership**: Only users who have been invited to and joined a specific season can read that season's data.
- **Write access**: Only Admins and Owners can create/edit seasons, contestants, scoring rules, and episode scores. Members are read-only.
- **Role elevation**: Only the Owner can promote/demote Admin roles. Admins cannot modify other Admins' roles or the Owner's role.
- **Draft actions**: Picks are validated server-side (via Firestore rules or Cloud Functions) — a member cannot submit a pick out of turn or for a contestant already drafted.

### 7.3 Data Sensitivity

- **User data stored**: Display name, email address, hashed PIN. No payment data, location data, or sensitive personal information.
- Email addresses are not exposed to other league members in the UI — only display names are shown.
- Contestant data (names, bios, photos) is non-sensitive user-entered content.

### 7.4 Input Handling

- All user-generated text inputs (team names, contestant bios, league names, season labels) are sanitized before storage to prevent XSS.
- Photo uploads (contestant images) are restricted to image MIME types and capped at 2MB. Files are stored in Firebase Storage. *(TBD: URL input vs. upload only — if URL input is allowed, URLs must be validated and content must not be rendered as HTML.)*
- Invite codes are validated server-side before granting access.

### 7.5 Threat Surface Notes

- **Invite code guessing**: 6-character alphanumeric codes provide ~2.2B combinations. Rate-limit invite code validation attempts (5 attempts per IP per hour) to prevent enumeration.
- **Admin impersonation during draft**: Proxy pick actions (Admin picking on behalf of a member) are logged with the acting Admin's user ID for auditability.
- **Low overall sensitivity**: This is a private, invite-only app for friends with no financial or health data. Security posture is proportionate to that risk level.

---

## 8. Extensibility

### 8.1 Philosophy
Fantasy With Friends is built show-agnostic from day one. No GBBO-specific logic exists in the core data model, scoring engine, or draft system. New shows, rule formats, and draft mechanics can be added by extending defined interfaces rather than modifying core logic.

### 8.2 Draft Format
- The draft engine is implemented behind a `DraftStrategy` interface.
- Snake draft is the default implementation.
- New formats (randomized auto-draft, async picks, auction draft) are added as new strategy implementations without touching the draft room UI or data model.
- The `draftFormat` field on a season document is a typed enum; adding a new format requires adding an enum value and a corresponding strategy class.

### 8.3 Pick Order Methodology
- Pick order is resolved by a `PickOrderStrategy` interface called before the draft opens.
- Current implementations: `randomized` and `admin-set`.
- New methodologies (weighted random, previous-season-performance-based, etc.) are added as new implementations with no changes to the draft session logic.

### 8.4 Scoring Rule Types
- Scoring rules are evaluated by a `RuleEvaluator` per rule type.
- Current types: `binary`, `numeric`, `bonus_challenge`.
- New rule types (e.g. team-level bonuses, multi-contestant events) are added by defining a new type enum value, a corresponding evaluator, and a form component for the scoring UI.
- The score calculation pipeline iterates over all rules for a season and delegates to the appropriate evaluator — no changes needed to the pipeline itself when adding a type.

### 8.5 Bonus Challenge Scope
- Challenge scope (`per_episode`, `specific_episodes`, `season_level`) is a first-class field on every bonus challenge rule.
- New scope types can be added (e.g. `per_round`, `finale_only`) by extending the scope enum and updating the scoring UI filter logic.

### 8.6 Show / Season Configuration
- Shows and seasons are fully parameterized. There is no hardcoded reference to any specific show in the codebase.
- The accent color system (Section 5.2) allows each show and season to have its own visual identity without code changes.
- Future consideration: a "show template" feature could allow admins to save and reuse contestant structures and scoring rules across seasons of the same show.

### 8.7 Auth Methods
- The auth layer is abstracted so additional methods (user-provided passwords, OAuth providers) can be added alongside PIN auth without replacing it.

### 8.8 What Is Not Extensible in MVP
- The database schema is Firebase/Firestore-specific. Migrating to a different backend would require a data layer rewrite.
- The real-time draft sync is tightly coupled to Firestore `onSnapshot`. Swapping to WebSockets or another real-time provider is non-trivial.
- No public API or webhook system — all interactions are through the UI.

---

## 9. Compliance

### 9.1 Regulatory Requirements
Fantasy With Friends has no formal regulatory obligations in MVP:
- No payment processing (no PCI DSS scope)
- No health data (no HIPAA scope)
- No formal enterprise customers (no SOC 2 requirement)

### 9.2 GDPR / CCPA
The app stores user email addresses and display names, which qualify as personal data under GDPR and CCPA. Given the private, invite-only nature of the MVP, formal compliance programs are out of scope. However, the following baseline practices apply:
- Users can request deletion of their account and associated data. In MVP, this is handled manually by the Owner upon request (no self-serve delete UI).
- No user data is sold or shared with third parties.
- Firebase's data processing terms cover the infrastructure layer.

### 9.3 Future Consideration
If the app opens to the public (Section 3.1 future scope), a privacy policy, terms of service, and self-serve account deletion flow should be added before launch.

---

## 10. Auditing

### 10.1 What Gets Logged
The following actions are recorded with a timestamp and the acting user's ID:

| Action                           | Logged fields                                       |
|----------------------------------|-----------------------------------------------------|
| User login                       | User ID, timestamp, IP address                      |
| Episode scores submitted         | Season ID, episode number, admin user ID            |
| Episode scores unlocked/edited   | Season ID, episode number, admin user ID            |
| Contestant marked eliminated     | Season ID, contestant ID, episode number, admin ID  |
| Draft pick made                  | Season ID, picker user ID, contestant ID, round     |
| Admin proxy pick                 | Season ID, acting admin ID, target member ID, pick  |
| Season Awards submitted/edited   | Season ID, admin user ID                            |
| Admin role granted/revoked       | League ID, granting user ID, target user ID         |
| Free agent assigned to team      | Season ID, admin user ID, contestant ID, team ID    |
| Team renamed                     | Season ID, user ID, old name, new name              |

### 10.2 Storage
- Audit logs are stored as a subcollection in Firestore (`/auditLogs`), append-only.
- Logs are not editable or deletable by any user role including Owner.

### 10.3 Visibility
- In MVP, audit logs are not exposed in the UI. They exist for post-hoc debugging and dispute resolution (e.g. "who changed that score?").
- Future consideration: an Admin-visible audit log panel.

---

## 11. User Analytics

### 11.1 Approach
Lightweight and pragmatic for MVP. The goal is basic visibility into usage — not a full funnel instrumentation suite.

### 11.2 Tool
- **Google Analytics 4** (free, integrates cleanly with Firebase).
- Alternatively, a simple custom event log to Firestore if GA4 feels like overkill. TBD by developer preference.

### 11.3 Events to Track

| Event name               | Trigger                                       | Key properties                 |
|--------------------------|-----------------------------------------------|--------------------------------|
| `sign_up`                | New account created                           | —                              |
| `league_created`         | Admin creates a league                        | —                              |
| `season_created`         | Admin creates a season                        | show_name                      |
| `draft_started`          | Admin opens a draft                           | season_id, player_count        |
| `draft_pick_made`        | Any pick submitted                            | round, pick_number             |
| `draft_completed`        | Draft closes                                  | season_id, total_picks         |
| `episode_scored`         | Admin submits episode scores                  | season_id, episode_number      |
| `leaderboard_viewed`     | User opens leaderboard tab                    | season_id                      |
| `team_drilldown_opened`  | User expands a team on the leaderboard        | —                              |

### 11.4 What's Not Tracked
- No individual user behavior tracking beyond the events above.
- No heatmaps, session recordings, or personally identifiable event properties.

---

## 12. Non-Functional Requirements

### 12.1 Performance
- **Page load**: Initial app load under 3 seconds on a standard broadband connection. Code splitting per route to avoid loading unused bundles.
- **Draft room latency**: Pick updates must propagate to all participants within 500ms under normal network conditions. Firebase Firestore `onSnapshot` is the mechanism; no additional optimization required for MVP scale.
- **Leaderboard recalculation**: Score totals update within 2 seconds of an admin submitting episode scores.

### 12.2 Scalability
- MVP target: up to 50 concurrent users across all leagues. Firebase free tier (Spark plan) supports this comfortably.
- No horizontal scaling, caching layer, or CDN configuration required for MVP beyond Firebase Hosting defaults.
- Data model should avoid patterns that degrade at scale (e.g. unbounded arrays in Firestore documents) so scaling up later doesn't require a schema migration.

### 12.3 Availability
- No formal uptime SLA. Firebase Hosting and Firestore inherit Google's infrastructure reliability (~99.9% historically).
- No on-call or incident response process for MVP.

### 12.4 Observability
- Firebase Crashlytics (or equivalent) enabled for frontend error tracking.
- Firebase Performance Monitoring enabled for basic latency visibility.
- No custom dashboards or alerting in MVP.

### 12.5 Browser Support
- Modern evergreen browsers: Chrome, Firefox, Safari, Edge (latest 2 versions).
- No IE11 or legacy browser support.
- iOS Safari and Android Chrome supported (mobile responsiveness per Section 5.6).

### 12.6 Data Integrity
- Firestore Security Rules enforce all write constraints server-side — client-side validation is a UX convenience only, not a security boundary.
- Draft picks, episode scores, and audit logs are append-only where possible to prevent accidental data loss.
- No automated backups in MVP. Firestore's built-in redundancy is sufficient at this scale.

### 12.7 Testing
- **Unit tests**: Required for all scoring logic (rule evaluators, score calculation pipeline, pick order strategies).
- **End-to-end tests**: A baseline E2E suite using **Playwright** covering the core happy paths:
  - Sign up and join a league via invite link
  - Season setup (contestants + scoring rules + draft config)
  - Full draft session (picks, proxy pick, timer expiry)
  - Episode scoring and leaderboard update
  - Season award submission
- E2E tests run against a Firebase emulator suite (not production data).
- Full coverage is not the goal — critical paths only.

### 12.8 Internationalisation (i18n)
- All hardcoded UI text (labels, buttons, error messages, empty states, confirmations) is defined in a single `i18n.json` file rather than inline in components.
- The app ships English only in MVP. The JSON file structure should support future language additions (keyed by string ID, not language code at the top level — exact format TBD with developer).
- No locale-specific formatting (dates, numbers) required in MVP beyond what browsers handle natively.

---

## 13. Out of Scope

The following are explicitly excluded from the MVP to prevent scope creep. Items marked "future consideration" are candidates for later iterations.

### 13.1 Features
- **Public league discovery**: No browse/search for public leagues. Invite-only only. *(Future)*
- **Native mobile apps**: Responsive web only. No iOS or Android app. *(Future)*
- **Automated score ingestion**: No scraping, API integration, or data feeds from external sources. All scores are entered manually by an Admin.
- **User-provided passwords**: PIN-only auth in MVP. *(Future)*
- **OAuth / social login**: No Google, Apple, or Facebook sign-in. *(Future)*
- **Self-serve account deletion**: Account deletion handled manually by Owner on request. *(Future)*
- **Show templates**: No ability to save and reuse contestant structures or scoring rules across seasons. *(Future)*
- **In-app notifications**: No push notifications, email digests, or alerts when episodes are scored or draft turns begin. *(Future)*
- **Chat or comments**: No in-app messaging or reaction features.
- **Admin audit log UI**: Logs exist in Firestore but are not surfaced in the app. *(Future)*
- **Free-agent waiver system**: Free agents are assigned directly by an Admin with no bidding or priority order mechanic. *(Future)*
- **Team trades**: Players cannot trade contestants with each other.
- **Public API or webhooks**: All interactions are through the UI only.
- **Multi-language support**: App ships English only. *(Future)*
- **Locale-specific date/number formatting**: Browser defaults only. *(Future)*

### 13.2 Technical
- Custom backend server (Node/Express or otherwise) — Firebase only.
- Automated accessibility auditing in CI.
- Internationalisation beyond a single `i18n.json` English file.
- Offline mode or service worker caching.