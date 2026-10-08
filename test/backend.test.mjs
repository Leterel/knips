import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createKnips } from '../server/main.mjs';
import { request as httpRequest } from 'node:http';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6sYkAAAAASUVORK5CYII=';
const password = 'test-only-passphrase-123';
async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'knips-test-'));
  let app, origin;
  const start = async (options = {}) => { app = await createKnips({ dataDir, ...options }); await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve)); origin = `http://127.0.0.1:${app.server.address().port}`; };
  await start();
  t.after(async () => { await app.close(); await rm(dataDir,{recursive:true,force:true}); });
  async function request(path, { method='GET', cookie, body, headers={} }={}) {
    const response = await fetch(origin+path,{method,headers:{'X-Knips-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    const bytes = Buffer.from(await response.arrayBuffer());
    return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('application/json')?JSON.parse(bytes):bytes,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(username) { const result = await request('/api/register',{method:'POST',body:{username,displayName:username,password}}); assert.equal(result.status,201); return result.cookie; }
  async function post(cookie,caption='A real test image') { const result=await request('/api/posts',{method:'POST',cookie,body:{image:png,caption}}); assert.equal(result.status,201); return result.body.post; }
  async function streaming(path, cookie, body) {
    const payload = JSON.stringify(body), split = Math.floor(payload.length / 2);
    let req;
    const started = new Promise(resolve => app.server.once('request', resolve));
    const response = new Promise((resolve, reject) => {
      req = httpRequest(origin + path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Knips-Request': '1', 'Content-Length': Buffer.byteLength(payload) } }, res => { const chunks=[]; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) })); });
      req.on('error', reject); req.write(payload.slice(0, split));
    });
    await started; t.after(() => req.destroy());
    return { finish: () => { req.end(payload.slice(split)); return response; } };
  }
  return { request, register, post, streaming, dataDir, origin: () => origin, async restart(options){await app.close();await start(options);} };
}

test('moderators can review reports and remove content; ordinary accounts cannot', async t => {
  const f = await fixture(t), moderator = await f.register('moderator'), alice = await f.register('alice'), bob = await f.register('bob');
  await f.restart({ moderatorUsernames: ['moderator'] });
  assert.equal((await f.request('/api/me', { cookie: moderator })).body.user.moderator, true);
  assert.equal((await f.request('/api/moderation/reports', { cookie: bob })).status, 403);
  const photo = await f.post(alice);
  await f.request(`/api/posts/${photo.id}/report`, { method: 'POST', cookie: bob, body: { reason: 'Review this' } });
  const reports = (await f.request('/api/moderation/reports', { cookie: moderator })).body.reports;
  assert.equal(reports.length, 1); assert.equal(reports[0].author, 'alice');
  assert.equal((await f.request(reports[0].image, { cookie: moderator })).status, 200);
  assert.equal((await f.request(reports[0].image, { cookie: bob })).status, 403);
  assert.equal((await f.request(reports[0].image)).status, 401);
  const endpoint = `/api/moderation/reports/${reports[0].id}`;
  assert.equal((await f.request(endpoint, { method: 'POST', cookie: alice, body: { action: 'remove-post' } })).status, 403);
  assert.equal((await f.request(endpoint, { method: 'POST', cookie: moderator, body: { action: 'invalid' } })).status, 400);
  assert.equal((await f.request(endpoint, { method: 'POST', cookie: moderator, body: { action: 'dismiss' } })).status, 200);
  assert.equal((await f.request(photo.image, { cookie: alice })).status, 200);
  await f.request(`/api/posts/${photo.id}/report`, { method: 'POST', cookie: bob, body: { reason: 'Review again' } });
  const id = (await f.request('/api/moderation/reports', { cookie: moderator })).body.reports[0].id;
  assert.equal((await f.request(`/api/moderation/reports/${id}`, { method: 'POST', cookie: moderator, body: { action: 'remove-post' } })).status, 200);
  assert.equal((await f.request(photo.image, { cookie: alice })).status, 404);
  assert.deepEqual(await readdir(join(f.dataDir, 'photos')), []);
  await f.request('/api/account', { method: 'DELETE', cookie: moderator, body: { password } });
  const replacement = await f.register('moderator');
  assert.equal((await f.request('/api/moderation/reports', { cookie: replacement })).status, 403);
  await assert.rejects(f.restart({ moderatorUsernames: ['moderator'] }), /Identität/);
  await f.restart();
  assert.equal((await f.request('/api/moderation/reports', { cookie: replacement })).status, 403);
});

test('accounts, session boundaries, persistent photos, likes, comments and deletion', async t => {
  const f=await fixture(t), alice=await f.register('alice'), bob=await f.register('bob');
  assert.equal((await f.request('/api/register',{method:'POST',body:{username:'ALICE',displayName:'Duplicate',password}})).status,409);
  assert.equal((await f.request('/api/login',{method:'POST',body:{username:'alice',password:'wrong'}})).status,401);
  assert.equal((await f.request('/api/feed')).status,401);
  const photo=await f.post(alice,'<img src=x onerror=alert(1)>');
  assert.equal((await f.request(photo.image)).status,401);
  const media=await f.request(photo.image,{cookie:bob});
  assert.equal(media.status,200); assert.deepEqual(media.body,Buffer.from(png,'base64'));
  assert.equal(media.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await f.request(`/api/posts/${photo.id}`,{method:'DELETE',cookie:bob})).status,403);
  for(let i=0;i<2;i++) assert.equal((await f.request(`/api/posts/${photo.id}/like`,{method:'PUT',cookie:bob})).body.post.likes,1);
  const comment=await f.request(`/api/posts/${photo.id}/comments`,{method:'POST',cookie:bob,body:{body:'hello'}});
  assert.equal(comment.status,201); assert.equal(comment.body.post.comments[0].body,'hello');
  await f.restart();
  const feed=await f.request('/api/feed',{cookie:bob});
  assert.equal(feed.body.posts.length,1); assert.equal(feed.body.posts[0].caption,photo.caption); assert.equal(feed.body.posts[0].liked,true); assert.equal(feed.body.posts[0].commentCount,1);
  assert.equal((await f.request('/api/logout',{method:'POST',cookie:bob})).status,200);
  assert.equal((await f.request('/api/feed',{cookie:bob})).status,401);
  assert.equal((await f.request(`/api/posts/${photo.id}`,{method:'DELETE',cookie:alice})).status,200);
  assert.deepEqual(await readdir(join(f.dataDir,'photos')),[]);
});

test('CSRF, host, payload and input checks reject unsafe requests', async t => {
  const f=await fixture(t), alice=await f.register('alice');
  const upload={method:'POST',cookie:alice,body:{image:png,caption:''}};
  assert.equal((await f.request('/api/posts',{...upload,headers:{'X-Knips-Request':'0'}})).status,403);
  assert.equal((await f.request('/api/posts',{...upload,headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.request('/api/posts',{...upload,headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  // Node fetch rewrites Host; use the HTTP transport to exercise the actual wire header.
  const hostileHost = await new Promise((resolve, reject) => {
    const req = httpRequest(f.origin() + '/api/me', { headers: { Host: 'evil.example', Cookie: alice } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  assert.equal(hostileHost,403);
  for(const image of ['not base64','PHN2Zz48L3N2Zz4=','',png.slice(0,-4)]) assert.equal((await f.request('/api/posts',{...upload,body:{image}})).status,400);
  assert.equal((await f.request('/api/feed?before=-1',{cookie:alice})).status,400);
  assert.equal((await f.request('/api/feed?user=%27%20OR%201=1',{cookie:alice})).status,400);
  assert.equal((await f.request('/api/posts',{...upload,body:{image:png,caption:'x'.repeat(2201)}})).status,400);
  assert.deepEqual(await readdir(join(f.dataDir,'photos')),[]);
});

test('reports persist and blocking removes bidirectional access including direct media',async t=>{
  const f=await fixture(t),alice=await f.register('alice'),bob=await f.register('bob'),carol=await f.register('carol');
  const photo=await f.post(alice),third=await f.post(carol);
  await f.request(`/api/posts/${third.id}/comments`,{method:'POST',cookie:bob,body:{body:'hidden after block'}});
  for(let i=0;i<2;i++) assert.equal((await f.request(`/api/posts/${photo.id}/report`,{method:'POST',cookie:bob,body:{reason:'Spam test'}})).status,201);
  const db=new DatabaseSync(join(f.dataDir,'knips.sqlite'));assert.equal(db.prepare('SELECT COUNT(*) n FROM reports').get().n,1);db.close();
  assert.equal((await f.request('/api/blocks/alice',{method:'PUT',cookie:alice})).status,400);
  assert.equal((await f.request('/api/blocks/bob',{method:'PUT',cookie:alice})).status,200);
  await f.restart();
  assert.equal((await f.request('/api/blocks',{cookie:alice})).body.users[0].username,'bob');
  assert.equal((await f.request(photo.image,{cookie:bob})).status,404);
  assert.equal((await f.request('/api/profiles/alice',{cookie:bob})).status,404);
  assert.equal((await f.request('/api/profiles/bob',{cookie:alice})).status,404);
  assert.equal((await f.request(`/api/posts/${photo.id}/like`,{method:'PUT',cookie:bob})).status,404);
  assert.equal((await f.request(`/api/posts/${photo.id}/comments`,{method:'POST',cookie:bob,body:{body:'denied'}})).status,404);
  const feed=await f.request('/api/feed',{cookie:alice});
  assert.equal(feed.body.posts.find(p=>p.id===third.id).comments.length,0);
  assert.equal(feed.body.posts.find(p=>p.id===third.id).commentCount,0);
  assert.equal((await f.request('/api/feed',{cookie:bob})).body.posts.length,1);
  await f.request('/api/blocks/bob',{method:'DELETE',cookie:alice});
  assert.equal((await f.request(photo.image,{cookie:bob})).status,200);
});

test('account deletion verifies password, revokes every session and removes dependent records and files',async t=>{
  const f=await fixture(t),alice=await f.register('alice'),bob=await f.register('bob');
  const otherSession=(await f.request('/api/login',{method:'POST',body:{username:'alice',password}})).cookie;
  const photo=await f.post(alice),other=await f.post(bob);
  await f.request(`/api/posts/${other.id}/like`,{method:'PUT',cookie:alice});
  await f.request(`/api/posts/${other.id}/comments`,{method:'POST',cookie:alice,body:{body:'delete me'}});
  await f.request(`/api/posts/${other.id}/report`,{method:'POST',cookie:alice,body:{reason:'test'}});
  await f.request('/api/blocks/alice',{method:'PUT',cookie:bob});
  assert.equal((await f.request('/api/account',{method:'DELETE',cookie:alice,body:{password:'wrong'}})).status,403);
  assert.equal((await f.request('/api/me',{cookie:alice})).body.user.username,'alice');
  assert.equal((await f.request('/api/account',{method:'DELETE',cookie:alice,body:{password}})).status,200);
  assert.equal((await f.request('/api/me',{cookie:otherSession})).body.user,null);
  assert.equal((await f.request(photo.image,{cookie:bob})).status,404);
  const feed=(await f.request('/api/feed',{cookie:bob})).body.posts;
  assert.equal(feed.length,1);assert.equal(feed[0].likes,0);assert.equal(feed[0].commentCount,0);
  assert.equal((await readdir(join(f.dataDir,'photos'))).length,1);
  assert.deepEqual((await f.request('/api/blocks',{cookie:bob})).body.users,[]);
  const db=new DatabaseSync(join(f.dataDir,'knips.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reports').get().n,0);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();
  await f.restart(); assert.equal((await f.request('/api/me',{cookie:alice})).body.user,null);
});

test('feed pagination has no duplicates or missing records',async t=>{
  const f=await fixture(t),alice=await f.register('alice');
  for(let i=0;i<23;i++) await f.post(alice,`Photo ${i}`);
  const first=(await f.request('/api/feed',{cookie:alice})).body;
  assert.equal(first.posts.length,20);assert.ok(first.next);
  const second=(await f.request(`/api/feed?before=${first.next}`,{cookie:alice})).body;
  assert.equal(second.posts.length,3);assert.equal(second.next,null);
  assert.equal(new Set([...first.posts,...second.posts].map(p=>p.id)).size,23);
});

test('invite-only and closed signup enforce server-side rules without leaking the code', async t => {
  const f = await fixture(t), alice = await f.register('alice');
  const invitationCode = 'test-only-invitation-code';
  await f.restart({ registration: 'invite', invitationCode });
  assert.deepEqual((await f.request('/api/config')).body, { registration: 'invite' });
  const body = { username: 'invited', displayName: 'Invited', password };
  for (const code of [undefined, 'wrong', ['test-only-invitation-code']]) {
    const denied = await f.request('/api/register', { method: 'POST', body: { ...body, invitationCode: code } });
    assert.equal(denied.status, 403); assert.ok(!JSON.stringify(denied.body).includes(invitationCode));
  }
  assert.equal((await f.request('/api/register', { method: 'POST', body: { ...body, invitationCode } })).status, 201);
  await f.restart({ registration: 'closed' });
  assert.deepEqual((await f.request('/api/config')).body, { registration: 'closed' });
  assert.equal((await f.request('/api/register', { method: 'POST', body: { ...body, username: 'blocked', invitationCode } })).status, 403);
  assert.equal((await f.request('/api/login', { method: 'POST', body: { username: 'alice', password } })).status, 200);
  assert.equal((await f.request('/api/me', { cookie: alice })).body.user.username, 'alice');
});

test('in-flight writes cannot outlive logout, account deletion or a new block', async t => {
  const f = await fixture(t), alice = await f.register('alice'); let bob = await f.register('bob');
  const photo = await f.post(alice);
  const comment = await f.streaming(`/api/posts/${photo.id}/comments`, bob, { body: 'should not survive logout' });
  await f.request('/api/logout', { method: 'POST', cookie: bob });
  assert.equal((await comment.finish()).status, 401);
  bob = (await f.request('/api/login', { method: 'POST', body: { username: 'bob', password } })).cookie;
  const blockedComment = await f.streaming(`/api/posts/${photo.id}/comments`, bob, { body: 'should not cross a block' });
  await f.request('/api/blocks/bob', { method: 'PUT', cookie: alice });
  assert.equal((await blockedComment.finish()).status, 404);
  const upload = await f.streaming('/api/posts', bob, { image: png, caption: 'old identity' });
  await f.request('/api/account', { method: 'DELETE', cookie: bob, body: { password } });
  const replacement = await f.register('replacement');
  assert.equal((await upload.finish()).status, 401);
  const feed = (await f.request('/api/feed', { cookie: replacement })).body.posts;
  assert.equal(feed.length, 1); assert.equal(feed[0].commentCount, 0);
  assert.equal((await readdir(join(f.dataDir, 'photos'))).length, 1);
});
