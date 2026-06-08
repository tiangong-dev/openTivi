# OpenTivi Design Guide

> A portable, opinionated design foundation for clean, minimal, multi-platform apps.  
> Inspired by Apple HIG, shadcn/ui, and Vercel's design language.  
> Can be reused as a starting point for any future project.

---

## 1 — Design Philosophy

**Minimal, content-forward, quietly confident.**

- **Content is king.** UI chrome fades; content stays.
- **Every pixel earns its place.** If it doesn't serve a purpose, remove it.
- **Soft contrast, not harsh.** Even dark mode is warm — `hsl(240, 10%, 4%)`, not `#000`.
- **Color as signal.** Neutral by default; color appears only to communicate meaning.
- **Consistency over cleverness.** One spacing system. One type scale. One icon style.

---

## 2 — Color System

### 2.1 — HSL, Not Hex

All colors are defined in **HSL** (Hue, Saturation, Lightness). HSL maps closer to human perception — you can reason about lightness independently of hue. When you need a slightly muted variant, drop saturation. When you need a darker card on a dark canvas, drop lightness by 6%.

```
hsl(hue, saturation%, lightness%)
```

### 2.2 — The Semantic Pair Convention

Every color role has a **background** and a **foreground** (text on it):

```
--primary:            hsl(221, 83%, 53%)
--primary-foreground: hsl(210, 40%, 98%)
```

This guarantees contrast. When you set a component's `background` to `primary`, its text is always `primary-foreground`. No guessing.

### 2.3 — Color Roles

| Role           | What it does                                  | Where it appears                              |
|----------------|-----------------------------------------------|-----------------------------------------------|
| `background`   | Page canvas                                   | App root, full-page bg                        |
| `foreground`   | Primary text on canvas                        | Body text, headings                           |
| `card`         | Elevated container bg                         | Cards, list containers, panels                |
| `popover`      | Floating surface bg                           | Dropdown, tooltip, context menu               |
| `primary`      | Brand action color                            | CTA buttons, active nav, links                |
| `secondary`    | Neutral interactive bg                        | Secondary buttons, chips, tags                |
| `muted`        | Subdued surface / disabled                    | Skeleton loaders, disabled fields             |
| `accent`       | Hover / subtle highlight                      | Hovered list row, selected sidebar item       |
| `destructive`  | Danger / error                                | Delete buttons, error messages                |
| `success`      | Positive confirmation                         | Success toasts, "active" status               |
| `warning`      | Caution                                       | Quota alerts, unstable connections             |
| `border`       | Default stroke                                | Card edges, dividers                          |
| `input`        | Input field border                            | Text inputs, selects                          |
| `ring`         | Focus indicator                               | Keyboard / D-pad focus ring                   |
| `favorite`     | Warm yellow accent                            | Favorited star icon                           |
| `live`         | Live broadcast indicator                      | Red pulsing dot                               |

### 2.4 — Light & Dark Mode

Both modes use the **same hue families** — only lightness shifts. This means:

- Dark `background` is `hsl(240, 10%, 4%)` — not pure black, carries a slight blue warmth.
- Dark `card` is `hsl(240, 6%, 10%)` — visible lift from canvas.
- Light `background` is `hsl(0, 0%, 100%)` — pure white.
- Light `card` is also white but gains definition through `shadow.sm` + `border`.

**Rule of thumb:** In dark mode, surfaces stack by increasing lightness (4% → 10% → 15% → 16%). In light mode, surfaces stack by adding shadow and border.

### 2.5 — Accent Color Guidelines

Color should appear sparingly and intentionally:

- **Primary blue** → only for interactive elements (buttons, links, focus rings, active tabs)
- **Favorite yellow** → only for the star/favorite action
- **Live red** → only for the live broadcast dot
- **Status colors** (green/yellow/red) → only in badges, toasts, status indicators
- **Everything else** → neutral (foreground, muted, border)

> "If everything is highlighted, nothing is."

---

## 3 — Typography

### 3.1 — Type Scale

Based on **Major Second ratio (1.125)** with 14px as the body anchor. Every step serves a clear hierarchy role.

| Token       | Size  | Weight   | Line H | Tracking | When to use                          |
|-------------|-------|----------|--------|----------|--------------------------------------|
| `display`   | 48px  | Bold     | 1.1    | -0.02em  | TV hero, splash screen               |
| `h1`        | 32px  | Bold     | 1.2    | -0.02em  | Page title — one per screen          |
| `h2`        | 24px  | Semibold | 1.25   | -0.01em  | Section title — "Favorites", "Sources"|
| `h3`        | 20px  | Semibold | 1.3    | 0        | Card group, dialog title             |
| `h4`        | 16px  | Semibold | 1.4    | 0        | Card title, list section header      |
| `body`      | 14px  | Regular  | 1.5    | 0        | Default text, everything else        |
| `bodyLarge` | 16px  | Regular  | 1.5    | 0        | EPG description, prominent paragraphs|
| `small`     | 13px  | Regular  | 1.45   | 0        | Help text, form hints                |
| `caption`   | 12px  | Regular  | 1.35   | +0.01em  | Timestamps, metadata                 |
| `overline`  | 11px  | Medium   | 1.35   | +0.06em  | Label, tab, chip (UPPERCASE)         |
| `badge`     | 10px  | Semibold | 1.2    | +0.02em  | Live dot text, count badge           |

### 3.2 — Hierarchy Rule

When you see an `h2`, you know:
- The **content block** underneath is `body` (14px)
- The subtitle / supporting text is `small` (13px) in `mutedForeground`
- The gap from `h2` to its content is `16px` (`sectionHeader.marginBottom`)
- The next section starts `32px` below (`section.gap`)

```
┌──────────────────────────────────────┐
│ [h2] Recently Watched                │  ← 24px semibold
│                                      │  ← 16px gap
│ ┌──────┐ ┌──────┐ ┌──────┐          │  ← cards in grid
│ │ card │ │ card │ │ card │          │
│ │ [h4] │ │ [h4] │ │ [h4] │          │  ← 16px semibold
│ │ body │ │ body │ │ body │          │  ← 14px regular
│ └──────┘ └──────┘ └──────┘          │
│                                      │  ← 32px section gap
│ [h2] Favorites                       │
└──────────────────────────────────────┘
```

### 3.3 — Font Stack

```
Primary: Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, sans-serif
Mono:    JetBrains Mono, SF Mono, Consolas, monospace
```

**Inter** is the cross-platform default. On Apple devices, the system will naturally use SF Pro via `-apple-system`. On Windows, Segoe UI. Chinese users get PingFang SC or Microsoft YaHei.

### 3.4 — Weight Usage

| Weight   | Value | When                                               |
|----------|-------|-----------------------------------------------------|
| Regular  | 400   | Body text, descriptions, form values                |
| Medium   | 500   | Overline labels, emphasized body, nav items         |
| Semibold | 600   | Headings (h2–h4), buttons, active states            |
| Bold     | 700   | h1, display, primary CTA emphasis                   |

**Rule:** Never use more than two weights on the same screen region. Pair `semibold` headings with `regular` body. Use `bold` only for page-level headlines.

---

## 4 — Spacing & Layout

### 4.1 — The 4px Grid

Every measurement is a multiple of **4px**. This creates natural visual rhythm and ensures pixel-perfect alignment at 1×, 2×, and 3× scales.

```
4  8  12  16  20  24  32  40  48  64  80
```

### 4.2 — Composition Rules

These rules define how elements relate to each other. Memorize these and your layouts will be consistent without thinking.

| Relationship                        | Gap    | Token                    |
|-------------------------------------|--------|--------------------------|
| **Between page sections**           | 32px   | `section.gap`            |
| **Section heading → its content**   | 16px   | `sectionHeader.marginBottom` |
| **Between cards in a grid**         | 16px   | `card.gridGap`           |
| **Inside a card (children)**        | 12px   | `card.gap`               |
| **Card internal padding**           | 16px   | `card.padding`           |
| **Between list items**              | 0      | `list.itemGap` (dividers)|
| **List item internal padding**      | 12px   | `list.itemPadding`       |
| **Icon ↔ adjacent text**            | 8px    | `inline.gap`             |
| **Label → its form field**          | 4px    | `stack.tight`            |
| **Between stacked form fields**     | 8px    | `stack.default`          |
| **Between stacked paragraphs**      | 16px   | `stack.loose`            |
| **Page padding (horizontal)**       | 24px   | `page.padding`           |

### 4.3 — Visual Diagram

```
┌─ page (padding: 24px) ─────────────────────────────┐
│                                                     │
│  ┌─ section ──────────────────────────────────────┐ │
│  │ [h2] Section Title              ← h2           │ │
│  │           16px ↕                               │ │
│  │ ┌──card──┐  16px  ┌──card──┐  16px  ┌──card──┐│ │
│  │ │ 16px   │  ←→    │ 16px   │  ←→    │ 16px   ││ │
│  │ │ pad    │        │ pad    │        │ pad    ││ │
│  │ │[h4]    │        │[h4]    │        │[h4]    ││ │
│  │ │ 12px ↕ │        │ 12px ↕ │        │ 12px ↕ ││ │
│  │ │[body]  │        │[body]  │        │[body]  ││ │
│  │ └────────┘        └────────┘        └────────┘│ │
│  └────────────────────────────────────────────────┘ │
│                  32px ↕                             │
│  ┌─ section ──────────────────────────────────────┐ │
│  │ [h2] Another Section                          │ │
│  │           16px ↕                               │ │
│  │ ┌─ list ────────────────────────────────────┐ │ │
│  │ │ ┌─ item (padding: 12px) ────────────────┐ │ │ │
│  │ │ │ [h4 title]   8px   [caption timestamp]│ │ │ │
│  │ │ │ [small description]                   │ │ │ │
│  │ │ └──────────────────────────────────────┘ │ │ │
│  │ │ ─ ─ ─ ─ ─ 1px border divider ─ ─ ─ ─ ─ │ │ │
│  │ │ ┌─ item (padding: 12px) ────────────────┐ │ │ │
│  │ │ │ [h4 title]   8px   [caption timestamp]│ │ │ │
│  │ │ │ [small description]                   │ │ │ │
│  │ │ └──────────────────────────────────────┘ │ │ │
│  │ └──────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 5 — Border Radius

| Token  | Value | Usage                                  |
|--------|-------|----------------------------------------|
| `sm`   | 6px   | Buttons, inputs, badges                |
| `md`   | 8px   | Cards, dropdowns                       |
| `lg`   | 12px  | Panels, modals, larger containers      |
| `xl`   | 16px  | Full-screen overlays                   |
| `2xl`  | 24px  | Feature cards, hero areas              |
| `full` | 9999  | Pills, avatars, chips                  |

**Rule:** Nested elements reduce radius. If a card has `radius: md (8px)`, buttons inside it use `radius: sm (6px)`.

---

## 6 — Shadows

Shadows are used **only in light mode** (or sparingly in dark). In dark mode, surface differentiation comes from lightness steps, not shadows.

| Token | Usage                          | Value                                         |
|-------|--------------------------------|-----------------------------------------------|
| `sm`  | Cards, subtle elevation        | `0 1px 2px hsla(0,0%,0%,0.05)`               |
| `md`  | Dropdowns, popovers            | `0 4px 6px hsla(0,0%,0%,0.07)`               |
| `lg`  | Modals, dialogs                | `0 10px 15px hsla(0,0%,0%,0.1)`              |
| `xl`  | Full-screen overlays           | `0 20px 25px hsla(0,0%,0%,0.15)`             |

---

## 7 — Icons

### Library: [Lucide](https://lucide.dev)

- **1600+ icons**, ISC license (free for commercial use)
- Consistent 24×24 viewBox, stroke-based, `strokeWidth: 2`
- Packages for **React** (`lucide-react`), **Swift** (`lucide-icons-swift` via SPM), and SVG static assets for Android
- Used by shadcn/ui, Vercel, and thousands of production apps

### Sizing Convention

| Token | Size | When                                |
|-------|------|-------------------------------------|
| `xs`  | 14px | Inside dense controls (badge, chip) |
| `sm`  | 16px | Inline with body text               |
| `md`  | 20px | Default — nav items, buttons        |
| `lg`  | 24px | Standalone / emphasis               |
| `xl`  | 32px | Empty states, feature highlight     |

### Color Convention

Icons inherit the current text color (`currentColor`). Do not set icon color independently — it should always match the text it accompanies.

Exception: status icons (error=destructive, success=success) and the favorite star (=favorite).

---

## 8 — Motion

| Duration | Value | When                              |
|----------|-------|-----------------------------------|
| `fast`   | 100ms | Hover, toggle, micro-feedback     |
| `base`   | 150ms | Default transitions               |
| `slow`   | 250ms | Panel slide, modal open           |
| `slower` | 400ms | Page transition, TV focus move    |

**Easing:** Use `cubic-bezier(0.16, 1, 0.3, 1)` (fast start, gentle decel) for all transitions by default. This feels snappy but smooth — matching Apple and Vercel's motion language.

---

## 9 — Platform-Specific Rules

### 9.1 — TV (10-Foot Experience)

| Rule                          | Value                            | Why                                    |
|-------------------------------|----------------------------------|----------------------------------------|
| Typography scale multiplier   | ×1.15                            | Readable from 3m / 10ft                |
| Minimum font size             | 14sp                             | Legibility threshold                   |
| Border width minimum          | 2px                              | 1px lines flicker on interlaced TVs    |
| Max white                     | `hsl(0, 0%, 94%)`               | Pure white causes halos on LED panels  |
| Focus state                   | Scale 1.05× + ring + shadow      | D-pad requires always-visible focus    |
| Safe area                     | 48px (x), 27px (y) at 1080p     | Overscan on older TV sets              |

### 9.2 — Desktop

Uses the token set as-is. No multipliers needed.

| Parameter         | Value |
|-------------------|-------|
| Min window        | 960×640 |
| Sidebar           | 220px (expanded), 64px (collapsed) |
| Title bar         | 38px  |

### 9.3 — iOS

| Rule                   | Value |
|------------------------|-------|
| Min touch target       | 44pt  |
| Tab bar height         | 49pt  |
| Nav bar height         | 44pt  |
| Preferred system font  | SF Pro via `-apple-system` |

---

## 10 — Component Patterns

### Buttons

| Variant     | Background      | Text               | Border         |
|-------------|-----------------|---------------------|----------------|
| Primary     | `primary`       | `primaryForeground` | none           |
| Secondary   | `secondary`     | `secondaryForeground`| `border`      |
| Ghost       | transparent     | `foreground`        | none           |
| Destructive | `destructive`   | `destructiveForeground`| none        |

All buttons: `radius: sm (6px)`, `height: 36px`, `padding: 8px 16px`, `font: body semibold`.

### Cards

- Background: `card`
- Border: `1px solid border`
- Radius: `md (8px)`
- Padding: `16px`
- Shadow: `sm` (light mode only)
- Hover: subtle bg shift toward `accent`
- Focus (TV): scale 1.05× + `ring`

### Input Fields

- Background: `background` (transparent feel)
- Border: `1px solid input`
- Focus border: `ring` color + `ring` shadow
- Radius: `sm (6px)`
- Height: `36px`
- Padding: `8px 12px`

### Badges / Chips

- Background: `secondary` (inactive) or `primary` (active)
- Radius: `full (pill)`
- Padding: `2px 8px`
- Font: `overline` or `caption`

### Lists

- No gap between items. Items separated by `1px border` divider
- Item padding: `12px` vertical, `16px` horizontal
- Hover: `accent` background
- Title + subtitle stack with `4px` gap

---

## 11 — Dark Mode Specifics

Dark mode is **not an afterthought** — it's the primary mode for a media app.

### Layering Model

```
Layer 0:  background    hsl(240, 10%, 4%)    ← App canvas
Layer 1:  card          hsl(240, 6%, 10%)    ← Card surfaces
Layer 2:  popover       hsl(240, 6%, 15%)    ← Floating UI
Layer 3:  accent        hsl(240, 4%, 16%)    ← Hover / active
```

Each layer adds ~6% lightness. This gives depth without harsh contrast.

### Text Layering

```
Primary:   hsl(0, 0%, 95%)     ← Headlines, body
Muted:     hsl(240, 5%, 65%)   ← Descriptions, secondary info
Border:    hsl(240, 4%, 16%)   ← Nearly invisible, just enough structure
```

### Where Color Appears in Dark Mode

- **Blue primary** (`hsl(217, 91%, 60%)`) — active buttons, links, selected tabs, focus rings
- **Yellow favorite** (`hsl(45, 93%, 47%)`) — starred channels
- **Red live** (`hsl(0, 84%, 60%)`) — live broadcast indicator
- **Green success** — "Connected" or "Active" badges
- **Orange warning** — connection quality indicator

Everything else: neutral gray scale. The restraint makes the color hits impactful.

---

## 12 — Anti-Patterns

Things to **never** do:

1. **Don't use pure black `#000000`** as background. Use `hsl(240, 10%, 4%)`.
2. **Don't use pure white `#ffffff`** as text in dark mode. Use `hsl(0, 0%, 95%)`.
3. **Don't color icons independently from their text.** Icons use `currentColor`.
4. **Don't use more than 2 font weights per region.** Keep it calm.
5. **Don't invent spacing values.** Every gap must be a `spacing` token.
6. **Don't mix icon styles.** Lucide only. No mixing Feather + Material + SF Symbols aesthetics.
7. **Don't use shadow in dark mode** unless absolutely necessary. Use surface lightness.
8. **Don't add visual noise.** No gradients, no glows, no unnecessary dividers.

---

## 13 — Quick Reference Card

```
Page title:           h1 (32px bold)
Section title:        h2 (24px semibold)        → 16px to content
Card group heading:   h3 (20px semibold)        → 16px to content
Card title:           h4 (16px semibold)
Body text:            body (14px regular)
Supporting text:      small (13px) in mutedForeground
Labels/tabs:          overline (11px medium UPPERCASE, wide tracking)
Timestamps:           caption (12px) in mutedForeground

Section → Section:    32px
Heading → Content:    16px
Card → Card (grid):   16px
Inside card:          16px padding, 12px child gap
Icon ↔ text:          8px
Label → field:        4px
Field → field:        8px
Page padding:         24px

Card radius:          8px (md)
Button radius:        6px (sm)
Chip radius:          9999px (full)

Brand color:          hsl(221, 83%, 53%)  — blue
```

---

## 14 — File Structure

```
shared/design/
├── tokens.json          ← Token definitions (color, typography, spacing, etc.)
├── icons/
│   └── manifest.json    ← Lucide icon name mappings per platform
├── DESIGN_GUIDE.md      ← This document
└── README.md            ← Technical integration guide
```

---

*This guide is framework-agnostic and can be adopted by any project.  
Last updated: 2026-03-24*
