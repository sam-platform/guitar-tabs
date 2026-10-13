import { parseBinaryPlist } from "./bplist";
import { loadArchiveTop } from "./nskeyed";
import type { TabChord, TabLine, TabSong } from "./model";

/** Raw shape of the resolved NSKeyedArchiver root object produced by the
 * legacy iOS tab builder app ("TabArchive"). */
interface RawChord {
  __class__?: string;
  [stringKey: string]: unknown;
}

interface RawTabArchive {
  __class__?: string;
  strings?: number;
  chords?: RawChord[][];
  lyrics?: (string[] | null)[];
}

function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.tab$/i, "");
  return withoutExt.trim() || "Untitled";
}

function chordFromRaw(raw: RawChord, stringCount: number): TabChord {
  const frets: string[] = [];
  for (let i = 1; i <= stringCount; i++) {
    const value = raw[`string${i}`];
    frets.push(typeof value === "string" ? value : "");
  }
  return { frets };
}

export class TabImportError extends Error {}

/**
 * Parses a legacy ".tab" file (an NSKeyedArchiver binary plist) into this
 * app's TabSong model.
 */
export function importTabFile(buffer: ArrayBuffer, fileName: string): TabSong {
  let root: unknown;
  try {
    const { objects, topObjectIndex } = parseBinaryPlist(buffer);
    root = loadArchiveTop(objects, topObjectIndex).root;
  } catch (err) {
    throw new TabImportError(
      `Could not read "${fileName}" as a .tab file: ${(err as Error).message}`
    );
  }

  const raw = root as RawTabArchive;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.chords)) {
    throw new TabImportError(
      `"${fileName}" doesn't look like a tab archive (missing chords data).`
    );
  }

  const stringCount = typeof raw.strings === "number" && raw.strings > 0 ? raw.strings : 6;
  const lyricGroups = raw.lyrics ?? [];

  const lines: TabLine[] = raw.chords.map((group, i) => {
    const chords = group.map((c) => chordFromRaw(c, stringCount));
    const lyricGroup = lyricGroups[i];
    const annotation = Array.isArray(lyricGroup) && lyricGroup.length > 0
      ? lyricGroup.join(" ").trim()
      : undefined;
    return annotation ? { chords, annotation } : { chords };
  });

  return {
    title: titleFromFileName(fileName),
    stringCount,
    lines,
    updatedAt: new Date().toISOString(),
  };
}
