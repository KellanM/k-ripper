// K-Ripper Web UI. All live state arrives over SSE; /api/jobs is the resync
// source on load/reconnect. Finished jobs are mirrored to localStorage so
// history survives refresh and server restarts (art by basename).
const $ = (sel, el = document) => el.querySelector(sel);
const jobsEl = $("#jobs");
const rows = new Map();       // jobId -> row element
const HISTORY_KEY = "kripper-web-history-v1";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveToHistory(job) {
  const h = loadHistory().filter((j) => j.id !== job.id);
  h.unshift({ id: job.id, title: job.title, artFile: job.artFile, bpm: job.bpm,
              key: job.key, audioPath: job.audioPath, state: "done" });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 200)));
}

function row(job) {
  let el = rows.get(job.id);
  if (el) return el;
  el = $("#row-template").content.firstElementChild.cloneNode(true);
  el.dataset.id = job.id;
  $(".cancel", el).onclick = () => fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
  $(".reveal", el).onclick = () => fetch("/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: job.id }),
  });
  rows.set(job.id, el);
  jobsEl.prepend(el);
  return el;
}

function render(job, live = true) {
  const el = row(job);
  el.className = `job ${job.state}`;
  $(".title", el).textContent = job.title || job.url || "…";
  $(".status", el).textContent = job.statusText ||
    ({ queued: "queued", running: "ripping…", done: "done — original file saved",
       error: job.error || "error", cancelled: "cancelled" }[job.state] || "");
  $("progress", el).value = job.progress || 0;
  if (job.artFile) $(".art", el).src = `/api/art?file=${encodeURIComponent(job.artFile)}`;
  const bpmB = $(".badge.bpm", el), keyB = $(".badge.key", el);
  if (job.bpm) { bpmB.hidden = false; bpmB.textContent = `${job.bpm} BPM`; }
  if (job.key) { keyB.hidden = false; keyB.textContent = job.key; }
  $(".reveal", el).hidden = !(job.state === "done" && live);
  $(".cancel", el).hidden = !(job.state === "queued" || job.state === "running");
}

const known = new Map();      // jobId -> job object (client-side mirror)

function applyEvent(id, event, args) {
  const job = known.get(id) || { id, state: "queued", progress: 0 };
  known.set(id, job);
  if (event === "status") job.statusText = args[0];
  else if (event === "progress") { job.progress = args[0]; job.state = "running"; job.statusText = null; }
  else if (event === "track") job.title = args[0];
  else if (event === "art") job.artFile = args[0];
  else if (event === "bpm") job.bpm = args[0] === "none" ? null : args[0];
  else if (event === "key") job.key = args[0] === "none" ? null : args.join(" ");
  else if (event === "done") { job.state = "done"; job.audioPath = args[0]; job.statusText = null; saveToHistory(job); }
  else if (event === "error") { job.state = "error"; job.error = args[0]; }
  else if (event === "cancelled") job.state = "cancelled";
  else if (event === "queued") job.state = "queued";
  render(job);
}

async function resync() {
  const { jobs } = await (await fetch("/api/jobs")).json();
  const liveIds = new Set(jobs.map((j) => j.id));
  for (const j of jobs) { known.set(j.id, { ...known.get(j.id), ...j }); render(known.get(j.id)); }
  for (const h of loadHistory()) if (!liveIds.has(h.id) && !known.has(h.id)) {
    known.set(h.id, h); render(h, /*live=*/false); // reveal needs a live job — hide it
  }
}

function connect() {
  const es = new EventSource("/api/events");
  es.onopen = () => { $("#offline").hidden = true; resync(); };
  es.onmessage = (m) => { const { job, event, args } = JSON.parse(m.data); applyEvent(job, event, args); };
  es.onerror = () => { $("#offline").hidden = false; };
}

$("#rip-form").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("#url"), btn = $("#rip-btn"), notice = $("#notice");
  const url = input.value.trim();
  if (!url) return;
  btn.disabled = true; notice.hidden = true;
  try {
    const res = await fetch("/api/rip", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = await res.json();
    if (!res.ok) { notice.textContent = body.error || "failed"; notice.hidden = false; }
    else {
      if (body.jobs.length > 1) { notice.textContent = `queuing ${body.jobs.length} tracks…`; notice.hidden = false; }
      input.value = "";
    }
  } catch { notice.textContent = "server unreachable"; notice.hidden = false; }
  btn.disabled = false;
};

connect();
