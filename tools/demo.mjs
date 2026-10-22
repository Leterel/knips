import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKnips } from '../server/main.mjs';

// A separate real backend, never the operator's configured data directory.
export async function startDemo({ temporaryParent = tmpdir() } = {}) {
  const dataDir = await mkdtemp(join(temporaryParent, 'knips-local-demo-'));
  const app = await createKnips({ dataDir, registration: 'open', trustProxy: false });
  try {
    await new Promise((ready, reject) => {
      app.server.once('error', reject);
      app.server.listen(0, '127.0.0.1', ready);
    });
  } catch (error) { await app.close(); throw error; }
  return { url: `http://127.0.0.1:${app.server.address().port}`, dataDir,
    address: app.server.address(), close: () => app.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 2) throw Error('Lokaler Teststart: npm run demo (ohne weitere Argumente).');
    const demo = await startDemo();
    console.log(`Knips zum Ausprobieren: ${demo.url}`);
    console.log(`Eigener Testdatenordner: ${demo.dataDir}`);
    console.log('Nur auf diesem PC erreichbar. Registrierung ist fuer diesen lokalen Test offen.');
    console.log('Zum Beenden Strg+C. Der Testordner bleibt erhalten; jeder Start beginnt neu.');
    const shutdown = () => demo.close().catch(() => { console.error('Testserver konnte nicht sauber schliessen.'); process.exitCode = 1; });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
