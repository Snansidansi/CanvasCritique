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
  STORAGE_KEY_PROJECTS,
  STORAGE_KEY_SETTINGS,
  defaultProjects,
  defaultSettings
} from './defaults';

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
  settings = $state<Settings>(defaultSettings);
  customBackgrounds = $state<CustomBackground[]>([]);
  confirmDialog = $state<ConfirmDialog | null>(null);
  exportDialog = $state<ExportDialog | null>(null);
  importDialog = $state<ImportDialog | null>(null);
  canvasSaves = $state<Record<string, any>>({});
  canvasSettingsOpen = $state(false);
  lastDetectedButton = $state<{ button: number; buttons: number; pointerType: string } | null>(null);
  profiles = $state<Profile[]>([]);
  activeProfileId = $state<string>('');
  notification = $state<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

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

  generateNextTaskName(projectId: string): string {
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

  getEffectiveSettings(projectId: string): Settings {
    const project = this.projects.find(p => p.id === projectId);
    const globalSettings = this.settings;
    if (project && project.settingsOverride) {
      const override = project.settingsOverride;
      const isOverrideModel = override.overrideModel ?? override.overrideSettings ?? false;
      const isOverrideCanvas = override.overrideCanvas ?? override.overrideSettings ?? false;
      const isOverrideEvaluation = override.overrideEvaluation ?? override.overrideSettings ?? false;
      const isOverrideSystemPrompt = override.overrideSystemPrompt ?? override.overrideSettings ?? false;
      const isOverrideTaskNumbering = override.overrideTaskNumbering ?? override.overrideSettings ?? false;
      const isAnyOverride = isOverrideModel || isOverrideCanvas || isOverrideEvaluation || isOverrideSystemPrompt || isOverrideTaskNumbering;

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
        customSystemPrompt: isOverrideSystemPrompt ? (override.customSystemPrompt !== undefined && override.customSystemPrompt !== null ? override.customSystemPrompt : globalSettings.customSystemPrompt) : globalSettings.customSystemPrompt,
        language: isAnyOverride ? (override.language ?? globalSettings.language) : globalSettings.language,
        canvasMode: isOverrideCanvas ? (override.canvasMode ?? globalSettings.canvasMode) : globalSettings.canvasMode,
        autoNumberTasks: isOverrideTaskNumbering ? (override.autoNumberTasks ?? globalSettings.autoNumberTasks) : globalSettings.autoNumberTasks,
        taskNumberingTemplate: isOverrideTaskNumbering ? (override.taskNumberingTemplate ?? globalSettings.taskNumberingTemplate) : globalSettings.taskNumberingTemplate
      };
    }
    return globalSettings;
  }

  constructor() {
    this.loadState();
  }

  loadState() {
    // Load Profiles
    try {
      const savedProfiles = localStorage.getItem('canvascritique_profiles');
      const savedActiveProfileId = localStorage.getItem('canvascritique_active_profile_id');
      
      if (savedProfiles) {
        this.profiles = JSON.parse(savedProfiles);
      } else {
        // Create default profile
        this.profiles = [
          {
            id: 'default-profile',
            name: 'General',
            icon: null,
            color: '#3b82f6'
          }
        ];
        localStorage.setItem('canvascritique_profiles', JSON.stringify(this.profiles));
      }
      
      if (savedActiveProfileId && this.profiles.some(p => p.id === savedActiveProfileId)) {
        this.activeProfileId = savedActiveProfileId;
      } else {
        this.activeProfileId = this.profiles[0]?.id || 'default-profile';
      }
    } catch (e) {
      console.error('Error loading profiles', e);
      this.profiles = [{ id: 'default-profile', name: 'General', icon: null, color: '#3b82f6' }];
      this.activeProfileId = 'default-profile';
    }

    // Load Projects
    try {
      const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS) || localStorage.getItem('scribeflow_projects');
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects);
        // Ensure categories exist and profileId exist
        parsed.forEach(p => {
          if (!p.categories) {
            p.categories = [];
          }
          if (!p.profileId) {
            p.profileId = 'default-profile';
          }
          if (p.tasks) {
            p.tasks.forEach(t => {
              if (t.instructionFile && (!t.instructionFiles || t.instructionFiles.length === 0)) {
                t.instructionFiles = [t.instructionFile];
              }
              if (t.solutionFile && (!t.solutionFiles || t.solutionFiles.length === 0)) {
                t.solutionFiles = [t.solutionFile];
              }
              if (!t.instructionFiles) {
                t.instructionFiles = [];
              }
              if (!t.solutionFiles) {
                t.solutionFiles = [];
              }
            });
          }
        });
        this.projects = parsed;
      } else {
        this.projects = defaultProjects;
        // Assign default projects to default-profile
        this.projects.forEach(p => {
          p.profileId = 'default-profile';
        });
        this.saveProjects();
      }
    } catch (e) {
      console.error('Error loading projects', e);
      this.projects = defaultProjects;
    }

    // Load Settings
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS) || localStorage.getItem('scribeflow_settings');
      if (savedSettings) {
        this.settings = { ...defaultSettings, ...JSON.parse(savedSettings) };
      } else {
        this.settings = defaultSettings;
      }

      // Ensure statistics fields exist for backward compatibility
      if (!this.settings.hasOwnProperty('statsEnabled')) {
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

      // Normalize openRouterProvider to an array
      if (this.settings.openRouterProvider && typeof this.settings.openRouterProvider === 'string') {
        this.settings.openRouterProvider = [this.settings.openRouterProvider];
      } else if (!this.settings.openRouterProvider) {
        this.settings.openRouterProvider = [];
      }
    } catch (e) {
      console.error('Error loading settings', e);
      this.settings = defaultSettings;
    }

    // Load Custom Backgrounds
    try {
      const savedCustomBgs = localStorage.getItem('canvascritique_custom_backgrounds') || localStorage.getItem('scribeflow_custom_backgrounds');
      if (savedCustomBgs) {
        this.customBackgrounds = JSON.parse(savedCustomBgs);
      } else {
        this.customBackgrounds = [];
      }
    } catch (e) {
      console.error('Error loading custom backgrounds', e);
      this.customBackgrounds = [];
    }

    // Load Canvas Saves
    try {
      const savedSaves = localStorage.getItem('canvascritique_canvas_saves') || localStorage.getItem('scribeflow_canvas_saves');
      if (savedSaves) {
        this.canvasSaves = JSON.parse(savedSaves);
      } else {
        this.canvasSaves = {};
      }
    } catch (e) {
      console.error('Error loading canvas saves', e);
      this.canvasSaves = {};
    }

    // Apply initial theme
    this.applyTheme(this.settings.theme);
  }

  // Persist calls
  saveProjects() {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(this.projects));
  }

  saveSettings() {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
    this.applyTheme(this.settings.theme);
  }

  saveProfiles() {
    localStorage.setItem('canvascritique_profiles', JSON.stringify(this.profiles));
    localStorage.setItem('canvascritique_active_profile_id', this.activeProfileId);
  }

  addProfile(name: string, icon: string | null = null, color: string = '#3b82f6') {
    const newProfile = {
      id: 'profile-' + Date.now(),
      name,
      icon,
      color
    };
    this.profiles.push(newProfile);
    this.saveProfiles();
    return newProfile;
  }

  updateProfile(id: string, updated: { name?: string; icon?: string | null; color?: string }) {
    const profile = this.profiles.find(p => p.id === id);
    if (!profile) return;
    if (updated.name !== undefined) profile.name = updated.name;
    if (updated.icon !== undefined) profile.icon = updated.icon;
    if (updated.color !== undefined) profile.color = updated.color;
    this.saveProfiles();
  }

  deleteProfile(id: string) {
    if (this.profiles.length <= 1) return; // Do not delete the last profile
    
    // Remove lessons for this profile
    this.projects = this.projects.filter(p => p.profileId !== id);
    this.saveProjects();

    // Remove profile
    this.profiles = this.profiles.filter(p => p.id !== id);
    
    // Fallback activeProfileId if the deleted was active
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles[0].id;
    }
    
    this.saveProfiles();
  }

  selectProfile(id: string) {
    if (this.profiles.some(p => p.id === id)) {
      this.activeProfileId = id;
      this.saveProfiles();
    }
  }

  saveCustomBackgrounds() {
    localStorage.setItem('canvascritique_custom_backgrounds', JSON.stringify(this.customBackgrounds));
  }

  addCustomBackground(name: string, url: string, icon: string | null = null): CustomBackground {
    const newBg = {
      id: 'custom-bg-' + Date.now(),
      name,
      url,
      icon: icon || url
    };
    this.customBackgrounds.push(newBg);
    this.saveCustomBackgrounds();
    return newBg;
  }

  deleteCustomBackground(id: string): void {
    this.customBackgrounds = this.customBackgrounds.filter(bg => bg.id !== id);
    this.saveCustomBackgrounds();
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
  addProject(name: string, icon: string = 'history_edu'): Project {
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
    this.saveProjects();

    if (this.activeProject && this.activeProject.id === newProj.id) {
      this.activeProject = newProj;
    }
    return newProj;
  }

  addCategory(projectId: string, categoryName: string): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    if (!project.categories) {
      project.categories = [];
    }

    if (!project.categories.includes(categoryName)) {
      project.categories.push(categoryName);
      this.saveProjects();
    }

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  renameCategory(projectId: string, oldName: string, newName: string): void {
    if (!newName || !newName.trim() || oldName === newName) return;
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // 1. Rename inside categories array
    if (project.categories) {
      project.categories = project.categories.map(c => c === oldName ? newName.trim() : c);
    }

    // 2. Rename inside tasks
    if (project.tasks) {
      project.tasks.forEach(t => {
        if ((t.category || 'Basics') === oldName) {
          t.category = newName.trim();
        }
      });
    }

    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  deleteCategory(projectId: string, categoryName: string): void {
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

    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  addTask(
    projectId: string,
    name: string,
    instructions: string,
    solution: string,
    category: string = 'Basics',
    instructionFiles: any[] = [],
    solutionFiles: any[] = []
  ): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask: Task = {
      id: 'task-' + Date.now(),
      name,
      completed: false,
      instructions,
      solution,
      category,
      instructionFiles,
      solutionFiles
    };

    project.tasks.push(newTask);

    // Auto-add category if it isn't listed
    if (project.categories && !project.categories.includes(category)) {
      project.categories.push(category);
    }

    this.saveProjects();

    // Update active project reference if it is active
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  updateTask(projectId: string, taskId: string, updatedData: Partial<Task>): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (updatedData.name !== undefined) task.name = updatedData.name;
    if (updatedData.instructions !== undefined) task.instructions = updatedData.instructions;
    if (updatedData.solution !== undefined) task.solution = updatedData.solution;
    if (updatedData.category !== undefined) task.category = updatedData.category;
    if (updatedData.instructionFiles !== undefined) task.instructionFiles = updatedData.instructionFiles;
    if (updatedData.solutionFiles !== undefined) task.solutionFiles = updatedData.solutionFiles;
    if (updatedData.instructionFile !== undefined) task.instructionFile = updatedData.instructionFile;
    if (updatedData.solutionFile !== undefined) task.solutionFile = updatedData.solutionFile;
    if (updatedData.completed !== undefined) task.completed = updatedData.completed;
    if (updatedData.critique !== undefined) task.critique = updatedData.critique;

    // Auto-add category if it isn't listed
    if (task.category && project.categories && !project.categories.includes(task.category)) {
      project.categories.push(task.category);
    }

    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = task;
    }
  }

  reorderTasks(projectId: string, category: string, taskIdsOrder: string[]): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // Filter tasks by category vs others
    const categoryTasks = project.tasks.filter(t => (t.category || 'Basics') === category);
    const otherTasks = project.tasks.filter(t => (t.category || 'Basics') !== category);

    // Reorder categoryTasks in-place based on taskIdsOrder index
    categoryTasks.sort((a, b) => {
      const idxA = taskIdsOrder.indexOf(a.id);
      const idxB = taskIdsOrder.indexOf(b.id);
      return idxA - idxB;
    });

    project.tasks = [...otherTasks, ...categoryTasks];
    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  moveAndReorderTask(projectId: string, taskId: string, targetCategory: string, targetIndex: number): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Update category
    task.category = targetCategory;

    // Filter tasks
    const otherTasks = project.tasks.filter(t => t.id !== taskId);
    const targetCategoryTasks = otherTasks.filter(t => (t.category || 'Basics') === targetCategory);
    const nonTargetCategoryTasks = otherTasks.filter(t => (t.category || 'Basics') !== targetCategory);

    // Insert task at targetIndex
    targetCategoryTasks.splice(targetIndex, 0, task);

    // Set new tasks array
    project.tasks = [...nonTargetCategoryTasks, ...targetCategoryTasks];
    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  toggleTaskCompleted(projectId: string, taskId: string): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    this.saveProjects();

    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask = task;
    }
  }

  deleteTask(projectId: string, taskId: string): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    project.tasks = project.tasks.filter(t => t.id !== taskId);
    this.saveProjects();

    // Clean up canvas saves for this task too
    if (this.canvasSaves[taskId]) {
      delete this.canvasSaves[taskId];
      localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
    }

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

  deleteTasks(projectId: string, taskIds: string[]): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    project.tasks = project.tasks.filter(t => !taskIds.includes(t.id));
    this.saveProjects();

    let canvasSavesChanged = false;
    for (const taskId of taskIds) {
      if (this.canvasSaves[taskId]) {
        delete this.canvasSaves[taskId];
        canvasSavesChanged = true;
      }
    }
    if (canvasSavesChanged) {
      localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
    }

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

  updateProjectGuidelines(projectId: string, guidelines: string): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    project.guidelines = guidelines;
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  updateProjectDetails(projectId: string, updates: { name?: string; icon?: string }): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    if (updates.name !== undefined) project.name = updates.name;
    if (updates.icon !== undefined) project.icon = updates.icon;
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  deleteProject(projectId: string): void {
    const project = this.projects.find(p => p.id === projectId);
    if (project && project.tasks) {
      for (const t of project.tasks) {
        if (this.canvasSaves[t.id]) {
          delete this.canvasSaves[t.id];
        }
      }
      localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
    }

    this.projects = this.projects.filter(p => p.id !== projectId);
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = null;
      this.activeTask = null;
      this.setView('dashboard');
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

  saveCanvasState(taskId: string, data: any): void {
    this.canvasSaves[taskId] = data;
    localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
  }

  getCanvasState(taskId: string): any {
    return this.canvasSaves[taskId] || null;
  }

  importProject(projectData: any, targetProjectId?: string): void {
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
      onConfirm: (options) => {
        this.executeImportProject(projectData, options);
        this.importDialog = null;
      },
      onCancel: () => {
        this.importDialog = null;
      }
    };
  }

  private executeImportProject(
    projectData: any,
    options: {
      importCritique: boolean;
      importCanvas: boolean;
      importCompleted: boolean;
      mergeProjectId?: string;
      mergeMode?: 'update' | 'skip';
    }
  ): void {
    const data = Array.isArray(projectData) ? projectData : [projectData];
    let lastImported: Project | null = null;

    const mergeProject = options.mergeProjectId
      ? this.projects.find(p => p.id === options.mergeProjectId)
      : null;

    if (mergeProject) {
      for (const proj of data) {
        if (!proj || typeof proj !== 'object') continue;

        const importedCanvasSaves = proj.canvasSaves || {};
        const importedTasks = proj.tasks || [];

        for (const t of importedTasks) {
          if (!t.name) continue;

          // Match by name (case-insensitive, trimmed)
          const matchedTask = mergeProject.tasks.find(
            et => et.name.trim().toLowerCase() === t.name.trim().toLowerCase()
          );

          if (matchedTask) {
            if (options.mergeMode === 'update') {
              matchedTask.instructions = t.instructions !== undefined ? t.instructions : matchedTask.instructions;
              matchedTask.solution = t.solution !== undefined ? t.solution : matchedTask.solution;
              matchedTask.category = t.category !== undefined ? t.category : matchedTask.category;

              if (t.instructionFiles !== undefined) {
                matchedTask.instructionFiles = t.instructionFiles;
              } else if (t.instructionFile) {
                matchedTask.instructionFiles = [t.instructionFile];
              }

              if (t.solutionFiles !== undefined) {
                matchedTask.solutionFiles = t.solutionFiles;
              } else if (t.solutionFile) {
                matchedTask.solutionFiles = [t.solutionFile];
              }

              if (options.importCompleted) {
                matchedTask.completed = !!t.completed;
              }

              if (options.importCritique) {
                matchedTask.critique = t.critique !== undefined ? t.critique : null;
              }

              if (options.importCanvas && t.id && importedCanvasSaves[t.id]) {
                this.canvasSaves[matchedTask.id] = importedCanvasSaves[t.id];
              }
            }
          } else {
            // Add new task
            let taskId = t.id;
            const isDuplicateId = taskId && this.projects.some(p => p.tasks.some(et => et.id === taskId));
            if (!taskId || isDuplicateId) {
              taskId = 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
            }

            if (options.importCanvas && t.id && importedCanvasSaves[t.id]) {
              this.canvasSaves[taskId] = importedCanvasSaves[t.id];
            }

            let instructionFiles = t.instructionFiles || [];
            if (t.instructionFile && instructionFiles.length === 0) {
              instructionFiles = [t.instructionFile];
            }
            let solutionFiles = t.solutionFiles || [];
            if (t.solutionFile && solutionFiles.length === 0) {
              solutionFiles = [t.solutionFile];
            }

            const newTask: Task = {
              ...t,
              id: taskId,
              completed: options.importCompleted ? !!t.completed : false,
              instructionFiles,
              solutionFiles,
              instructionFile: null,
              solutionFile: null
            };

            if (!options.importCritique) {
              delete newTask.critique;
            }

            mergeProject.tasks.push(newTask);

            const cat = newTask.category || 'Basics';
            if (mergeProject.categories && !mergeProject.categories.includes(cat)) {
              mergeProject.categories.push(cat);
            }
          }
        }
      }
      lastImported = mergeProject;
    } else {
      // Import as a new lesson
      for (const proj of data) {
        if (!proj || typeof proj !== 'object' || !proj.name) continue;

        let newId = proj.id;
        if (!newId || this.projects.some(p => p.id === newId)) {
          newId = 'proj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        }

        const categories = proj.categories || [];
        const importedCanvasSaves = proj.canvasSaves || {};

        const tasks = (proj.tasks || []).map((t: any, idx: number) => {
          const oldTaskId = t.id;
          let taskId = t.id;
          const isDuplicateId = taskId && this.projects.some(p => p.tasks.some(existingTask => existingTask.id === taskId));
          if (!taskId || isDuplicateId) {
            taskId = 'task-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 5);
          }

          if (options.importCanvas && oldTaskId && importedCanvasSaves[oldTaskId]) {
            this.canvasSaves[taskId] = importedCanvasSaves[oldTaskId];
          }

          let instructionFiles = t.instructionFiles || [];
          if (t.instructionFile && instructionFiles.length === 0) {
            instructionFiles = [t.instructionFile];
          }
          let solutionFiles = t.solutionFiles || [];
          if (t.solutionFile && solutionFiles.length === 0) {
            solutionFiles = [t.solutionFile];
          }

          const taskCopy = {
            ...t,
            id: taskId,
            completed: options.importCompleted ? !!t.completed : false,
            instructionFiles,
            solutionFiles,
            instructionFile: null,
            solutionFile: null
          };

          if (!options.importCritique) {
            delete taskCopy.critique;
          }

          return taskCopy;
        });

        const newProj: Project = {
          ...proj,
          id: newId,
          name: proj.name,
          icon: proj.icon || 'history_edu',
          guidelines: proj.guidelines || '',
          categories,
          tasks,
          profileId: this.activeProfileId
        };

        if ('canvasSaves' in newProj) {
          delete (newProj as any).canvasSaves;
        }

        this.projects.push(newProj);
        lastImported = newProj;
      }
    }

    if (lastImported) {
      localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
      this.saveProjects();
      this.selectProject(lastImported);
      this.setView('project-detail');
    } else {
      console.warn('Could not find any valid lesson to import.');
    }
  }

  exportProject(project: Project): void {
    const hasCritique = !!(project.tasks && project.tasks.some(t => t.critique));
    const hasCanvas = !!(project.tasks && project.tasks.some(t => this.canvasSaves[t.id]));

    this.exportDialog = {
      project,
      hasCritique,
      hasCanvas,
      onConfirm: async (options) => {
        // Clone the project to avoid mutating active runtime state
        const exportData = JSON.parse(JSON.stringify(project));
        
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
        this.exportDialog = null;
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

  /**
   * Save a text/JSON file. Uses Tauri's native save dialog when available,
   * falls back to a browser anchor-download otherwise.
   */
  async saveFileWithDialog(suggestedFilename: string, content: string): Promise<void> {
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const dialogModule = '@tauri-apps/plugin-dialog';
        const fsModule = '@tauri-apps/plugin-fs';
        const { save } = await import(/* @vite-ignore */ dialogModule);
        const { writeTextFile } = await import(/* @vite-ignore */ fsModule);

        const filePath = await save({
          defaultPath: suggestedFilename,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (filePath) {
          await writeTextFile(filePath, content);
          this.showNotification('Exported to Downloads folder.', 'success');
        }
        return;
      }
    } catch (e) {
      console.warn('Tauri save dialog failed, falling back to browser download:', e);
    }

    // Browser fallback
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(content);
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', suggestedFilename);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    this.showNotification('Exported to Downloads folder.', 'success');
  }

  recordRequest(
    provider: 'gemini' | 'openrouter',
    model: string,
    inputTokens: number,
    outputTokens: number,
    reasoningTokens: number,
    cost: number
  ): void {
    if (!this.settings.statsEnabled) return;
    if (!this.settings.stats) {
      this.settings.stats = { daily: {} };
    }
    if (!this.settings.stats.daily) {
      this.settings.stats.daily = {};
    }
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
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

    this.saveSettings();
  }

  showNotification(message: string, type: 'success' | 'error' | 'info' = 'success', duration = 3000): void {
    this.notification = { message, type };
    setTimeout(() => {
      if (this.notification && this.notification.message === message) {
        this.notification = null;
      }
    }, duration);
  }
}

// Singleton store instance
export const store = new CanvasCritiqueStore();
