import {DatabaseSync} from 'node:sqlite';
import {createReadStream} from 'node:fs';
import {realpath,lstat,readFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {acquireDataLock} from '../server/data-lock.mjs';

const photo=/^photos\/[a-f0-9]{48}\.(jpg|png|webp)$/;

export async function fileDigest(path) {
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}

// Caller owns the backup lock. Shared by checking and restoring: one contract.
export async function inspectBackup(source) {
  const photosInfo=await lstat(join(source,'photos'));
  if(!photosInfo.isDirectory()||photosInfo.isSymbolicLink())throw Error('Fotoverzeichnis ist ungültig oder verknüpft.');
  try {await lstat(join(source,'INCOMPLETE'));throw Error('Unvollständiges Backup.');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const info=await lstat(join(source,'backup.json'));
  if(!info.isFile()||info.isSymbolicLink())throw Error('Ungültiges oder verknüpftes Backupmanifest.');
  let manifest;
  try {manifest=JSON.parse(await readFile(join(source,'backup.json'),'utf8'));}
  catch {throw Error('Ungültiges Backupmanifest.');}
  if(!manifest||manifest.format!==1||manifest.sessionsIncluded!==false||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Unbekanntes Backupformat.');
  const names=new Set();
  for(const file of manifest.files) {
    if(!file||typeof file.path!=='string'||(file.path!=='knips.sqlite'&&!photo.test(file.path))||typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||names.has(file.path))throw Error('Ungültiges Backupmanifest.');
    names.add(file.path);
    const path=join(source,file.path),entry=await lstat(path);
    if(entry.isSymbolicLink()||!entry.isFile()||await fileDigest(path)!==file.sha256)throw Error('Backupdatei fehlt, ist verknüpft oder wurde verändert.');
  }
  if(!names.has('knips.sqlite'))throw Error('Datenbank fehlt im Backup.');
  // SQLite can create WAL/SHM companions even in readOnly mode. Inspect only
  // the manifested, checkpointed database in a private temporary directory.
  const temporaryParent=await realpath(tmpdir());
  const temporary=await mkdtemp(join(temporaryParent,'knips-backup-check-'));
  let db;
  try {
    await copyFile(join(source,'knips.sqlite'),join(temporary,'knips.sqlite'));
    db=new DatabaseSync(join(temporary,'knips.sqlite'),{readOnly:true});
    if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backupdatenbank ist beschädigt.');
    if(db.prepare('SELECT COUNT(*) n FROM sessions').get().n!==0)throw Error('Backup enthält aktive Sitzungen.');
    const photos=db.prepare('SELECT filename FROM posts').all();
    if(photos.length+1!==names.size||photos.some(p=>!names.has(`photos/${p.filename}`)))throw Error('Fotoverzeichnis und Datenbank stimmen nicht überein.');
  } finally {
    try {db?.close();} finally {
      if(dirname(resolve(temporary))!==temporaryParent||!basename(temporary).startsWith('knips-backup-check-'))throw Error('Temporärer Prüfpfad außerhalb des erwarteten Ordners.');
      await rm(temporary,{recursive:true,force:true});
    }
  }
  return manifest;
}

export async function checkBackup(backupPath) {
  const source=await realpath(backupPath),release=await acquireDataLock(source);
  try {
    const manifest=await inspectBackup(source);
    return {passed:true,format:manifest.format,photos:manifest.files.length-1,files:manifest.files.length,sessionsIncluded:false};
  } finally {await release();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length!==3){console.error('Aufruf: node tools/backup-check.mjs BACKUPORDNER');process.exitCode=1;}
  else try {console.log(JSON.stringify(await checkBackup(process.argv[2])));}
  catch(error){console.error('Backupprüfung fehlgeschlagen: '+error.message);process.exitCode=1;}
}
