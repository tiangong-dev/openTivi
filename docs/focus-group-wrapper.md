# Focus Group Wrapper

Status: Draft  
Owner: Client Team

## Purpose

Provide a reusable wrapper for directional navigation groups so pages stop re-implementing edge handling by hand.

This wrapper is the code-level realization of the `FocusScope` model in [interaction-navigation-spec.md](/Users/caoyunlong/code/opentivi/docs/interaction-navigation-spec.md).

## Contract

Implementation lives in:

- [focusScope.ts](/Users/caoyunlong/code/opentivi/apps/desktop/src/lib/focusScope.ts)

Primary APIs:

- `resolveLinearFocusScope(config)`
- `useLinearFocusGroup(config)`

`useLinearFocusGroup` is the default wrapper for React pages. It owns no DOM. It only resolves the next item inside a linear group and returns whether the group handled the intent.

## When To Use

Use a focus group when all of these are true:

- a set of items has a stable order
- the group should consume one directional axis itself
- edge behavior must be explicit
- parent navigation should only run after the child group declines the move

Typical cases:

- top action rows
- filter chip rows
- tab bars
- horizontal button groups
- modal action groups

Do not use it for:

- free-form spatial layouts that need geometry-based next-node lookup
- text input edit mode
- one-off buttons with no sibling navigation

## Edge Policies

- `stay`: consume the intent and keep focus on the current item
- `wrap`: consume the intent and jump to the opposite edge
- `bubble`: do not handle the intent; parent scope or outer zone decides

Recommended defaults:

- page-local horizontal groups: left edge `bubble`, right edge `stay`
- modal confirmation buttons: both edges `stay`
- cyclic lists: both edges `wrap`

## Nested Behavior

Focus groups are intentionally nestable.

Rule:

1. Child group receives the directional intent first.
2. If the move stays inside the child group, the child handles it.
3. If the move hits an edge configured as `bubble`, the child returns `handled: false`.
4. Parent group or outer zone may then process the same intent.

This gives the expected behavior:

- move inside the local row first
- only leave the row after crossing its configured edge

## React Usage

Example:

```ts
const topEntryGroup = useLinearFocusGroup({
  items: [FocusAnchor.FilterEntry, FocusAnchor.EpgEntry] as const,
  current: focusAnchor,
  setCurrent: setFocusAnchor,
  backwardIntent: TvIntent.MoveLeft,
  forwardIntent: TvIntent.MoveRight,
  backwardEdge: "bubble",
  forwardEdge: "stay",
});

const result = topEntryGroup.handleIntent(intent);
if (result.handled) {
  event.preventDefault();
  return;
}
```

Usage rules:

- keep group state outside the wrapper
- call `handleIntent(intent)` before parent-level fallback
- only let parent logic run when `handled` is `false`
- keep DOM focus binding separate from group resolution

## Current Adoption

Current first consumer:

- [ChannelsView.tsx](/Users/caoyunlong/code/opentivi/apps/desktop/src/features/channels/ChannelsView.tsx)

Used for:

- top-level entry row
- filter panel columns
- EPG panel regions

## Migration Guidance

When replacing hand-written directional logic:

1. Identify the local group and its ordered items.
2. Pick the directional axis the group owns.
3. Set explicit edge policies.
4. Let the group handle the move first.
5. Keep existing parent fallback logic only for bubbled moves.

Do not mix:

- local sibling movement
- outer zone switching
- business action dispatch

in the same branch unless there is no remaining wrapper boundary.
