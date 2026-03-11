# TV Remote Interaction Guide (v0.1)

## 1. Goal

Unify TV remote behavior around **intent** instead of physical keys, and keep implementation small:

- single input adapter for key-to-intent
- single confirm gesture parser for single/double/long press
- page-level action handlers consume normalized intent only

This follows KISS (small, direct flow) and Unix-style separation (adapter vs action).

---

## 2. Input Contract

### 2.1 Core intents

- `TvIntent.MoveUp` / `TvIntent.MoveDown` / `TvIntent.MoveLeft` / `TvIntent.MoveRight`
- `TvIntent.Confirm`
- `TvIntent.Back`
- `TvIntent.SecondaryAction`

### 2.2 Default key mapping

- `ArrowUp/Down/Left/Right` -> directional intents
- `Enter` / `Space` -> `Confirm`
- `Escape` / `Backspace` -> `Back`
- `F` -> `SecondaryAction`

### 2.3 Confirm gesture semantics

- `ConfirmGesture.Single` -> primary action
- `ConfirmGesture.Double` -> secondary action shortcut
- `ConfirmGesture.Long` -> secondary action fallback for TV usability

Implementation note: gesture parsing happens in `createConfirmPressHandler` and is independent from UI components.

## 2.4 Enum Contract

- `TvIntent` and `ConfirmGesture` are the source of truth for action semantics.
- UI modules must consume enum values, not scattered string literals.
- Documentation and tests should reference the same enum names.
- Focus groups can be nested. A child group handles movement first, and only bubbles to its parent when the move exceeds that group's configured edge.
- React pages should prefer the shared wrapper in [focus-group-wrapper.md](/Users/caoyunlong/code/opentivi/docs/focus-group-wrapper.md) instead of hand-written edge logic.

---

## 3. List Interaction Rules (Channels/Favorites/Recents)

- `MoveUp/MoveDown`: move focused row in loop.
- `Confirm Single`: play focused channel.
- `Confirm Double`: favorite/unfavorite focused channel.
- `Confirm Long`: favorite/unfavorite focused channel.
- `SecondaryAction`: favorite/unfavorite focused channel.

Rationale:

- keeps single confirm on the main path (play)
- no longer relies on double-click as the only favorite path

## 3.1 Channels Page Structure

- `channelSearchEntry`
- `filterEntry`
- `epgEntry`
- `channelList`

Rules:

- default entry lands on `channelList`
- `Up/Down` moves within this fixed order
- `ConfirmGesture.Single` on an entry opens its mode
- `Back` exits the active mode first; otherwise it returns to NAV
- text entry uses the user's own IME keyboard after entering edit mode via confirm

---

## 4. Player Interaction Rules

- `Back`: close channel panel first; if already closed, exit player.
- `MoveLeft`: open channel panel.
- `MoveRight`: toggle guide panel.
- `MoveUp/MoveDown`:
  - channel panel open -> move focused channel in loop
  - channel panel closed -> channel +/- switch
- `Confirm Single`:
  - channel panel open -> play focused channel and close panel
  - channel panel closed -> open channel panel
- `Confirm Double`: toggle guide panel
- `Confirm Long`: play/pause
- `SecondaryAction`: toggle fullscreen

---

## 5. Module Boundaries

- `src/lib/tvInput.ts`
  - key-to-intent mapping
  - confirm gesture parser
- `src/app/AppShell.tsx`
  - non-player global dispatcher
  - dispatches normalized events for content pages
- `src/features/channels/ChannelRowsWithGuide.tsx`
  - list-page action binding
- `src/features/player/VideoPlayer.tsx`
  - player-page action binding

No module mixes adapter logic and business action logic.

---

## 6. Regression Checklist

1. In channel list: move 3 rows down, single confirm plays row #4.
2. In channel list: double confirm toggles favorite state.
3. In channel list: long confirm toggles favorite state.
4. In channels page: move up from the first row to `epgEntry`, then to `filterEntry`, then to `channelSearchEntry`.
5. In channels page: confirm on search entry focuses a real input and text entry is handled by the system IME.
6. In channels page: filter panel can change source, group, and sort using only directional keys, confirm, and back.
7. In channels page: EPG panel can search, change state filter, open detail, and toggle reminder using only directional keys, confirm gestures, and back.
8. In player: left opens channel panel, single confirm plays focused channel.
9. In player: long confirm toggles play/pause.
10. In player: back closes panel first, back again exits player.
