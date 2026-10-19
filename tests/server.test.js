import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'server', 'server.js');
const supabaseEnvironment = {
  SUPABASE_URL: 'https://auth-test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
};

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function launchApi(extraEnvironment = {}) {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'soulsite-api-'));
  const port = await getAvailablePort();
  const environment = { ...process.env, ...extraEnvironment };
  delete environment.SUPABASE_URL;
  delete environment.SUPABASE_ANON_KEY;
  delete environment.SUPABASE_SERVICE_ROLE_KEY;
  Object.assign(environment, extraEnvironment, {
    PORT: String(port),
    SOULSITE_DATA_DIR: dataDirectory,
  });

  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // The child can need several seconds to initialize the local SQLite database.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `API did not start:\n${output}`);
  } catch (error) {
    child.kill();
    await rm(dataDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    baseUrl,
    child,
    close: async () => {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

let api;
let authenticatedApi;

before(async () => {
  api = await launchApi();
});

after(async () => {
  await Promise.all([api?.close(), authenticatedApi?.close()]);
});

test('health and config expose the expected demo and auth modes', async () => {
  const health = await fetch(`${api.baseUrl}/health`).then((response) => response.json());
  const config = await fetch(`${api.baseUrl}/api/config`).then((response) => response.json());
  assert.deepEqual(health, { status: 'ok', authEnabled: false });
  assert.deepEqual(config, {
    tiers: { Free: 5, Standard: 20, Pro: 50 },
    authEnabled: false,
  });
});

test('profiles and the local SQLite decision fallback remain available', async () => {
  const profiles = await fetch(`${api.baseUrl}/api/profiles`).then((response) => response.json());
  assert.equal(profiles.profiles.length, 3);

  const makeDecision = (userId) => fetch(`${api.baseUrl}/api/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, profileId: 'nova', action: 'yes' }),
  });
  const first = await makeDecision('demo-one').then((response) => response.json());
  const second = await makeDecision('demo-two').then((response) => response.json());
  assert.equal(first.remaining, 4);
  assert.equal(second.remaining, 4);
});

test('invalid decisions are rejected before writing', async () => {
  const response = await fetch(`${api.baseUrl}/api/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId: 'not-a-profile', action: 'maybe' }),
  });
  assert.equal(response.status, 400);
});

test('configured auth requires bearer credentials for private routes', async () => {
  await api.close();
  api = null;
  authenticatedApi = await launchApi(supabaseEnvironment);

  const config = await fetch(`${authenticatedApi.baseUrl}/api/config`).then((response) => response.json());
  assert.equal(config.authEnabled, true);

  const decision = await fetch(`${authenticatedApi.baseUrl}/api/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'spoofed-user', profileId: 'nova', action: 'yes' }),
  });
  assert.equal(decision.status, 401);

  const usage = await fetch(`${authenticatedApi.baseUrl}/api/decision/usage`);
  assert.equal(usage.status, 401);
});

test('partial Supabase server configuration fails fast', () => {
  const result = spawnSync(process.execPath, [serverPath], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '3001',
      SUPABASE_URL: supabaseEnvironment.SUPABASE_URL,
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      SOULSITE_DATA_DIR: os.tmpdir(),
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY together/);
});
