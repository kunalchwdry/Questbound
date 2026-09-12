# Flows — Questbound

Step-by-step user journeys and the request paths behind them. Diagrams use two tones: gold for user-facing / client steps, violet for server / database steps.

| Flow | Section |
| --- | --- |
| 1 | [First visit → signup → Guild Hall](#1-first-visit--signup--guild-hall) |
| 2 | [Sign in & session lifecycle](#2-sign-in--session-lifecycle) |
| 3 | [Posting a quest](#3-posting-a-quest) |
| 4 | [Sealing (completing) a quest](#4-sealing-completing-a-quest) |
| 5 | [Level-up](#5-level-up) |
| 6 | [Streak day-to-day](#6-streak-day-to-day) |
| 7 | [Daily Guild Contract & Weekly Boss](#7-daily-guild-contract--weekly-boss) |
| 8 | [Armory: buy, equip, use](#8-armory-buy-equip-use) |
| 9 | [Talking to the Oracle](#9-talking-to-the-oracle) |
| 10 | [Mood check-in](#10-mood-check-in) |
| 11 | [Candle focus timer](#11-candle-focus-timer) |
| 12 | [Client state & reconciliation](#12-client-state--reconciliation) |
| 13 | [Error, offline & edge-case handling](#13-error-offline--edge-case-handling) |
| 14 | [Navigation map](#14-navigation-map) |

---

## 1. First visit → signup → Guild Hall

```mermaid
flowchart TD
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  A["Landing page  /"]:::c --> B["Click 'Begin your legend'"]:::c --> C["Signup form  /signup"]:::c
  C --> D[Client-side Zod check<br/>name · email · password ≥ 8 · class]:::c
  D -- invalid --> C
  D -- valid --> E[POST /api/auth/signup<br/>+ browser time zone]:::s
  E --> F{Email free?}:::s
  F -- no --> G[409 → inline error]:::c
  F -- yes --> H[bcrypt hash · INSERT users<br/>gold = 50]:::s
  H --> I[INSERT 4 starter quests<br/>1 class-themed daily + 3 shared]:::s
  I --> J[Create session · set HttpOnly cookie]:::s
  J --> K[router.push /guild]:::c
  K --> L[SSR: getDashboard → HTML + skeleton]:::s
  L --> M[Guild Briefing overlay<br/>5 steps, skippable]:::c
  M --> N[PATCH /api/profile onboarded=true]:::s
  N --> O[Quest Board with starter quests]:::c
```

**Steps**
1. The landing page is server-rendered with SEO metadata and JSON-LD; the CTA changes to "Enter the Guild Hall" if a session already exists.
2. Signup validates with the same Zod schema on both client and server (`signupSchema`).
3. On success the server seeds starter quests (`starterQuestsFor(classKey)`) so the board is never empty.
4. `/guild` is a server component: it verifies the session against the DB, builds the dashboard, and streams it; `loading.tsx` shows a matching skeleton.
5. The Briefing shows until `onboarded_at` is set; it can be reopened later with `?` or the sheet button.

---

## 2. Sign in & session lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant P as proxy.ts
  participant S as Server
  participant DB as PostgreSQL

  B->>S: POST /api/auth/login {email, password, timezone}
  S->>DB: SELECT user by email
  S->>S: bcrypt.compare (constant-time)
  alt mismatch
    S-->>B: 401 "That email and password don't match our ledger."
  else match
    S->>DB: UPDATE timezone if changed
    S->>DB: INSERT sessions (sha256(token), expires +30d)
    S-->>B: Set-Cookie qb_session (HttpOnly, SameSite=Lax) · 200
  end
  B->>P: GET /guild
  P->>P: cookie present? (no DB)
  alt no cookie
    P-->>B: 307 → /login
  else cookie
    P->>S: pass through
    S->>DB: SELECT sessions JOIN users WHERE token_hash AND expires_at > now()
    alt invalid / expired
      S-->>B: redirect /login
    else valid
      S-->>B: render Guild Hall
    end
  end
  B->>S: POST /api/auth/logout
  S->>DB: DELETE session row
  S-->>B: clear cookie
```

Rate limiting: 12 login attempts per email+IP per 15 min; 10 signups per IP per 15 min (429 with friendly copy).

---

## 3. Posting a quest

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  A["Press N or '+ Post a quest'"]:::c --> B[Dialog opens<br/>focus → title]:::c
  B --> C[Choose attribute · difficulty · type<br/>live reward preview]:::c
  C --> D{Title non-empty<br/>after trim?}:::c
  D -- no --> E[Inline error · focus title]:::c
  D -- yes --> F[Optimistic insert<br/>temp id < 0]:::c
  F --> G[POST /api/quests]:::s
  G --> H{Zod valid?}:::s
  H -- no --> I[422 → rollback + toast]:::c
  H -- yes --> J[INSERT quests · return row]:::s
  J --> K[Swap temp id for real id]:::c
```

- The reward preview calls the same `computeReward` the server uses, with `critRoll = 1` (no crit) and the *next* streak value.
- While the temp id is negative the card's seal/edit/delete buttons are disabled to avoid acting on an unsaved row.
- Editing uses `PATCH /api/quests/:id` with a partial schema; deleting shows an inline "Abandon?" confirm, then `DELETE`.

---

## 4. Sealing (completing) a quest

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant C as Client (useGuild)
  participant S as Server (engine.completeQuest)
  participant DB as PostgreSQL

  U->>C: tap wax seal
  C->>C: guard: not done, id > 0, not pending
  C->>C: optimistic: +est XP/gold, streak, attribute, history row, float + sparkles
  C->>S: POST /api/quests/:id/complete
  S->>DB: BEGIN · SELECT user FOR UPDATE · SELECT quest FOR UPDATE
  S->>S: today = todayInTimeZone(user.timezone)
  S->>S: eligibility (once done? daily today? habit ≥ 5?)
  alt ineligible
    S->>DB: ROLLBACK
    S-->>C: 409 + message
    C->>C: restore snapshot · toast · refresh
  else eligible
    S->>S: advanceStreak (may consume shield)
    S->>S: computeReward (streak × affinity × elixir × crit roll)
    S->>S: levelFromXp before/after → levelUp?
    S->>DB: UPDATE users · UPDATE quests · INSERT completions · shield −1?
    S->>DB: COMMIT
    S->>DB: getDashboard
    S-->>C: { result, dashboard }
    C->>C: applyServer (if no other in-flight) · toasts (crit / streak / shield)
    C->>C: if levelUp → LevelUpOverlay
  end
```

Reward math (server): `xp = round(base.xp × streakMult × affinity × boost × critXp)`, `gold = round(base.gold × critGold)`. Level-up bonus gold is added in the same transaction.

---

## 5. Level-up

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633
  A[Server: after.level > before.level]:::s --> B[bonusGold = 25 × newLevel<br/>added in the same UPDATE]:::s
  B --> C[result.levelUp returned]:::s --> D[Client waits for server<br/>never optimistic]:::c
  D --> E[LevelUpOverlay<br/>role=dialog · focus on Continue · Esc closes]:::c
  E --> F[canvas-confetti dynamic import<br/>skipped if prefers-reduced-motion]:::c
  F --> G[Character ring + rank update<br/>via reconciled dashboard]:::c
```

---

## 6. Streak day-to-day

```mermaid
flowchart TD
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633
  A[Any completion today]:::c --> B{gap = today − last_active_date}:::s
  B -- 0 --> C[unchanged]:::s
  B -- 1 --> D[streak + 1]:::s
  B -- "2 and shield ≥ 1" --> E["streak + 1 · shield − 1<br/>toast: Streak Shield consumed"]:::s
  B -- otherwise --> F["streak = 1<br/>toast: A new streak begins"]:::s
  C & D & E & F --> G[longest_streak = max]:::s
  G --> H["multiplier = 1 + 0.02 × min(streak, 30)"]:::s
```

Display rule (`effectiveStreak`, read-only): if the last active day was neither today nor yesterday and no shield covers a two-day gap, the sheet shows **0** and "Complete any quest to light the flame." Nothing is mutated until the user acts.

---

## 7. Daily Guild Contract & Weekly Boss

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  subgraph Daily contract
    A[3 completions today<br/>count from ledger]:::s --> B[Claim button enabled]:::c --> C[POST /api/bounty/claim]:::s
    C --> D{last_bounty_claim = today?}:::s
    D -- yes --> E[409]:::s
    D -- no --> F[+50 gold +40 XP<br/>set last_bounty_claim]:::s
  end

  subgraph Weekly boss
    G[SUM xp since Monday]:::s --> H{≥ HP = 400 + 60·level−1?}:::s
    H -- no --> I[HP bar shows damage]:::c
    H -- yes --> J[Claim button]:::c --> K[POST /api/boss/claim]:::s
    K --> L{last_boss_claim_week = ISO week?}:::s
    L -- no --> M[+120 gold +100 XP<br/>set week key]:::s
  end
```

Both are claimed inside a locked transaction; both may trigger a level-up which flows through §5.

---

## 8. Armory: buy, equip, use

```mermaid
flowchart TD
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  A[Item card]:::c --> B{level ≥ min_level?}:::c
  B -- no --> B1[🔒 Level N chip]:::c
  B -- yes --> C{gold ≥ price?}:::c
  C -- no --> C1["'Need X more' disabled"]:::c
  C -- yes --> D[Optimistic: gold −, owned, auto-equip if first in category]:::c
  D --> E[POST /api/shop/purchase]:::s
  E --> F[Lock user · re-check level, gold, ownership, stack]:::s
  F -- fail --> G[402/403/409 → rollback + merchant toast]:::c
  F -- ok --> H[UPDATE gold · upsert inventory]:::s

  H --> I{category}:::c
  I -- title/theme/companion --> J[Equip toggles one-per-category<br/>theme switches data-theme instantly]:::c
  I -- consumable elixir --> K[Drink → boost_charges + 3]:::c
  I -- consumable shield --> L[Passive: auto-used by streak logic]:::c
  I -- badge --> M[Always displayed as crest]:::c
```

---

## 9. Talking to the Oracle

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant C as Sanctum (client)
  participant S as /api/companion
  participant M as emotion.ts (local model)
  participant L as LLM provider (optional)
  participant DB as PostgreSQL

  U->>C: type message · Enter
  C->>C: optimistic user bubble · "reading the ledger…" dots
  C->>S: POST {message}
  S->>S: rate limit 30 / 10 min
  S->>DB: getDashboard + last 12 turns
  S->>M: classifyEmotion + detectCrisis
  S->>S: gatherInsights (overdue, streak at risk, weakest attr)
  alt no AI key
    S->>M: fallbackReply(emotion) + localSuggestions
  else key configured
    S->>L: POST /chat/completions (system prompt + history + JSON format)
    L-->>S: JSON text
    S->>S: extract + Zod validate
    opt invalid once
      S->>L: repair turn
    end
    opt still invalid / timeout / 4xx
      S->>M: fallbackReply
    end
  end
  S->>S: crisis? prepend SAFETY_LINE
  S->>DB: INSERT user turn · INSERT oracle turn (emotion, suggestions, provider)
  S-->>C: { user, oracle{trace}, crisis }
  C->>C: render bubble · "Sensed: <emotion>" · suggestion cards · trace toggle
  U->>C: Accept suggestion
  C->>C: onCreate(questInput) → flow §3
```

---

## 10. Mood check-in

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633
  A[Pick 1–5 mood<br/>+ optional note]:::c --> B[POST /api/checkin]:::s
  B --> C{note > 3 chars?}:::s
  C -- yes --> D[classifyEmotion note]:::s --> E{confidence ≥ 0.35?}:::s
  E -- yes --> F[emotion = model label]:::s
  E -- no --> G[emotion = mood→label map]:::s
  C -- no --> G
  F & G --> H[INSERT checkins · fallbackReply]:::s --> I[Sensed card + recent-mood chips]:::c
```

---

## 11. Candle focus timer

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  A[Select open quest<br/>or none]:::c --> B[Pick 5 / 15 / 25 / 50 min]:::c --> C[Light the candle<br/>endTime = now + minutes]:::c
  C --> D[Conic ring fills<br/>500 ms tick, drift-free]:::c
  D --> E{remaining = 0?}:::c
  E -- snuffed early --> F[Stop, nothing sealed]:::c
  E -- yes --> G[onComplete questId → flow §4]:::c
```

The timer is client-side by design: the *completion* is still authorised by the server like any other seal.

---

## 12. Client state & reconciliation

```mermaid
flowchart TD
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  A[SSR initial dashboard]:::s --> B[useGuild store<br/>dataRef + inflight counter]:::c
  B --> C[Mutation: snapshot → optimistic setData → inflight++]:::c
  C --> D[API call]:::s
  D -- ok --> E{inflight ≤ 1?}:::c
  E -- yes --> F[applyServer dashboard]:::c
  E -- no --> G[ignore snapshot<br/>later response wins]:::c
  D -- error --> H[setData snapshot · toast · refresh]:::c
  F & G & H --> I[inflight−−]:::c
  J[visibilitychange · online · focus · 5-min interval]:::c --> K[refresh if inflight = 0]:::c
```

---

## 13. Error, offline & edge-case handling

| Situation | Behaviour |
| --- | --- |
| Empty / whitespace title | Client inline error; server 422 `"Give your quest a name"` |
| Double-tap seal | Button disabled while pending; server row lock + eligibility → 409 on the second |
| Daily already done | 409 `"Already done today — this daily returns at dawn."` |
| Habit > 5/day | 409 with cap message |
| Not enough gold | Client disables button with shortfall; server 402 if raced |
| Level-gated item | 🔒 chip; server 403 |
| Network drop | `navigator.onLine` banner; failed calls roll back with a toast; resync on `online` |
| Session expired | API 401 → client redirects to `/login`; page-level check also redirects |
| Stale cookie on `/login` | Page verifies against DB and renders normally (no loop) |
| LLM provider down / bad JSON | One repair attempt, then local-model fallback; trace shows why |
| Crisis language | Helpline line always prepended, regardless of provider |
| Day rollover mid-session | Refresh on focus recomputes `today` in the user's zone |
| Reduced motion | Confetti, sparks, shimmer and count-ups disabled |

---

## 14. Navigation map

```mermaid
flowchart LR
  classDef c fill:#f3ecd9,stroke:#8c6a1e,color:#241a05
  classDef s fill:#e8e4f5,stroke:#5b4b9a,color:#1e1633

  L["Landing  /"]:::c --> SU["/signup"]:::c
  L --> LI["/login"]:::c
  SU & LI --> G["/guild"]:::c
  G --> T1[Quest Board · key 1<br/>contract · boss · quests]:::c
  G --> T2[Sanctum · key 2<br/>Oracle · mood · candle]:::c
  G --> T3[Armory · key 3]:::c
  G --> T4[Chronicle · key 4<br/>heatmap · weekly XP · ledger]:::c
  G --> D1[Hero ledger dialog ✎]:::c
  G --> D2[Briefing · key ?]:::c
  G --> D3[New quest · key N]:::c
  NF["404 — left the map"]:::c --> L
```

Desktop shows a `role="tablist"`; mobile shows a fixed bottom navigation with the same four destinations.
