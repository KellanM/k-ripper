// Stand-in for yt-dlp in engine tests. Reads the -o output template to find
// the staging dir, emits realistic progress lines, writes a fake .m4a + .jpg.
// Invoked as: node fake-ytdlp.mjs <real yt-dlp args...>
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);

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
console.log("[download] 100.0% of 1.00MiB");
fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.m4a"), "not-really-audio");
fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.jpg"), "not-really-a-jpg");
process.exit(0);
