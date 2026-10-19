import { DatabaseSync } from 'node:sqlite';
import { mkdir, realpath, lstat, copyFile, readFile, writeFile, chmod, unlink } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { acquireDataLock } from '../server/data-lock.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const photo = /^photos\/[a-f0-9]{48}\.(jpg|png|webp)$/;
export async function restoreData(backupPath, destinationPath) {
  const source = await realpath(backupPath), requested = resolve(destinationPath);
  const destination = join(await realpath(dirname(requested)), basename(requested));
  const inside = relative(source, destination);
  if (!inside || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')))) throw Error('Wiederherstellung muss außerhalb des Backupordners liegen.');
  const release = await acquireDataLock(source);
  try {
    const photosInfo = await lstat(join(source, 'photos'));
    if (!photosInfo.isDirectory() || photosInfo.isSymbolicLink()) throw Error('Fotoverzeichnis ist ungültig oder verknüpft.');
    try { await lstat(join(source, 'INCOMPLETE')); throw Error('Unvollständiges Backup.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const manifest = JSON.parse(await readFile(join(source, 'backup.json'), 'utf8'));
    if (manifest.format !== 1 || manifest.sessionsIncluded !== false || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Unbekanntes Backupformat.');
    const names = new Set();
    for (const file of manifest.files) {
      if (!file || typeof file.path !== 'string' || (file.path !== 'knips.sqlite' && !photo.test(file.path)) || !/^[a-f0-9]{64}$/.test(file.sha256) || names.has(file.path)) throw Error('Ungültiges Backupmanifest.');
      names.add(file.path);
      const path = join(source, file.path), info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || digest(await readFile(path)) !== file.sha256) throw Error('Backupdatei fehlt, ist verknüpft oder wurde verändert.');
    }
    if (!names.has('knips.sqlite')) throw Error('Datenbank fehlt im Backup.');
    const db = new DatabaseSync(join(source, 'knips.sqlite'), { readOnly: true });
    try {
      if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Backupdatenbank ist beschädigt.');
      if (db.prepare('SELECT COUNT(*) n FROM sessions').get().n !== 0) throw Error('Backup enthält aktive Sitzungen.');
      const photos = db.prepare('SELECT filename FROM posts').all();
      if (photos.length + 1 !== names.size || photos.some(p => !names.has(`photos/${p.filename}`))) throw Error('Fotoverzeichnis und Datenbank stimmen nicht überein.');
    } finally { db.close(); }
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
