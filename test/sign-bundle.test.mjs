import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { signBundle } from '../tools/sign-bundle.mjs';

const enabled = Boolean(process.env.SIGN_TEST_BUNDLE && process.env.SIGN_TEST_BUNDLETOOL && process.env.JAVA_HOME);
let folder, options, saved;
before(async () => {
  if (!enabled) return;
  folder = await mkdtemp(join(tmpdir(), 'upload-signing-test-'));
  saved = Object.fromEntries(['UPLOAD_KEYSTORE', 'UPLOAD_KEY_ALIAS', 'UPLOAD_STORE_PASSWORD', 'UPLOAD_KEY_PASSWORD'].map(name => [name, process.env[name]]));
  Object.assign(process.env, { UPLOAD_KEYSTORE: join(folder, 'test-upload.p12'), UPLOAD_KEY_ALIAS: 'upload-test',
    UPLOAD_STORE_PASSWORD: 'test-only-not-a-real-password-123', UPLOAD_KEY_PASSWORD: 'test-only-not-a-real-password-123' });
  const result = spawnSync(join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool'),
    ['-genkeypair', '-keystore', process.env.UPLOAD_KEYSTORE, '-alias', 'upload-test', '-storetype', 'PKCS12',
      '-storepass:env', 'UPLOAD_STORE_PASSWORD', '-keypass:env', 'UPLOAD_KEY_PASSWORD', '-keyalg', 'RSA',
      '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Isolated Upload Signing Test', '-noprompt'], { windowsHide: true });
  assert.equal(result.status, 0);
  options = { bundle: process.env.SIGN_TEST_BUNDLE, bundletool: process.env.SIGN_TEST_BUNDLETOOL, output: join(folder, 'valid') };
});
after(async () => {
  if (!enabled) return;
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  await rm(folder, { recursive: true, force: true });
});
test('missing signing configuration fails without writing output', async () => {
  await assert.rejects(signBundle({}), /Required:/);
});
test('real unsigned bundle is signed, strictly verified and validated; debug keys and unsafe reruns fail', { skip: !enabled }, async () => {
  await assert.rejects(signBundle({ ...options, alias: 'androiddebugkey' }), /debug signing keys/);
  const report = await signBundle(options);
  assert.equal(report.strictSignatureVerified, true);
  assert.equal(report.bundletoolValidated, true);
  assert.equal(report.playUploaded, false);
  assert.equal(report.storeApproved, false);
  assert.match(report.bundleSha256, /^[0-9a-f]{64}$/);
  const text = await readFile(join(options.output, 'signing-result.json'), 'utf8');
  assert.ok(!text.includes(process.env.UPLOAD_STORE_PASSWORD));
  await assert.rejects(signBundle(options), /already exists/);
  await assert.rejects(signBundle({ ...options, bundle: join(options.output, 'app-upload-signed.aab'), output: join(folder, 'resigned') }), /Input is signed/);
  await assert.rejects(access(join(folder, 'resigned')));
});
test('invalid input never receives success evidence', { skip: !enabled }, async () => {
  const bad = join(folder, 'invalid.aab'), destination = join(folder, 'invalid-output');
  await writeFile(bad, 'not an Android bundle');
  await assert.rejects(signBundle({ ...options, bundle: bad, output: destination }), /java failed/);
  await assert.rejects(access(destination));
});
