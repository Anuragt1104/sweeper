# Sweeper — design system conventions

Sweeper is a **dark-theme trading-console** design system. Components render real-time market-quality and agent-arena UI for sports-betting feeds. Everything below is the vocabulary you build with — use these names; do not invent parallel ones.

## Setup & wrapping

- **No provider, no theme context.** Components read their look from global CSS, not React context. Just render them — e.g. `window.Sweeper.ScoreHeader`. Nothing needs to be wrapped.
- **Dark surface is required.** Tokens and component classes assume a near-black background (`--color-bg: #0a0b0f`). Render on a dark page; on a light background, text and panels read as invisible. The host page should set `background: var(--color-bg); color: var(--color-ink)`.
- **Monospace numerics.** Numbers (prices, PnL, hashes) use the `.tnum` class (tabular mono). Apply it to any numeric column you add so it aligns with the components.

## Styling idiom

Two layers, both already in the bound `styles.css`:

**1. Semantic component classes** (use these for surfaces and controls — they carry the brand):

| Class | Use |
|---|---|
| `.panel` | the standard card surface (dark gradient, 1px border, 14px radius) |
| `.panel-head` | a panel's header row (space-between, bottom border) |
| `.eyebrow` | small uppercase tracked label above a value |
| `.chip` | pill tag / status badge |
| `.btn`, `.btn-primary`, `.btn-danger` | buttons; `.btn-primary` is the lime brand action, `.btn-danger` the destructive |
| `.field` | inputs / selects |
| `.tnum` | tabular monospace numerics |
| `.row-hover` | hover highlight for table rows / list items |
| `.pulse-dot` | pulsing status dot (live indicator) |

**2. Tailwind v4 utilities** for your own layout glue (`flex`, `grid`, `gap-*`, `p-*`, spacing, `text-*` sizes). Color utilities are mapped to the brand tokens — prefer these over raw hex:

`text-brand` / `bg-brand` (lime `#c8f751`, the primary accent) · `text-cyan` · `text-up` (green, gains) · `text-down` (pink/red, losses) · `text-warn` (amber) · `text-crit` (red, critical) · `text-info` (blue) · `text-ink` (primary text) · `text-muted` / `text-faint` (secondary/tertiary) · `bg-line` / `border-line` (hairlines).

Raw token access is `var(--color-brand)`, `var(--color-up)`, etc. — the full set: `bg, panel, panel2, line, line2, ink, muted, faint, up, down, warn, crit, info, brand, cyan`.

## Where the truth lives

- **Stylesheet**: `styles.css` and its `@import` closure (`_ds_bundle.css`) — the authoritative class + token definitions. Read it before styling.
- **Per-component**: each `components/general/<Name>/<Name>.d.ts` (the prop contract) and `<Name>.prompt.md` (usage). Props are real and typed — e.g. `Arena` takes `agents[]` + `leader`, `SettlementCard` takes a `settlement` receipt, charts (`Sparkline`, `EquityChart`, `QualityGauge`) take numeric data.

## Idiomatic snippet

```jsx
const { ScoreHeader, OddsBoard, SentinelFeed } = window.Sweeper;

<div className="grid grid-cols-[1fr_360px] gap-4">
  <div className="space-y-4">
    <ScoreHeader state={state} />
    <div className="panel p-4">
      <div className="eyebrow mb-2">Order book</div>
      <OddsBoard tick={state.current} />
    </div>
  </div>
  <div className="panel p-4">
    <div className="panel-head -m-4 mb-3">
      <span className="eyebrow">Sentinel</span>
      <span className="chip text-up"><span className="w-1.5 h-1.5 rounded-full bg-up pulse-dot" /> live</span>
    </div>
    <SentinelFeed signals={signals} counts={counts} />
  </div>
</div>
```
