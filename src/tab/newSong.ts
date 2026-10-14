import type { TabSong } from "./model";

export function createEmptySong(stringCount = 6): TabSong {
  return {
    title: "Untitled",
    stringCount,
    lines: [{ chords: [] }],
    updatedAt: new Date().toISOString(),
  };
}
