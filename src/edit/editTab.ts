import type { TabChord, TabLine, TabSong } from "../tab/model";

const MIN_STRINGS = 4;
const MAX_STRINGS = 8;

const MIN_FRET = 0;
const MAX_FRET = 24;
/** Symbols a fret cell can hold, ordered nearest-to-blank first (closest when scrolling up). */
const WHEEL_SYMBOLS = ["h", "p", "b", "/", "\\", "x", "|"];
/** One wheel's full scrollable option list, top-to-bottom: symbols, blank, then 0..24. */
const WHEEL_VALUES: string[] = [
  ...[...WHEEL_SYMBOLS].reverse(),
  "",
  ...Array.from({ length: MAX_FRET - MIN_FRET + 1 }, (_, i) => String(MIN_FRET + i)),
];
const WHEEL_BLANK_INDEX = WHEEL_SYMBOLS.length;
/** Must match the height (px) of a .note-wheel__item in style.css. */
const WHEEL_ITEM_HEIGHT = 36;

export interface EditSongOptions {
  /** Called after any mutation to `song` (cell edit, add/remove, title/annotation change). */
  onChange: () => void;
}

/**
 * Renders an interactive editor for `song`. Mutates `song` in place as the
 * user acts, so the caller's own reference stays current for autosaving —
 * this module never owns a copy of the data.
 *
 * Notes are entered through a dedicated keypad (scroll wheels, one per
 * string, plus Enter/Space/Delete/Reset/Return) that always targets the
 * last line — there is no direct tap-to-edit on placed note cells, which
 * are rendered read-only. Any change re-renders the whole line list, since
 * nothing in the grid holds keyboard focus to preserve.
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

  const linesEl = document.createElement("div");
  linesEl.className = "editor-lines";
  container.appendChild(linesEl);

  /** Staged values for the note currently being built, one per string — not
   * yet part of the song until Enter commits them. */
  let pending: string[] = new Array(song.stringCount).fill("");
  let wheelEls: HTMLDivElement[] = [];

  function activeLine(): TabLine {
    return song.lines[song.lines.length - 1];
  }

  function resetPending() {
    pending = new Array(song.stringCount).fill("");
    wheelEls.forEach((wheel) => {
      wheel.scrollTop = WHEEL_BLANK_INDEX * WHEEL_ITEM_HEIGHT;
      highlightWheel(wheel, WHEEL_BLANK_INDEX);
    });
  }

  function highlightWheel(wheel: HTMLDivElement, centeredIndex: number) {
    const items = wheel.querySelectorAll(".note-wheel__item");
    items.forEach((el) => el.classList.remove("note-wheel__item--selected"));
    items[centeredIndex]?.classList.add("note-wheel__item--selected");
  }

  function buildWheel(stringIndex: number): HTMLDivElement {
    const wheel = document.createElement("div");
    wheel.className = "note-wheel";
    // The track is padded by one item-height top and bottom, so the first
    // and last real options can still be scrolled into the centered
    // selection band rather than being stuck at the wheel's edge.
    const track = document.createElement("div");
    track.className = "note-wheel__track";
    WHEEL_VALUES.forEach((value, idx) => {
      const item = document.createElement("div");
      item.className = "note-wheel__item" + (value === "" ? " note-wheel__item--blank" : "");
      item.textContent = value === "" ? "–" : value;
      item.addEventListener("click", () => {
        wheel.scrollTo({ top: idx * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
      });
      track.appendChild(item);
    });
    wheel.appendChild(track);
    wheel.addEventListener("scroll", () => {
      const idx = Math.max(0, Math.min(WHEEL_VALUES.length - 1, Math.round(wheel.scrollTop / WHEEL_ITEM_HEIGHT)));
      pending[stringIndex] = WHEEL_VALUES[idx];
      highlightWheel(wheel, idx);
    });
    // Deferred: the wheel has no layout box yet (not attached to the
    // document until the caller inserts the editor), so scrollTop would
    // silently no-op if set synchronously here.
    requestAnimationFrame(() => {
      wheel.scrollTop = WHEEL_BLANK_INDEX * WHEEL_ITEM_HEIGHT;
      highlightWheel(wheel, WHEEL_BLANK_INDEX);
    });
    return wheel;
  }

  const wheelsRow = document.createElement("div");
  wheelsRow.className = "note-keypad__wheels";

  function rebuildWheels() {
    wheelsRow.innerHTML = "";
    wheelEls = [];
    for (let s = 0; s < song.stringCount; s++) {
      const wheel = buildWheel(s);
      wheelEls.push(wheel);
      wheelsRow.appendChild(wheel);
    }
    pending = new Array(song.stringCount).fill("");
  }

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
    rebuildWheels();
    opts.onChange();
    renderLines();
  }
  stringsDec.addEventListener("click", () => resizeStrings(-1));
  stringsInc.addEventListener("click", () => resizeStrings(1));

  function renderLines() {
    linesEl.innerHTML = "";
    song.lines.forEach((line, lineIndex) => {
      linesEl.appendChild(renderLineEditor(line, lineIndex, lineIndex === song.lines.length - 1));
    });
  }

  function renderReadOnlyColumn(chord: TabChord): HTMLElement {
    const col = document.createElement("div");
    col.className = "editor-col";
    chord.frets.forEach((fret) => {
      const cell = document.createElement("div");
      cell.className = "editor-cell editor-cell--readonly";
      cell.textContent = fret || "";
      col.appendChild(cell);
    });
    return col;
  }

  function renderLineEditor(line: TabLine, lineIndex: number, isActive: boolean): HTMLElement {
    const lineEl = document.createElement("div");
    lineEl.className = "editor-line" + (isActive ? " editor-line--active" : "");
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
    line.chords.forEach((chord) => {
      gridEl.appendChild(renderReadOnlyColumn(chord));
    });
    lineEl.appendChild(gridEl);

    return lineEl;
  }

  rebuildWheels();
  renderLines();

  // --- Keypad: top controls (nav / reset / new line), wheels, bottom controls ---

  const keypadEl = document.createElement("div");
  keypadEl.className = "note-keypad";

  function ctrlButton(label: string, onPress?: () => void, extraClass = ""): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `note-keypad__ctrl-btn ${extraClass}`.trim();
    btn.textContent = label;
    if (onPress) btn.addEventListener("click", onPress);
    else btn.disabled = true;
    return btn;
  }

  const topControls = document.createElement("div");
  topControls.className = "note-keypad__controls";
  const navBtn = ctrlButton("⟷");
  navBtn.title = "Jump between placed notes — coming soon";
  const resetBtn = ctrlButton("Reset", () => resetPending());
  const returnBtn = ctrlButton("Return", () => {
    song.lines.push({ chords: [] });
    opts.onChange();
    resetPending();
    renderLines();
  });
  topControls.append(navBtn, resetBtn, returnBtn);
  keypadEl.appendChild(topControls);

  keypadEl.appendChild(wheelsRow);

  const bottomControls = document.createElement("div");
  bottomControls.className = "note-keypad__controls";
  const deleteBtn = ctrlButton("Delete", () => {
    const line = activeLine();
    if (line.chords.length === 0) return;
    line.chords.pop();
    opts.onChange();
    renderLines();
  }, "note-keypad__ctrl-btn--danger");
  const spaceBtn = ctrlButton("Space", () => {
    activeLine().chords.push({ frets: new Array(song.stringCount).fill("") });
    opts.onChange();
    renderLines();
  });
  const enterBtn = ctrlButton("Enter", () => {
    activeLine().chords.push({ frets: [...pending] });
    opts.onChange();
    resetPending();
    renderLines();
  }, "note-keypad__ctrl-btn--accent");
  bottomControls.append(deleteBtn, spaceBtn, enterBtn);
  keypadEl.appendChild(bottomControls);

  container.appendChild(keypadEl);

  return container;
}
