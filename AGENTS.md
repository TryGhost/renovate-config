# AGENTS.md

This repository publishes shared Renovate presets for Ghost Foundation repositories. See [README.md](README.md) for consumer usage.

## Commands

Use the Node.js version declared in `.nvmrc`. The CI workflow is the source of truth for its Renovate version. For local validation, use `npx` so Renovate remains a temporary tool rather than a global or repository dependency.

```bash
nvm install
nvm use
npx --yes --package=renovate --call './test.sh'
```

`./test.sh` is the authoritative validation command. It must pass before a preset or test-harness change is ready for review.

Useful focused checks while editing the harness are:

```bash
bash -n test.sh
node --check test/serve-presets.mjs
```

## Repository boundaries

- `default.json` is the entrypoint for consumers that extend `local>TryGhost/renovate-config` without a preset name.
- `quiet.json5` owns the shared policy used by the default and theme presets. It broadly enables dependency automerge, then applies explicit exceptions and compatibility limits.
- `safe.json` is a temporary alternative for repositories whose CI cannot safely validate major dependency updates.
- `renovate-config.json` is a separate onboarding configuration, not the default consumer entrypoint. The current harness validates its syntax but does not exercise its remote preset resolution.
- Presets are consumed from the default branch. A semantically valid-looking edit can change dependency behavior across many repositories immediately after merge.

Do not change preset semantics as incidental cleanup. When a semantic change is required, keep it narrow, explain the affected consumers, and add or update a consumer-level regression check.

## Test architecture

`test.sh` enforces the version in `.nvmrc`, validates the configuration files, and creates an isolated consumer fixture. `test/serve-presets.mjs` serves rewritten copies of the checked-out presets over loopback so nested `extends` references resolve to the branch under test instead of published `main`. The fixture exercises npm and Terraform extraction without adding a root package manifest or repository dependencies.

Temporary files and the loopback server are cleaned up by the harness. Keep fixtures deterministic and do not add credentials, network tokens, or generated dependency state to the repository.
