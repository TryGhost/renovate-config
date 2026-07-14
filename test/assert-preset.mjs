import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [configFile, logFile] = process.argv.slice(2);

if (!configFile || !logFile) {
    throw new Error('Usage: assert-preset.mjs <config-file> <renovate-log>');
}

const expectedPresetPaths = new Map([
    ['.github/renovate.json5', ['/.github/renovate.json5', '/default.json', '/quiet.json5']],
    ['default.json', ['/default.json', '/quiet.json5']],
    ['quiet.json5', ['/quiet.json5']],
    ['renovate-config.json', ['/renovate-config.json', '/default.json', '/quiet.json5']],
    ['safe.json', ['/safe.json', '/default.json', '/quiet.json5']],
    ['terraform.json5', ['/terraform.json5']],
    ['theme.json5', ['/theme.json5', '/quiet.json5']]
]);

const quietPresetNames = [
    'config:best-practices',
    ':dependencyDashboard',
    ':disableRateLimiting',
    ':semanticCommitsDisabled',
    ':pinDependencies',
    ':pinDevDependencies',
    'group:vite',
    ':maintainLockFilesWeekly',
    'security:minimumReleaseAgeNpm'
];

const terraformPresetNames = [
    'config:best-practices',
    ':dependencyDashboard',
    ':disableRateLimiting',
    ':maintainLockFilesWeekly',
    ':semanticCommitsDisabled',
    ':pinDependencies',
    ':pinDevDependencies',
    ':automergeBranch',
    ':automergeMinor',
    ':automergeRequireAllStatusChecks',
    ':labels(deps, terraform)'
];

function parseEvents(log) {
    return log
        .split('\n')
        .filter(Boolean)
        .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });
}

function findEvent(events, message) {
    const event = events.find(({msg}) => msg === message);
    assert.ok(event, `Renovate did not emit the expected "${message}" event`);
    return event;
}

function hasDescription(rule, description) {
    return rule.description?.includes(description) === true;
}

function findRule(rules, predicate, description) {
    const rule = rules.find(predicate);
    assert.ok(rule, `Resolved policy is missing ${description}`);
    return rule;
}

function isBroadAutomergeRule(rule) {
    return rule.matchDepTypes?.includes('dependencies') &&
        rule.matchDepTypes?.includes('action') &&
        rule.automerge === true &&
        rule.automergeType === 'pr';
}

function assertQuietPolicy(shallowConfig, fullConfig) {
    assert.equal(shallowConfig.separateMultipleMajor, false);
    assert.equal(shallowConfig.separateMinorPatch, false);
    assert.equal(shallowConfig.rebaseWhen, 'automerging');
    assert.deepEqual(shallowConfig.postUpdateOptions, ['yarnDedupeHighest']);
    assert.equal(shallowConfig.lockFileMaintenance.automerge, true);

    assert.equal(fullConfig.dependencyDashboard, true);
    assert.equal(fullConfig.prConcurrentLimit, 0);
    assert.equal(fullConfig.prHourlyLimit, 0);
    assert.equal(fullConfig.semanticCommits, 'disabled');
    assert.equal(fullConfig.lockFileMaintenance.enabled, true);
    assert.equal(fullConfig.lockFileMaintenance.automerge, true);
    assert.deepEqual(fullConfig.lockFileMaintenance.schedule, ['* 0-3 * * 1']);

    const rules = shallowConfig.packageRules;
    const broadAutomergeRule = findRule(
        rules,
        isBroadAutomergeRule,
        'the broad dependency automerge rule'
    );
    assert.deepEqual(broadAutomergeRule.matchDepTypes, [
        'devDependencies',
        'dependencies',
        'optionalDependencies',
        'peerDependencies',
        'packageManager',
        'action',
        'uses-with'
    ]);
    const cssExceptionRule = findRule(
        rules,
        (rule) => hasDescription(rule, 'Do not automerge CSS preprocessors') &&
            rule.matchPackageNames?.includes('postcss') &&
            rule.automerge === false,
        'the CSS preprocessor automerge exception'
    );
    const tryGhostExceptionRule = findRule(
        rules,
        (rule) => rule.matchPackageNames?.includes('gscan') &&
            rule.matchUpdateTypes?.includes('major') &&
            rule.automerge === false,
        'the TryGhost major-update automerge exception'
    );
    assert.ok(rules.indexOf(broadAutomergeRule) < rules.indexOf(cssExceptionRule));
    assert.ok(rules.indexOf(broadAutomergeRule) < rules.indexOf(tryGhostExceptionRule));
    findRule(
        rules,
        (rule) => rule.groupName === 'Types packages' &&
            rule.matchPackageNames?.includes('@types{/,}**'),
        'the type-package group'
    );
    findRule(
        rules,
        (rule) => rule.groupName === 'TryGhost packages' &&
            rule.minimumReleaseAge === null,
        'the trusted TryGhost package group'
    );
    findRule(
        rules,
        (rule) => rule.groupName === 'Koenig packages' &&
            rule.minimumReleaseAge === null,
        'the trusted Koenig package group'
    );
    findRule(
        rules,
        (rule) => rule.groupName === 'CSS preprocessors',
        'the CSS preprocessor group'
    );
    findRule(
        rules,
        (rule) => rule.groupName === 'metascraper',
        'the metascraper group'
    );
    findRule(
        rules,
        (rule) => rule.matchPackageNames?.includes('@elastic/elasticsearch') &&
            rule.allowedVersions === '<9',
        'the Elasticsearch v8 compatibility limit'
    );

    findRule(
        fullConfig.packageRules,
        (rule) => rule.matchDepTypes?.includes('dependencies') && rule.rangeStrategy === 'pin',
        'the production dependency pinning policy'
    );
    findRule(
        fullConfig.packageRules,
        (rule) => rule.matchDepTypes?.includes('devDependencies') && rule.rangeStrategy === 'pin',
        'the development dependency pinning policy'
    );
    findRule(
        fullConfig.packageRules,
        (rule) => rule.groupName === 'Vite packages' && rule.matchPackageNames?.includes('vite'),
        'the Vite package group'
    );
    findRule(
        fullConfig.packageRules,
        (rule) => rule.matchDatasources?.includes('npm') && rule.minimumReleaseAge === '3 days',
        'the npm minimum release age'
    );
}

function assertConfigSpecificPolicy(shallowEvent, fullConfig) {
    const {config: shallowConfig, visitedPresets} = shallowEvent;
    const resolvedPaths = visitedPresets.merged.map((preset) => new URL(preset).pathname);

    assert.deepEqual(resolvedPaths, expectedPresetPaths.get(configFile));

    if (configFile === 'terraform.json5') {
        assert.deepEqual(visitedPresets.unmerged, terraformPresetNames);
        assert.equal(shallowConfig.packageRules.length, 1);
        assert.equal(fullConfig.dependencyDashboard, true);
        assert.equal(fullConfig.prConcurrentLimit, 0);
        assert.equal(fullConfig.prHourlyLimit, 0);
        assert.equal(fullConfig.semanticCommits, 'disabled');
        assert.equal(fullConfig.automergeType, 'branch');
        assert.equal(fullConfig.ignoreTests, false);
        assert.equal(fullConfig.minor.automerge, true);
        assert.equal(fullConfig.patch.automerge, true);
        assert.equal(fullConfig.pin.automerge, true);
        assert.equal(fullConfig.lockFileMaintenance.enabled, true);
        assert.equal(fullConfig.lockFileMaintenance.automerge, true);
        assert.deepEqual(fullConfig.lockFileMaintenance.schedule, ['* 0-3 * * 1']);
        assert.deepEqual(fullConfig.labels, ['deps', 'terraform']);
        findRule(
            fullConfig.packageRules,
            (rule) => rule.matchDepTypes?.includes('dependencies') && rule.rangeStrategy === 'pin',
            'the Terraform preset production dependency pinning policy'
        );
        findRule(
            fullConfig.packageRules,
            (rule) => rule.matchDepTypes?.includes('devDependencies') && rule.rangeStrategy === 'pin',
            'the Terraform preset development dependency pinning policy'
        );
        findRule(
            shallowConfig.packageRules,
            (rule) => rule.matchPackageNames?.includes('hashicorp/terraform') &&
                rule.matchDatasources?.includes('github-releases') &&
                rule.allowedVersions === '<1.14',
            'the Terraform compatibility limit'
        );
        return;
    }

    assert.deepEqual(visitedPresets.unmerged, quietPresetNames);
    assertQuietPolicy(shallowConfig, fullConfig);

    const expectedRuleCounts = new Map([
        ['.github/renovate.json5', 9],
        ['default.json', 9],
        ['quiet.json5', 9],
        ['renovate-config.json', 9],
        ['safe.json', 10],
        ['theme.json5', 11]
    ]);
    assert.equal(shallowConfig.packageRules.length, expectedRuleCounts.get(configFile));

    if (configFile === 'safe.json') {
        const broadAutomergeRule = findRule(
            shallowConfig.packageRules,
            isBroadAutomergeRule,
            'the broad dependency automerge rule'
        );
        const safeOverrideRule = findRule(
            shallowConfig.packageRules,
            (rule) => rule.matchUpdateTypes?.length === 1 &&
                rule.matchUpdateTypes[0] === 'major' &&
                rule.matchPackageNames === undefined &&
                rule.automerge === false,
            'the safe preset major-update automerge override'
        );
        assert.ok(
            shallowConfig.packageRules.indexOf(broadAutomergeRule) <
                shallowConfig.packageRules.indexOf(safeOverrideRule),
            'The safe preset override must follow the broad automerge rule'
        );
    }

    if (configFile === 'theme.json5') {
        findRule(
            shallowConfig.packageRules,
            (rule) => rule.matchPackageNames?.includes('@tryghost/theme-translations') &&
                rule.automerge === true &&
                rule.automergeType === 'pr' &&
                rule.schedule?.includes('every weekday'),
            'the theme-translations update policy'
        );
        findRule(
            shallowConfig.packageRules,
            (rule) => rule.matchPackageNames?.includes('beeper') &&
                rule.allowedVersions === '<3.0.0',
            'the theme beeper compatibility limit'
        );
    }
}

function assertExtraction(extractionEvent, statsEvent) {
    assert.deepEqual(statsEvent.stats.total, {fileCount: 3, depCount: 7});

    const npmDependencies = extractionEvent.packageFiles.npm
        .flatMap(({deps}) => deps)
        .map(({depName}) => depName)
        .sort();
    assert.deepEqual(npmDependencies, [
        '@tryghost/theme-translations',
        'beeper',
        'express',
        'postcss',
        'vite'
    ]);

    const terraformDependencies = extractionEvent.packageFiles.terraform
        .flatMap(({deps}) => deps)
        .map(({packageName}) => packageName);
    assert.deepEqual(terraformDependencies, ['hashicorp/aws']);
}

const log = await readFile(logFile, 'utf8');
const events = parseEvents(log);
const shallowEvent = findEvent(events, 'Resolved shallow config, without merging internal presets');
const fullEvent = findEvent(events, 'Full resolved config and hostRules including presets');
const statsEvent = findEvent(events, 'Dependency extraction complete');
const extractionEvent = findEvent(events, 'Extracted dependencies');

assert.deepEqual(fullEvent.config.errors, []);
assert.deepEqual(fullEvent.config.warnings, []);
assert.equal(fullEvent.config.configValidationError, false);
assertConfigSpecificPolicy(shallowEvent, fullEvent.config);
assertExtraction(extractionEvent, statsEvent);
