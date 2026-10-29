# Design System — SOC Dashboard

## Theme

Dark-first, analyst-grade. Uses CSS custom properties so light/dark can be toggled.

### CSS Variables (defined in `src/app/globals.css`)

| Variable | Role |
|---|---|
| `--bg-primary` | Page background |
| `--bg-secondary` | Section background |
| `--bg-card` | Card / panel background |
| `--bg-hover` | Hover state background |
| `--text-primary` | Primary text |
| `--text-secondary` | Muted / label text |
| `--border-color` | All borders |
| `--accent-blue` | Primary action colour |

**Never use hardcoded hex colours or Tailwind `bg-white` / `bg-gray-*` for surfaces.** Always use `var(--*)` so both themes work.

---

## Severity Colour Palette

| Severity | Background | Text | Usage |
|---|---|---|---|
| Critical | `bg-red-500/15` | `text-red-400` | `border-red-500/30` |
| High | `bg-orange-500/15` | `text-orange-400` | `border-orange-500/30` |
| Medium | `bg-yellow-500/15` | `text-yellow-400` | `border-yellow-500/30` |
| Low | `bg-blue-500/15` | `text-blue-400` | `border-blue-500/30` |
| Info | `bg-gray-500/10` | `text-gray-400` | `border-gray-500/20` |

---

## Page Layout

All pages use the shared `<Sidebar>` + `<Header>` wrapper from `src/app/layout.tsx`.

- **Sidebar:** fixed left, 240px, icon + label nav items
- **Header:** top bar with page title, clock, alert count badge, user menu
- **Content area:** `flex-1 overflow-auto` to the right of the sidebar

---

## Component Conventions

### Tables
- Use `table-fixed` with explicit `<colgroup>` widths for stable layouts
- Sticky `<thead>` with `bg-[#141929]` and `z-10`
- Alternating row background: even `bg-[#0f1320]`, odd `bg-[#0d1018]`
- Hover: `hover:bg-[#1a2035]`
- Values > 60 chars: truncate by default, click to expand

### Badges / Pills
- Severity badges: `px-1.5 py-0.5 rounded text-[10px] border capitalize`
- MITRE technique tags: `font-mono text-[10px] bg-red-500/10 border-red-500/20 text-red-400`

### Filter / Search
- Search inputs: `bg-[#0f1320] border border-[var(--border-color)]` with `focus:border-blue-500/70`
- Active filter row: `bg-blue-600/20 border-blue-500/40 text-blue-400`

### Slide-over Panels
- Full-height, right-anchored, `max-w-3xl`
- Backdrop: `bg-black/60 backdrop-blur-sm`
- Close on backdrop click, ✕ button top-right

---

## Icon Library
`lucide-react` exclusively. Import named icons only — no barrel imports.

## Charts
`recharts` for all data visualisations:
- `BarChart` for histograms and event volume
- `LineChart` for trend lines
- `ResponsiveContainer` always wraps charts

## Font
System monospace (`font-mono`) for IDs, IPs, hashes, raw log content.
System sans-serif for all other text (Tailwind default).
