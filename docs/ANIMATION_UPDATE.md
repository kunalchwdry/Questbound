# Candlelit midnight theme correction

This supersedes the rejected moonlit-castle and green/parchment visual passes. UI-only: no database, authentication, progression, or reward changes.

## Reference and implementation

- Inspected the existing signup AuthShell, global theme tokens, and original `public/images/hero.jpg` before revising the visual layer.
- Community WorldShell now uses the exact signup `app-bg` and `data-theme="midnight"` tokens: midnight background, ivory text, candle-gold borders and actions.
- Guild Hall hero uses the same original photoreal glowing ledger/candle/gothic-window photograph. Desktop copy sits beside the scene; mobile stacks the art below the copy. Artwork remains visible with Magic off or reduced motion.
- Matched navigation, posts, search, filters, forms, guild banners, challenges, ranking boards, character sheets, and feedback states to those tokens. Existing layout and functionality retained.
- Removed the replacement castle/owl scene and its stylesheet. Original landing artwork remains unobscured.
- Replaced scene animation with breathing candlelight, soft window light and drifting gold embers. Kept bounded spell sparks, Cast a spell, scroll/heading entrances, button light sweeps, progress/reaction feedback, pointer card tilt and the level-up seal.
- Persistent Magic toggle, OS reduced-motion override, storage-restricted fallback and hidden-tab pause retained. Decoration does not capture input. No gameplay requests from spell casting.
- Canvas remains capped at 30fps, 28 desktop / 14 touch ambient motes, at most 120 transient sparks and three short-lived spell rings. Confirmed completion celebration remains after successful server response.

## Verification

- ESLint, TypeScript and production build: passed.
- 24 component/fixture browser checks: passed; zero automated WCAG A/AA violations on tested screens after finite entrance animations settle.
- Guild Hall, guild registry, challenges, rankings and character profile checked at 1440, 768 and 390px; no horizontal overflow. Refreshed screenshots in `docs/screenshots/`.
- Composer, discussion and guild-room interaction screenshots refreshed.
- Added assertions for original signup image served successfully, midnight theme, no replacement castle/owl, animated embers, artwork retained with Magic off, spell cooldown/no gameplay request, and pointer tilt cleanup.
- Live production-build anonymous signup/home: original image loads, no castle, no hydration/runtime errors, 390px overflow checks, spell interaction and persisted Magic toggle passed.
- Authenticated community screens were tested with mocked API fixtures, not live signed-in E2E. No user impersonation or auth bypass.

Workspace production preview restarted on port 3000 with the corrected build. No GitHub push or Vercel deployment performed.
