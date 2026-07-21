import type { Project, Settings } from './types';

export const defaultProjects: Project[] = [
  {
    id: 'math-basics',
    name: getSystemLanguage() === 'Deutsch' ? 'Mathematik-Grundlagen' : 'Math Basics',
    icon: 'calculate',
    guidelines: getSystemLanguage() === 'Deutsch'
      ? 'Löse die Matheaufgaben auf der Zeichenfläche. Schreibe deine Rechenschritte übersichtlich auf und kreise das Endergebnis ein.'
      : 'Solve the math problems on the canvas. Write your steps clearly and circle your final answer.',
    categories: getSystemLanguage() === 'Deutsch' ? ['Grundlagen'] : ['Basics'],
    profileId: 'default-profile',
    tasks: [
      {
        id: 'math-1',
        name: getSystemLanguage() === 'Deutsch' ? 'Grundrechenarten' : 'Basic Arithmetic',
        completed: false,
        category: getSystemLanguage() === 'Deutsch' ? 'Grundlagen' : 'Basics',
        instructions: getSystemLanguage() === 'Deutsch'
          ? 'Schreibe die folgenden 5 Aufgaben auf und löse sie:\n\n1) 12 + 15 = \n2) 45 - 18 = \n3) 7 * 8 = \n4) 144 / 12 = \n5) 83 + 19 = '
          : 'Write down the following 5 problems and solve them:\n\n1) 12 + 15 = \n2) 45 - 18 = \n3) 7 * 8 = \n4) 144 / 12 = \n5) 83 + 19 = ',
        solution: getSystemLanguage() === 'Deutsch'
          ? 'Lösungen:\n1) 27\n2) 27\n3) 56\n4) 12\n5) 102'
          : 'Solutions:\n1) 27\n2) 27\n3) 56\n4) 12\n5) 102'
      }
    ]
  }
];

export const DEFAULT_SYSTEM_PROMPT = `You are a teacher evaluating a student's submission.

Task: "{{task_name}}"
{{task_section}}
{{task_instructions}}
{{task_solution}}
{{guidelines}}

Evaluate the student's work accurately. Use LaTeX math notation for math symbols (e.g. $x^2$ or $$\\int_0^1 f(x)\\,dx$$). Do not critique handwriting quality. Keep feedback very brief (1 sentence max).`;

function getSystemLanguage(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('de')) {
      return 'Deutsch';
    }
  }
  return 'English';
}

export const defaultSettings: Settings = {
  theme: 'system',
  openRouterApiKey: '',
  openRouterModel: 'google/gemini-flash-1.5',
  showCanvasAnnotations: true,
  openRouterProvider: [],
  openRouterReasoning: true,
  sendTaskMedia: true,
  sendSolutionMedia: true,
  sendCanvasBackground: true,
  sendTaskText: true,
  sendSolutionText: true,
  sendContextText: true,
  sendContextMedia: true,
  maxOutputTokens: 0,
  canvasMode: 'infinite',
  canvasFontSize: 13,
  editorFontSize: 16,
  editorShowAllRaw: false,
  customSystemPrompt: '',
  systemPromptEditingEnabled: false,
  language: getSystemLanguage(),
  autoNumberTasks: false,
  taskNumberingTemplate: getSystemLanguage() === 'Deutsch' ? 'Aufgabe {n}' : 'Task {n}',
  hideCompletedSections: false,
  showCritiqueByDefault: true,
  stylusButtons: [],
  stylusMode: false,
  recentColors: ['#000000', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5'],
  penSize: 3,
  autoCompleteOnSuccess: true,
  statsEnabled: true,
  eraserMode: 'normal',
  eraserRadiusNormal: 24,
  eraserRadiusStroke: 24,
  penRecentColors: ['#000000', '#1d4ed8', '#dc2626', '#059669'],
  penBrushWidth: 2,
  penEraserWidth: 24,
  userIcons: [],
  taskMediaFilterMode: 'blacklist',
  taskMediaFilterExtensions: '',
  solutionMediaFilterMode: 'blacklist',
  solutionMediaFilterExtensions: '',
  sendMcMedia: true,
  mcMediaFilterMode: 'blacklist',
  mcMediaFilterExtensions: '',
  webdavEnabled: false,
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavAutoSync: false,
  webdavSyncIntervalMinutes: 30,
  webdavSyncOnStartup: false,
  webdavSyncOnShutdown: false,
  lastSyncedTimestamp: '',
  lastSyncedDbHash: '',
  webdavSyncMode: 'bidirectional',
  rememberWindowState: true,
  autoUpdateCheckEnabled: true,
  filterImage: true,
  filterPdf: false,
  filterAudio: false,
  filterVideo: false
};

