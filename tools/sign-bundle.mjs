import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Passwords are passed to Java only by environment variable, never argv or logs.
export async function signBundle({ bundle, bundletool, output, javaHome = process.env.JAVA_HOME,
  keystore = process.env.UPLOAD_KEYSTORE, alias = process.env.UPLOAD_KEY_ALIAS } = {}) {
  if (!bundle || !bundletool || !output || !javaHome || !keystore || !alias ||
      !process.env.UPLOAD_STORE_PASSWORD || !process.env.UPLOAD_KEY_PASSWORD) {
    throw Error('Required: --bundle, --bundletool, --output, JAVA_HOME, UPLOAD_KEYSTORE, UPLOAD_KEY_ALIAS, UPLOAD_STORE_PASSWORD, UPLOAD_KEY_PASSWORD.');
  }
  const bundlePath = resolve(bundle), toolPath = resolve(bundletool), outputPath = resolve(output);
  const keyPath = resolve(keystore);
  if (alias.toLowerCase() === 'androiddebugkey') throw Error('Android debug signing keys are not upload keys.');
  for (const path of [bundlePath, toolPath, keyPath]) await access(path);
  try { await access(outputPath); throw Error('Output already exists; choose a new directory.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const executable = name => join(javaHome, 'bin', name + (process.platform === 'win32' ? '.exe' : ''));
  function run(name, args) {
    const result = spawnSync(executable(name), args, { encoding: 'utf8', windowsHide: true, timeout: 120000,
      maxBuffer: 4 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Error(`${name} failed (${result.error?.code || result.status}); no release success recorded.`);
    return result.stdout;
  }
  const certificatePem = run('keytool', ['-exportcert', '-rfc', '-keystore', keyPath, '-alias', alias,
    '-storepass:env', 'UPLOAD_STORE_PASSWORD']);
  const certificate = new X509Certificate(certificatePem);
  if (/android debug/i.test(certificate.subject)) throw Error('Android debug certificate rejected.');
  if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) < Date.now() + 90 * 86400000) {
    throw Error('Upload certificate is not valid for at least the next 90 days.');
  }
  const key = certificate.publicKey, details = key.asymmetricKeyDetails;
  if (!(key.asymmetricKeyType === 'rsa' && details.modulusLength >= 3072) &&
      !(key.asymmetricKeyType === 'ec' && ['prime256v1', 'secp384r1', 'secp521r1'].includes(details.namedCurve))) {
    throw Error('Use an RSA upload key of at least 3072 bits or a supported EC key.');
  }
  run('java', ['-jar', toolPath, 'validate', `--bundle=${bundlePath}`]);
  // Refuse to re-sign already signed input, preserving the unsigned-build boundary.
  const existing = spawnSync(executable('keytool'), ['-printcert', '-rfc', '-jarfile', bundlePath],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (existing.error || /BEGIN CERTIFICATE/.test(existing.stdout || '')) throw Error('Input is signed or could not be inspected.');
  await mkdir(outputPath); // exclusive output directory; no existing evidence overwritten
  const signed = join(outputPath, 'app-upload-signed.aab');
  run('jarsigner', ['-keystore', keyPath, '-storepass:env', 'UPLOAD_STORE_PASSWORD',
    '-keypass:env', 'UPLOAD_KEY_PASSWORD', '-digestalg', 'SHA-256', '-sigalg',
    key.asymmetricKeyType === 'rsa' ? 'SHA256withRSA' : 'SHA256withECDSA',
    '-signedjar', signed, bundlePath, alias]);
  run('jarsigner', ['-verify', '-strict', '-keystore', keyPath, '-storepass:env', 'UPLOAD_STORE_PASSWORD', signed]);
  const signedCertificate = new X509Certificate(run('keytool', ['-printcert', '-rfc', '-jarfile', signed]));
  if (signedCertificate.fingerprint256 !== certificate.fingerprint256) throw Error('Signed bundle certificate does not match upload key.');
  run('java', ['-jar', toolPath, 'validate', `--bundle=${signed}`]);
  const { createHash } = await import('node:crypto');
  const report = { uploadSigned: true, bundletoolValidated: true, strictSignatureVerified: true,
    certificateSha256: certificate.fingerprint256, bundleSha256: createHash('sha256').update(await readFile(signed)).digest('hex'),
    playUploaded: false, storeApproved: false, monetizationEnabled: false };
  await writeFile(join(outputPath, 'signing-result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--bundle', '--bundletool', '--output'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || options[args[i].slice(2)]) {
        throw Error('Usage: node tools/sign-bundle.mjs --bundle unsigned.aab --bundletool bundletool.jar --output NEW_DIRECTORY');
      }
      options[args[i].slice(2)] = args[i + 1];
    }
    console.log(JSON.stringify(await signBundle(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
