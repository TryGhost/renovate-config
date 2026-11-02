# Renovate Config

Shared Renovate presets that control dependency updates across Ghost Foundation repositories.

## Using the presets

Reference the appropriate preset from a dedicated Renovate configuration file in the consuming repository:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["local>TryGhost/renovate-config"]
}
```

Use a named preset when the repository needs a more specific policy:

| Preset | Reference | Purpose |
| --- | --- | --- |
| `default` | `local>TryGhost/renovate-config` | Extends `quiet.json5` with broad automerge and its documented exceptions. |
| `safe` | `local>TryGhost/renovate-config:safe` | Extends `default` but disables major-update automerge. This preset is an anti-pattern; avoid it and use it only temporarily when unavoidable. |
| `theme` | `local>TryGhost/renovate-config:theme.json5` | Extends `quiet.json5` with rules for Ghost theme repositories. |
| `pnpm` | `local>TryGhost/renovate-config:pnpm.json5` | Extends default with a reviewed pnpm 12 range, 72-hour npm cooldown including first-party packages, and reviewed shared policy updates. |
| `terraform` | `local>TryGhost/renovate-config:terraform.json5` | Applies Terraform-specific labels, version limits, and automerge policy. |

`quiet.json5` is the shared policy layer behind the default and theme presets. Consuming repositories should normally select one of the public presets above rather than extend it directly.

## Central pnpm supply-chain policy

[The policy package](packages/pnpm-policy/README.md) contains declarative install
settings. [The shared CI action](.github/actions/pnpm-policy/action.yml) checks
the effective settings, including repositories that still configure them locally:

```yaml
# After the repository has selected pnpm/Node and installed dependencies:
- uses: TryGhost/renovate-config/.github/actions/pnpm-policy@<reviewed-commit-sha>
```

Pin the action to a reviewed commit; Renovate proposes future updates. Add the
step to an existing required test job so its check name stays stable. Keep exact
build approvals and justified cooldown exceptions local and reviewed. The action
checks effective values; repository administrators must protect its invocation
and configuration with their existing branch/review rules. It does not create an
organization-enforced rule on GitHub Team. One adoption change per repository is
still needed. Start with this CI check, then adopt the config package after its
initial publication and 72-hour cooldown. No package is published by merging a PR.

## Validating changes

The test harness uses the Node.js version declared in [`.nvmrc`](.nvmrc). The [test workflow](.github/workflows/test.yml) is the source of truth for the Renovate version used in CI. For local validation, use `npx` to make Renovate temporarily available to the harness without adding a global or repository dependency:

```bash
nvm install
nvm use
npx --yes --package=renovate --call './test/run.sh'
```

The test command validates every configuration file, applies strict validation where the current presets support it, resolves every consumable preset and the legacy named alias through a temporary loopback server, asserts their effective policies, and runs dependency extraction against npm and Terraform fixtures.

### Live repository dry run

The local test harness does not need GitHub credentials. To exercise a preset against the live `TryGhost/Ghost` repository, create a personal access token following [Renovate's GitHub authentication guidance](https://docs.renovatebot.com/modules/platform/github/#authentication) and expose it as `GITHUB_RENOVATE_TOKEN` through your shell or secret manager. Then run from the repository root:

```bash
RENOVATE_CONFIG_FILE="$PWD/quiet.json5" \
RENOVATE_TOKEN="$GITHUB_RENOVATE_TOKEN" \
npx --yes --package=renovate renovate \
  --platform=github \
  --dry-run=full \
  TryGhost/Ghost
```

Change `RENOVATE_CONFIG_FILE` when testing a different preset. Never commit or print the token.

Preset changes affect repositories across the Ghost Foundation organization. Keep changes narrowly scoped and use the full test command before opening a pull request.

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
