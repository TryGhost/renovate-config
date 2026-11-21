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
An allowed build must name exact package versions in either `allowBuilds`
or `permissions.<selector>.build`. Finite lists such as
`esbuild@0.25.12 || 0.28.2` are supported; ranges and package patterns are not.
Denials can cover all versions. Cooldown exceptions in both the regular settings
and `bootConfig` must also name exact versions. A blanket `@tryghost/*` exclusion
would bypass the policy for the packages this policy is intended to protect.
The CI check
also rejects non-strict release-age resolution, trusted-lockfile bypasses and a
weakened bootstrap cooldown. Config-dependency users must explicitly set the
bootstrap cooldown shown above. Do not add a lifecycle script or a regular dependency to this package.

```yaml
allowBuilds:
  'esbuild@0.25.12 || 0.28.2': true
  dtrace-provider: false
minimumReleaseAgeExclude:
  # Reviewed emergency update; remove after its cooldown has elapsed.
  - markdown-it@14.3.3
```

`bootConfig` is intentionally local: the policy package cannot govern its own
installation or pnpm's bootstrap. Keep its cooldown explicit. Set `pnpmfile: []`
in consumers that do not intentionally use a pnpmfile.

Use `local>TryGhost/renovate-config:pnpm.json5` to maintain both the package pin
and the shared CI action. Protect policy configuration with the consuming repo's
review/branch rules. These references require a one-time repo change; future
updates are maintained centrally and proposed by Renovate.

## Repository adoption checks

Before delegating settings, check every consumer that reads
`pnpm-workspace.yaml` directly. Archive builders must read resolved settings and
export their own self-contained install policy; a shipped archive must not need
the source repository's includes or policy package. Preserve intentional source
hooks and repository-specific build decisions.

Add the checker to the job that verifies the complete frozen lockfile, and make
that job required. Repository layouts with independent package install roots
need a check for each root. A downstream job may reuse a verified lockfile only
after the verification job succeeds for the same commit and policy; introducing
config includes also requires reviewing verification-cache keys.

Layer the pnpm Renovate preset alongside existing compatibility/theme rules and
remove local zero-day overrides. Validate the resulting consumer configuration:
repository rules override inherited preset rules. Loading shared settings and
requiring CI are separate adoption steps.

## Publish

The repository's `publish-pnpm-policy.yml` workflow publishes from `main` through
npm trusted publishing. An npm package owner must first publish 1.0.0 from this directory with an
authenticated `pnpm publish --access public` session, then configure its trusted
publisher for owner `TryGhost`, repository `renovate-config`, and workflow
`publish-pnpm-policy.yml` (no environment). Later releases bump this manifest's version in a reviewed
PR. The workflow defaults to a dry run when dispatched manually.
