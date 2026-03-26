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
| **M2** | Combat strip + NPCs in store | `NpcCombatantView` (`game-store`), `mapNpcRowToCombatantView`, `GET .../state` → `npcs[]`, `refetchPlayersFromState` + `hydrate` → `setNpcs`, `CombatStrip`, `EnemyDetailPanel` sheet |
| **M3** | Guided turn (optional) | `useGuidedTurnUi` (`localStorage` `ashveil.guidedTurnUi`), turn hint + four prefilling chips + “Choose target” `BottomSheet` in `ActionBar` (still one `POST` actions API) |
| **M4** | Later | Radial menus, grid map, heavy animation — deprioritized |

## Related code

**M1**

- Session page: `src/app/session/[id]/page.tsx`
- Scene: `src/components/game/scene-header.tsx`, `src/components/game/scene-detail-sheet.tsx`
- Quest: `src/components/game/quest-pill.tsx`
- Dice: `src/components/dice/dice-overlay.tsx`
- Feed filters: `src/lib/feed/feed-semantic-filter.ts`, `src/components/feed/feed-semantic-chips.tsx`
- Party inspect: `src/components/sheets/character-sheet.tsx` (`viewPlayerId`)

**M2–M3**

- NPC mapping: `src/lib/state/npc-combatant-mapper.ts`, `src/lib/state/game-store.ts` (`npcs`, `setNpcs`)
- State API: `src/app/api/sessions/[id]/state/route.ts`
- Realtime resync: `src/lib/socket/use-session-channel.ts` (`state-update` → `refetchPlayersFromState`)
- Combat UI: `src/components/game/combat-strip.tsx`, `src/components/game/enemy-detail-panel.tsx`
- Guided turn: `src/hooks/use-guided-turn-ui.ts`, `src/components/game/action-bar.tsx`

Legacy `player-strip.tsx` remains for reference; session shell uses `CombatStrip`.

When adding M2+, extend [`SESSION_UI_VIEW_MODES_SPEC.md`](./SESSION_UI_VIEW_MODES_SPEC.md) only if view-mode contracts change.
