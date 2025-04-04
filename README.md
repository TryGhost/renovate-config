# Renovate Config

Renovate presets for our GitHub repositories

## Validation

You can validate the config by running

```bash
npx -p  renovate renovate-config-validator
```

This is run in CI, to try to prevent bad config

## Testing

1. Install Renovate CLI:
   ```bash
   npm install -g renovate
   ```

2. Create a GITHUB_RENOVATE_TOKEN token

Create a new [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) in GitHub

   ```bash
   export GITHUB_RENOVATE_TOKEN=[your token here]
   ```

3. Run the following command

RENOVATE_CONFIG_FILE=~/Sites/renovate-config/quiet.json RENOVATE_TOKEN=$GITHUB_RENOVATE_TOKEN  renovate --dry-run=full TryGhost/Ghost


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).