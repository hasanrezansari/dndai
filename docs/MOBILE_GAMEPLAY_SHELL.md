# Mobile gameplay shell (layout roadmap)

This doc maps phased UI work for the in-session experience. It does **not** duplicate realtime rules — those live in [`SESSION_UI_VIEW_MODES_SPEC.md`](./SESSION_UI_VIEW_MODES_SPEC.md).

## Principles

- **Single pipeline:** `useSessionChannel` → Zustand. UI is selectors, layout, and sheets — not a second Pusher path.
- **Gameplay truth first:** Persistent strip shows who, turn, and vitals; narration and Chronicle stay secondary.
- **One heavy overlay:** Prefer only one of dice overlay, expanded quest, or target sheet at a time.

## Phase map

| Phase | Scope | Key artifacts |
| ----- | ----- | ------------- |
| **M1** | Presentation-only (no new API fields) | Compact `SceneHeader`, `QuestPill`, `DiceOverlay`, feed semantic chips (`FeedList`, `ChronicleFeed`), party avatar → `CharacterSheet` via `viewPlayerId`, `SceneDetailPanel` sheet |
| **M2** | Combat strip + NPCs in store | `NpcCombatantView`, `GET .../state`, hydrate / `state-update`, `CombatStrip`, `EnemyDetailSheet` |
| **M3** | Guided turn (optional) | Turn hint card, action prefill chips, `localStorage` `ashveil.guidedTurnUi`, optional target sheet (text prefill only) |
| **M4** | Later | Radial menus, grid map, heavy animation — deprioritized |

## Related code (M1)

- Session page: `src/app/session/[id]/page.tsx`
- Scene: `src/components/game/scene-header.tsx`, `src/components/game/scene-detail-sheet.tsx`
- Quest: `src/components/game/quest-pill.tsx`
- Dice: `src/components/dice/dice-overlay.tsx`
- Feed filters: `src/lib/feed/feed-semantic-filter.ts`, `src/components/feed/feed-semantic-chips.tsx`
- Party: `src/components/game/player-strip.tsx`, `src/components/sheets/character-sheet.tsx`

When adding M2+, extend [`SESSION_UI_VIEW_MODES_SPEC.md`](./SESSION_UI_VIEW_MODES_SPEC.md) only if view-mode contracts change.
