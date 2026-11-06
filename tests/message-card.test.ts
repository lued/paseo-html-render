/**
 * Timeline projection decisions, driven through the exact production functions.
 *
 * The regression these tests cover: commit bcacdcc deleted the
 * `assistant_message` transformer, so a reply that carries the artifact link
 * rendered no card, and the only remaining card surfaces were the collapsed
 * tool row and the daemon's in-memory response row. After a rebuild, five
 * replies on one host showed zero cards. These tests rebuild such a timeline
 * from persisted rows and assert one card, no hidden reply text, and no
 * duplicate when the live response row is present.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ArtifactCatalog } from "../client/artifact-catalog.ts";
import {
  noteRenderGap,
  projectAssistantMessage,
  projectToolCall,
  recordResponseCard,
  type Projection,
  type ToolCallRow,
} from "../client/card-projection.ts";
import { PRODUCTION_IDENTITY } from "../shared/identity.ts";
import type { ReportCardData } from "../shared/protocol.ts";
import { encodeReportReference } from "../shared/recognize.ts";

const IDENTITY = PRODUCTION_IDENTITY;
const ARTIFACT = "0123456789abcdef0123456789abcdef";
const OTHER = "fedcba9876543210fedcba9876543210";

const card = (artifactId = ARTIFACT, title = "Latency report"): ReportCardData => ({
  artifactId,
  title,
  summary: null,
  width: 728,
  height: 600,
  renderMode: "auto",
});
const MARKER = encodeReportReference(card());
const LINK = `[Open interactive report](</home/x/.paseo/plugin-data/html-render/artifacts/${ARTIFACT}/interactive.html>)`;

type Row =
  | { readonly kind: "tool"; readonly name: string; readonly text: string }
  | { readonly kind: "reply"; readonly text: string };

const renderRow = (text = MARKER): Row => ({ kind: "tool", name: "mcp__html_render_v3__html_render", text });
const replyRow = (text: string): Row => ({ kind: "reply", text });

/** One host replay pass: rows in timeline order, then a bounded settle. */
function replay(rows: readonly Row[], catalog: ArtifactCatalog, passes = 4): Projection[] {
  let cards: Projection[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    catalog.beginGeneration();
    const onChanged = () => {
      changed = true;
    };
    cards = [];
    for (const row of rows) {
      const projected = row.kind === "tool"
        ? projectToolCall({ name: row.name, detail: { type: "plain_text", text: row.text }, callId: "call-1" },
          IDENTITY, catalog, onChanged)
        : projectAssistantMessage({ text: row.text }, IDENTITY, catalog, onChanged);
      if (projected) cards.push(projected);
    }
    if (!changed) break;
  }
  return cards;
}

/** A live turn ends: the daemon's response row mounts and records itself. */
function mountResponse(catalog: ArtifactCatalog, data: ReportCardData = card()): void {
  recordResponseCard(data, catalog, () => {});
}

test("a rebuilt timeline projects the card on the reply that carries the link", () => {
  const catalog = new ArtifactCatalog();
  const cards = replay([renderRow(), replyRow(`Rendered latency.\n\n${LINK}\n`)], catalog);
  assert.equal(cards.length, 1, "one artifact shows exactly one card after settling");
  const [projection] = cards;
  assert.equal(projection?.items[0]?.kind, IDENTITY.messageRendererKind);
  assert.equal(projection?.items[0]?.data.artifactId, ARTIFACT);
  // The reply text travels with the card, so the reply is never hidden.
  assert.match(String(projection?.items[0]?.data.text), /Rendered latency\./);
  assert.match(String(projection?.items[0]?.data.text), /Open interactive report/);

  // A settled catalog keeps deciding the same way on later replays.
  const again = replay([renderRow(), replyRow(`Rendered latency.\n\n${LINK}\n`)], catalog);
  assert.deepEqual(again.map((item) => item.items[0]?.kind), [IDENTITY.messageRendererKind]);
});

test("a reply carrying the 3.x marker also projects the card", () => {
  const catalog = new ArtifactCatalog();
  const cards = replay([renderRow(), replyRow(`Done.\n\n${MARKER}\n`)], catalog);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.items[0]?.kind, IDENTITY.messageRendererKind);
  assert.equal(cards[0]?.items[0]?.data.title, "Latency report");
});

test("with the live response row present the artifact still shows one card", () => {
  const catalog = new ArtifactCatalog();
  const rows = [renderRow(), replyRow(`Rendered.\n\n${LINK}\n`)];
  // The daemon appended its response row and the host mounted it.
  mountResponse(catalog, card(ARTIFACT, "Durable title"));
  const cards = replay(rows, catalog);
  assert.equal(cards.length, 0, "the mounted response row is the only card");

  // The reply and the tool row keep their native rendering: the reply text is
  // preserved by the host and the fold anchor stays intact.
  for (const row of rows) {
    const projected = row.kind === "tool"
      ? projectToolCall({ name: row.name, detail: { text: row.text }, callId: "call-1" }, IDENTITY, catalog, () => {})
      : projectAssistantMessage({ text: row.text }, IDENTITY, catalog, () => {});
    assert.equal(projected, undefined);
  }
});

test("a reply that names two artifacts keeps its native rendering", () => {
  const catalog = new ArtifactCatalog();
  const ambiguous = `A and B.\n\n${LINK}\nartifacts/${OTHER}/interactive.html\n`;
  const cards = replay([renderRow(), replyRow(ambiguous)], catalog);
  assert.equal(cards.length, 1, "the tool row still carries the card");
  assert.equal(cards[0]?.items[0]?.kind, IDENTITY.rendererKind);
});

test("the tool row alone never yields a second card once the reply owns it", () => {
  const catalog = new ArtifactCatalog();
  replay([renderRow(), replyRow(`Rendered.\n\n${LINK}\n`)], catalog);
  // After settling, the tool row keeps its native work rendering.
  assert.equal(
    projectToolCall({ name: "mcp__html_render_v3__html_render", detail: { text: MARKER }, callId: "call-1" },
      IDENTITY, catalog, () => {}),
    undefined,
  );
  assert.equal(catalog.canonicalCallId(ARTIFACT), `message:${ARTIFACT}`);
});

test("an unrelated reply or tool row is never transformed", () => {
  const catalog = new ArtifactCatalog();
  assert.equal(projectAssistantMessage({ text: "Here is the answer." }, IDENTITY, catalog, () => {}), undefined);
  assert.equal(projectAssistantMessage({ text: "" }, IDENTITY, catalog, () => {}), undefined);
  assert.equal(
    projectToolCall({ name: "bash", detail: { text: MARKER } }, IDENTITY, catalog, () => {}),
    undefined,
  );
  assert.equal(noteRenderGap({ name: "bash", callId: "call-1" }, "complete", catalog), false);
});

test("a render row with no reference asks for exactly one re-projection", () => {
  const catalog = new ArtifactCatalog();
  const row: ToolCallRow = { name: "mcp__html_render_v3__html_render", callId: "call-9" };
  assert.equal(noteRenderGap(row, "streaming", catalog), false);
  assert.equal(noteRenderGap(row, "complete", catalog), true);
  assert.equal(noteRenderGap(row, "complete", catalog), false);
});
