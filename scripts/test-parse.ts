import { readFileSync } from "node:fs";
import { parseBinaryPlist } from "../src/tab/bplist";
import { loadArchiveTop } from "../src/tab/nskeyed";

const path = process.argv[2];
const buf = readFileSync(path);
const { objects, topObjectIndex } = parseBinaryPlist(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
);
const { root } = loadArchiveTop(objects, topObjectIndex);

const r = root as any;
console.log("strings:", r.strings);
console.log("num groups:", r.chords.length);
for (let i = 0; i < r.chords.length; i++) {
  console.log(i, "len", r.chords[i].length, "lyric", JSON.stringify(r.lyrics[i]));
}
console.log(JSON.stringify(r.chords[0].slice(0, 3), null, 2));
