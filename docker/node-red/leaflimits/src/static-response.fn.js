// The file-in node put the file in msg.payload as a Buffer. Set the type and caching headers.
const name = String(msg.filename || '');
const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
const TYPES = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    ico: 'image/x-icon',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
    json: 'application/json; charset=utf-8',
    webmanifest: 'application/manifest+json',
    txt: 'text/plain; charset=utf-8'
};
const type = Object.prototype.hasOwnProperty.call(TYPES, ext) ? TYPES[ext] : null;
if (!type) return LL.reply(msg, 404, { message: 'Not found.' });

const hashed = /-[A-Z0-9]{8}\.(js|css)$/.test(name);   // Angular puts a content hash in these names
msg.statusCode = 200;
msg.headers = {
    'Content-Type': type,
    'Cache-Control': ext === 'html' ? 'no-cache' : (hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
};
return msg;
