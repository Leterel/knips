import { request } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function containerHealth(publicOrigin, port = 8790) {
  const host = new URL(publicOrigin).host;
  return new Promise((resolveCheck, reject) => {
    // node:http explicitly preserves Host, unlike the Fetch API's forbidden
    // request header handling in some supported Node releases.
    const req = request({ hostname: '127.0.0.1', port, path: '/health', headers: { Host: host }, timeout: 4000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 1024) req.destroy(Error('Oversized health response')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        try { const data = JSON.parse(Buffer.concat(chunks)); if (res.statusCode !== 200 || data.ok !== true || data.service !== 'knips') throw Error('Unhealthy Knips'); resolveCheck(); }
        catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(Error('Health timeout')));
    req.on('error', reject); req.end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await containerHealth(process.env.PUBLIC_ORIGIN); }
  catch { process.exitCode = 1; }
}
