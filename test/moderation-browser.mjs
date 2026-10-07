import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKnips } from '../server/main.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const output = resolve('test-results/moderation'); await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(join(output, 'data-'));
let app, browser, origin;
async function start(options = {}) { app = await createKnips({ dataDir, ...options }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${app.server.address().port}`; }
async function api(path, body, cookie) {
  const r = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Knips-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.ok(r.ok, `HTTP ${r.status}: ${path}`); return { body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
try {
  await start();
  for (const username of ['moderator', 'author', 'reporter']) await api('/api/register', { username, displayName: username, password: 'test-only-password-123' });
  await app.close(); await start({ moderatorUsernames: ['moderator'] });
  const author = await api('/api/login', { username: 'author', password: 'test-only-password-123' });
  const reporter = await api('/api/login', { username: 'reporter', password: 'test-only-password-123' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 100; return c.toDataURL('image/png').split(',')[1]; });
  const post = await api('/api/posts', { image, caption: 'Prüfbeitrag' }, author.cookie);
  await api(`/api/posts/${post.body.post.id}/report`, { reason: '<script>synthetischer Meldegrund</script>' }, reporter.cookie);
  await page.locator('#login-tab').click(); await page.locator('[name=username]').fill('moderator'); await page.locator('#password').fill('test-only-password-123'); await page.locator('#auth-submit').click();
  await page.locator('#nav-me').click(); await page.getByRole('button', { name: 'Meldungen prüfen' }).click();
  await page.locator('.moderation-report').waitFor();
  assert.equal(await page.locator('.moderation-report script').count(), 0);
  await page.locator('.moderation-image').evaluate(image => image.decode());
  await page.screenshot({ path: join(output, 'moderation.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Beitrag endgültig entfernen' }).click();
  await page.getByText('Keine offenen Meldungen.', { exact: true }).waitFor();
  assert.equal((await fetch(origin + post.body.post.image, { headers: { Cookie: author.cookie } })).status, 404);
  assert.deepEqual(errors, []);
  console.log('PASS: moderator login, protected image review, escaped report text, confirmed removal and refreshed queue in mobile Chrome.');
} finally { await browser?.close(); await app?.close(); await rm(dataDir, { recursive: true, force: true }); }
