import Database from '@tauri-apps/plugin-sql';
import type { Profile, Settings, Project, Task, CustomBackground, ProjectSettingsOverride, RequestLog, TaskAttempt } from './state/types';
import { defaultSettings, defaultProjects } from './state/defaults';

let dbInstance: Database | null = null;

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const db = await Database.load('sqlite:canvascritique.db');
  dbInstance = db;

  await db.execute('PRAGMA foreign_keys = ON');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sha256_hash TEXT
    )
  `);

  try {
    await db.execute('ALTER TABLE media ADD COLUMN sha256_hash TEXT');
  } catch (_) {
    // Column already exists
  }

  try {
    await db.execute('ALTER TABLE media ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  } catch (_) {
    // Column already exists
  }

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN settings_override_json TEXT');
  } catch (_) {
    // Column already exists
  }

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN active_attempt_id TEXT');
  } catch (_) {
    // Column already exists
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_attempts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      critique_json TEXT,
      canvas_data_json TEXT,
      editor_text TEXT,
      multiple_choice_answers_json TEXT DEFAULT '{}',
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data_json TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_request_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_media_path TEXT,
      guidelines TEXT DEFAULT '',
      categories_json TEXT NOT NULL DEFAULT '[]',
      profile_id TEXT NOT NULL,
      hide_completed INTEGER NOT NULL DEFAULT 0,
      settings_override_json TEXT,
      default_background TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      instructions TEXT DEFAULT '',
      solution TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Basics',
      instruction_files_json TEXT DEFAULT '[]',
      solution_files_json TEXT DEFAULT '[]',
      critique_json TEXT,
      canvas_data_json TEXT,
      project_id TEXT NOT NULL,
      background TEXT,
      editor_text TEXT DEFAULT '',
      ai_instructions TEXT DEFAULT '',
      default_edit_mode TEXT DEFAULT 'both',
      context_files_json TEXT DEFAULT '[]',
      template_canvas_data TEXT,
      provided_files_json TEXT DEFAULT '[]',
      multiple_choice_tasks_json TEXT DEFAULT '[]',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS custom_backgrounds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    await db.execute('ALTER TABLE projects ADD COLUMN default_background TEXT');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN background TEXT');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN editor_text TEXT DEFAULT ""');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN ai_instructions TEXT DEFAULT ""');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE profiles ADD COLUMN sort_order INTEGER DEFAULT 0');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN template_canvas_data TEXT');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN default_edit_mode TEXT DEFAULT "both"');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN context_files_json TEXT DEFAULT "[]"');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN provided_files_json TEXT DEFAULT "[]"');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN multiple_choice_tasks_json TEXT DEFAULT "[]"');
  } catch (_) {}

  try {
    await db.execute('ALTER TABLE task_attempts ADD COLUMN multiple_choice_answers_json TEXT DEFAULT "{}"');
  } catch (_) {}

  // Check if task_canvas_media table exists before creating it, to see if we need to migrate existing references
  const tableCheck = await db.select("SELECT name FROM sqlite_master WHERE type='table' AND name='task_canvas_media'") as any[];
  const needsMigration = tableCheck.length === 0;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS task_canvas_media (
      task_id TEXT NOT NULL,
      media_id TEXT NOT NULL,
      PRIMARY KEY (task_id, media_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
    )
  `);

  if (needsMigration) {
    await migrateCanvasMediaReferences(db);
  }

  // Seed defaults if database is fresh (no profiles)
  const profileCount = await db.select('SELECT COUNT(*) as count FROM profiles');
  if ((profileCount[0] as any).count === 0) {
    await db.execute(
      'INSERT INTO profiles (id, name, icon, color) VALUES (?, ?, ?, ?)',
      ['default-profile', 'General', null, '#3b82f6']
    );

    for (const project of defaultProjects) {
      await db.execute(
        `INSERT INTO projects (id, name, icon_media_path, guidelines, categories_json, profile_id, hide_completed, settings_override_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          project.id,
          project.name,
          project.icon && !project.icon.startsWith('data:') ? project.icon : null,
          project.guidelines || '',
          JSON.stringify(project.categories || []),
          project.profileId || 'default-profile',
          project.hideCompleted ? 1 : 0,
          project.settingsOverride ? JSON.stringify(project.settingsOverride) : null
        ]
      );

      for (const task of (project.tasks || [])) {
        await db.execute(
          `INSERT INTO tasks (id, name, completed, instructions, solution, category, instruction_files_json, solution_files_json, critique_json, canvas_data_json, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            task.name,
            task.completed ? 1 : 0,
            task.instructions || '',
            task.solution || '',
            task.category || 'Basics',
            JSON.stringify(task.instructionFiles || []),
            JSON.stringify(task.solutionFiles || []),
            task.critique ? JSON.stringify(task.critique) : null,
            null,
            project.id
          ]
        );
      }
    }
  }

  // Migration for stats to own table
  try {
    const settingsRow: any[] = await db.select('SELECT data_json FROM settings WHERE id = 1');
    if (settingsRow.length > 0) {
      const settingsObj = JSON.parse(settingsRow[0].data_json);
      if (settingsObj.stats) {
        console.log('Migrating existing statistics from settings JSON to api_request_logs table...');
        let migratedCount = 0;
        if (settingsObj.stats.history && Array.isArray(settingsObj.stats.history)) {
          for (const log of settingsObj.stats.history) {
            try {
              await db.execute(
                `INSERT OR IGNORE INTO api_request_logs (id, timestamp, provider, model, input_tokens, output_tokens, reasoning_tokens, cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  log.id || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
                  log.timestamp || new Date().toISOString(),
                  log.provider || 'gemini',
                  log.model || 'gemini-1.5-flash',
                  log.inputTokens || 0,
                  log.outputTokens || 0,
                  log.reasoningTokens || 0,
                  log.cost || 0
                ]
              );
              migratedCount++;
            } catch (err) {
              console.error('Failed to migrate request log:', log, err);
            }
          }
        }
        // Remove stats from the settings JSON so it's clean
        delete settingsObj.stats;
        const newJson = JSON.stringify(settingsObj);
        await db.execute('UPDATE settings SET data_json = ? WHERE id = 1', [newJson]);
        console.log(`Successfully migrated ${migratedCount} statistics logs and cleaned up settings JSON.`);
      }
    }
  } catch (err) {
    console.error('Failed during statistics migration:', err);
  }

  await migrateSolutionsFromDbToFs(db);
  await migrateAttemptCanvasDataToFiles(db);
  await syncAttemptsTableWithFiles(db);

  return db;
}

export function getDb(): Database {
  if (!dbInstance) throw new Error('Database not initialized. Call initDb() first.');
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

export async function backupDatabase(destAbsoluteOrRelativePath: string): Promise<void> {
  const db = getDb();
  // We need to delete the file first if it exists, otherwise VACUUM INTO fails.
  try {
    const { remove } = await import('@tauri-apps/plugin-fs');
    await remove(destAbsoluteOrRelativePath);
  } catch (_) {} // ignore if it doesn't exist
  await db.execute(`VACUUM INTO '${destAbsoluteOrRelativePath}'`);
}

export async function replaceDatabase(sourceAbsolutePath: string): Promise<void> {
  await closeDb();
  
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { copyFile, exists, remove } = await import('@tauri-apps/plugin-fs');
  
  const dir = await appDataDir();
  const dbPath = await join(dir, 'canvascritique.db');
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  
  try {
    if (await exists(walPath)) {
      await remove(walPath);
    }
  } catch (err) {
    console.warn('Failed to delete WAL file:', err);
  }
  try {
    if (await exists(shmPath)) {
      await remove(shmPath);
    }
  } catch (err) {
    console.warn('Failed to delete SHM file:', err);
  }
  
  await copyFile(sourceAbsolutePath, dbPath);
  
  await initDb();
}

// ── Profiles ──

export async function getProfiles(db: Database): Promise<Profile[]> {
  const rows: any[] = await db.select('SELECT id, name, icon, color, sort_order FROM profiles ORDER BY sort_order ASC, id ASC');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    icon: r.icon || null,
    color: r.color || '#3b82f6',
    sortOrder: r.sort_order || 0
  }));
}

export async function insertProfile(db: Database, profile: Profile): Promise<void> {
  await db.execute(
    'INSERT INTO profiles (id, name, icon, color, sort_order) VALUES (?, ?, ?, ?, ?)',
    [
      profile.id,
      profile.name,
      profile.icon && profile.icon.startsWith('data:') ? null : profile.icon,
      profile.color || '#3b82f6',
      profile.sortOrder || 0
    ]
  );
}

export async function updateProfile(db: Database, id: string, updates: Partial<Profile>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon && updates.icon.startsWith('data:') ? null : updates.icon);
  }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.sortOrder !== undefined) { fields.push('sort_order = ?'); values.push(updates.sortOrder); }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteProfile(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM profiles WHERE id = ?', [id]);
}

// ── Settings ──

export async function getSettings(db: Database): Promise<Settings | null> {
  const rows: any[] = await db.select('SELECT data_json FROM settings WHERE id = 1');
  if (rows.length === 0) return null;
  let loadedSettings: any = {};
  try {
    loadedSettings = JSON.parse(rows[0].data_json);
  } catch (e) {
    console.error('Failed to parse settings JSON:', e);
  }

  // Clean settings: only keep keys that exist in defaultSettings
  const cleaned: any = {};
  for (const key of Object.keys(defaultSettings)) {
    if (loadedSettings[key] !== undefined) {
      cleaned[key] = loadedSettings[key];
    } else {
      cleaned[key] = (defaultSettings as any)[key];
    }
  }
  return cleaned as Settings;
}

export async function saveSettings(db: Database, settings: Settings): Promise<void> {
  // Clean settings: only keep keys that exist in defaultSettings
  const cleaned: any = {};
  for (const key of Object.keys(defaultSettings)) {
    if (settings[key] !== undefined) {
      cleaned[key] = settings[key];
    } else {
      cleaned[key] = (defaultSettings as any)[key];
    }
  }

  delete cleaned.lastSyncedTimestamp;
  delete cleaned.lastSyncedDbHash;
  const json = JSON.stringify(cleaned);
  await db.execute(
    'INSERT OR REPLACE INTO settings (id, data_json) VALUES (1, ?)',
    [json]
  );
}

// ── Projects ──

export async function getProjects(db: Database): Promise<Project[]> {
  const rows: any[] = await db.select(
    'SELECT id, name, icon_media_path, guidelines, categories_json, profile_id, hide_completed, settings_override_json, default_background FROM projects'
  );
  return rows.map(r => {
    const project: Project = {
      id: r.id,
      name: r.name,
      icon: r.icon_media_path || 'history_edu',
      guidelines: r.guidelines || '',
      categories: JSON.parse(r.categories_json || '[]'),
      tasks: [],
      profileId: r.profile_id,
      hideCompleted: !!r.hide_completed,
      default_background: r.default_background || null
    };
    if (r.settings_override_json) {
      try { project.settingsOverride = JSON.parse(r.settings_override_json); } catch (_) {}
    }
    return project;
  });
}

export async function insertProject(db: Database, project: Project): Promise<void> {
  await db.execute(
    `INSERT INTO projects (id, name, icon_media_path, guidelines, categories_json, profile_id, hide_completed, settings_override_json, default_background)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.icon && project.icon.startsWith('data:') ? null : project.icon,
      project.guidelines || '',
      JSON.stringify(project.categories || []),
      project.profileId,
      project.hideCompleted ? 1 : 0,
      project.settingsOverride ? JSON.stringify(project.settingsOverride) : null,
      project.default_background || null
    ]
  );
}

export async function updateProject(db: Database, id: string, updates: {
  name?: string;
  icon?: string;
  icon_media_path?: string;
  guidelines?: string;
  categories?: string[];
  hideCompleted?: boolean;
  settingsOverride?: ProjectSettingsOverride;
  default_background?: string | null;
}): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.icon !== undefined) {
    fields.push('icon_media_path = ?');
    values.push(updates.icon.startsWith('data:') ? null : updates.icon);
  }
  if (updates.icon_media_path !== undefined) { fields.push('icon_media_path = ?'); values.push(updates.icon_media_path); }
  if (updates.guidelines !== undefined) { fields.push('guidelines = ?'); values.push(updates.guidelines); }
  if (updates.categories !== undefined) { fields.push('categories_json = ?'); values.push(JSON.stringify(updates.categories)); }
  if (updates.hideCompleted !== undefined) { fields.push('hide_completed = ?'); values.push(updates.hideCompleted ? 1 : 0); }
  if (updates.settingsOverride !== undefined) {
    fields.push('settings_override_json = ?');
    values.push(JSON.stringify(updates.settingsOverride));
  }
  if (updates.default_background !== undefined) { fields.push('default_background = ?'); values.push(updates.default_background); }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteProject(db: Database, id: string): Promise<void> {
  // Delete task canvas files for all tasks belonging to this project
  try {
    const tasks = await db.select('SELECT id FROM tasks WHERE project_id = ?', [id]) as Array<{ id: string }>;
    for (const task of tasks) {
      await deleteTaskSolutionFile(db, task.id);
    }
  } catch (err) {
    console.error('Failed to cleanup task solution files during project deletion:', err);
  }
  await db.execute('DELETE FROM projects WHERE id = ?', [id]);
}

// ── Tasks ──

let cachedCanvasDataDir: string | null = null;
export async function getCanvasDataDir(): Promise<string> {
  if (cachedCanvasDataDir) return cachedCanvasDataDir;
  const { appLocalDataDir, join } = await import('@tauri-apps/api/path');
  const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
  const appData = await appLocalDataDir();
  const canvasDataPath = await join(appData, 'canvas_data');
  if (!(await exists(canvasDataPath))) {
    await mkdir(canvasDataPath, { recursive: true });
  }
  cachedCanvasDataDir = canvasDataPath;
  return canvasDataPath;
}

export async function saveTaskSolutionToDisk(taskId: string, solutionData: { canvasData?: any; editorText?: string }): Promise<void> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const filePath = await join(canvasDataDir, `${taskId}.json`);

    let currentData: { canvasData: any; editorText: string; updatedAt?: string } = { canvasData: null, editorText: '', updatedAt: '' };
    if (await exists(filePath)) {
      try {
        const raw = await readFile(filePath);
        const text = new TextDecoder().decode(raw);
        currentData = JSON.parse(text);
      } catch (e) {
        console.warn(`Failed to read/parse existing solution file for task ${taskId}:`, e);
      }
    }

    if (solutionData.canvasData !== undefined) {
      currentData.canvasData = solutionData.canvasData;
    }
    if (solutionData.editorText !== undefined) {
      currentData.editorText = solutionData.editorText;
    }

    currentData.updatedAt = new Date().toISOString();

    const text = JSON.stringify(currentData, null, 2);
    const bytes = new TextEncoder().encode(text);
    await writeFile(filePath, bytes);
  } catch (err) {
    console.error(`Failed to save task solution to disk for task ${taskId}:`, err);
  }
}

export async function loadTaskSolutionFromDisk(taskId: string): Promise<{ canvasData: any; editorText: string; updatedAt?: string }> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile } = await import('@tauri-apps/plugin-fs');
    const filePath = await join(canvasDataDir, `${taskId}.json`);
    if (await exists(filePath)) {
      const raw = await readFile(filePath);
      const text = new TextDecoder().decode(raw);
      const parsed = JSON.parse(text);
      return {
        canvasData: parsed.canvasData || null,
        editorText: parsed.editorText || '',
        updatedAt: parsed.updatedAt || undefined
      };
    }
  } catch (err) {
    // Don't warn for missing solution files as new tasks won't have one
  }
  return { canvasData: null, editorText: '' };
}

export async function saveAttemptToDisk(attemptId: string, updates: Partial<TaskAttempt & { updatedAt?: string }>): Promise<void> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { writeFile, exists, mkdir, readFile, remove } = await import('@tauri-apps/plugin-fs');
    
    if (!(await exists(canvasDataDir))) {
      await mkdir(canvasDataDir, { recursive: true });
    }
    
    const filePath = await join(canvasDataDir, `${attemptId}.json`);
    const legacyPath = await join(canvasDataDir, `attempt_${attemptId}.json`);
    
    let currentContent: any = {};
    if (await exists(legacyPath)) {
      try {
        const raw = await readFile(legacyPath);
        currentContent = JSON.parse(new TextDecoder().decode(raw));
        await remove(legacyPath);
      } catch (_) {}
    } else if (await exists(filePath)) {
      try {
        const raw = await readFile(filePath);
        currentContent = JSON.parse(new TextDecoder().decode(raw));
      } catch (_) {}
    }

    // Merge updates
    if (updates.id !== undefined) currentContent.id = updates.id;
    if (updates.taskId !== undefined) currentContent.taskId = updates.taskId;
    if (updates.name !== undefined) currentContent.name = updates.name;
    if (updates.timestamp !== undefined) currentContent.timestamp = updates.timestamp;
    if (updates.critique !== undefined) currentContent.critique = updates.critique;
    if (updates.editorText !== undefined) currentContent.editorText = updates.editorText;
    if (updates.multipleChoiceAnswers !== undefined) currentContent.multipleChoiceAnswers = updates.multipleChoiceAnswers;
    if (updates.canvasData !== undefined) currentContent.canvasData = updates.canvasData;

    if (updates.updatedAt !== undefined) {
      currentContent.updatedAt = updates.updatedAt;
    } else {
      currentContent.updatedAt = new Date().toISOString();
    }

    const text = JSON.stringify(currentContent, null, 2);
    const bytes = new TextEncoder().encode(text);
    await writeFile(filePath, bytes);
  } catch (err) {
    console.error(`Failed to save attempt to disk for attempt ${attemptId}:`, err);
  }
}

export async function loadAttemptFromDisk(attemptId: string): Promise<TaskAttempt & { updatedAt?: string } | null> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile, rename } = await import('@tauri-apps/plugin-fs');
    const filePath = await join(canvasDataDir, `${attemptId}.json`);
    const legacyPath = await join(canvasDataDir, `attempt_${attemptId}.json`);

    if (await exists(legacyPath)) {
      try {
        await rename(legacyPath, filePath);
      } catch (err) {
        console.warn(`Failed to rename legacy attempt file ${legacyPath} to ${filePath}:`, err);
      }
    }

    if (await exists(filePath)) {
      const raw = await readFile(filePath);
      const text = new TextDecoder().decode(raw);
      const parsed = JSON.parse(text);
      return {
        id: parsed.id || attemptId,
        taskId: parsed.taskId || parsed.task_id || '',
        name: parsed.name || '',
        timestamp: parsed.timestamp || new Date().toISOString(),
        critique: parsed.critique || null,
        canvasData: parsed.canvasData || null,
        editorText: parsed.editorText || '',
        multipleChoiceAnswers: parsed.multipleChoiceAnswers || {},
        updatedAt: parsed.updatedAt || parsed.timestamp
      };
    }
  } catch (err) {
    console.error(`Failed to load attempt from disk for attempt ${attemptId}:`, err);
  }
  return null;
}

export async function saveAttemptCanvasDataToDisk(attemptId: string, canvasData: any): Promise<void> {
  await saveAttemptToDisk(attemptId, { canvasData });
}

export async function loadAttemptCanvasDataFromDisk(attemptId: string): Promise<any> {
  const attempt = await loadAttemptFromDisk(attemptId);
  return attempt ? attempt.canvasData : null;
}

export async function deleteAttemptCanvasDataFile(attemptId: string): Promise<void> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, remove } = await import('@tauri-apps/plugin-fs');
    const filePath = await join(canvasDataDir, `${attemptId}.json`);
    if (await exists(filePath)) {
      await remove(filePath);
    }
    const legacyPath = await join(canvasDataDir, `attempt_${attemptId}.json`);
    if (await exists(legacyPath)) {
      await remove(legacyPath);
    }
  } catch (err) {
    console.error(`Failed to delete canvas file for attempt ${attemptId}:`, err);
  }
}

export async function migrateAttemptCanvasDataToFiles(db: Database): Promise<void> {
  try {
    const rows = await db.select(
      'SELECT id, task_id, name, timestamp, critique_json, canvas_data_json, editor_text, multiple_choice_answers_json FROM task_attempts WHERE canvas_data_json IS NOT NULL'
    ) as any[];
    
    if (rows.length > 0) {
      console.log(`Migrating ${rows.length} attempts canvas data to separate files...`);
      for (const row of rows) {
        try {
          const canvasData = JSON.parse(row.canvas_data_json);
          await saveAttemptToDisk(row.id, {
            id: row.id,
            taskId: row.task_id,
            name: row.name,
            timestamp: row.timestamp,
            critique: row.critique_json ? JSON.parse(row.critique_json) : null,
            editorText: row.editor_text || '',
            multipleChoiceAnswers: row.multiple_choice_answers_json ? JSON.parse(row.multiple_choice_answers_json) : {},
            canvasData
          });
          // Clear the column in the database so we don't migrate it again
          await db.execute('UPDATE task_attempts SET canvas_data_json = NULL WHERE id = ?', [row.id]);
        } catch (err) {
          console.error(`Failed to migrate attempt ${row.id}:`, err);
        }
      }
      console.log('Migration of attempt canvas data completed.');
    }
  } catch (err) {
    console.error('Failed to run attempt canvas data migration:', err);
  }
}

export async function deleteTaskSolutionFile(db: Database, taskId: string): Promise<void> {
  try {
    // Delete all attempt canvas files first!
    const attempts = await db.select('SELECT id FROM task_attempts WHERE task_id = ?', [taskId]) as Array<{ id: string }>;
    for (const attempt of attempts) {
      await deleteAttemptCanvasDataFile(attempt.id);
    }

    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, remove } = await import('@tauri-apps/plugin-fs');
    const filePath = await join(canvasDataDir, `${taskId}.json`);
    if (await exists(filePath)) {
      await remove(filePath);
    }
    // Also remove references from task_canvas_media
    await db.execute('DELETE FROM task_canvas_media WHERE task_id = ?', [taskId]);
    
    // Also remove from metadata
    await removeLocalCanvasMetadata(taskId);
  } catch (err) {
    console.error(`Failed to delete solution file for task ${taskId}:`, err);
  }
}

export async function migrateSolutionsFromDbToFs(db: Database): Promise<void> {
  try {
    const rows: any[] = await db.select(
      'SELECT id, canvas_data_json, editor_text FROM tasks WHERE canvas_data_json IS NOT NULL OR (editor_text IS NOT NULL AND editor_text != "")'
    );
    if (rows.length > 0) {
      console.log(`Migrating ${rows.length} task solutions from SQLite to disk files...`);
      for (const row of rows) {
        let canvasData = null;
        if (row.canvas_data_json) {
          try {
            canvasData = JSON.parse(row.canvas_data_json);
          } catch (e) {
            console.warn(`Failed to parse canvas_data_json for migration of task ${row.id}:`, e);
          }
        }
        const editorText = row.editor_text || '';
        await saveTaskSolutionToDisk(row.id, { canvasData, editorText });
      }
      await db.execute('UPDATE tasks SET canvas_data_json = NULL, editor_text = ""');
      console.log('Task solutions migrated successfully. Running VACUUM to reclaim space...');
      await db.execute('VACUUM');
    }
  } catch (err) {
    console.error('Failed to migrate task solutions from DB to FS:', err);
  }
}

export async function getTasks(db: Database): Promise<Task[]> {
  const rows: any[] = await db.select(
    'SELECT id, name, completed, instructions, solution, category, instruction_files_json, solution_files_json, critique_json, project_id, background, settings_override_json, ai_instructions, default_edit_mode, context_files_json, template_canvas_data, provided_files_json, active_attempt_id, multiple_choice_tasks_json FROM tasks'
  );
  const tasks = rows.map(r => {
    const task: Task = {
      id: r.id,
      name: r.name,
      completed: !!r.completed,
      instructions: r.instructions || '',
      solution: r.solution || '',
      aiInstructions: r.ai_instructions || '',
      category: r.category || 'Basics',
      instructionFiles: JSON.parse(r.instruction_files_json || '[]'),
      solutionFiles: JSON.parse(r.solution_files_json || '[]'),
      projectId: r.project_id,
      background: r.background || null,
      editorText: '',
      defaultEditMode: r.default_edit_mode || 'both',
      contextFiles: JSON.parse(r.context_files_json || '[]'),
      templateCanvasData: r.template_canvas_data || null,
      providedFiles: JSON.parse(r.provided_files_json || '[]'),
      activeAttemptId: r.active_attempt_id || null,
      multipleChoiceTasks: r.multiple_choice_tasks_json ? JSON.parse(r.multiple_choice_tasks_json) : []
    };
    if (r.settings_override_json) {
      try { task.settingsOverride = JSON.parse(r.settings_override_json); } catch (_) {}
    }
    if (r.critique_json) {
      try { task.critique = JSON.parse(r.critique_json); } catch (_) {}
    }
    return task;
  });

  await Promise.all(tasks.map(async (task) => {
    // Load attempts first
    const attempts = await getAttemptsForTask(db, task.id);
    let activeAttempt: TaskAttempt | undefined;

    if (attempts.length > 0) {
      task.attempts = attempts;
      if (!task.activeAttemptId) {
        task.activeAttemptId = attempts[0].id;
        await db.execute('UPDATE tasks SET active_attempt_id = ? WHERE id = ?', [attempts[0].id, task.id]);
      }
      activeAttempt = attempts.find(a => a.id === task.activeAttemptId) || attempts[0];
    }

    // Check if we have a legacy solution file to migrate
    const solution = await loadTaskSolutionFromDisk(task.id);

    if (!activeAttempt) {
      // Migrate existing single solution to attempt 1
      const attemptId = 'attempt_default_' + task.id;
      const defaultAttempt: TaskAttempt = {
        id: attemptId,
        taskId: task.id,
        name: (task.settingsOverride?.overrideSettings && task.settingsOverride.language === 'Deutsch') || defaultSettings.language === 'Deutsch'
          ? 'Versuch 1'
          : 'Try 1',
        timestamp: new Date().toISOString(),
        canvasData: solution.canvasData,
        editorText: solution.editorText,
        critique: task.critique
      };
      
      // Save it to database and disk (this creates the attempt file)
      await insertAttempt(db, defaultAttempt);
      task.attempts = [defaultAttempt];
      task.activeAttemptId = attemptId;
      await db.execute('UPDATE tasks SET active_attempt_id = ? WHERE id = ?', [attemptId, task.id]);
      activeAttempt = defaultAttempt;

      // Delete the legacy task solution file since we successfully migrated it
      try {
        const { join } = await import('@tauri-apps/api/path');
        const { remove, exists } = await import('@tauri-apps/plugin-fs');
        const filePath = await join(await getCanvasDataDir(), `${task.id}.json`);
        if (await exists(filePath)) {
          await remove(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete legacy task solution file ${task.id}.json:`, err);
      }
    } else {
      // If we already have attempts but there's still a legacy file, clean it up!
      if (solution.canvasData || solution.editorText) {
        try {
          const { join } = await import('@tauri-apps/api/path');
          const { remove, exists } = await import('@tauri-apps/plugin-fs');
          const filePath = await join(await getCanvasDataDir(), `${task.id}.json`);
          if (await exists(filePath)) {
            await remove(filePath);
          }
        } catch (err) {
          console.error(`Failed to delete redundant legacy task solution file ${task.id}.json:`, err);
        }
      }
    }

    // Now, load the active attempt's canvas data from disk
    if (activeAttempt) {
      const activeCanvas = await loadAttemptCanvasDataFromDisk(activeAttempt.id);
      (task as any).canvasData = activeCanvas;
      task.editorText = activeAttempt.editorText;
    } else {
      (task as any).canvasData = null;
      task.editorText = '';
    }
  }));

  return tasks;
}

export async function insertTask(db: Database, task: Task, projectId: string): Promise<void> {
  await db.execute(
    `INSERT INTO tasks (id, name, completed, instructions, solution, category, instruction_files_json, solution_files_json, critique_json, canvas_data_json, project_id, background, editor_text, settings_override_json, ai_instructions, default_edit_mode, context_files_json, template_canvas_data, provided_files_json, multiple_choice_tasks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.name,
      task.completed ? 1 : 0,
      task.instructions || '',
      task.solution || '',
      task.category || 'Basics',
      JSON.stringify(task.instructionFiles || []),
      JSON.stringify(task.solutionFiles || []),
      task.critique ? JSON.stringify(task.critique) : null,
      null,
      projectId,
      task.background || null,
      '',
      task.settingsOverride ? JSON.stringify(task.settingsOverride) : null,
      task.aiInstructions || '',
      task.defaultEditMode || 'both',
      JSON.stringify(task.contextFiles || []),
      task.templateCanvasData || null,
      JSON.stringify(task.providedFiles || []),
      JSON.stringify(task.multipleChoiceTasks || [])
    ]
  );

  const canvasData = (task as any).canvasData;
  if (canvasData || task.editorText || (task.attempts && task.attempts.length > 0)) {
    if (task.attempts && task.attempts.length > 0) {
      for (const attempt of task.attempts) {
        await insertAttempt(db, attempt);
      }
    } else {
      const attemptId = 'attempt_default_' + task.id;
      const defaultAttempt: TaskAttempt = {
        id: attemptId,
        taskId: task.id,
        name: defaultSettings.language === 'Deutsch' ? 'Versuch 1' : 'Try 1',
        timestamp: new Date().toISOString(),
        canvasData: canvasData || null,
        editorText: task.editorText || '',
        critique: task.critique || null
      };
      await insertAttempt(db, defaultAttempt);
      await db.execute('UPDATE tasks SET active_attempt_id = ? WHERE id = ?', [attemptId, task.id]);
      task.attempts = [defaultAttempt];
      task.activeAttemptId = attemptId;
    }
  }
}

export async function updateTask(db: Database, id: string, updates: Partial<any>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed ? 1 : 0); }
  if (updates.instructions !== undefined) { fields.push('instructions = ?'); values.push(updates.instructions); }
  if (updates.solution !== undefined) { fields.push('solution = ?'); values.push(updates.solution); }
  if (updates.aiInstructions !== undefined) { fields.push('ai_instructions = ?'); values.push(updates.aiInstructions); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.instructionFiles !== undefined) { fields.push('instruction_files_json = ?'); values.push(JSON.stringify(updates.instructionFiles)); }
  if (updates.solutionFiles !== undefined) { fields.push('solution_files_json = ?'); values.push(JSON.stringify(updates.solutionFiles)); }
  if (updates.critique !== undefined) { fields.push('critique_json = ?'); values.push(updates.critique ? JSON.stringify(updates.critique) : null); }
  if (updates.projectId !== undefined) { fields.push('project_id = ?'); values.push(updates.projectId); }
  if (updates.background !== undefined) { fields.push('background = ?'); values.push(updates.background); }
  if (updates.settingsOverride !== undefined) { fields.push('settings_override_json = ?'); values.push(updates.settingsOverride ? JSON.stringify(updates.settingsOverride) : null); }
  if (updates.defaultEditMode !== undefined) { fields.push('default_edit_mode = ?'); values.push(updates.defaultEditMode); }
  if (updates.contextFiles !== undefined) { fields.push('context_files_json = ?'); values.push(JSON.stringify(updates.contextFiles)); }
  if (updates.templateCanvasData !== undefined) { fields.push('template_canvas_data = ?'); values.push(updates.templateCanvasData); }
  if (updates.providedFiles !== undefined) { fields.push('provided_files_json = ?'); values.push(JSON.stringify(updates.providedFiles)); }
  if (updates.activeAttemptId !== undefined) { fields.push('active_attempt_id = ?'); values.push(updates.activeAttemptId); }
  if (updates.multipleChoiceTasks !== undefined) { fields.push('multiple_choice_tasks_json = ?'); values.push(JSON.stringify(updates.multipleChoiceTasks)); }

  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTask(db: Database, id: string): Promise<void> {
  await deleteTaskSolutionFile(db, id);
  await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
}

export async function deleteTasks(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.all(ids.map(id => deleteTaskSolutionFile(db, id)));
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
}

// ── Canvas State ──

export async function getCanvasState(db: Database, taskId: string): Promise<any> {
  const tasks = await db.select('SELECT active_attempt_id FROM tasks WHERE id = ?', [taskId]) as Array<{ active_attempt_id: string | null }>;
  if (tasks.length > 0 && tasks[0].active_attempt_id) {
    return await loadAttemptCanvasDataFromDisk(tasks[0].active_attempt_id);
  }
  return null;
}

export async function setCanvasState(db: Database, taskId: string, data: any): Promise<void> {
  try {
    await db.execute('DELETE FROM task_canvas_media WHERE task_id = ?', [taskId]);
    if (data && data.canvasImages && Array.isArray(data.canvasImages)) {
      const mediaIds = new Set<string>();
      for (const img of data.canvasImages) {
        if (img && typeof img.mediaId === 'string') {
          mediaIds.add(img.mediaId);
        }
      }
      for (const mediaId of mediaIds) {
        await db.execute(
          'INSERT OR IGNORE INTO task_canvas_media (task_id, media_id) VALUES (?, ?)',
          [taskId, mediaId]
        );
      }
    }
  } catch (err) {
    console.error(`Failed to update task_canvas_media for task ${taskId}:`, err);
  }
}

export async function migrateCanvasMediaReferences(db: Database): Promise<void> {
  try {
    console.log('Migrating canvas media references to task_canvas_media table...');
    const tasks = await db.select('SELECT id FROM tasks') as Array<{ id: string }>;
    for (const task of tasks) {
      const solution = await loadTaskSolutionFromDisk(task.id);
      if (solution.canvasData && solution.canvasData.canvasImages) {
        const images = solution.canvasData.canvasImages;
        if (Array.isArray(images)) {
          const mediaIds = new Set<string>();
          for (const img of images) {
            if (img && typeof img.mediaId === 'string') {
              mediaIds.add(img.mediaId);
            }
          }
          for (const mediaId of mediaIds) {
            await db.execute(
              'INSERT OR IGNORE INTO task_canvas_media (task_id, media_id) VALUES (?, ?)',
              [task.id, mediaId]
            );
          }
        }
      }
    }
    console.log('Canvas media references migration completed.');
  } catch (err) {
    console.error('Failed to migrate canvas media references:', err);
  }
}

// ── Custom Backgrounds ──

export async function getCustomBackgrounds(db: Database): Promise<CustomBackground[]> {
  const rows: any[] = await db.select('SELECT id, name, relative_path, icon FROM custom_backgrounds');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    mediaId: r.relative_path || '',
    iconMediaId: r.icon || null,
    icon: r.icon || null
  }));
}

export async function insertCustomBackground(db: Database, bg: CustomBackground): Promise<void> {
  await db.execute(
    'INSERT INTO custom_backgrounds (id, name, relative_path, icon) VALUES (?, ?, ?, ?)',
    [bg.id, bg.name, bg.mediaId, bg.iconMediaId || null]
  );
}

export async function deleteCustomBackground(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM custom_backgrounds WHERE id = ?', [id]);
}

// ── Bulk load ──

// ── Statistics Logs ──

export async function getRequestLogs(db: Database): Promise<RequestLog[]> {
  try {
    const rows: any[] = await db.select(
      'SELECT id, timestamp, provider, model, input_tokens, output_tokens, reasoning_tokens, cost FROM api_request_logs ORDER BY timestamp ASC'
    );
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      provider: r.provider,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      reasoningTokens: r.reasoning_tokens,
      cost: r.cost
    }));
  } catch (err) {
    console.error('Failed to load request logs from DB:', err);
    return [];
  }
}

export async function insertRequestLog(db: Database, log: RequestLog): Promise<void> {
  await db.execute(
    `INSERT INTO api_request_logs (id, timestamp, provider, model, input_tokens, output_tokens, reasoning_tokens, cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      log.id,
      log.timestamp,
      log.provider,
      log.model,
      log.inputTokens,
      log.outputTokens,
      log.reasoningTokens,
      log.cost
    ]
  );
}

export async function clearRequestLogs(db: Database): Promise<void> {
  await db.execute('DELETE FROM api_request_logs');
}

// ── Bulk load ──

export interface AllData {
  profiles: Profile[];
  settings: Settings | null;
  projects: Project[];
  tasks: Task[];
  backgrounds: CustomBackground[];
  requestLogs: RequestLog[];
}

export async function loadAllData(db: Database): Promise<AllData> {
  const [profiles, settings, projects, tasks, backgrounds, requestLogs] = await Promise.all([
    getProfiles(db),
    getSettings(db),
    getProjects(db),
    getTasks(db),
    getCustomBackgrounds(db),
    getRequestLogs(db)
  ]);

  for (const project of projects) {
    project.tasks = tasks.filter(t => t.projectId === project.id);
  }

  return { profiles, settings, projects, tasks, backgrounds, requestLogs };
}

// ── Task Attempts ──

export async function getAttemptsForTask(db: Database, taskId: string): Promise<TaskAttempt[]> {
  try {
    const rows: any[] = await db.select(
      'SELECT id, task_id, name, timestamp, critique_json, editor_text, multiple_choice_answers_json FROM task_attempts WHERE task_id = ? ORDER BY timestamp ASC',
      [taskId]
    );
    return rows.map(r => ({
      id: r.id,
      taskId: r.task_id,
      name: r.name,
      timestamp: r.timestamp,
      canvasData: null, // Loaded on-demand
      editorText: r.editor_text || '',
      critique: r.critique_json ? JSON.parse(r.critique_json) : null,
      multipleChoiceAnswers: r.multiple_choice_answers_json ? JSON.parse(r.multiple_choice_answers_json) : {}
    }));
  } catch (err) {
    console.error('Failed to load attempts from DB:', err);
    return [];
  }
}

export async function insertAttempt(db: Database, attempt: TaskAttempt): Promise<void> {
  await saveAttemptToDisk(attempt.id, attempt);
  await db.execute(
    'INSERT INTO task_attempts (id, task_id, name, timestamp, critique_json, canvas_data_json, editor_text, multiple_choice_answers_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      attempt.id,
      attempt.taskId,
      attempt.name,
      attempt.timestamp,
      attempt.critique ? JSON.stringify(attempt.critique) : null,
      null, // canvas_data_json column is kept NULL in database
      attempt.editorText,
      attempt.multipleChoiceAnswers ? JSON.stringify(attempt.multipleChoiceAnswers) : '{}'
    ]
  );
}

export async function updateAttempt(db: Database, id: string, updates: Partial<TaskAttempt>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.timestamp !== undefined) { fields.push('timestamp = ?'); values.push(updates.timestamp); }
  if (updates.critique !== undefined) { fields.push('critique_json = ?'); values.push(updates.critique ? JSON.stringify(updates.critique) : null); }
  if (updates.canvasData !== undefined) {
    fields.push('canvas_data_json = ?');
    values.push(null);
  }
  if (updates.editorText !== undefined) { fields.push('editor_text = ?'); values.push(updates.editorText); }
  if (updates.multipleChoiceAnswers !== undefined) { fields.push('multiple_choice_answers_json = ?'); values.push(JSON.stringify(updates.multipleChoiceAnswers)); }

  if (fields.length > 0) {
    values.push(id);
    await db.execute(`UPDATE task_attempts SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  await saveAttemptToDisk(id, updates);
}

export async function deleteAttempt(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM task_attempts WHERE id = ?', [id]);
  await deleteAttemptCanvasDataFile(id);
}

export async function loadAllCanvasMetadata(): Promise<Record<string, string>> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile, readDir, stat, writeFile } = await import('@tauri-apps/plugin-fs');
    const metadataPath = await join(canvasDataDir, 'canvas_metadata.json');
    
    if (await exists(metadataPath)) {
      try {
        const raw = await readFile(metadataPath);
        return JSON.parse(new TextDecoder().decode(raw));
      } catch (_) {}
    }
    
    // Lazy migration: scan existing task canvas files
    console.log('Building canvas_metadata.json by scanning local files...');
    const metadata: Record<string, string> = {};
    if (await exists(canvasDataDir)) {
      const entries = await readDir(canvasDataDir);
      for (const entry of entries) {
        if (entry.isFile && entry.name.endsWith('.json') && entry.name !== 'canvas_metadata.json') {
          const taskId = entry.name.substring(0, entry.name.length - 5);
          const filePath = await join(canvasDataDir, entry.name);
          
          let updatedAt: string | null = null;
          try {
            const raw = await readFile(filePath);
            const parsed = JSON.parse(new TextDecoder().decode(raw));
            updatedAt = parsed.updatedAt || null;
          } catch (_) {}
          
          if (!updatedAt) {
            try {
              const info = await stat(filePath);
              updatedAt = info.mtime ? new Date(info.mtime).toISOString() : new Date().toISOString();
            } catch (_) {
              updatedAt = new Date().toISOString();
            }
          }
          metadata[taskId] = updatedAt;
        }
      }
      
      await writeFile(metadataPath, new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
    }
    return metadata;
  } catch (err) {
    console.error('Failed to load canvas metadata:', err);
    return {};
  }
}

export async function updateLocalCanvasMetadata(taskId: string, updatedAt: string): Promise<void> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const metadataPath = await join(canvasDataDir, 'canvas_metadata.json');
    let metadata: Record<string, string> = {};
    if (await exists(metadataPath)) {
      try {
        const raw = await readFile(metadataPath);
        metadata = JSON.parse(new TextDecoder().decode(raw));
      } catch (_) {}
    }
    metadata[taskId] = updatedAt;
    await writeFile(metadataPath, new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
  } catch (err) {
    console.error('Failed to update canvas metadata:', err);
  }
}

export async function removeLocalCanvasMetadata(taskId: string): Promise<void> {
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readFile, writeFile } = await import('@tauri-apps/plugin-fs');
    const metadataPath = await join(canvasDataDir, 'canvas_metadata.json');
    if (await exists(metadataPath)) {
      let metadata: Record<string, string> = {};
      try {
        const raw = await readFile(metadataPath);
        metadata = JSON.parse(new TextDecoder().decode(raw));
      } catch (_) {}
      if (metadata[taskId]) {
        delete metadata[taskId];
        await writeFile(metadataPath, new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
      }
    }
  } catch (err) {
    console.error('Failed to remove canvas metadata:', err);
  }
}

export async function syncAttemptsTableWithFiles(db: Database): Promise<void> {
  console.log('Self-healing task_attempts table from local disk files...');
  try {
    const canvasDataDir = await getCanvasDataDir();
    const { join } = await import('@tauri-apps/api/path');
    const { exists, readDir, rename, remove } = await import('@tauri-apps/plugin-fs');

    if (!(await exists(canvasDataDir))) {
      return;
    }

    const entries = await readDir(canvasDataDir);
    
    // First, run a quick pass to rename any double-prefixed legacy files
    for (const entry of entries) {
      if (entry.isFile && entry.name && entry.name.startsWith('attempt_attempt_') && entry.name.endsWith('.json')) {
        try {
          const oldPath = await join(canvasDataDir, entry.name);
          const newName = entry.name.substring(8); // remove first 'attempt_'
          const newPath = await join(canvasDataDir, newName);
          if (!(await exists(newPath))) {
            await rename(oldPath, newPath);
            console.log(`Migrated double-prefixed file: ${entry.name} -> ${newName}`);
          } else {
            await remove(oldPath);
          }
        } catch (err) {
          console.error(`Failed to migrate double-prefixed file ${entry.name}:`, err);
        }
      }
    }

    // Refresh entries list after renaming
    const updatedEntries = await readDir(canvasDataDir);
    const attemptFiles = updatedEntries.filter(e => e.isFile && e.name.startsWith('attempt_') && e.name.endsWith('.json'));

    for (const file of attemptFiles) {
      const attemptId = file.name.substring(0, file.name.length - 5); // strip '.json'
      try {
        const attempt = await loadAttemptFromDisk(attemptId);
        if (!attempt) continue;

        // Check if task exists first (foreign key constraint)
        const tasks = await db.select('SELECT id FROM tasks WHERE id = ?', [attempt.taskId]) as any[];
        if (tasks.length === 0) {
          console.warn(`Attempt ${attemptId} has task_id ${attempt.taskId} but task does not exist. Skipping database sync for it.`);
          continue;
        }

        // Check if attempt exists in DB
        const dbAttempts = await db.select('SELECT id, timestamp FROM task_attempts WHERE id = ?', [attemptId]) as Array<{ id: string; timestamp: string }>;
        
        if (dbAttempts.length === 0) {
          console.log(`Self-healing: Inserting missing attempt ${attemptId} into DB.`);
          await db.execute(
            'INSERT INTO task_attempts (id, task_id, name, timestamp, critique_json, canvas_data_json, editor_text, multiple_choice_answers_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              attempt.id,
              attempt.taskId,
              attempt.name,
              attempt.timestamp,
              attempt.critique ? JSON.stringify(attempt.critique) : null,
              null,
              attempt.editorText,
              attempt.multipleChoiceAnswers ? JSON.stringify(attempt.multipleChoiceAnswers) : '{}'
            ]
          );
        } else {
          // Compare timestamps
          const dbTime = new Date(dbAttempts[0].timestamp).getTime();
          const fileTime = new Date(attempt.timestamp).getTime();

          if (fileTime > dbTime) {
            console.log(`Self-healing: Updating attempt ${attemptId} in DB (file is newer: ${attempt.timestamp} > ${dbAttempts[0].timestamp}).`);
            await db.execute(
              'UPDATE task_attempts SET name = ?, timestamp = ?, critique_json = ?, editor_text = ?, multiple_choice_answers_json = ? WHERE id = ?',
              [
                attempt.name,
                attempt.timestamp,
                attempt.critique ? JSON.stringify(attempt.critique) : null,
                attempt.editorText,
                attempt.multipleChoiceAnswers ? JSON.stringify(attempt.multipleChoiceAnswers) : '{}',
                attemptId
              ]
            );
          } else if (dbTime > fileTime) {
            console.log(`Self-healing: Updating attempt file ${attemptId} on disk (DB is newer: ${dbAttempts[0].timestamp} > ${attempt.timestamp}).`);
            // Query full attempt from DB to write it back
            const fullDbRow = await db.select('SELECT id, task_id, name, timestamp, critique_json, editor_text, multiple_choice_answers_json FROM task_attempts WHERE id = ?', [attemptId]) as any[];
            if (fullDbRow.length > 0) {
              const r = fullDbRow[0];
              await saveAttemptToDisk(attemptId, {
                id: r.id,
                taskId: r.task_id,
                name: r.name,
                timestamp: r.timestamp,
                critique: r.critique_json ? JSON.parse(r.critique_json) : null,
                editorText: r.editor_text || '',
                multipleChoiceAnswers: r.multiple_choice_answers_json ? JSON.parse(r.multiple_choice_answers_json) : {},
                updatedAt: r.timestamp // Preserve database timestamp in the file
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to self-heal attempt ${attemptId}:`, err);
      }
    }

    // Now, clean up task.active_attempt_id if it's pointing to a non-existent attempt or is null when attempts exist
    const allTasks = await db.select('SELECT id, active_attempt_id FROM tasks') as Array<{ id: string; active_attempt_id: string | null }>;
    for (const t of allTasks) {
      const dbAttempts = await db.select('SELECT id FROM task_attempts WHERE task_id = ? ORDER BY timestamp DESC', [t.id]) as Array<{ id: string }>;
      if (dbAttempts.length > 0) {
        const attemptIds = dbAttempts.map(a => a.id);
        if (!t.active_attempt_id || !attemptIds.includes(t.active_attempt_id)) {
          // Set to the latest attempt
          const latestAttemptId = attemptIds[0];
          console.log(`Self-healing: Setting active_attempt_id for task ${t.id} to latest attempt ${latestAttemptId}`);
          await db.execute('UPDATE tasks SET active_attempt_id = ? WHERE id = ?', [latestAttemptId, t.id]);
        }
      }
    }

  } catch (err) {
    console.error('Failed in syncAttemptsTableWithFiles:', err);
  }
}
