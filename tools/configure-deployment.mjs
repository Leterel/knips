import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function deploymentConfig(domain) {
  // Only a DNS hostname, never arbitrary Compose or Caddy input. Require a
  // public-looking FQDN; the operator must still own it and configure DNS.
  if (typeof domain !== 'string' || domain.length > 253 || domain !== domain.toLowerCase() ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
      /\.(?:localhost|local|internal|test|invalid|example)$/.test(domain)) {
    throw Error('Eine öffentliche DNS-Domain ohne Schema, Port oder Pfad angeben (z.B. fotos.deine-domain.de).');
  }
  return `# Privat aufbewahren. Nicht in Git einchecken.\nKNIPS_DOMAIN=${domain}\nKNIPS_REGISTRATION=invite\nKNIPS_INVITATION_CODE=${randomBytes(32).toString('hex')}\nKNIPS_MODERATORS=\n`;
}

export async function configureDeployment(domain, target = '.env') {
  const content = deploymentConfig(domain);
  // Exclusive creation: rerunning must not rotate the invitation secret or
  // overwrite an operator's configuration.
  await writeFile(target, content, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw Error('Aufruf: node tools/configure-deployment.mjs fotos.deine-domain.de');
    await configureDeployment(process.argv[2]);
    console.log('.env mit privatem Einladungscode erstellt. Anleitung: DEPLOYMENT.md');
  } catch (error) {
    console.error(error.code === 'EEXIST' ? '.env existiert bereits und wurde nicht verändert.' : error.message);
    process.exitCode = 1;
  }
}
