import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const [rootDirectory, portFile] = process.argv.slice(2);
const presetFiles = new Set([
    '/.github/renovate.json5',
    '/default.json',
    '/quiet.json5',
    '/safe.json',
    '/terraform.json5',
    '/theme.json5'
]);

if (!rootDirectory || !portFile) {
    throw new Error('Usage: serve-presets.mjs <root-directory> <port-file>');
}

const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;

    if (!presetFiles.has(path)) {
        response.writeHead(404);
        response.end();
        return;
    }

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const preset = await readFile(resolve(rootDirectory, `.${path}`), 'utf8');
    const localPreset = preset
        .replaceAll('github>tryghost/renovate-config:quiet.json5', `${baseUrl}/quiet.json5`)
        .replaceAll('github>tryghost/renovate-config', `${baseUrl}/default.json`);

    response.writeHead(200, {'content-type': 'application/json'});
    response.end(localPreset);
});

server.listen(0, '127.0.0.1', async () => {
    await writeFile(portFile, String(server.address().port));
});
