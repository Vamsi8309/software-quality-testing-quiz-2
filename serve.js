// Minimal static file server (stand-in for `python -m http.server`, which is
// unavailable here — python.exe is only the Microsoft Store alias stub).
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const port = Number(process.argv[3] || 8791);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(root, url === "/" ? "index.html" : url);
    if (!path.resolve(file).startsWith(path.resolve(root))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, "index.html");
      fs.readFile(file, (err2, buf) => {
        console.log(`${req.method} ${url} -> ${err2 ? 404 : 200}`);
        if (err2) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
        });
        res.end(buf);
      });
    });
  })
  .listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
