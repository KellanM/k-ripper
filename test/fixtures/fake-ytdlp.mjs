// Stand-in for yt-dlp in engine tests. Reads the -o output template to find
// the staging dir, emits realistic progress lines, writes a fake .m4a + .jpg.
// Invoked as: node fake-ytdlp.mjs <real yt-dlp args...>
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);

// Node's default `--test` file discovery treats any .mjs under a directory
// named "test" as a test file and, absent explicit CLI globs, runs it with
// zero args — that's not a real invocation of this fixture (npm test scopes
// discovery to *.test.mjs and never hits this), so no-op cleanly instead of
// failing a bare `node --test` on an unrelated helper script.
if (args.length === 0) process.exit(0);

// Playlist enumeration runs have no -o, so this branch must come first.
if (args.includes("--flat-playlist")) {
  process.stdout.write("https://fake.test/t1\tFake One\nhttps://fake.test/t2\tFake Two\n");
  process.exit(0);
}

const oIdx = args.indexOf("-o");
if (oIdx === -1) { console.error("fake-ytdlp: no -o"); process.exit(2); }
const stageDir = path.dirname(args[oIdx + 1]);
const url = args[args.length - 1];
if (/fail/.test(url)) { console.error("ERROR: [fake] video: HTTP Error 404: Not Found"); process.exit(1); }

console.log("[download]  10.0% of 1.00MiB");

// Cancellation tests need a run that's still alive when the canceller fires.
// Print the first progress line, then stall well past any reasonable test
// timeout — the test kills the tree right after observing that line, so this
// timer is never expected to actually fire.
if (/slow/.test(url)) {
  setTimeout(() => {
    fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.m4a"), "not-really-audio");
    fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.jpg"), "not-really-a-jpg");
    process.exit(0);
  }, 10000);
} else {
  console.log("[download] 100.0% of 1.00MiB");
  fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.m4a"), "not-really-audio");
  fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.jpg"), "not-really-a-jpg");
  process.exit(0);
}
