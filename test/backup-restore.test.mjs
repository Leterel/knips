import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { createKnips } from '../server/main.mjs';
import { backupData } from '../tools/backup.mjs';
import { restoreData } from '../tools/restore.mjs';
import { checkBackup, fileDigest } from '../tools/backup-check.mjs';

const password = 'synthetic-backup-password';
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6sYkAAAAASUVORK5CYII=';
const run = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'knips-backup-')), dataDir = join(root, 'data');
  let app, origin;
  async function start(path = dataDir, options = {}) {
    app = await createKnips({ dataDir: path, ...options });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  async function request(path, { method = 'GET', body, cookie } = {}) {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Knips-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const user = await request('/api/register', { method: 'POST', body: { username: 'alice', displayName: 'Alice', password } });
  assert.equal(user.status, 201);
  const post = await request('/api/posts', { method: 'POST', cookie: user.cookie, body: { image, caption: 'Backup fixture' } });
  assert.equal(post.status, 201);
  return { root, dataDir, request, start, origin: () => origin, close: () => app.close(), user, post: post.body.post };
}

test('offline backup and restore preserve accounts/photos and revoke old sessions', async t => {
  const f = await fixture(t), copy = join(f.root, 'backup'), restored = join(f.root, 'restored');
  await assert.rejects(backupData(f.dataDir, copy), /gesperrt/);
  await assert.rejects(createKnips({ dataDir: f.dataDir }), /gesperrt/);
  await f.close();
  const result = await backupData(f.dataDir, copy); assert.equal(result.photos, 1);
  const manifest = JSON.parse(await readFile(join(copy, 'backup.json'), 'utf8'));
  assert.equal(manifest.sessionsIncluded, false); assert.equal(manifest.files.length, 2);
  const original = new DatabaseSync(join(f.dataDir, 'knips.sqlite'), { readOnly: true });
  assert.equal(original.prepare('SELECT COUNT(*) n FROM sessions').get().n, 1); original.close();
  await assert.rejects(backupData(f.dataDir, copy), { code: 'EEXIST' });
  await assert.rejects(backupData(f.dataDir, join(f.dataDir, 'nested')), /außerhalb/);
  await restoreData(copy, restored);
  await assert.rejects(restoreData(copy, restored), { code: 'EEXIST' });
  await f.start(restored);
  assert.equal((await f.request('/api/me', { cookie: f.user.cookie })).body.user, null);
  const login = await f.request('/api/login', { method: 'POST', body: { username: 'alice', password } });
  assert.equal(login.status, 200);
  const feed = (await f.request('/api/feed', { cookie: login.cookie })).body.posts;
  assert.equal(feed.length, 1); assert.equal(feed[0].caption, 'Backup fixture');
  assert.deepEqual((await f.request(feed[0].image, { cookie: login.cookie })).body, Buffer.from(image, 'base64'));
});

test('corrupt/incomplete/path-traversing backups are rejected before restoration', async t => {
  const f = await fixture(t), copy = join(f.root, 'backup'); await f.close();
  await backupData(f.dataDir, copy);
  const manifestPath = join(copy, 'backup.json'), original = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(original); manifest.files[1].path = '../outside.png';
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(restoreData(copy, join(f.root, 'invalid')), /Ungültiges/);
  await writeFile(manifestPath, original);
  await writeFile(join(copy, 'INCOMPLETE'), 'partial');
  await assert.rejects(restoreData(copy, join(f.root, 'invalid')), /Unvollständiges/);
  await unlink(join(copy, 'INCOMPLETE'));
  await writeFile(join(copy, 'photos', JSON.parse(original).files[1].path.split('/')[1]), 'bad image');
  await assert.rejects(restoreData(copy, join(f.root, 'invalid')), /verändert/);
  assert.equal((await readdir(f.root)).includes('invalid'), false);
});

test('backup check verifies real files without restoring or changing saved content', async t => {
  const f=await fixture(t),copy=join(f.root,'backup');await f.close();
  await backupData(f.dataDir,copy);
  const manifestPath=join(copy,'backup.json'),raw=await readFile(manifestPath,'utf8');
  const manifest=JSON.parse(raw),entries=await readdir(copy);
  const before=await Promise.all(manifest.files.map(file=>fileDigest(join(copy,file.path))));
  const expected={passed:true,format:1,photos:1,files:2,sessionsIncluded:false};
  assert.deepEqual(await checkBackup(copy),expected);
  assert.deepEqual(await checkBackup(copy),expected);
  assert.deepEqual(await readdir(copy),entries);
  assert.equal(await readFile(manifestPath,'utf8'),raw);
  assert.deepEqual(await Promise.all(manifest.files.map(file=>fileDigest(join(copy,file.path)))),before);
  const cli=await run(process.execPath,[resolve('tools/backup-check.mjs'),copy],{timeout:10000});
  assert.deepEqual(JSON.parse(cli.stdout),expected);
  assert.ok(!cli.stdout.includes('alice')&&!cli.stdout.includes(password)&&!cli.stdout.includes(f.root));
  for(const altered of ['null','{',JSON.stringify({...manifest,files:[...manifest.files,manifest.files[0]]}),JSON.stringify({...manifest,files:[{path:'../outside',sha256:'0'.repeat(64)}]})]) {
    await writeFile(manifestPath,altered);
    await assert.rejects(checkBackup(copy));
    assert.ok(!(await readdir(copy)).includes('.knips.lock'));
  }
  await writeFile(manifestPath,raw);
  await writeFile(join(copy,'INCOMPLETE'),'partial');
  await assert.rejects(checkBackup(copy),/Unvollständiges/);await unlink(join(copy,'INCOMPLETE'));
  await writeFile(join(copy,'photos',manifest.files[1].path.split('/')[1]),'corrupted');
  await assert.rejects(checkBackup(copy),/verändert/);
  await assert.rejects(run(process.execPath,[resolve('tools/backup-check.mjs'),copy],{timeout:10000}),error=>error.code===1&&error.stderr.includes('Backupprüfung fehlgeschlagen'));
  assert.deepEqual(await readdir(f.root),['backup','data']);
});

test('failed server startup releases its data lock', async t => {
  const root = await mkdtemp(join(tmpdir(), 'knips-startup-')); t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(createKnips({ dataDir: root, moderatorUsernames: ['missing'] }), /Moderator/);
  const app = await createKnips({ dataDir: root }); await app.close();
  assert.equal((await readdir(root)).includes('.knips.lock'), false);
});

test('a CLI port conflict closes the database and releases the data lock', async t => {
  const f = await fixture(t), dataDir = join(f.root, 'cli-data');
  await assert.rejects(run(process.execPath, [resolve('server/main.mjs')], { env: { ...process.env, HOST: '127.0.0.1', PORT: new URL(f.origin()).port, DATA_DIR: dataDir, PUBLIC_ORIGIN: '', KNIPS_MODERATORS: '', KNIPS_REGISTRATION: 'closed' }, timeout: 10000 }), error => error.stderr.includes('EADDRINUSE'));
  assert.equal((await readdir(dataDir)).includes('.knips.lock'), false);
  const app = await createKnips({ dataDir }); await Promise.all([app.close(), app.close()]);
  assert.equal((await readdir(dataDir)).includes('.knips.lock'), false);
});
