import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentConfig, configureDeployment } from '../tools/configure-deployment.mjs';
import { createKnips } from '../server/main.mjs';
import { request as httpRequest } from 'node:http';
import { containerHealth } from '../tools/container-health.mjs';

test('deployment config is private, invitation-only, random and never overwrites', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'knips-deploy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const target = join(dir, '.env');
  await configureDeployment('fotos.my-domain.de', target);
  const config = await readFile(target, 'utf8');
  assert.match(config, /KNIPS_REGISTRATION=invite\n/);
  assert.match(config, /KNIPS_INVITATION_CODE=[a-f0-9]{64}\n/);
  assert.notEqual(config, deploymentConfig('fotos.my-domain.de'));
  await assert.rejects(configureDeployment('other.my-domain.de', target), { code: 'EEXIST' });
  assert.equal(await readFile(target, 'utf8'), config);
  if (process.platform !== 'win32') assert.equal((await stat(target)).mode & 0o777, 0o600);
  for (const invalid of ['localhost', '127.0.0.1', 'https://x.de', 'x.de:443', 'x.de/path', 'x.de\nEVIL=1', '${EVIL}.de', 'UPPER.de', 'x.local', 'x.test', '-x.de', 'x..de']) {
    assert.throws(() => deploymentConfig(invalid), undefined, invalid);
  }
});

test('proxy rate limits use only explicitly trusted, valid proxy addresses', async t => {
  for (const trusted of [false, true]) {
    const dir = await mkdtemp(join(tmpdir(), 'knips-proxy-'));
    const app = await createKnips({ dataDir: dir, trustProxy: trusted });
    try {
      await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
      const url = `http://127.0.0.1:${app.server.address().port}/api/register`;
      const request = address => fetch(url, { method: 'POST', headers: {
        'Content-Type': 'application/json', 'X-Knips-Request': '1', 'X-Knips-Client-IP': address,
      }, body: '{}' }); // Invalid registration avoids creating any accounts.
      for (let i = 0; i < 8; i++) assert.equal((await request('192.0.2.1')).status, 400);
      assert.equal((await request('192.0.2.1')).status, 429);
      assert.equal((await request('192.0.2.2')).status, trusted ? 400 : 429);
      if (trusted) {
        for (let i = 0; i < 8; i++) assert.equal((await request(`invalid-${i}`)).status, 400);
        assert.equal((await request('invalid-new')).status, 429);
      }
    } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
  }
});

test('account deletion resource is public without changing accounts or sessions', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'knips-delete-page-'));
  const app = await createKnips({ dataDir: dir, registration: 'closed', publicOrigin: 'https://fotos.my-domain.de' });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const publicRequest = (path, method = 'GET') => new Promise((resolveResponse, reject) => {
    const req = httpRequest(origin + path, { method, headers: { Host: 'fotos.my-domain.de', 'X-Knips-Request': '1' } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolveResponse({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end();
  });
  for (const method of ['GET', 'HEAD']) {
    const response = await publicRequest('/delete-account', method);
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/html/);
    assert.equal(response.headers['set-cookie'], undefined);
    if (method === 'GET') {
      const html = response.text;
      assert.match(html, /Knips/);
      assert.match(html, /href="\/\?account=delete#me"/);
      assert.match(html, /Sicherungskopien/);
    } else assert.equal(response.text, '');
  }
  await containerHealth('https://fotos.my-domain.de', app.server.address().port);
  await assert.rejects(containerHealth('https://wrong.my-domain.de', app.server.address().port));
  assert.equal((await fetch(`${origin}/delete-account`)).status, 403, 'public resource retains Host protection');
  const deletion = await publicRequest('/api/account', 'DELETE');
  assert.equal(deletion.status, 401, 'anonymous page never bypasses deletion authentication');
});
