# OpenTivi TV UX Improvement Plan (Android TV)

Status: Roadmap / Proposal

This document describes proposed UX changes for future TV iterations.

- it is not the source of truth for current interaction behavior
- current behavior is defined in [interaction-navigation-spec.md](/Volumes/ssd1/code/opentivi/docs/interaction-navigation-spec.md) and [tv-remote-interaction-guide.md](/Volumes/ssd1/code/opentivi/docs/tv-remote-interaction-guide.md)
- any proposal here becomes current behavior only after the canonical interaction spec is updated

This plan outlines the strategic updates required to elevate the OpenTivi Android TV application to a modern, high-quality big-screen experience.

---

## Phase 1: Navigation & Layout (The Foundation)

### 1.1 Side Navigation Implementation
- **Action**: Replace the current top-level `TabRow` with a collapsible **Side Navigation Rail**.
- **UX Goal**: Allow users to switch between Home, Channels, Favorites, and Settings without obscuring the content.
- **Detail**: The rail should expand when focused and collapse to icons when the user moves into the content area.

### 1.2 Home Screen Dashboard
- **Action**: Introduce a **Hero Section** at the top of the Home screen.
- **UX Goal**: Create an immersive "Content First" feel.
- **Detail**: Show the last-watched channel with a large background image/poster.

---

## Phase 2: Component & Interaction Refinement

### 2.1 Channel Card & Grid Update
- **Action**: Redesign `ChannelCard`.
- **UX Goal**: Remove visual clutter and optimize for D-Pad.
- **Change**: Remove the small "Star" (Favorite) button from the grid row.
- **Solution**: Implement **Long Press to Favorite** or a dedicated "Options" modal. Use `StandardCardLayout` from Compose TV for better title/subtitle handling.

### 2.2 Specialized Search Experience
- **Action**: Move the search bar to a dedicated **Search Screen**.
- **UX Goal**: Avoid keyboard pop-ups while navigating a list.
- **Detail**: Add a Search icon to the Side Nav. When clicked, open a screen optimized for TV text entry (large keys, voice search integration).
- **Spec impact**: This changes the current channels-page information architecture and must update the canonical interaction spec before it becomes compliant behavior.

---

## Phase 3: Visual Polish & Immersion

### 3.1 Dynamic Background System
- **Action**: Implement a background engine that blurs or changes color based on the selected item.
- **UX Goal**: Make the app feel "alive" and connected to the content.
- **Detail**: Use `Modifier.background` with animated colors or a blurred image container that updates when focus changes in the grid.
- **Constraint**: Keep motion and contrast aligned with the shared design guide; avoid heavy glow or decorative noise by default.

### 3.2 Typography & Spacing Audit
- **Action**: Align all screens to the **48px/27px safe-area baseline at 1080p** and 4px grid.
- **UX Goal**: Ensure consistent professional spacing.
- **Detail**: Increase font sizes for channel titles and metadata to match the 1.15x TV scale multiplier defined in the Design Guide.

---

## Phase 4: Feedback & Transitions

### 4.1 Focus Transitions
- **Action**: Add smooth `AnimateContentSize` or transition animations when moving between navigation and content.
- **UX Goal**: Provide high-end "Apple TV-like" feel.

### 4.2 Error & Loading States
- **Action**: Replace standard text error messages with TV-optimized empty states (large icons + clear action buttons).
