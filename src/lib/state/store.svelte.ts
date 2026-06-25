// Svelte 5 Store for CanvasCritique using Runes

export interface Task {
  id: string;
  name: string;
  completed: boolean;
  instructions: string;
  solution: string;
  category: string;
  instructionFiles?: Array<{ name: string; dataUrl?: string }>;
  solutionFiles?: Array<{ name: string; dataUrl?: string }>;
  instructionFile?: { name: string; dataUrl?: string } | null; // legacy
  solutionFile?: { name: string; dataUrl?: string } | null; // legacy
  critique?: {
    feedbackText: string;
    feedbackScore: number | null;
    feedbackMarkers: any[];
  } | null;
}

export interface Project {
  id: string;
  name: string;
  icon: string;
  guidelines?: string;
  categories: string[];
  tasks: Task[];
  profileId: string;
  hideCompleted?: boolean;
}

export interface StylusButton {
  id: string;
  name: string;
  button: number;
  buttons: number;
  action: string;
}

export interface Settings {
  theme: string;
  apiProvider: string;
  geminiApiKey: string;
  openRouterApiKey: string;
  geminiModel: string;
  openRouterModel: string;
  openRouterProvider: string[];
  openRouterReasoning: boolean;
  autoExport: boolean;
  exportFrequency: { days: number; hours: number; minutes: number };
  exportPathSettings: string;
  exportPathData: string;
  autoExportData: boolean;
  exportFrequencyData: { days: number; hours: number; minutes: number };
  sendTaskMedia: boolean;
  sendSolutionMedia: boolean;
  sendCanvasBackground: boolean;
  canvasMode: string;
  customSystemPrompt: string;
  systemPromptEditingEnabled: boolean;
  language: string;
  stylusButtons: StylusButton[];
  stylusMode: boolean;
}

export interface Profile {
  id: string;
  name: string;
  icon: string | null;
  color: string;
}

export interface CustomBackground {
  id: string;
  name: string;
  url: string;
  icon: string | null;
}

export interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ExportDialog {
  project: Project;
  hasCritique: boolean;
  hasCanvas: boolean;
  onConfirm: (options: { includeCritique: boolean; includeCanvas: boolean; includeCompleted: boolean }) => void;
  onCancel: () => void;
}

export interface ImportDialog {
  projectData: any;
  hasCritique: boolean;
  hasCanvas: boolean;
  targetProjectId?: string;
  onConfirm: (options: {
    importCritique: boolean;
    importCanvas: boolean;
    importCompleted: boolean;
    mergeProjectId?: string;
    mergeMode?: 'update' | 'skip';
  }) => void;
  onCancel: () => void;
}

const STORAGE_KEY_PROJECTS = 'canvascritique_projects';
const STORAGE_KEY_SETTINGS = 'canvascritique_settings';

// Helper to check for default projects if none exist
const defaultProjects: Project[] = [
  {
    id: 'spencerian',
    name: 'Spencerian Script',
    icon: 'history_edu',
    guidelines: '',
    categories: ['Basics', 'Intermediate', 'Advanced'],
    profileId: 'default-profile',
    tasks: [
      {
        id: 'sp-1',
        name: 'Grip & Posture',
        completed: true,
        category: 'Basics',
        instructions: 'Focus on holding the pen at a 45-degree angle. Relax your hand muscles and sit upright.',
        solution: 'Relaxed hand, correct finger placement, upright spine.'
      },
      {
        id: 'sp-2',
        name: 'Basic Ovals',
        completed: false,
        category: 'Basics',
        instructions: 'Practice drawing smooth ovals at a 55-degree slant. Fill half a page.',
        solution: 'Consistent 55-degree slant, smooth curved lines, baseline touch.'
      },
      {
        id: 'sp-3',
        name: 'Upper Loops (l, h, k, b)',
        completed: false,
        category: 'Intermediate',
        instructions: 'Start at the baseline with a light upward stroke.\nMaintain a consistent 55-degree slant throughout the entire loop.\nThe peak of the loop should touch the ascender line gently.\nThe downward stroke should be slightly thicker (a "swell") as it returns to the baseline.\nThe cross-over point should be exactly at the header line.',
        solution: 'Symmetrical upper loops crossing exactly at the header line.'
      }
    ]
  },
  {
    id: 'copperplate',
    name: 'Copperplate Basics',
    icon: 'draw',
    guidelines: '',
    categories: ['Basics', 'Intermediate', 'Advanced'],
    profileId: 'default-profile',
    tasks: [
      {
        id: 'cp-1',
        name: 'Lowercase Connectors',
        completed: true,
        category: 'Intermediate',
        instructions: 'Connect lowercase letters with hairline upward entries and shaded downward strokes.',
        solution: 'Consistent connector angle and distinct weight contrast.'
      },
      {
        id: 'cp-2',
        name: 'Capital Stem Strokes',
        completed: false,
        category: 'Advanced',
        instructions: 'Create the universal capital stem with a curved swell.',
        solution: 'Smooth transitions from hairline to full shaded swell.'
      }
    ]
  },
  {
    id: 'penmanship',
    name: 'Business Penmanship',
    icon: 'ink_pen',
    categories: ['Basics', 'Intermediate', 'Advanced'],
    profileId: 'default-profile',
    tasks: [
      {
        id: 'bp-1',
        name: 'Flourishing Basics',
        completed: false,
        category: 'Advanced',
        instructions: 'Extend loop lines into elegant, crossing sweeps.',
        solution: 'Symmetrical loops, clean line intersections without wobbles.'
      }
    ]
  }
];

export const DEFAULT_SYSTEM_PROMPT = `You are a thorough but encouraging teacher evaluating a student's handwritten work.

Task name: "{{task_name}}"
{{task_instructions}}
{{task_solution}}
{{guidelines}}
{{page_info}}

**Image dimensions (IMPORTANT for marker placement):**
{{image_dimensions}}
The images provided are cropped versions of the canvas. 
Your marker x,y coordinates MUST be relative to the top-left corner (0,0) of the corresponding cropped image, normalized to a range of 0 to 1000 (where 0 is the top/left edge and 1000 is the bottom/right edge of the cropped image).
Place the marker EXACTLY where you would logically put a checkmark or cross next to the student's answer.

**Your job:**
1. Read the student's handwritten answers from the image(s).
2. Compare each answer against the expected solution and task instructions.
3. Mark each answer/exercise as correct, incorrect, or partially correct. Be extremely accurate and strict about correctness!
4. Do NOT critique handwriting quality, neatness, or penmanship unless the task instructions explicitly ask for it.
5. Focus on whether the student's answers/work is factually and logically correct.
6. If an answer is incorrect, your feedback MUST be extremely brief (1 sentence max), stating exactly what is wrong and what the correct expected answer is.

You must return a JSON object with the following schema:
{
  "generalCritique": "Markdown formatted string containing your overall feedback. Keep it brief, constructive, and focused on correctness. Mention which exercises are correct and which need fixing.",
  "grade": number (0-100, based on correctness of answers),
  "markers": [
    {
      "pageIndex": number (0-based index of the image in the sent sequence, default to 0 if only one image),
      "x": number (X coordinate from 0 to 1000, representing the position relative to the cropped page width),
      "y": number (Y coordinate from 0 to 1000, representing the position relative to the cropped page height),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Specific feedback. Keep it extremely short (1 sentence maximum). If correct, ONLY write 'Correct'. If incorrect, briefly state what is wrong and specify the correct expected answer (do not write long generic paragraphs).",
      "underlinePoints": [ // Optional. Only for incorrect or partial answers to highlight the problematic area.
        {"x": number, "y": number}, ... (coordinate points from 0 to 1000 relative to the cropped page width/height)
      ]
    }
  ]
}

Return ONLY this JSON object. Do not include any other conversational text.`;

const defaultSettings: Settings = {
  theme: 'system',
  apiProvider: 'gemini',
  geminiApiKey: '',
  openRouterApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  openRouterModel: 'google/gemini-flash-1.5',
  openRouterProvider: [],
  openRouterReasoning: true,
  autoExport: false,
  exportFrequency: { days: 7, hours: 0, minutes: 30 },
  exportPathSettings: '',
  exportPathData: '',
  autoExportData: false,
  exportFrequencyData: { days: 7, hours: 0, minutes: 30 },
  sendTaskMedia: true,
  sendSolutionMedia: true,
  sendCanvasBackground: true,
  canvasMode: 'infinite',
  customSystemPrompt: '',
  systemPromptEditingEnabled: false,
  language: 'English',
  stylusButtons: [],
  stylusMode: false
};

// State classes for Svelte 5 Runes reactivity
class CanvasCritiqueStore {
  // Runes
  currentView = $state('dashboard'); // 'dashboard' | 'practice' | 'settings' | 'task-editor' | 'project-detail'
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
      onConfirm: (options) => {
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

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
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
