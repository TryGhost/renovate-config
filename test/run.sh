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

readonly ACCEPTANCE_CONFIG_FILES=("${CONFIG_FILES[@]}")

REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPOSITORY_ROOT
readonly RENOVATE_COMMAND=(renovate)
readonly RENOVATE_CONFIG_VALIDATOR_COMMAND=(renovate-config-validator)

TEST_WORKSPACE="$(mktemp -d)"
readonly TEST_WORKSPACE
readonly CONSUMER_FIXTURE="$TEST_WORKSPACE/consumer"
readonly PRESET_SERVER_PORT_FILE="$TEST_WORKSPACE/preset-server-port"
readonly PRESET_SERVER_LOG="$TEST_WORKSPACE/preset-server.log"
PRESET_SERVER_PID=""

cleanup() {
    if [[ -n "$PRESET_SERVER_PID" ]]; then
        kill "$PRESET_SERVER_PID" 2>/dev/null || true
        wait "$PRESET_SERVER_PID" 2>/dev/null || true
    fi

    rm -rf "$TEST_WORKSPACE"
}
trap cleanup EXIT

fail_with_log() {
    local message="$1"
    local log_file="$2"

    echo "$message" >&2
    cat "$log_file" >&2
    return 1
}

start_preset_server() {
    node "$REPOSITORY_ROOT/test/serve-presets.mjs" \
        "$REPOSITORY_ROOT" \
        "$PRESET_SERVER_PORT_FILE" \
        > "$PRESET_SERVER_LOG" 2>&1 &
    PRESET_SERVER_PID="$!"

    for _ in {1..50}; do
        if [[ -s "$PRESET_SERVER_PORT_FILE" ]]; then
            return
        fi

        if ! kill -0 "$PRESET_SERVER_PID" 2>/dev/null; then
            fail_with_log "Preset server exited before reporting its port." "$PRESET_SERVER_LOG"
        fi

        sleep 0.1
    done

    fail_with_log "Preset server failed to report its port." "$PRESET_SERVER_LOG"
}

write_consumer_config() {
    local config_file="$1"
    local preset_url="$2"

    sed "s|__PRESET_URL__|$preset_url/$config_file|" \
        "$CONSUMER_FIXTURE/renovate.json5.template" \
        > "$CONSUMER_FIXTURE/.github/renovate.json5"
}

exercise_config() {
    local config_file="$1"
    local preset_url="$2"
    local log_name="${config_file//\//_}"
    local renovate_log="$TEST_WORKSPACE/$log_name.log"

    echo "  - $config_file"
    write_consumer_config "$config_file" "$preset_url"

    if ! (
        cd "$CONSUMER_FIXTURE"
        LOG_FORMAT=json LOG_LEVEL=debug "${RENOVATE_COMMAND[@]}" \
            --platform=local \
            --dry-run=extract \
            --onboarding=false \
            --print-config=true \
            --require-config=required
    ) > "$renovate_log" 2>&1; then
        fail_with_log "Renovate failed while exercising $config_file." "$renovate_log"
    fi

    node "$REPOSITORY_ROOT/test/assert-preset.mjs" "$config_file" "$renovate_log"
}

cd "$REPOSITORY_ROOT"

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

mkdir -p "$CONSUMER_FIXTURE/.github"
cp -R "$REPOSITORY_ROOT/test/fixtures/consumer/." "$CONSUMER_FIXTURE/"
start_preset_server

PRESET_SERVER_URL="http://127.0.0.1:$(<"$PRESET_SERVER_PORT_FILE")"
readonly PRESET_SERVER_URL

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

echo "→ Exercising preset resolution, policy, and dependency extraction..."
for config_file in "${ACCEPTANCE_CONFIG_FILES[@]}"; do
    exercise_config "$config_file" "$PRESET_SERVER_URL"
done

echo "✅ All tests passed"
