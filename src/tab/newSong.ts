import type { TabSong } from "./model";

export function createEmptySong(stringCount = 6): TabSong {
  return {
    title: "Untitled",
    stringCount,
    lines: [{ chords: [{ frets: new Array(stringCount).fill("") }] }],
    updatedAt: new Date().toISOString(),
  };
}
