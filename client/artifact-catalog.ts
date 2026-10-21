/**
 * Client-side card catalog and reprojection policy.
 *
 * Paseo projects a timeline by calling each registered transformer per row. A
 * transformer cannot see sibling rows, so a purely local "seen this artifact"
 * map is order-dependent and can leave a gap: the row that was dropped may be
 * the only one the host actually projects after a reload or an artifact change.
 *
 * This catalog keeps the best reference seen for each artifact and a stable
 * canonical row (call id). Re-registering the transformer publishes a new
 * plugin snapshot, which makes Paseo replay every timeline in order with the
 * catalog's current decisions. The catalog therefore drives re-projection when:
 *
 * - a new artifact appears (the catalog changed), or
 * - a better reference replaces a path-only recovery (marker wins), or
 * - a complete render row still has no recoverable reference (a gap).
 *
 * It is pure and has no React or host imports so the policy is unit-testable.
 */
import type { ReportCardData } from "../shared/protocol.ts";
import type { ReferenceSource } from "../shared/recognize.ts";

export interface ObservedCard {
  readonly data: ReportCardData;
  readonly source: ReferenceSource;
  readonly callId: string;
}

export interface RecordCardResult {
  /** This call id is the artifact's canonical row and should render a card. */
  readonly show: boolean;
  /** The catalog changed enough that a re-projection is warranted. */
  readonly changed: boolean;
}

const SOURCE_RANK: Readonly<Record<ReferenceSource, number>> = { path: 0, marker: 1 };

export class ArtifactCatalog {
  private readonly best = new Map<string, ObservedCard>();
  private readonly canonical = new Map<string, string>();
  /** callId -> last phase seen for a render row with no recoverable card. */
  private readonly gaps = new Map<string, "streaming" | "complete">();
  private dirty = false;
  private generation = 0;

  /**
   * Records a recognized card. A marker always beats a path-only recovery; two
   * references of equal quality keep the first as canonical so re-projection is
   * stable. Returns whether this row should render and whether to reproject.
   */
  record(input: ObservedCard): RecordCardResult {
    const prior = this.best.get(input.data.artifactId);
    if (prior && SOURCE_RANK[input.source] <= SOURCE_RANK[prior.source]) {
      return { show: this.canonical.get(input.data.artifactId) === input.callId, changed: false };
    }
    const previousCanonical = this.canonical.get(input.data.artifactId);
    this.best.set(input.data.artifactId, input);
    this.canonical.set(input.data.artifactId, input.callId);
    const changed = prior === undefined || previousCanonical !== input.callId;
    if (changed) this.dirty = true;
    return { show: true, changed };
  }

  /**
   * Records a render row whose reference could not be recovered. A complete
   * phase triggers exactly one re-projection: streaming output may still be
   * missing the marker, and re-running the row later is the only way to fill
   * that gap. Repeating the same complete gap does not loop.
   */
  noteGap(callId: string, phase: "streaming" | "complete" = "complete"): boolean {
    if (!callId) return false;
    const prior = this.gaps.get(callId);
    if (prior === "complete") return false;
    this.gaps.set(callId, phase);
    if (phase !== "complete") return false;
    this.dirty = true;
    return true;
  }

  /** Consumes the pending re-projection signal. */
  takeDirty(): boolean {
    const value = this.dirty;
    this.dirty = false;
    return value;
  }

  /** Called immediately before the transformers are re-registered. */
  beginGeneration(): void {
    this.generation += 1;
  }

  canonicalCallId(artifactId: string): string | undefined {
    return this.canonical.get(artifactId);
  }

  card(artifactId: string): ObservedCard | undefined {
    return this.best.get(artifactId);
  }

  isGap(callId: string): boolean {
    return this.gaps.has(callId);
  }

  get gapCount(): number {
    return this.gaps.size;
  }

  get currentGeneration(): number {
    return this.generation;
  }
}
