import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKnips } from '../server/main.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const output = resolve('test-results/registration'); await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(join(output, 'data-'));
const invitationCode = 'synthetic-test-invitation';
let app, browser;
async function start(registration) {
  app = await createKnips({ dataDir, registration, invitationCode });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
}
try {
  let origin = await start('invite');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.locator('#invitation-label').waitFor({ state: 'visible' });
  await page.locator('[name=username]').fill('invited'); await page.locator('[name=displayName]').fill('Invited');
  await page.locator('#password').fill('synthetic-password-123');
  await page.locator('[name=invitationCode]').fill('wrong'); await page.locator('#auth-submit').click();
  await page.getByText('Ein gültiger Einladungscode ist erforderlich.', { exact: true }).waitFor();
  await page.locator('[name=invitationCode]').fill(invitationCode); await page.locator('#auth-submit').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  await app.close(); origin = await start('closed'); await page.context().clearCookies(); await page.goto(origin);
  await page.locator('#auth').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#register-tab').isDisabled(), true);
  assert.equal(await page.locator('#invitation-label').isVisible(), false);
  await page.locator('[name=username]').fill('invited'); await page.locator('#password').fill('synthetic-password-123'); await page.locator('#auth-submit').click();
  await page.locator('#app').waitFor({ state: 'visible' });
  assert.deepEqual(errors, []);
  console.log('PASS: invitation field, denied wrong invitation, successful signup, closed registration and existing-account login in mobile Chrome.');
} finally { await browser?.close(); await app?.close(); await rm(dataDir, { recursive: true, force: true }); }
