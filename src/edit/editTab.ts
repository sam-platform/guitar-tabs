import type { TabLine, TabSong } from "../tab/model";

const MIN_STRINGS = 4;
const MAX_STRINGS = 8;

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
/** Non-numeric symbols a fret cell can hold, per the TabChord format. */
const KEYPAD_SYMBOLS = ["h", "p", "b", "/", "\\", "x", "|"];

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
  let activeCell: HTMLInputElement | null = null;

  function insertAtCursor(el: HTMLInputElement, text: string) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (el.maxLength >= 0 && next.length > el.maxLength) return;
    el.value = next;
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replaceActiveCell(text: string) {
    if (!activeCell) return;
    activeCell.value = text;
    activeCell.setSelectionRange(text.length, text.length);
    activeCell.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspaceActiveCell() {
    if (!activeCell) return;
    const el = activeCell;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    let next: string;
    let pos: number;
    if (start !== end) {
      next = el.value.slice(0, start) + el.value.slice(end);
      pos = start;
    } else if (start > 0) {
      next = el.value.slice(0, start - 1) + el.value.slice(start);
      pos = start - 1;
    } else {
      return;
    }
    el.value = next;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const keypadEl = document.createElement("div");
  keypadEl.className = "note-keypad note-keypad--inactive";

  function keypadButton(label: string, onPress: () => void, extraClass = ""): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `note-keypad__btn ${extraClass}`.trim();
    btn.textContent = label;
    // Prevent the button from stealing focus away from the active cell.
    btn.addEventListener("pointerdown", (e) => e.preventDefault());
    btn.addEventListener("click", onPress);
    return btn;
  }

  const digitsRow = document.createElement("div");
  digitsRow.className = "note-keypad__row";
  for (const digit of KEYPAD_DIGITS) {
    digitsRow.appendChild(keypadButton(digit, () => activeCell && insertAtCursor(activeCell, digit)));
  }
  keypadEl.appendChild(digitsRow);

  const symbolsRow = document.createElement("div");
  symbolsRow.className = "note-keypad__row";
  for (const symbol of KEYPAD_SYMBOLS) {
    symbolsRow.appendChild(
      keypadButton(symbol, () => replaceActiveCell(symbol), "note-keypad__btn--symbol")
    );
  }
  symbolsRow.appendChild(keypadButton("⌫", () => backspaceActiveCell(), "note-keypad__btn--del"));
  keypadEl.appendChild(symbolsRow);

  linesEl.addEventListener("focusin", (e) => {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.classList.contains("editor-cell")) {
      activeCell = target;
      target.select();
      keypadEl.classList.remove("note-keypad--inactive");
    }
  });
  linesEl.addEventListener("focusout", (e) => {
    const related = e.relatedTarget;
    if (
      related instanceof HTMLInputElement &&
      related.classList.contains("editor-cell")
    ) {
      return;
    }
    activeCell = null;
    keypadEl.classList.add("note-keypad--inactive");
  });

  function focusCell(lineIndex: number, colIndex: number, stringIndex: number) {
    const selector = `.editor-line[data-line="${lineIndex}"] .editor-col[data-col="${colIndex}"] .editor-cell[data-string="${stringIndex}"]`;
    container.querySelector<HTMLInputElement>(selector)?.focus();
  }

  function renderLines() {
    activeCell = null;
    keypadEl.classList.add("note-keypad--inactive");
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
        // Suppress the OS keyboard — the note keypad below handles input.
        cell.inputMode = "none";
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
    song.lines.push({ chords: [{ frets: new Array(song.stringCount).fill("") }] });
    opts.onChange();
    renderLines();
    const newAnnotation = linesEl.querySelector<HTMLInputElement>(
      `.editor-line[data-line="${song.lines.length - 1}"] .editor-annotation-input`
    );
    newAnnotation?.focus();
  });
  container.appendChild(addLineBtn);
  container.appendChild(keypadEl);

  return container;
}
