#!/bin/bash
set -e

echo "🧪 Testing Renovate config..."

# Test 1: Validate syntax
echo "→ Validating syntax..."
RENOVATE_CONFIG_FILE=quiet.json5 npx -p renovate renovate-config-validator

# Test 2: Dry run test with preset resolution
echo -e "\n→ Testing preset resolution with dry run..."

# Create a test directory
mkdir -p test-repo
cd test-repo

# Initialize git repo
git init -q
git config user.email "test@example.com"
git config user.name "Test User"

# Create a minimal package.json
cat > package.json << EOF
{
  "name": "test-repo",
  "version": "1.0.0",
  "dependencies": {
    "express": "4.18.0"
  }
}
EOF

# Create a renovate.json that uses our preset (like external repos would)
cat > renovate.json << EOF
{
  "extends": ["github>tryghost/renovate-config"]
}
EOF

git add .
git commit -m "Initial commit" -q

# Run dry-run and check for preset errors
echo "Running Renovate dry-run..."
output=$(RENOVATE_CONFIG_FILE=../quiet.json5 npx -p renovate renovate --platform=local --dry-run 2>&1)

if echo "$output" | grep -E "(Cannot find preset|Failed to look up preset)" > /dev/null; then
  echo "❌ ERROR: Preset resolution failed"
  echo "   External repos cannot use 'github>tryghost/renovate-config'"
  cd ..
  rm -rf test-repo
  exit 1
fi

echo "✅ Preset resolution successful"

# Cleanup
cd ..
rm -rf test-repo

echo -e "\n✅ All tests passed"