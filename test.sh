#!/bin/bash
set -e

echo "🧪 Testing Renovate config..."

# Test 1: Validate syntax
echo "→ Validating syntax..."
RENOVATE_CONFIG_FILE=quiet.json5 npx -p renovate renovate-config-validator
RENOVATE_CONFIG_FILE=theme.json5 npx -p renovate renovate-config-validator
