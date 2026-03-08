# Interaction Navigation Spec (Keyboard / Remote / TV)

Status: Draft  
Owner: Client Team  
Last Updated: 2026-03-08

## 1. Purpose

Define a cross-platform interaction contract for keyboard and remote control navigation, so Web, Desktop, and future native TV clients share the same behavior model.

This spec is **not tied to a UI framework**.  
It standardizes:

- input meaning (intent),
- focus movement rules,
- action semantics (play, favorite, back, etc.),
- and cross-zone linkage behavior.

---

## 2. Scope

In scope:

- Directional navigation (`Up/Down/Left/Right`)
- Confirm / Back / Secondary action
- Focus zone linkage (left navigation ↔ right content)
- List-centric interactions (channels, settings, sources)
- Overlay priority (modal/player/page)

Out of scope:

- Visual design system details
- Media playback engine internals
- Touch-gesture-only behavior

---

## 3. Core Design Principle

Do not abstract around physical keys.  
Abstract around **user intent** and **focus state transitions**.

Platform-specific key codes are mapped in adapters.  
Business logic consumes normalized intents only.

---

## 4. Layered Model

### 4.1 Input Intent Layer

Normalize raw input events into intents:

- `MoveUp`
- `MoveDown`
- `MoveLeft`
- `MoveRight`
- `Confirm`
- `Back`
- `SecondaryAction`
- `PlayPause` (optional)
- `PageUp` / `PageDown` (optional)
- `LongPressConfirm` (optional)
- `RepeatMove` (optional)

### 4.2 Focus Engine Layer

A platform-agnostic state machine that resolves:

- current `FocusZone`,
- current focused node in zone,
- next node on directional move,
- fallback rules if no candidate is found.

Runtime recommendation:

- Keep a single global dispatcher for directional/confirm/back intents.
- UI components should consume normalized events (and optionally mark them handled), not bind conflicting raw keyboard logic in multiple layers.

### 4.3 Action Semantics Layer

Bind intent + focused node to business action:

- `Confirm` on channel item => play
- `SecondaryAction` on channel item => favorite/unfavorite
- `Confirm` on settings item => open setting edit modal
- `Confirm` on source row => edit source
- `Confirm` on "Add Source" action => open source import modal

### 4.4 UI Binding Layer

Per-platform implementation detail:

- how focused node is highlighted,
- how node receives native focus,
- how to ensure focused node is visible (scroll into view),
- how hover-like feedback is rendered for TV UX.

---

## 5. Shared Data Model

## 5.1 FocusZone

- `NAV` (left menu)
- `CONTENT` (main panel list/grid/form)
- `OVERLAY` (modal/dialog)
- `PLAYER` (fullscreen/player controls)

Priority: `OVERLAY > PLAYER > CONTENT > NAV`

### 5.2 FocusNode

Required fields:

- `id: string`
- `zone: FocusZone`
- `type: navItem | listItem | formItem | actionButton | ...`
- `index?: number`
- `groupId?: string`
- `disabled?: boolean`
- `metadata?: Record<string, unknown>`

### 5.3 FocusScope

Defines a navigable collection:

- orientation (`vertical`, `horizontal`, `grid`)
- item order
- edge policy (`clamp`, `loop`, `jump-zone`)

---

## 6. Navigation Rules (Normative)

## 6.1 Zone Linkage

- `MoveRight` in `NAV` => switch to `CONTENT` and focus last active content node (or first focusable node).
- `MoveLeft` in `CONTENT` => first offer to active content handler; if not handled, switch back to `NAV`, preserve nav index.
- `Back` in `CONTENT` => go to `NAV` if no overlay/player interception.

### 6.2 Vertical List Behavior

For list-like views (Channels / Favorites / Recents / Settings / Sources):

- `MoveUp` => previous item
- `MoveDown` => next item
- default edge policy = `loop` (wrap at boundaries)
- explicit exceptions are allowed where UX needs top-level action entry (example: list first item `MoveUp` can return to search/add action)

### 6.3 Confirm Behavior

- Single `Confirm` on channel item => play
- Secondary action on channel item => favorite/unfavorite
- `Confirm` on settings item => open modal editor for that setting
- `Confirm` on source row => open edit
- `Confirm` on add-source button => open import modal

> TV recommendation: prefer `SecondaryAction` or `LongPressConfirm` for favorite; do not require double-click as the only path.

### 6.4 Overlay Interception

When overlay exists:

- directional and confirm intents are handled by overlay first,
- `Back` closes overlay first,
- focus is restored to previous node after close.

Critical overlays (destructive confirmation):

- dangerous actions (e.g. source deletion) MUST require explicit confirmation modal,
- confirmation modal MUST support keyboard navigation (`Left/Right` to switch action, `Confirm` to execute).

### 6.5 Text Input Mode Switching

For searchable TV pages:

- default state should stay navigation-priority,
- `Confirm` (or explicit edit action) enters text editing mode,
- `Back`/`Esc` exits text editing mode and returns to navigation mode,
- directional keys in navigation-priority inputs must continue to drive focus movement.

---

## 7. Intent Mapping (Example Defaults)

This table is an example baseline; each platform adapter can extend.

| Intent | Keyboard | TV Remote (Typical) |
|---|---|---|
| MoveUp | ArrowUp | D-Pad Up |
| MoveDown | ArrowDown | D-Pad Down |
| MoveLeft | ArrowLeft | D-Pad Left |
| MoveRight | ArrowRight | D-Pad Right |
| Confirm | Enter / Space | OK / Select |
| Back | Escape / Backspace | Back / Return |
| SecondaryAction | F / ContextMenu | Menu / Star (if available) |

---

## 8. Cross-Platform Behavioral Contract

Any client implementation is compliant only if:

1. A single visible focused node always exists in active zone.
2. Left/right zone linkage works predictably (`NAV` ↔ `CONTENT`).
3. Focus restoration works after overlay close.
4. All actionable nodes have visible focused state.
5. Core actions can be completed without mouse/touch.
6. Dangerous actions cannot execute without confirmation.

---

## 9. Accessibility and UX Notes

- Focus highlight must be high contrast and persistent.
- Avoid relying on hover-only semantics in TV mode.
- Avoid double-click-only critical actions.
- Key repeat should move focus smoothly with throttling/debounce guard.

---

## 10. Suggested Implementation Strategy

1. Keep this spec as source of truth.
2. Implement per-platform `InputAdapter` (raw key -> intent).
3. Implement per-platform `FocusBinder` (focus node -> native UI focus).
4. Keep business actions bound to normalized intents only.
5. Validate with shared behavior test cases (same scenarios, different platforms).

---

## 11. Acceptance Scenarios (Minimum)

1. From NAV item #2, `MoveRight` enters CONTENT and focuses content active item.
2. In channel list, `MoveDown x3` then `Confirm` plays the 4th item.
3. In content, `MoveLeft` is handled by content first; if unhandled, it returns to NAV.
4. In source page, `Confirm` on add button opens import modal; `Esc` closes and restores add button focus.
5. In source page, delete action opens confirmation dialog; confirm executes delete, cancel restores previous focus.
6. In settings list, `Confirm` opens modal editor; modal supports keyboard value changes and `Esc` close.
7. In channels page search, navigation mode and text edit mode can switch without losing directional navigation.

---

## 12. Versioning

Use semantic versioning for this contract:

- MAJOR: breaking navigation/intent changes
- MINOR: additive intents or optional behavior
- PATCH: clarifications without behavior change

Current: `v0.2.0-draft`
