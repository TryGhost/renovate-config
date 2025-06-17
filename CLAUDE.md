# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a Renovate configuration repository that provides presets for Ghost Foundation's GitHub repositories. It defines how the Renovate bot should handle dependency updates across Ghost's projects.

## Key Files

- `renovate-config.json` - Main preset file that extends the quiet configuration
- `quiet.json5` - Base configuration with detailed rules for dependency updates, package grouping, and automerge settings

## Commands

### Validation
Validate the configuration syntax:
```bash
npx -p renovate renovate-config-validator
```

### Testing
Test configuration changes against a repository:
```bash
# Basic dry-run test
npx renovate --platform=local --dry-run <path-to-repository>

# Test with specific configuration
npx renovate --platform=local --dry-run --renovate-config-file=<path-to-config> <path-to-repository>
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