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

/**
 * Rank of a reference's origin when several rows name the same artifact.
 *
 * `response` is the persisted row appended after the turn: it is the only card
 * that survives `collapseTurns`, so it wins over every projected row and the
 * projected tool card is dropped in favour of it.
 */
const SOURCE_RANK: Readonly<Record<ReferenceSource, number>> = {
  path: 0,
  marker: 1,
  message: 2,
  response: 3,
};

export interface ArtifactCatalog {
  record(input: ObservedCard): RecordCardResult;
  noteGap(callId: string, phase?: "streaming" | "complete"): boolean;
  takeDirty(): boolean;
  beginGeneration(): void;
  canonicalCallId(artifactId: string): string | undefined;
  card(artifactId: string): ObservedCard | undefined;
  isGap(callId: string): boolean;
  readonly gapCount: number;
  readonly currentGeneration: number;
}

type ArtifactCatalogConstructor = new () => ArtifactCatalog;

/**
 * Function constructor intentionally, not a class expression.
 *
 * The host evaluates the whole client bundle with `eval` in Hermes. Hermes
 * 0.12 loses class-expression initializers when that eval source is large
 * (the production bundle reaches this module as undefined). Keeping the
 * catalog class-free preserves its dedupe policy and lets the bundle initialize.
 */
function createArtifactCatalog(this: ArtifactCatalog): void {
  const best = new Map<string, ObservedCard>();
  const canonical = new Map<string, string>();
  /** callId -> last phase seen for a render row with no recoverable card. */
  const gaps = new Map<string, "streaming" | "complete">();
  let dirty = false;
  let generation = 0;
  const catalog = this;

  /**
   * Records a recognized card. A marker always beats a path-only recovery; two
   * references of equal quality keep the first as canonical so re-projection is
   * stable. Returns whether this row should render and whether to reproject.
   */
  catalog.record = (input) => {
    const prior = best.get(input.data.artifactId);
    if (prior && SOURCE_RANK[input.source] <= SOURCE_RANK[prior.source]) {
      return { show: canonical.get(input.data.artifactId) === input.callId, changed: false };
    }
    const previousCanonical = canonical.get(input.data.artifactId);
    best.set(input.data.artifactId, input);
    canonical.set(input.data.artifactId, input.callId);
    const changed = prior === undefined || previousCanonical !== input.callId;
    if (changed) dirty = true;
    return { show: true, changed };
  };

  /**
   * Records a render row whose reference could not be recovered. A complete
   * phase triggers exactly one re-projection: streaming output may still be
   * missing the marker, and re-running the row later is the only way to fill
   * that gap. Repeating the same complete gap does not loop.
   */
  catalog.noteGap = (callId, phase = "complete") => {
    if (!callId) return false;
    const prior = gaps.get(callId);
    if (prior === "complete") return false;
    gaps.set(callId, phase);
    if (phase !== "complete") return false;
    dirty = true;
    return true;
  };

  /** Consumes the pending re-projection signal. */
  catalog.takeDirty = () => {
    const value = dirty;
    dirty = false;
    return value;
  };

  /** Called immediately before the transformers are re-registered. */
  catalog.beginGeneration = () => {
    generation += 1;
  };

  catalog.canonicalCallId = (artifactId) => canonical.get(artifactId);
  catalog.card = (artifactId) => best.get(artifactId);
  catalog.isGap = (callId) => gaps.has(callId);
  Object.defineProperties(catalog, {
    gapCount: { enumerable: false, get: () => gaps.size },
    currentGeneration: { enumerable: false, get: () => generation },
  });
}

export const ArtifactCatalog = createArtifactCatalog as unknown as ArtifactCatalogConstructor;
