#!/usr/bin/env bash
set -euo pipefail

readonly CONFIG_FILES=(
    ".github/renovate.json5"
    "default.json"
    "quiet.json5"
    "renovate-config.json"
    "safe.json"
    "terraform.json5"
    "theme.json5"
)

readonly STRICT_CONFIG_FILES=(
    ".github/renovate.json5"
    "default.json"
    "renovate-config.json"
    "safe.json"
    "terraform.json5"
    "theme.json5"
)

readonly RESOLUTION_CONFIG_FILES=(
    # The onboarding `renovate-config.json` extends the remote `:test` preset.
    # Its syntax is validated above; extraction exercises consumable presets only.
    ".github/renovate.json5"
    "default.json"
    "quiet.json5"
    "safe.json"
    "terraform.json5"
    "theme.json5"
)

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT
readonly RENOVATE_COMMAND=(renovate)
readonly RENOVATE_CONFIG_VALIDATOR_COMMAND=(renovate-config-validator)

cd "$REPOSITORY_ROOT"
CONSUMER_FIXTURE="$(mktemp -d)"
readonly CONSUMER_FIXTURE
PRESET_SERVER_PORT_FILE="$(mktemp)"
readonly PRESET_SERVER_PORT_FILE
PRESET_SERVER_PID=""

cleanup() {
    if [[ -n "$PRESET_SERVER_PID" ]]; then
        kill "$PRESET_SERVER_PID" 2>/dev/null || true
        wait "$PRESET_SERVER_PID" 2>/dev/null || true
    fi

    rm -rf "$CONSUMER_FIXTURE" "$PRESET_SERVER_PORT_FILE"
}
trap cleanup EXIT

EXPECTED_NODE_VERSION="v$(<"$REPOSITORY_ROOT/.nvmrc")"
readonly EXPECTED_NODE_VERSION
ACTUAL_NODE_VERSION="$(node --version)"
readonly ACTUAL_NODE_VERSION

if [[ "$ACTUAL_NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]]; then
    echo "Expected Node.js $EXPECTED_NODE_VERSION, but found $ACTUAL_NODE_VERSION. Run 'nvm use'." >&2
    exit 1
fi

RENOVATE_VERSION="$("${RENOVATE_COMMAND[@]}" --version)"
readonly RENOVATE_VERSION

node test/serve-presets.mjs "$REPOSITORY_ROOT" "$PRESET_SERVER_PORT_FILE" &
PRESET_SERVER_PID="$!"

for _ in {1..50}; do
    if [[ -s "$PRESET_SERVER_PORT_FILE" ]]; then
        break
    fi

    sleep 0.1
done

if [[ ! -s "$PRESET_SERVER_PORT_FILE" ]]; then
    echo "Preset server failed to start." >&2
    exit 1
fi

PRESET_SERVER_URL="http://127.0.0.1:$(<"$PRESET_SERVER_PORT_FILE")"
readonly PRESET_SERVER_URL

cp -R "$REPOSITORY_ROOT/test/fixtures/consumer/." "$CONSUMER_FIXTURE/"
mkdir -p "$CONSUMER_FIXTURE/.github"

echo "🧪 Testing Renovate config..."
echo "→ Using Renovate $RENOVATE_VERSION on Node.js $ACTUAL_NODE_VERSION"

echo "→ Validating every config file..."
"${RENOVATE_CONFIG_VALIDATOR_COMMAND[@]}" \
    --no-global \
    "${CONFIG_FILES[@]}"

echo "→ Strictly validating configs without legacy migration warnings..."
"${RENOVATE_CONFIG_VALIDATOR_COMMAND[@]}" \
    --strict \
    --no-global \
    "${STRICT_CONFIG_FILES[@]}"

echo "→ Exercising preset resolution and dependency extraction..."
for config_file in "${RESOLUTION_CONFIG_FILES[@]}"; do
    echo "  - $config_file"
    sed "s|__PRESET_URL__|$PRESET_SERVER_URL/$config_file|" \
        "$CONSUMER_FIXTURE/renovate.json5.template" \
        > "$CONSUMER_FIXTURE/.github/renovate.json5"
    (
        cd "$CONSUMER_FIXTURE"
        "${RENOVATE_COMMAND[@]}" \
            --platform=local \
            --dry-run=extract \
            --onboarding=false \
            --require-config=required
    )
done

echo "✅ All tests passed"
