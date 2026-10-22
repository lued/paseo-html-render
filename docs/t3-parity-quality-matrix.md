# T3 inline HTML → Paseo implementation quality

Inspected and re-verified 2026-10-21. This rates the **installed `html-render`
plugin 2.1.0** built from this directory. **V1 is permanently retired and
unregistered at user request.** The five-workspace canary methodology was retired
by the user on 2026-10-20; it is replaced by one autonomous harness,
`npm run verify:e2e`, whose gates are mapped to PQ ids below.

This file is the authoritative master sheet. Stable PQ IDs must not be renumbered
or removed. Every rating change must record the affected ID, evidence layer,
independently verified result, and remaining gate in the iteration ledger below.
A green row means a gate in `tests/e2e/verify.test.ts` or a committed unit test
covers it; human visual inspection is not an accepted evidence layer.

**Legend:** ✅ green check = solid implementation for the stated goal, supported
by the cited evidence; ⚠️ yellow stop/caution = partial, deliberately different,
unsupported, or not sufficiently verified; ❌ red x = missing capability, known
functional gap, or failed acceptance/constraint. A green check is **not** a claim
of production/native acceptance. Plugin additions are not counted as T3 parity.

Ratings distinguish T3 source behavior from our tests. T3's complete test suite
was not executed. The scope is the inspected inline-HTML pipeline, not every
feature of T3 or every private design rationale.

## 1. Tools, storage and delivery

| ID | Feature / decision | T3 Code | Paseo plugin 2.1.0: quality and difference |
| --- | --- | --- | --- |
| PQ-001 | Architecture | First-party server/assets/web/mobile integration | ⚠️ External public-SDK plugin; raw web iframe remains unsupported by that SDK. |
| PQ-002 | Provider coverage | Documented across providers | ⚠️ MCP injection exists; actual end-to-end evidence covers Pi only. |
| PQ-003 | Preview tool | `html_preview(html,width?,appearance?)` | ✅ Same basic tool contract, real adapter/daemon smoke passed. |
| PQ-004 | Publish tool | `html_render(html,title,height)` | ✅ Same required input concepts; real publication passed. |
| PQ-005 | Optional inputs | Inline HTML contract | ✅ Additive `summary`, `renderMode`, `report`; extras, not T3 parity credit. |
| PQ-006 | Width normalization | Default728, round/clamp240–1600 | ⚠️ Same range/default; plugin rejects invalid/fractional widths instead. |
| PQ-007 | Frame height/title | Height80–2000; bounded title with normalization | ⚠️ Bounds preserved; strict rejection differs from T3 normalization/fallbacks. |
| PQ-008 | HTML input budget | Observed tool bound512,000 characters; larger prepared page | ⚠️ Same character bound; original additionally capped512,000 UTF-8 bytes. |
| PQ-009 | Published identity | `attachmentId` reference | ⚠️ `artifactId` plus metadata; deliberately not wire-identical. |
| PQ-010 | Original preservation | Stores prepared HTML | ✅ Stores byte-exact original separately from prepared interactive copy; extra protection. |
| PQ-011 | Saved assets | Published HTML; separate preview operation | ✅ Original, interactive, manifest/report, light/dark previews and optional graph PNGs. |
| PQ-012 | Ownership scope | Thread/environment-owned attachment | ⚠️ Workspace-owned with agent/workspace-checked RPC reads; different lifecycle granularity. |
| PQ-013 | Client delivery | First-party asset route | ⚠️ Plugin RPC plus `srcDoc`; no first-party attachment integration. |
| PQ-014 | Signed URL lifecycle | Cached URLs; refresh near expiry; retain mounted source | ⚠️ RPC cache/stable document avoids expiry, but does not implement T3's asset pipeline. |
| PQ-015 | File name | Sanitized title-derived `.html` | ⚠️ Fixed `interactive.html` inside artifact ID directory. |
| PQ-016 | Assistant link | Inline attachment presentation | ⚠️ Absolute Markdown file link is a host-preview compatibility workaround. |
| PQ-017 | File-preview click-through | First-party viewer/navigation | ✅ G6: in the hosted web client the assistant file link opened `interactive.html` as a second sandboxed, CSP-carrying frame. Native file preview remains unverified (PQ-125). |
| PQ-018 | Persisted reconstruction | Structured tool-result reference | ✅ Actual persisted outer Pi codemode row reconstructs one card per row, stable after serialization. 2.1.0 also recovers a card from a surviving `artifacts/<id>/` path (regression `b49e8050`) and stores a durable `card.json` beside the artifact, so a marker lost to an output cap does not lose the card or its display mode. |
| PQ-019 | Cross-row deduplication | First-party reference/tool processing; no global guarantee inferred | ✅ G4: only the render tool's own row is transformed, so Pi's outer `codemode` row no longer duplicates the card (reproduced in the hosted client before the fix, one card after). 2.1.0 adds a client artifact catalog: a stable canonical call id, marker-over-path preference, and one bounded re-projection when the catalog changes or a render row is a gap. Residual: a per-item transformer cannot see an arbitrary third row, so a marker duplicated there is still outside the contract. |
| PQ-020 | Thread deletion | Deletes owned renders; fork ownership protects source pages | ❌ Equivalent thread-owned deletion not implemented. |
| PQ-021 | Retention | Follows thread lifecycle | ⚠️ Retain by default; opt-in workspace archive purge is tested but different. |
| PQ-022 | Interrupted writes | Scoped cleanup removes interrupted publication | ✅ Cancellation checkpoints/atomic writes; disconnected-publish regression passed. |
| PQ-023 | Agent stopped/history use | Durable attachment | ✅ Persisted artifact does not require the authoring agent to remain actively running; workspace authorization still applies. |

## 2. Display, interaction and native behavior

| ID | Feature / decision | T3 Code | Paseo plugin 2.1.0: quality and difference |
| --- | --- | --- | --- |
| PQ-024 | Live web/desktop HTML | Sandboxed live iframe | ✅ G2 + G6: sandboxed live iframe verified in Chromium and in the hosted client timeline (one card, script state, CSP). |
| PQ-025 | Borderless presentation | Reply-aligned HTML, no outer report card | ✅ G2 asserts the live card renders no parent chrome text; G6 shows the same borderless card in the hosted client. |
| PQ-026 | Live scripts | Run inside isolated page | ✅ Inline script execution works in browser tests. |
| PQ-027 | Native arbitrary HTML | Real mobile WebView renders same page | ❌ No native HTML/WebView surface in the public Paseo plugin SDK; not implemented. |
| PQ-028 | Native semantic equivalence | Same arbitrary HTML page | ❌ Structured JSON is an alternative representation, not equivalent arbitrary HTML. |
| PQ-029 | Native overflow/drag handoff | Overflow detection and nested-scroll/Android edge coordination | ❌ No equivalent native HTML gesture pipeline. |
| PQ-030 | Mobile HTML loading | WebView loading indicator | ⚠️ Native report/RPC loading states only, not WebView loading. |
| PQ-031 | Mobile process crash recovery | One WebView restart, then failure | ❌ No corresponding native HTML recovery capability. |
| PQ-032 | Mobile HTML retry | Asset refresh/retry and reload action | ❌ No equivalent native HTML retry flow; RPC retries do not replace it. |
| PQ-033 | Web lazy loading | `loading="lazy"` | ⚠️ Added 2026-10-20, then removed the same day: an offscreen frame never loaded, the ready timeout fired, and the card wrongly degraded to an image. The live frame now loads eagerly; timeline virtualization already bounds work. |
| PQ-034 | Live failure detection | Asset failure/unavailable state | ⚠️ Deliberately no failure hand-off. The user removed the image fallback entirely after it substituted a PNG for a render that was merely offscreen. The frame now stays mounted; an unreadable artifact shows a one-line error, never a picture. |
| PQ-035 | Static fallback | Not primary inline design in inspected T3 path | ⚠️ PNG remains only as an explicit `renderMode: "static"` choice and as the native client's display (no iframe exists there). It is never substituted for a failed live render. |
| PQ-036 | Display mode selection | HTML reference selects HTML renderer | ✅ `auto`/`iframe`/`static` gate tested; static uses report if present, otherwise PNG. |
| PQ-037 | Fullscreen | Web dialog/second document; mobile attachment navigation | ⚠️ Removed at user request. This matches revised scope, not T3 feature parity. |
| PQ-038 | Original fullscreen architecture | Dedicated app dialog, separate iframe on web | ❌ Initial plugin custom fixed-overlay design was not faithful and was removed after the user reported bugs. Historical failure, not remaining feature. |
| PQ-039 | Fullscreen zoom | 50–200%,25% steps, reset | ⚠️ Toolbar/state removed with fullscreen; no substitute inline zoom toolbar. |
| PQ-040 | Fullscreen permission | App-level expanded UI | ✅ Revised iframe explicitly denies browser fullscreen; mounted `fullscreenEnabled=false`, no controls/dialog/fixed overlay. |
| PQ-041 | Image enlargement | Existing web image viewer; HTTP(S)/data images | ⚠️ Separate data-URI image modal, not equivalent host image-viewer integration. |
| PQ-042 | External links | Host routing, including change-request links | ⚠️ Public external opener only; no equivalent internal/change-request routing. |
| PQ-043 | Link/image activation | Frame source/focus/activation gates | ✅ Source/focus checks and stricter `isActive===true` requirement; fails closed. |
| PQ-044 | Modifier-click routing | Cmd/Ctrl external routing distinction | ❌ Modifiers parsed, but no equivalent host routing distinction implemented. |
| PQ-045 | App shortcut forwarding | Allowlisted chords with conflict/input safeguards | ❌ No shortcut replay; SDK has no suitable public command bridge. |
| PQ-046 | Keyboard dismiss | Fullscreen/dialog behavior in app | ✅ Removed plugin host Escape listener and embedded dismiss protocol with fullscreen. |
| PQ-047 | Virtualized row pinning | Host notified while fullscreen/image viewer is active | ⚠️ No equivalent public virtualization-pinning integration; image preview less integrated. |

## 3. Theme, typography and responsive layout

| ID | Feature / decision | T3 Code | Paseo plugin 2.1.0: quality and difference |
| --- | --- | --- | --- |
| PQ-048 | CSS token families | Surfaces/text, inputs/ring, primary/accent, status, code, charts1–6, radius/fonts | ✅ Compatible broad token vocabulary, sanitized and covered by tests. |
| PQ-049 | Exact palette semantics | Distinct first-party theme roles | ⚠️ Same token names and base stylesheet. Tinted surfaces (`--destructive-surface`, `--warning-surface`, `--accent-surface`) and `--input` are now reconstructed by blending the status color over the card, and error/warning foregrounds use T3's values. Remaining aliases: `--secondary` and `--code-background` borrow surface tones because the plugin theme exposes no secondary/code roles. |
| PQ-050 | Appearance selection | Explicit resolved light/dark | ⚠️ Infers from surface luminance because SDK lacks appearance field; optional override. |
| PQ-051 | Custom palette updates | Subscribes to custom theme registry changes | ⚠️ Follows supplied host palette props; no own registry integration. |
| PQ-052 | User-selected fonts | UI/code font preferences | ❌ No matching host font-preference integration; default font stacks only. |
| PQ-053 | Initial theme | Fragment theme applied synchronously then removed | ✅ Initial host tokens embedded before page markup; no fragment needed with `srcDoc`. |
| PQ-054 | Live theme without reload | Rewrite own style element through messages | ✅ Stable iframe/document and preserved script state verified in mounted Chromium. |
| PQ-055 | Theme change during load | Repost current theme on load | ✅ Ready/load path reposts current theme. |
| PQ-056 | Export OS appearance | Default dark/light CSS media preference | ✅ Same general self-contained export behavior. |
| PQ-057 | CSS value validation | Strip declaration-breaking data; validate token names | ✅ Additional bounds/resource/executable-value filtering; tested. |
| PQ-058 | Base stylesheet | Margin/font/code/scrollbar/focus/image defaults | ⚠️ Similar conventions, not a pixel-perfect copy. |
| PQ-059 | Early bootstrap placement | Head/html scan avoiding inert content | ✅ Leading bootstrap/CSP with malformed-doctype/inert-markup regressions. Different algorithm, tested boundary. |
| PQ-060 | Old export migration | Prepared attachment served | ✅ Recognized old bootstrap replaced once; live artifact upgrade preserves inlined image and host theme. |
| PQ-061 | Wrapper width observation | Resize-driven reply-column fitting | ✅ Implemented; width/height helpers and mounted behavior tested. |
| PQ-062 | Measurement widths | 320,375,430,520,640,728,860,1000,1144 | ✅ Same nine widths, one shared browser, two pages at a time, single measure timeout. |
| PQ-063 | Neighbor fitting | Taller measurement at surrounding widths | ✅ Same general fitting algorithm. |
| PQ-064 | Runtime height | ResizeObserver/load content-height reports | ✅ Source-checked, bounded updates and spoof rejection tested. |
| PQ-065 | Requested cap semantics | Width728 measurement determines cap behavior; max2000 | ✅ Same general semantics, requested/captured heights separated. |
| PQ-066 | Short-content shrink | Avoid viewport-floor inflation | ✅ Mounted600→100px shrink passes. |
| PQ-067 | Layout authoring guidance | Fluid widths, no outer duplicate card/title, avoid100vh | ⚠️ Similar guidance; not enforced on arbitrary HTML and not actual-client layout acceptance. |

## 4. Security, networking and local assets

| ID | Feature / decision | T3 Code | Paseo plugin 2.1.0: quality and difference |
| --- | --- | --- | --- |
| PQ-068 | Parent/session isolation | Opaque sandbox; no same-origin permission | ✅ Same fundamental iframe isolation; browser tests deny parent access. |
| PQ-069 | Inline permissions | Scripts and forms | ⚠️ Scripts only. Forms deliberately blocked. |
| PQ-070 | Asset response sandbox | HTTP header policy, narrowed further by embedding context | ⚠️ Meta CSP plus iframe sandbox; exported-file host sandbox remains host-owned/unverified. |
| PQ-071 | Live remote assets | Shown policy permits broader remote resources | ⚠️ Remote resources blocked; substantial deliberate capability reduction. |
| PQ-072 | Preview public internet | Public-IP SOCKS proxy permits external resources | ⚠️ Deny-all resources instead; safer/simpler but less capable. |
| PQ-073 | Preview SSRF controls | Private/own/IP-translation checks, DNS pinning, WebRTC bypass prevention | ✅ Deny-all policy plus disabled scripts avoids needing that public-access proxy; zero HTTP-resource hits tested. Not equivalent networking capability. |
| PQ-074 | Eval/blob/remote frameworks | No equivalent eval/resource bans in shown inline policy | ⚠️ No unsafe-eval/blob resources; breaks some libraries by design. |
| PQ-075 | Forms | Inline forms allowed | ⚠️ Sandbox and CSP prohibit forms. |
| PQ-076 | Popups/downloads | Context-dependent; asset policy broader than inline iframe | ⚠️ No live iframe permissions for either. |
| PQ-077 | Direct file URLs | Prevented during preview; images embedded first | ✅ File resources blocked; permitted files enter only through checked inlining. |
| PQ-078 | Local path access | Supported absolute paths accessible to server | ✅ Workspace-contained relative/absolute raster paths; intentionally narrower authority. |
| PQ-079 | Image formats | PNG/JPEG/GIF/WebP/AVIF/SVG/BMP/ICO | ⚠️ PNG/JPEG/GIF/WebP/AVIF only. |
| PQ-080 | Inline SVG | Ordinary HTML/SVG markup | ✅ Supported independently of refusing local SVG files. |
| PQ-081 | MIME checking | Inspect actual bytes | ✅ Magic-byte validation, not extension-only trust. |
| PQ-082 | Symlink/FIFO safety | File/byte validation and bounded reads | ✅ Containment/opened-fd/inode checks; symlink-swap and FIFO regressions pass. |
| PQ-083 | Image byte budget | 10MiB/image | ⚠️ 2MiB/image; more restrictive. |
| PQ-084 | Page byte budget | 25MiB prepared page | ⚠️ Prepared content below8MiB export ceiling; less capacity. |
| PQ-085 | Reference/diagnostic bounds | Deduplicate paths; bounded I/O concurrency | ✅ Adds256 reference/50 diagnostic caps to bound plugin work. |
| PQ-086 | Preview missing images | Preview plus missing-image details | ✅ Bounded diagnostics returned without broadening access. |
| PQ-087 | Publish missing images | Fails publication | ⚠️ Warns and publishes, but now removes the unresolvable local `<img>`/`<source>` tag (and `url()` references under CSS) from the prepared page, so a reader never sees a broken-image glyph. The original HTML is still stored byte-exact. |
| PQ-088 | Link URL validation | HTTP(S) host opening | ✅ Bounded HTTP(S), no credentials; conservative scheme handling. |
| PQ-089 | Self-navigation containment | Link interception is not total navigation containment | ⚠️ Residual location/meta-refresh navigation risk remains; no claim of universal network prevention. |
| PQ-090 | Artifact privacy | First-party attachment access/private caching | ✅ 0700/0600, atomic storage and workspace-checked reads tested. Not encryption or hostile-agent isolation. |

## 5. Renderer, report additions and acceptance

| ID | Feature / decision | T3 Code | Paseo plugin 2.1.0: quality and difference |
| --- | --- | --- | --- |
| PQ-091 | Preview page JavaScript | Executes | ⚠️ Deliberately disabled; security decision, not SDK necessity. |
| PQ-092 | JS-created preview content | Capturable after scripts run | ❌ Cannot faithfully preview JS-only charts/pages without a static skeleton. |
| PQ-093 | Console/error feedback | Up to20 messages,500 chars/message | ❌ Empty console array; no equivalent preview script diagnostics. |
| PQ-094 | Browser acquisition | Managed on-demand download | ❌ No provisioning/download; requires installed Chromium or explicit executable. |
| PQ-095 | Publish without browser | Publishes without measurements | ❌ Required primary PNG makes missing Chromium fatal to publishing. |
| PQ-096 | CDP transport/lifecycle | Debugging pipes/scoped profiles | ⚠️ Loopback WebSocket/private profile/shared renderer; different topology, tested but not equal integration. |
| PQ-097 | Browser sandbox fallback | On by default, explicit operator opt-out | ⚠️ Never no-sandbox; fails closed, less compatible with constrained hosts. |
| PQ-098 | Fonts/paint settlement | Fonts ready and two frames | ⚠️ Web-font readiness is now polled (bounded, 10×20 ms) before capture. The two-frame paint wait is impossible while page scripts are disabled: `fonts.ready.then(rAF)` never resolves and times the render out (verified). Closer, not identical. |
| PQ-099 | Measurement fonts | Arial-metric substitutes | ✅ `HTML_RENDER_MEASURE_FONTS` (`Liberation Sans`/Arimo/Arial/Helvetica, `Liberation Mono`/Cousine) is used for every capture and measurement, mirroring T3. |
| PQ-100 | Viewport | 800px measurement viewport | ✅ 800px for capture and measurement, cropped to T3's content height expression: a short page captures 80 px and a `50vh` block captures 400 px instead of collapsing at a 100 px viewport. |
| PQ-101 | Fresh width loads | Fresh pages; concurrent measurement | ✅ Same principle implemented and tested. |
| PQ-102 | Concurrency | Two browser operations; up to three measure pages | ⚠️ Two rendering tasks/shared browser, not matching topology. |
| PQ-103 | Screenshot height | At most4000px | ✅ Same ceiling; original/full HTML preserved separately. |
| PQ-104 | PNG output size | No matching3MiB cap shown | ✅ 3MiB bound with adaptive vertical clipping, real noisy-SVG regression; may omit lower image content. |
| PQ-105 | Preview timeout | 20s | ⚠️ 15s capture default plus startup budget; different deadline model. |
| PQ-106 | Measurement timeout | 6s, optional | ⚠️ 20s measurement budget; fewer widths and overall call ceiling. |
| PQ-107 | Whole-call cancellation | Effect scope and interruption cleanup | ✅ 60s absolute deadline/disconnect propagation/store checkpoints; regression coverage. |
| PQ-108 | Optional-output failure | Measurement failure does not stop HTML | ✅ Measurements/light preview/graph raster may warn; primary preview still mandatory. |
| PQ-109 | Native report model | Not an inline-HTML schema requirement | ✅ Extra strict non-executable v1 JSON,256KiB/60-block bounds; not native HTML parity. |
| PQ-110 | Ten native blocks | HTML can author arbitrary equivalents | ✅ Heading/text/bullets/steps/callout/code/table/agents/graph/evidence covered by component tests. |
| PQ-111 | Compact report card | HTML itself is the visual reply | ⚠️ Extra outcome/summary/highlights/graph/next-action card. Static card is captured in G2 (`g2-static-card.png`): outcome pill hugs its label, highlights are one-line label/value rows, the path truncates, and the card no longer repeats the artifact title above a page that already prints it. Actual-device quality still unverified. |
| PQ-112 | Five report tabs | HTML-defined UI/first-party viewer | ⚠️ Extra Overview/Findings/Evidence/Run-Usage/Original navigation; shim-tested, not actual-device acceptance. A live web frame now links to the report screen ("View report"), so a supplied report is no longer invisible on web. |
| PQ-113 | Large lists/tables | Authored page controls layout | ⚠️ Bounded windows, expansion and fixed columns implemented; real compact layout/performance unverified. |
| PQ-114 | Graph renderer | Arbitrary HTML/SVG/JS diagrams; no dedicated contract here | ✅ Extra pinnedPele1.7, generated/escaped syntax, validated SVG and inert light/dark PNGs. |
| PQ-115 | Graph limits/list fallback | No matching native JSON graph contract | ✅ 200 nodes/400 edges/100 decisions; native lists survive raster failure. |
| PQ-116 | Graph preemption | General render lifecycle | ⚠️ Synchronous bounded Pele layout cannot be independently interrupted. |
| PQ-117 | Evidence/agents | Can appear in authored HTML; not automatic inline metadata | ✅ Extra validated fields/list rendering; attribution is supplied, not inferred. |
| PQ-118 | Usage/cost provenance | Not provided by inline contract itself | ✅ Extra measured/estimated/unavailable quantities; no invented accounting. |
| PQ-119 | Prompt lesson | Not provided by inline contract itself | ✅ Extra bounded lesson/improved-prompt section/copy. |
| PQ-120 | Exact original inspection | Primarily document attachment flow in inspected path | ✅ Extra inert exact-source text and copying. |
| PQ-121 | Full MCP Apps host | Separate T3 subsystem with approvals/tools/messages/downloads/context | ❌ Not implemented; HTML message envelopes do not make this an MCP Apps host. |
| PQ-122 | Dependency isolation | First-party infrastructure | ✅ Pele server-only; bundle checks pass; runtime npm audit0. |
| PQ-123 | Development dependency findings | Not evaluated for T3 | ⚠️ 20 findings in plugin development tree (5moderate/15high); no unsafe force-upgrade. |
| PQ-124 | Automated correctness evidence | Existing T3 tests; full suite not run here | ✅ 178/178 tests (0 skipped/fail/cancelled); typecheck; bundles 15 client/21 server, Pele server-only; package 35 files excluding tests and private data; runtime audit 0; `verify:e2e` 6/6 gates. Evidence: `report.json`, gate JSON/PNGs in the verification root. |
| PQ-125 | Real native verification | Real WebView integration in source; not device-tested here | ❌ No actual iOS/Android acceptance; DOM shim is not native evidence. |
| PQ-126 | Live client acceptance | First-party UI implementation | ✅ Web/desktop: G5 confirms `html-render` installed and running; G6 captures the hosted client rendering one inline card and opening the file preview. Native clients remain unaccepted (PQ-125). V1 stays retired. |
| PQ-127 | Required child thinking level | Not applicable to product comparison | ⚠️ Historical canary requirement, retired with the five-workspace methodology. No product-quality claim rests on it. |

## 6. Retired canary workflow (superseded)

IDs stay stable; the methodology is gone. The user retired the five-workspace
canary on 2026-10-20 and required autonomous verification instead. Nothing below
is an open acceptance gate any more.

| ID | Old requirement | Status after retirement |
| --- | --- | --- |
| PQ-128 | Canary identity and scope | Retired. QA identity, allowlist, scope enforcement and `build-qa` were deleted; the plugin ships as plain `html-render`. |
| PQ-129 | Five fresh visible Paseo workspaces | Retired. Five QA projects/workspaces were archived and deleted at user request; only the current release workspace remains. Backup: `qa-workspaces-20261020-qa01.tar.gz` in the 2026-10-20 evidence. |
| PQ-130 | QA-only diagnostics panel | Retired with the canary; no human-facing QA surface is required. G1–G6 replace it. |
| PQ-131 | Deterministic native QA runner | Replaced by `verify:e2e` G1/G3 (real renderer, real store, real stdio adapter, history rebuild). |
| PQ-132 | Actual-client QA acceptance | Replaced by G6 (hosted web client timeline + file preview, screenshots in the verification root). |
| PQ-133 | Permanent v1 retirement | ✅ Still in force. `html-render` 2.1.0 is installed; v1 is never reinstalled as rollback. |
| PQ-134 | DeepSeek-only work | Retired. It was a canary-process rule, not a product requirement. |
| PQ-135 | Authoritative evidence tracking | ✅ Still in force: stable PQ ids, gate mapping, ledger. |

## Trigger policy (plugin-scoped)

The plugin tells the model *when* to render through the two surfaces it owns, so
disabling the plugin removes the guidance with it (no AGENTS.md, no skill, no host
configuration):

- the MCP `instructions` line, which Pi places in the agent's `mcp_servers` section:
  "If the answer has structure (comparison, several findings, status, steps, flow,
  architecture, numbers), render a visual HTML card; if it is one fact, a sentence,
  code, file contents or config, answer in text."
- the `html_render` tool description, which repeats the positive rule and the
  negative one (no cards for facts, prose, code, file contents or config), and
  requires the card to be a picture — diagram, chart, flow, timeline or
  interactive — not a styled essay. Prose belongs in the reply below the card.
- the injected MCP server config sets `alwaysLoad: true`, so the tools are
  present as first-class choices instead of being hidden behind codemode search.
  This moved the same prompt from 1/3 to 3/3 renders.

Measured with a fixed 10-prompt corpus (5 structured, 5 plain), DeepSeek, high
thinking, natural wording with no tool names:

| Run | Structured prompts rendering | Plain prompts rendering |
| --- | --- | --- |
| Before the policy | 0/5 (3 distinct prompts seen) | 1/5 |
| After, first pass | 4/5 | 0/5 |
| After, second pass | 5/5 | 0/5 |

Prompt-to-prompt variance remains; the policy biases selection, it cannot force it.

## Autonomous verification gates

`npm run verify:e2e` runs `tests/e2e/verify.test.ts` and writes
`report.json` plus per-gate evidence to
`~/.paseo/plugin-data/html-render/verification-<YYYYMMDD>/`.

| Gate | Covers | What it actually does |
| --- | --- | --- |
| G1 | PQ-003/004/010/011/022/090 | `html_preview` and `html_render` with the real sandboxed Chromium and a real store; checks PNG magic, byte-exact original, CSP export, durable `card.json`, 0700/0600 modes, marker decode. |
| G2 | PQ-024/025/026/034/036/053/054/061/064/066 | Mounts the real `ReportCard`/`HtmlFrame` in real Chromium against artifacts produced by G1; asserts sandbox, `allow`, CSP, script execution, no chrome, height shrink, spoof rejection, theme update without reload, native gating, fallback. |
| G3 | PQ-003/004/018/131 | Spawns the real stdio MCP adapter over the real bridge socket; calls both tools; rebuilds one card from the persisted row, proves reload stability, and reads the durable card. |
| G4 | PQ-019 | Proves the outer `codemode` row is not transformed, so one artifact yields one card; records the item-scoped transformer residual. |
| G5 | PQ-126/133 | `paseo plugin ls` must list `html-render` enabled and running and `shared-browser` running; other third-party plugins are allowed, retired canary identities are not. Records the daemon pid/server id. |
| G6 | PQ-016/017/024/025/126/132 | Pairs a fresh headless Chromium with the real daemon, opens a real agent timeline, asserts exactly one inline frame with CSP, then clicks the assistant file link and asserts Paseo's HTML file preview frame. Screenshots are the evidence. |

G6 needs outbound network and a configured provider; without them it records
`unavailable`, never a pass. Each run creates one real agent and archives it after
the capture.

## Current work queue

| Step | Target | State |
| --- | --- | --- |
| 1 | Installed plugin + honest matrix | ✅ `html-render` 2.1.0 running; PQ rows updated with gate evidence. |
| 2 | Autonomous harness | ✅ `verify:e2e` 6/6 pass; unit suite 178/178. |
| 3 | Native-client acceptance | Open: no iOS/Android device evidence exists (PQ-025, PQ-125). Not automatable on this host. |
| 4 | Residual transformer limits | Open: a per-item transformer cannot suppress a marker duplicated in an arbitrary third row (documented in PQ-019). |

## Iteration ledger

- **2026-10-20, QA methodology retired:** deleted `scripts/build-qa.mjs`, `server/qa-allowlist.ts`, `server/scope.ts`, the QA identity/profile, and `.paseo-plugin/` (qa-build + qa-workspaces). Removed the stale `html-render-v2-qa` registration; backed up the five workspace cases to `verification-20261020/qa-workspaces-20261020-qa01.tar.gz`; deleted the five Paseo projects/workspaces (`paseo project delete`, each removing one workspace). Tests went 164 → 153 with the 11 canary/scope tests removed, then 154 with a new authority regression.
- **2026-10-20, two-workspace directory fixed:** `workspaceForCwd` no longer denies when two workspaces share one directory (this workspace has two ids on one path, which made real tool calls fail closed). Ownership is deepest-root, then lowest workspace id, so publish is stable; regression test added.
- **2026-10-20, duplicate card fixed:** the real hosted client rendered two inline cards for one artifact because the outer `codemode` row and the inner MCP row both carried the marker. `recognizeToolCall` now transforms only the render tool's own row (`html_render`, `mcp__*__html_render`, `html-render.html_render`). Re-verified in the hosted client: one card. G4 covers it.
- **2026-10-20, three web defects closed:** missing local images are dropped from the prepared page instead of publishing a broken glyph (original stays byte-exact, warning retained); a live frame with a structured report now shows a single "View report" entry (previously the report was unreachable on web); the static/report card no longer repeats the artifact title above a page that prints it. Tests 154 → 155; G2 asserts the entry point and the no-fallback rule; G6 still green.
- **2026-10-20, image fallback deleted:** a published architecture page rendered as "Interactive HTML could not load" plus a static PNG in the real client. Cause: `loading="lazy"` (added that morning) kept the offscreen frame from loading, the 4-second ready timeout fired, and `onFailure` replaced the card with the preview image. Fix: lazy loading removed, and the whole failure-to-image path deleted from `HtmlFrame`, `ReportCard` and the report screen by user request. A blank or unreadable live page keeps its frame; only a genuinely unreadable artifact shows one line of text. Tests updated; G2 now asserts no image is ever substituted.
- **2026-10-20, theming parity:** token vocabulary and base CSS already matched T3 character for character. The flat look came from aliased surfaces: error/warning callouts used a neutral card tone, and light-mode destructive text was white. Surfaces are now opaque blends of the status color over the card (`#fb414a` over `#111111` at 12% dark, 10% light, amber 12%/8%, accent 4%) with T3's `#c10007`/`#bb4d00`/`#ff6467` foregrounds, so callouts read like T3's in both appearances.
- **2026-10-20, capture fidelity (group 4):** static captures now lay out at T3's 800 px viewport and are cropped with T3's content-height expression (PQ-100); captures and measurements use Arial-metric faces (PQ-099); web-font readiness is polled before capture (PQ-098). The React Native shim now gives `View`/`Pressable` the real flex-container defaults, so mounted UI tests, including the new static-card screenshot, reflect actual layout. Static card polish: pill hugs, one-line highlights, truncated path.
- **2026-10-20, G6 provider failures classified:** an upstream 503 left the acceptance agent with no tool call and G6 failed for the wrong reason. G6 now reads the agent log: no `html_render` call means `unavailable`; a tool refusal still fails the gate.
- **2026-10-20, paint-settlement probe rejected:** adding a bounded `document.fonts.ready` + two-frame DevTools evaluation made renders time out (page scripts are disabled), so the fixed 50 ms yield remains; recorded on PQ-098.
- **2026-10-20, G6 determinism:** the acceptance prompt originally told the agent to reply with the artifactId only, which conflicted with the adapter's link instruction and made the file-preview gate flaky. The prompt now requires the exact Markdown link; G6 passed on consecutive runs.
- **2026-10-20, measured-width parity:** `DEFAULT_MEASURE_WIDTHS` now matches T3's nine widths (PQ-062) and the live iframe sets `loading="lazy"` (PQ-033); unit expectations updated.
- **2026-10-20, autonomous harness + install:** `npm run verify:e2e` (G1–G6) passes 6/6 with evidence in `verification-20261020/`; 154/154 tests, typecheck, bundles 14/21, package 31 files, runtime audit 0. Installed `html-render` 2.0.0 from this directory (`paseo plugin install .`), then reloaded it. G6 captured a real agent timeline and the HTML file preview in the hosted client.
- Historical canary entries (five workspaces, model preflight, scope rejection) were removed with the methodology; their evidence files remain in `~/.paseo/plugin-data/html-render-v2-qa/` and are not acceptance evidence.

- **2026-10-21, release 2.1.0:** path-based artifact recovery (`artifacts/<32 hex>/`, regression `b49e8050`), client artifact catalog with bounded re-projection, durable `card.json` including `renderMode`, versioned/atomic adapter freshness, and a real mounted-frame readiness probe replacing the cold-start sleep race. Added MIT `LICENSE`, first-time-user `README`, `CHANGELOG`, package metadata, paseo.cafe Git-only entry, and refreshed verification docs. Tests 155 → 178 (+23); bundles 14 → 15 client inputs; final gate `verify:e2e` 6/6, 178/178 tests, typecheck, package 35 files, runtime audit 0.

- **2026-10-20, release 2.0.0:** installed from a clean checkout (`~/git/paseo-html-render`, not the dev worktree); `npm ci` + `paseo plugin install <dir>` is now the documented machine path. Added `npm run check:trigger` (10-prompt corpus counting real tool calls) and refreshed verification evidence (155 tests, G2 no-fallback, G5 third-party plugins, trigger policy, 1.4 s publish latency for nine widths). Tagged `v2.0.0`, published a Gitea release, and pinned the plugin in dotfiles (`apps.md`, `CHECKLIST.md`, `README.md`). Final full run on HEAD: `verify:e2e` 6/6, 155/155 tests.

## Evidence and interpretation

Source basis: T3 `packages/shared/src/htmlRender.ts`, server
`htmlRender/{HtmlRender,headlessChrome,publicProxy}.ts`, `http.ts`, attachment/tool
output handling, web frame/dialog/document/theme components, mobile
`HtmlRenderWebView.tsx`; plugin `client/`, `shared/`, `server/` and tests.

Exact release/rollback evidence: [verification.md](verification.md).
The matrix records what the harness and unit suite actually prove. Native-client
rows stay red until real device evidence exists. V1 remains permanently retired.
