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

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const modelLower = model.toLowerCase();
  
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

export interface CheckWorkTask {
  name: string;
  section?: string;
  instructions?: string;
  solution?: string;
  aiInstructions?: string;
  instructionFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  solutionFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  contextFiles?: Array<{ name: string; dataUrl?: string; mediaId?: string }>;
  defaultEditMode?: string;
  instructionFile?: { name: string; dataUrl?: string; mediaId?: string }; // legacy
  solutionFile?: { name: string; dataUrl?: string; mediaId?: string }; // legacy
  multipleChoiceTasks?: any[];
}

export interface CheckWorkSettings {
  openRouterApiKey: string;
  openRouterModel: string;
  openRouterReasoning: boolean | string;
  openRouterProvider?: string[];
  showCanvasAnnotations: boolean;
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
  sendMcMedia?: boolean;
  mcMediaFilterMode?: string;
  mcMediaFilterExtensions?: string;
}

export interface CheckWorkOptions {
  canvasMode: 'infinite' | 'a4';
  a4Orientation?: 'portrait' | 'landscape';
  pages: Array<{ strokeHistory: Stroke[] }>;
  infiniteStrokes: Stroke[];
  canvasImages?: any[];
  currentBgUrl: string | null;
  bgOpacity: number;
  activeBg: string;
  task: CheckWorkTask;
  projectGuidelines?: string;
  settings: CheckWorkSettings;
  defaultSystemPrompt: string;
  activeMode?: 'canvas' | 'text' | 'both' | 'none';
  editorText?: string;
  multipleChoiceAnswers?: Record<string, string[]>;
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
    multipleChoiceAnswers = {}
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

  function shouldIncludeMcFile(filename: string): boolean {
    if (!settings) return true;
    const mode = settings.mcMediaFilterMode ?? 'blacklist';
    const extensionsStr = settings.mcMediaFilterExtensions ?? '';
    
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

  // Resolve Multiple Choice media files
  if (task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0) {
    const sendMcMedia = settings?.sendMcMedia ?? true;
    task.multipleChoiceTasks = await Promise.all(
      task.multipleChoiceTasks.map(async (q) => {
        const resolvedQ = { ...q };

        // Process questionMedia
        if (resolvedQ.questionMedia) {
          if (!sendMcMedia) {
            resolvedQ.questionMedia = [];
          } else {
            resolvedQ.questionMedia = await Promise.all(
              resolvedQ.questionMedia.map(async (f) => {
                if (!f.dataUrl && f.mediaId) {
                  try {
                    return { ...f, dataUrl: await getMediaDataUrl(f.mediaId) };
                  } catch (_) {}
                }
                return { ...f };
              })
            );
            resolvedQ.questionMedia = resolvedQ.questionMedia.filter(f => shouldIncludeMcFile(f.name));
          }
        }

        // Process option.media
        if (resolvedQ.options) {
          resolvedQ.options = await Promise.all(
            resolvedQ.options.map(async (o) => {
              const resolvedO = { ...o };
              if (resolvedO.media) {
                if (!sendMcMedia) {
                  resolvedO.media = [];
                } else {
                  resolvedO.media = await Promise.all(
                    resolvedO.media.map(async (f) => {
                      if (!f.dataUrl && f.mediaId) {
                        try {
                          return { ...f, dataUrl: await getMediaDataUrl(f.mediaId) };
                        } catch (_) {}
                      }
                      return { ...f };
                    })
                  );
                  resolvedO.media = resolvedO.media.filter(f => shouldIncludeMcFile(f.name));
                }
              }
              return resolvedO;
            })
          );
        }

        return resolvedQ;
      })
    );
  }

  // Helper to determine if history contains any visible (non-eraser) drawing strokes with points
  const hasVisibleStrokes = (history: Stroke[]): boolean => {
    return history.some(s => s.color !== 'eraser' && s.color !== '#FFFFFF' && s.points.length > 0);
  };

  const canvasImages = options.canvasImages || [];

  // 1. Gather all non-empty pages to evaluate
  let activePagesWithIndex: Array<{ strokeHistory: Stroke[]; originalIndex: number }> = [];
  if (canvasMode === 'a4') {
    activePagesWithIndex = pages
      .map((p, idx) => ({ strokeHistory: p.strokeHistory, originalIndex: idx }))
      .filter(item => hasVisibleStrokes(item.strokeHistory) || canvasImages.some(img => img.pageIndex === item.originalIndex));
  } else {
    if (hasVisibleStrokes(infiniteStrokes) || canvasImages.length > 0) {
      activePagesWithIndex = [{ strokeHistory: infiniteStrokes, originalIndex: 0 }];
    }
  }

  const sendCanvas = activePagesWithIndex.length > 0;
  const sendText = !!(editorText && editorText.trim());

  if (!sendCanvas && !sendText) {
    throw new Error(
      settings.language === 'Deutsch'
        ? "Sowohl die Leinwand als auch der Text-Editor sind leer. Bitte schreiben oder zeichnen Sie etwas, bevor Sie Ihre Arbeit überprüfen."
        : "Both the canvas and the text editor are empty. Please write or draw something before checking your work."
    );
  }

  // 2. Generate cropped bounding-box images for each page (only if sendCanvas is true)
  const pageImages: string[] = [];
  const pageBoxes: BoundingBox[] = [];
  
  if (sendCanvas) {
    for (const item of activePagesWithIndex) {
      const pageImagesForThisPage = canvasImages.filter(img => canvasMode === 'infinite' || img.pageIndex === item.originalIndex);
      const a4W = options.a4Orientation === 'landscape' ? 1130 : 800;
      const a4H = options.a4Orientation === 'landscape' ? 800 : 1130;
      const box = getPageBoundingBox(item.strokeHistory, pageImagesForThisPage, canvasMode, options.a4Orientation);
      let base64Data = '';
      let widthVal = a4W;
      let heightVal = a4H;
      let boxOffset = { x: 0, y: 0 };
      
      if (!box) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = a4W;
        tempCanvas.height = a4H;
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

          // Draw inserted canvas images
          for (const canvasImg of pageImagesForThisPage) {
            try {
              const dataUrl = await getMediaDataUrl(canvasImg.mediaId);
              const img = await loadImage(dataUrl);
              tempCtx.drawImage(img, canvasImg.x, canvasImg.y, canvasImg.width, canvasImg.height);
            } catch (err) {
              console.error('Error drawing canvas image on crop:', err);
            }
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

  const apiKey = settings.openRouterApiKey;
  const model = settings.openRouterModel;

  // Check if API key is provided
  if (!apiKey) {
    throw new Error("No API key configured. Please add your API key in settings.");
  }

  // Lazy-load OpenRouter models/prices for this model if not already cached in this session
  if (model) {
    try {
      await store.ensurePricingLoaded(model);
    } catch (err) {
      console.error('[ai] Failed to load OpenRouter pricing details:', err);
    }
  }

  // Build AI prompt
  const showCanvasAnnotations = settings.showCanvasAnnotations !== false;
  const pageInfoPrompt = (sendCanvas && showCanvasAnnotations)
    ? (canvasMode === 'a4'
      ? `You are checking a multi-page A4 handwriting document. You have been sent a sequence of page images. The first image represents Page Index 0, the second represents Page Index 1, etc.
Your JSON response MUST specify the 'pageIndex' for each marker to identify which page image it is located on (0-based index corresponding to the image sequence).`
      : `Examine the single infinite canvas screenshot. The image represents Page Index 0.`)
    : '';

  // Build image dimensions info for accurate marker placement
  const imageDimensionsInfo = (sendCanvas && showCanvasAnnotations)
    ? pageBoxes.map((box, i) => 
        `Image ${i}: ${box.width}px wide × ${box.height}px tall.`
      ).join('\n')
    : '';

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
  if (sendContextText) {
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
  
  // pageInfoPrompt and imageDimensionsInfo are already calculated above based on showCanvasAnnotations.

  prompt = prompt
    .replace(/\{\{task_name\}\}/g, task.name)
    .replace(/\{\{task_section\}\}/g, task.section || '')
    .replace(/\{\{guidelines\}\}/g, guidelinesPrompt)
    .replace(/\{\{page_info\}\}/g, pageInfoPrompt)
    .replace(/\{\{image_dimensions\}\}/g, imageDimensionsInfo);

  // Dynamic Instructions based on what is sent and showCanvasAnnotations
  let dynamicInstructions = "\n\n**EVALUATION REQUIREMENTS:**\n";
  
  if (sendCanvas) {
    dynamicInstructions += "- Read the student's handwritten work from the attached page image(s).\n";
    if (showCanvasAnnotations) {
      dynamicInstructions += "- Place feedback markers next to the student's handwritten work on the canvas images.\n";
      dynamicInstructions += "- Normalized marker coordinates (x, y from 0 to 1000) MUST be relative to the cropped page image boundary.\n";
      dynamicInstructions += "- For incorrect or partially correct answers, you MUST provide at least two points in 'underlinePoints' to underline the mistake on the canvas.\n";
    } else {
      dynamicInstructions += "- Evaluate the student's canvas drawings visually in the general critique. Do NOT return any coordinates, markers, or underline paths.\n";
    }
  }
  
  if (sendText) {
    dynamicInstructions += "- The student's typed text editor work is provided below under [STUDENT TEXT EDITOR WORK]. Check it carefully.\n";
    dynamicInstructions += "- If there are errors in the typed text, return 'textMarkers' pointing to the lineIndex (0-based) and the exact substring containing the error.\n";
  }

  if (task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0) {
    dynamicInstructions += "- Evaluate the student's overall performance. Take into account the pre-graded Multiple Choice results listed in [STUDENT MULTIPLE CHOICE WORK] when determining the overall grade.\n";
  }

  // Attach student submissions
  let studentWorkContent = "";
  if (task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0) {
    const lines: string[] = [];
    lines.push('\n\n[STUDENT MULTIPLE CHOICE WORK]:');
    lines.push('The student answered the following multiple choice questions. They have been pre-evaluated and graded:');
    
    task.multipleChoiceTasks.forEach((q, index) => {
      const selected = multipleChoiceAnswers[q.id] || [];
      const correctOptionIds = q.options.filter((o: any) => o.isCorrect).map((o: any) => o.id);
      
      const selectedSet = new Set(selected);
      const correctSet = new Set(correctOptionIds);
      const isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every(id => correctSet.has(id));
      
      const questionText = q.question.replace(/\r?\n/g, ' ');
      lines.push(`Question ${index + 1}: "${questionText}"`);
      lines.push(`- Options provided:`);
      q.options.forEach((o: any) => {
        lines.push(`  * Option "${o.text}" (Correct: ${o.isCorrect ? 'Yes' : 'No'})`);
      });
      
      const selectedTexts = q.options.filter((o: any) => selected.includes(o.id)).map((o: any) => o.text);
      lines.push(`- Student selected: [${selectedTexts.join(', ')}]`);
      lines.push(`- Pre-grading: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
    });
    
    studentWorkContent += lines.join('\n') + '\n\n';
  }
  if (sendText) {
    studentWorkContent += `\n\n[STUDENT TEXT EDITOR WORK]:\n${editorText.trim()}\n\n`;
  }
  if (sendCanvas) {
    studentWorkContent += `\n\n[STUDENT CANVAS WORK]:\nThe student's canvas drawings are provided as the page image(s) attached to this message.\n\n`;
  }

  // Response Schemas
  let responseFormatInstructions = "";
  if (sendCanvas && sendText) {
    if (showCanvasAnnotations) {
      responseFormatInstructions = `
**JSON SCHEMA REQUIREMENT (BOTH CANVAS AND TEXT EVALUATION - WITH CANVAS ANNOTATIONS):**
Return a SINGLE JSON object with the following schema:
{
  "generalCritique": "Critique text evaluating the combined submission (drawings and text editor work).",
  "grade": number (0-100 overall grade),
  "canvasMarkers": [
    {
      "pageIndex": number (0-based),
      "x": number (0 to 1000),
      "y": number (0 to 1000),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback for this canvas spot (1 sentence max).",
      "underlinePoints": [{"x": number, "y": number}, ...]
    }
  ],
  "textMarkers": [
    {
      "lineIndex": number (0-based line index in student text),
      "substring": "The exact word/phrase/substring that is wrong",
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback explaining what is wrong (1 sentence max)."
    }
  ]
}
`;
    } else {
      responseFormatInstructions = `
**JSON SCHEMA REQUIREMENT (BOTH CANVAS AND TEXT EVALUATION - NO CANVAS ANNOTATIONS):**
Return a SINGLE JSON object with the following schema:
{
  "generalCritique": "Critique text evaluating the combined submission (drawings and text editor work).",
  "grade": number (0-100 overall grade),
  "textMarkers": [
    {
      "lineIndex": number (0-based line index in student text),
      "substring": "The exact word/phrase/substring that is wrong",
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback explaining what is wrong (1 sentence max)."
    }
  ]
}
`;
    }
  } else if (sendText) {
    responseFormatInstructions = `
**JSON SCHEMA REQUIREMENT (TEXT EDITOR ONLY):**
Return a SINGLE JSON object with the following schema:
{
  "generalCritique": "Critique text evaluating their text editor work.",
  "grade": number (0-100 grade),
  "textMarkers": [
    {
      "lineIndex": number (0-based line index in student text),
      "substring": "The exact word/phrase/substring that is wrong",
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Brief feedback explaining what is wrong (1 sentence max)."
    }
  ]
}
`;
  } else {
    // Canvas Only
    if (showCanvasAnnotations) {
      responseFormatInstructions = `
**JSON SCHEMA REQUIREMENT (CANVAS ONLY - WITH CANVAS ANNOTATIONS):**
Return a SINGLE JSON object with the following schema:
{
  "generalCritique": "Overall critique evaluating their canvas drawings.",
  "grade": number (0-100 grade),
  "markers": [
    {
      "pageIndex": number (0-based index of the page),
      "x": number (0 to 1000),
      "y": number (0 to 1000),
      "type": "correct" | "incorrect" | "partial",
      "feedback": "Specific feedback for this canvas spot (1 sentence max).",
      "underlinePoints": [{"x": number, "y": number}, ...]
    }
  ]
}
`;
    } else {
      responseFormatInstructions = `
**JSON SCHEMA REQUIREMENT (CANVAS ONLY - NO CANVAS ANNOTATIONS):**
Return a SINGLE JSON object with the following schema:
{
  "generalCritique": "Overall critique evaluating their canvas drawings.",
  "grade": number (0-100 grade)
}
`;
    }
  }

  prompt += dynamicInstructions + studentWorkContent + responseFormatInstructions;

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



  const additionalOpenRouterParts: any[] = [];

  if (sendTaskMedia) {
    if (task.instructionFiles && Array.isArray(task.instructionFiles)) {
      task.instructionFiles.forEach(file => {
        if (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown')) {
          return;
        }
        additionalOpenRouterParts.push({ type: 'text', text: `[Task Instruction Attachment: "${file.name}"]` });
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    } else if (task.instructionFile) {
      const file = task.instructionFile;
      if (!(file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown'))) {
        additionalOpenRouterParts.push({ type: 'text', text: `[Task Instruction Attachment: "${file.name}"]` });
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
        additionalOpenRouterParts.push({ type: 'text', text: `[Expected Solution Attachment: "${file.name}"]` });
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    } else if (task.solutionFile) {
      const file = task.solutionFile;
      if (!(file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.md') || file.dataUrl?.startsWith('data:text/plain') || file.dataUrl?.startsWith('data:text/markdown'))) {
        additionalOpenRouterParts.push({ type: 'text', text: `[Expected Solution Attachment: "${file.name}"]` });
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
        additionalOpenRouterParts.push({ type: 'text', text: `[Context Document Attachment: "${file.name}"]` });
        const orPart = getOpenRouterMedia(file);
        if (orPart) additionalOpenRouterParts.push(orPart);
      });
    }
  }

  function getOpenRouterMedia(mediaFile: { name: string; dataUrl?: string }) {
    if (!mediaFile || !mediaFile.dataUrl) return null;
    
    const nameLower = mediaFile.name.toLowerCase();
    
    // PDF Document Modality
    if (nameLower.endsWith('.pdf')) {
      return {
        type: 'file',
        file: {
          filename: mediaFile.name,
          file_data: mediaFile.dataUrl
        }
      };
    }
    
    // Audio Modality
    if (nameLower.endsWith('.mp3') || nameLower.endsWith('.wav') || nameLower.endsWith('.m4a') || nameLower.endsWith('.ogg')) {
      let format = 'mp3';
      if (nameLower.endsWith('.wav')) format = 'wav';
      else if (nameLower.endsWith('.ogg')) format = 'ogg';
      else if (nameLower.endsWith('.m4a')) format = 'm4a';
      
      const base64Data = mediaFile.dataUrl.includes(',') 
        ? mediaFile.dataUrl.split(',')[1] 
        : mediaFile.dataUrl;

      return {
        type: 'input_audio',
        input_audio: {
          data: base64Data,
          format: format
        }
      };
    }
    
    // Video Modality
    if (nameLower.endsWith('.mp4') || nameLower.endsWith('.webm') || nameLower.endsWith('.mov')) {
      return {
        type: 'video_url',
        video_url: {
          url: mediaFile.dataUrl
        },
        videoUrl: {
          url: mediaFile.dataUrl
        }
      };
    }

    // Default: Image Modality
    return {
      type: 'image_url',
      imageUrl: { url: mediaFile.dataUrl },
      image_url: { url: mediaFile.dataUrl }
    };
  }

  let textResult = '';
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
    ...pageImages.flatMap((imgData, idx) => [
      { type: 'text', text: `[Student Canvas Drawing - Page Index ${idx}]` },
      {
        type: 'image_url',
        imageUrl: { url: `data:image/png;base64,${imgData}` }
      }
    ])
  ];

  const chatRequest: any = {
    model: model,
    messages: [
      {
        role: 'user',
        content: contentParts
      }
    ],
    ...(settings.maxOutputTokens && settings.maxOutputTokens > 0 ? { maxTokens: settings.maxOutputTokens } : {})
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
        cost = estimateCost(model, inputTokens, outputTokens);
        console.log('[openrouter-cost] Fallback to estimateCost:', cost);
      }
    }

    store.recordRequest('openrouter', model, inputTokens, outputTokens, reasoningTokens, cost);
  } catch (err) {
    console.error('Failed to log LLM statistics:', err);
  }

  textResult = chatResult.choices?.[0]?.message?.content || 'No response from AI.';

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

  let finalFeedbackText = feedbackText;
  let finalFeedbackScore = feedbackScore;

  if (task.multipleChoiceTasks && task.multipleChoiceTasks.length > 0) {
    const mcResult = gradeMultipleChoiceLocally(task.multipleChoiceTasks, multipleChoiceAnswers, settings?.language || 'English');
    finalFeedbackText = feedbackText;
    finalFeedbackScore = Math.round((mcResult.feedbackScore + feedbackScore) / 2);
  }

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
      feedbackText: finalFeedbackText,
      feedbackScore: finalFeedbackScore,
      feedbackMarkers: textMarkers
    };
  } else if (sendCanvas) {
    canvasCritique = {
      feedbackText: finalFeedbackText,
      feedbackScore: finalFeedbackScore,
      feedbackMarkers: canvasMarkers
    };
  }

  return {
    feedbackText: finalFeedbackText,
    feedbackScore: finalFeedbackScore,
    feedbackMarkers: canvasMarkers,
    canvasCritique,
    textCritique
  };
}

function getPageBoundingBox(history: Stroke[], pageImages: any[], canvasMode: 'infinite' | 'a4', a4Orientation: 'portrait' | 'landscape' = 'portrait'): BoundingBox | null {
  const strokeBox = getStrokesBoundingBox(history, canvasMode, a4Orientation);
  if (pageImages.length === 0) return strokeBox;
  
  let minX = strokeBox ? strokeBox.x : Infinity;
  let minY = strokeBox ? strokeBox.y : Infinity;
  let maxX = strokeBox ? strokeBox.x + strokeBox.width : -Infinity;
  let maxY = strokeBox ? strokeBox.y + strokeBox.height : -Infinity;
  
  for (const img of pageImages) {
    if (img.x < minX) minX = img.x;
    if (img.y < minY) minY = img.y;
    if (img.x + img.width > maxX) maxX = img.x + img.width;
    if (img.y + img.height > maxY) maxY = img.y + img.height;
  }
  
  if (minX === Infinity) return null;
  
  const padding = 20;
  if (canvasMode === 'a4') {
    const a4W = a4Orientation === 'landscape' ? 1130 : 800;
    const a4H = a4Orientation === 'landscape' ? 800 : 1130;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(a4W, maxX + padding);
    maxY = Math.min(a4H, maxY + padding);
  } else {
    minX = minX - padding;
    minY = minY - padding;
    maxX = maxX + padding;
    maxY = maxY + padding;
  }
  
  return { 
    x: Math.round(minX), 
    y: Math.round(minY), 
    width: Math.round(maxX - minX), 
    height: Math.round(maxY - minY) 
  };
}

function gradeMultipleChoiceLocally(questions: any[], answers: Record<string, string[]>, language: string): { feedbackText: string; feedbackScore: number } {
  let correctCount = 0;
  const totalQuestions = questions.length;
  let feedbackLines: string[] = [];

  const isDe = language === 'Deutsch';

  if (isDe) {
    feedbackLines.push(`### Multiple-Choice-Auswertung`);
  } else {
    feedbackLines.push(`### Multiple Choice Evaluation`);
  }

  for (let i = 0; i < totalQuestions; i++) {
    const q = questions[i];
    const selected = answers[q.id] || [];
    const correctOptionIds = q.options.filter((o: any) => o.isCorrect).map((o: any) => o.id);
    
    const selectedSet = new Set(selected);
    const correctSet = new Set(correctOptionIds);
    const isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every(id => correctSet.has(id));

    const questionText = q.question.replace(/\r?\n/g, ' ');
    const displayQuestion = questionText.substring(0, 50) + (questionText.length > 50 ? '...' : '');

    if (isCorrect) {
      correctCount++;
      feedbackLines.push(`- **Frage ${i + 1}:** ${displayQuestion} → ✅ ${isDe ? 'Richtig' : 'Correct'}`);
    } else {
      const correctNames = q.options.filter((o: any) => o.isCorrect).map((o: any) => o.text || '...').join(', ');
      feedbackLines.push(`- **Frage ${i + 1}:** ${displayQuestion} → ❌ ${isDe ? 'Falsch' : 'Incorrect'} (${isDe ? 'Richtige Antwort' : 'Correct answer'}: *${correctNames}*)`);
    }
  }

  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 100;
  
  if (isDe) {
    feedbackLines.push(`\n**Gesamtergebnis:** ${correctCount} von ${totalQuestions} richtig (${score}%)`);
  } else {
    feedbackLines.push(`\n**Overall Result:** ${correctCount} of ${totalQuestions} correct (${score}%)`);
  }

  return {
    feedbackText: feedbackLines.join('\n'),
    feedbackScore: score
  };
}
