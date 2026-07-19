import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Clock3,
  Eye,
  GitBranch,
  LockKeyhole,
  Play,
  Radio,
  ShieldCheck,
  Target,
} from "lucide-react";
import currentStrategyLab from "@/submission/landing-strategy-lab.jpg";

const steps = [
  {
    number: "01",
    label: "Observe",
    title: "What happened?",
    copy: "Score, book movement, match events, and feed health — exactly as received.",
    icon: Eye,
  },
  {
    number: "02",
    label: "Interpret",
    title: "What does the desk infer?",
    copy: "Desk fair, regime, readiness, and explicit no-model boundaries.",
    icon: BrainCircuit,
  },
  {
    number: "03",
    label: "Act",
    title: "What will each strategy do?",
    copy: "Trade, quote, remain flat, or stand down — with reason and exposure.",
    icon: Target,
  },
];

const strategies = [
  ["Value", "Finds divergence between desk fair and the observed book."],
  ["Guarded Momentum", "Moves only after Sentinel confirms a sharp change."],
  ["Mean Reversion", "Fades outlier prints when the path supports it."],
  ["Intensity Burst", "Acts inside tempo-acceleration windows."],
  ["Hybrid Thesis", "Combines Horizon calls with path-aware features."],
  ["Collapse Fade", "Responds when a Horizon resolves as surprise."],
  ["Goal Overreaction", "Fades post-goal overshoot after a short cool-off."],
  ["Shock Fade", "Tests whether red-card and comeback panic will mean-revert."],
  ["Stale Reopen", "Looks for mispricing when a suspended book returns."],
  ["Regime Switcher", "Changes its playbook as the market regime changes."],
  ["Kelly Value", "Sizes value exposure with a drawdown-aware Kelly fraction."],
] as const;

export function LandingPage() {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Sweeper home">
          <span className="landing-mark" aria-hidden="true"><i /></span>
          <span>Sweeper</span>
        </Link>
        <nav className="landing-nav" aria-label="Landing page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#strategies">Strategies</a>
          <a href="#proof">Proof</a>
        </nav>
        <Link className="landing-header-cta" href="/?lab=live">
          Open Strategy Lab <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__copy">
            <h1 id="landing-title">See every decision before the trade.</h1>
            <p>
              Sweeper turns live football market movement into observable facts,
              contract-specific analysis, and auditable shadow execution — in one causal view.
            </p>
            <div className="landing-actions">
              <Link className="landing-button landing-button--primary" href="/?lab=live">
                Enter live desk <ArrowRight size={20} aria-hidden="true" />
              </Link>
              <Link className="landing-text-link" href="/?demo=act2&contract=match_1x2">
                <Play size={15} fill="currentColor" aria-hidden="true" />
                Watch the 3-minute replay
              </Link>
            </div>
            <div className="landing-causal" aria-label="Observe, then interpret, then act">
              <span>Observe</span><ArrowRight size={15} /><span>Interpret</span><ArrowRight size={15} /><span>Act</span>
            </div>
          </div>

          <div className="landing-hero__product">
            <div className="landing-product-bar">
              <span><Activity size={14} /> Strategy Lab</span>
              <span><i /> Shadow execution</span>
            </div>
            <Image
              src={currentStrategyLab}
              alt="Sweeper Strategy Lab showing Observation, Analysis, and Strategy rails for one football contract"
              priority
              sizes="(max-width: 900px) 100vw, 62vw"
            />
            <div className="landing-product-caption">
              <span>One contract</span>
              <span>Three accountable layers</span>
              <span>Same market state</span>
            </div>
          </div>
        </section>

        <section className="landing-trust" aria-label="System boundaries">
          <div><Radio aria-hidden="true" /><span><strong>TxLINE mainnet level 12</strong><small>Source provenance stays visible</small></span></div>
          <div><LockKeyhole aria-hidden="true" /><span><strong>Shadow execution only</strong><small>No live venue orders</small></span></div>
          <div><GitBranch aria-hidden="true" /><span><strong>Merkle-auditable replay</strong><small>Every decision remains traceable</small></span></div>
        </section>

        <section className="landing-process" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading">
            <h2 id="process-title">From feed to fill,<br />nothing is hidden.</h2>
            <p>One contract. Three accountable layers. Every strategy sees the same state.</p>
          </div>
          <div className="landing-steps">
            {steps.map(({ number, label, title, copy, icon: Icon }) => (
              <article className="landing-step" key={label}>
                <div className="landing-step__number"><span>{number}</span><Icon size={19} aria-hidden="true" /></div>
                <p>{label}</p>
                <h3>{title}</h3>
                <span>{copy}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-showcase" id="strategies" aria-labelledby="strategies-title">
          <div className="landing-showcase__intro">
            <span className="landing-mono-label">The strategy arena</span>
            <h2 id="strategies-title">Eleven strategies.<br />One shared clock.</h2>
            <p>
              Different theses compete on the same contract state. Every stance says what it
              will do, why, and whether it has authority to fill.
            </p>
            <div className="landing-annotation-list" aria-label="Strategy constraints">
              <span><Clock3 size={15} /> Same tick</span>
              <span><Target size={15} /> Contract-specific</span>
              <span><ShieldCheck size={15} /> Shadow only</span>
            </div>
            <Link className="landing-text-link landing-text-link--dark" href="/?demo=act2&contract=match_1x2&rail=act">
              Explore the strategy roster <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-showcase__media">
            <Image
              src={currentStrategyLab}
              alt="Sweeper replay after a goal, with updated analysis and strategy stances"
              sizes="(max-width: 900px) 100vw, 68vw"
            />
            <div className="landing-showcase__strategies">
              {strategies.map(([name, copy], index) => (
                <div key={name}>
                  <i style={{ "--strategy-index": index } as React.CSSProperties} />
                  <span><strong>{name}</strong><small>{copy}</small></span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-proof" id="proof" aria-labelledby="proof-title">
          <div className="landing-proof__headline">
            <span className="landing-mono-label">Candid by design</span>
            <h2 id="proof-title">Proof, not promises.</h2>
          </div>
          <div className="landing-proof__statement">
            <p>
              Live never silently becomes simulation. Missing models are labelled. Strategies
              can stand down. Fills are shadowed. The causal ledger stays inspectable.
            </p>
            <Link className="landing-text-link" href="/?demo=act2&advanced=proofs">
              Inspect a replay proof <ArrowRight size={16} />
            </Link>
          </div>
          <div className="landing-proof__flow" aria-label="Auditable system flow">
            <span>TxLINE SSE</span><ArrowRight /><span>Normalized tick</span><ArrowRight /><span>Eleven strategies</span><ArrowRight /><span>Merkle ledger</span>
          </div>
        </section>

        <section className="landing-final" aria-labelledby="final-title">
          <div>
            <span className="landing-mono-label">The whole decision chain, live</span>
            <h2 id="final-title">Don’t trust the black box.<br />Open it.</h2>
          </div>
          <div>
            <p>Enter the live session, or replay a deterministic 41′ goal shock from observation through execution.</p>
            <Link className="landing-button landing-button--primary" href="/?demo=act2&contract=match_1x2">
              Launch the replay <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="landing-brand landing-brand--footer" href="/"><span className="landing-mark" aria-hidden="true"><i /></span><span>Sweeper</span></Link>
        <p>Autonomous football contract research. Shadow execution only.</p>
        <a href="https://github.com/Anuragt1104/sweeper" target="_blank" rel="noreferrer">GitHub <ArrowRight size={14} /></a>
      </footer>
    </div>
  );
}
