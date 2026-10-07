import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectImage, MAX_IMAGE_BYTES } from './images.mjs';

const derive = promisify(scrypt);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const JSON_LIMIT = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 16_384;
const publicFiles = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/icon.svg', ['icon.svg', 'image/svg+xml']]]);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const userView = user => ({ id: user.id, username: user.username, displayName: user.display_name });

async function passwordHash(password, salt) {
  return Buffer.from(await derive(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
}
function cleanText(value, max, label, allowEmpty = false) {
  if (typeof value !== 'string') fail(400, `${label} fehlt.`);
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) fail(400, `${label}: ${allowEmpty ? 'höchstens' : '1 bis'} ${max} Zeichen.`);
  return text;
}
async function readJson(req, limit = 16_384) {
  if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') fail(415, 'JSON-Anfrage erwartet.');
  if (Number(req.headers['content-length']) > limit) fail(413, 'Die Anfrage ist zu groß.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'Die Anfrage ist zu groß.'); chunks.push(chunk); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
  catch { fail(400, 'Die Anfrage enthält ungültiges JSON.'); }
}
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value));
}

export async function createKnips({ dataDir = resolve(root, 'data'), publicOrigin = '', secureCookies = publicOrigin.startsWith('https:'), moderatorUsernames = [], now = () => Date.now() } = {}) {
  if (!Array.isArray(moderatorUsernames) || moderatorUsernames.some(name => !/^[a-z0-9_]{3,24}$/.test(name))) throw Error('Ungültige Moderatorenliste.');
  if (publicOrigin) { const origin = new URL(publicOrigin); if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== publicOrigin) throw Error('PUBLIC_ORIGIN muss genau eine HTTP(S)-Origin ohne Pfad sein.'); }
  const photosDir = join(dataDir, 'photos');
  await mkdir(photosDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'knips.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), filename TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, caption TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id, post_id));
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS blocks (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(user_id,blocked_id), CHECK(user_id != blocked_id));
    CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, reason TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(user_id,post_id));
    CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, id);
    CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`);
  const dummySalt = randomBytes(16).toString('hex'), dummyPassword = await passwordHash(randomBytes(32).toString('hex'), dummySalt);
  // Resolve already existing accounts once. A later signup cannot claim an operator role.
  const moderators = new Set(moderatorUsernames.map(name => db.prepare('SELECT id FROM users WHERE username=?').get(name)?.id).filter(id => id !== undefined));
  if (moderators.size !== new Set(moderatorUsernames).size) { db.close(); throw Error('Moderator-Konten zuerst anlegen, dann Server mit KNIPS_MODERATORS neu starten.'); }
  const sessionUser = user => ({ ...userView(user), moderator: moderators.has(user.id) });
  const rates = new Map();
  function rate(req, group, max, windowMs = 15 * 60 * 1000) {
    const key = `${group}:${req.socket.remoteAddress}`, stamp = now();
    for (const [k, bucket] of rates) if (bucket.until <= stamp) rates.delete(k);
    let bucket = rates.get(key);
    if (!bucket) { if (rates.size >= 2048) fail(429, 'Gerade ist viel los. Bitte später erneut versuchen.'); bucket = { count: 0, until: stamp + windowMs }; rates.set(key, bucket); }
    if (++bucket.count > max) fail(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.');
  }
  function setCookie(res, token, maxAge = SESSION_SECONDS) {
    res.setHeader('Set-Cookie', `knips_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`);
  }
  function getSession(req) {
    const token = (req.headers.cookie || '').split(';').map(p => p.trim()).find(p => p.startsWith('knips_session='))?.slice(14);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token), now());
    return user ? { user, tokenHash: hash(token) } : null;
  }
  function makeSession(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    // Bound the number of stored sessions per user without exposing old tokens.
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 9)').run(user.id, user.id);
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), user.id, now() + SESSION_SECONDS * 1000);
    setCookie(res, token);
  }
  function blocked(a, b) { return !!db.prepare('SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)').get(a,b,b,a); }
  function serializePost(row, viewer) {
    const stats = db.prepare('SELECT COUNT(*) AS likes, MAX(user_id=?) AS liked FROM likes WHERE post_id=?').get(viewer.id, row.id);
    const comments = db.prepare('SELECT c.id,c.body,c.created_at,u.username,u.display_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=c.user_id) OR (b.blocked_id=? AND b.user_id=c.user_id)) ORDER BY c.id DESC LIMIT 30').all(row.id, viewer.id, viewer.id).reverse();
    return { id: row.id, user: { username: row.username, displayName: row.display_name }, image: `/media/${row.filename}`, width: row.width, height: row.height, caption: row.caption, createdAt: row.created_at, mine: row.user_id === viewer.id, likes: stats.likes, liked: !!stats.liked, commentCount: db.prepare('SELECT COUNT(*) AS count FROM comments c WHERE post_id=? AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=c.user_id) OR (b.blocked_id=? AND b.user_id=c.user_id))').get(row.id, viewer.id, viewer.id).count, comments: comments.map(c => ({ id: c.id, body: c.body, createdAt: c.created_at, user: { username: c.username, displayName: c.display_name } })) };
  }
  const postSelect = 'SELECT p.*,u.username,u.display_name FROM posts p JOIN users u ON u.id=p.user_id';
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const host = req.headers.host || '';
      const requestOrigin = `http://${host}`;
      if (!publicOrigin && !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) fail(403, 'Für Netzwerkzugriff muss PUBLIC_ORIGIN konfiguriert werden.');
      if (publicOrigin && host !== new URL(publicOrigin).host) fail(403, 'Unbekannte Serveradresse.');
      const path = new URL(req.url, requestOrigin).pathname;
      if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) fail(405, 'Methode nicht erlaubt.');
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        if (req.headers['x-knips-request'] !== '1') fail(403, 'Die Anfrage muss aus der Knips-App kommen.');
        if (req.headers.origin && req.headers.origin !== (publicOrigin || requestOrigin)) fail(403, 'Fremde Webseiten dürfen hier nichts ändern.');
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Fremde Webseiten dürfen hier nichts ändern.');
      }
      if ((req.method === 'GET' || req.method === 'HEAD') && publicFiles.has(path)) {
        const [name, mime] = publicFiles.get(path); const body = await readFile(join(root, 'public', name));
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': body.length }); return res.end(req.method === 'HEAD' ? undefined : body);
      }
      if (path === '/health' && req.method === 'GET') return reply(res, 200, { ok: true });
      if (path === '/api/register' && req.method === 'POST') {
        rate(req, 'register', 8); const data = await readJson(req);
        const username = cleanText(data.username, 24, 'Nutzername').toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(username)) fail(400, 'Nutzername: 3–24 kleine Buchstaben, Zahlen oder Unterstriche.');
        const displayName = cleanText(data.displayName, 60, 'Anzeigename');
        if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) fail(400, 'Passwort: 10 bis 128 Zeichen.');
        const salt = randomBytes(16).toString('hex'), derived = await passwordHash(data.password, salt);
        let id;
        try { id = Number(db.prepare('INSERT INTO users(username,display_name,salt,password_hash,created_at) VALUES (?,?,?,?,?)').run(username, displayName, salt, derived.toString('hex'), now()).lastInsertRowid); }
        catch (error) { if (error.code === 'ERR_SQLITE_ERROR' && error.errcode === 2067) fail(409, 'Dieser Nutzername ist schon vergeben.'); throw error; }
        const user = db.prepare('SELECT * FROM users WHERE id=?').get(id); makeSession(res, user); return reply(res, 201, { user: sessionUser(user) });
      }
      if (path === '/api/login' && req.method === 'POST') {
        rate(req, 'login', 25); const data = await readJson(req);
        if (typeof data.username !== 'string' || data.username.length > 24 || typeof data.password !== 'string' || data.password.length > 128) fail(400, 'Bitte Nutzername und Passwort eingeben.');
        const user = db.prepare('SELECT * FROM users WHERE username=?').get(data.username.trim().toLowerCase());
        const actual = await passwordHash(data.password, user?.salt || dummySalt), expected = user ? Buffer.from(user.password_hash, 'hex') : dummyPassword;
        if (!timingSafeEqual(actual, expected) || !user) fail(401, 'Nutzername oder Passwort stimmt nicht.');
        makeSession(res, user); return reply(res, 200, { user: sessionUser(user) });
      }
      const session = getSession(req);
      if (path === '/api/me' && req.method === 'GET') return reply(res, 200, { user: session ? sessionUser(session.user) : null });
      if (!session) fail(401, 'Bitte melde dich zuerst an.');
      const user = session.user;
      if (path.startsWith('/api/moderation/')) {
        if (!moderators.has(user.id)) fail(403, 'Nur Moderatoren dürfen Meldungen bearbeiten.');
        if (path === '/api/moderation/reports' && req.method === 'GET') {
          const reports = db.prepare('SELECT r.id,r.reason,r.created_at AS createdAt,r.post_id AS postId,p.caption,u.username AS author,reporter.username AS reporter FROM reports r JOIN posts p ON p.id=r.post_id JOIN users u ON u.id=p.user_id JOIN users reporter ON reporter.id=r.user_id ORDER BY r.created_at,r.id LIMIT 50').all().map(report => ({ ...report, image: `/api/moderation/reports/${report.id}/image` }));
          return reply(res, 200, { reports });
        }
        const imageMatch = path.match(/^\/api\/moderation\/reports\/([1-9]\d{0,14})\/image$/);
        if (imageMatch && ['GET', 'HEAD'].includes(req.method)) {
          const post = db.prepare('SELECT p.filename,p.mime FROM reports r JOIN posts p ON p.id=r.post_id WHERE r.id=?').get(Number(imageMatch[1]));
          if (!post) fail(404, 'Meldung wurde bereits bearbeitet.');
          const bytes = await readFile(join(photosDir, post.filename));
          res.writeHead(200, { 'Content-Type': post.mime, 'Content-Length': bytes.length }); return res.end(req.method === 'HEAD' ? undefined : bytes);
        }
        const match = path.match(/^\/api\/moderation\/reports\/([1-9]\d{0,14})$/);
        if (match && req.method === 'POST') {
          const data = await readJson(req);
          if (!['dismiss', 'remove-post'].includes(data.action)) fail(400, 'Ungültige Moderationsaktion.');
          const report = db.prepare('SELECT r.post_id,p.filename FROM reports r JOIN posts p ON p.id=r.post_id WHERE r.id=?').get(Number(match[1]));
          if (!report) fail(404, 'Meldung wurde bereits bearbeitet.');
          if (data.action === 'dismiss') db.prepare('DELETE FROM reports WHERE id=?').run(Number(match[1]));
          else { db.prepare('DELETE FROM posts WHERE id=?').run(report.post_id); await unlink(join(photosDir, report.filename)).catch(error => { if (error.code !== 'ENOENT') console.error('Fotodatei konnte nicht entfernt werden:', error.code); }); }
          return reply(res, 200, { ok: true });
        }
        fail(404, 'Moderationsfunktion nicht gefunden.');
      }
      if (path === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.tokenHash); setCookie(res, '', 0); return reply(res, 200, { ok: true });
      }
      if (path === '/api/account' && req.method === 'DELETE') {
        rate(req, 'delete-account', 10); const data = await readJson(req);
        if (typeof data.password !== 'string' || data.password.length > 128) fail(400, 'Bitte Passwort bestätigen.');
        const actual = await passwordHash(data.password, user.salt);
        if (!timingSafeEqual(actual, Buffer.from(user.password_hash, 'hex'))) fail(403, 'Das Passwort stimmt nicht.');
        const files = db.prepare('SELECT filename FROM posts WHERE user_id=?').all(user.id);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM likes WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM comments WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM posts WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM users WHERE id=?').run(user.id);
          db.exec('COMMIT');
          moderators.delete(user.id);
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        await Promise.all(files.map(file => unlink(join(photosDir, file.filename)).catch(error => { if (error.code !== 'ENOENT') console.error('Fotodatei konnte nicht entfernt werden:', error.code); })));
        setCookie(res, '', 0); return reply(res, 200, { ok: true });
      }
      if (path === '/api/blocks' && req.method === 'GET') {
        return reply(res, 200, { users: db.prepare('SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=? ORDER BY u.username').all(user.id).map(userView) });
      }
      const blockMatch = path.match(/^\/api\/blocks\/([a-z0-9_]{3,24})$/);
      if (blockMatch && ['PUT','DELETE'].includes(req.method)) {
        const target = db.prepare('SELECT id FROM users WHERE username=?').get(blockMatch[1]);
        if (!target) fail(404, 'Profil nicht gefunden.');
        if (target.id === user.id) fail(400, 'Du kannst dich nicht selbst blockieren.');
        if (req.method === 'PUT') db.prepare('INSERT OR IGNORE INTO blocks(user_id,blocked_id) VALUES (?,?)').run(user.id,target.id);
        else db.prepare('DELETE FROM blocks WHERE user_id=? AND blocked_id=?').run(user.id,target.id);
        return reply(res, 200, { ok: true });
      }
      if (path.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
        const name = path.slice(7); if (!/^[a-f0-9]{48}\.(jpg|png|webp)$/.test(name)) fail(404, 'Foto nicht gefunden.');
        const post = db.prepare('SELECT mime,user_id FROM posts WHERE filename=?').get(name); if (!post || blocked(user.id,post.user_id)) fail(404, 'Foto nicht gefunden.');
        const bytes = await readFile(join(photosDir, name));
        res.writeHead(200, { 'Content-Type': post.mime, 'Content-Length': bytes.length }); return res.end(req.method === 'HEAD' ? undefined : bytes);
      }
      if (path === '/api/feed' && req.method === 'GET') {
        const params = new URL(req.url, requestOrigin).searchParams;
        const before = params.get('before'); if (before !== null && (!/^[1-9]\d{0,14}$/.test(before))) fail(400, 'Ungültige Seitennummer.');
        const username = params.get('user'); if (username !== null && !/^[a-z0-9_]{3,24}$/.test(username)) fail(400, 'Ungültiger Nutzername.');
        const rows = db.prepare(`${postSelect} WHERE p.id<? AND (? IS NULL OR u.username=?) AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=p.user_id) OR (b.blocked_id=? AND b.user_id=p.user_id)) ORDER BY p.id DESC LIMIT 21`).all(before ? Number(before) : Number.MAX_SAFE_INTEGER, username, username, user.id, user.id);
        const more = rows.length > 20; if (more) rows.pop();
        return reply(res, 200, { posts: rows.map(p => serializePost(p, user)), next: more ? rows.at(-1).id : null });
      }
      const profileMatch = path.match(/^\/api\/profiles\/([a-z0-9_]{3,24})$/);
      if (profileMatch && req.method === 'GET') {
        const profile = db.prepare('SELECT id,username,display_name FROM users WHERE username=?').get(profileMatch[1]); if (!profile || blocked(user.id,profile.id)) fail(404, 'Profil nicht gefunden.');
        return reply(res, 200, { user: userView(profile), posts: db.prepare('SELECT COUNT(*) AS count FROM posts WHERE user_id=?').get(profile.id).count });
      }
      if (path === '/api/posts' && req.method === 'POST') {
        rate(req, 'upload', 40); const data = await readJson(req, JSON_LIMIT); const caption = cleanText(data.caption ?? '', 2200, 'Bildtext', true);
        if (typeof data.image !== 'string' || !data.image.length || data.image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || data.image.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.image)) fail(400, 'Ungültige oder zu große Bilddatei.');
        const bytes = Buffer.from(data.image, 'base64'); if (bytes.toString('base64') !== data.image) fail(400, 'Ungültige Bilddatei.');
        const image = inspectImage(bytes), filename = `${randomBytes(24).toString('hex')}.${image.ext}`;
        await writeFile(join(photosDir, filename), bytes, { flag: 'wx', mode: 0o600 });
        let id;
        try { id = Number(db.prepare('INSERT INTO posts(user_id,filename,mime,width,height,caption,created_at) VALUES (?,?,?,?,?,?,?)').run(user.id, filename, image.type, image.width, image.height, caption, now()).lastInsertRowid); }
        catch (error) { await unlink(join(photosDir, filename)).catch(() => {}); throw error; }
        return reply(res, 201, { post: serializePost(db.prepare(`${postSelect} WHERE p.id=?`).get(id), user) });
      }
      const postMatch = path.match(/^\/api\/posts\/([1-9]\d{0,14})(?:\/(like|comments|report))?$/);
      if (postMatch) {
        const id = Number(postMatch[1]), action = postMatch[2];
        const post = db.prepare(`${postSelect} WHERE p.id=?`).get(id); if (!post || blocked(user.id,post.user_id)) fail(404, 'Beitrag nicht gefunden.');
        if (!action && req.method === 'DELETE') {
          if (post.user_id !== user.id) fail(403, 'Du kannst nur eigene Beiträge löschen.');
          db.prepare('DELETE FROM posts WHERE id=?').run(id); await unlink(join(photosDir, post.filename)).catch(() => {}); return reply(res, 200, { ok: true });
        }
        if (action === 'like' && ['PUT', 'DELETE'].includes(req.method)) {
          if (req.method === 'PUT') db.prepare('INSERT OR IGNORE INTO likes(user_id,post_id) VALUES (?,?)').run(user.id, id);
          else db.prepare('DELETE FROM likes WHERE user_id=? AND post_id=?').run(user.id, id);
          return reply(res, 200, { post: serializePost(post, user) });
        }
        if (action === 'report' && req.method === 'POST') {
          rate(req, 'report', 30); const data = await readJson(req); const reason = cleanText(data.reason, 1000, 'Meldegrund');
          if (post.user_id === user.id) fail(400, 'Eigene Beiträge kannst du löschen.');
          db.prepare('INSERT OR IGNORE INTO reports(user_id,post_id,reason,created_at) VALUES (?,?,?,?)').run(user.id,id,reason,now());
          return reply(res, 201, { ok: true });
        }
        if (action === 'comments' && req.method === 'POST') {
          rate(req, 'comment', 100); const data = await readJson(req); const body = cleanText(data.body, 500, 'Kommentar');
          db.prepare('INSERT INTO comments(user_id,post_id,body,created_at) VALUES (?,?,?,?)').run(user.id, id, body, now());
          return reply(res, 201, { post: serializePost(post, user) });
        }
      }
      fail(404, 'Diese Seite gibt es nicht.');
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (!error.status) console.error('Knips-Anfrage fehlgeschlagen:', error.code || error.name);
      reply(res, error.status || 500, { error: error.status ? error.message : 'Das hat gerade nicht geklappt. Bitte erneut versuchen.' });
    }
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000; server.maxHeadersCount = 50;
  let closed = false;
  return { server, async close() { if (closed) return; closed = true; if (server.listening) await new Promise((resolveClose, reject) => { server.close(error => error ? reject(error) : resolveClose()); server.closeIdleConnections(); }); db.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 8790), publicOrigin = process.env.PUBLIC_ORIGIN || '';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT muss zwischen 1 und 65535 liegen.');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !publicOrigin) throw Error('Bei Netzwerkzugriff ist PUBLIC_ORIGIN erforderlich. Für öffentliche Server HTTPS verwenden.');
  const app = await createKnips({ dataDir: process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : undefined, publicOrigin, moderatorUsernames: (process.env.KNIPS_MODERATORS || '').split(',').map(name => name.trim()).filter(Boolean) });
  app.server.listen(port, host, () => console.log(`Knips läuft: ${publicOrigin || `http://${host}:${port}`} (Strg+C beendet den Server)`));
  const shutdown = () => app.close().then(() => process.exit(0));
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
