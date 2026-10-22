const fs = require('fs'), path = require('path');
const TOOLS = process.env.WS_TOOLS || 'C:\\Users\\ronan\\webspheres-tools';
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(TOOLS, 'node_modules', 'playwright'));
const AFRAME = path.join(TOOLS, 'node_modules', 'aframe', 'dist', 'aframe-v1.7.0.min.js');
const MOCK_PEER = path.join(__dirname, 'mock-peer.js');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.173.0/';
const THREE_DIR = path.join(TOOLS, 'node_modules', 'three');
const JS = 'application/javascript';
const typeOf = f => f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? JS : 'audio/mpeg';

function serve(page, opts) {
  const peer = (opts && opts.peer) || 'mock';
  const root = (opts && opts.root) || ROOT;
  return page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('aframe.min.js')) return route.fulfill({ body: fs.readFileSync(AFRAME), contentType: JS });
    if (u.includes('peerjs.min.js')) return peer === 'none' ? route.abort() : route.fulfill({ body: fs.readFileSync(MOCK_PEER), contentType: JS });
    if (u.startsWith(THREE_CDN)) {
      const f = path.join(THREE_DIR, decodeURIComponent(u.slice(THREE_CDN.length).split('?')[0]));
      if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f), contentType: JS });
      return route.fulfill({ status: 404, body: '' });
    }
    if (u.startsWith('https://test.local/')) {
      const f = path.join(root, decodeURIComponent(new URL(u).pathname));
      if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f), contentType: typeOf(f) });
      return route.fulfill({ status: 404, body: '' });
    }
    return route.abort();
  });
}

const launch = (extra) => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'].concat(extra || []) });

function counter(title) {
  const c = { pass: 0, fail: 0 };
  c.ok = (cond, msg) => { if (cond) { c.pass++; console.log('  ✓ ' + msg); } else { c.fail++; console.log('  ✗ FAIL: ' + msg); } };
  c.done = () => { console.log(`\n${title}: ${c.pass} passed, ${c.fail} failed`); process.exit(c.fail ? 1 : 0); };
  return c;
}

module.exports = { TOOLS, ROOT, serve, launch, counter };
