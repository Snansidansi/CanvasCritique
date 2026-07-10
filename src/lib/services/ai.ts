import { 
  type Stroke, 
  type Point, 
  type BoundingBox, 
  loadImage, 
  drawGuidelinesInWorld, 
  getStrokesBoundingBox 
} from '../utils/canvas';
import { store } from '../state/store.svelte';
import { getMediaDataUrl } from '../db/media';
import { OpenRouter, HTTPClient } from '@openrouter/sdk';

export function estimateCost(provider: 'gemini' | 'openrouter', model: string, inputTokens: number, outputTokens: number, overrides?: { geminiInputCostPerMillion?: number; geminiOutputCostPerMillion?: number }): number {
  const modelLower = model.toLowerCase();
  
  if (provider === 'gemini') {
    const inputPrice = overrides?.geminiInputCostPerMillion ?? 0.075;
    const outputPrice = overrides?.geminiOutputCostPerMillion ?? 0.30;
    if (modelLower.includes('gemini-1.5-flash-8b')) {
      return (inputTokens * 0.0375 + outputTokens * 0.15) / 1000000;
    } else if (modelLower.includes('gemini-1.5-flash') || modelLower.includes('gemini-2.0-flash')) {
      return (inputTokens * inputPrice + outputTokens * outputPrice) / 1000000;
    } else if (modelLower.includes('gemini-1.5-pro')) {
      return (inputTokens * 1.25 + outputTokens * 5.00) / 1000000;
    }
    return (inputTokens * inputPrice + outputTokens * outputPrice) / 1000000;
  } else {
    if (modelLower.includes('gemini-flash-1.5') || modelLower.includes('gemini-2.0-flash')) {
      return (inputTokens * 0.075 + outputTokens * 0.30) / 1000000;
    } else if (modelLower.includes('gemini-pro-1.5')) {
      return (inputTokens * 1.25 + outputTokens * 5.00) / 1000000;
    } else if (modelLower.includes('claude-3.5-sonnet') || modelLower.includes('claude-3-5-sonnet')) {
      return (inputTokens * 3.00 + outputTokens * 15.00) / 1000000;
    } else if (modelLower.includes('claude-3-opus')) {
      return (inputTokens * 15.00 + outputTokens * 75.00) / 1000000;
    } else if (modelLower.includes('gpt-4o-mini')) {
      return (inputTokens * 0.15 + outputTokens * 0.60) / 1000000;
    } else if (modelLower.includes('gpt-4o')) {
      return (inputTokens * 2.50 + outputTokens * 10.00) / 1000000;
    } else if (modelLower.includes('llama-3-8b') || modelLower.includes('llama3-8b')) {
      return (inputTokens * 0.05 + outputTokens * 0.05) / 1000000;
    } else if (modelLower.includes('llama-3-70b') || modelLower.includes('llama3-70b')) {
      return (inputTokens * 0.35 + outputTokens * 0.40) / 1000000;
    } else if (modelLower.includes('deepseek-chat') || modelLower.includes('deepseek-coder') || modelLower.includes('deepseek-v3') || modelLower.includes('deepseek-r1')) {
      return (inputTokens * 0.14 + outputTokens * 0.28) / 1000000;
    }
    return (inputTokens * 0.20 + outputTokens * 0.80) / 1000000;
  }
}

export interface CheckWorkTask {
  name: string;
  section?: string;
  instructions?: string;
  solution?: string;
  aiInstructions?: string;
  instructionFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  solutionFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  contextFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  defaultEditMode?: 'canvas' | 'text' | 'both';
  instructionFile?: { name: string; dataUrl?: string; mediaId?: string }; // legacy
  solutionFile?: { name: string; dataUrl?: string; mediaId?: string }; // legacy
}

export interface CheckWorkSettings {
  apiProvider: string; // 'gemini' | 'openrouter'
  geminiApiKey: string;
  openRouterApiKey: string;
  geminiModel: string;
  openRouterModel: string;
  openRouterReasoning: boolean | string;
  openRouterProvider?: string[];
  sendTaskMedia?: boolean;
  sendSolutionMedia?: boolean;
  sendCanvasBackground?: boolean;
  sendTaskText?: boolean;
  sendSolutionText?: boolean;
  sendContextText?: boolean;
  sendContextMedia?: boolean;
  maxOutputTokens?: number;
  language?: string;
  customSystemPrompt?: string;
  taskMediaFilterMode?: string;
  taskMediaFilterExtensions?: string;
  solutionMediaFilterMode?: string;
  solutionMediaFilterExtensions?: string;
}

export interface CheckWorkOptions {
  canvasMode: 'infinite' | 'a4';
  pages: Array<{ strokeHistory: Stroke[] }>;
  infiniteStrokes: Stroke[];
  currentBgUrl: string | null;
  bgOpacity: number;
  activeBg: string;
  task: CheckWorkTask;
  projectGuidelines?: string;
  settings: CheckWorkSettings;
  defaultSystemPrompt: string;
  activeMode?: 'canvas' | 'text' | 'both' | 'none';
  editorText?: string;
  alwaysSendBothCanvasAndText?: boolean;
}

export interface CheckWorkMarker {
  id: string;
  x: number;
  y: number;
  pageIndex: number;
  canvasX: number;
  canvasY: number;
  type: 'correct' | 'incorrect' | 'partial';
  feedback: string;
  underlinePoints?: Point[] | null;
  boundingBoxOffset: BoundingBox;
}

export interface CheckWorkResult {
  feedbackText: string;
  feedbackScore: number | null;
  feedbackMarkers: CheckWorkMarker[];
  canvasCritique?: {
    feedbackText: string;
    feedbackScore: number | null;
    feedbackMarkers: any[];
  } | null;
  textCritique?: {
    feedbackText: string;
    feedbackScore: number | null;
    feedbackMarkers: any[];
  } | null;
}

export async function runCheckWork(options: CheckWorkOptions): Promise<CheckWorkResult> {
  const {
    canvasMode,
    pages,
    infiniteStrokes,
    currentBgUrl,
    bgOpacity,
    activeBg,
    task: initialTask,
    projectGuidelines,
    settings,
    defaultSystemPrompt,
    activeMode = 'canvas',
    editorText = '',
    alwaysSendBothCanvasAndText = false
  } = options;

  // Helper to filter files
  function shouldIncludeFile(filename: string, isSolution: boolean): boolean {
    if (!settings) return true;
    const mode = isSolution
      ? (settings.solutionMediaFilterMode ?? 'blacklist')
      : (settings.taskMediaFilterMode ?? 'blacklist');
    const extensionsStr = isSolution
      ? (settings.solutionMediaFilterExtensions ?? '')
      : (settings.taskMediaFilterExtensions ?? '');
    
    const extensions = extensionsStr
      .split(',')
      .map((ext: string) => ext.trim().toLowerCase())
      .filter((ext: string) => ext.length > 0)
      .map((ext: string) => ext.startsWith('.') ? ext : '.' + ext);
      
    if (extensions.length === 0) {
      return mode === 'blacklist';
    }
    
    const fileExt = '.' + filename.split('.').pop()!.toLowerCase();
    
    if (mode === 'whitelist') {
      return extensions.includes(fileExt);
    } else {
      return !extensions.includes(fileExt);
    }
  }

  // Resolve media files from filesystem to data URLs
  const task = { ...initialTask };
  if (task.instructionFiles) {
    task.instructionFiles = await Promise.all(
      task.instructionFiles.map(async (f) => {
        if (!f.dataUrl && f.mediaId) {
          try {
            return { ...f, dataUrl: await getMediaDataUrl(f.mediaId) };
          } catch (_) {}
        }
        return { ...f };
      })
    );
    task.instructionFiles = task.instructionFiles.filter(f => shouldIncludeFile(f.name, false));
  }
  if (task.contextFiles) {
    task.contextFiles = await Promise.all(
      task.contextFiles.map(async (f) => {
        if (!f.dataUrl && f.mediaId) {
          try {
            return { ...f, dataUrl: await getMediaDataUrl(f.mediaId) };
          } catch (_) {}
        }
        return { ...f };
      })
    );
  }
  if (task.solutionFiles) {
    task.solutionFiles = await Promise.all(
      task.solutionFiles.map(async (f) => {
        if (!f.dataUrl && f.mediaId) {
          try {
            return { ...f, dataUrl: await getMediaDataUrl(f.mediaId) };
          } catch (_) {}
        }
        return { ...f };
      })
    );
    task.solutionFiles = task.solutionFiles.filter(f => shouldIncludeFile(f.name, true));
  }
  if (task.instructionFile) {
    if (!shouldIncludeFile(task.instructionFile.name, false)) {
      task.instructionFile = null;
    } else if (!task.instructionFile.dataUrl && task.instructionFile.mediaId) {
      try {
        task.instructionFile = { ...task.instructionFile, dataUrl: await getMediaDataUrl(task.instructionFile.mediaId) };
      } catch (_) {}
    }
  }
  if (task.solutionFile) {
    if (!shouldIncludeFile(task.solutionFile.name, true)) {
      task.solutionFile = null;
    } else if (!task.solutionFile.dataUrl && task.solutionFile.mediaId) {
      try {
        task.solutionFile = { ...task.solutionFile, dataUrl: await getMediaDataUrl(task.solutionFile.mediaId) };
      } catch (_) {}
    }
  }

  // Helper to determine if history contains any visible (non-eraser) drawing strokes with points
  const hasVisibleStrokes = (history: Stroke[]): boolean => {
    return history.some(s => s.color !== 'eraser' && s.color !== '#FFFFFF' && s.points.length > 0);
  };

  // 1. Gather all non-empty pages to evaluate
  let activePagesWithIndex: Array<{ strokeHistory: Stroke[]; originalIndex: number }> = [];
  if (canvasMode === 'a4') {
    activePagesWithIndex = pages
      .map((p, idx) => ({ strokeHistory: p.strokeHistory, originalIndex: idx }))
      .filter(item => hasVisibleStrokes(item.strokeHistory));
  } else {
    if (hasVisibleStrokes(infiniteStrokes)) {
      activePagesWithIndex = [{ strokeHistory: infiniteStrokes, originalIndex: 0 }];
    }
  }

  const sendCanvas = alwaysSendBothCanvasAndText || activeMode === 'canvas' || activeMode === 'both';
  const sendText = alwaysSendBothCanvasAndText || activeMode === 'text' || activeMode === 'both';
  const hasTextContent = !!(editorText && editorText.trim());

  if (!sendCanvas && !sendText) {
    throw new Error(
      settings.language === 'Deutsch'
        ? "Bitte aktivieren Sie mindestens eine Ansicht (Leinwand oder Texteditor), um Ihre Arbeit zu überprüfen."
        : "Please activate at least one view (Canvas or Text Editor) to check your work."
    );
  }

  if (sendCanvas && activePagesWithIndex.length === 0 && !hasTextContent) {
    throw new Error(
      settings.language === 'Deutsch' 
        ? "Die Leinwand ist leer. Bitte zeichnen Sie etwas, bevor Sie Ihre Arbeit überprüfen."
        : "Canvas is empty. Please draw some calligraphy before checking your work."
    );
  }
  if (sendText && !hasTextContent && (!sendCanvas || activePagesWithIndex.length === 0)) {
    throw new Error(
      settings.language === 'Deutsch'
        ? "Der Text-Editor ist leer. Bitte schreiben Sie etwas, bevor Sie Ihre Arbeit überprüfen."
        : "Text Editor is empty. Please write some text before checking your work."
    );
  }

  // 2. Generate cropped bounding-box images for each page (only if sendCanvas is true)
  const pageImages: string[] = [];
  const pageBoxes: BoundingBox[] = [];
  
  if (sendCanvas) {
    for (const item of activePagesWithIndex) {
      const box = getStrokesBoundingBox(item.strokeHistory, canvasMode);
      let base64Data = '';
      let widthVal = 800;
      let heightVal = 1130;
      let boxOffset = { x: 0, y: 0 };
      
      if (!box) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 800;
        tempCanvas.height = 1130;
        widthVal = tempCanvas.width;
        heightVal = tempCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        }
        base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
        boxOffset = { x: 0, y: 0 };
      } else {
        widthVal = box.width;
        heightVal = box.height;
        boxOffset = { x: box.x, y: box.y };
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = box.width;
        tempCanvas.height = box.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (tempCtx) {
          // Draw solid white background
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, box.width, box.height);
          
          tempCtx.save();
          tempCtx.translate(-box.x, -box.y);
          
          const drawBackground = settings.sendCanvasBackground ?? true;
          if (drawBackground) {
            if (currentBgUrl) {
              try {
                const img = await loadImage(currentBgUrl);
                tempCtx.save();
                tempCtx.globalAlpha = bgOpacity / 100;
                const pattern = tempCtx.createPattern(img, 'repeat');
                if (pattern) {
                  tempCtx.fillStyle = pattern;
                  tempCtx.fillRect(box.x, box.y, box.width, box.height);
                }
                tempCtx.restore();
              } catch (err) {
                console.error('Error drawing custom background pattern on crop:', err);
              }
            }
            drawGuidelinesInWorld(tempCtx, box.x, box.y, box.width, box.height, activeBg, bgOpacity);
          }
          tempCtx.restore();
        }
        
        const strokesCanvas = document.createElement('canvas');
        strokesCanvas.width = box.width;
        strokesCanvas.height = box.height;
        const strokesCtx = strokesCanvas.getContext('2d');
        
        if (strokesCtx) {
          strokesCtx.save();
          strokesCtx.translate(-box.x, -box.y);
          for (const stroke of item.strokeHistory) {
            strokesCtx.save();
            strokesCtx.beginPath();
            if (stroke.color === 'eraser' || stroke.color === '#FFFFFF') {
              strokesCtx.globalCompositeOperation = 'destination-out';
              strokesCtx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
              strokesCtx.globalCompositeOperation = 'source-over';
              strokesCtx.strokeStyle = stroke.color;
            }
            strokesCtx.lineWidth = stroke.width;
            strokesCtx.lineCap = 'round';
            strokesCtx.lineJoin = 'round';
            
            if (stroke.points.length > 0) {
              strokesCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
              if (stroke.points.length === 1) {
                strokesCtx.lineTo(stroke.points[0].x, stroke.points[0].y);
              } else {
                for (let i = 1; i < stroke.points.length; i++) {
                  strokesCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
              }
              strokesCtx.stroke();
            }
            strokesCtx.restore();
          }
          strokesCtx.restore();
        }
        
        if (tempCtx) {
          tempCtx.drawImage(strokesCanvas, 0, 0);
        }
        
        base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
      }
      
      pageImages.push(base64Data);
      pageBoxes.push({ ...boxOffset, width: widthVal, height: heightVal });
    }
  }

  const apiKey = settings.apiProvider === 'gemini' ? settings.geminiApiKey : settings.openRouterApiKey;
  const provider = settings.apiProvider;
  const model = settings.apiProvider === 'gemini' ? settings.geminiModel : settings.openRouterModel;

  // Check if API key is provided
  if (!apiKey) {
    throw new Error("No API key configured. Please add your API key in settings.");
  }

  // Build AI prompt
  const pageInfoPrompt = canvasMode === 'a4'
    ? `You are checking a multi-page A4 handwriting document. You have been sent a sequence of page images. The first image represents Page Index 0, the second represents Page Index 1, etc.
Your JSON response MUST specify the 'pageIndex' for each marker to identify which page image it is located on (0-based index corresponding to the image sequence).`
    : `Examine the single infinite canvas screenshot. The image represents Page Index 0.`;

  // Build image dimensions info for accurate marker placement
  const imageDimensionsInfo = pageBoxes.map((box, i) => 
    `Image ${i}: ${box.width}px wide × ${box.height}px tall.`
  ).join('\n');

  // Get project-level guidelines if available
  let guidelinesPrompt = projectGuidelines 
    ? `\nAdditional grading guidelines from the teacher:\n"${projectGuidelines}"\nPlease take these guidelines into account when evaluating the student's work.\n`
    : '';

  const sendContextText = settings.sendContextText ?? true;
  const sendContextMedia = settings.sendContextMedia ?? true;

  if (sendContextText && task.aiInstructions && task.aiInstructions.trim()) {
    guidelinesPrompt += `\nAdditional grading guidelines for this specific task:\n"${task.aiInstructions.trim()}"\nPlease take these guidelines into account when evaluating the student's work.\n`;
  }

  const promptTemplate = settings.customSystemPrompt || defaultSystemPrompt;
  const sendTaskMedia = settings.sendTaskMedia ?? true;
  const sendSolutionMedia = settings.sendSolutionMedia ?? true;
  const sendTaskText = settings.sendTaskText ?? true;
  const sendSolutionText = settings.sendSolutionText ?? true;
  
  // Decoders for txt and md files
  let instructionsTextFilesContent = '';
  if (sendTaskMedia && sendTaskText) {
    if (task.instructionFiles && Array.isArray(task.instructionFiles)) {
      task.instructionFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          try {
            const base64Data = file.dataUrl!.split(',')[1];
            const decodedText = decodeURIComponent(escape(atob(base64Data)));
            instructionsTextFilesContent += `\n\n[Instruction Document - ${file.name}]:\n${decodedText}`;
          } catch (e) {
            console.error('Failed to decode text file', file.name, e);
          }
        }
      });
    } else if (task.instructionFile) {
      const file = task.instructionFile;
      if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
        try {
          const base64Data = file.dataUrl!.split(',')[1];
          const decodedText = decodeURIComponent(escape(atob(base64Data)));
          instructionsTextFilesContent += `\n\n[Instruction Document - ${file.name}]:\n${decodedText}`;
        } catch (e) {
          console.error('Failed to decode text file', file.name, e);
        }
      }
    }
  }

  let solutionTextFilesContent = '';
  if (sendSolutionMedia && sendSolutionText) {
    if (task.solutionFiles && Array.isArray(task.solutionFiles)) {
      task.solutionFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          try {
            const base64Data = file.dataUrl!.split(',')[1];
            const decodedText = decodeURIComponent(escape(atob(base64Data)));
            solutionTextFilesContent += `\n\n[Solution Document - ${file.name}]:\n${decodedText}`;
          } catch (e) {
            console.error('Failed to decode text file', file.name, e);
          }
        }
      });
    } else if (task.solutionFile) {
      const file = task.solutionFile;
      if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
        try {
          const base64Data = file.dataUrl!.split(',')[1];
          const decodedText = decodeURIComponent(escape(atob(base64Data)));
          solutionTextFilesContent += `\n\n[Solution Document - ${file.name}]:\n${decodedText}`;
        } catch (e) {
          console.error('Failed to decode text file', file.name, e);
        }
      }
    }
  }

  let contextTextFilesContent = '';
  if (sendContextMedia && sendContextText) {
    if (task.contextFiles && Array.isArray(task.contextFiles)) {
      task.contextFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          try {
            const base64Data = file.dataUrl!.split(',')[1];
            const decodedText = decodeURIComponent(escape(atob(base64Data)));
            contextTextFilesContent += `\n\n[Context Document - ${file.name}]:\n${decodedText}`;
          } catch (e) {
            console.error('Failed to decode context text file', file.name, e);
          }
        }
      });
    }
  }

  const rawInstructionsText = sendTaskText ? ((task.instructions || '') + instructionsTextFilesContent) : '';
  const rawSolutionText = sendSolutionText ? ((task.solution || '') + solutionTextFilesContent) : '';

  const taskInstructionsText = rawInstructionsText.trim() ? `Task instructions: "${rawInstructionsText.trim()}"` : '';
  const expectedSolutionText = rawSolutionText.trim() ? `Expected correct solution: "${rawSolutionText.trim()}"` : '';
  const taskContextText = sendContextText && contextTextFilesContent.trim() ? `Task context documents:\n"${contextTextFilesContent.trim()}"` : '';

  let prompt = promptTemplate;
  
  if (prompt.includes('{{task_section}}')) {
    prompt = prompt.replace(/\{\{task_section\}\}/g, task.section ? `Topic/Section: ${task.section}` : '');
  } else if (task.section) {
    prompt = prompt.replace(/\{\{task_name\}\}/g, `${task.section} - ${task.name}`);
  }
  
  if (prompt.includes('{{task_instructions}}')) {
    prompt = prompt.replace(/\{\{task_instructions\}\}/g, taskInstructionsText);
  } else if (taskInstructionsText) {
    prompt += `\n\n${taskInstructionsText}`;
  }
  
  if (prompt.includes('{{task_solution}}')) {
    prompt = prompt.replace(/\{\{task_solution\}\}/g, expectedSolutionText);
  } else if (expectedSolutionText) {
    prompt += `\n\n${expectedSolutionText}`;
  }

  if (taskContextText) {
    prompt += `\n\n${taskContextText}`;
  }
  
  prompt = prompt
    .replace(/\{\{task_name\}\}/g, task.name)
    .replace(/\{\{task_section\}\}/g, task.section || '')
    .replace(/\{\{guidelines\}\}/g, guidelinesPrompt)
    .replace(/\{\{page_info\}\}/g, pageInfoPrompt)
    .replace(/\{\{image_dimensions\}\}/g, imageDimensionsInfo);

  let canvasInstructions = "";
  if (!sendCanvas) {
    canvasInstructions = "\n\n**CRITICAL (No Canvas Sent):**\nNo canvas drawings were sent because the student is working in the text-editor only. Therefore, you MUST return an EMPTY array for the 'markers' field (i.e. \"markers\": []). Do not try to place any coordinates. Provide all corrections and helpful feedback in the text editor section.\n";
  } else {
    canvasInstructions = "\n\nThe student's canvas drawings are sent as image(s). Please place feedback markers at their corresponding coordinates relative to the canvas drawing.\n";
  }

  let textInstructions = "";
  if (sendText && editorText && editorText.trim()) {
    textInstructions = `\n\n**CRITICAL (Text Editor Evaluation):**\nThe student has submitted text in the Text Editor (provided below under [STUDENT TEXT EDITOR WORK]). Read it carefully, check its correctness, and provide helpful LaTeX/Markdown feedback and corrections.\n`;
  }

  let studentWorkContent = "";
  if (sendText && editorText && editorText.trim()) {
    studentWorkContent += `\n\n[STUDENT TEXT EDITOR WORK]:\n${editorText.trim()}\n\n`;
  }
  if (sendCanvas) {
    studentWorkContent += `\n\n[STUDENT CANVAS WORK]:\nThe student's canvas drawings are provided as the page image(s) attached to this message.\n\n`;
  }

  let responseFormatInstructions = "";
  if (sendCanvas && sendText && editorText.trim()) {
    responseFormatInstructions = `
\n**CRITICAL JSON SCHEMA REQUIREMENT (BOTH CANVAS AND TEXT EVALUATION):**
Since you are checking BOTH the student's handwritten canvas drawing AND their typed text-editor work, you MUST evaluate them TOGETHER as a single, combined submission. For example, if a student solves some exercises in the text editor and others on the canvas, they are all part of the same submission. Do NOT mark any exercise as missing if it is present in either the canvas or the text editor.
Return a SINGLE unified JSON object with the following schema:
{
  "generalCritique": "Critique text evaluating the combined submission (handwritten drawings and text editor work).",
  "grade": number (0-100 overall grade representing the combined evaluation),
  "canvasMarkers": [
    {
      "pageIndex": number (0-based index of the page in the sent sequence),
      "x": number (X coordinate relative to cropped page width, 0 to 1000),
      "y": number (Y coordinate relative to cropped page height, 0 to 1000),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Specific feedback for this canvas mistake (1 sentence max).",
      "underlinePoints": [{"x": number, "y": number}, ...]
    }
  ],
  "textMarkers": [
    {
      "lineIndex": number (0-based index of the line in the student's [STUDENT TEXT EDITOR WORK] that has the error),
      "substring": "The exact word/phrase/substring in that line that is wrong",
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback explaining what is wrong with this word/phrase (1 sentence max)."
    }
  ]
}
`;
  } else if (sendText && editorText.trim()) {
    responseFormatInstructions = `
\n**CRITICAL JSON SCHEMA REQUIREMENT (TEXT EDITOR ONLY):**
Since you are checking ONLY the student's typed text-editor work, you MUST return a JSON object with the following schema:
{
  "generalCritique": "Critique text evaluating their text editor work.",
  "grade": number (0-100 grade),
  "textMarkers": [
    {
      "lineIndex": number (0-based index of the line in the student's [STUDENT TEXT EDITOR WORK] that has the error),
      "substring": "The exact word/phrase/substring in that line that is wrong",
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback explaining what is wrong with this word/phrase (1 sentence max)."
    }
  ]
}
`;
  } else {
    responseFormatInstructions = `
\n**CRITICAL JSON SCHEMA REQUIREMENT (CANVAS ONLY):**
Since you are checking ONLY the student's handwritten drawings on the canvas images, you MUST return a JSON object with the following schema:
{
  "generalCritique": "Overall critique evaluating their canvas drawings.",
  "grade": number (0-100 grade),
  "markers": [
    {
      "pageIndex": number (0-based index of the page in the sent sequence),
      "x": number (X coordinate relative to cropped page width, 0 to 1000),
      "y": number (Y coordinate relative to cropped page height, 0 to 1000),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Specific feedback for this canvas mistake (1 sentence max).",
      "underlinePoints": [{"x": number, "y": number}, ...]
    }
  ]
}
`;
  }

  prompt += canvasInstructions + textInstructions + studentWorkContent + responseFormatInstructions;

  // Language Requirement mapping
  const languageMap: Record<string, string> = {
    de: 'German',
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian'
  };
  const lang = settings.language || 'English';
  const targetLanguage = languageMap[lang] || lang;
  prompt += `\n\n**Language Requirement (CRITICAL):**\nYour entire feedback, critique, descriptions, and JSON string values (except "type" keys) MUST be written in ${targetLanguage}.`;

  function getInlineDataFromMedia(mediaFile: { name: string; dataUrl?: string }) {
    if (!mediaFile || !mediaFile.dataUrl) return null;
    const match = mediaFile.dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) return null;
    return {
      inlineData: {
        mimeType: match[1],
        data: match[2]
      }
    };
  }

  function getOpenRouterMedia(mediaFile: { name: string; dataUrl?: string }) {
    if (!mediaFile || !mediaFile.dataUrl) return null;
    return {
      type: 'image_url',
      imageUrl: { url: mediaFile.dataUrl }
    };
  }

  const additionalGeminiParts: any[] = [];
  const additionalOpenRouterParts: any[] = [];

  if (sendTaskMedia) {
    if (task.instructionFiles && Array.isArray(task.instructionFiles)) {
      task.instructionFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          return;
        }
        const geminiPart = getInlineDataFromMedia(file);
        if (geminiPart) additionalGeminiParts.push(geminiPart);
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    } else if (task.instructionFile) {
      const file = task.instructionFile;
      if (!(file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown'))) {
        const geminiPart = getInlineDataFromMedia(file);
        if (geminiPart) additionalGeminiParts.push(geminiPart);
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      }
    }
  }

  if (sendSolutionMedia) {
    if (task.solutionFiles && Array.isArray(task.solutionFiles)) {
      task.solutionFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          return;
        }
        const geminiPart = getInlineDataFromMedia(file);
        if (geminiPart) additionalGeminiParts.push(geminiPart);
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    } else if (task.solutionFile) {
      const file = task.solutionFile;
      if (!(file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown'))) {
        const geminiPart = getInlineDataFromMedia(file);
        if (geminiPart) additionalGeminiParts.push(geminiPart);
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      }
    }
  }

  if (sendContextMedia) {
    if (task.contextFiles && Array.isArray(task.contextFiles)) {
      task.contextFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          return;
        }
        const geminiPart = getInlineDataFromMedia(file);
        if (geminiPart) additionalGeminiParts.push(geminiPart);
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    }
  }

  let textResult = '';
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...additionalGeminiParts,
              ...pageImages.map(imgData => ({
                inlineData: {
                  mimeType: "image/png",
                  data: imgData
                }
              }))
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          ...(settings.maxOutputTokens && settings.maxOutputTokens > 0 ? { maxOutputTokens: settings.maxOutputTokens } : {})
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API returned error status: ${response.status}`);
    }

    const resData = await response.json();
    
    // Extract and record LLM usage statistics
    try {
      const inputTokens = resData.usageMetadata?.promptTokenCount || 0;
      const outputTokens = resData.usageMetadata?.candidatesTokenCount || 0;
      const reasoningTokens = 0;
      const cost = estimateCost('gemini', model, inputTokens, outputTokens, {
        geminiInputCostPerMillion: store.settings.geminiInputCostPerMillion,
        geminiOutputCostPerMillion: store.settings.geminiOutputCostPerMillion
      });
      store.recordRequest('gemini', model, inputTokens, outputTokens, reasoningTokens, cost);
    } catch (err) {
      console.error('Failed to log LLM statistics:', err);
    }

    textResult = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
  } else {
    // OpenRouter SDK integration
    const httpClient = new HTTPClient();
    httpClient.addHook('beforeRequest', async (req) => {
      if (req.url.includes('/chat/completions')) {
        try {
          const cloned = req.clone();
          const bodyText = await cloned.text();
          const bodyJson = JSON.parse(bodyText);
          
          const reasoningSetting = settings.openRouterReasoning;
          
          // Check if model supports reasoning from store
          const modelInfo = store.openRouterModels.find((m: any) => m.id === model);
          let supportsReasoning = false;
          let isMandatory = false;
          if (modelInfo) {
            supportsReasoning = !!modelInfo.reasoning;
            isMandatory = !!modelInfo.reasoning?.mandatory;
          } else {
            // Fallback keywords if openRouterModels isn't loaded/cached yet
            const modelLower = model.toLowerCase();
            if (
              modelLower.includes('deepseek-r1') ||
              modelLower.includes('o1-') ||
              modelLower.includes('o3-') ||
              modelLower.includes('thinking') ||
              modelLower.includes('qwq')
            ) {
              supportsReasoning = true;
              if (modelLower.includes('deepseek-r1') || modelLower.includes('qwq')) {
                isMandatory = true;
              }
            }
          }

          if (supportsReasoning) {
            if (reasoningSetting === 'none' || reasoningSetting === false) {
              if (isMandatory) {
                bodyJson.reasoning = {
                  exclude: true
                };
              } else {
                bodyJson.reasoning = {
                  effort: 'none',
                  exclude: true
                };
              }
            } else if (typeof reasoningSetting === 'string' && reasoningSetting !== 'auto') {
              bodyJson.reasoning = {
                exclude: false,
                effort: reasoningSetting
              };
            } else {
              bodyJson.reasoning = {
                exclude: false
              };
            }
          } else {
            // Must not send reasoning parameter to non-reasoning models
            delete bodyJson.reasoning;
          }
          
          return new Request(req.url, {
            method: req.method,
            headers: req.headers,
            body: JSON.stringify(bodyJson)
          });
        } catch (err) {
          console.error('Error modifying OpenRouter request body in hook:', err);
        }
      }
    });

    const client = new OpenRouter({
      apiKey: apiKey,
      httpClient: httpClient
    });

    const contentParts: any[] = [
      { type: 'text', text: prompt },
      ...additionalOpenRouterParts,
      ...pageImages.map(imgData => ({
        type: 'image_url',
        imageUrl: { url: `data:image/png;base64,${imgData}` }
      }))
    ];

    const chatRequest: any = {
      model: model,
      messages: [
        {
          role: 'user',
          content: contentParts
        }
      ],
      ...(settings.maxOutputTokens && settings.maxOutputTokens > 0 ? { max_tokens: settings.maxOutputTokens } : {})
    };

    const selectedProviders = settings.openRouterProvider || [];
    if (selectedProviders.length > 0) {
      chatRequest.provider = {
        order: selectedProviders
      };
    }

    const chatResult = await client.chat.send({
      chatRequest: chatRequest
    });

    // Extract and record LLM usage statistics
    try {
      const inputTokens = chatResult.usage?.promptTokens || 0;
      const outputTokens = chatResult.usage?.completionTokens || 0;
      const reasoningTokens = chatResult.usage?.completionTokensDetails?.reasoningTokens || 0;
      const generationId = chatResult.id;

      let cost = 0;
      let costResolved = false;

      if (generationId && apiKey) {
        try {
          // Wait briefly for OpenRouter backend to index the generation (e.g., 800ms)
          await new Promise(resolve => setTimeout(resolve, 800));
          const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`
            }
          });
          if (genRes.ok) {
            const genData = await genRes.json();
            if (genData?.data) {
              const byokUsage = genData.data.byok_usage_inference || 0;
              const normalUsage = genData.data.usage || 0;
              cost = byokUsage || normalUsage || 0;
              if (cost > 0) {
                costResolved = true;
                console.log('[openrouter-cost] Resolved exact cost from generation API:', cost);
              }
            }
          }
        } catch (err) {
          console.error('[openrouter-cost] Failed to fetch exact cost from generation API:', err);
        }
      }

      if (!costResolved) {
        // Fallback: calculate using session-cached prices
        const price = store.openRouterPrices[model];
        if (price) {
          cost = (inputTokens * price.prompt) + (outputTokens * price.completion);
          console.log('[openrouter-cost] Calculated cost from cached pricing:', cost);
        } else {
          // Fallback to static estimateCost
          cost = estimateCost('openrouter', model, inputTokens, outputTokens, {
            geminiInputCostPerMillion: store.settings.geminiInputCostPerMillion,
            geminiOutputCostPerMillion: store.settings.geminiOutputCostPerMillion
          });
          console.log('[openrouter-cost] Fallback to estimateCost:', cost);
        }
      }

      store.recordRequest('openrouter', model, inputTokens, outputTokens, reasoningTokens, cost);
    } catch (err) {
      console.error('Failed to log LLM statistics:', err);
    }

    textResult = chatResult.choices?.[0]?.message?.content || 'No response from AI.';
  }

  let parsed: any;
  try {
    let cleanText = textResult.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();
    parsed = JSON.parse(cleanText);
  } catch (jsonErr) {
    console.error('Failed to parse JSON response, falling back to markdown wrap:', jsonErr);
    parsed = {
      generalCritique: textResult,
      grade: 75,
      markers: []
    };
  }

  const feedbackText = parsed.generalCritique || 'No written critique provided.';
  const feedbackScore = typeof parsed.grade === 'number' ? parsed.grade : 75;
  
  // Parse canvas critique if present
  // Parse canvas markers
  const rawCanvasMarkers = parsed.canvasMarkers || parsed.markers || [];
  const canvasMarkers = rawCanvasMarkers.map((m: any, index: number) => {
    const pageIdx = typeof m.pageIndex === 'number' ? m.pageIndex : 0;
    const mappedItem = activePagesWithIndex[pageIdx] || { originalIndex: 0 };
    const offset = pageBoxes[pageIdx] || { x: 0, y: 0, width: 800, height: 1130 };
    
    const px = (m.x / 1000) * (offset.width || 800);
    const py = (m.y / 1000) * (offset.height || 1130);
    
    const underlinePoints = m.underlinePoints
      ? m.underlinePoints.map((p: any) => ({
          x: (p.x / 1000) * (offset.width || 800),
          y: (p.y / 1000) * (offset.height || 1130)
        }))
      : null;

    return {
      id: `marker-${Date.now()}-${index}`,
      x: px,
      y: py,
      pageIndex: mappedItem.originalIndex,
      canvasX: px + offset.x,
      canvasY: py + offset.y,
      type: m.type || 'partial',
      feedback: m.feedback || '',
      underlinePoints: underlinePoints,
      boundingBoxOffset: { ...offset }
    };
  });

  // Parse text markers
  const rawTextMarkers = parsed.textMarkers || [];
  const textMarkers = rawTextMarkers.map((m: any, index: number) => {
    return {
      id: `text-marker-${Date.now()}-${index}`,
      lineIndex: typeof m.lineIndex === 'number' ? m.lineIndex : 0,
      substring: m.substring || '',
      type: m.type || 'partial',
      feedback: m.feedback || ''
    };
  });

  let canvasCritique = null;
  let textCritique = null;

  if (sendCanvas && sendText) {
    // Combined critique structure: only the inline highlights are mapped separately
    textCritique = {
      feedbackText: '',
      feedbackScore: null,
      feedbackMarkers: textMarkers
    };
  } else if (sendText) {
    textCritique = {
      feedbackText,
      feedbackScore,
      feedbackMarkers: textMarkers
    };
  } else if (sendCanvas) {
    canvasCritique = {
      feedbackText,
      feedbackScore,
      feedbackMarkers: canvasMarkers
    };
  }

  return {
    feedbackText,
    feedbackScore,
    feedbackMarkers: canvasMarkers,
    canvasCritique,
    textCritique
  };
}
