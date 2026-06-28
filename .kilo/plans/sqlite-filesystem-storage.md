# SQLite + Filesystem Storage Migration

## Context

CanvasCritique currently uses `localStorage` (JSON serialization) for all data, including base64-encoded images. This hits the 5MB browser limit and is fragile. The app is not yet published, so no migration of existing user data is needed — fresh start.

## Goal

Replace localStorage-based persistence with:
- **SQLite** (`tauri-plugin-sql`) for all relational/structured data
- **Filesystem** (`tauri-plugin-fs`, via `appLocalDataDir`) for binary media files (images)
- **AES-256-GCM encryption** for API keys via a Rust Tauri command (key stored in `appLocalDataDir`)
- **Remove all web/browser fallback** code — Tauri-only app

```
appLocalDataDir/
├── canvascritique.db          # SQLite database
├── media/                      # All binary media files
│   ├── task_<uuid1>.png
│   ├── task_<uuid2>.jpg
│   └── bg_<uuid>.png
└── .encryption_key             # Auto-generated encryption key
```

## Step 1 — Database Setup (SQLite)

### Dependencies

**`src-tauri/Cargo.toml`**: Add `tauri-plugin-sql` with sqlite feature.
**`package.json`**: Add `@tauri-apps/plugin-sql`.

### Rust backend

**`src-tauri/src/main.rs`**: Register `tauri_plugin_sql::Builder::new().build()`.

**`src-tauri/capabilities/default.json`**: Add permissions:
- `sql:default`, `sql:allow-execute`, `sql:allow-select`, `sql:allow-close`

### Database schema (SQLite)

Create on app startup via `db.load()`:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,       -- relative media path, e.g. "media/profile_abc.png"
  color TEXT NOT NULL DEFAULT '#3b82f6'
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL       -- full Settings object as JSON string
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_media_path TEXT,         -- relative media path for project icon
  guidelines TEXT DEFAULT '',
  categories_json TEXT NOT NULL DEFAULT '[]',
  profile_id TEXT NOT NULL,
  hide_completed INTEGER NOT NULL DEFAULT 0,
  settings_override_json TEXT,  -- ProjectSettingsOverride as JSON
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  instructions TEXT DEFAULT '',
  solution TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Basics',
  instruction_files_json TEXT DEFAULT '[]',  -- array of { name, relativePath }
  solution_files_json TEXT DEFAULT '[]',     -- array of { name, relativePath }
  critique_json TEXT,                        -- critique result or NULL
  canvas_data_json TEXT,                     -- full canvas save JSON blob
  project_id TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_backgrounds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  relative_path TEXT NOT NULL,  -- media file path
  icon TEXT                     -- file path or relative path for icon
);
```

### New files

- **`src/lib/db.ts`** — DB init, schema creation, CRUD helpers:
  - `initDb(): Promise<Database>` — opens/creates DB, runs schema
  - `loadAllData(db): Promise<{ profiles, settings, projects, tasks, backgrounds }>`
  - CRUD functions: `insertProject`, `updateProject`, `deleteProject`, `insertTask`, `updateTask`, `deleteTask`, `saveSettings`, etc.

### Store refactoring (`src/lib/state/store.svelte.ts`)

- `loadState()` becomes async — loads from SQLite instead of localStorage
- `saveProjects()`, `saveSettings()`, `saveProfiles()` — write to SQLite
- All `localStorage.getItem/setItem` for data entities replaced with DB calls
- `canvasSaves` state is loaded from `tasks.canvas_data_json` column
- Remove all `__TAURI_INTERNALS__` checks

### Types update (`src/lib/state/types.ts`)

```typescript
// File reference — replaces inline base64 dataUrl
export interface MediaFile {
  name: string;
  relativePath?: string; // "media/task_abc123.png"
}

// CustomBackground — url becomes relativePath
export interface CustomBackground {
  id: string;
  name: string;
  relativePath: string;
  icon: string | null;
}
```

### Remove web fallback

Strip all `(window as any).__TAURI_INTERNALS__` conditionals from:
- `store.svelte.ts` — `saveFileWithDialog()`
- `ai.ts` — N/A (already uses fetch directly)
- `DataManagement.svelte` — folder picker
- `PracticeCanvas.svelte` — N/A

### API key encryption

**`src-tauri/src/crypto.rs`** — new Rust module:
- `encrypt_api_key(plaintext: String) -> Result<String, String>` — AES-256-GCM encrypt
- `decrypt_api_key(encrypted: String) -> Result<String, String>` — AES-256-GCM decrypt
- On first run: generate random 256-bit key, store in `appDataDir/.encryption_key`
- Register as Tauri commands in `main.rs`

**`src/lib/db/crypto.ts`** — frontend helper:
- `encrypt(plaintext: string): Promise<string>` — invokes Tauri command
- `decrypt(encrypted: string): Promise<string>` — invokes Tauri command

**Key flow:**
- `saveSettings()`: encrypt `geminiApiKey` and `openRouterApiKey` before writing JSON to `settings.data_json`
- `loadState()`: decrypt the two keys after reading from DB
- The rest of the app uses decrypted values transparently

**Commit:** `feat: add SQLite database with profiles, projects, tasks, settings tables and API key encryption`

---

## Step 2 — Canvas Vector Data in DB

### Changes

- `saveCanvasState(taskId, data)` → updates `tasks.canvas_data_json` for that task row
- `getCanvasState(taskId)` → reads `tasks.canvas_data_json` (async)
- `loadState()` → populates `canvasSaves` from `canvas_data_json` columns of all loaded tasks
- Canvas cleanup on task delete → handled by `ON DELETE CASCADE`
- Remove localStorage key `canvascritique_canvas_saves`

The canvas save JSON blob is the same structure already produced by `saveToStore()` in `PracticeCanvas.svelte`:

```json
{
  "pages": [{ "id": "...", "strokeHistory": [...], "redoStack": [...] }],
  "infiniteStrokes": [...],
  "infiniteRedo": [...],
  "panOffset": { "x": 0, "y": 0 },
  "zoomScale": 1,
  "activePageIndex": 0
}
```

### Affected files

- `src/lib/state/store.svelte.ts` — `saveCanvasState`, `getCanvasState`, `deleteTask`, `deleteTasks`, `deleteProject`, `executeImportProject`
- `src/lib/views/PracticeCanvas.svelte` — no change needed (uses store API)

**Commit:** `feat: store canvas vector data as JSON in tasks table`

---

## Step 3 — Media Files in Filesystem

### Media file service (`src/lib/db/media.ts`)

```typescript
export async function initMediaDir(): Promise<void>
  // Creates appDataDir/media/ on first run

export async function saveMediaFile(base64DataUrl: string): Promise<string>
  // Extracts MIME type + base64 data, writes to media/<uuid>.<ext>
  // Returns relative path "media/<uuid>.<ext>"

export async function readMediaFile(relativePath: string): Promise<string>
  // Reads file from appDataDir, returns data URL for display
  // Uses tauri-plugin-fs readFile + base64 encode

export async function deleteMediaFile(relativePath: string): Promise<void>
  // Deletes file from appDataDir/media/
```

Uses `@tauri-apps/api/path` for `appDataDir` and `@tauri-apps/plugin-fs` for read/write.

### Files to update

| File | Change |
|------|--------|
| `src/lib/views/TaskEditor.svelte` | Replace `FileReader.readAsDataURL` with `saveMediaFile()` → store `relativePath`; preview via `readMediaFile()` |
| `src/lib/components/practice/PracticeInfoPanels.svelte` | `file.dataUrl` → `readMediaFile(file.relativePath)` |
| `src/lib/components/practice/CustomBgModal.svelte` | `FileReader.readAsDataURL` → `saveMediaFile()` |
| `src/lib/components/dashboard/CreateProjectModal.svelte` | Project icon: `saveMediaFile()` |
| `src/lib/components/dashboard/ProfileModal.svelte` | Profile icon: `saveMediaFile()` |
| `src/lib/views/ProjectDetail.svelte` | Project icon change: `saveMediaFile()` |
| `src/lib/views/Dashboard.svelte` | File import: `saveMediaFile()` |
| `src/lib/services/ai.ts` | Before AI call: `readMediaFile()` for instructionFiles/solutionFiles to get base64 data URLs |
| `src/lib/state/store.svelte.ts` | `exportProject()`: inline `readMediaFile()` for export to keep base64 in export JSON; `importProject()`: detect `dataUrl` → `saveMediaFile()`; Custom background CRUD |

### Export/Import behavior

- **Export**: Read media files, embed as base64 dataUrl in JSON (existing format preserved for portability)
- **Import**: Detect base64 dataUrl, call `saveMediaFile()`, store `relativePath` in DB
- Backward compatible with old export files

**Commit:** `feat: store media files in filesystem with relative paths in DB`

---

## Ephemeral UI State (stays in localStorage)

These small, volatile keys remain in localStorage — not worth SQLite complexity:
- `canvascritique_recent_colors`
- `canvascritique_palette_pos`
- `canvascritique_palette_collapsed`

---

## File Change Map

| File | Action | Step |
|------|--------|------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-sql` | 1 |
| `src-tauri/src/main.rs` | Register sql + crypto plugins | 1 |
| `src-tauri/src/crypto.rs` | **New**: API key encryption commands | 1 |
| `src-tauri/capabilities/default.json` | Add sql permissions | 1 |
| `package.json` | Add `@tauri-apps/plugin-sql` | 1 |
| `src/lib/db.ts` | **New**: DB init, schema, CRUD | 1 |
| `src/lib/db/crypto.ts` | **New**: Frontend crypto helper | 1 |
| `src/lib/db/media.ts` | **New**: Media file service | 3 |
| `src/lib/state/store.svelte.ts` | Replace localStorage with DB (all steps) | 1-3 |
| `src/lib/state/types.ts` | Update MediaFile, CustomBackground types | 1 |
| `src/lib/state/defaults.ts` | Remove localStorage key constants | 1 |
| `src/lib/views/TaskEditor.svelte` | saveMediaFile/readMediaFile | 3 |
| `src/lib/views/ProjectDetail.svelte` | saveMediaFile for icon | 3 |
| `src/lib/views/Dashboard.svelte` | saveMediaFile for imports | 3 |
| `src/lib/components/practice/PracticeInfoPanels.svelte` | readMediaFile for display | 3 |
| `src/lib/components/practice/CustomBgModal.svelte` | saveMediaFile for backgrounds | 3 |
| `src/lib/components/settings/DataManagement.svelte` | Remove Tauri fallback check | 1 |
| `src/lib/components/dashboard/CreateProjectModal.svelte` | saveMediaFile for icon | 3 |
| `src/lib/components/dashboard/ProfileModal.svelte` | saveMediaFile for icon | 3 |
| `src/lib/services/ai.ts` | readMediaFile before AI calls | 3 |
| `src/main.ts` | Add `await initDb()` before mount | 1 |

## Validation Checklist

- [ ] Fresh install: DB created, empty state, app functional
- [ ] Create profile, project, task, custom background: all persist across restart
- [ ] Upload image as task instruction/solution: displays correctly, stored as file
- [ ] Canvas drawing: save/restore across app restart
- [ ] Canvas drawing A4 mode: multi-page save/restore
- [ ] Canvas drawing infinite mode: save/restore
- [ ] AI check work: images sent correctly (read from files, base64 to AI)
- [ ] API keys: encrypted in DB, decrypted for AI calls
- [ ] Export project: produces JSON with base64 dataUrls
- [ ] Import project: base64 dataUrls converted to files, stored with relative paths
- [ ] Delete task: canvas data + media files cleaned up (ON DELETE CASCADE)
- [ ] Delete project: all tasks + media cleaned up
- [ ] Delete profile: all projects + tasks cleaned up
- [ ] Delete custom background: media file deleted
- [ ] UI ephemeral state (recent colors, palette position): persists in localStorage
- [ ] `npm run tauri build` succeeds
