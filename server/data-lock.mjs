import { open, readFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

// Exclusive ownership coordinates the server and offline maintenance tools.
// Never auto-remove a stale lock: a reused process ID is not proof of ownership.
export async function acquireDataLock(dataDir) {
  const path = join(dataDir, '.knips.lock');
  const identity = JSON.stringify({ pid: process.pid, token: randomBytes(24).toString('hex') });
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Error('Knips-Datenordner ist gesperrt. Server vor Wartung stoppen. Nach einem Absturz die Sperrdatei erst nach Prüfung aller Knips-Prozesse manuell entfernen.');
    throw error;
  }
  try { await handle.writeFile(identity); }
  catch (error) { await handle.close(); await unlink(path).catch(() => {}); throw error; }
  await handle.close();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try { if (await readFile(path, 'utf8') === identity) await unlink(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}
