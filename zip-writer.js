const WebSpheresZip = (() => {
    const BATCH_ITEMS = 500;
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
    }

    function updateCrc(crc, bytes) {
        for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        return crc;
    }

    function yieldToPage() {
        return new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
                channel.port1.close();
                resolve();
            };
            channel.port2.postMessage(0);
        });
    }

    async function readAll(readable) {
        const reader = readable.getReader();
        const chunks = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return { chunks, size };
            chunks.push(value);
            size += value.length;
        }
    }

    async function compress(parts) {
        const stream = new CompressionStream('deflate-raw');
        const writer = stream.writable.getWriter();
        const output = readAll(stream.readable);
        const encoder = new TextEncoder();
        let crc = 0xffffffff;
        let size = 0;
        const binary = parts.length > 0 && typeof parts[0] !== 'string';
        for (let i = 0; i < parts.length; i += binary ? 1 : BATCH_ITEMS) {
            const bytes = binary ? parts[i] : encoder.encode(parts.slice(i, i + BATCH_ITEMS).join(''));
            crc = updateCrc(crc, bytes);
            size += bytes.length;
            await writer.write(bytes);
            await yieldToPage();
        }
        await writer.close();
        const { chunks, size: compressedSize } = await output;
        return { crc: (crc ^ 0xffffffff) >>> 0, size, chunks, compressedSize };
    }

    function dosDateTime(date) {
        return {
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
            date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
        };
    }

    function record(fields) {
        const size = fields.reduce((n, [bytes]) => n + bytes, 0);
        const view = new DataView(new ArrayBuffer(size));
        let at = 0;
        fields.forEach(([bytes, value]) => {
            if (bytes === 4) view.setUint32(at, value, true);
            else view.setUint16(at, value, true);
            at += bytes;
        });
        return new Uint8Array(view.buffer);
    }

    async function make(files) {
        const encoder = new TextEncoder();
        const stamp = dosDateTime(new Date());
        const body = [];
        const central = [];
        let offset = 0;
        let centralSize = 0;
        for (const file of files) {
            const name = encoder.encode(file.path);
            const out = await compress(file.parts);
            const shared = [[2, 0x0800], [2, 8], [2, stamp.time], [2, stamp.date], [4, out.crc], [4, out.compressedSize], [4, out.size], [2, name.length], [2, 0]];
            const local = record([[4, 0x04034b50], [2, 20], ...shared]);
            body.push(local, name, ...out.chunks);
            const entry = record([[4, 0x02014b50], [2, 20], [2, 20], ...shared, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]]);
            central.push(entry, name);
            centralSize += entry.length + name.length;
            offset += local.length + name.length + out.compressedSize;
        }
        const end = record([[4, 0x06054b50], [2, 0], [2, 0], [2, files.length], [2, files.length], [4, centralSize], [4, offset], [2, 0]]);
        return new Blob([...body, ...central, end], { type: 'application/zip' });
    }

    const crc32 = (bytes) => (updateCrc(0xffffffff, bytes) ^ 0xffffffff) >>> 0;

    return { make, crc32 };
})();

if (typeof module !== 'undefined') module.exports = WebSpheresZip;
