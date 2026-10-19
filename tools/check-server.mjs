import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkServer(address, { timeoutMs = 10000 } = {}) {
  const url = new URL(address);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw Error('Eine HTTPS-Serveradresse ohne Zugangsdaten, Pfad oder Parameter angeben. HTTP nur für Loopback.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Ungültige Zeitgrenze.');
  const signal = AbortSignal.timeout(timeoutMs);
  async function json(path) {
    const response = await fetch(new URL(path, url), { redirect: 'error', signal, headers: { Accept: 'application/json' } });
    if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) throw Error(`Unerwartete Antwort für ${path}.`);
    // Bound response bodies too; a successful HTTP status alone is insufficient.
    const reader = response.body.getReader(); let size = 0; const chunks = [];
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 16384) throw Error(`Antwort für ${path} ist zu groß.`);
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const health = await json('/health');
  if (health?.ok !== true || health.service !== 'knips') throw Error('Die Adresse liefert keinen erkannten Knips-Server.');
  const config = await json('/api/config');
  if (!['open', 'invite', 'closed'].includes(config?.registration)) throw Error('Ungültige Registrierungskonfiguration.');
  const session = await json('/api/me');
  if (session?.user !== null) throw Error('Anonyme Sitzung wird nicht wie erwartet behandelt.');
  return { origin: url.origin, reachable: true, registration: config.registration, anonymousSession: true, mutations: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.KNIPS_SERVER_URL) throw Error('KNIPS_SERVER_URL setzen.');
    console.log(JSON.stringify(await checkServer(process.env.KNIPS_SERVER_URL), null, 2));
  } catch {
    // Do not print URLs, credentials, response bodies or infrastructure errors.
    console.error('Knips-Prüfung fehlgeschlagen: Adresse, HTTPS-Zertifikat und Serverprotokoll prüfen.'); process.exitCode = 1;
  }
}
