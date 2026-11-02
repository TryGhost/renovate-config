# Ghost pnpm policy

Shared install defaults for pnpm 12.16.1 and newer: a 72-hour release cooldown,
strict dependency build approvals, exotic subdependency blocking, and no blanket
build approval. Loading this package runs no JavaScript or lifecycle scripts.
The settings use JSON syntax, which is valid YAML, so the dependency-free CI
check can read the same policy file.

## Adopt

Once version 1.0.0 is published and its cooldown has elapsed, add this to
`pnpm-workspace.yaml` and remove the four delegated settings from that file:

```yaml
configDependencies:
  '@tryghost/pnpm-policy': 1.0.0
bootConfig:
  minimumReleaseAge: 4320
include:
  '@tryghost/pnpm-policy':
    - minimumReleaseAge
    - strictDepBuilds
    - blockExoticSubdeps
    - dangerouslyAllowAllBuilds
```

Run `pnpm install` and commit the lockfile. pnpm records the package integrity in
its boot lock document. Keep `allowBuilds`, reviewed release-age exceptions,
workspace layout, catalogs and application-specific hooks in the consuming repo.
An allowed build must name an exact package version; denials can cover all
versions. Do not add a lifecycle script or a regular dependency to this package.

`bootConfig` is intentionally local: the policy package cannot govern its own
installation or pnpm's bootstrap. Keep its cooldown explicit. Set `pnpmfile: []`
in consumers that do not intentionally use a pnpmfile.

Use `local>TryGhost/renovate-config:pnpm.json5` to maintain both the package pin
and the shared CI action. Protect policy configuration with the consuming repo's
review/branch rules. These references require a one-time repo change; future
updates are maintained centrally and proposed by Renovate.

## Publish

The repository's `publish-pnpm-policy.yml` workflow publishes from `main` through
npm trusted publishing. An npm package owner must first publish 1.0.0 from this directory with an
authenticated `pnpm publish --access public` session, then configure its trusted
publisher for owner `TryGhost`, repository `renovate-config`, and workflow
`publish-pnpm-policy.yml` (no environment). Later releases bump this manifest's version in a reviewed
PR. The workflow defaults to a dry run when dispatched manually.
