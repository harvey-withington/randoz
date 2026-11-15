// Serves the numbered builds in dist/ on the local network, so a phone can
// download and install one from its browser. Nothing else is served.
//
//   node scripts/serve-apk.mjs [port]      default 8765
//
// Open http://<this PC's address>:8765/ on the phone. The page offers the
// latest build, and under it the earlier ones kept for rolling back.
// Stop it with Ctrl+C.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(import.meta.dirname, '..', 'dist');
const port = Number(process.argv[2]) || 8765;
const NUMBERED = /^randoz-(\d{4}-\d{2}-\d{2})-b(\d+)\.apk$/;

/** The numbered builds in dist/, newest first. */
const builds = () =>
  (fs.existsSync(dist) ? fs.readdirSync(dist) : [])
    .map((name) => ({ name, match: NUMBERED.exec(name) }))
    .filter((build) => build.match)
    .map(({ name, match }) => ({ name, date: match[1], number: Number(match[2]) }))
    .sort((a, b) => b.number - a.number);

const link = (build, big) => {
  const stat = fs.statSync(path.join(dist, build.name));
  const size = (stat.size / 1024 / 1024).toFixed(0);
  const time = stat.mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const label = `Build ${build.number}`;
  const detail = `${build.date}, ${time} · ${size} MB`;
  return big
    ? `<p><a href="/${build.name}" style="display:block;padding:18px;border-radius:12px;background:#4f46e5;color:#fff;text-decoration:none;font-size:22px">Download ${label}<br><small style="opacity:.85">${detail}</small></a></p>`
    : `<p><a href="/${build.name}">${label}</a> <small style="color:#666">${detail}</small></p>`;
};

http
  .createServer((req, res) => {
    const name = decodeURIComponent((req.url || '/').slice(1));
    console.log(new Date().toISOString(), req.socket.remoteAddress, req.method, req.url);
    const all = builds();

    // Only a numbered build that is in dist/ right now, by its exact name.
    if (all.some((build) => build.name === name)) {
      const file = path.join(dist, name);
      res.writeHead(200, {
        'content-type': 'application/vnd.android.package-archive',
        'content-length': fs.statSync(file).size,
        'content-disposition': `attachment; filename="${name}"`,
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    const [latest, ...earlier] = all;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      '<meta name="viewport" content="width=device-width">' +
        '<body style="font:18px sans-serif;padding:16px;max-width:520px"><h3>RANDOZ</h3>' +
        (latest ? link(latest, true) : '<p>No builds in dist/ yet.</p>') +
        (earlier.length > 0
          ? '<h4 style="margin-top:32px">Earlier builds, to roll back</h4>' +
            earlier.map((build) => link(build, false)).join('') +
            '<p><small style="color:#666">Android won\'t install an older build over a newer one: uninstall RANDOZ first, which also removes its groups from the phone.</small></p>'
          : ''),
    );
  })
  .listen(port, '0.0.0.0', () => console.log(`serving the numbered builds in dist/ on port ${port}`));
