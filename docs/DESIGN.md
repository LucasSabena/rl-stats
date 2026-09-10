# RL Stats — Design Document

> Following [Google Stitch Design.md Spec](https://stitch.withgoogle.com/docs/design-md/overview)

---

## Overview

**Product Name**: RL Stats
**Type**: Desktop application (Windows)
**Platform**: Tauri 2 (Rust backend + Web frontend)
**Target Audience**: Rocket League players who want deep, personal analytics without relying on external services or violating privacy.
**Primary Goal**: Provide a beautiful, fast, local-first companion app that captures live match data and transforms it into actionable performance insights.

**Design Philosophy**:
> "Broadcast precision meets personal performance terminal." Dark, dense, high-contrast, information-forward. No gamer clichés. No neon overload. Think: F1 telemetry dashboard meets clean modern SaaS analytics.

---

## Design System

### Color Palette

Implemented as OKLCH design tokens in `src/styles/globals.css` (light is the
`:root` default, `.dark` overrides it). Always consume the generated utilities
(`bg-bg-base`, `bg-bg-surface`, `text-text-secondary`, `text-accent-primary`,
`border-border-subtle`, `bg-accent-success`, ...) instead of hardcoding colors,
so both themes stay legible.

```
Surfaces (dark)     canvas oklch(0.155 0.008 265) · surface oklch(0.196 0.009 265)
                    raised oklch(0.238 0.011 265) · sunken oklch(0.128 0.007 265)
Surfaces (light)    canvas oklch(0.985 0.002 265) · surface oklch(1 0 0)
                    sunken oklch(0.965 0.003 265)

Foreground (dark)   fg oklch(0.98 0.003 265) · secondary 0.76 · muted 0.62 · subtle 0.5
Foreground (light)  fg oklch(0.22 0.012 265) · secondary 0.44 · muted 0.56 · subtle 0.68

Accent (violet)     dark oklch(0.66 0.19 285) · light oklch(0.54 0.2 285)
                    (deliberately not team blue, so "selected" never reads as "blue team")
Accent foreground   --accent-fg: dark oklch(0.16 0.02 285) · light white

Status (dark)       success oklch(0.74 0.17 157) · danger oklch(0.66 0.2 25)
                    warning oklch(0.79 0.16 75) · info oklch(0.66 0.16 250)

Team identity       blue oklch(0.66 0.16 250) · orange oklch(0.74 0.16 58)
                    (reserved: never used for decoration or selection state)

Boost telemetry     full oklch(0.78 0.14 195) · mid oklch(0.79 0.16 75)
                    low oklch(0.66 0.2 25)

Elevation           --shadow-1..4 · --glass (frosted) · --scrim (modal backdrop)
```

### Typography

```
Font Family:      'Geist Variable', system-ui, -apple-system, sans-serif
Font Family Mono: 'Geist Mono Variable', ui-monospace, monospace

Both are self-hosted via @fontsource (the Tauri CSP blocks Google Fonts).
Page headings use text-2xl font-bold tracking-tight; body text-sm; numeric
stats use the mono family with tabular figures.
```

### Spacing Scale

```
Base unit: 4px

  0:   0px
  1:   4px
  2:   8px
  3:   12px
  4:   16px
  5:   20px
  6:   24px
  8:   32px
  10:  40px
  12:  48px
  16:  64px
  20:  80px
```

### Border Radius

```
  Small:   4px   (buttons, badges, inputs)
  Medium:  8px   (cards, panels)
  Large:   12px  (modals, dialogs)
  Full:    9999px (avatars, pills)
```

### Shadows & Elevation

```
Level 1: 0 1px 2px rgba(0,0,0,0.3)        (buttons, badges)
Level 2: 0 4px 6px rgba(0,0,0,0.4)        (cards, dropdowns)
Level 3: 0 10px 15px rgba(0,0,0,0.5)      (modals, overlays)
Level 4: 0 20px 25px rgba(0,0,0,0.6)      (toast notifications)

Glow Accent: 0 0 20px rgba(59,130,246,0.15)  (live indicators)
```

### Layout Grid

```
Container Max Width: 1440px
Sidebar Width:       60px (collapsed) / 228px (expanded)
Content Padding:     24px
Card Gap:            16px

Breakpoints:
  Mobile:  < 768px
  Tablet:  768px - 1024px
  Desktop: > 1024px
```

---

## Components

### Navigation (Sidebar)

```
Style: Vertical sidebar, 60px icon-only default
Background: Background Primary with 1px right border (Border Subtle)

Items:
  - Live Match     (pulse dot when active)
  - History        (list icon)
  - Analytics      (chart icon)
  - Settings       (gear icon)

Active State: Accent Primary left border (3px), icon + text in Accent Primary
Hover State:  Surface Hover background
Collapsed:    Icons only with tooltip on hover
Expanded:     Icons + labels, 228px width

Live Indicator:
  When a match is active, a pulsing green dot appears on the Live Match icon.
  Pulse animation: scale 1 → 1.3 → 1, opacity 1 → 0.5 → 1, duration 2s, infinite.
```

### Cards

```
Standard Card:
  Background: Background Tertiary
  Border: 1px solid Border Subtle
  Border Radius: Medium (8px)
  Padding: 16px
  Shadow: Level 1

Stats Card (compact):
  Background: Background Secondary
  Border Radius: Small (4px)
  Padding: 12px 16px
  Layout: Label (Caption, Text Tertiary) above Value (Mono, Text Primary, 24px)

Highlight Card:
  Background: Accent Primary at 5% opacity + 1px border Accent Primary at 20%
  Used for: MVP, key moments, current player
```

### Buttons

```
Primary:
  Background: Accent Primary
  Text: #FFFFFF
  Padding: 8px 16px
  Border Radius: Small
  Hover: Accent Primary Hover, Shadow Level 1
  Active: scale(0.98)

Secondary:
  Background: transparent
  Border: 1px solid Border Strong
  Text: Text Primary
  Hover: Surface Hover background

Danger:
  Background: Accent Danger at 10%
  Text: Accent Danger
  Border: 1px solid Accent Danger at 30%

Icon Button:
  Size: 32px × 32px
  Border Radius: Small
  Hover: Surface Hover
```

### Badges

```
Status Badge (pill shape):
  Padding: 2px 8px
  Border Radius: Full
  Font: Caption, weight 600

  Variants:
    Live:     bg-Accent-Secondary/20 text-Accent-Secondary
    Win:      bg-Accent-Secondary/20 text-Accent-Secondary
    Loss:     bg-Accent-Danger/20 text-Accent-Danger
    Overtime: bg-Accent-Warning/20 text-Accent-Warning
    Ranked:   bg-Accent-Purple/20 text-Accent-Purple
```

### Data Tables

```
Header:
  Background: Background Secondary
  Text: Caption, Text Secondary, uppercase
  Border Bottom: 1px Border Subtle

Row:
  Background: transparent
  Border Bottom: 1px solid Border Subtle at 50%
  Hover: Surface Hover
  Height: 48px

Cell:
  Padding: 12px 16px
  Font: Body

Selected Row:
  Background: Accent Primary at 5%
```

### Charts

```
Line Chart:
  Stroke: Accent Primary, 2px
  Fill: Accent Primary at 10% (gradient to transparent)
  Grid: Border Subtle, dashed
  Axis Text: Caption, Text Tertiary

Bar Chart:
  Positive bars: Accent Secondary
  Negative bars: Accent Danger
  Background bars: Background Tertiary

Sparkline (mini):
  Height: 32px
  No axes, no labels
  Stroke only, 1.5px
```

---

## Pages & Screens

### 1. Live Match Dashboard

**Purpose**: Real-time view of the current match.

**Layout**:
```
+--------------------------------------------------+
|  HEADER: Match Status | Timer | Score | Mode     |
+--------------------------------------------------+
|                                                  |
|  +------------------+  +----------------------+  |
|  | TEAM BLUE        |  | TEAM ORANGE          |  |
|  | [Player Cards]   |  | [Player Cards]       |  |
|  +------------------+  +----------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  | RECENT EVENTS FEED                         |  |
|  | [Goal] [Save] [Demo] [Ball Hit] ...        |  |
|  +--------------------------------------------+  |
|                                                  |
|  +------------------+  +----------------------+  |
|  | MATCH STATS      |  | BALL / GAME INFO     |  |
|  | Goals, Shots...  |  | Speed, Arena, OT     |  |
|  +------------------+  +----------------------+  |
|                                                  |
+--------------------------------------------------+
```

**Player Card (compact)**:
```
+----------------------------------+
| [Avatar] Player Name    [Team]   |
| Score: 324  |  Goals: 2          |
| Shots: 3    |  Saves: 1          |
| Boost: [████████░░] 83%          |
| Speed: 1420 uu/s                 |
+----------------------------------+
```

**States**:
- `Waiting`: "Waiting for match..." with subtle animation
- `Warmup`: Countdown visible, player cards loading
- `Active`: Full dashboard, live data, event feed scrolling
- `Replay`: Dimmed overlay, "GOAL REPLAY" badge
- `Finished`: Final score, winner highlighted, "View Match Detail" CTA

### 2. Match History

**Purpose**: Browse all captured matches.

**Layout**:
```
+--------------------------------------------------+
|  FILTERS: [Date] [Result] [Mode] [Search]        |
+--------------------------------------------------+
|                                                  |
|  +------------------------------------------+    |
|  | Match Card                               |    |
|  | Date | Mode | Score | Result | Duration  |    |
|  | [Team comp] | [Key Stats]                |    |
|  +------------------------------------------+    |
|  | Match Card...                            |    |
|  +------------------------------------------+    |
|                                                  |
+--------------------------------------------------+
```

**Match Card**:
- Horizontal layout
- Left: Date + time (small), Mode badge
- Center: Score with team colors, "3 - 2"
- Right: Result badge (Win/Loss), duration, key stat (e.g., "5 Goals")
- Hover: slight elevation increase, "View Details" appears

### 3. Match Detail

**Purpose**: Deep dive into a single match.

**Sections**:
1. **Header**: Final score, teams, duration, date, result banner
2. **Score Timeline**: Chart showing score over time with goal markers
3. **Player Stats Table**: All players, all stats, sortable
4. **Goal Details**: Each goal with scorer, assister, speed, time
5. **Event Timeline**: Chronological list of all events

### 4. Analytics / Performance

**Purpose**: Personal performance trends over time.

**Layout**:
```
+--------------------------------------------------+
|  TABS: [Day] [Week] [Month] [Session]           |
+--------------------------------------------------+
|                                                  |
|  +------------------+  +----------------------+  |
|  | WIN RATE         |  | AVG SCORE            |  |
|  | [Big Number]     |  | [Big Number]         |  |
|  | [Sparkline]      |  | [Sparkline]          |  |
|  +------------------+  +----------------------+  |
|                                                  |
|  +--------------------------------------------+  |
|  | PERFORMANCE OVER TIME (Line Chart)         |  |
|  +--------------------------------------------+  |
|                                                  |
|  +------------------+  +----------------------+  |
|  | STATS BREAKDOWN  |  | PEAK PERFORMANCES    |  |
|  | [Radar/Bar]      |  | [List]               |  |
|  +------------------+  +----------------------+  |
|                                                  |
+--------------------------------------------------+
```

**Stats to show**:
- Win rate %
- Average score per match
- Goals / Assists / Saves per match
- Average boost remaining
- Estimated distance traveled (derived)
- Best streaks
- Performance by time of day (heatmap)

### 5. Settings

**Sections**:
- General: App language, theme, startup behavior
- Game: Path to RL install, Stats API config helper
- Data: Export/Import, storage usage, clear history
- Updates: Check for updates, channel (stable/beta)
- About: Version, license, credits, links

---

## Animations & Interactions

### Principles
- **Purposeful**: Every animation conveys information or guides attention
- **Fast**: 150-300ms for micro-interactions, never block user input
- **Subtle**: No bounces, no overshoots. Ease-out curves.

### Defined Animations

```
Page Transition:
  Duration: 200ms
  Easing: cubic-bezier(0.4, 0, 0.2, 1)
  Effect: Fade + slight translateY (8px → 0)

Card Hover:
  Duration: 150ms
  Easing: ease-out
  Effect: translateY(-2px) + shadow increase

Live Pulse:
  Duration: 2000ms
  Easing: ease-in-out
  Effect: scale + opacity oscillation
  Iteration: infinite

Score Change:
  Duration: 300ms
  Easing: cubic-bezier(0.34, 1.56, 0.64, 1)
  Effect: scale(1.2) + color flash → normal

Event Feed Entry:
  Duration: 200ms
  Easing: ease-out
  Effect: slideIn from right + fadeIn

Number Counter:
  Duration: 600ms
  Easing: ease-out
  Effect: Count up from 0 to value

Skeleton Loading:
  Duration: 1200ms
  Easing: linear
  Effect: Shimmer gradient sweep left to right
  Iteration: infinite
```

---

## Responsive Behavior

Since this is a desktop app, responsive primarily means:

```
Desktop (>1024px):
  - Full sidebar (228px)
  - Multi-column layouts
  - Large charts
  - Side-by-side panels

Tablet (768-1024px):
  - Collapsed sidebar (60px)
  - 2-column layouts become stacked
  - Charts remain readable

Small Window (<768px):
  - Icon-only sidebar
  - Single column
  - Cards stack vertically
  - Tables become card lists
```

---

## Accessibility

- All colors meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text)
- Focus indicators: 2px solid Accent Primary outline, 2px offset
- Keyboard navigation: Full Tab order, Enter/Space activation
- Screen reader: Semantic HTML, ARIA labels on icon-only buttons
- Reduced motion: Respect `prefers-reduced-motion` (disable pulses, parallax)
- Minimum touch target: 32px × 32px (even on desktop for precision)

---

## Iconography

- Library: [Lucide React](https://lucide.dev) (consistent, lightweight)
- Size: 16px (inline), 20px (buttons), 24px (navigation)
- Stroke: 1.5px - 2px
- Color: inherit from text color
- Never use emojis in the interface

---

## Assets

### Required
- App icon (ICO for Windows, multiple sizes: 16, 32, 48, 256)
- Tray icon (monochrome, 16×16 and 32×32)
- Default avatar placeholder (for players without avatars)
- Team badges (Blue / Orange, SVG)

### Optional V2
- Rank tier icons (if external rank integration added)
- Arena thumbnails
- Car body silhouettes

---

## Empty States

```
No Matches Yet:
  Icon: Gamepad2 (48px, Text Tertiary)
  Title: "No matches captured yet"
  Description: "Start Rocket League, enable the Stats API, and play a match. We'll automatically capture your data."
  Action: "How to enable Stats API" (link to settings)

No Live Match:
  Icon: Radio (48px)
  Title: "Waiting for match..."
  Description: "Start a match in Rocket League to see live data."
  Animation: Subtle pulse on icon

No Data for Period:
  Icon: BarChart3 (48px)
  Title: "No data for this period"
  Description: "Play some matches to see your analytics here."
```
