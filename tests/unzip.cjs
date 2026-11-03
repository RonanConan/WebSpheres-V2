const fs = require('fs'), path = require('path'), zlib = require('zlib');

function readZip(file) {
  const buf = fs.readFileSync(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('not a zip: ' + file);
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central entry');
    const method = buf.readUInt16LE(at + 10), crc = buf.readUInt32LE(at + 16), compressed = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const zipPath = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compressed);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (data.length !== size) throw new Error('size mismatch: ' + zipPath);
    if (zlib.crc32 && zlib.crc32(data) !== crc) throw new Error('crc mismatch: ' + zipPath);
    out.push({ path: zipPath, name: path.posix.basename(zipPath), text: data.toString('utf8') });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function openDownload(d, dir) {
  const name = d.suggestedFilename();
  const f = path.join(dir, Math.random().toString(36).slice(2) + '-' + name);
  await d.saveAs(f);
  if (name.endsWith('.zip')) return readZip(f).map(x => Object.assign(x, { zip: name, file: f }));
  return [{ path: name, name, text: fs.readFileSync(f, 'utf8'), file: f }];
}

module.exports = { readZip, openDownload };
