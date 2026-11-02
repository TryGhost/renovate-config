import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const policy = JSON.parse(readFileSync(new URL('../../../packages/pnpm-policy/policy.yaml', import.meta.url), 'utf8'));
const directory = resolve(process.argv[2] || '.');
const command = process.env.PNPM_BINARY || 'pnpm';

function get(key) {
    const result = execFileSync(command, ['config', 'get', key, '--json'], {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return result === '' || result === 'undefined' ? undefined : JSON.parse(result);
}

const version = execFileSync(command, ['--version'], {cwd: directory, encoding: 'utf8'}).trim();
assert.match(version, /^\d+\.\d+\.\d+$/, 'Use a stable pnpm version');
const [major, minor, patch] = version.split('.').map(Number);
assert.ok(major === 12 && (minor > 16 || (minor === 16 && patch >= 1)), 'Use reviewed pnpm >=12.16.1 <13');

for (const [key, expected] of Object.entries(policy)) {
    const actual = get(key);
    if (key === 'minimumReleaseAge') {
        assert.ok(Number.isFinite(actual) && actual >= expected, `minimumReleaseAge must be at least ${expected} minutes`);
    } else {
        assert.equal(actual ?? false, expected, `${key} must be ${expected}`);
    }
}

// An explicit minimumReleaseAge enables strict resolution by default in pnpm 12.
assert.equal(get('minimumReleaseAgeStrict') ?? true, true, 'minimumReleaseAgeStrict must be true');
assert.equal(get('trustLockfile') ?? false, false, 'trustLockfile must be false');

const boot = get('bootConfig') || {};
const configDependencies = get('configDependencies') || {};
// Config dependencies load after bootstrap. Do not mistake their effective
// cooldown for the policy that protected their own installation.
if (Object.keys(configDependencies).length || boot.minimumReleaseAge != null) {
    assert.ok(Number.isFinite(boot.minimumReleaseAge) && boot.minimumReleaseAge >= policy.minimumReleaseAge,
        'bootConfig.minimumReleaseAge must explicitly protect bootstrap with at least 4320 minutes');
}
assert.equal(boot.minimumReleaseAgeStrict ?? true, true, 'bootConfig.minimumReleaseAgeStrict must be true');

function map(value, key) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${key} must be a map`);
    return Object.entries(value);
}

function checkBuild(name, allowed) {
    assert.equal(typeof allowed, 'boolean', `Invalid build decision for ${name}`);
    if (allowed) {
        assert.match(name, /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i, `Build approval must pin one exact version: ${name}`);
    }
}

for (const [name, allowed] of map(get('allowBuilds') || {}, 'allowBuilds')) {
    checkBuild(name, allowed);
}
// permissions.<selector>.build takes precedence over allowBuilds in pnpm 12.
for (const [name, capabilities] of map(get('permissions') || {}, 'permissions')) {
    map(capabilities, `permissions.${name}`);
    if (Object.hasOwn(capabilities, 'build')) {
        checkBuild(name, capabilities.build);
    }
}

const exclusions = get('minimumReleaseAgeExclude') || [];
assert.ok(Array.isArray(exclusions), 'minimumReleaseAgeExclude must be a list');
assert.ok(!exclusions.some(value => value === '*' || value === '**'), 'Do not exempt every package from the release cooldown');
assert.ok(!(boot.minimumReleaseAgeExclude || []).some(value => value === '*' || value === '**'),
    'Do not exempt every bootstrap package from the release cooldown');
console.log(`pnpm supply-chain policy passed (${version}); repository-specific exceptions still require review.`);
