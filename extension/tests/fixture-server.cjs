const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
http
  .createServer((req, res) => {
    if (req.url === "/tone.wav") {
      const rate = 8000, seconds = 15, size = rate * seconds * 2;
      const wav = Buffer.alloc(44 + size);
      wav.write("RIFF", 0); wav.writeUInt32LE(36 + size, 4); wav.write("WAVEfmt ", 8);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write("data", 36); wav.writeUInt32LE(size, 40);
      res.setHeader("Content-Type", "audio/wav"); res.setHeader("Accept-Ranges", "bytes");
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(wav.length - 1, Number(range[2])) : wav.length - 1;
      if (range) { res.statusCode = 206; res.setHeader("Content-Range", `bytes ${start}-${end}/${wav.length}`); }
      res.setHeader("Content-Length", end - start + 1); res.end(wav.subarray(start, end + 1)); return;
    }
    const pathname = new URL(req.url, "http://127.0.0.1:4177").pathname;
    const name = pathname === "/results" ? "results.html" : ["/second", "/guide"].includes(pathname) ? "second.html" : pathname === "/media" ? "media.html" : "page.html";
    res.setHeader("Content-Type", "text/html");
    res.end(fs.readFileSync(path.join(__dirname, "fixtures", name)));
  })
  .listen(4177, "127.0.0.1", () =>
    console.log("Handsfree fixture http://127.0.0.1:4177"),
  );
