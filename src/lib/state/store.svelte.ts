// Svelte 5 Store for CanvasCritique using Runes
const STORAGE_KEY_PROJECTS = 'canvascritique_projects';
const STORAGE_KEY_SETTINGS = 'canvascritique_settings';

// Helper to check for default projects if none exist
const defaultProjects = [
  {
    id: 'spencerian',
    name: 'Spencerian Script',
    icon: 'history_edu',
    guidelines: '',
    categories: ['Basics', 'Intermediate', 'Advanced'],
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

const defaultSettings = {
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
  canvasMode: 'infinite',
  customSystemPrompt: '',
  systemPromptEditingEnabled: false,
  language: 'de',
  stylusButtons: [
    { id: 'default-eraser-tip', name: 'Eraser Tip', button: 5, buttons: 32, action: 'eraser' },
    { id: 'default-barrel-1', name: 'Barrel Button 1', button: 2, buttons: 2, action: 'eraser' },
    { id: 'default-barrel-2', name: 'Barrel Button 2', button: 1, buttons: 4, action: 'select' }
  ]
};

// State classes for Svelte 5 Runes reactivity
class CanvasCritiqueStore {
  // Runes
  currentView = $state('dashboard'); // 'dashboard' | 'practice' | 'settings' | 'task-editor' | 'project-detail'
  projects = $state([]);
  activeProject = $state(null);
  activeTask = $state(null);
  editingTask = $state(null);
  quickAddTaskData = $state(null);
  settings = $state(defaultSettings);
  customBackgrounds = $state([]);
  confirmDialog = $state(null);
  canvasSaves = $state({});
  canvasSettingsOpen = $state(false);
  lastDetectedButton = $state<{ button: number; buttons: number; pointerType: string } | null>(null);

  // Getters for dynamic API/Model selection
  get apiKey() {
    return this.settings.apiProvider === 'gemini'
      ? this.settings.geminiApiKey
      : this.settings.openRouterApiKey;
  }

  get model() {
    return this.settings.apiProvider === 'gemini'
      ? this.settings.geminiModel
      : this.settings.openRouterModel;
  }

  constructor() {
    this.loadState();
  }

  loadState() {
    // Load Projects
    try {
      const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS) || localStorage.getItem('scribeflow_projects');
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects);
        // Ensure categories exist
        parsed.forEach(p => {
          if (!p.categories) {
            p.categories = [];
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
        this.settings.stylusButtons = [
          { id: 'default-eraser-tip', name: 'Eraser Tip', button: 5, buttons: 32, action: 'eraser' },
          { id: 'default-barrel-1', name: 'Barrel Button 1', button: 2, buttons: 2, action: 'eraser' },
          { id: 'default-barrel-2', name: 'Barrel Button 2', button: 1, buttons: 4, action: 'select' }
        ];
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

  saveCustomBackgrounds() {
    localStorage.setItem('canvascritique_custom_backgrounds', JSON.stringify(this.customBackgrounds));
  }

  addCustomBackground(name, url, icon = null) {
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

  deleteCustomBackground(id) {
    this.customBackgrounds = this.customBackgrounds.filter(bg => bg.id !== id);
    this.saveCustomBackgrounds();
  }

  recordPointerEvent(e: PointerEvent) {
    if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
      this.lastDetectedButton = {
        button: e.button,
        buttons: e.buttons,
        pointerType: e.pointerType
      };
    }
  }

  applyTheme(theme) {
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
  setView(view) {
    this.currentView = view;
  }

  selectProject(project) {
    this.activeProject = project;
  }

  selectTask(task) {
    this.activeTask = task;
    this.setView('practice');
  }

  setEditingTask(task) {
    this.editingTask = task;
    this.setView('task-editor');
  }

  // Mutation actions
  addProject(name, icon = 'history_edu') {
    const newProj = {
      id: 'proj-' + Date.now(),
      name,
      icon,
      guidelines: '',
      categories: [],
      tasks: []
    };
    this.projects.push(newProj);
    this.saveProjects();

    if (this.activeProject && this.activeProject.id === newProj.id) {
      this.activeProject = newProj;
    }
    return newProj;
  }

  addCategory(projectId, categoryName) {
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

  renameCategory(projectId, oldName, newName) {
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

  addTask(projectId, name, instructions, solution, category = 'Basics', instructionFiles = [], solutionFiles = []) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask = {
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

  updateTask(projectId, taskId, updatedData) {
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

  reorderTasks(projectId, category, taskIdsOrder) {
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

  moveAndReorderTask(projectId, taskId, targetCategory, targetIndex) {
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

  toggleTaskCompleted(projectId, taskId) {
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

  updateProjectGuidelines(projectId, guidelines) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    project.guidelines = guidelines;
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  deleteProject(projectId) {
    this.projects = this.projects.filter(p => p.id !== projectId);
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = null;
      this.activeTask = null;
      this.setView('dashboard');
    }
  }

  confirm(title, message, onConfirm, onCancel = null) {
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

  saveCanvasState(taskId, data) {
    this.canvasSaves[taskId] = data;
    localStorage.setItem('canvascritique_canvas_saves', JSON.stringify(this.canvasSaves));
  }

  getCanvasState(taskId) {
    return this.canvasSaves[taskId] || null;
  }

  importProject(projectData: any) {
    const data = Array.isArray(projectData) ? projectData : [projectData];
    let lastImported = null;

    for (const proj of data) {
      if (!proj || typeof proj !== 'object' || !proj.name) continue;

      // Check if project.id already exists to avoid conflict, or generate a new unique ID
      let newId = proj.id;
      if (!newId || this.projects.some(p => p.id === newId)) {
        newId = 'proj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      }

      // Ensure categories exist
      const categories = proj.categories || [];

      // Ensure tasks exist and are initialized
      const tasks = (proj.tasks || []).map((t: any, idx: number) => {
        let taskId = t.id;
        if (!taskId) {
          taskId = 'task-' + Date.now() + '-' + idx + '-' + Math.random().toString(36).substring(2, 5);
        }
        
        // Normalize legacy files
        let instructionFiles = t.instructionFiles || [];
        if (t.instructionFile && instructionFiles.length === 0) {
          instructionFiles = [t.instructionFile];
        }
        let solutionFiles = t.solutionFiles || [];
        if (t.solutionFile && solutionFiles.length === 0) {
          solutionFiles = [t.solutionFile];
        }

        return {
          ...t,
          id: taskId,
          completed: !!t.completed,
          instructionFiles,
          solutionFiles,
          instructionFile: null,
          solutionFile: null
        };
      });

      const newProj = {
        ...proj,
        id: newId,
        name: proj.name,
        icon: proj.icon || 'history_edu',
        guidelines: proj.guidelines || '',
        categories,
        tasks
      };

      this.projects.push(newProj);
      lastImported = newProj;
    }

    if (lastImported) {
      this.saveProjects();
      this.selectProject(lastImported);
      this.setView('project-detail');
      alert('Lesson(s) imported successfully!');
    } else {
      alert('Could not find any valid lesson to import.');
    }
  }

  exportProject(project: any) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `lesson_${project.name.toLowerCase().replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}

// Singleton store instance
export const store = new CanvasCritiqueStore();
