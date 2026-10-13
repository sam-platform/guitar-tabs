import type { TabLine, TabSong } from "../tab/model";

const FILLER = "-";

/** Renders one line's chord columns into one text row per string, in
 * classic ASCII-tab style: e|--2--4--0--|, each column padded to the
 * width of its widest cell (frets 10+ need two characters) so every
 * string stays aligned. */
function renderLine(line: TabLine, stringCount: number): string[] {
  const rows: string[] = new Array(stringCount).fill("");

  for (const chord of line.chords) {
    let width = 1;
    for (let s = 0; s < stringCount; s++) {
      const cell = chord.frets[s] ?? "";
      width = Math.max(width, cell.length);
    }
    width += 1; // trailing filler so adjacent columns don't visually merge

    for (let s = 0; s < stringCount; s++) {
      const cell = chord.frets[s] ?? "";
      rows[s] += cell.padEnd(width, FILLER);
    }
  }

  return rows.map((r) => `|${r}|`);
}

export function renderSongAsText(song: TabSong): string {
  const out: string[] = [];
  out.push(song.title);
  out.push("");

  for (const line of song.lines) {
    if (line.annotation) {
      out.push(line.annotation);
    }
    if (line.chords.length === 0) {
      out.push("");
      continue;
    }
    const rows = renderLine(line, song.stringCount);
    out.push(...rows);
    out.push("");
  }

  return out.join("\n");
}

/** Renders a song into a <pre>-friendly DOM fragment, with annotations
 * styled distinctly from the tab grid itself. */
export function renderSongToElement(song: TabSong): HTMLElement {
  const container = document.createElement("div");
  container.className = "tab-song";

  for (const line of song.lines) {
    const lineEl = document.createElement("div");
    lineEl.className = "tab-line";

    if (line.annotation) {
      const label = document.createElement("div");
      label.className = "tab-annotation";
      label.textContent = line.annotation;
      lineEl.appendChild(label);
    }

    if (line.chords.length > 0) {
      const pre = document.createElement("pre");
      pre.className = "tab-grid";
      pre.textContent = renderLine(line, song.stringCount).join("\n");
      lineEl.appendChild(pre);
    }

    container.appendChild(lineEl);
  }

  return container;
}
