// Svelte 5 Store for CanvasCritique using Runes

import type {
  Task,
  Project,
  Settings,
  Profile,
  CustomBackground,
  ConfirmDialog,
  ExportDialog,
  ImportDialog,
  RequestLog,
  TaskAttempt
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
  insertRequestLog,
  clearRequestLogs,
  insertAttempt as dbInsertAttempt,
  updateAttempt as dbUpdateAttempt,
  deleteAttempt as dbDeleteAttempt
} from '../db';

import { tick } from 'svelte';

import { getMediaDataUrl, saveMediaToDb, migrateMediaFromFs, migrateMediaHashes, migrateMediaExtensions, deleteMediaForTask, collectMediaIds, saveMediaBytesToDb, deleteMediaFromDb } from '../db/media';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { downloadDir } from '@tauri-apps/api/path';
import { createPack, parsePack } from '../utils/ccpack';

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
  isLoading = $state(false);
  loadingText = $state("");
  isSyncing = $state(false);
  deletingProjectIds = $state<string[]>([]);
  canvasSaves = $state<Record<string, any>>({});
  editorTexts = $state<Record<string, string>>({});
  canvasSettingsOpen = $state(false);
  lastDetectedButton = $state<{ button: number; buttons: number; pointerType: string } | null>(null);
  profiles = $state<Profile[]>([]);
  activeProfileId = $state<string>('');
  notifications = $state<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  checkingQueue = $state<{
    id: string;
    projectId: string;
    taskId: string;
    taskName: string;
    lessonName: string;
    options: any;
    status: 'waiting' | 'checking' | 'completed' | 'failed';
    error?: string;
  }[]>([]);
  private _isProcessingQueue = false;
  openRouterPrices = $state<Record<string, { prompt: number; completion: number }>>({});
  openRouterModels = $state<any[]>([]);
  statsHistory = $state<RequestLog[]>([]);

  private _dbReady = false;
  private _iconMediaIds: Record<string, string> = {};
  private _projectIconMediaIds: Record<string, string> = {};

  // Getters for dynamic API/Model selection
  get apiKey(): string {
    return this.settings.openRouterApiKey;
  }

  get model(): string {
    return this.settings.openRouterModel;
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

  getEffectiveSettings(projectId: string, taskId?: string): Settings {
    const project = this.projects.find(p => p.id === projectId);
    const task = project?.tasks?.find(t => t.id === taskId);
    const globalSettings = this.settings;

    const projOverride = project?.settingsOverride;
    const taskOverride = task?.settingsOverride;

    const useTaskModel = taskOverride?.overrideSettings && taskOverride?.overrideModel;
    const useProjModel = projOverride?.overrideSettings && projOverride?.overrideModel;

    const useTaskCanvas = taskOverride?.overrideSettings && taskOverride?.overrideCanvas;
    const useProjCanvas = projOverride?.overrideSettings && projOverride?.overrideCanvas;

    const useTaskEraser = taskOverride?.overrideSettings && taskOverride?.overrideEraser;
    const useProjEraser = projOverride?.overrideSettings && projOverride?.overrideEraser;

    const useTaskEvaluation = taskOverride?.overrideSettings && taskOverride?.overrideEvaluation;
    const useProjEvaluation = projOverride?.overrideSettings && projOverride?.overrideEvaluation;

    const useTaskSystemPrompt = taskOverride?.overrideSettings && taskOverride?.overrideSystemPrompt;
    const useProjSystemPrompt = projOverride?.overrideSettings && projOverride?.overrideSystemPrompt;

    const useTaskTaskNumbering = taskOverride?.overrideSettings && taskOverride?.overrideTaskNumbering;
    const useProjTaskNumbering = projOverride?.overrideSettings && projOverride?.overrideTaskNumbering;

    const useTaskMediaFilter = taskOverride?.overrideSettings && taskOverride?.overrideMediaFilter;
    const useProjMediaFilter = projOverride?.overrideSettings && projOverride?.overrideMediaFilter;

    const useTaskEditorFontSize = taskOverride?.overrideSettings && taskOverride?.overrideEditorFontSize;
    const useProjEditorFontSize = projOverride?.overrideSettings && projOverride?.overrideEditorFontSize;

    return {
      ...globalSettings,
      openRouterModel: useTaskModel ? (taskOverride.openRouterModel ?? globalSettings.openRouterModel) : (useProjModel ? (projOverride.openRouterModel ?? globalSettings.openRouterModel) : globalSettings.openRouterModel),
      openRouterReasoning: useTaskModel ? (taskOverride.openRouterReasoning ?? globalSettings.openRouterReasoning) : (useProjModel ? (projOverride.openRouterReasoning ?? globalSettings.openRouterReasoning) : globalSettings.openRouterReasoning),
      openRouterProvider: useTaskModel ? (taskOverride.openRouterProvider ?? globalSettings.openRouterProvider) : (useProjModel ? (projOverride.openRouterProvider ?? globalSettings.openRouterProvider) : globalSettings.openRouterProvider),
      showCanvasAnnotations: useTaskModel ? (taskOverride.showCanvasAnnotations ?? globalSettings.showCanvasAnnotations) : (useProjModel ? (projOverride.showCanvasAnnotations ?? globalSettings.showCanvasAnnotations) : globalSettings.showCanvasAnnotations),
      sendTaskMedia: useTaskEvaluation ? (taskOverride.sendTaskMedia ?? globalSettings.sendTaskMedia) : (useProjEvaluation ? (projOverride.sendTaskMedia ?? globalSettings.sendTaskMedia) : globalSettings.sendTaskMedia),
      sendSolutionMedia: useTaskEvaluation ? (taskOverride.sendSolutionMedia ?? globalSettings.sendSolutionMedia) : (useProjEvaluation ? (projOverride.sendSolutionMedia ?? globalSettings.sendSolutionMedia) : globalSettings.sendSolutionMedia),
      sendCanvasBackground: useTaskEvaluation ? (taskOverride.sendCanvasBackground ?? globalSettings.sendCanvasBackground) : (useProjEvaluation ? (projOverride.sendCanvasBackground ?? globalSettings.sendCanvasBackground) : globalSettings.sendCanvasBackground),
      sendTaskText: useTaskEvaluation ? (taskOverride.sendTaskText ?? globalSettings.sendTaskText) : (useProjEvaluation ? (projOverride.sendTaskText ?? globalSettings.sendTaskText) : globalSettings.sendTaskText),
      sendSolutionText: useTaskEvaluation ? (taskOverride.sendSolutionText ?? globalSettings.sendSolutionText) : (useProjEvaluation ? (projOverride.sendSolutionText ?? globalSettings.sendSolutionText) : globalSettings.sendSolutionText),
      sendContextText: useTaskEvaluation ? (taskOverride.sendContextText ?? globalSettings.sendContextText) : (useProjEvaluation ? (projOverride.sendContextText ?? globalSettings.sendContextText) : globalSettings.sendContextText),
      sendContextMedia: useTaskEvaluation ? (taskOverride.sendContextMedia ?? globalSettings.sendContextMedia) : (useProjEvaluation ? (projOverride.sendContextMedia ?? globalSettings.sendContextMedia) : globalSettings.sendContextMedia),
      maxOutputTokens: useTaskModel ? (taskOverride.maxOutputTokens ?? globalSettings.maxOutputTokens) : (useProjModel ? (projOverride.maxOutputTokens ?? globalSettings.maxOutputTokens) : globalSettings.maxOutputTokens),
      customSystemPrompt: useTaskSystemPrompt ? (taskOverride.customSystemPrompt !== undefined && taskOverride.customSystemPrompt !== null ? taskOverride.customSystemPrompt : globalSettings.customSystemPrompt) : (useProjSystemPrompt ? (projOverride.customSystemPrompt !== undefined && projOverride.customSystemPrompt !== null ? projOverride.customSystemPrompt : globalSettings.customSystemPrompt) : globalSettings.customSystemPrompt),
      canvasMode: useTaskCanvas ? (taskOverride.canvasMode ?? globalSettings.canvasMode) : (useProjCanvas ? (projOverride.canvasMode ?? globalSettings.canvasMode) : globalSettings.canvasMode),
      canvasFontSize: useTaskCanvas ? (taskOverride.canvasFontSize ?? globalSettings.canvasFontSize) : (useProjCanvas ? (projOverride.canvasFontSize ?? globalSettings.canvasFontSize) : globalSettings.canvasFontSize),
      editorFontSize: useTaskEditorFontSize ? (taskOverride.editorFontSize ?? globalSettings.editorFontSize) : (useProjEditorFontSize ? (projOverride.editorFontSize ?? globalSettings.editorFontSize) : globalSettings.editorFontSize),
      eraserMode: useTaskEraser ? (taskOverride.eraserMode ?? globalSettings.eraserMode) : (useProjEraser ? (projOverride.eraserMode ?? globalSettings.eraserMode) : globalSettings.eraserMode),
      eraserRadiusNormal: useTaskEraser ? (taskOverride.eraserRadiusNormal ?? globalSettings.eraserRadiusNormal) : (useProjEraser ? (projOverride.eraserRadiusNormal ?? globalSettings.eraserRadiusNormal) : globalSettings.eraserRadiusNormal),
      eraserRadiusStroke: useTaskEraser ? (taskOverride.eraserRadiusStroke ?? globalSettings.eraserRadiusStroke) : (useProjEraser ? (projOverride.eraserRadiusStroke ?? globalSettings.eraserRadiusStroke) : globalSettings.eraserRadiusStroke),
      autoNumberTasks: useTaskTaskNumbering ? (taskOverride.autoNumberTasks ?? globalSettings.autoNumberTasks) : (useProjTaskNumbering ? (projOverride.autoNumberTasks ?? globalSettings.autoNumberTasks) : globalSettings.autoNumberTasks),
      taskNumberingTemplate: useTaskTaskNumbering ? (taskOverride.taskNumberingTemplate ?? globalSettings.taskNumberingTemplate) : (useProjTaskNumbering ? (projOverride.taskNumberingTemplate ?? globalSettings.taskNumberingTemplate) : globalSettings.taskNumberingTemplate),
      taskMediaFilterMode: useTaskMediaFilter ? (taskOverride.taskMediaFilterMode ?? globalSettings.taskMediaFilterMode) : (useProjMediaFilter ? (projOverride.taskMediaFilterMode ?? globalSettings.taskMediaFilterMode) : globalSettings.taskMediaFilterMode),
      taskMediaFilterExtensions: useTaskMediaFilter ? (taskOverride.taskMediaFilterExtensions ?? globalSettings.taskMediaFilterExtensions) : (useProjMediaFilter ? (projOverride.taskMediaFilterExtensions ?? globalSettings.taskMediaFilterExtensions) : globalSettings.taskMediaFilterExtensions),
      solutionMediaFilterMode: useTaskMediaFilter ? (taskOverride.solutionMediaFilterMode ?? globalSettings.solutionMediaFilterMode) : (useProjMediaFilter ? (projOverride.solutionMediaFilterMode ?? globalSettings.solutionMediaFilterMode) : globalSettings.solutionMediaFilterMode),
      solutionMediaFilterExtensions: useTaskMediaFilter ? (taskOverride.solutionMediaFilterExtensions ?? globalSettings.solutionMediaFilterExtensions) : (useProjMediaFilter ? (projOverride.solutionMediaFilterExtensions ?? globalSettings.solutionMediaFilterExtensions) : globalSettings.solutionMediaFilterExtensions),
      language: (taskOverride?.overrideSettings) ? (taskOverride.language ?? globalSettings.language) : ((projOverride?.overrideSettings) ? (projOverride.language ?? globalSettings.language) : globalSettings.language),
    };
  }

  // DB init — call before using store
  async init() {
    const db = await initDb();
    await migrateMediaFromFs();
    await migrateMediaHashes();
    await migrateMediaExtensions();
    await this.loadState(db);
    this._dbReady = true;
    this.fetchOpenRouterPrices();
  }

  private getDb() {
    return getDb();
  }

  async loadState(db?: ReturnType<typeof getDb>) {
    const database = db || this.getDb();
    const activeProjId = this.activeProject?.id;
    const activeTaskId = this.activeTask?.id;
    const editingTaskId = this.editingTask?.id;

    try {
      // Load all data from DB
      const data = await loadAllData(database);

      if (data.profiles.length > 0) {
        this.profiles = data.profiles;
        // Resolve profile icons from mediaId to dataUrl for UI
        for (const p of this.profiles) {
          if (p.icon && !p.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(p.icon)) {
            this._iconMediaIds[p.id] = p.icon;
            try {
              const url = await getMediaDataUrl(p.icon);
              p.icon = url;
            } catch (err) {
              console.error('[store] Failed to load profile icon for', p.id, err);
              p.icon = null; // Fallback
            }
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
        await dbSaveSettings(database, $state.snapshot(this.settings));
      }

      this.statsHistory = data.requestLogs || [];

      this.settings.lastSyncedTimestamp = '';
      this.settings.lastSyncedDbHash = '';
      try {
        const { appDataDir, join } = await import('@tauri-apps/api/path');
        const { exists, readFile } = await import('@tauri-apps/plugin-fs');
        const appDir = await appDataDir();
        const syncStatePath = await join(appDir, 'canvascritique_sync_state.json');
        if (await exists(syncStatePath)) {
          const content = await readFile(syncStatePath);
          const text = new TextDecoder().decode(content);
          const parsed = JSON.parse(text);
          this.settings.lastSyncedTimestamp = parsed.lastSyncedTimestamp || '';
          this.settings.lastSyncedDbHash = parsed.lastSyncedDbHash || '';
        }
      } catch (err) {
        console.error('Failed to load local sync state from file:', err);
      }

      // Normalize settings
      if (!this.settings.statsEnabled) {
        this.settings.statsEnabled = true;
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
      if (!this.settings.taskMediaFilterMode) {
        this.settings.taskMediaFilterMode = 'blacklist';
      }
      if (this.settings.taskMediaFilterExtensions === undefined) {
        this.settings.taskMediaFilterExtensions = '';
      }
      if (!this.settings.solutionMediaFilterMode) {
        this.settings.solutionMediaFilterMode = 'blacklist';
      }
      if (this.settings.solutionMediaFilterExtensions === undefined) {
        this.settings.solutionMediaFilterExtensions = '';
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
      if (!this.settings.userIcons || !Array.isArray(this.settings.userIcons)) {
        this.settings.userIcons = [];
      }

      if (data.projects.length > 0) {
        this.projects = data.projects;
        // Resolve project icons from mediaId to dataUrl
        for (const p of this.projects) {
          if (p.icon && !p.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(p.icon)) {
            this._projectIconMediaIds[p.id] = p.icon;
            try {
              const url = await getMediaDataUrl(p.icon);
              p.icon = url;
            } catch (err) {
              console.error('[store] Failed to load project icon for', p.id, err);
              p.icon = 'history_edu'; // Fallback
            }
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

      // Restore active project and task references to the new objects loaded from DB
      if (activeProjId) {
        this.activeProject = this.projects.find(p => p.id === activeProjId) || null;
      } else {
        this.activeProject = null;
      }

      if (this.activeProject && activeTaskId) {
        this.activeTask = this.activeProject.tasks?.find(t => t.id === activeTaskId) || null;
      } else {
        this.activeTask = null;
      }

      if (this.activeProject && editingTaskId) {
        this.editingTask = this.activeProject.tasks?.find(t => t.id === editingTaskId) || null;
      } else {
        this.editingTask = null;
      }
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
          } catch (err) { console.error('[store] Failed to save project icon media:', err); }
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
            contextFiles: this.stripDataUrls(task.contextFiles || []),
            providedFiles: this.stripDataUrls(task.providedFiles || []),
            critique: task.critique || null,
            canvasData: this.canvasSaves[task.id] || null,
            background: task.background || null,
            settingsOverride: task.settingsOverride || null,
            aiInstructions: task.aiInstructions || null,
            defaultEditMode: task.defaultEditMode || null,
            templateCanvasData: task.templateCanvasData || null,
            editorText: task.editorText || null
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
    // Clean in-memory settings to match only keys from defaultSettings
    const cleaned: any = {};
    for (const key of Object.keys(defaultSettings)) {
      cleaned[key] = this.settings[key] !== undefined ? this.settings[key] : (defaultSettings as any)[key];
    }
    this.settings = cleaned as Settings;

    await dbSaveSettings(db, $state.snapshot(this.settings));
    this.applyTheme(this.settings.theme);
  }

  async saveProfiles() {
    const db = this.getDb();
    for (const profile of this.profiles) {
      // Convert dataUrl icon back to mediaId for storage
      let icon = profile.icon;
      if (icon && icon.startsWith('data:')) {
        if (this._iconMediaIds[profile.id]) {
          icon = this._iconMediaIds[profile.id];
        } else {
          try {
            const mediaId = await saveMediaToDb(icon);
            this._iconMediaIds[profile.id] = mediaId;
            icon = mediaId;
          } catch (err) { console.error('[store] Failed to save profile icon media:', err); }
        }
      }
      const existing: any[] = await db.select('SELECT id FROM profiles WHERE id = ?', [profile.id]);
      if (existing.length > 0) {
        await dbUpdateProfile(db, profile.id, {
          name: profile.name,
          icon: icon,
          color: profile.color,
          sortOrder: profile.sortOrder
        });
      } else {
        await insertProfile(db, { ...profile, icon: icon });
      }
    }
    localStorage.setItem('canvascritique_active_profile_id', this.activeProfileId);
  }

  async addProfile(name: string, icon: string | null = null, color: string = '#3b82f6') {
    const id = 'profile-' + Date.now();
    let resolvedIcon = icon;
    if (icon && !icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(icon)) {
      this._iconMediaIds[id] = icon;
      try {
        resolvedIcon = await getMediaDataUrl(icon);
      } catch (err) {
        console.error('[store] Failed to load profile icon for new profile:', id, err);
        resolvedIcon = null;
      }
    }
    const newProfile: Profile = {
      id,
      name,
      icon: resolvedIcon,
      color
    };
    this.profiles.push(newProfile);
    await this.saveProfiles();
    return newProfile;
  }

  async updateProfile(id: string, updated: { name?: string; icon?: string | null; color?: string }) {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    const oldIconMediaId = this._iconMediaIds[id];
    if (updated.name !== undefined) profile.name = updated.name;
    if (updated.icon !== undefined) {
      if (updated.icon && !updated.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(updated.icon)) {
        this._iconMediaIds[id] = updated.icon;
        try {
          profile.icon = await getMediaDataUrl(updated.icon);
        } catch (err) {
          console.error('[store] Failed to load profile icon for', id, err);
          profile.icon = null;
        }
      } else {
        profile.icon = updated.icon;
        if (updated.icon && (updated.icon.startsWith('data:') || !/^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(updated.icon))) {
          delete this._iconMediaIds[id];
        } else if (!updated.icon) {
          delete this._iconMediaIds[id];
        }
      }
    }
    if (updated.color !== undefined) profile.color = updated.color;
    await this.saveProfiles();
  }

  async deleteProfile(id: string) {
    if (this.profiles.length <= 1) return;

    const db = this.getDb();
    const projectsToDelete = this.projects.filter(p => p.profileId === id);

    for (const project of projectsToDelete) {
      if (project.tasks) {
        for (const t of project.tasks) {
          if (this.canvasSaves[t.id]) {
            delete this.canvasSaves[t.id];
          }
          if (this.editorTexts[t.id]) {
            delete this.editorTexts[t.id];
          }
        }
      }
    }

    // Remove projects for this profile from memory first
    this.projects = this.projects.filter(p => p.profileId !== id);
    for (const project of projectsToDelete) {
      delete this._projectIconMediaIds[project.id];
    }

    // Delete profile (cascades to projects/tasks in SQLite)
    await dbDeleteProfile(db, id);
    await this.saveProjects();

    // Remove profile from memory
    this.profiles = this.profiles.filter(p => p.id !== id);
    delete this._iconMediaIds[id];

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

  async reorderProfiles(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= this.profiles.length || toIndex < 0 || toIndex >= this.profiles.length) {
      return;
    }
    const moved = this.profiles[fromIndex];
    const newProfiles = [...this.profiles];
    newProfiles.splice(fromIndex, 1);
    newProfiles.splice(toIndex, 0, moved);
    
    newProfiles.forEach((p, idx) => {
      p.sortOrder = idx;
    });
    
    this.profiles = newProfiles;
    await this.saveProfiles();
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

  async cleanOrphanedMedia(): Promise<number> {
    const db = this.getDb();
    try {
      const rows: any[] = await db.select('SELECT id FROM media');
      const allMediaIds = rows.map(r => r.id);
      let deleteCount = 0;

      for (const mediaId of allMediaIds) {
        let isReferenced = false;

        if (this.settings.userIcons && this.settings.userIcons.includes(mediaId)) {
          isReferenced = true;
        }

        if (!isReferenced) {
          for (const project of this.projects) {
            if (this._projectIconMediaIds[project.id] === mediaId || project.icon === mediaId) {
              isReferenced = true;
              break;
            }
            if (project.tasks) {
              for (const task of project.tasks) {
                if (task.instructionFiles && task.instructionFiles.some(f => f.mediaId === mediaId)) {
                  isReferenced = true;
                  break;
                }
                if (task.solutionFiles && task.solutionFiles.some(f => f.mediaId === mediaId)) {
                  isReferenced = true;
                  break;
                }
                if (task.templateCanvasData && task.templateCanvasData.includes(mediaId)) {
                  isReferenced = true;
                  break;
                }
              }
            }
            if (isReferenced) break;
          }
        }

        if (!isReferenced) {
          for (const taskId in this.canvasSaves) {
            const save = this.canvasSaves[taskId];
            if (save && save.canvasImages && Array.isArray(save.canvasImages)) {
              if (save.canvasImages.some((img: any) => img.mediaId === mediaId)) {
                isReferenced = true;
                break;
              }
            }
          }
        }

        if (!isReferenced) {
          for (const profile of this.profiles) {
            if (this._iconMediaIds[profile.id] === mediaId || profile.icon === mediaId) {
              isReferenced = true;
              break;
            }
          }
        }

        if (!isReferenced) {
          for (const bg of this.customBackgrounds) {
            if (bg.mediaId === mediaId || bg.iconMediaId === mediaId || bg.icon === mediaId) {
              isReferenced = true;
              break;
            }
          }
        }

        if (!isReferenced) {
          console.log(`[store] Cleaning up orphaned media during global check: ${mediaId}`);
          await deleteMediaFromDb(mediaId);
          deleteCount++;
        }
      }

      return deleteCount;
    } catch (err) {
      console.error('[store] cleanOrphanedMedia failed:', err);
      throw err;
    }
  }


  async deleteUserIcon(mediaId: string): Promise<void> {
    if (this.settings.userIcons) {
      this.settings.userIcons = this.settings.userIcons.filter(id => id !== mediaId);
      await this.saveSettings();
    }
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

  private _taskEditorGuard: {
    hasChanges: () => boolean;
    save: (onComplete: () => void) => void;
    discard: () => void;
  } | null = null;

  registerTaskEditorGuard(guard: any) {
    this._taskEditorGuard = guard;
  }

  // Navigation actions
  setView(view: string): void {
    if (this.currentView === 'task-editor' && view !== 'task-editor' && this._taskEditorGuard && this._taskEditorGuard.hasChanges()) {
      this.confirmDialog = {
        title: this.settings.language === 'Deutsch' ? 'Ungespeicherte Änderungen' : 'Unsaved Changes',
        message: this.settings.language === 'Deutsch' 
          ? 'Es gibt ungespeicherte Änderungen. Möchtest du diese vor dem Verlassen speichern?'
          : 'There are unsaved changes. Would you like to save them before leaving?',
        confirmLabel: this.settings.language === 'Deutsch' ? 'Speichern' : 'Save',
        cancelLabel: this.settings.language === 'Deutsch' ? 'Abbrechen' : 'Cancel',
        thirdLabel: this.settings.language === 'Deutsch' ? 'Verwerfen' : 'Discard',
        isPrimary: true,
        onConfirm: () => {
          this.confirmDialog = null;
          this._taskEditorGuard!.save(() => {
            this._taskEditorGuard = null;
            this.editingTask = null;
            this.currentView = view;
          });
        },
        onCancel: () => {
          this.confirmDialog = null;
        },
        onThird: () => {
          this.confirmDialog = null;
          this._taskEditorGuard!.discard();
          this._taskEditorGuard = null;
          this.editingTask = null;
          this.currentView = view;
        }
      };
      return;
    }

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
    const projectId = 'proj-' + Date.now();
    let resolvedIcon = icon;
    if (icon && !icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(icon)) {
      this._projectIconMediaIds[projectId] = icon;
      try {
        resolvedIcon = await getMediaDataUrl(icon);
      } catch (err) {
        console.error('[store] Failed to load project icon for new project', projectId, err);
        resolvedIcon = 'history_edu';
      }
    }

    const newProj: Project = {
      id: projectId,
      name,
      icon: resolvedIcon,
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

    const db = this.getDb();
    const tasksToDelete = project.tasks ? project.tasks.filter(t => (t.category || 'Basics') === categoryName) : [];

    // Filter tasks from memory first so they are not considered referenced in cleanup check
    if (project.tasks) {
      project.tasks = project.tasks.filter(t => (t.category || 'Basics') !== categoryName);
    }

    for (const t of tasksToDelete) {
      try {
        await dbDeleteTask(db, t.id);
      } catch (err) {
        console.error('[store] Failed to delete task in category deletion', t.id, err);
      }
      delete this.canvasSaves[t.id];
      delete this.editorTexts[t.id];

      if (this.activeTask && this.activeTask.id === t.id) {
        this.activeTask = null;
      }
      if (this.editingTask && this.editingTask.id === t.id) {
        this.editingTask = null;
      }
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
    solutionFiles: any[] = [],
    settingsOverride?: any,
    aiInstructions: string = '',
    defaultEditMode: 'canvas' | 'text' | 'both' = 'both',
    contextFiles: any[] = [],
    background: string | null = null,
    providedFiles: any[] = []
  ): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask: Task = {
      id: 'task-' + Date.now(),
      name,
      completed: false,
      instructions,
      solution,
      aiInstructions,
      category,
      instructionFiles: this.stripDataUrls(instructionFiles),
      solutionFiles: this.stripDataUrls(solutionFiles),
      settingsOverride,
      defaultEditMode,
      contextFiles: this.stripDataUrls(contextFiles),
      background,
      providedFiles: this.stripDataUrls(providedFiles)
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
    if (updatedData.aiInstructions !== undefined) task.aiInstructions = updatedData.aiInstructions;
    if (updatedData.category !== undefined) task.category = updatedData.category;
    if (updatedData.instructionFiles !== undefined) task.instructionFiles = this.stripDataUrls(updatedData.instructionFiles);
    if (updatedData.solutionFiles !== undefined) task.solutionFiles = this.stripDataUrls(updatedData.solutionFiles);
    if (updatedData.instructionFile !== undefined) (task as any).instructionFile = updatedData.instructionFile;
    if (updatedData.solutionFile !== undefined) (task as any).solutionFile = updatedData.solutionFile;
    if (updatedData.completed !== undefined) task.completed = updatedData.completed;
    if (updatedData.critique !== undefined) {
      task.critique = updatedData.critique;
      const db = this.getDb();
      if (task.activeAttemptId) {
        const attempt = task.attempts?.find(a => a.id === task.activeAttemptId);
        if (attempt) {
          attempt.critique = updatedData.critique;
          await dbUpdateAttempt(db, attempt.id, { critique: updatedData.critique });
        }
      }
    }
    if (updatedData.background !== undefined) task.background = updatedData.background;
    if (updatedData.settingsOverride !== undefined) task.settingsOverride = updatedData.settingsOverride;
    if (updatedData.defaultEditMode !== undefined) task.defaultEditMode = updatedData.defaultEditMode;
    if (updatedData.contextFiles !== undefined) task.contextFiles = this.stripDataUrls(updatedData.contextFiles);
    if (updatedData.providedFiles !== undefined) task.providedFiles = this.stripDataUrls(updatedData.providedFiles);
    if (updatedData.activeAttemptId !== undefined) task.activeAttemptId = updatedData.activeAttemptId;

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
      aiInstructions: task.aiInstructions || '',
      category: task.category,
      instructionFiles: task.instructionFiles || [],
      solutionFiles: task.solutionFiles || [],
      critique: task.critique || null,
      background: task.background || null,
      settingsOverride: task.settingsOverride || null,
      defaultEditMode: task.defaultEditMode || 'both',
      contextFiles: task.contextFiles || [],
      providedFiles: task.providedFiles || [],
      templateCanvasData: task.templateCanvasData || null,
      activeAttemptId: task.activeAttemptId || null
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

    // Filter task from memory first
    project.tasks = project.tasks.filter(t => t.id !== taskId);

    const db = this.getDb();
    await dbDeleteTask(db, taskId);

    if (this.canvasSaves[taskId]) {
      delete this.canvasSaves[taskId];
    }
    if (this.editorTexts[taskId]) {
      delete this.editorTexts[taskId];
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

    // Filter tasks from memory first
    project.tasks = project.tasks.filter(t => !taskIds.includes(t.id));

    const db = this.getDb();
    await dbDeleteTasks(db, taskIds);

    for (const taskId of taskIds) {
      if (this.canvasSaves[taskId]) {
        delete this.canvasSaves[taskId];
      }
      if (this.editorTexts[taskId]) {
        delete this.editorTexts[taskId];
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
    const oldIconMediaId = this._projectIconMediaIds[projectId];

    if (updates.name !== undefined) project.name = updates.name;
    if (updates.icon !== undefined) {
      if (updates.icon && !updates.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(updates.icon)) {
        this._projectIconMediaIds[projectId] = updates.icon;
        try {
          project.icon = await getMediaDataUrl(updates.icon);
        } catch (err) {
          console.error('[store] Failed to load project icon for', projectId, err);
          project.icon = 'history_edu';
        }
      } else {
        project.icon = updates.icon;
        if (updates.icon && (updates.icon.startsWith('data:') || !/^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(updates.icon))) {
          delete this._projectIconMediaIds[projectId];
        }
      }
    }
    await this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    if (this.deletingProjectIds.includes(projectId)) return;
    this.deletingProjectIds.push(projectId);
    try {
      const project = this.projects.find(p => p.id === projectId);
      if (project && project.tasks) {
        for (const t of project.tasks) {
          if (this.canvasSaves[t.id]) {
            delete this.canvasSaves[t.id];
          }
          if (this.editorTexts[t.id]) {
            delete this.editorTexts[t.id];
          }
        }
      }

      const db = this.getDb();
      await dbDeleteProject(db, projectId);

      // Filter out the project from memory first
      this.projects = this.projects.filter(p => p.id !== projectId);
      delete this._projectIconMediaIds[projectId];

      if (this.activeProject && this.activeProject.id === projectId) {
        this.activeProject = null;
        this.activeTask = null;
        this.setView('dashboard');
      }
    } finally {
      this.deletingProjectIds = this.deletingProjectIds.filter(id => id !== projectId);
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

  confirm(
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel: (() => void) | null = null,
    isAlert: boolean = false,
    confirmLabel?: string,
    cancelLabel?: string,
    thirdLabel?: string,
    onThird: (() => void) | null = null,
    isPrimary: boolean = false
  ): void {
    this.confirmDialog = {
      title,
      message,
      isAlert,
      confirmLabel,
      cancelLabel,
      thirdLabel,
      isPrimary,
      onConfirm: () => {
        onConfirm();
        this.confirmDialog = null;
      },
      onCancel: () => {
        if (onCancel) onCancel();
        this.confirmDialog = null;
      },
      onThird: onThird ? () => {
        onThird();
        this.confirmDialog = null;
      } : undefined
    };
  }

  findTaskById(taskId: string): Task | null {
    for (const project of this.projects) {
      const task = project.tasks?.find(t => t.id === taskId);
      if (task) return task;
    }
    return null;
  }

  async saveCanvasState(taskId: string, data: any): Promise<void> {
    this.canvasSaves[taskId] = data;
    const db = this.getDb();
    await setCanvasState(db, taskId, data);

    const task = this.findTaskById(taskId);
    if (task && task.activeAttemptId) {
      const attempt = task.attempts?.find(a => a.id === task.activeAttemptId);
      if (attempt) {
        attempt.canvasData = data;
        attempt.timestamp = new Date().toISOString();
        await dbUpdateAttempt(db, attempt.id, { canvasData: data, timestamp: attempt.timestamp });
      }
    }
  }

  getCanvasState(taskId: string): any {
    return this.canvasSaves[taskId] || null;
  }

  async saveEditorText(taskId: string, text: string): Promise<void> {
    this.editorTexts[taskId] = text;
    const db = this.getDb();
    await dbUpdateTask(db, taskId, { editorText: text });

    const task = this.findTaskById(taskId);
    if (task && task.activeAttemptId) {
      const attempt = task.attempts?.find(a => a.id === task.activeAttemptId);
      if (attempt) {
        attempt.editorText = text;
        attempt.timestamp = new Date().toISOString();
        await dbUpdateAttempt(db, attempt.id, { editorText: text, timestamp: attempt.timestamp });
      }
    }

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

  async selectAttempt(projectId: string, taskId: string, attemptId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.activeAttemptId = attemptId;
    await dbUpdateTask(this.getDb(), taskId, { activeAttemptId: attemptId });

    const attempt = task.attempts?.find(a => a.id === attemptId);
    if (attempt) {
      const canvasState = attempt.canvasData || {
        pages: [{ id: 'page-' + Date.now(), strokeHistory: [], redoStack: [], eraserUndoStack: [] }],
        infiniteStrokes: [],
        infiniteRedo: [],
        infiniteEraserUndo: [],
        panOffset: { x: 0, y: 0 },
        zoomScale: 1,
        activePageIndex: 0,
        canvasImages: []
      };
      this.canvasSaves[taskId] = canvasState;
      await setCanvasState(this.getDb(), taskId, canvasState);

      this.editorTexts[taskId] = attempt.editorText || '';
      await dbUpdateTask(this.getDb(), taskId, { editorText: attempt.editorText || '' });

      task.critique = attempt.critique || null;
      await dbUpdateTask(this.getDb(), taskId, { critique: attempt.critique || null });
    }

    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = null;
      await tick();
      this.activeTask = task;
    }
  }

  async createAttempt(projectId: string, taskId: string, attemptName?: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!task.attempts) {
      task.attempts = [];
    }

    const nextNum = task.attempts.length + 1;
    const defaultName = this.settings.language === 'Deutsch' 
      ? `Versuch ${nextNum}` 
      : `Try ${nextNum}`;
    const name = attemptName || defaultName;

    const attemptId = 'attempt_' + Date.now();
    const newAttempt: TaskAttempt = {
      id: attemptId,
      taskId: taskId,
      name: name,
      timestamp: new Date().toISOString(),
      canvasData: {
        pages: [{ id: 'page-' + Date.now(), strokeHistory: [], redoStack: [], eraserUndoStack: [] }],
        infiniteStrokes: [],
        infiniteRedo: [],
        infiniteEraserUndo: [],
        panOffset: { x: 0, y: 0 },
        zoomScale: 1,
        activePageIndex: 0,
        canvasImages: []
      },
      editorText: '',
      critique: null
    };

    const db = this.getDb();
    await dbInsertAttempt(db, newAttempt);
    task.attempts.push(newAttempt);
    await this.selectAttempt(projectId, taskId, attemptId);
  }

  async renameAttempt(projectId: string, taskId: string, attemptId: string, newName: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    const attempt = task.attempts?.find(a => a.id === attemptId);
    if (attempt) {
      attempt.name = newName;
      await dbUpdateAttempt(this.getDb(), attemptId, { name: newName });
    }
  }

  async deleteAttempt(projectId: string, taskId: string, attemptId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!task.attempts) return;

    const attemptIndex = task.attempts.findIndex(a => a.id === attemptId);
    if (attemptIndex === -1) return;

    await dbDeleteAttempt(this.getDb(), attemptId);
    task.attempts.splice(attemptIndex, 1);

    if (task.activeAttemptId === attemptId) {
      if (task.attempts.length > 0) {
        const fallbackAttempt = task.attempts[0];
        await this.selectAttempt(projectId, taskId, fallbackAttempt.id);
      } else {
        task.activeAttemptId = null;
        await dbUpdateTask(this.getDb(), taskId, { activeAttemptId: null });
        await this.createAttempt(projectId, taskId);
      }
    }
  }

  importProject(projectData: any, targetProjectId?: string, targetCategory?: string): void {
    const data = Array.isArray(projectData) ? projectData : [projectData];

    if (!targetProjectId) {
      const isAnyTaskExport = data.some(proj => proj && typeof proj === 'object' && proj.isTasksExport);
      if (isAnyTaskExport) {
        this.confirm(
          this.settings?.language === 'Deutsch' ? 'Importfehler' : 'Import Error',
          this.settings?.language === 'Deutsch' ? 'Tasks können nur in eine Lektion importiert werden.' : 'Tasks can only be imported into a lesson.',
          () => {},
          null,
          true
        );
        return;
      }
    }

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
      onConfirm: async (options) => {
        const prevView = this.currentView;
        const prevProjectId = this.activeProject?.id;

        await this.executeImportProject(projectData, { ...options, targetCategory });
        this.importDialog = null;
        
        await this.loadState();
        
        if (prevView === 'project-detail' && prevProjectId) {
          const updatedProj = this.projects.find(p => p.id === prevProjectId);
          if (updatedProj) {
            this.activeProject = updatedProj;
            this.currentView = 'project-detail';
          } else {
            this.currentView = 'dashboard';
          }
        } else {
          const importedProjId = this.activeProject?.id;
          if (importedProjId) {
            const updatedProj = this.projects.find(p => p.id === importedProjId);
            if (updatedProj) {
              this.activeProject = updatedProj;
              this.currentView = 'project-detail';
            } else {
              this.currentView = 'dashboard';
            }
          } else {
            this.currentView = 'dashboard';
          }
        }
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
          file.mediaId = await saveMediaToDb(file.dataUrl, file.name);
        } catch (err) { console.error('[store] Failed to save imported file to media:', err); }
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
    this.showLoading(this.settings?.language === 'Deutsch' ? 'Importiere...' : 'Importing...');
    try {
      const data = Array.isArray(projectData) ? projectData : [projectData];
      let lastImported: Project | null = null;
      const db = this.getDb();

      for (let projIdx = 0; projIdx < data.length; projIdx++) {
        const proj = data[projIdx];
        if (!proj || typeof proj !== 'object') continue;

        const shouldMerge = options.mergeProjectId && proj.isTasksExport;
        const mergeProject = shouldMerge
          ? this.projects.find(p => p.id === options.mergeProjectId)
          : null;

        if (mergeProject) {
          const importedCanvasSaves = proj.canvasSaves || {};
          const importedTasks: any[] = proj.tasks || [];
          const importedCategories: string[] = proj.categories || [];
          const targetCat = options.targetCategory;
          const effectiveCategories: string[] = targetCat
            ? [targetCat]
            : (importedCategories.length > 0 ? importedCategories : ['Basics']);

          // Walk imported sections in order
          for (const importedCat of effectiveCategories) {
            const sectionImportedTasks = targetCat
              ? importedTasks
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
                  if (t.providedFiles !== undefined) {
                    matchedTask.providedFiles = this.stripDataUrls(await this.convertImportedFiles(t.providedFiles));
                  }
                  if (t.contextFiles !== undefined) {
                    matchedTask.contextFiles = this.stripDataUrls(await this.convertImportedFiles(t.contextFiles));
                  }
                  matchedTask.aiInstructions = t.aiInstructions !== undefined ? t.aiInstructions : matchedTask.aiInstructions;
                  matchedTask.defaultEditMode = t.defaultEditMode !== undefined ? t.defaultEditMode : matchedTask.defaultEditMode;
                  matchedTask.templateCanvasData = t.templateCanvasData !== undefined ? t.templateCanvasData : matchedTask.templateCanvasData;
                  if (options.importCompleted && t.completed !== undefined) matchedTask.completed = !!t.completed;
                  if (options.importCritique && t.critique !== undefined) matchedTask.critique = t.critique;
                  if (t.settingsOverride !== undefined) matchedTask.settingsOverride = t.settingsOverride;

                  await dbUpdateTask(db, matchedTask.id, matchedTask);
                  if (options.importCanvas && t.id && importedCanvasSaves[t.id]) {
                    this.canvasSaves[matchedTask.id] = importedCanvasSaves[t.id];
                    await setCanvasState(db, matchedTask.id, importedCanvasSaves[t.id]);
                  }
                }
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
                let providedFiles = this.stripDataUrls(await this.convertImportedFiles(t.providedFiles || []));
                let contextFiles = this.stripDataUrls(await this.convertImportedFiles(t.contextFiles || []));

                const newTask: Task = {
                  id: taskId,
                  name: t.name,
                  completed: options.importCompleted ? !!t.completed : false,
                  instructions: t.instructions || '',
                  solution: t.solution || '',
                  aiInstructions: t.aiInstructions || '',
                  category: taskCategory,
                  instructionFiles,
                  solutionFiles,
                  providedFiles,
                  contextFiles,
                  editorText: t.editorText || '',
                  defaultEditMode: t.defaultEditMode || 'both',
                  templateCanvasData: t.templateCanvasData || null,
                  settingsOverride: t.settingsOverride || null
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
          await this.saveProjects();
          lastImported = mergeProject;
        } else {
          if (!proj.name) continue;

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
            let providedFiles = this.stripDataUrls(await this.convertImportedFiles(t.providedFiles || []));
            let contextFiles = this.stripDataUrls(await this.convertImportedFiles(t.contextFiles || []));

            const taskCategory = options.targetCategory || t.category || 'Basics';

            const newTask: Task = {
              id: taskId,
              name: t.name,
              completed: options.importCompleted ? !!t.completed : false,
              instructions: t.instructions || '',
              solution: t.solution || '',
              aiInstructions: t.aiInstructions || '',
              category: taskCategory,
              instructionFiles,
              solutionFiles,
              providedFiles,
              contextFiles,
              editorText: t.editorText || '',
              defaultEditMode: t.defaultEditMode || 'both',
              templateCanvasData: t.templateCanvasData || null,
              settingsOverride: t.settingsOverride || null
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

          let resolvedIcon = proj.icon || 'history_edu';
          let customIconMediaId: string | null = null;

          if (resolvedIcon && resolvedIcon.startsWith('data:')) {
            try {
              const mediaId = await saveMediaToDb(resolvedIcon);
              this._projectIconMediaIds[newId] = mediaId;
              resolvedIcon = await getMediaDataUrl(mediaId);
              customIconMediaId = mediaId;
            } catch (err) {
              console.error('[store] Failed to save imported project icon to media:', err);
            }
          } else if (resolvedIcon && !resolvedIcon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(resolvedIcon)) {
            this._projectIconMediaIds[newId] = resolvedIcon;
            customIconMediaId = resolvedIcon;
            try {
              resolvedIcon = await getMediaDataUrl(resolvedIcon);
            } catch (err) {
              console.error('[store] Failed to load project icon during import for', newId, err);
              resolvedIcon = 'history_edu';
            }
          }

          if (customIconMediaId) {
            if (!this.settings.userIcons) {
              this.settings.userIcons = [];
            }
            if (!this.settings.userIcons.includes(customIconMediaId)) {
              this.settings.userIcons.push(customIconMediaId);
              await this.saveSettings();
            }
          }

          const newProj: Project = {
            id: newId,
            name: proj.name,
            icon: resolvedIcon,
            guidelines: proj.guidelines || '',
            categories: effectiveCategories,
            tasks,
            profileId: this.activeProfileId
          };
          if (proj.settingsOverride) {
            newProj.settingsOverride = proj.settingsOverride;
          }

          this.projects.push(newProj);
          const dbIcon = this._projectIconMediaIds[newProj.id] || newProj.icon;
          await insertProject(db, { ...newProj, icon: dbIcon });
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
    } finally {
      this.hideLoading();
    }
  }

  async exportProject(project: Project, categoryName?: string, isTasksExport: boolean = false): Promise<void> {
    const hasCritique = !!(project.tasks && project.tasks.some(t => t.critique));
    const hasCanvas = !!(project.tasks && project.tasks.some(t => this.canvasSaves[t.id]));

    this.exportDialog = {
      project,
      hasCritique,
      hasCanvas,
      onConfirm: async (options) => {
        this.exportDialog = null;
        try {
          let filename = `lesson_${project.name.toLowerCase().replace(/\s+/g, '_')}.ccpack`;
          if (categoryName) {
            filename = `section_${project.name.toLowerCase().replace(/\s+/g, '_')}_${categoryName.toLowerCase().replace(/\s+/g, '_')}.ccpack`;
          } else if (project.tasks && project.tasks.length === 1) {
            filename = `task_${project.tasks[0].name.toLowerCase().replace(/\s+/g, '_')}.ccpack`;
          } else if (project.tasks && project.tasks.length < (this.projects.find(p => p.id === project.id)?.tasks.length || 0)) {
            filename = `tasks_${project.name.toLowerCase().replace(/\s+/g, '_')}.ccpack`;
          }

          // 1. Open the file save dialog FIRST
          const filePath = await this.getSavePath(filename, 'ccpack', 'Canvas Critique Package');
          if (!filePath) return; // User cancelled, do no work

          this.showLoading(this.settings?.language === 'Deutsch' ? 'Exportiere...' : 'Exporting...');
          try {
            // 2. Prepare the export file in the background
            const clonedTasks = (project.tasks || []).map(t => {
              const cloned: any = { ...t };
              if (cloned.instructionFiles) {
                cloned.instructionFiles = [...cloned.instructionFiles];
              }
              if (cloned.solutionFiles) {
                cloned.solutionFiles = [...cloned.solutionFiles];
              }
              if (cloned.contextFiles) {
                cloned.contextFiles = [...cloned.contextFiles];
              }
              if (cloned.providedFiles) {
                cloned.providedFiles = [...cloned.providedFiles];
              }
              return cloned;
            });

            // Collect media IDs instead of inlining dataUrls
            const mediaIdsToPack: string[] = [];
            for (const task of clonedTasks) {
              if (task.instructionFiles) {
                for (const file of task.instructionFiles) {
                  if (file.mediaId) {
                    mediaIdsToPack.push(file.mediaId);
                  }
                }
              }
              if (task.solutionFiles) {
                for (const file of task.solutionFiles) {
                  if (file.mediaId) {
                    mediaIdsToPack.push(file.mediaId);
                  }
                }
              }
              if (task.contextFiles) {
                for (const file of task.contextFiles) {
                  if (file.mediaId) {
                    mediaIdsToPack.push(file.mediaId);
                  }
                }
              }
              if (task.providedFiles) {
                for (const file of task.providedFiles) {
                  if (file.mediaId) {
                    mediaIdsToPack.push(file.mediaId);
                  }
                }
              }
            }

            let icon = project.icon;
            if (icon && !icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(icon)) {
              mediaIdsToPack.push(icon);
            }

            const exportData: any = {
              id: project.id,
              name: project.name,
              icon: icon,
              guidelines: project.guidelines,
              categories: project.categories,
              tasks: clonedTasks,
              isTasksExport: isTasksExport
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

            const packBytes = await createPack(exportData, mediaIdsToPack);

            // 3. Write file
            const { writeFile } = await import('@tauri-apps/plugin-fs');
            await writeFile(filePath, packBytes);

            this.showNotification(
              this.settings?.language === 'Deutsch'
                ? 'Erfolgreich exportiert.'
                : 'Exported successfully.',
              'success'
            );
          } catch (e) {
            console.error('Export failed:', e);
            this.showNotification(
              this.settings?.language === 'Deutsch'
                ? `Export fehlgeschlagen: ${e}`
                : `Export failed: ${e}`,
              'error'
            );
          } finally {
            this.hideLoading();
          }
        } catch (e) {
          console.error('Export confirmation outer failed:', e);
        } finally {
          this.exportDialog = null;
        }
      },
      onCancel: () => {
        this.exportDialog = null;
      }
    };
  }

  exportTasks(project: Project, tasks: Task[], categoryName?: string): void {
    const tempProject: Project = {
      ...project,
      tasks: tasks
    };
    this.exportProject(tempProject, categoryName, true);
  }

  async getSavePath(suggestedFilename: string, extension: string, extensionLabel: string): Promise<string | null> {
    try {
      const downloadsBase = await downloadDir();
      const defaultPath = `${downloadsBase}/${suggestedFilename}`;

      return await save({
        defaultPath,
        filters: [{ name: extensionLabel, extensions: [extension] }]
      });
    } catch (e) {
      console.error('Failed to get save path:', e);
      return null;
    }
  }

  async saveFileWithDialog(suggestedFilename: string, content: string): Promise<boolean> {
    try {
      const filePath = await this.getSavePath(suggestedFilename, 'json', 'JSON');

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

  async exportWorkspaceCcpack(): Promise<void> {
    const filePath = await this.getSavePath('canvascritique_workspace.ccpack', 'ccpack', 'Canvas Critique Package');
    if (!filePath) return; // User cancelled

    this.showLoading(this.settings?.language === 'Deutsch' ? 'Exportiere...' : 'Exporting...');
    try {
      // 2. Prepare the workspace export in the background
      const exportProjects = JSON.parse(JSON.stringify(this.projects));
      const mediaIdsToPack: string[] = [];

      for (const proj of exportProjects) {
        proj.canvasSaves = {};
        if (proj.icon && !proj.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(proj.icon)) {
          mediaIdsToPack.push(proj.icon);
        }
        if (proj.tasks) {
          for (const task of proj.tasks) {
            const save = this.getCanvasState(task.id);
            if (save) {
              proj.canvasSaves[task.id] = save;
            }
            if (task.instructionFiles) {
              for (const file of task.instructionFiles) {
                if (file.mediaId) {
                  mediaIdsToPack.push(file.mediaId);
                }
              }
            }
            if (task.solutionFiles) {
              for (const file of task.solutionFiles) {
                if (file.mediaId) {
                  mediaIdsToPack.push(file.mediaId);
                }
              }
            }
            if (task.contextFiles) {
              for (const file of task.contextFiles) {
                if (file.mediaId) {
                  mediaIdsToPack.push(file.mediaId);
                }
              }
            }
            if (task.providedFiles) {
              for (const file of task.providedFiles) {
                if (file.mediaId) {
                  mediaIdsToPack.push(file.mediaId);
                }
              }
            }
          }
        }
      }

      const exportProfiles = JSON.parse(JSON.stringify(this.profiles));
      for (const prof of exportProfiles) {
        if (prof.icon && !prof.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(prof.icon)) {
          mediaIdsToPack.push(prof.icon);
        }
      }

      const payload = {
        version: '1.0',
        projects: exportProjects,
        profiles: exportProfiles,
        activeProfileId: this.activeProfileId
      };

      const packBytes = await createPack(payload, mediaIdsToPack);

      // 3. Write file
      const { writeFile } = await import('@tauri-apps/plugin-fs');
      await writeFile(filePath, packBytes);

      this.showNotification(
        this.settings?.language === 'Deutsch'
          ? 'Erfolgreich exportiert.'
          : 'Exported successfully.',
        'success'
      );
    } catch (e) {
      console.error('Data export failed:', e);
      this.showNotification(
        this.settings?.language === 'Deutsch'
          ? `Export fehlgeschlagen: ${e}`
          : `Export failed: ${e}`,
        'error'
      );
    } finally {
      this.hideLoading();
    }
  }

  async importCcpackFile(fileBytes: Uint8Array): Promise<any> {
    const { jsonHeader, mediaItems } = await parsePack(fileBytes);
    
    // Save all media items to DB/disk, and get their actual saved media IDs (for deduplication)
    const mediaIdMap = new Map<string, string>();
    for (const item of mediaItems) {
      try {
        const newId = await saveMediaBytesToDb(item.id, item.bytes, item.mimeType);
        mediaIdMap.set(item.id, newId);
      } catch (err) {
        console.error(`[store] Failed to import media item ${item.id}:`, err);
      }
    }
    
    // Helper function to recursively replace media IDs in the parsed JSON structure
    const replaceMediaIdsInPayload = (payload: any, map: Map<string, string>): any => {
      if (!payload || typeof payload !== 'object') return payload;

      const replaceId = (id: any) => {
        if (typeof id === 'string' && map.has(id)) {
          return map.get(id);
        }
        return id;
      };

      const cloned = JSON.parse(JSON.stringify(payload));

      const traverse = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) {
            if (obj[i] && typeof obj[i] === 'object') {
              traverse(obj[i]);
            } else {
              obj[i] = replaceId(obj[i]);
            }
          }
        } else {
          for (const key of Object.keys(obj)) {
            if (key === 'icon' || key === 'mediaId' || key === 'relative_path' || key === 'iconMediaId') {
              obj[key] = replaceId(obj[key]);
            } else if (obj[key] && typeof obj[key] === 'object') {
              traverse(obj[key]);
            }
          }
        }
      };

      traverse(cloned);
      return cloned;
    };
    
    return replaceMediaIdsInPayload(jsonHeader, mediaIdMap);
  }

  async recordRequest(
    provider: 'openrouter',
    model: string,
    inputTokens: number,
    outputTokens: number,
    reasoningTokens: number,
    cost: number
  ): Promise<void> {
    if (!this.settings.statsEnabled) return;

    const log: RequestLog = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      timestamp: new Date().toISOString(),
      provider,
      model,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cost
    };

    // Update in-memory reactive state
    this.statsHistory = [...this.statsHistory, log];

    // Insert log into the database
    try {
      const db = this.getDb();
      await insertRequestLog(db, log);
    } catch (err) {
      console.error('Failed to save API log to database:', err);
    }
  }

  async clearStats(): Promise<void> {
    try {
      const db = this.getDb();
      await clearRequestLogs(db);
      this.statsHistory = [];
    } catch (err) {
      console.error('Failed to clear statistics from database:', err);
    }
  }

  async fetchOpenRouterPrices(): Promise<void> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text');
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          this.openRouterModels = data.data;
          const prices: Record<string, { prompt: number; completion: number }> = {};
          for (const model of data.data) {
            prices[model.id] = {
              prompt: parseFloat(model.pricing?.prompt || '0'),
              completion: parseFloat(model.pricing?.completion || '0')
            };
          }
          this.openRouterPrices = prices;
          console.log('[store] Loaded OpenRouter pricing for', Object.keys(prices).length, 'models');
        }
      }
    } catch (err) {
      console.error('[store] Failed to fetch OpenRouter prices:', err);
    }
  }

  showLoading(text: string): void {
    this.isLoading = true;
    this.loadingText = text;
  }

  hideLoading(): void {
    this.isLoading = false;
    this.loadingText = "";
  }

  showNotification(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000): void {
    const id = Math.random().toString(36).substring(2, 9);
    this.notifications.push({ id, message, type });
    setTimeout(() => {
      this.notifications = this.notifications.filter(n => n.id !== id);
    }, duration);
  }

  isTaskChecking(taskId: string): boolean {
    return this.checkingQueue.some(item => item.taskId === taskId && (item.status === 'waiting' || item.status === 'checking'));
  }

  queueTaskChecking(projectId: string, taskId: string, options: any): void {
    const project = this.projects.find(p => p.id === projectId);
    const task = project?.tasks.find(t => t.id === taskId);
    if (!project || !task) return;

    // Remove any existing queue item for this task to avoid duplicates
    this.checkingQueue = this.checkingQueue.filter(item => item.taskId !== taskId);

    const id = Math.random().toString(36).substring(2, 9);
    this.checkingQueue.push({
      id,
      projectId,
      taskId,
      taskName: task.name,
      lessonName: project.name,
      options,
      status: 'waiting'
    });

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this._isProcessingQueue) return;
    this._isProcessingQueue = true;

    try {
      while (true) {
        const nextItem = this.checkingQueue.find(item => item.status === 'waiting');
        if (!nextItem) break;

        nextItem.status = 'checking';

        try {
          const { runCheckWork } = await import('../services/ai');
          const result = await runCheckWork(nextItem.options);

          const feedbackText = result.feedbackText;
          const feedbackScore = result.feedbackScore;
          const feedbackMarkers = result.feedbackMarkers;

          const updatedData: any = {
            critique: {
              feedbackText,
              feedbackScore,
              feedbackMarkers,
              canvasCritique: result.canvasCritique || null,
              textCritique: result.textCritique || null
            }
          };

          if (feedbackScore === 100 && this.settings.autoCompleteOnSuccess) {
            updatedData.completed = true;
          } else {
            updatedData.completed = false;
          }

          await this.updateTask(nextItem.projectId, nextItem.taskId, updatedData);

          nextItem.status = 'completed';

          // Only show notification if the user is NOT currently on the practice canvas for this specific task
          const isOnCurrentTaskCanvas = this.currentView === 'practice' && this.activeTask?.id === nextItem.taskId;
          if (!isOnCurrentTaskCanvas) {
            const { t } = await import('../services/i18n');
            const msg = t('practice.critique.correctedNotification', {
              taskName: nextItem.taskName,
              lessonName: nextItem.lessonName
            });
            this.showNotification(msg, 'success');
          }

        } catch (err: any) {
          console.error(`[store] Queue error checking task ${nextItem.taskId}:`, err);
          nextItem.status = 'failed';
          nextItem.error = err.message || String(err);

          const updatedData = {
            critique: {
              feedbackText: `❌ **Error:**\n\n${err.message || err}`,
              feedbackScore: null,
              feedbackMarkers: []
            }
          };
          await this.updateTask(nextItem.projectId, nextItem.taskId, updatedData);

          const { t } = await import('../services/i18n');
          const msg = `${t('common.error') || 'Error'}: ${err.message || err}`;
          this.showNotification(msg, 'error');
        }

        // Remove from queue
        this.checkingQueue = this.checkingQueue.filter(item => item.id !== nextItem.id);
      }
    } finally {
      this._isProcessingQueue = false;
    }
  }

  async getSettingsExportPayload(): Promise<string> {
    return JSON.stringify(this.settings, null, 2);
  }

  async getDataExportPayload(): Promise<string> {
    const exportProjects = JSON.parse(JSON.stringify(this.projects));
    for (const proj of exportProjects) {
      proj.canvasSaves = {};
      if (proj.icon && !proj.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(proj.icon)) {
        try {
          proj.icon = await getMediaDataUrl(proj.icon);
        } catch (_) {
          proj.icon = 'history_edu';
        }
      }
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
                } catch (err) { console.error('[store] Failed to inline instruction file for full export:', err); }
              }
            }
          }
          if (task.solutionFiles) {
            for (const file of task.solutionFiles) {
              if (file.mediaId && !file.dataUrl) {
                try {
                  file.dataUrl = await getMediaDataUrl(file.mediaId);
                  delete file.mediaId;
                } catch (err) { console.error('[store] Failed to inline solution file for full export:', err); }
              }
            }
          }
          if (task.providedFiles) {
            for (const file of task.providedFiles) {
              if (file.mediaId && !file.dataUrl) {
                try {
                  file.dataUrl = await getMediaDataUrl(file.mediaId);
                  delete file.mediaId;
                } catch (err) { console.error('[store] Failed to inline provided file for full export:', err); }
              }
            }
          }
          if (task.contextFiles) {
            for (const file of task.contextFiles) {
              if (file.mediaId && !file.dataUrl) {
                try {
                  file.dataUrl = await getMediaDataUrl(file.mediaId);
                  delete file.mediaId;
                } catch (err) { console.error('[store] Failed to inline context file for full export:', err); }
              }
            }
          }
        }
      }
    }

    const payload = {
      version: '1.0',
      projects: exportProjects,
      profiles: await (async () => {
        const exportProfiles = JSON.parse(JSON.stringify(this.profiles));
        for (const prof of exportProfiles) {
          if (prof.icon && !prof.icon.startsWith('data:') && /^[a-f0-9-]{36}(\.[a-z0-9]+)?$/i.test(prof.icon)) {
            try {
              prof.icon = await getMediaDataUrl(prof.icon);
            } catch (_) {
              prof.icon = null;
            }
          }
        }
        return exportProfiles;
      })(),
      activeProfileId: this.activeProfileId
    };

    return JSON.stringify(payload, null, 2);
  }
}

// Singleton store instance
export const store = new CanvasCritiqueStore();
