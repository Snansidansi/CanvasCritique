import { 
  type Stroke, 
  type Point, 
  type BoundingBox, 
  loadImage, 
  drawGuidelinesInWorld, 
  getStrokesBoundingBox 
} from '../utils/canvas';
import { store } from '../state/store.svelte';
import { readMediaFile } from '../db/media';

export function estimateCost(provider: 'gemini' | 'openrouter', model: string, inputTokens: number, outputTokens: number): number {
  const modelLower = model.toLowerCase();
  
  if (provider === 'gemini') {
    if (modelLower.includes('gemini-1.5-flash-8b')) {
      return (inputTokens * 0.0375 + outputTokens * 0.15) / 1000000;
    } else if (modelLower.includes('gemini-1.5-flash') || modelLower.includes('gemini-2.0-flash')) {
      return (inputTokens * 0.075 + outputTokens * 0.30) / 1000000;
    } else if (modelLower.includes('gemini-1.5-pro')) {
      return (inputTokens * 1.25 + outputTokens * 5.00) / 1000000;
    }
    return (inputTokens * 0.075 + outputTokens * 0.30) / 1000000;
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
  instructions?: string;
  solution?: string;
  instructionFiles?: Array<{ name: string; dataUrl?: string }>;
  solutionFiles?: Array<{ name: string; dataUrl?: string }>;
  instructionFile?: { name: string; dataUrl?: string }; // legacy
  solutionFile?: { name: string; dataUrl?: string }; // legacy
}

export interface CheckWorkSettings {
  apiProvider: string; // 'gemini' | 'openrouter'
  geminiApiKey: string;
  openRouterApiKey: string;
  geminiModel: string;
  openRouterModel: string;
  openRouterReasoning: boolean;
  openRouterProvider?: string[];
  sendTaskMedia?: boolean;
  sendSolutionMedia?: boolean;
  sendCanvasBackground?: boolean;
  sendTaskText?: boolean;
  sendSolutionText?: boolean;
  language?: string;
  customSystemPrompt?: string;
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
    defaultSystemPrompt
  } = options;

  // Resolve media files from filesystem to data URLs
  const task = { ...initialTask };
  if (task.instructionFiles) {
    task.instructionFiles = await Promise.all(
      task.instructionFiles.map(async (f) => {
        if (!f.dataUrl && f.relativePath) {
          try {
            return { ...f, dataUrl: await readMediaFile(f.relativePath) };
          } catch (_) {}
        }
        return { ...f };
      })
    );
  }
  if (task.solutionFiles) {
    task.solutionFiles = await Promise.all(
      task.solutionFiles.map(async (f) => {
        if (!f.dataUrl && f.relativePath) {
          try {
            return { ...f, dataUrl: await readMediaFile(f.relativePath) };
          } catch (_) {}
        }
        return { ...f };
      })
    );
  }
  if (task.instructionFile && !task.instructionFile.dataUrl && task.instructionFile.relativePath) {
    try {
      task.instructionFile = { ...task.instructionFile, dataUrl: await readMediaFile(task.instructionFile.relativePath) };
    } catch (_) {}
  }
  if (task.solutionFile && !task.solutionFile.dataUrl && task.solutionFile.relativePath) {
    try {
      task.solutionFile = { ...task.solutionFile, dataUrl: await readMediaFile(task.solutionFile.relativePath) };
    } catch (_) {}
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

  if (activePagesWithIndex.length === 0) {
    throw new Error("Canvas is empty. Please draw some calligraphy before checking your work.");
  }

  // 2. Generate cropped bounding-box images for each page
  const pageImages: string[] = [];
  const pageBoxes: BoundingBox[] = [];
  
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
          // Draw custom background pattern image if present
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

          // Draw active guidelines background template offset relative to bounding box
          drawGuidelinesInWorld(tempCtx, box.x, box.y, box.width, box.height, activeBg, bgOpacity);
        }
        
        tempCtx.restore();
      }
      
      // Draw drawing stroke lines offset by bounding box coordinates on a separate transparent canvas
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
      
      // Draw the composited strokes layer on top of guidelines
      if (tempCtx) {
        tempCtx.drawImage(strokesCanvas, 0, 0);
      }
      
      base64Data = tempCanvas.toDataURL('image/png').split(',')[1];
    }
    
    pageImages.push(base64Data);
    pageBoxes.push({ ...boxOffset, width: widthVal, height: heightVal });
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
  const guidelinesPrompt = projectGuidelines 
    ? `\nAdditional grading guidelines from the teacher:\n"${projectGuidelines}"\nPlease take these guidelines into account when evaluating the student's work.\n`
    : '';

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

  const rawInstructionsText = sendTaskText ? ((task.instructions || '') + instructionsTextFilesContent) : '';
  const rawSolutionText = sendSolutionText ? ((task.solution || '') + solutionTextFilesContent) : '';

  const taskInstructionsText = rawInstructionsText.trim() ? `Task instructions: "${rawInstructionsText.trim()}"` : '';
  const expectedSolutionText = rawSolutionText.trim() ? `Expected correct solution: "${rawSolutionText.trim()}"` : '';

  let prompt = promptTemplate;
  
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
  
  prompt = prompt
    .replace(/\{\{task_name\}\}/g, task.name)
    .replace(/\{\{guidelines\}\}/g, guidelinesPrompt)
    .replace(/\{\{page_info\}\}/g, pageInfoPrompt)
    .replace(/\{\{image_dimensions\}\}/g, imageDimensionsInfo);

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
      image_url: { url: mediaFile.dataUrl }
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

  let response: Response;
  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    response = await fetch(url, {
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
          responseMimeType: "application/json"
        }
      })
    });
  } else {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const requestBody: any = {
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...additionalOpenRouterParts,
            ...pageImages.map(imgData => ({
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imgData}` }
            }))
          ]
        }
      ],
      reasoning: {
        exclude: !settings.openRouterReasoning
      }
    };
    const selectedProviders = settings.openRouterProvider || [];
    if (selectedProviders.length > 0) {
      requestBody.provider = {
        order: selectedProviders
      };
    }
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
  }

  if (!response.ok) {
    throw new Error(`API returned error status: ${response.status}`);
  }

  const resData = await response.json();
  
  // Extract and record LLM usage statistics
  try {
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    if (provider === 'gemini') {
      inputTokens = resData.usageMetadata?.promptTokenCount || 0;
      outputTokens = resData.usageMetadata?.candidatesTokenCount || 0;
    } else {
      inputTokens = resData.usage?.prompt_tokens || 0;
      outputTokens = resData.usage?.completion_tokens || 0;
      reasoningTokens = resData.usage?.reasoning_tokens || 0;
    }
    const cost = estimateCost(provider as 'gemini' | 'openrouter', model, inputTokens, outputTokens);
    store.recordRequest(provider as 'gemini' | 'openrouter', model, inputTokens, outputTokens, reasoningTokens, cost);
  } catch (err) {
    console.error('Failed to log LLM statistics:', err);
  }
  
  let textResult = '';
  if (provider === 'gemini') {
    textResult = resData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
  } else {
    textResult = resData.choices?.[0]?.message?.content || 'No response from AI.';
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
  
  const rawMarkers = parsed.markers || [];
  const feedbackMarkers = rawMarkers.map((m: any, index: number) => {
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

  return {
    feedbackText,
    feedbackScore,
    feedbackMarkers
  };
}
