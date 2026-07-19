"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

const STEPS = [
  { rail: "Observation", title: "Start with facts", body: "Score, market prices, events, and enrichment stay on the Observation rail." },
  { rail: "Analysis", title: "See the desk boundary", body: "Fair values and Horizon live here. A visible boundary appears whenever no pricing model exists." },
  { rail: "Strategy", title: "Read every stance", body: "Each strategy says what it will do, why, and whether this contract is executable." },
] as const;

export function GuidedTour({ replayToken = 0 }: { replayToken?: number }) {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    const dismissed = window.localStorage.getItem("sweeper-strategy-lab-tour") === "done";
    if (!dismissed || replayToken > 0) setStep(0);
  }, [replayToken]);

  useEffect(() => {
    document.documentElement.dataset.tourRail = step == null ? "" : String(step + 1);
    return () => { document.documentElement.dataset.tourRail = ""; };
  }, [step]);

  if (step == null) return null;
  const item = STEPS[step];
  const dismiss = () => {
    window.localStorage.setItem("sweeper-strategy-lab-tour", "done");
    setStep(null);
  };
  return (
    <aside className="guided-tour" aria-label={`Strategy Lab tour step ${step + 1} of ${STEPS.length}`}>
      <button type="button" className="guided-tour__close" onClick={dismiss} aria-label="Dismiss tour"><X size={15} /></button>
      <span>QUICK TOUR · {step + 1}/{STEPS.length} · {item.rail}</span>
      <strong>{item.title}</strong>
      <p>{item.body}</p>
      <div>{step > 0 ? <button type="button" onClick={() => setStep(step - 1)}>Back</button> : <i />}{step < STEPS.length - 1 ? <button type="button" onClick={() => setStep(step + 1)}>Next <ArrowRight size={13} /></button> : <button type="button" onClick={dismiss}>Enter the Lab</button>}</div>
    </aside>
  );
}

