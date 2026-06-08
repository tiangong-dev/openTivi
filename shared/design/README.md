# OpenTivi Design System — Integration Guide

## Overview

This is the single source of truth for visual design across iOS, Android TV, and Desktop.

- **`tokens.json`** — Color (HSL, light + dark), typography, spacing, radius, shadow, motion, layout composition rules, icon sizing, platform overrides
- **`icons/manifest.json`** — Maps logical icon names → Lucide names + SF Symbol equivalents
- **`DESIGN_GUIDE.md`** — Portable design principles document (usable across projects)

## Icon Library: Lucide

We use [Lucide](https://lucide.dev) (ISC license, 1600+ icons, stroke-based, consistent style).

| Platform    | Package                     | Install                              |
|-------------|------------------------------|--------------------------------------|
| Desktop     | `lucide-react`              | `pnpm add lucide-react`             |
| iOS         | `lucide-icons-swift`        | SPM: `https://github.com/JakubMazur/lucide-icons-swift` |
| Android TV  | SVG assets from `lucide-static` or custom Compose wrapper | Manual SVG import |

Usage in Desktop (React):
```tsx
import { Star, Play, Settings } from "lucide-react"
<Star size={20} strokeWidth={2} />
```

Usage in iOS (SwiftUI):
```swift
import LucideIcons
Image(uiImage: Lucide.star)
```

## How to Apply tokens.json

### Desktop → CSS Custom Properties

Map `tokens.json` colors to CSS variables in `apps/desktop/src/styles/tokens.css`:

```css
:root {
  --background: hsl(0, 0%, 100%);
  --foreground: hsl(240, 10%, 4%);
  --primary: hsl(221, 83%, 53%);
  /* ... */
}

.dark {
  --background: hsl(240, 10%, 4%);
  --foreground: hsl(0, 0%, 95%);
  --primary: hsl(217, 91%, 60%);
  /* ... */
}
```

### iOS → SwiftUI Color Extension

```swift
extension Color {
    // Dark mode
    static let tiviBackground = Color(hue: 240/360, saturation: 0.10, brightness: 0.04)
    static let tiviCard       = Color(hue: 240/360, saturation: 0.06, brightness: 0.10)
    static let tiviPrimary    = Color(hue: 217/360, saturation: 0.91, brightness: 0.60)
}
```

### Android TV → Compose Color

```kotlin
val Background = Color.hsl(240f, 0.10f, 0.04f)
val Card       = Color.hsl(240f, 0.06f, 0.10f)
val Primary    = Color.hsl(217f, 0.91f, 0.60f)
```

## Layout Cheat Sheet

```
Section → Section:     32px
Heading → Content:     16px
Card grid gap:         16px
Card padding:          16px
Card children gap:     12px
Icon ↔ text:           8px
Label → field:         4px
Page horizontal pad:   24px
```

See `DESIGN_GUIDE.md` for full composition rules and visual diagrams.
