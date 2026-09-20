/**
 * A reverse proxy that delivers HTML documents slowly, and everything else at
 * full speed.
 *
 * v180 reproduced React #418 by throttling the DOCUMENT alone to 500kbps:
 * 3-4 in 20, on a quiet machine, which takes CPU out of the picture and leaves
 * delivery. Playwright cannot do that — `route.fulfill` hands over the whole
 * body at once, so a delay before it only postpones an instant transfer and
 * never opens the window the error lives in.
 *
 * This does: it pipes the upstream response and writes the body in small
 * chunks with a pause between them, so hydration starts while the HTML is
 * still arriving. Anything that is not a document is proxied untouched.
 */
import http from "http";

const UPSTREAM = { host: "127.0.0.1", port: 3000 };
const PORT = Number(process.env.PROXY_PORT || 3100);
const KBPS = Number(process.env.KBPS || 500);
const CHUNK = 4096;
const PAUSE = Math.max(1, Math.round((CHUNK / ((KBPS * 1024) / 8)) * 1000));

const server = http.createServer((req, res) => {
  const proxied = http.request(
    { ...UPSTREAM, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${PORT}` } },
    (up) => {
      const type = String(up.headers["content-type"] || "");
      /*
       * ALL=1 slows the scripts too. That is the control: if the error stops
       * firing when the document and its scripts arrive at the same rate, then
       * the cause is the ASYMMETRY — cached scripts outrunning a slow
       * document — rather than slowness itself.
       */
      /*
       * SCRIPTS_ONLY=1 is the inverse control: HTML at full speed, JavaScript
       * slow. If the error stops firing, then what matters is whether the
       * scripts are ready BEFORE the document has finished arriving — i.e.
       * React beginning to hydrate a tree the browser has not finished
       * parsing.
       */
      const slow = process.env.SCRIPTS_ONLY
        ? type.includes("javascript")
        : process.env.ALL
          ? true
          : type.includes("text/html");
      res.writeHead(up.statusCode || 200, up.headers);
      if (!slow) return up.pipe(res);

      const parts = [];
      up.on("data", (d) => parts.push(d));
      up.on("end", async () => {
        const body = Buffer.concat(parts);
        for (let i = 0; i < body.length; i += CHUNK) {
          res.write(body.subarray(i, i + CHUNK));
          await new Promise((r) => setTimeout(r, PAUSE));
        }
        res.end();
      });
    },
  );
  proxied.on("error", () => {
    res.writeHead(502);
    res.end("upstream error");
  });
  req.pipe(proxied);
});

server.listen(PORT, () => console.log(`slow proxy on ${PORT} -> ${UPSTREAM.port}, html at ${KBPS}kbps`));
