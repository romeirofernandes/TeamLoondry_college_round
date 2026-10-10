const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
http
  .createServer((req, res) => {
    const name = req.url === "/second" ? "second.html" : "page.html";
    res.setHeader("Content-Type", "text/html");
    res.end(fs.readFileSync(path.join(__dirname, "fixtures", name)));
  })
  .listen(4177, "127.0.0.1", () =>
    console.log("Handsfree fixture http://127.0.0.1:4177"),
  );
