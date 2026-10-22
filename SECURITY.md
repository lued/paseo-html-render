# Security policy

## Supported versions

Security fixes land on `main` and ship in the next tagged release. Only the latest release is
supported.

## Private reporting

Report suspected vulnerabilities through GitHub private vulnerability reporting:

<https://github.com/lued/paseo-html-render/security/advisories/new>

Do not open a public issue for a vulnerability, and do not attach credentials, private paths,
workspace ids or the contents of a real report. Include the affected version or commit, the impact,
a minimal reproduction, and a mitigation if you have one.

## Trust model

`paseo-html-render` is a trusted, unsandboxed Paseo plugin. Its server entry runs with the daemon
user's filesystem, process, network and credential access, so a defect in this repository can reach
anything that user can reach. The HTML it renders is agent-authored and is treated as untrusted:
live frames use `sandbox="allow-scripts"` with an opaque origin and never `allow-same-origin`, CSP
blocks network, forms, frames and `file://`, and screenshots and native reports never execute the
page. Artifacts are written `0600` into `0700` directories and every read is checked against the
requesting agent's workspace.

## Scope

In scope: sandbox or CSP escape from a rendered page, reading another workspace's artifacts, path
traversal in artifact ids or media inlining, launching an unsafe or attacker-chosen Chromium, secret
material appearing in an artifact, screenshot or log, and privilege crossing beyond the daemon user.

Out of scope: defects in Paseo itself, in Chromium, or in the agent that authored a page; reports
that require pre-existing write access to the user's account; and the documented limits in
`README.md` and `docs/compatibility.md`, such as a page navigating its own iframe.
