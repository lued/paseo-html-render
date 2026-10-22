Adds the HTML Render plugin.

- Repository: https://github.com/lued/paseo-html-render
- Manifest ID: `html-render`
- Version: `2.1.0` (tag `v2.1.0`)
- Categories: productivity
- License: MIT

This is a Git-only listing. The `package` field is intentionally omitted
because this release is not published to npm. paseo.cafe reads version `2.1.0`
from the repository's package.json.

The plugin gives agents `html_preview` and `html_render` tools. A structured
answer becomes a self-contained HTML card in the timeline: live and sandboxed on
web/desktop, a static PNG or structured native report on iOS/Android. Artifacts
are private (`0700`/`0600`), workspace-checked, and retained by default. Cards
survive history reloads without a provider marker: the plugin also recovers the
artifact id from the interactive path and stores a validated durable card
(`card.json`) beside each artifact.

Known limitations, declared as caveats: live inline HTML is web/desktop only;
the raw sandboxed iframe is not a public plugin SDK surface; and 2.1.0 is not
published to npm.
