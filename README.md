# EXITUS: Tab Closer

A non-invasive Chrome extension that quietly manages your inactive tabs. Instead of bombarding you with popups, it shows a small corner notification only when you have too many tabs open — and only a few times per day.

## Features

- **Non-invasive toast** — Small notification in the bottom-right corner, not a full window
- **Tab threshold** — Only triggers when you have 20+ tabs open (excluding pinned)
- **Daily limit** — Max 3 notifications per day (resets at midnight)
- **One-click close** — "Close All Inactive" button right in the toast
- **Detailed view** — "View Details" opens a full prompt with domain grouping, search & sort
- **Domain whitelist** — Protect specific domains from ever being flagged
- **Badge count** — Red badge on icon shows inactive tabs at a glance
- **Configurable snooze** — Dismissed tabs stay snoozed (2×, 3×, 5×, or 10× timeout)
- **Keyboard shortcuts** — `Enter`, `Esc`, `Ctrl+F`, `Ctrl+A` in the detailed view
- **Dark mode** — Instant toggle
- **Service worker resilient** — All state persists across browser restarts (MV3)

## How It Works

1. Tracks when each tab was last active
2. Every minute, checks which tabs exceeded the inactivity timeout
3. **Only** if you have ≥20 open tabs AND haven't been notified 3 times today:
4. A small toast appears in the bottom-right corner (unfocused, won't steal attention)
5. Quick options: **Close All Inactive** | **View Details** | **Dismiss**
6. "View Details" opens the full grouped prompt for fine-grained control

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
| Inactivity timeout | Minutes before a tab is flagged | 60 |
| Min tabs to trigger | Won't notify below this tab count | 20 |
| Max popups/day | Daily notification limit | 3 |
| Snooze multiplier | How long snoozed tabs stay quiet | 3× timeout |
| Whitelist | Domains that are never flagged | Empty |
| Dark Mode | Toggle dark/light theme | Light |

## Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read tab titles, URLs, and activity status |
| `storage` | Persist settings and state across sessions |
| `alarms` | Periodic scanning every minute |
| `windows` | Create and position notification windows |
| `system.display` | Position toast in bottom-right corner |

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JS (no frameworks, no build step)
- CSS custom properties for theming

## License

MIT
