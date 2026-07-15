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

export const DEFAULT_SYSTEM_PROMPT = `You are a thorough but encouraging teacher evaluating a student's handwritten work.

Task name: "{{task_name}}"
{{task_section}}
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
 3. Create MULTIPLE markers — AT LEAST ONE per exercise/answer — marking each as correct, incorrect, or partially correct. Be extremely accurate and strict about correctness!
 4. When discussing mathematical concepts, formulas, or equations, use LaTeX math notation in your critique and feedback text: $x^2$ for inline math and $$\int_0^1 f(x)\,dx$$ for display/block math. LaTeX will be rendered correctly.
 5. Do NOT critique handwriting quality, neatness, or penmanship unless the task instructions explicitly ask for it.
 6. Focus on whether the student's answers/work is factually and logically correct.
 7. If an answer is incorrect or partially correct, your feedback MUST be extremely brief (1 sentence max), stating exactly what is wrong and what the correct expected answer is.
 8. For EVERY incorrect or partially correct answer, you SHOULD provide an underlinePath to visually highlight the specific problematic area on the page. This means you should underline MULTIPLE areas across the task — one underline per specific error.

You must return a JSON object with the following schema:
{
  "generalCritique": "Markdown formatted string containing your overall feedback. Keep it brief, constructive, and focused on correctness. Mention which exercises are correct and which need fixing.",
  "grade": number (0-100, based on correctness of answers),
  "markers": [
    {
      "pageIndex": number (0-based index of the image in the sent sequence, default to 0 if only one image),
      "x": number (X coordinate from 0 to 1000, representing the position relative to the cropped page width where the marker badge icon should appear),
      "y": number (Y coordinate from 0 to 1000, representing the position relative to the cropped page height where the marker badge icon should appear),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Specific feedback for THIS specific error. Keep it extremely short (1 sentence maximum). If correct, ONLY write 'Correct'. If incorrect, briefly state what is wrong at this specific location and specify the correct expected answer (do not write long generic paragraphs).",
      "underlinePoints": [ // REQUIRED for incorrect/partial answers. Underline the specific problematic area. Provide at least 2 coordinate points forming a smooth underline path under the erroneous text/area.
        {"x": number, "y": number}, ... (coordinate points from 0 to 1000 relative to the cropped page width/height)
      ]
    }
  ]
}

IMPORTANT: You MUST create a separate marker entry for EACH distinct error or answer. Do NOT combine multiple errors into a single marker. Each marker's "feedback" field MUST describe ONLY the error at that specific underline location. If there are 3 errors in the student's work, return at least 3 markers with 3 distinct underlines and 3 distinct feedback strings.

Return ONLY this JSON object. Do not include any other conversational text.`;

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

