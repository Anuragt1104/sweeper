# Strategy Lab Phase A — Extensive Handoff

**Status:** Phase A shipped. Treat this file as historical locked decisions from the grilling session.  
**Current roster / IA:** eleven strategies in [`designs.ts`](../../lib/strategy-lab/designs.ts); UI rails Observe / Interpret / Act; see [`ROSTER.md`](./ROSTER.md), [`README.md`](./README.md), and [`docs/DEMO_SCRIPT.md`](../DEMO_SCRIPT.md).  
**Naive Momentum** and **Market Maker** were removed from the live roster after Phase A.

**Audience:** Next agent / implementer  
**Locked via:** grilling session + [`CONTEXT.md`](../CONTEXT.md)  
**Scope:** Phase A only (honest Lab). Multi-Contract fills beyond current 1X2/O/U = Phase B.

---

## 1. Mission

Rebuild Sweeper’s product surface as a **Strategy Lab on a Session**:

1. Critically separate **Observation · Analysis · Contract · Strategy**.
2. **Full visual redesign** of the main Lab (not a deferred polish pass).
3. Critically verify the **mental model** in UI copy, layout, and engine seams.
4. Always show **something from Observation, something from Analysis, and something from Strategy**.

Do **not** invent Strategy edges or fills where no pricing model exists.

---

## 2. Locked decisions (do not reopen without user)

| Topic | Decision |
|-------|----------|
| Layers | Observation → Analysis → Contract → Strategy. **Signal** = Sentinel alerts only |
| Tempo | **Tempo enrichment** = non-TxLINE Observation (shots/SOT/…). Never a product “tempo %” or strategy |
| Strategy view | **Stance + edge** on selected Contract (not Tempo·Odds·Hybrid as “strategies”) |
| Eligibility | Per Strategy design; any Strategy *may* be designed for any Contract later |
| Phase A honesty | Board shows edge only where a real pricing path exists; else `ineligible` / `no model` |
| Product | **Strategy Lab on a Session** |
| Main UI | Three rails: Observation → Analysis → Strategy |
| Arena | Session **scoreboard under Strategy rail** (not full-bleed hero) |
| Causal rail | **Advanced** only |
| Strategies this pass | Spec + Seam + **retune existing 7**; Phase B candidates designed-not-filling |
| Visual | **Full visual redesign** in Phase A |
| Multi-Contract fills | Phase B |

Canonical language: [`CONTEXT.md`](../CONTEXT.md).

---

## 3. Mental model (verify continuously)

```text
Observation sources          Analysis metrics              Strategies
─────────────────            ────────────────              ──────────
TxLINE score/book/events  →  desk fair, Horizon,       →  stance / fill / PnL
Tempo enrichment             MatchIntensity, regime,       on eligible Contracts
Feed health / coverage       Sentinel assessments
```

**PnL path:** Observation → Analysis → Strategy decision → shadow fill on Contract → mark-to-market equity.

**False models to kill:**

- “Shared signals by bet” / Tempo·Odds·Hybrid as three strategies  
- Horizon outs as the only “prediction” for every Contract  
- Tempo as a single calculated desk strategy metric  
- Agents “predicting bets” without a Contract + stance  

---

## 4. Target main-page IA

```text
┌ Header (Sweeper · Live/Demo · stream health) ─────────────────────┐
├ Session strip (fixture · clock · provenance · readiness) ─────────┤
├ OBSERVATION RAIL ─────────────────────────────────────────────────┤
│  Score · selected Contract book strip · Tempo enrichment counts   │
│  Feed / coverage chips (no scalar “tempo intensity” as the hero)  │
├ ANALYSIS RAIL ────────────────────────────────────────────────────┤
│  Contract picker · outcome outs (fair vs book / Horizon)          │
│  Metric chips: intensity · regime · Sentinel quality · desk ready │
├ STRATEGY RAIL ────────────────────────────────────────────────────┤
│  Strategy board: stance · edge · size · why (selected Contract)   │
│  Session scoreboard (Arena compact): equity · sparklines · focus  │
└ Advanced (collapsed): Causal · controls · Sentinel feed · proofs  ┘
```

**Demote/remove from main path:** Contract-lenses Tempo·Odds·Hybrid grid ([`components/shock-strip.tsx`](../components/shock-strip.tsx)). Optional Advanced dump or delete after Lab rails ship.

---

## 5. Current code vs target (facts)

| Area | Today | Phase A target |
|------|-------|----------------|
| Page stack | Arena hero → Causal → Contract deck → Strategy analysis → lenses | Three Lab rails + scoreboard under Strategy |
| Labels | Mixed “signals / bets / lenses” | Glossary terms only |
| Agents | Hardcoded `TAKER_SELECTIONS` / `MAKER_SELECTIONS`; mostly 1X2 | Declare `eligibleContracts` + expose stance for board |
| Desk fair | 1X2 via [`lib/desk/compose.ts`](../lib/desk/compose.ts) | Keep as Analysis; board uses it where Strategy prices 1X2 |
| Tempo | Often shown as intensity scalar + lens charts | Enrichment **counts** in Observation rail |
| Horizon | Contract deck can show next_score | Analysis outs when selected Contract needs it |
| TxLINE reliability | Cancelled / CoveragePaused + trade-readiness (done) | Keep; surface in Observation rail |

Already landed (keep / fold into Lab):

- [`lib/desk/contract-deck.ts`](../lib/desk/contract-deck.ts), [`match-intensity.ts`](../lib/desk/match-intensity.ts), [`strategy-contracts.ts`](../lib/desk/strategy-contracts.ts)  
- [`components/contract-deck.tsx`](../components/contract-deck.tsx), [`strategy-analysis.tsx`](../components/strategy-analysis.tsx)  
- Engine `deskModel` + `matchIntensity` on [`EngineState`](../lib/engine/state.ts)  

---

## 6. Strategy design specs (retune existing 7)

Each Strategy must ship with a **design card** (docs + code metadata):

```ts
interface StrategyDesign {
  id: string;
  name: string;
  reads: {
    observations: string[];   // e.g. "txline.book", "tempo.enrichment"
    analysis: string[];       // e.g. "desk.fair1x2", "horizon", "sentinel.quality"
  };
  eligibleContracts: OddsViewId[];  // design-time; Phase A may be subset of fillable
  fillableNow: OddsViewId[];        // where real pricing/fill path exists
  stanceRule: string;               // human rule
  standDownWhen: string[];
}
```

### 6.1 Roster (Phase A fillable ≈ today)

| id | Name | Reads (Analysis / Observation) | fillableNow | Stance rule (retune) |
|----|------|--------------------------------|-------------|----------------------|
| `value` | Value | desk fair 1X2, obs book, path, regime | `match_1x2` | Buy when fair − obs ≥ edge; flatten otherwise |
| `momentum_naive` | Naive Momentum | odds path z/ret, Sentinel sharp_move | `match_1x2`, `ou_25` | Follow corroborated momentum |
| `momentum_guarded` | Guarded Momentum | path, Sentinel quality, regime | `match_1x2`, `ou_25` | Same + stand-down on bad quality / regime |
| `reversion` | Mean Reversion | path z/ret, Sentinel | `match_1x2`, `ou_25` | Fade stretched moves |
| `maker` | Market Maker | desk fair 1X2, path vol | `match_1x2` | Quote around fair |
| `hybrid_thesis` | Hybrid Thesis | desk fair, Horizon (mapped), tempo enrichment inputs, pressure, regime | `match_1x2` | Trade 1X2 vs desk-v1; Horizon is Analysis input not fill Contract |
| `collapse_fade` | Collapse Fade | Horizon collapse, obs book | `match_1x2` | Fade collapse winner into 1X2 |

**eligibleContracts** may list more Contracts than `fillableNow` for Lab honesty (show “designed for X · no model yet”).

### 6.2 Phase B candidates (design-only in this handoff)

Document in `docs/strategy-lab/candidates.md` (create when implementing):

1. **Corners Pressure** — reads tempo corners + book corners O/U; eligible `corners_ou`; fill when fair exists  
2. **Enrichment Burst** — reads MatchIntensity / shot bursts; eligible `match_1x2` + `ou_25`; fill via desk fair / momentum path  
3. **Swing Guard** — reads short-term favorite swing Analysis; eligible `swing`; fill Phase B only  

Do not implement fills for these in Phase A.

### 6.3 Engine seam work

1. Extend [`lib/agents/types.ts`](../lib/agents/types.ts) `Agent` (or companion registry) with `StrategyDesign` + `stanceOn(contract, ctx) → StrategyStance`.  
2. Replace static [`lib/desk/strategy-contracts.ts`](../lib/desk/strategy-contracts.ts) with design-driven bindings.  
3. Engine snapshot: per-Strategy stance for `selectedContract` (or all Contracts compact) for the Strategy board.  
4. Keep fill logic constrained to `fillableNow` until Phase B.

`StrategyStance` shape (suggested):

```ts
type StrategyStance = {
  contract: OddsViewId;
  kind: "trade" | "quote" | "stand_down" | "flat" | "ineligible" | "no_model";
  side?: "buy" | "sell";
  edgeVsBook?: number | null;  // fair − obs when priced
  size?: number;
  rationale: string;
};
```

---

## 7. UI / UX workstream (full visual redesign)

Follow repo frontend design rules (expressive type, atmospheric background, no purple-AI cliché, no card soup in hero, motion with purpose). Use impeccable skill when executing visuals.

### 7.1 Rails

| Rail | Must show | Must not show |
|------|-----------|---------------|
| Observation | Score, book for selected Contract, tempo **counts**, feed/coverage | Tempo·Odds·Hybrid triad, “tempo %” as strategy |
| Analysis | Outs for selected Contract, desk/Horizon metrics, intensity/regime/Sentinel | Fake multi-Strategy probability vectors |
| Strategy | Stance board + compact Arena scoreboard | Full Causal rail, lens grid as primary |

### 7.2 Components to reshape

| Keep / evolve | Action |
|---------------|--------|
| [`app/page.tsx`](../app/page.tsx) | Rebuild composition as three rails |
| [`components/desk.tsx`](../components/desk.tsx) | Shrink to scoreboard under Strategy |
| [`components/contract-deck.tsx`](../components/contract-deck.tsx) | Move into Analysis rail |
| [`components/strategy-analysis.tsx`](../components/strategy-analysis.tsx) | Become Strategy board (stance-driven) |
| [`components/shock-strip.tsx`](../components/shock-strip.tsx) | Demote to Advanced or remove from main |
| [`components/horizon.tsx`](../components/horizon.tsx) | HorizonAdvanced stays Advanced; experience absorbed into Analysis |
| New | `ObservationRail`, `AnalysisRail`, `StrategyRail` (names flexible) |

### 7.3 Copy audit

Grep/UI pass: ban “bet”, “shared signals”, “tempo strategy”, “signals by bet” on main surface. Align with `CONTEXT.md`.

---

## 8. Verification (critical)

### 8.1 Mental-model checklist (manual + demo)

- [ ] Judge can point to Observation vs Analysis vs Strategy without reading code  
- [ ] Selecting Match 1X2 shows fair/book outs + Strategy stances with real edges  
- [ ] Selecting Next score shows Horizon outs; Strategies show signal-only / no_model for fills as appropriate  
- [ ] Tempo appears as enrichment counts, not a third “strategy” chart  
- [ ] Arena is under Strategy; Causal only in Advanced  
- [ ] Act II demo still readable: goal → Analysis move → stances/fills → PnL tick  

### 8.2 Automated

- [ ] Unit: `StrategyDesign` / `stanceOn` for each of 7 (ineligible vs fillable)  
- [ ] Unit: contract deck projector still honest per Contract  
- [ ] `tsc --noEmit` + full `npm test` green  
- [ ] No Strategy emits fills on Contracts outside `fillableNow`  

### 8.3 Separation test (must pass)

For each main-page widget, label it Observation / Analysis / Strategy / Chrome. **Fail** if any widget mixes two layers without an explicit boundary.

---

## 9. Task breakdown (handoff order)

### Track 1 — Domain & Strategy designs

1. Keep [`CONTEXT.md`](../CONTEXT.md) authoritative; fix any drift while coding.  
2. Write `docs/strategy-lab/ROSTER.md` — full design cards for 7 Strategies.  
3. Write `docs/strategy-lab/candidates.md` — Phase B only.  
4. Implement `StrategyDesign` + `StrategyStance` seam; wire registry.  
5. Retune agents to report stance without changing fill universe (except bugfixes).  

### Track 2 — Lab IA (structure)

6. Lift `selectedContract` as Lab focus (already partially on page).  
7. Build Observation / Analysis / Strategy rails; move pieces from current page.  
8. Compact Arena scoreboard under Strategy; move Causal to Advanced.  
9. Demote/remove Shock Strip lenses from main.  

### Track 3 — Full visual redesign

10. New Lab visual system (type, color tokens, atmosphere, motion).  
11. Restyle three rails + scoreboard; CLS-stable shells.  
12. Mobile pass.  

### Track 4 — Verify & demo

13. Run verification checklist (§8).  
14. Update [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md) + submission blurb for Strategy Lab language.  
15. Screenshots for Lab rails (replace outdated “signals by bet” shots if needed).  

**Suggested parallelization:** Track 1 + Track 2 start together; Track 3 starts once rail skeleton exists (user asked full visual in Phase A — do not wait for “done” structure, but don’t polish the old stacked IA). Track 4 last.

---

## 10. Explicit non-goals (Phase A)

- Question Engine / Fan Buzz / Duels from final-whistle-rooms  
- Full action-ledger + historical tape archive (optional later)  
- New Poisson fair for corners/swing with live fills  
- Treating Horizon class probabilities as 1X2 fair (desk-v1 contract alignment stays)  

---

## 11. Phase B backlog (after Lab is true)

1. Per-Contract Analysis fair (or book-relative models) for O/U, corners, swing as needed  
2. Expand `fillableNow` per Strategy design  
3. Strategy Lab “test matrix”: Strategy × Contract PnL panels  
4. Optional action-ledger / history priors from FWR patterns  

---

## 12. Reference files

| File | Role |
|------|------|
| [`CONTEXT.md`](../CONTEXT.md) | Ubiquitous language |
| [`lib/desk/*`](../lib/desk) | Analysis composition, contract deck, intensity |
| [`lib/agents/*`](../lib/agents) | Strategies |
| [`app/page.tsx`](../app/page.tsx) | Current console composition |
| [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md) | Demo narrative to rewrite |
| FWR `052d519` | TxLINE reliability + intensity inspiration (already partially ported) |

---

## 13. Definition of done

Phase A is done when:

1. Main page is Observation → Analysis → Strategy with full visual redesign.  
2. Existing 7 Strategies have design cards + stance seam; board is truthful.  
3. Tempo·Odds·Hybrid is gone from the primary Lab story.  
4. Verification checklist (§8) passes.  
5. Demo script speaks Strategy Lab, not “shared signals by bet.”
