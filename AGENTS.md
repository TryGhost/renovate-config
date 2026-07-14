# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Repository Overview

This is a Renovate configuration repository that provides presets for Ghost Foundation's GitHub repositories. It defines how the Renovate bot should handle dependency updates across Ghost's projects.

## Key Files

- `renovate-config.json` - Main preset file that extends the quiet configuration
- `quiet.json5` - Base configuration with detailed rules for dependency updates, package grouping, and automerge settings

## Commands

### Validation
Validate the configuration syntax:
```bash
./test.sh
```

### Testing
Test configuration changes against a repository:
```bash
# Basic dry-run test
npx -p renovate renovate --platform=local --dry-run=extract --onboarding=false --require-config=required

# Test with specific configuration
RENOVATE_CONFIG_FILE=/path/to/config \
  npx -p renovate renovate --platform=local --dry-run=extract --onboarding=false --require-config=required
```

## Architecture & Configuration Approach

The configuration uses a hierarchical approach:
1. `renovate-config.json` serves as the entry point that other repositories reference
2. `quiet.json5` contains the actual configuration rules with:
   - Package grouping rules (e.g., all Vite packages grouped together, TryGhost packages grouped)
   - Automerge rules based on package type and version (major/minor/patch)
   - Special handling for test/linting dependencies
   - Schedule constraints to avoid overwhelming maintainers

Key configuration principles:
- Pin all dependencies for determinism
- Group related packages to reduce PR noise
- Automerge minor/patch updates for stable packages (>= 1.0.0)
- Always require approval for major updates
- Maintain lock files weekly to catch transitive dependency issues
