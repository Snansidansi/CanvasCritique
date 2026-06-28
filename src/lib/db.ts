import Database from '@tauri-apps/plugin-sql';
import type { Profile, Settings, Project, Task, CustomBackground, ProjectSettingsOverride } from './state/types';
import { defaultSettings, defaultProjects } from './state/defaults';
import { encrypt, decrypt } from './db/crypto';

let dbInstance: Database | null = null;

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  const db = await Database.load('sqlite:canvascritique.db');
  dbInstance = db;

  await db.execute('PRAGMA foreign_keys = ON');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT NOT NULL DEFAULT '#3b82f6'
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data_json TEXT NOT NULL
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
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS custom_backgrounds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      icon TEXT
    )
  `);

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

  return db;
}

export function getDb(): Database {
  if (!dbInstance) throw new Error('Database not initialized. Call initDb() first.');
  return dbInstance;
}

// ── Profiles ──

export async function getProfiles(db: Database): Promise<Profile[]> {
  const rows: any[] = await db.select('SELECT id, name, icon, color FROM profiles');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    icon: r.icon || null,
    color: r.color || '#3b82f6'
  }));
}

export async function insertProfile(db: Database, profile: Profile): Promise<void> {
  await db.execute(
    'INSERT INTO profiles (id, name, icon, color) VALUES (?, ?, ?, ?)',
    [profile.id, profile.name, profile.icon || null, profile.color || '#3b82f6']
  );
}

export async function updateProfile(db: Database, id: string, updates: Partial<Profile>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.icon !== undefined) { fields.push('icon = ?'); values.push(updates.icon); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
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
  const settings: Settings = JSON.parse(rows[0].data_json);
  if (settings.geminiApiKey) {
    try { settings.geminiApiKey = await decrypt(settings.geminiApiKey); } catch (_) {}
  }
  if (settings.openRouterApiKey) {
    try { settings.openRouterApiKey = await decrypt(settings.openRouterApiKey); } catch (_) {}
  }
  return { ...defaultSettings, ...settings };
}

export async function saveSettings(db: Database, settings: Settings): Promise<void> {
  const toSave = { ...settings };
  if (toSave.geminiApiKey) {
    toSave.geminiApiKey = await encrypt(toSave.geminiApiKey);
  }
  if (toSave.openRouterApiKey) {
    toSave.openRouterApiKey = await encrypt(toSave.openRouterApiKey);
  }
  const json = JSON.stringify(toSave);
  await db.execute(
    'INSERT OR REPLACE INTO settings (id, data_json) VALUES (1, ?)',
    [json]
  );
}

// ── Projects ──

export async function getProjects(db: Database): Promise<Project[]> {
  const rows: any[] = await db.select(
    'SELECT id, name, icon_media_path, guidelines, categories_json, profile_id, hide_completed, settings_override_json FROM projects'
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
      hideCompleted: !!r.hide_completed
    };
    if (r.settings_override_json) {
      try { project.settingsOverride = JSON.parse(r.settings_override_json); } catch (_) {}
    }
    return project;
  });
}

export async function insertProject(db: Database, project: Project): Promise<void> {
  await db.execute(
    `INSERT INTO projects (id, name, icon_media_path, guidelines, categories_json, profile_id, hide_completed, settings_override_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.name,
      project.icon && project.icon.startsWith('data:') ? null : project.icon,
      project.guidelines || '',
      JSON.stringify(project.categories || []),
      project.profileId,
      project.hideCompleted ? 1 : 0,
      project.settingsOverride ? JSON.stringify(project.settingsOverride) : null
    ]
  );
}

export async function updateProject(db: Database, id: string, updates: { name?: string; icon?: string; icon_media_path?: string; guidelines?: string; categories?: string[]; hideCompleted?: boolean; settingsOverride?: ProjectSettingsOverride }): Promise<void> {
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
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteProject(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM projects WHERE id = ?', [id]);
}

// ── Tasks ──

export async function getTasks(db: Database): Promise<Task[]> {
  const rows: any[] = await db.select(
    'SELECT id, name, completed, instructions, solution, category, instruction_files_json, solution_files_json, critique_json, canvas_data_json, project_id FROM tasks'
  );
  return rows.map(r => {
    const task: Task = {
      id: r.id,
      name: r.name,
      completed: !!r.completed,
      instructions: r.instructions || '',
      solution: r.solution || '',
      category: r.category || 'Basics',
      instructionFiles: JSON.parse(r.instruction_files_json || '[]'),
      solutionFiles: JSON.parse(r.solution_files_json || '[]'),
      projectId: r.project_id
    };
    if (r.critique_json) {
      try { task.critique = JSON.parse(r.critique_json); } catch (_) {}
    }
    if (r.canvas_data_json) {
      try { (task as any).canvasData = JSON.parse(r.canvas_data_json); } catch (_) {}
    }
    return task;
  });
}

export async function insertTask(db: Database, task: Task, projectId: string): Promise<void> {
  const canvasData = (task as any).canvasData;
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
      canvasData ? JSON.stringify(canvasData) : null,
      projectId
    ]
  );
}

export async function updateTask(db: Database, id: string, updates: Partial<any>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.completed !== undefined) { fields.push('completed = ?'); values.push(updates.completed ? 1 : 0); }
  if (updates.instructions !== undefined) { fields.push('instructions = ?'); values.push(updates.instructions); }
  if (updates.solution !== undefined) { fields.push('solution = ?'); values.push(updates.solution); }
  if (updates.category !== undefined) { fields.push('category = ?'); values.push(updates.category); }
  if (updates.instructionFiles !== undefined) { fields.push('instruction_files_json = ?'); values.push(JSON.stringify(updates.instructionFiles)); }
  if (updates.solutionFiles !== undefined) { fields.push('solution_files_json = ?'); values.push(JSON.stringify(updates.solutionFiles)); }
  if (updates.critique !== undefined) { fields.push('critique_json = ?'); values.push(updates.critique ? JSON.stringify(updates.critique) : null); }
  if (updates.canvasData !== undefined) { fields.push('canvas_data_json = ?'); values.push(updates.canvasData ? JSON.stringify(updates.canvasData) : null); }
  if (updates.projectId !== undefined) { fields.push('project_id = ?'); values.push(updates.projectId); }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTask(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
}

export async function deleteTasks(db: Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.execute(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
}

// ── Canvas State ──

export async function getCanvasState(db: Database, taskId: string): Promise<any> {
  const rows: any[] = await db.select('SELECT canvas_data_json FROM tasks WHERE id = ?', [taskId]);
  if (rows.length === 0 || !rows[0].canvas_data_json) return null;
  return JSON.parse(rows[0].canvas_data_json);
}

export async function setCanvasState(db: Database, taskId: string, data: any): Promise<void> {
  await db.execute('UPDATE tasks SET canvas_data_json = ? WHERE id = ?', [
    data ? JSON.stringify(data) : null,
    taskId
  ]);
}

// ── Custom Backgrounds ──

export async function getCustomBackgrounds(db: Database): Promise<CustomBackground[]> {
  const rows: any[] = await db.select('SELECT id, name, relative_path, icon FROM custom_backgrounds');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    relativePath: r.relative_path,
    icon: r.icon || null
  }));
}

export async function insertCustomBackground(db: Database, bg: CustomBackground): Promise<void> {
  await db.execute(
    'INSERT INTO custom_backgrounds (id, name, relative_path, icon) VALUES (?, ?, ?, ?)',
    [bg.id, bg.name, bg.relativePath, bg.icon || null]
  );
}

export async function deleteCustomBackground(db: Database, id: string): Promise<void> {
  await db.execute('DELETE FROM custom_backgrounds WHERE id = ?', [id]);
}

// ── Bulk load ──

export interface AllData {
  profiles: Profile[];
  settings: Settings | null;
  projects: Project[];
  tasks: Task[];
  backgrounds: CustomBackground[];
}

export async function loadAllData(db: Database): Promise<AllData> {
  const [profiles, settings, projects, tasks, backgrounds] = await Promise.all([
    getProfiles(db),
    getSettings(db),
    getProjects(db),
    getTasks(db),
    getCustomBackgrounds(db)
  ]);

  for (const project of projects) {
    project.tasks = tasks.filter(t => (t as any).projectId === project.id);
    delete (project as any).projectId;
  }

  for (const task of tasks) {
    delete (task as any).projectId;
  }

  return { profiles, settings, projects, tasks, backgrounds };
}
