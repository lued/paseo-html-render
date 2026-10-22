# Submit to paseo.cafe

The registry entry lives in `docs/paseo-cafe-registry.json`. It is Git-only and
deliberately has no `package` field because nothing is published to npm for
this release. paseo.cafe reads the plugin version from the repository's
`package.json` (`2.1.0`).

Prerequisites:

- `lued/paseo-html-render` is public on GitHub.
- `main` contains `paseo-plugin.json` with `"id": "html-render"` and
  `package.json` version `2.1.0`.
- The `v2.1.0` tag points at the same commit as `main`.

## Exact commands

```bash
# 1. Confirm the public repository and release commit.
gh repo view lued/paseo-html-render --json visibility,url,defaultBranchRef
git ls-remote --tags https://github.com/lued/paseo-html-render.git v2.1.0

# 2. Clone the registry and create one branch.
git clone https://github.com/paseo-cafe/paseo-cafe.git
cd paseo-cafe
git checkout -b add-paseo-html-render

# 3. Add exactly one registry file.
cp ~/git/paseo-html-render/docs/paseo-cafe-registry.json registry/paseo-html-render.json

# 4. Validate and commit.
bun install
bun run registry:validate
git add registry/paseo-html-render.json
git commit -m "Add paseo-html-render"

# 5. Push and open the PR.
git push -u origin add-paseo-html-render
gh pr create \
  --repo paseo-cafe/paseo-cafe \
  --base main \
  --head add-paseo-html-render \
  --title "Add paseo-html-render" \
  --body-file ~/git/paseo-html-render/docs/paseo-cafe-pr-body.md
```

If `bun` is unavailable, the same check runs in the registry CI on the PR.

## PR title

`Add paseo-html-render`

## PR body

```markdown
Adds the HTML Render plugin.

- Repository: https://github.com/lued/paseo-html-render
- Manifest ID: `html-render`
- Version: `2.1.0` (tag `v2.1.0`)
- Categories: productivity
- License: MIT

This is a Git-only listing. The `package` field is intentionally omitted
because this release is not published to npm. paseo.cafe reads version `2.1.0`
from the repository's package.json.

Known limitations, declared as caveats: live inline HTML is web/desktop only;
the raw sandboxed iframe is not a public plugin SDK surface; and 2.1.0 is not
published to npm.
```

## After merge

No follow-up file is needed. The registry scanner regenerates the listing from
the public repository and the pinned version. Future releases must bump
`package.json`, add a changelog section, tag the release, and open a registry PR
only if the entry itself changes.
