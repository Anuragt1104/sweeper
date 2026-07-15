import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SIMULATION_BOOTSTRAP } from "@/lib/horizon/bootstrap";
import { HORIZON_OUTCOMES, type FrequencyArtifact } from "@/lib/horizon/probability";

let cached: FrequencyArtifact | null = null;

export function loadFrequencyArtifact(): FrequencyArtifact {
  if (cached) return cached;
  const file = process.env.HORIZON_ARTIFACT_PATH ?? path.join(process.cwd(), "data", "horizon-frequency.json");
  if (!existsSync(file)) return SIMULATION_BOOTSTRAP;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as FrequencyArtifact;
    validateArtifact(parsed);
    cached = parsed;
    return parsed;
  } catch (error) {
    // Invalid user-generated data must not crash replay; the UI truthfully
    // identifies the deterministic fallback as simulation-derived low data.
    console.error(`Rejected Horizon artifact ${file}:`, error instanceof Error ? error.message : "invalid JSON");
    return SIMULATION_BOOTSTRAP;
  }
}

export function validateArtifact(artifact: FrequencyArtifact): void {
  if (!artifact || artifact.version !== 1 || !artifact.provenance || !artifact.rows) throw new Error("Unsupported artifact schema");
  if (artifact.provenance.source !== "txline-historical" && artifact.provenance.source !== "simulation-bootstrap") {
    throw new Error("Invalid artifact source");
  }
  for (const [key, row] of Object.entries(artifact.rows)) {
    for (const outcome of HORIZON_OUTCOMES) {
      if (!Number.isFinite(row[outcome]) || row[outcome] < 0) throw new Error(`Invalid count ${key}/${outcome}`);
    }
  }
}
