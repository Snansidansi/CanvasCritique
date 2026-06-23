// Svelte 5 Store for ScribeFlow using Runes
const STORAGE_KEY_PROJECTS = 'scribeflow_projects';
const STORAGE_KEY_SETTINGS = 'scribeflow_settings';

// Helper to check for default projects if none exist
const defaultProjects = [
  {
    id: 'spencerian',
    name: 'Spencerian Script',
    icon: 'history_edu',
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

const defaultSettings = {
  theme: 'light',
  apiProvider: 'gemini',
  geminiApiKey: '',
  openRouterApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  openRouterModel: 'google/gemini-flash-1.5',
  openRouterProvider: 'Google',
  autoExport: true,
  exportFrequency: { days: 7, hours: 0, minutes: 30 },
  exportPathSettings: '',
  exportPathData: '',
  autoExportData: true,
  exportFrequencyData: { days: 7, hours: 0, minutes: 30 }
};

// State classes for Svelte 5 Runes reactivity
class ScribeFlowStore {
  // Runes
  currentView = $state('dashboard'); // 'dashboard' | 'practice' | 'settings' | 'task-editor' | 'project-detail'
  projects = $state([]);
  activeProject = $state(null);
  activeTask = $state(null);
  editingTask = $state(null);
  quickAddTaskData = $state(null);
  settings = $state(defaultSettings);

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
      const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
      if (savedProjects) {
        const parsed = JSON.parse(savedProjects);
        // Ensure default categories exist
        parsed.forEach(p => {
          if (!p.categories) {
            p.categories = ['Basics', 'Intermediate', 'Advanced'];
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
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        this.settings = { ...defaultSettings, ...JSON.parse(savedSettings) };
      } else {
        this.settings = defaultSettings;
      }
      
      // Normalize openRouterProvider to an array
      if (this.settings.openRouterProvider && typeof this.settings.openRouterProvider === 'string') {
        this.settings.openRouterProvider = [this.settings.openRouterProvider];
      } else if (!this.settings.openRouterProvider) {
        this.settings.openRouterProvider = ['Google'];
      }
    } catch (e) {
      console.error('Error loading settings', e);
      this.settings = defaultSettings;
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
      categories: ['Basics', 'Intermediate', 'Advanced'],
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
      project.categories = ['Basics', 'Intermediate', 'Advanced'];
    }
    
    if (!project.categories.includes(categoryName)) {
      project.categories.push(categoryName);
      this.saveProjects();
    }
    
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = project;
    }
  }

  addTask(projectId, name, instructions, solution, category = 'Basics') {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const newTask = {
      id: 'task-' + Date.now(),
      name,
      completed: false,
      instructions,
      solution,
      category
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

    task.name = updatedData.name;
    task.instructions = updatedData.instructions;
    task.solution = updatedData.solution;
    task.category = updatedData.category;

    // Auto-add category if it isn't listed
    if (project.categories && !project.categories.includes(updatedData.category)) {
      project.categories.push(updatedData.category);
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

  deleteProject(projectId) {
    this.projects = this.projects.filter(p => p.id !== projectId);
    this.saveProjects();
    if (this.activeProject && this.activeProject.id === projectId) {
      this.activeProject = null;
      this.activeTask = null;
      this.setView('dashboard');
    }
  }
}

// Singleton store instance
export const store = new ScribeFlowStore();
