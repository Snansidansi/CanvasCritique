// Svelte 5 Store for ScribeFlow using Runes
const STORAGE_KEY_PROJECTS = 'scribeflow_projects';
const STORAGE_KEY_SETTINGS = 'scribeflow_settings';

// Helper to check for default projects if none exist
const defaultProjects = [
  {
    id: 'spencerian',
    name: 'Spencerian Script',
    icon: 'history_edu',
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
  apiKey: '',
  model: 'gemini-1.5-flash',
  autoExport: true,
  exportFrequency: { days: 7, hours: 0, minutes: 30 }
};

// State classes for Svelte 5 Runes reactivity
class ScribeFlowStore {
  // Runes
  currentView = $state('dashboard'); // 'dashboard' | 'practice' | 'settings' | 'task-editor'
  projects = $state([]);
  activeProject = $state(null);
  activeTask = $state(null);
  settings = $state(defaultSettings);

  constructor() {
    this.loadState();
  }

  loadState() {
    // Load Projects
    try {
      const savedProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
      if (savedProjects) {
        this.projects = JSON.parse(savedProjects);
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

  // Mutation actions
  addProject(name, icon = 'history_edu') {
    const newProj = {
      id: 'proj-' + Date.now(),
      name,
      icon,
      tasks: []
    };
    this.projects.push(newProj);
    this.saveProjects();
    return newProj;
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
    this.saveProjects();

    // Update active project reference if it is active
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
