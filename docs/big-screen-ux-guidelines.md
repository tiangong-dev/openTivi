# Big Screen UX Principles & Guidelines

This document outlines the core principles for designing high-quality experiences for television and other big-screen devices.

---

## 1. The 10-Foot Philosophy

Users interact with TVs from a distance (typically 3 meters or 10 feet). This environment dictates specific constraints:

- **Visibility Over Density**: Prioritize large elements and clear typography over packing the screen with information.
- **Cognitive Load**: Users are often in a "lean-back" relaxed state. UI should be intuitive and require minimal thinking.
- **No Mouse/Touch**: Interaction is strictly via D-Pad (Up, Down, Left, Right, Select, Back).

## 2. D-Pad & Focus Mechanics

Focus is the "cursor" of the TV. If the user doesn't know where the focus is, the app is broken.

### 2.1 Focus Visibility
- **Scale**: Focused items should scale up slightly (1.05x to 1.1x).
- **Ring First**: Use a high-contrast ring or border as the primary focus signal.
- **Shadow Sparingly**: Add only subtle elevation when needed; avoid decorative glow as the default focus treatment.

### 2.2 Navigation Paths
- **Predictability**: Focus should move in a logical direction. Avoid diagonal or non-standard paths.
- **Focus Memory**: When returning to a screen, restore focus to the last selected item.
- **Edges**: Clearly define what happens when a user hits the edge of a list (Looping vs. Bumping).

## 3. Layout & Visual Design

### 3.1 Content-First / Immersive
- **Hero Sections**: Use large, high-quality imagery for featured content on the landing page.
- **Dynamic Backgrounds**: Let the application background reflect the focused content (e.g., blurred posters or thematic colors).
- **Safe Areas**: Use a fixed safe-area baseline of 48px horizontal and 27px vertical at 1080p, then scale proportionally for other resolutions.

### 3.2 Typography
- **Minimum Size**: Never go below 14sp; 16-18sp is preferred for body text.
- **Weights**: Use Bold or Semi-Bold for headings to ensure legibility from a distance.
- **Line Height**: Use generous line spacing (1.4x+) for readability.

## 4. Navigation Architecture

### 4.1 Side Navigation (Preferred)
Modern TV apps favor collapsible side navigation (Navigation Rail). It provides:
- Quick access to top-level sections.
- More vertical space for content grids.
- A consistent "Anchor" for the user.

### 4.2 Interaction Hierarchy
- **Primary Action**: Single click (Select) should perform the most common action (e.g., Play).
- **Secondary Actions**: Use Long-Press or a dedicated Menu button for secondary actions (e.g., Favorite, Info, Delete).
- **Back Button**: Should consistently navigate up the hierarchy (Detail -> List -> Nav -> Exit).

## 5. Performance & Snappiness
- **Zero Lag**: D-Pad navigation must feel instantaneous.
- **Smooth Scrolling**: Content grids should scroll smoothly without stuttering.
- **Loading States**: Use skeleton screens or subtle animations instead of blocking the UI during data fetches.
