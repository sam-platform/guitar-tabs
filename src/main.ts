import "./style.css";
import { importTabFile, TabImportError } from "./tab/importTab";
import { createEmptySong } from "./tab/newSong";
import { renderSongToElement } from "./render/renderTab";
import { renderSongEditor } from "./edit/editTab";
import { showConfirm } from "./ui/confirmDialog";
import { deleteSong, listSongs, saveSong, updateSong, type StoredSong } from "./storage/db";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <h1>My Tabs</h1>
      <div class="topbar-actions">
        <button class="new-button" id="new-song-button" type="button">+ New</button>
        <label class="import-button">
          + Import .tab
          <input type="file" id="file-input" accept=".tab" multiple hidden />
        </label>
      </div>
    </header>

    <div class="status" id="status" hidden></div>

    <nav class="song-list" id="song-list"></nav>

    <main class="viewer" id="viewer">
      <p class="empty-hint">
        Import a .tab file from the old tab builder app, write a new one, or
        pick a song from the list.
      </p>
    </main>
  </div>
`;

const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const newSongButton = document.querySelector<HTMLButtonElement>("#new-song-button")!;
const songListEl = document.querySelector<HTMLElement>("#song-list")!;
const viewerEl = document.querySelector<HTMLElement>("#viewer")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;

let currentSongId: string | null = null;
let currentMode: "view" | "edit" = "view";
let autosaveTimer: number | undefined;

function showStatus(message: string, kind: "info" | "error" = "info") {
  statusEl.textContent = message;
  statusEl.hidden = false;
  statusEl.className = `status status--${kind}`;
  if (kind === "info") {
    setTimeout(() => {
      if (statusEl.textContent === message) statusEl.hidden = true;
    }, 3000);
  }
}

async function refreshSongList() {
  const songs = await listSongs();
  songListEl.innerHTML = "";

  if (songs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No songs yet.";
    songListEl.appendChild(empty);
    return;
  }

  for (const song of songs) {
    const item = document.createElement("div");
    item.className = "song-item" + (song.id === currentSongId ? " song-item--active" : "");

    const titleBtn = document.createElement("button");
    titleBtn.className = "song-item__title";
    titleBtn.textContent = song.title;
    titleBtn.addEventListener("click", () => openSong(song));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "song-item__delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await showConfirm(`Delete "${song.title}"? This can't be undone.`);
      if (!ok) return;
      await deleteSong(song.id);
      if (currentSongId === song.id) {
        currentSongId = null;
        viewerEl.innerHTML = `<p class="empty-hint">Pick a song from the list.</p>`;
      }
      await refreshSongList();
    });

    item.appendChild(titleBtn);
    item.appendChild(deleteBtn);
    songListEl.appendChild(item);
  }
}

function scheduleAutosave(song: StoredSong) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(async () => {
    song.updatedAt = new Date().toISOString();
    await updateSong(song);
    await refreshSongList();
  }, 500);
}

function renderViewer(song: StoredSong) {
  viewerEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "viewer-header";

  if (currentMode === "view") {
    const heading = document.createElement("h2");
    heading.className = "song-title";
    heading.textContent = song.title;
    header.appendChild(heading);
  } else {
    header.appendChild(document.createElement("div"));
  }

  const modeBtn = document.createElement("button");
  modeBtn.type = "button";
  modeBtn.className = "mode-toggle";
  modeBtn.textContent = currentMode === "view" ? "Edit" : "Done";
  modeBtn.addEventListener("click", () => {
    currentMode = currentMode === "view" ? "edit" : "view";
    renderViewer(song);
  });
  header.appendChild(modeBtn);

  viewerEl.appendChild(header);

  if (currentMode === "edit") {
    viewerEl.appendChild(renderSongEditor(song, { onChange: () => scheduleAutosave(song) }));
  } else {
    viewerEl.appendChild(renderSongToElement(song));
  }
}

function openSong(song: StoredSong, mode: "view" | "edit" = "view") {
  currentSongId = song.id;
  currentMode = mode;
  renderViewer(song);
  refreshSongList();
}

fileInput.addEventListener("change", async () => {
  const files = fileInput.files;
  if (!files || files.length === 0) return;

  let imported = 0;
  let failed = 0;

  for (const file of Array.from(files)) {
    try {
      const buffer = await file.arrayBuffer();
      const song = importTabFile(buffer, file.name);
      const stored = await saveSong(song);
      imported++;
      if (files.length === 1) openSong(stored);
    } catch (err) {
      failed++;
      const message = err instanceof TabImportError ? err.message : `Failed to import "${file.name}".`;
      showStatus(message, "error");
      console.error(err);
    }
  }

  if (imported > 0 && !(imported === 1 && files.length === 1)) {
    showStatus(`Imported ${imported} song${imported === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
  } else if (imported === 1 && failed === 0 && files.length === 1) {
    showStatus(`Imported "${files[0].name}".`);
  }

  fileInput.value = "";
  await refreshSongList();
});

newSongButton.addEventListener("click", async () => {
  const stored = await saveSong(createEmptySong());
  openSong(stored, "edit");
  const titleInput = viewerEl.querySelector<HTMLInputElement>(".editor-title-input");
  titleInput?.focus();
  titleInput?.select();
});

refreshSongList();
