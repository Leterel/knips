import { mkdir, realpath, copyFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acquireDataLock } from '../server/data-lock.mjs';

import { inspectBackup } from './backup-check.mjs';
export async function restoreData(backupPath, destinationPath) {
  const source = await realpath(backupPath), requested = resolve(destinationPath);
  const destination = join(await realpath(dirname(requested)), basename(requested));
  const inside = relative(source, destination);
  if (!inside || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))) throw Error('Wiederherstellung muss außerhalb des Backupordners liegen.');
  const release = await acquireDataLock(source);
  try {
    const manifest = await inspectBackup(source);
    await mkdir(destination, { mode: 0o700 });
    // A failed restore stays locked; the operator must inspect the partial copy.
    const marker = join(destination, '.knips.lock');
    await writeFile(marker, 'Unvollständige Wiederherstellung. Diesen Ordner erst prüfen.\n', { flag: 'wx', mode: 0o600 });
    await mkdir(join(destination, 'photos'), { mode: 0o700 });
    for (const file of manifest.files) { const target = join(destination, file.path); await copyFile(join(source, file.path), target); await chmod(target, 0o600); }
    await unlink(marker);
    return { destination, photos: manifest.files.length - 1, files: manifest.files.length };
  } finally { await release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) { console.error('Aufruf: node tools/restore.mjs BACKUPORDNER NEUER_DATENORDNER'); process.exitCode = 1; }
  else { try { console.log(JSON.stringify(await restoreData(process.argv[2], process.argv[3]))); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
