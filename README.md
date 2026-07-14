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
| `safe` | `local>TryGhost/renovate-config:safe` | Extends `default` but disables major-update automerge. Use it temporarily while CI cannot safely validate major updates. |
| `theme` | `local>TryGhost/renovate-config:theme.json5` | Extends `quiet.json5` with rules for Ghost theme repositories. |
| `terraform` | `local>TryGhost/renovate-config:terraform.json5` | Applies Terraform-specific labels, version limits, and automerge policy. |

`quiet.json5` is the shared policy layer behind the default and theme presets. Consuming repositories should normally select one of the public presets above rather than extend it directly.

## Validating changes

The test harness requires Node.js 24.11.0 and Renovate 43.262.2. Install the pinned Renovate CLI globally so the repository remains dependency-free:

```bash
nvm use
npm install --global renovate@43.262.2
./test.sh
```

The test command validates every configuration file, applies strict validation where the current presets support it, resolves the consumable presets through a temporary loopback server, and runs dependency extraction against npm and Terraform fixtures.

Preset changes affect repositories across the Ghost Foundation organization. Keep changes narrowly scoped and use the full test command before opening a pull request.

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE). Ghost and the Ghost Logo are trademarks of Ghost Foundation Ltd. Please see our [trademark policy](https://ghost.org/trademark/) for info on acceptable usage.
