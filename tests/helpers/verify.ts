/**
 * Autonomous verification evidence.
 *
 * Every gate in `tests/e2e-verify.test.ts` records a machine-readable result
 * here. The report maps each gate to the stable PQ ids in
 * `docs/t3-parity-quality-matrix.md`, so a rating change can always be traced
 * back to a reproducible run instead of a human visual inspection.
 *
 * Evidence lives outside the repository (private, 0700/0600):
 *   $PASEO_HTML_RENDER_EVIDENCE_DIR
 *   or ~/.paseo/plugin-data/html-render/verification-<YYYYMMDD>
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type GateStatus = "pass" | "fail" | "blocked" | "unavailable";

export interface GateResult {
  /** Stable gate id, e.g. "G2". */
  id: string;
  title: string;
  /** Matrix rows this gate covers. */
  pq: string[];
  status: GateStatus;
  detail: string;
  evidence: string[];
  /** Set for `fail`; never treated as a pass. */
  error?: string;
}

export const EVIDENCE_DIR =
  process.env.PASEO_HTML_RENDER_EVIDENCE_DIR?.trim() ||
  join(
    homedir(),
    ".paseo",
    "plugin-data",
    "html-render",
    `verification-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
  );

const gates: GateResult[] = [];

export async function prepareEvidence(): Promise<void> {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(EVIDENCE_DIR, 0o700);
}

export function evidencePath(name: string): string {
  return join(EVIDENCE_DIR, name);
}

export async function writeEvidence(name: string, content: string | Buffer): Promise<string> {
  const path = evidencePath(name);
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await fs.writeFile(path, content, { mode: 0o600 });
  return path;
}

export async function writeEvidenceJson(name: string, value: unknown): Promise<string> {
  return writeEvidence(name, `${JSON.stringify(value, null, 2)}\n`);
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Runs one gate. The body returns `{ status, detail, evidence }` or throws.
 * A thrown error is recorded as a failed gate and rethrown so `node --test`
 * reports it too; a throw can never be silently upgraded to a pass.
 */
export async function gate(
  input: { id: string; title: string; pq: string[] },
  body: () => Promise<{ status?: GateStatus; detail: string; evidence?: string[] }>,
): Promise<GateResult> {
  try {
    const result = await body();
    const record: GateResult = {
      id: input.id,
      title: input.title,
      pq: input.pq,
      status: result.status ?? "pass",
      detail: result.detail,
      evidence: result.evidence ?? [],
    };
    gates.push(record);
    return record;
  } catch (error) {
    const record: GateResult = {
      id: input.id,
      title: input.title,
      pq: input.pq,
      status: "fail",
      detail: "gate failed",
      evidence: [],
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ""}`.trim() : String(error),
    };
    gates.push(record);
    throw error;
  }
}

export interface GateReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  evidenceDir: string;
  identity: { pluginId: string; markerPrefix: string };
  environment: Record<string, string>;
  summary: { pass: number; fail: number; blocked: number; unavailable: number };
  gates: GateResult[];
}

export async function finishReport(startedAt: string, environment: Record<string, string>): Promise<GateReport> {
  const summary = { pass: 0, fail: 0, blocked: 0, unavailable: 0 };
  for (const item of gates) summary[item.status] += 1;
  const report: GateReport = {
    runId: `e2e-${startedAt.replaceAll(/[^0-9]/g, "").slice(0, 14)}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    evidenceDir: EVIDENCE_DIR,
    identity: { pluginId: "html-render", markerPrefix: "paseo-html-render:v1:" },
    environment,
    summary,
    gates,
  };
  await writeEvidenceJson("report.json", report);
  const lines = gates.map((item) => {
    const rows = item.pq.join(",");
    return `${item.status.toUpperCase().padEnd(11)} ${item.id.padEnd(3)} [${rows}] ${item.title}${
      item.error ? `\n            ${item.error.split("\n")[0]}` : ""
    }`;
  });
  console.log(`\n=== autonomous verification (${report.runId}) ===\n${lines.join("\n")}`);
  console.log(
    `summary: ${summary.pass} pass, ${summary.fail} fail, ${summary.blocked} blocked, ${summary.unavailable} unavailable`,
  );
  console.log(`evidence: ${EVIDENCE_DIR}`);
  return report;
}
