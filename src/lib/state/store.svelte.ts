// Svelte 5 Store for CanvasCritique using Runes

import type {
  Task,
  Project,
  Settings,
  Profile,
  CustomBackground,
  ConfirmDialog,
  ExportDialog,
  ImportDialog
} from './types';

import {
  defaultProjects,
  defaultSettings
} from './defaults';

import {
  initDb,
  getDb,
  loadAllData,
  insertProfile,
  updateProfile as dbUpdateProfile,
  deleteProfile as dbDeleteProfile,
  saveSettings as dbSaveSettings,
  insertProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  insertTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  deleteTasks as dbDeleteTasks,
  setCanvasState,
  insertCustomBackground,
  deleteCustomBackground as dbDeleteCustomBackground,
} from '../db';

import { getMediaDataUrl, saveMediaToDb, migrateMediaFromFs, migrateMediaHashes, deleteMediaForTask, collectMediaIds } from '../db/media';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';

// Re-export everything from types and defaults so existing imports in other files don't break
export * from './types';
export * from './defaults';

// State classes for Svelte 5 Runes reactivity
class CanvasCritiqueStore {
  // Runes
  currentView = $state('dashboard'); // 'dashboard' | 'practice' | 'settings' | 'task-editor' | 'project-detail'
  previousView = $state('dashboard');
  projects = $state<Project[]>([]);
  activeProject = $state<Project | null>(null);
  activeTask = $state<Task | null>(null);
  editingTask = $state<Task | null>(null);
  quickAddTaskData = $state<{ name: string; category: string } | null>(null);
  pendingScrollCategory = $state<string | null>(null);
  settings = $state<Settings>(defaultSettings);
  customBackgrounds = $state<CustomBackground[]>([]);
  confirmDialog = $state<ConfirmDialog | null>(null);
  exportDialog = $state<ExportDialog | null>(null);
  importDialog = $state<ImportDialog | null>(null);
  canvasSaves = $state<Record<string, any>>({});
  editorTexts = $state<Record<string, string>>({});
  canvasSettingsOpen = $state(false);
  lastDetectedButton = $state<{ button: number; buttons: number; pointerType: string } | null>(null);
  profiles = $state<Profile[]>([]);
  activeProfileId = $state<string>('');
  notification = $state<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  private _dbReady = false;
  private _iconMediaIds: Record<string, string> = {};
  private _projectIconMediaIds: Record<string, string> = {};

  // Getters for dynamic API/Model selection
  get apiKey(): string {
    return this.settings.apiProvider === 'gemini'
      ? this.settings.geminiApiKey
      : this.settings.openRouterApiKey;
  }

  get model(): string {
    return this.settings.apiProvider === 'gemini'
      ? this.settings.geminiModel
      : this.settings.openRouterModel;
  }

  get isDbReady(): boolean {
    return this._dbReady;
  }

  generateNextTaskName(projectId: string, category?: string): string {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return '';

    const settings = this.getEffectiveSettings(projectId);
    if (!settings.autoNumberTasks) return '';

    let template = settings.taskNumberingTemplate || 'Aufgabe {n}';
    if (!template.includes('{n}')) {
      template += ' {n}';
    }

    // Escape regex special chars except {n}
    const escapedTemplate = template.replace(/[-\/\\^$*+?.()|[\]{}]/g, (ch) => {
      if (ch === '{' || ch === '}') return ch;
      return '\\' + ch;
    });

    const regexStr = '^' + escapedTemplate.replace('{n}', '(\\d+)') + '$';
    const regex = new RegExp(regexStr);

    let maxN = 0;
    const tasks = project.tasks || [];
    for (const task of tasks) {
      if (category && (task.category || 'Basics') !== category) {
        continue;
      }
      const match = task.name.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxN) {
          maxN = num;
        }
      }
    }

    return template.replace('{n}', String(maxN + 1));
  }

  isNameMatchingTemplate(name: string, projectId: string): boolean {
    const settings = this.getEffectiveSettings(projectId);
    let template = settings.taskNumberingTemplate || 'Aufgabe {n}';
    if (!template.includes('{n}')) {
      template += ' {n}';
    }

    // Escape regex special chars except {n}
    const escapedTemplate = template.replace(/[-\/\\^$*+?.()|[\]{}]/g, (ch) => {
      if (ch === '{' || ch === '}') return ch;
      return '\\' + ch;
    });

    const regexStr = '^' + escapedTemplate.replace('{n}', '(\\d+)') + '$';
    const regex = new RegExp(regexStr);
    return regex.test(name);
  }

  getEffectiveSettings(projectId: string): Settings {
    const project = this.projects.find(p => p.id === projectId);
    const globalSettings = this.settings;
    if (project && project.settingsOverride) {
      const override = project.settingsOverride;
      const isOverrideModel = override.overrideModel ?? override.overrideSettings ?? false;
      const isOverrideCanvas = override.overrideCanvas ?? override.overrideSettings ?? false;
      const isOverrideEraser = override.overrideEraser ?? override.overrideSettings ?? false;
      const isOverrideEvaluation = override.overrideEvaluation ?? override.overrideSettings ?? false;
      const isOverrideSystemPrompt = override.overrideSystemPrompt ?? override.overrideSettings ?? false;
      const isOverrideTaskNumbering = override.overrideTaskNumbering ?? override.overrideSettings ?? false;
      const isOverrideAlwaysSendBoth = override.overrideAlwaysSendBoth ?? override.overrideSettings ?? false;
      const isAnyOverride = isOverrideModel || isOverrideCanvas || isOverrideEraser || isOverrideEvaluation || isOverrideSystemPrompt || isOverrideTaskNumbering || isOverrideAlwaysSendBoth;

      return {
        ...globalSettings,
        apiProvider: isOverrideModel ? (override.apiProvider ?? globalSettings.apiProvider) : globalSettings.apiProvider,
        geminiModel: isOverrideModel ? (override.geminiModel ?? globalSettings.geminiModel) : globalSettings.geminiModel,
        openRouterModel: isOverrideModel ? (override.openRouterModel ?? globalSettings.openRouterModel) : globalSettings.openRouterModel,
        openRouterReasoning: isOverrideModel ? (override.openRouterReasoning ?? globalSettings.openRouterReasoning) : globalSettings.openRouterReasoning,
        openRouterProvider: isOverrideModel ? (override.openRouterProvider ?? globalSettings.openRouterProvider) : globalSettings.openRouterProvider,
        sendTaskMedia: isOverrideEvaluation ? (override.sendTaskMedia ?? globalSettings.sendTaskMedia) : globalSettings.sendTaskMedia,
        sendSolutionMedia: isOverrideEvaluation ? (override.sendSolutionMedia ?? globalSettings.sendSolutionMedia) : globalSettings.sendSolutionMedia,
        sendCanvasBackground: isOverrideEvaluation ? (override.sendCanvasBackground ?? globalSettings.sendCanvasBackground) : globalSettings.sendCanvasBackground,
        sendTaskText: isOverrideEvaluation ? (override.sendTaskText ?? globalSettings.sendTaskText) : globalSettings.sendTaskText,
        sendSolutionText: isOverrideEvaluation ? (override.sendSolutionText ?? globalSettings.sendSolutionText) : globalSettings.sendSolutionText,
        alwaysSendBothCanvasAndText: isOverrideAlwaysSendBoth ? (override.alwaysSendBothCanvasAndText ?? globalSettings.alwaysSendBothCanvasAndText) : globalSettings.alwaysSendBothCanvasAndText,
        customSystemPrompt: isOverrideSystemPrompt ? (override.customSystemPrompt !== undefined && override.customSystemPrompt !== null ? override.customSystemPrompt : globalSettings.customSystemPrompt) : globalSettings.customSystemPrompt,
        language: isAnyOverride ? (override.language ?? globalSettings.language) : globalSettings.language,
        canvasMode: isOverrideCanvas ? (override.canvasMode ?? globalSettings.canvasMode) : globalSettings.canvasMode,
        canvasFontSize: isOverrideCanvas ? (override.canvasFontSize ?? globalSettings.canvasFontSize) : globalSettings.canvasFontSize,
        eraserMode: isOverrideEraser ? (override.eraserMode ?? globalSettings.eraserMode) : globalSettings.eraserMode,
        eraserRadiusNormal: isOverrideEraser ? (override.eraserRadiusNormal ?? globalSettings.eraserRadiusNormal) : globalSettings.eraserRadiusNormal,
        eraserRadiusStroke: isOverrideEraser ? (override.eraserRadiusStroke ?? globalSettings.eraserRadiusStroke) : globalSettings.eraserRadiusStroke,
        autoNumberTasks: isOverrideTaskNumbering ? (override.autoNumberTasks ?? globalSettings.autoNumberTasks) : globalSettings.autoNumberTasks,
        taskNumberingTemplate: isOverrideTaskNumbering ? (override.taskNumberingTemplate ?? globalSettings.taskNumberingTemplate) : globalSettings.taskNumberingTemplate
      };
    }
    return globalSettings;
  }

  // DB init — call before using store
  async init() {
    const db = await initDb();
    await migrateMediaFromFs();
    await migrateMediaHashes();
    await this.loadState(db);
    this._dbReady = true;
  }

  private getDb() {
    return getDb();
  }

  async loadState(db?: ReturnType<typeof getDb>) {
    const database = db || this.getDb();

    try {
      // Load all data from DB
      const data = await loadAllData(database);

      if (data.profiles.length > 0) {
        this.profiles = data.profiles;
        // Resolve profile icons from mediaId to dataUrl for UI
        for (const p of this.profiles) {
          if (p.icon && !p.icon.startsWith('data:') && /^[a-f0-9-]{36}$/i.test(p.icon)) {
            this._iconMediaIds[p.id] = p.icon;
            try {
              const url = await getMediaDataUrl(p.icon);
              p.icon = url;
            } catch (_) {}
          }
        }
      }

      // Restore active profile
      const savedActiveProfileId = localStorage.getItem('canvascritique_active_profile_id');
      if (savedActiveProfileId && this.profiles.some(p => p.id === savedActiveProfileId)) {
        this.activeProfileId = savedActiveProfileId;
      } else {
        this.activeProfileId = this.profiles[0]?.id || 'default-profile';
      }

      if (data.settings) {
        this.settings = data.settings;
      } else {
        this.settings = defaultSettings;
        await dbSaveSettings(database, this.settings);
      }

      // Normalize settings
      if (!this.settings.statsEnabled) {
        this.settings.statsEnabled = true;
      }
      if (!this.settings.stats) {
        this.settings.stats = { daily: {} };
      }
      if (!this.settings.stats.daily) {
        this.settings.stats.daily = {};
      }
      if (!this.settings.stylusButtons || !Array.isArray(this.settings.stylusButtons)) {
        this.settings.stylusButtons = [];
      }
      if (!this.settings.recentColors || !Array.isArray(this.settings.recentColors)) {
        this.settings.recentColors = defaultSettings.recentColors;
      }
      if (!this.settings.penSize) {
        this.settings.penSize = defaultSettings.penSize;
      }
      if (this.settings.openRouterProvider && typeof this.settings.openRouterProvider === 'string') {
        this.settings.openRouterProvider = [this.settings.openRouterProvider];
      } else if (!this.settings.openRouterProvider) {
        this.settings.openRouterProvider = [];
      }
      if (typeof this.settings.geminiInputCostPerMillion !== 'number' || isNaN(this.settings.geminiInputCostPerMillion) || this.settings.geminiInputCostPerMillion <= 0) {
        this.settings.geminiInputCostPerMillion = 0.075;
      }
      if (typeof this.settings.geminiOutputCostPerMillion !== 'number' || isNaN(this.settings.geminiOutputCostPerMillion) || this.settings.geminiOutputCostPerMillion <= 0) {
        this.settings.geminiOutputCostPerMillion = 0.30;
      }
      if (!this.settings.canvasFontSize || typeof this.settings.canvasFontSize !== 'number') {
        this.settings.canvasFontSize = 13;
      }
      if (!this.settings.editorFontSize || typeof this.settings.editorFontSize !== 'number') {
        this.settings.editorFontSize = 16;
      }
      if (!this.settings.eraserMode || (this.settings.eraserMode !== 'normal' && this.settings.eraserMode !== 'stroke')) {
        this.settings.eraserMode = 'normal';
      }
      if (!this.settings.eraserRadiusNormal || typeof this.settings.eraserRadiusNormal !== 'number') {
        this.settings.eraserRadiusNormal = 24;
      }
      if (!this.settings.eraserRadiusStroke || typeof this.settings.eraserRadiusStroke !== 'number') {
        this.settings.eraserRadiusStroke = 24;
      }
      if (!this.settings.penRecentColors || !Array.isArray(this.settings.penRecentColors)) {
        this.settings.penRecentColors = ['#000000', '#1d4ed8', '#dc2626', '#059669'];
      }
      if (!this.settings.penBrushWidth || typeof this.settings.penBrushWidth !== 'number') {
        this.settings.penBrushWidth = 2;
      }
      if (!this.settings.penEraserWidth || typeof this.settings.penEraserWidth !== 'number') {
        this.settings.penEraserWidth = 24;
      }

      if (data.projects.length > 0) {
        this.projects = data.projects;
        // Resolve project icons from mediaId to dataUrl
        for (const p of this.projects) {
          if (p.icon && !p.icon.startsWith('data:') && /^[a-f0-9-]{36}$/i.test(p.icon)) {
            this._projectIconMediaIds[p.id] = p.icon;
            try {
              const url = await getMediaDataUrl(p.icon);
              p.icon = url;
            } catch (_) {}
          }
        }
        // Ensure all projects have profileId set
        for (const p of this.projects) {
          if (!p.profileId) {
            p.profileId = 'default-profile';
          }
        }
      }

      this.customBackgrounds = data.backgrounds;

      // Build canvas and editor saves from tasks
      this.canvasSaves = {};
      this.editorTexts = {};
      for (const project of this.projects) {
        for (const task of (project.tasks || [])) {
          const canvasData = (task as any).canvasData;
          if (canvasData) {
            this.canvasSaves[task.id] = canvasData;
            delete (task as any).canvasData;
          }
          if (task.editorText) {
            this.editorTexts[task.id] = task.editorText;
          }
        }
      }

      this.applyTheme(this.settings.theme);
    } catch (e) {
      console.error('Error loading state from DB', e);
      this.profiles = [{ id: 'default-profile', name: 'General', icon: null, color: '#3b82f6' }];
      this.activeProfileId = 'default-profile';
      this.settings = defaultSettings;
      this.projects = defaultProjects;
      this.customBackgrounds = [];
      this.canvasSaves = {};
    }
  }

  // ── Persist calls ──

  async saveProjects() {
    const db = this.getDb();
    for (const project of this.projects) {
      // Convert dataUrl icon back to mediaId for storage
      let icon = project.icon;
      if (icon && icon.startsWith('data:')) {
        if (this._projectIconMediaIds[project.id]) {
          icon = this._projectIconMediaIds[project.id];
        } else {
          try {
            const mediaId = await saveMediaToDb(icon);
            this._projectIconMediaIds[project.id] = mediaId;
            icon = mediaId;
          } catch (_) {}
        }
      }
      // Upsert project metadata
      const existing: any[] = await db.select('SELECT id FROM projects WHERE id = ?', [project.id]);
      if (existing.length > 0) {
        await dbUpdateProject(db, project.id, {
          name: project.name,
          icon: icon,
          guidelines: project.guidelines,
          categories: project.categories,
          hideCompleted: project.hideCompleted,
          settingsOverride: project.settingsOverride,
          default_background: project.default_background
        });
      } else {
        const projToInsert = { ...project, icon: icon };
        await insertProject(db, projToInsert);
      }
      // Sync tasks
      for (const task of (project.tasks || [])) {
        const existingTask: any[] = await db.select('SELECT id FROM tasks WHERE id = ?', [task.id]);
        if (existingTask.length > 0) {
          await dbUpdateTask(db, task.id, {
            name: task.name,
            completed: task.completed,
            instructions: task.instructions,
            solution: task.solution,
            category: task.category,
            instructionFiles: this.stripDataUrls(task.instructionFiles || []),
            solutionFiles: this.stripDataUrls(task.solutionFiles || []),
            critique: task.critique || null,
            canvasData: this.canvasSaves[task.id] || null,
            background: task.background || null
          });
        } else {
          const t = { ...task, canvasData: this.canvasSaves[task.id] || null };
          await insertTask(db, t, project.id);
        }
      }
    }
  }

  async saveSettings() {
    const db = this.getDb();
    await dbSaveSettings(db, this.settings);
    this.applyTheme(this.settings.theme);
  }

  async saveProfiles() {
    const db = this.getDb();
    for (const profile of this.profiles) {
      // Convert dataUrl icon back to mediaId for storage
      if (profile.icon && profile.icon.startsWith('data:')) {
        if (this._iconMediaIds[profile.id]) {
          profile.icon = this._iconMediaIds[profile.id];
        } else {
          try {
            const mediaId = await saveMediaToDb(profile.icon);
            this._iconMediaIds[profile.id] = mediaId;
            profile.icon = mediaId;
          } catch (_) {}
        }
      }
      const existing: any[] = await db.select('SELECT id FROM profiles WHERE id = ?', [profile.id]);
      if (existing.length > 0) {
        await dbUpdateProfile(db, profile.id, profile);
      } else {
        await insertProfile(db, profile);
      }
    }
    localStorage.setItem('canvascritique_active_profile_id', this.activeProfileId);
  }

  async addProfile(name: string, icon: string | null = null, color: string = '#3b82f6') {
    const newProfile: Profile = {
      id: 'profile-' + Date.now(),
      name,
      icon,
      color
    };
    this.profiles.push(newProfile);
    await this.saveProfiles();
    return newProfile;
  }

  async updateProfile(id: string, updated: { name?: string; icon?: string | null; color?: string }) {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    if (updated.name !== undefined) profile.name = updated.name;
    if (updated.icon !== undefined) profile.icon = updated.icon;
    if (updated.color !== undefined) profile.color = updated.color;
    await this.saveProfiles();
  }

  async deleteProfile(id: string) {
    if (this.profiles.length <= 1) return;

    // Remove projects for this profile
    const db = this.getDb();
    this.projects = this.projects.filter(p => p.profileId !== id);
    await dbDeleteProfile(db, id);
    await this.saveProjects();

    // Remove profile
    this.profiles = this.profiles.filter(p => p.id !== id);

    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0].id;
    }

    await this.saveProfiles();
  }

  async selectProfile(id: string) {
    if (this.profiles.some(p => p.id === id)) {
      this.activeProfileId = id;
      await this.saveProfiles();
    }
  }

  async saveCustomBackgrounds() {
    const db = this.getDb();
    // Delete all existing and re-insert (simplest approach)
    await db.execute('DELETE FROM custom_backgrounds');
    for (const bg of this.customBackgrounds) {
      await insertCustomBackground(db, bg);
    }
  }

  async addCustomBackground(name: string, dataUrl: string, iconDataUrl: string | null = null): Promise<CustomBackground> {
    const mediaId = await saveMediaToDb(dataUrl);
    let iconMediaId: string | null = null;
    let icon: string | null = null;
    if (iconDataUrl && iconDataUrl !== dataUrl) {
      iconMediaId = await saveMediaToDb(iconDataUrl);
      icon = iconMediaId;
    } else if (iconDataUrl === dataUrl) {
      iconMediaId = mediaId;
      icon = mediaId;
    }

    const newBg: CustomBackground = {
      id: 'custom-bg-' + Date.now(),
      name,
      mediaId,
      iconMediaId,
      icon
    };
    this.customBackgrounds.push(newBg);
    await this.saveCustomBackgrounds();
    return newBg;
  }

  async deleteCustomBackground(id: string): Promise<void> {
    this.customBackgrounds = this.customBackgrounds.filter(bg => bg.id !== id);
    const db = this.getDb();
    await dbDeleteCustomBackground(db, id);
  }

  recordPointerEvent(e: PointerEvent): void {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      this.lastDetectedButton = {
        button: e.button,
        buttons: e.buttons,
        pointerType: e.pointerType
      };
    }
  }

  applyTheme(theme: string): void {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      // System
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
    }
  }

  // Navigation actions
  setView(view: string): void {
    if (this.currentView !== 'settings' && view === 'settings') {
      this.previousView = this.currentView;
    } else if (view !== 'settings' && this.currentView !== 'settings') {
      this.previousView = this.currentView;
    }
    if (this.currentView === 'task-editor' && view !== 'task-editor') {
      this.editingTask = null;
    }
    this.currentView = view;
  }

  selectProject(project: Project | null): void {
    this.activeProject = project;
  }

  selectTask(task: Task | null): void {
    this.activeTask = task;
    this.setView('practice');
  }

  setEditingTask(task: Task | null): void {
    this.editingTask = task;
    this.setView('task-editor');
  }

  // Mutation actions
  async addProject(name: string, icon: string = 'history_edu'): Promise<Project> {
    const newProj: Project = {
      id: 'proj-' + Date.now(),
      name,
      icon,
      guidelines: '',
      categories: [],
      tasks: [],
      profileId: this.activeProfileId
    };
    this.projects.push(newProj);
    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === newProj.id) {
      this.activeProject = newProj;
    }
    return newProj;
  }

  async addCategory(projectId: string, categoryName: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    if (!project.categories) {
      project.categories = [];
    }

    if (!project.categories.includes(categoryName)) {
      project.categories.push(categoryName);
      await this.saveProjects();
    }

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async renameCategory(projectId: string, oldName: string, newName: string): Promise<void> {
    if (!newName || !newName.trim() || oldName === newName) return;
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    if (project.categories) {
      project.categories = project.categories.map(c => c === oldName ? newName.trim() : c);
    }

    if (project.tasks) {
      project.tasks.forEach(t => {
        if ((t.category || 'Basics') === oldName) {
          t.category = newName.trim();
        }
      });
    }

    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async deleteCategory(projectId: string, categoryName: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    if (project.categories) {
      project.categories = project.categories.filter(c => c !== categoryName);
    }

    const fallbackCategory = (project.categories && project.categories.includes('Basics'))
      ? 'Basics'
      : ((project.categories && project.categories[0]) || 'Basics');

    if (project.tasks) {
      project.tasks.forEach(t => {
        if ((t.category || 'Basics') === categoryName) {
          t.category = fallbackCategory;
        }
      });
    }

    if (project.categories && !project.categories.includes(fallbackCategory)) {
      project.categories.push(fallbackCategory);
    }

    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async addTask(
    projectId: string,
    name: string,
    instructions: string,
    solution: string,
    category: string = 'Basics',
    instructionFiles: any[] = [],
    solutionFiles: any[] = []
  ): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask: Task = {
      id: 'task-' + Date.now(),
      name,
      completed: false,
      instructions,
      solution,
      category,
      instructionFiles: this.stripDataUrls(instructionFiles),
      solutionFiles: this.stripDataUrls(solutionFiles)
    };

    project.tasks.push(newTask);

    // Auto-add category if it isn't listed
    if (project.categories && !project.categories.includes(category)) {
      project.categories.push(category);
    }

    // Insert task to DB
    const db = this.getDb();
    await insertTask(db, newTask, projectId);
    await this.saveProjects();

    // Update active project reference if it is active
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async updateTask(projectId: string, taskId: string, updatedData: Partial<Task>): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (updatedData.name !== undefined) task.name = updatedData.name;
    if (updatedData.instructions !== undefined) task.instructions = updatedData.instructions;
    if (updatedData.solution !== undefined) task.solution = updatedData.solution;
    if (updatedData.category !== undefined) task.category = updatedData.category;
    if (updatedData.instructionFiles !== undefined) task.instructionFiles = this.stripDataUrls(updatedData.instructionFiles);
    if (updatedData.solutionFiles !== undefined) task.solutionFiles = this.stripDataUrls(updatedData.solutionFiles);
    if (updatedData.instructionFile !== undefined) (task as any).instructionFile = updatedData.instructionFile;
    if (updatedData.solutionFile !== undefined) (task as any).solutionFile = updatedData.solutionFile;
    if (updatedData.completed !== undefined) task.completed = updatedData.completed;
    if (updatedData.critique !== undefined) task.critique = updatedData.critique;
    if (updatedData.background !== undefined) task.background = updatedData.background;

    // Auto-add category if it isn't listed
    if (task.category && project.categories && !project.categories.includes(task.category)) {
      project.categories.push(task.category);
    }

    // Update task in DB
    const db = this.getDb();
    await dbUpdateTask(db, taskId, {
      name: task.name,
      completed: task.completed,
      instructions: task.instructions,
      solution: task.solution,
      category: task.category,
      instructionFiles: task.instructionFiles || [],
      solutionFiles: task.solutionFiles || [],
      critique: task.critique || null,
      background: task.background || null
    });
    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = task;
    }
  }

  async updateTaskBackground(projectId: string, taskId: string, background: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (task) {
      task.background = background;
    }

    project.default_background = background;

    const db = this.getDb();
    await dbUpdateTask(db, taskId, { background });
    await dbUpdateProject(db, projectId, { default_background: background });

    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = task;
    }
  }

  async reorderTasks(projectId: string, category: string, taskIdsOrder: string[]): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const categoryTasks = project.tasks.filter(t => (t.category || 'Basics') === category);
    const otherTasks = project.tasks.filter(t => (t.category || 'Basics') !== category);

    categoryTasks.sort((a, b) => {
      const idxA = taskIdsOrder.indexOf(a.id);
      const idxB = taskIdsOrder.indexOf(b.id);
      return idxA - idxB;
    });

    project.tasks = [...otherTasks, ...categoryTasks];
    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async moveAndReorderTask(projectId: string, taskId: string, targetCategory: string, targetIndex: number): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.category = targetCategory;

    const db = this.getDb();
    await dbUpdateTask(db, taskId, { category: targetCategory });

    const otherTasks = project.tasks.filter(t => t.id !== taskId);
    const targetCategoryTasks = otherTasks.filter(t => (t.category || 'Basics') === targetCategory);
    const nonTargetCategoryTasks = otherTasks.filter(t => (t.category || 'Basics') !== targetCategory);

    targetCategoryTasks.splice(targetIndex, 0, task);

    project.tasks = [...nonTargetCategoryTasks, ...targetCategoryTasks];
    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async toggleTaskCompleted(projectId: string, taskId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;

    const db = this.getDb();
    await dbUpdateTask(db, taskId, { completed: task.completed });

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = task;
    }
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    const mediaIds: string[] = [];
    if (task) {
      mediaIds.push(...collectMediaIds(task.instructionFiles || []));
      mediaIds.push(...collectMediaIds(task.solutionFiles || []));
    }

    project.tasks = project.tasks.filter(t => t.id !== taskId);

    const db = this.getDb();
    await dbDeleteTask(db, taskId);
    if (mediaIds.length > 0) {
      await deleteMediaForTask(mediaIds);
    }

    if (this.canvasSaves[taskId]) {
      delete this.canvasSaves[taskId];
    }

    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = null;
    }
    if (this.editingTask && this.editingTask.id === taskId) {
      this.editingTask = null;
    }
  }

  async deleteTasks(projectId: string, taskIds: string[]): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const mediaIds: string[] = [];
    for (const taskId of taskIds) {
      const task = project.tasks.find(t => t.id === taskId);
      if (task) {
        mediaIds.push(...collectMediaIds(task.instructionFiles || []));
        mediaIds.push(...collectMediaIds(task.solutionFiles || []));
      }
    }

    project.tasks = project.tasks.filter(t => !taskIds.includes(t.id));

    const db = this.getDb();
    await dbDeleteTasks(db, taskIds);
    if (mediaIds.length > 0) {
      await deleteMediaForTask(mediaIds);
    }

    for (const taskId of taskIds) {
      if (this.canvasSaves[taskId]) {
        delete this.canvasSaves[taskId];
      }
    }

    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && taskIds.includes(this.activeTask.id)) {
      this.activeTask = null;
    }
    if (this.editingTask && taskIds.includes(this.editingTask.id)) {
      this.editingTask = null;
    }
  }

  async updateProjectGuidelines(projectId: string, guidelines: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    project.guidelines = guidelines;
    await this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async updateProjectDetails(projectId: string, updates: { name?: string; icon?: string }): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    if (updates.name !== undefined) project.name = updates.name;
    if (updates.icon !== undefined) project.icon = updates.icon;
    await this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    const mediaIds: string[] = [];
    if (project && project.tasks) {
      for (const t of project.tasks) {
        mediaIds.push(...collectMediaIds(t.instructionFiles || []));
        mediaIds.push(...collectMediaIds(t.solutionFiles || []));
        if (this.canvasSaves[t.id]) {
          delete this.canvasSaves[t.id];
        }
      }
    }

    const db = this.getDb();
    await dbDeleteProject(db, projectId);
    if (mediaIds.length > 0) {
      await deleteMediaForTask(mediaIds);
    }

    this.projects = this.projects.filter(p => p.id !== projectId);
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = null;
      this.activeTask = null;
      this.setView('dashboard');
    }
  }

  async reorderProjects(projectIdsOrder: string[]): Promise<void> {
    this.projects.sort((a, b) => {
      const idxA = projectIdsOrder.indexOf(a.id);
      const idxB = projectIdsOrder.indexOf(b.id);
      return idxA - idxB;
    });
    await this.saveProjects();
  }

  async reorderCategories(projectId: string, categoryOrder: string[]): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    project.categories = categoryOrder;
    await this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  confirm(title: string, message: string, onConfirm: () => void, onCancel: (() => void) | null = null): void {
    this.confirmDialog = {
      title,
      message,
      onConfirm: () => {
        onConfirm();
        this.confirmDialog = null;
      },
      onCancel: () => {
        if (onCancel) onCancel();
        this.confirmDialog = null;
      }
    };
  }

  async saveCanvasState(taskId: string, data: any): Promise<void> {
    this.canvasSaves[taskId] = data;
    const db = this.getDb();
    await setCanvasState(db, taskId, data);
  }

  getCanvasState(taskId: string): any {
    return this.canvasSaves[taskId] || null;
  }

  async saveEditorText(taskId: string, text: string): Promise<void> {
    this.editorTexts[taskId] = text;
    const db = this.getDb();
    await dbUpdateTask(db, taskId, { editorText: text });
    for (const project of this.projects) {
      const t = project.tasks?.find(task => task.id === taskId);
      if (t) {
        t.editorText = text;
        break;
      }
    }
  }

  getEditorText(taskId: string): string {
    return this.editorTexts[taskId] || '';
  }

  importProject(projectData: any, targetProjectId?: string, targetCategory?: string): void {
    const data = Array.isArray(projectData) ? projectData : [projectData];

    let hasCritique = false;
    let hasCanvas = false;
    for (const proj of data) {
      if (proj && typeof proj === 'object') {
        if (proj.canvasSaves && Object.keys(proj.canvasSaves).length > 0) {
          hasCanvas = true;
        }
        if (proj.tasks) {
          for (const task of proj.tasks) {
            if (task.critique) {
              hasCritique = true;
            }
          }
        }
      }
    }

    this.importDialog = {
      projectData,
      hasCritique,
      hasCanvas,
      targetProjectId,
      targetCategory,
      onConfirm: (options) => {
        this.executeImportProject(projectData, { ...options, targetCategory });
        this.importDialog = null;
      },
      onCancel: () => {
        this.importDialog = null;
      }
    };
  }

  private async convertImportedFiles(files: any[]): Promise<any[]> {
    const result = [];
    for (const f of files) {
      const file = { ...f };
      if (file.dataUrl && !file.mediaId) {
        try {
          file.mediaId = await saveMediaToDb(file.dataUrl);
        } catch (_) {}
      }
      result.push(file);
    }
    return result;
  }

  private stripDataUrls(files: any[]): any[] {
    return files.map(f => {
      if ('dataUrl' in f) {
        const { dataUrl, ...rest } = f;
        return rest;
      }
      return f;
    });
  }

  private async executeImportProject(
    projectData: any,
    options: {
      importCritique: boolean;
      importCanvas: boolean;
      importCompleted: boolean;
      mergeProjectId?: string;
      mergeMode?: 'update' | 'skip';
      targetCategory?: string;
    }
  ): Promise<void> {
    const data = Array.isArray(projectData) ? projectData : [projectData];
    let lastImported: Project | null = null;
    const db = this.getDb();

    const mergeProject = options.mergeProjectId
      ? this.projects.find(p => p.id === options.mergeProjectId)
      : null;

    if (mergeProject) {
      for (const proj of data) {
        if (!proj || typeof proj !== 'object') continue;

        const importedCanvasSaves = proj.canvasSaves || {};
        const importedTasks: any[] = proj.tasks || [];
        const importedCategories: string[] = proj.categories || [];
        const targetCat = options.targetCategory;
        const effectiveCategories: string[] = targetCat
          ? (importedCategories.includes(targetCat) ? importedCategories : [...importedCategories, targetCat])
          : importedCategories;

        // Walk imported sections in order
        for (const importedCat of effectiveCategories) {
          const sectionImportedTasks = targetCat
            ? importedTasks.filter((t: any) => (t.category || 'Basics') === importedCat || importedCat === targetCat)
            : importedTasks.filter((t: any) => (t.category || 'Basics') === importedCat);
          if (sectionImportedTasks.length === 0) continue;

          // Ensure target section exists
          if (!mergeProject.categories || !mergeProject.categories.includes(importedCat)) {
            if (!mergeProject.categories) mergeProject.categories = [];
            mergeProject.categories.push(importedCat);
          }

          for (const t of sectionImportedTasks) {
            if (!t.name) continue;

            const taskCategory = targetCat || importedCat;

            // Match by name within the SAME section
            const matchedTask = mergeProject.tasks.find(
              et => et.name.trim().toLowerCase() === t.name.trim().toLowerCase() && (et.category || 'Basics') === taskCategory
            );

            if (matchedTask) {
              if (options.mergeMode === 'update') {
                matchedTask.instructions = t.instructions !== undefined ? t.instructions : matchedTask.instructions;
                matchedTask.solution = t.solution !== undefined ? t.solution : matchedTask.solution;
                matchedTask.category = taskCategory;
                if (t.instructionFiles !== undefined) {
                  matchedTask.instructionFiles = this.stripDataUrls(await this.convertImportedFiles(t.instructionFiles));
                } else if (t.instructionFile) {
                  matchedTask.instructionFiles = this.stripDataUrls(await this.convertImportedFiles([t.instructionFile]));
                }
                if (t.solutionFiles !== undefined) {
                  matchedTask.solutionFiles = this.stripDataUrls(await this.convertImportedFiles(t.solutionFiles));
                } else if (t.solutionFile) {
                  matchedTask.solutionFiles = this.stripDataUrls(await this.convertImportedFiles([t.solutionFile]));
                }
                if (options.importCompleted && t.completed !== undefined) matchedTask.completed = !!t.completed;
                if (options.importCritique && t.critique !== undefined) matchedTask.critique = t.critique;

                await dbUpdateTask(db, matchedTask.id, matchedTask);
                if (options.importCanvas && t.id && importedCanvasSaves[t.id]) {
                  this.canvasSaves[matchedTask.id] = importedCanvasSaves[t.id];
                  await setCanvasState(db, matchedTask.id, importedCanvasSaves[t.id]);
                }
              }
              // skip mode: do nothing for matched tasks
            } else {
              // Task doesn't exist in this section -> always import
              let taskId = t.id;
              const isDuplicateId = taskId && this.projects.some(p => p.tasks.some(et => et.id === taskId));
              if (!taskId || isDuplicateId) {
                taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
              }

              if (options.importCanvas && t.id && importedCanvasSaves[t.id]) {
                this.canvasSaves[taskId] = importedCanvasSaves[t.id];
                await setCanvasState(db, taskId, importedCanvasSaves[t.id]);
              }

              let instructionFiles = this.stripDataUrls(await this.convertImportedFiles(t.instructionFiles || []));
              if (t.instructionFile && instructionFiles.length === 0) {
                instructionFiles = this.stripDataUrls(await this.convertImportedFiles([t.instructionFile]));
              }
              let solutionFiles = this.stripDataUrls(await this.convertImportedFiles(t.solutionFiles || []));
              if (t.solutionFile && solutionFiles.length === 0) {
                solutionFiles = this.stripDataUrls(await this.convertImportedFiles([t.solutionFile]));
              }

              const newTask: Task = {
                id: taskId,
                name: t.name,
                completed: options.importCompleted ? !!t.completed : false,
                instructions: t.instructions || '',
                solution: t.solution || '',
                category: taskCategory,
                instructionFiles,
                solutionFiles,
                editorText: t.editorText || ''
              };
              if (t.editorText) {
                this.editorTexts[taskId] = t.editorText;
              }
              if (options.importCritique && t.critique) newTask.critique = t.critique;

              mergeProject.tasks.push(newTask);
              await insertTask(db, newTask, mergeProject.id);
            }
          }
        }
      }
      await this.saveProjects();
      lastImported = mergeProject;
    } else {
      for (const proj of data) {
        if (!proj || typeof proj !== 'object' || !proj.name) continue;

        let newId = proj.id;
        if (!newId || this.projects.some(p => p.id === newId)) {
          newId = 'proj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        }

        const categories = proj.categories || [];
        const importedCanvasSaves = proj.canvasSaves || {};

        const tasks: Task[] = [];
        for (let idx = 0; idx < (proj.tasks || []).length; idx++) {
          const t = proj.tasks[idx];
          const oldTaskId = t.id;
          let taskId = t.id;
          const isDuplicateId = taskId && this.projects.some(p => p.tasks.some(existingTask => existingTask.id === taskId));
          if (!taskId || isDuplicateId) {
            taskId = 'task-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 5);
          }

          if (options.importCanvas && oldTaskId && importedCanvasSaves[oldTaskId]) {
            this.canvasSaves[taskId] = importedCanvasSaves[oldTaskId];
            await setCanvasState(db, taskId, importedCanvasSaves[oldTaskId]);
          }

          let instructionFiles = this.stripDataUrls(await this.convertImportedFiles(t.instructionFiles || []));
          if (t.instructionFile && instructionFiles.length === 0) {
            instructionFiles = this.stripDataUrls(await this.convertImportedFiles([t.instructionFile]));
          }
          let solutionFiles = this.stripDataUrls(await this.convertImportedFiles(t.solutionFiles || []));
          if (t.solutionFile && solutionFiles.length === 0) {
            solutionFiles = this.stripDataUrls(await this.convertImportedFiles([t.solutionFile]));
          }

          const taskCategory = options.targetCategory || t.category || 'Basics';

          const newTask: Task = {
            id: taskId,
            name: t.name,
            completed: options.importCompleted ? !!t.completed : false,
            instructions: t.instructions || '',
            solution: t.solution || '',
            category: taskCategory,
            instructionFiles,
            solutionFiles,
            editorText: t.editorText || ''
          };
          if (t.editorText) {
            this.editorTexts[taskId] = t.editorText;
          }
          if (options.importCritique && t.critique) newTask.critique = t.critique;

          tasks.push(newTask);
        }

        const effectiveCategories = options.targetCategory
          ? (categories.includes(options.targetCategory) ? categories : [...categories, options.targetCategory])
          : categories;

        const newProj: Project = {
          id: newId,
          name: proj.name,
          icon: proj.icon || 'history_edu',
          guidelines: proj.guidelines || '',
          categories: effectiveCategories,
          tasks,
          profileId: this.activeProfileId
        };
        if (proj.settingsOverride) {
          newProj.settingsOverride = proj.settingsOverride;
        }

        this.projects.push(newProj);
        await insertProject(db, newProj);
        for (const t of tasks) {
          await insertTask(db, t, newProj.id);
        }
        lastImported = newProj;
      }
    }

    if (lastImported) {
      this.selectProject(lastImported);
      this.setView('project-detail');
    } else {
      console.warn('Could not find any valid lesson to import.');
    }
  }

  async exportProject(project: Project): Promise<void> {
    const hasCritique = !!(project.tasks && project.tasks.some(t => t.critique));
    const hasCanvas = !!(project.tasks && project.tasks.some(t => this.canvasSaves[t.id]));

    this.exportDialog = {
      project,
      hasCritique,
      hasCanvas,
      onConfirm: async (options) => {
        try {
          // Inline media files for export
          const clonedTasks = (project.tasks || []).map(t => {
            const cloned: any = { ...t };
            if (cloned.instructionFiles) {
              cloned.instructionFiles = [...cloned.instructionFiles];
            }
            if (cloned.solutionFiles) {
              cloned.solutionFiles = [...cloned.solutionFiles];
            }
            return cloned;
          });

          // Read media files and inline as dataUrl
          for (const task of clonedTasks) {
            if (task.instructionFiles) {
              for (const file of task.instructionFiles) {
                if (file.mediaId && !file.dataUrl) {
                  try {
                    file.dataUrl = await getMediaDataUrl(file.mediaId);
                    delete file.mediaId;
                  } catch (_) {}
                }
              }
            }
            if (task.solutionFiles) {
              for (const file of task.solutionFiles) {
                if (file.mediaId && !file.dataUrl) {
                  try {
                    file.dataUrl = await getMediaDataUrl(file.mediaId);
                    delete file.mediaId;
                  } catch (_) {}
                }
              }
            }
          }

          const exportData: any = {
            id: project.id,
            name: project.name,
            icon: project.icon,
            guidelines: project.guidelines,
            categories: project.categories,
            tasks: clonedTasks
          };

          if (project.settingsOverride) {
            exportData.settingsOverride = project.settingsOverride;
          }

          // Attach canvas saves for all tasks in this project if requested
          exportData.canvasSaves = {};
          if (options.includeCanvas && project.tasks) {
            for (const task of project.tasks) {
              if (this.canvasSaves[task.id]) {
                exportData.canvasSaves[task.id] = this.canvasSaves[task.id];
              }
            }
          }

          // Remove critique from all tasks if not requested
          if (!options.includeCritique && exportData.tasks) {
            for (const task of exportData.tasks) {
              delete task.critique;
            }
          }

          // Remove completed status from all tasks if not requested
          if (!options.includeCompleted && exportData.tasks) {
            for (const task of exportData.tasks) {
              task.completed = false;
            }
          }

          let filename = `lesson_${project.name.toLowerCase().replace(/\s+/g, '_')}.json`;
          if (project.tasks && project.tasks.length === 1) {
            filename = `task_${project.tasks[0].name.toLowerCase().replace(/\s+/g, '_')}.json`;
          } else if (project.tasks && project.tasks.length < (this.projects.find(p => p.id === project.id)?.tasks.length || 0)) {
            filename = `tasks_${project.name.toLowerCase().replace(/\s+/g, '_')}.json`;
          }

          const dataStr = JSON.stringify(exportData);
          await this.saveFileWithDialog(filename, dataStr);
        } catch (e) {
          console.error('Export failed:', e);
          this.showNotification(
            this.settings?.language === 'Deutsch'
              ? `Export fehlgeschlagen: ${e}`
              : `Export failed: ${e}`,
            'error'
          );
        } finally {
          this.exportDialog = null;
        }
      },
      onCancel: () => {
        this.exportDialog = null;
      }
    };
  }

  exportTasks(project: Project, tasks: Task[]): void {
    const tempProject: Project = {
      ...project,
      tasks: tasks
    };
    this.exportProject(tempProject);
  }

  async saveFileWithDialog(suggestedFilename: string, content: string): Promise<boolean> {
    try {
      const downloadsBase = await downloadDir();
      const defaultPath = `${downloadsBase}/${suggestedFilename}`;

      const filePath = await save({
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        this.showNotification(
          this.settings?.language === 'Deutsch'
            ? 'Erfolgreich exportiert.'
            : 'Exported successfully.',
          'success'
        );
        return true;
      }
      return false;
    } catch (e) {
      console.error('Export failed:', e);
      this.showNotification(
        this.settings?.language === 'Deutsch'
          ? `Export fehlgeschlagen: ${e}`
          : `Export failed: ${e}`,
        'error'
      );
      return false;
    }
  }

  async recordRequest(
    provider: 'gemini' | 'openrouter',
    model: string,
    inputTokens: number,
    outputTokens: number,
    reasoningTokens: number,
    cost: number
  ): Promise<void> {
    if (!this.settings.statsEnabled) return;
    if (!this.settings.stats) {
      this.settings.stats = { daily: {} };
    }
    if (!this.settings.stats.daily) {
      this.settings.stats.daily = {};
    }
    const today = new Date().toISOString().split('T')[0];
    if (!this.settings.stats.daily[today]) {
      this.settings.stats.daily[today] = {
        gemini: { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 },
        openrouter: { requests: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cost: 0 }
      };
    }

    if (!this.settings.stats.daily[today][provider]) {
      this.settings.stats.daily[today][provider] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cost: 0
      };
    }

    const dayStats = this.settings.stats.daily[today][provider];
    dayStats.requests += 1;
    dayStats.inputTokens += inputTokens;
    dayStats.outputTokens += outputTokens;
    dayStats.reasoningTokens += reasoningTokens;
    dayStats.cost += cost;

    await this.saveSettings();
  }

  showNotification(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000): void {
    this.notification = { message, type };
    setTimeout(() => {
      if (this.notification && this.notification.message === message) {
        this.notification = null;
      }
    }, duration);
  }

  async getSettingsExportPayload(): Promise<string> {
    return JSON.stringify(this.settings, null, 2);
  }

  async getDataExportPayload(): Promise<string> {
    const exportProjects = JSON.parse(JSON.stringify(this.projects));
    for (const proj of exportProjects) {
      proj.canvasSaves = {};
      if (proj.tasks) {
        for (const task of proj.tasks) {
          const save = this.getCanvasState(task.id);
          if (save) {
            proj.canvasSaves[task.id] = save;
          }
          if (task.instructionFiles) {
            for (const file of task.instructionFiles) {
              if (file.mediaId && !file.dataUrl) {
                try {
                  file.dataUrl = await getMediaDataUrl(file.mediaId);
                  delete file.mediaId;
                } catch (_) {}
              }
            }
          }
          if (task.solutionFiles) {
            for (const file of task.solutionFiles) {
              if (file.mediaId && !file.dataUrl) {
                try {
                  file.dataUrl = await getMediaDataUrl(file.mediaId);
                  delete file.mediaId;
                } catch (_) {}
              }
            }
          }
        }
      }
    }

    const payload = {
      version: '1.0',
      projects: exportProjects,
      profiles: this.profiles,
      activeProfileId: this.activeProfileId
    };

    return JSON.stringify(payload, null, 2);
  }
}

// Singleton store instance
export const store = new CanvasCritiqueStore();
