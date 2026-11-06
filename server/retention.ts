/**
 * Bounded, reference-safe artifact retention planning.
 *
 * Why this is a planner plus an owner command instead of a background job:
 * a published card is referenced from provider history (the reply's artifact
 * link or the persisted marker) and from the daemon's in-memory response rows.
 * The plugin can read neither reliably from disk, and deleting an artifact that
 * any conversation still links to turns a published HTML report into a broken
 * card. So nothing is deleted automatically, the default stays "keep forever",
 * and the destructive step is an explicit operator command (`npm run
 * prune:artifacts`, `scripts/prune-artifacts.mjs`) which must prove which ids are
 * still referenced before it may remove anything.
 *
 * The rules below are deliberately conservative and pure, so they are unit
 * testable and a caller cannot accidentally invert them:
 *
 * - an id in `referenced` is never deleted, whatever its age;
 * - an artifact newer than `olderThanMs` is never deleted;
 * - only a well-formed 32-hex artifact id can be a candidate;
 * - deletion is oldest-first and bounded by count and bytes.
 */
/** Artifact directory names are lowercase hex; nothing else is a candidate. */
const ARTIFACT_ID = /^[0-9a-f]{32}$/;

export interface RetentionArtifact {
  readonly artifactId: string;
  /** Epoch milliseconds, normally the manifest `createdAt`. */
  readonly createdAt: number;
  readonly bytes: number;
}

export interface RetentionRequest {
  readonly artifacts: readonly RetentionArtifact[];
  /** Ids proven to be referenced by a conversation; never deleted. */
  readonly referenced: ReadonlySet<string>;
  readonly now: number;
  /** Only artifacts strictly older than this are candidates. */
  readonly olderThanMs: number;
  /** Defaults: 200 artifacts and 512 MiB per run. */
  readonly maxDeletes?: number;
  readonly maxDeleteBytes?: number;
}

export interface RetentionPlan {
  readonly delete: readonly RetentionArtifact[];
  readonly deleteBytes: number;
  /** Count and bytes of everything considered. */
  readonly totalArtifacts: number;
  readonly totalBytes: number;
  readonly keptReferenced: number;
  readonly keptRecent: number;
  /** Candidates that did not fit the caps. */
  readonly keptOverCap: number;
  /** Entries ignored because the id or timestamp is not trustworthy. */
  readonly ignored: number;
}

export const DEFAULT_MAX_DELETES = 200;
export const DEFAULT_MAX_DELETE_BYTES = 512 * 1_048_576;

/** Largest accepted artifact-directory count in one listing. */
export const MAX_RETENTION_CANDIDATES = 100_000;

function isSafeCount(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/**
 * Plans one prune run. Pure: no I/O, no clock, no deletion. The caller supplies
 * the reference set, which is the only thing that makes deletion safe.
 */
export function planRetention(request: RetentionRequest): RetentionPlan {
  const maxDeletes = isSafeCount(request.maxDeletes, DEFAULT_MAX_DELETES);
  const maxDeleteBytes = isSafeCount(request.maxDeleteBytes, DEFAULT_MAX_DELETE_BYTES);
  const seen = new Set<string>();
  const candidates: RetentionArtifact[] = [];
  let totalArtifacts = 0;
  let totalBytes = 0;
  let keptReferenced = 0;
  let keptRecent = 0;
  let ignored = 0;
  for (const artifact of request.artifacts.slice(0, MAX_RETENTION_CANDIDATES)) {
    const validId = ARTIFACT_ID.test(artifact.artifactId);
    const validTime = Number.isFinite(artifact.createdAt) && artifact.createdAt > 0;
    const validBytes = Number.isFinite(artifact.bytes) && artifact.bytes >= 0;
    if (!validId || !validTime || !validBytes || seen.has(artifact.artifactId)) {
      ignored += 1;
      continue;
    }
    seen.add(artifact.artifactId);
    totalArtifacts += 1;
    totalBytes += artifact.bytes;
    if (request.referenced.has(artifact.artifactId)) {
      keptReferenced += 1;
      continue;
    }
    if (request.now - artifact.createdAt < request.olderThanMs) {
      keptRecent += 1;
      continue;
    }
    candidates.push(artifact);
  }
  // Oldest first, then id, so two runs over the same store agree.
  candidates.sort((left, right) => left.createdAt - right.createdAt ||
    left.artifactId.localeCompare(right.artifactId));
  const doomed: RetentionArtifact[] = [];
  let deleteBytes = 0;
  for (const candidate of candidates) {
    if (doomed.length >= maxDeletes) break;
    if (deleteBytes + candidate.bytes > maxDeleteBytes) break;
    doomed.push(candidate);
    deleteBytes += candidate.bytes;
  }
  return {
    delete: doomed,
    deleteBytes,
    totalArtifacts,
    totalBytes,
    keptReferenced,
    keptRecent,
    keptOverCap: candidates.length - doomed.length,
    ignored,
  };
}

const AGE_PATTERN = /^(\d+(?:\.\d+)?)\s*(m|h|d|w)?$/i;

/**
 * Parses `30d`, `12h`, `90m`, `2w` or a bare number of days. Returns `null` for
 * anything else so the command can refuse instead of guessing a duration.
 */
export function parseRetentionAge(text: string): number | null {
  const match = AGE_PATTERN.exec(text.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] ?? "d").toLowerCase();
  const minutes = unit === "m" ? amount : unit === "h" ? amount * 60 : unit === "d" ? amount * 1_440 : amount * 10_080;
  return Math.round(minutes * 60_000);
}
