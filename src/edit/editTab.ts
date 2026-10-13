import type { TabLine, TabSong } from "../tab/model";

const MIN_STRINGS = 4;
const MAX_STRINGS = 8;

export interface EditSongOptions {
  /** Called after any mutation to `song` (cell edit, add/remove, title/annotation change). */
  onChange: () => void;
}

interface PendingFocus {
  lineIndex: number;
  colIndex: number;
  stringIndex: number;
}

/**
 * Renders an interactive editor for `song`. Mutates `song` in place as the
 * user types/taps, so the caller's own reference stays current for
 * autosaving — this module never owns a copy of the data.
 *
 * Text input (cell/annotation/title edits) mutates the model and leaves the
 * DOM alone, since the input element already reflects what was typed.
 * Structural changes (add/remove column or line) rebuild the affected
 * subtree, since there's no focused keystroke to preserve.
 */
export function renderSongEditor(song: TabSong, opts: EditSongOptions): HTMLElement {
  const container = document.createElement("div");
  container.className = "editor";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.className = "editor-title-input";
  titleInput.placeholder = "Song title";
  titleInput.value = song.title;
  titleInput.addEventListener("input", () => {
    song.title = titleInput.value;
    opts.onChange();
  });
  container.appendChild(titleInput);

  const stringsRow = document.createElement("div");
  stringsRow.className = "editor-strings";
  const stringsLabel = document.createElement("span");
  stringsLabel.textContent = `Strings: ${song.stringCount}`;
  const stringsDec = document.createElement("button");
  stringsDec.type = "button";
  stringsDec.textContent = "−";
  const stringsInc = document.createElement("button");
  stringsInc.type = "button";
  stringsInc.textContent = "+";
  stringsRow.append(stringsLabel, stringsDec, stringsInc);
  container.appendChild(stringsRow);

  function resizeStrings(delta: number) {
    const next = song.stringCount + delta;
    if (next < MIN_STRINGS || next > MAX_STRINGS) return;
    song.stringCount = next;
    for (const line of song.lines) {
      for (const chord of line.chords) {
        if (delta > 0) chord.frets.push("");
        else chord.frets.length = song.stringCount;
      }
    }
    stringsLabel.textContent = `Strings: ${song.stringCount}`;
    opts.onChange();
    renderLines();
  }
  stringsDec.addEventListener("click", () => resizeStrings(-1));
  stringsInc.addEventListener("click", () => resizeStrings(1));

  const linesEl = document.createElement("div");
  linesEl.className = "editor-lines";
  container.appendChild(linesEl);

  let pendingFocus: PendingFocus | null = null;

  function focusCell(lineIndex: number, colIndex: number, stringIndex: number) {
    const selector = `.editor-line[data-line="${lineIndex}"] .editor-col[data-col="${colIndex}"] .editor-cell[data-string="${stringIndex}"]`;
    container.querySelector<HTMLInputElement>(selector)?.focus();
  }

  function renderLines() {
    linesEl.innerHTML = "";
    song.lines.forEach((line, lineIndex) => {
      linesEl.appendChild(renderLineEditor(line, lineIndex));
    });
    if (pendingFocus) {
      const { lineIndex, colIndex, stringIndex } = pendingFocus;
      pendingFocus = null;
      focusCell(lineIndex, colIndex, stringIndex);
    }
  }

  function renderLineEditor(line: TabLine, lineIndex: number): HTMLElement {
    const lineEl = document.createElement("div");
    lineEl.className = "editor-line";
    lineEl.dataset.line = String(lineIndex);

    const header = document.createElement("div");
    header.className = "editor-line__header";

    const annotationInput = document.createElement("input");
    annotationInput.type = "text";
    annotationInput.className = "editor-annotation-input";
    annotationInput.placeholder = "Label or lyric (optional)";
    annotationInput.value = line.annotation ?? "";
    annotationInput.addEventListener("input", () => {
      line.annotation = annotationInput.value || undefined;
      opts.onChange();
    });
    header.appendChild(annotationInput);

    const deleteLineBtn = document.createElement("button");
    deleteLineBtn.type = "button";
    deleteLineBtn.className = "editor-line__delete";
    deleteLineBtn.textContent = "Delete line";
    deleteLineBtn.addEventListener("click", () => {
      song.lines.splice(lineIndex, 1);
      opts.onChange();
      renderLines();
    });
    header.appendChild(deleteLineBtn);

    lineEl.appendChild(header);

    const gridEl = document.createElement("div");
    gridEl.className = "editor-grid";

    line.chords.forEach((chord, colIndex) => {
      const col = document.createElement("div");
      col.className = "editor-col";
      col.dataset.col = String(colIndex);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "editor-col__del";
      delBtn.textContent = "×";
      delBtn.title = "Remove note";
      delBtn.addEventListener("click", () => {
        line.chords.splice(colIndex, 1);
        opts.onChange();
        renderLines();
      });
      col.appendChild(delBtn);

      for (let s = 0; s < song.stringCount; s++) {
        const cell = document.createElement("input");
        cell.type = "text";
        cell.inputMode = "text";
        cell.autocapitalize = "off";
        cell.spellcheck = false;
        cell.maxLength = 2;
        cell.className = "editor-cell";
        cell.dataset.string = String(s);
        cell.value = chord.frets[s] ?? "";
        cell.addEventListener("input", () => {
          chord.frets[s] = cell.value;
          opts.onChange();
        });
        col.appendChild(cell);
      }

      gridEl.appendChild(col);
    });

    const addColBtn = document.createElement("button");
    addColBtn.type = "button";
    addColBtn.className = "editor-col__add";
    addColBtn.textContent = "+";
    addColBtn.title = "Add note";
    addColBtn.addEventListener("click", () => {
      line.chords.push({ frets: new Array(song.stringCount).fill("") });
      pendingFocus = { lineIndex, colIndex: line.chords.length - 1, stringIndex: 0 };
      opts.onChange();
      renderLines();
    });
    gridEl.appendChild(addColBtn);

    lineEl.appendChild(gridEl);
    return lineEl;
  }

  renderLines();

  const addLineBtn = document.createElement("button");
  addLineBtn.type = "button";
  addLineBtn.className = "editor-add-line";
  addLineBtn.textContent = "+ Add line";
  addLineBtn.addEventListener("click", () => {
    song.lines.push({ chords: [] });
    opts.onChange();
    renderLines();
    const newAnnotation = linesEl.querySelector<HTMLInputElement>(
      `.editor-line[data-line="${song.lines.length - 1}"] .editor-annotation-input`
    );
    newAnnotation?.focus();
  });
  container.appendChild(addLineBtn);

  return container;
}
