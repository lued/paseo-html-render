# Releasing

Nothing is published to npm yet, so the checkout is the supported install and the
release check is a local npm layout. Run all of it from a clean checkout.

## Pre-publish acceptance

Prove the packed tarball contains everything the daemon needs. A `git:` install
does not work for this plugin: Paseo clones and checks out, but never installs
dependencies, so the bundle fails on `@getpaseo/client` and on `pele`.

```sh
npm ci --ignore-scripts
npm run typecheck && npm test
npm run check:bundles
npm pack --pack-destination /tmp

rm -rf /tmp/hr-npm && mkdir -p /tmp/hr-npm && cd /tmp/hr-npm
npm init -y
npm install /tmp/paseo-html-render-*.tgz --omit=dev --ignore-scripts
paseo plugin install /tmp/hr-npm/node_modules/paseo-html-render
paseo plugin ls          # html-render running, enabled, no ERROR
paseo plugin logs html-render   # ends with "Plugin ready"
```

That layout is what `npm:paseo-html-render` produces, so a green run proves the
published package will work. It also proves the `files` list: `pele`,
`@getpaseo/plugin` and `@getpaseo/client` must all resolve from the packed tree.

To test a real publish without touching the fleet, publish under the `next` tag
first (`npm publish --tag next`) and install `npm:paseo-html-render@next`.

## Cut the release

1. Bump `package.json`, add the changelog section, run the acceptance above.
2. Merge to `main`, tag `v<version>`, push branch and tag.
3. `npm publish` (human step; the repo has no CI token).
4. Verify `npm view paseo-html-render version`, then
   `paseo plugin install npm:paseo-html-render` on one host before the rest.

## Rolling back to the checkout

Directory installs stay valid. Remove the npm install and mount the checkout:

```sh
paseo plugin remove html-render
cd /path/to/paseo-html-render && npm ci --ignore-scripts
paseo plugin install .
```
