import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createKnips } from '../server/main.mjs';
import { checkServer } from '../tools/check-server.mjs';

test('deployment checker reads a real Knips server without creating accounts or sessions', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'knips-check-'));
  const app = await createKnips({ dataDir, registration: 'closed' });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const result = await checkServer(`http://127.0.0.1:${app.server.address().port}`);
  assert.equal(result.registration, 'closed'); assert.equal(result.anonymousSession, true); assert.equal(result.mutations, false);
});
test('deployment checker rejects insecure remote addresses and embedded secrets', async () => {
  for (const address of ['http://example.com', 'https://name:secret@example.com', 'https://example.com/path', 'https://example.com/?secret=1', 'https://example.com/#token']) {
    await assert.rejects(checkServer(address));
  }
});
test('deployment checker rejects misleading, oversized, redirecting and stalled servers', async t => {
  let mode = 'fake';
  const server = createServer((req, res) => {
    if (mode === 'stall') return;
    if (mode === 'redirect') { res.writeHead(302, { Location: '/login' }); return res.end(); }
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'oversize') return res.end(' '.repeat(17000));
    if (req.url === '/health') return res.end(JSON.stringify(mode === 'fake' ? { ok: true } : { ok: true, service: 'knips' }));
    res.end(JSON.stringify(req.url === '/api/config' ? { registration: mode === 'config' ? 'broken' : 'open' } : { user: {} }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const address = `http://127.0.0.1:${server.address().port}`;
  for (mode of ['fake', 'oversize', 'redirect', 'config', 'session', 'stall']) await assert.rejects(checkServer(address, { timeoutMs: 200 }));
});
