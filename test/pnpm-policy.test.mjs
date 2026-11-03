import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const pnpm = process.env.PNPM_BINARY || 'pnpm';
const policy = JSON.parse(await readFile(join(root, 'packages/pnpm-policy/policy.yaml'), 'utf8'));
const check = join(root, '.github/actions/pnpm-policy/check.mjs');

test('packed declarative policy, delegated settings and rejection paths', async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), 'ghost-pnpm-policy-'));
    t.after(() => rm(temporary, {recursive: true, force: true}));
    const manifest = JSON.parse(await readFile(join(root, 'packages/pnpm-policy/package.json'), 'utf8'));
    assert.equal(manifest.scripts, undefined);
    assert.equal(manifest.dependencies, undefined);
    assert.equal(manifest.optionalDependencies, undefined);
    await exec(pnpm, ['pack', '--pack-destination', temporary], {cwd: join(root, 'packages/pnpm-policy')});
    const tarball = await readFile(join(temporary, `tryghost-pnpm-policy-${manifest.version}.tgz`));
    const {stdout: packedFiles} = await exec('tar', ['-tzf', join(temporary, `tryghost-pnpm-policy-${manifest.version}.tgz`)]);
    assert.deepEqual(packedFiles.trim().split('\n').sort(), ['package/LICENSE', 'package/README.md', 'package/package.json', 'package/policy.yaml']);
    const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
    const server = createServer((request, response) => {
        if (request.url.includes('.tgz')) {
            response.end(tarball);
            return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
            name: manifest.name,
            'dist-tags': {latest: manifest.version},
            time: {[manifest.version]: '2020-01-01T00:00:00.000Z'},
            versions: {[manifest.version]: {...manifest, dist: {integrity, tarball: `http://127.0.0.1:${server.address().port}/policy.tgz`}}}
        }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const registry = `http://127.0.0.1:${server.address().port}/`;
    const consumer = join(temporary, 'consumer');
    await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), JSON.stringify({name: 'policy-consumer', private: true}));
    // Isolate registry credentials and stores; no requests to the public registry.
    await writeFile(join(consumer, '.npmrc'), `registry=${registry}\nstore-dir=${temporary}/store\n`);
    const config = {
        pnpmfile: [],
        configDependencies: {[manifest.name]: manifest.version},
        bootConfig: {minimumReleaseAge: 4320},
        include: {[manifest.name]: Object.keys(policy)},
        allowBuilds: {'esbuild@0.28.2': true, 'dtrace-provider': false}
    };
    const configPath = join(consumer, 'pnpm-workspace.yaml');
    const writeConfig = value => writeFile(configPath, JSON.stringify(value));
    await writeConfig(config);
    await exec(pnpm, ['install'], {cwd: consumer});
    await exec(pnpm, ['install', '--frozen-lockfile'], {cwd: consumer});
    await exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}});
    for (const [key, value] of Object.entries(policy)) {
        const {stdout} = await exec(pnpm, ['config', 'get', key, '--json'], {cwd: consumer});
        assert.equal(JSON.parse(stdout), value);
    }
    for (const bootConfig of [{minimumReleaseAge: 0}, {}, {minimumReleaseAge: 4320, minimumReleaseAgeStrict: false}]) {
        await writeConfig({...config, bootConfig});
        await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /bootConfig.minimumReleaseAge/.test(error.stderr));
    }
    await writeConfig({...config, minimumReleaseAgeStrict: false});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /minimumReleaseAgeStrict must be true/.test(error.stderr));
    await writeConfig({...config, trustLockfile: true});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /trustLockfile must be false/.test(error.stderr));
    await writeConfig({...config, permissions: {esbuild: {build: true}}});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /Build approval must pin/.test(error.stderr));
    await writeConfig({...config, permissions: {'esbuild@0.28.2': {build: true}, 'other-package': {skills: false}, 'nx': {build: false}}});
    await exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}});
    // Ghost legitimately approves two reviewed esbuild versions. An explicit
    // finite list must pass in both permission formats without permitting a range.
    await writeConfig({...config,
        allowBuilds: {'esbuild@0.25.12 || 0.28.2': true, '@legacy/*': false},
        permissions: {'@parcel/watcher@2.5.1 || 2.6.0': {build: true}},
        minimumReleaseAgeExclude: ['markdown-it@14.3.3', '@nx/js@23.2.1 || 23.3.1'],
        bootConfig: {...config.bootConfig, minimumReleaseAgeExclude: ['pnpm@12.16.1']}
    });
    await exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}});
    for (const selector of ['esbuild@^0.28.0', 'esbuild@>=0.28.2', 'esbuild@0.28.x', 'esbuild@0.28.2 || *', '*@0.28.2', 'esbuild@01.2.3', 'esbuild@1.2.3-01']) {
        for (const decision of [{allowBuilds: {[selector]: true}}, {permissions: {[selector]: {build: true}}}]) {
            await writeConfig({...config, ...decision});
            await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /Build approval must pin exact versions/.test(error.stderr));
        }
    }
    for (const selector of ['@tryghost/*', 'pnpm', '@nx/nx-*', 'nx@^23.0.0', 'nx@23.3.1 || *', '*', '**', '?*']) {
        for (const exception of [
            {minimumReleaseAgeExclude: [selector]},
            {bootConfig: {...config.bootConfig, minimumReleaseAgeExclude: [selector]}}
        ]) {
            await writeConfig({...config, ...exception});
            await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /minimumReleaseAgeExclude must exempt exact versions/.test(error.stderr));
        }
    }
    await writeConfig({...config, minimumReleaseAge: 0});
    await assert.rejects(exec(pnpm, ['install'], {cwd: consumer}), error => /DUPLICATE_SETTING/.test(error.stdout + error.stderr));
    await writeConfig({...config, allowBuilds: {esbuild: true}});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /Build approval must pin/.test(error.stderr));
    await writeConfig({...config, include: {[manifest.name]: ['minimumReleaseAge']}});
    await assert.rejects(exec(pnpm, ['install'], {cwd: consumer}), error => /SETTING_NOT_DELEGATED/.test(error.stdout + error.stderr));
    // CI also accepts repositories that have not yet adopted configDependencies.
    await writeConfig({...policy, pnpmfile: [], allowBuilds: {esbuild: false}});
    await exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}});
    await writeConfig({...policy, minimumReleaseAge: 60});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /minimumReleaseAge must be at least/.test(error.stderr));
    await writeConfig({...policy, dangerouslyAllowAllBuilds: true});
    await assert.rejects(exec(process.execPath, [check, consumer], {env: {...process.env, PNPM_BINARY: pnpm}}), error => /dangerouslyAllowAllBuilds must be false/.test(error.stderr));
});
