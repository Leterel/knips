import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, realpath, lstat, copyFile, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { acquireDataLock } from '../server/data-lock.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const photoName = /^[a-f0-9]{48}\.(jpg|png|webp)$/;

export async function backupData(sourcePath, destinationPath) {
  const source = await realpath(sourcePath), requested = resolve(destinationPath);
  const destination = join(await realpath(dirname(requested)), basename(requested));
  const inside = relative(source, destination);
  if (!inside || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))) throw Error('Backup-Ziel muss außerhalb des Datenordners liegen.');
  const release = await acquireDataLock(source);
  let db;
  try {
    for (const name of ['knips.sqlite', 'photos']) {
      const info = await lstat(join(source, name));
      if (info.isSymbolicLink() || (name === 'photos' ? !info.isDirectory() : !info.isFile())) throw Error('Ungültiger Datenordner oder verknüpfte Daten.');
    }
    db = new DatabaseSync(join(source, 'knips.sqlite'), { readOnly: true });
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Datenbankprüfung fehlgeschlagen.');
    const photos = db.prepare('SELECT filename FROM posts ORDER BY filename').all();
    for (const { filename } of photos) {
      if (!photoName.test(filename)) throw Error('Ungültiger Foto-Dateiname.');
      const info = await lstat(join(source, 'photos', filename));
      if (!info.isFile() || info.isSymbolicLink()) throw Error('Foto fehlt oder ist verknüpft.');
    }
    // mkdir is intentionally exclusive: existing backups must never be replaced.
    await mkdir(destination, { mode: 0o700 });
    await writeFile(join(destination, 'INCOMPLETE'), 'Dieses Backup ist noch nicht abgeschlossen.\n', { flag: 'wx', mode: 0o600 });
    await mkdir(join(destination, 'photos'), { mode: 0o700 });
    const database = join(destination, 'knips.sqlite');
    await backup(db, database); await chmod(database, 0o600);
    const snapshot = new DatabaseSync(database);
    try { snapshot.exec('DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);'); } finally { snapshot.close(); }
    const files = [{ path: 'knips.sqlite', sha256: digest(await readFile(database)) }];
    for (const { filename } of photos) {
      const target = join(destination, 'photos', filename);
      await copyFile(join(source, 'photos', filename), target); await chmod(target, 0o600);
      files.push({ path: `photos/${filename}`, sha256: digest(await readFile(target)) });
    }
    const manifest = { format: 1, createdAt: new Date().toISOString(), sessionsIncluded: false, files };
    await writeFile(join(destination, 'backup.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // The marker is preserved on failures so a partial copy is not mistaken for a backup.
    await unlink(join(destination, 'INCOMPLETE'));
    return { destination, photos: photos.length, files: files.length };
  } finally { try { db?.close(); } finally { await release(); } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) { console.error('Aufruf: node tools/backup.mjs DATENORDNER NEUER_BACKUPORDNER'); process.exitCode = 1; }
  else { try { console.log(JSON.stringify(await backupData(process.argv[2], process.argv[3]))); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
