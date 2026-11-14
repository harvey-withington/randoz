// Serves the APKs in dist/ on the local network, so a phone can download and
// install them from its browser. Nothing else is served.
//
//   node scripts/serve-apk.mjs [port]      default 8765
//
// Open http://<this PC's address>:8765/ on the phone. Stop it with Ctrl+C.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(import.meta.dirname, '..', 'dist');
const port = Number(process.argv[2]) || 8765;

const apks = () =>
  fs.existsSync(dist)
    ? fs.readdirSync(dist).filter((name) => name.endsWith('.apk')).sort()
    : [];

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').slice(1));
    console.log(new Date().toISOString(), req.socket.remoteAddress, req.method, req.url);

    // Only a file that is in dist/ right now, by its exact name.
    if (apks().includes(name)) {
      const file = path.join(dist, name);
      res.writeHead(200, {
        'content-type': 'application/vnd.android.package-archive',
        'content-length': fs.statSync(file).size,
        'content-disposition': `attachment; filename="${name}"`,
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    const rows = apks().map((apk) => {
      const stat = fs.statSync(path.join(dist, apk));
      const size = (stat.size / 1024 / 1024).toFixed(0);
      const when = stat.mtime.toLocaleString();
      return `<p><a href="/${encodeURIComponent(apk)}">${apk}</a><br><small>${size} MB, built ${when}</small></p>`;
    });
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<meta name="viewport" content="width=device-width">' +
        '<body style="font:18px sans-serif;padding:16px"><h3>RANDOZ builds</h3>' +
        (rows.join('') || '<p>No builds in dist/ yet.</p>'),
    );
  })
  .listen(port, '0.0.0.0', () => console.log(`serving dist/*.apk on port ${port}`));
