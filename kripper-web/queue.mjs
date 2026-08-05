// K-Ripper Web — serial job queue. One rip at a time (kind to CDNs, matches
// the device), each job fully independent: a failure or cancel never touches
// its neighbours. All observable activity flows out as "job" events so the
// SSE layer is a dumb pipe.

import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export class RipQueue extends EventEmitter {
  constructor(runJob) {
    super();
    this.runJob = runJob;
    this._jobs = [];        // insertion order — doubles as history
    this._running = null;   // job currently executing
    this._cancellers = new Map(); // jobId -> fn registered by runJob
  }

  jobs() { return this._jobs; }
  get(id) { return this._jobs.find((j) => j.id === id); }

  add({ url, title }) {
    const job = {
      id: randomUUID(), url, title: title || null,
      state: "queued", progress: 0,
      artFile: null, audioPath: null, bpm: null, key: null, error: null,
    };
    this._jobs.push(job);
    this._forward(job, "queued", []);
    queueMicrotask(() => this._pump());
    return job;
  }

  cancel(id) {
    const job = this.get(id);
    if (!job) return false;
    if (job.state === "queued") {
      job.state = "cancelled";
      this._forward(job, "cancelled", []);
      return true;
    }
    if (job.state === "running") {
      const kill = this._cancellers.get(id);
      if (kill) { try { kill(); } catch {} }
      // State flips to cancelled when the runJob emits `cancelled` (or, if it
      // throws after the kill, in the error path below).
      job._cancelRequested = true;
      return true;
    }
    return false; // already finished
  }

  _forward(job, name, args) {
    // Mirror well-known events into job fields so GET /api/jobs is complete.
    if (name === "progress") job.progress = Number(args[0]) || 0;
    else if (name === "track") job.title = String(args[0]);
    else if (name === "art") job.artFile = String(args[0]);
    else if (name === "bpm") job.bpm = args[0] === "none" ? null : Number(args[0]);
    else if (name === "key") job.key = args[0] === "none" ? null : args.join(" ");
    else if (name === "done") { job.audioPath = String(args[0]); job.state = "done"; }
    else if (name === "error") { job.error = String(args[0]); job.state = "error"; }
    else if (name === "cancelled") job.state = "cancelled";
    this.emit("job", job.id, name, args);
  }

  _pump() {
    if (this._running) return;
    const next = this._jobs.find((j) => j.state === "queued");
    if (!next) return;
    this._running = next;
    next.state = "running";
    this._forward(next, "status", ["starting..."]);
    const api = {
      emit: (name, ...args) => this._forward(next, name, args),
      setCanceller: (fn) => this._cancellers.set(next.id, fn),
    };
    Promise.resolve()
      .then(() => this.runJob(next, api))
      .catch((e) => {
        if (next.state === "running") {
          this._forward(next, next._cancelRequested ? "cancelled" : "error",
            next._cancelRequested ? [] : [e && e.message ? e.message : String(e)]);
        }
      })
      .finally(() => {
        if (next.state === "running") this._forward(next, "error", ["job ended without result"]);
        this._cancellers.delete(next.id);
        this._running = null;
        queueMicrotask(() => this._pump());
      });
  }
}
