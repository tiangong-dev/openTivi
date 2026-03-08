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

- `MoveUp` / `MoveDown` / `MoveLeft` / `MoveRight`
- `Confirm`
- `Back`
- `SecondaryAction`

### 2.2 Default key mapping

- `ArrowUp/Down/Left/Right` -> directional intents
- `Enter` / `Space` -> `Confirm`
- `Escape` / `Backspace` -> `Back`
- `F` -> `SecondaryAction`

### 2.3 Confirm gesture semantics

- `Confirm Single` -> primary action
- `Confirm Double` -> secondary action shortcut
- `Confirm Long` -> secondary action fallback for TV usability

Implementation note: gesture parsing happens in `createConfirmPressHandler` and is independent from UI components.

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
4. In player: left opens channel panel, single confirm plays focused channel.
5. In player: long confirm toggles play/pause.
6. In player: back closes panel first, back again exits player.
