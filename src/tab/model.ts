/** A single vertical slice of a tab line: one fret/symbol per string. */
export interface TabChord {
  /** Index 0 = string 1 (conventionally the highest-pitched string). */
  frets: string[];
}

/** One row of the tab as it was laid out in the source app (a line's worth
 * of chord columns), with an optional annotation (section label or lyric
 * line) attached to it. */
export interface TabLine {
  chords: TabChord[];
  annotation?: string;
}

export interface TabSong {
  title: string;
  stringCount: number;
  lines: TabLine[];
  importedAt: string;
}
