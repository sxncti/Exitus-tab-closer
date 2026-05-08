# EXITUS: Tab Closer

A Chrome extension that automatically detects inactive tabs and prompts you to close them — keeping your browser clean and organized.

## Features

- **Inactivity detection** — Flags tabs that haven't been used beyond a configurable timeout (default: 15 min)
- **Domain grouping** — Prompt window groups tabs by domain for quick bulk actions
- **Search & sort** — Filter tabs by title/URL/domain, sort by inactive time or alphabetically
- **Whitelist** — Protect specific domains from ever being flagged (e.g. `github.com`, `docs.google.com`)
- **Badge count** — Red badge on the extension icon shows how many tabs are currently inactive
- **Configurable snooze** — Choose how long dismissed tabs stay snoozed (2×, 3×, 5×, or 10× timeout)
- **Keyboard shortcuts** — `Enter` to close selected, `Esc` to snooze all, `Ctrl+F` to search, `Ctrl+A` to select all
- **Dark mode** — Follows your preference, toggled instantly from settings
- **Service worker resilient** — All state persisted across browser restarts (MV3 compliant)

## How It Works

1. The extension tracks when each tab was last active
2. Every minute, it checks which tabs have exceeded the timeout
3. A prompt window appears listing inactive tabs grouped by domain
4. You choose which to close — the rest get snoozed
5. A 5-minute cooldown prevents the prompt from being annoying

## Installation

1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome/Brave/Edge
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Pin the extension for quick access to settings

## Settings

| Option | Description | Default |
|--------|-------------|---------|
| Enable | Turn the extension on/off | On |
| Timeout | Minutes of inactivity before a tab is flagged | 15 |
| Snooze multiplier | How long snoozed tabs stay quiet | 3× timeout |
| Whitelist | Domains that are never flagged | Empty |
| Dark Mode | Toggle dark/light theme | Light |

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read tab titles, URLs, and activity status |
| `storage` | Persist settings and state across sessions |
| `alarms` | Periodic scanning every minute |
| `windows` | Manage the prompt popup window |

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JS (no frameworks, no build step)
- CSS custom properties for theming

## License

MIT
