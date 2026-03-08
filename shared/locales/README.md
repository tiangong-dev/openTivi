# Shared locale resources

This directory contains platform-agnostic translation resources.

- `en-US.json`
- `zh-CN.json`

All client platforms (desktop, iOS, Android, web) should load strings from these same files to keep language behavior consistent.

## Format

- Flat key-value JSON (`"feature.section.key": "message"`).
- Placeholders use `{name}` syntax, for example:
  - `"sources.autoRefreshEveryMinutes": "Every {minutes} min"`
  - `"sources.autoRefreshEveryMinutes": "每 {minutes} 分钟"`

## Rules

1. Add new translation keys to both locale files in the same PR.
2. Keep key names stable to avoid breaking clients.
3. Prefer semantic keys over view-specific wording.
