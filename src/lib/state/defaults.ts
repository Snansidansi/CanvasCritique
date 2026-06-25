import type { Project, Settings } from './types';

export const STORAGE_KEY_PROJECTS = 'canvascritique_projects';
export const STORAGE_KEY_SETTINGS = 'canvascritique_settings';

export const defaultProjects: Project[] = [
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

export const defaultSettings: Settings = {
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
  sendTaskText: true,
  sendSolutionText: true,
  canvasMode: 'infinite',
  customSystemPrompt: '',
  systemPromptEditingEnabled: false,
  language: 'English',
  stylusButtons: [],
  stylusMode: false,
  autoCompleteOnSuccess: true,
  statsEnabled: true,
  stats: { daily: {} }
};
