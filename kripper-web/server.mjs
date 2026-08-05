// K-Ripper Web — zero-dependency HTTP server. Localhost only.
// createApp() takes injected deps so routes are testable without spawning
// yt-dlp; the run-as-main block at the bottom wires the real engine.

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { extractUrl } from "./lib.mjs";
import { isPlaylistUrl, safeArtBasename } from "./weblib.mjs";
import { RipQueue } from "./queue.mjs";
import { rip, enumeratePlaylist, resolveBinPaths } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}
// Serialize a job for API responses, dropping internal `_`-prefixed fields
// (e.g. RipQueue's `_cancelRequested`) that are implementation detail, not API.
function serializeJob(job) {
  const out = {};
  for (const [k, v] of Object.entries(job)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

export function createApp({ queue, enumerate, isPlaylist, outputDir, publicDir }) {
  const sseClients = new Set();
  queue.on("job", (jobId, event, args) => {
    const line = `data: ${JSON.stringify({ job: jobId, event, args })}\n\n`;
    for (const res of sseClients) res.write(line);
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const route = `${req.method} ${url.pathname}`;

      if (route === "POST /api/rip") {
        const { url: raw } = await readBody(req);
        const target = extractUrl(raw);
        if (!target) return json(res, 400, { error: "no URL found" });
        let jobs;
        if (isPlaylist(target)) {
          let entries;
          try { entries = await enumerate(target); }
          catch (e) { return json(res, 502, { error: "couldn't read playlist" }); }
          if (!entries.length) return json(res, 400, { error: "playlist is empty" });
          jobs = entries.map((e) => queue.add({ url: e.url, title: e.title }));
        } else {
          jobs = [queue.add({ url: target, title: null })];
        }
        return json(res, 200, { jobs: jobs.map((j) => ({ id: j.id, url: j.url, title: j.title })) });
      }

      if (route === "GET /api/jobs") return json(res, 200, { jobs: queue.jobs().map(serializeJob) });

      if (req.method === "POST" && /^\/api\/jobs\/[^/]+\/cancel$/.test(url.pathname)) {
        const id = url.pathname.split("/")[3];
        return queue.cancel(id) ? json(res, 200, { ok: true }) : json(res, 404, { error: "unknown job" });
      }

      if (route === "POST /api/reveal") {
        const { id } = await readBody(req);
        const job = queue.get(String(id));
        if (!job) return json(res, 404, { error: "unknown job" });
        if (job.state !== "done" || !job.audioPath) return json(res, 409, { error: "job not finished" });
        if (process.platform === "win32") spawn("explorer", ["/select,", job.audioPath], { windowsHide: true });
        else if (process.platform === "darwin") spawn("open", ["-R", job.audioPath]);
        else spawn("xdg-open", [path.dirname(job.audioPath)]);
        return json(res, 200, { ok: true });
      }

      if (route === "GET /api/art") {
        const name = safeArtBasename(url.searchParams.get("file"));
        if (!name) return json(res, 400, { error: "bad art name" });
        const p = path.join(outputDir, name);
        if (!fs.existsSync(p)) return json(res, 404, { error: "no art" });
        res.writeHead(200, { "content-type": "image/jpeg" });
        return fs.createReadStream(p).pipe(res);
      }

      if (route === "GET /api/events") {
        res.writeHead(200, { "content-type": "text/event-stream",
          "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      if (req.method === "GET") { // static files
        let rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const p = path.normalize(path.join(publicDir, rel));
        if (!p.startsWith(path.normalize(publicDir + path.sep)) && p !== path.normalize(path.join(publicDir, "index.html")))
          return json(res, 404, { error: "not found" });
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return json(res, 404, { error: "not found" });
        res.writeHead(200, { "content-type": MIME[path.extname(p).toLowerCase()] || "application/octet-stream" });
        return fs.createReadStream(p).pipe(res);
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      try { json(res, 500, { error: String(e && e.message || e) }); } catch {}
    }
  });
}

// ---- run as main ------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const outputDir = process.env.KRIPPER_OUTPUT || path.join(os.homedir(), "Music", "K-Ripper");
  const stagingRoot = path.join(outputDir, ".staging");
  const { ytdlpPath, ffmpegPath } = resolveBinPaths(path.join(__dirname, "bin"));
  if (!fs.existsSync(ytdlpPath) || !fs.existsSync(ffmpegPath)) {
    console.error("engine missing — bin/ binaries not found (antivirus quarantine?)");
    process.exit(1);
  }
  const queue = new RipQueue((job, api) => rip(job.url, {
    emit: api.emit, setCanceller: api.setCanceller,
    outputDir, stagingRoot, jobId: job.id, ytdlpPath, ffmpegPath,
  }));
  const app = createApp({
    queue, outputDir, publicDir: path.join(__dirname, "public"),
    enumerate: (u) => enumeratePlaylist(u, { ytdlpPath }),
    isPlaylist: isPlaylistUrl,
  });

  // Fire-and-forget yt-dlp self-update, same rationale as the device.
  try { spawn(ytdlpPath, ["-U"], { windowsHide: true }).on("error", () => {}); } catch {}

  let port = 8420;
  const tryListen = (attempt) => {
    app.once("error", (e) => {
      if (e.code === "EADDRINUSE" && attempt < 20) { port++; tryListen(attempt + 1); }
      else { console.error(`cannot listen: ${e.message}`); process.exit(1); }
    });
    app.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`K-Ripper Web → ${url}   (rips land in ${outputDir})`);
      if (process.argv.includes("--open")) {
        const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
          : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
        try { spawn(opener[0], opener[1], { windowsHide: true }).on("error", () => {}); } catch {}
      }
    });
  };
  tryListen(0);
}
