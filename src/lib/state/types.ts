// CanvasCritique Store Types & Interfaces

export interface MediaFile {
  name: string;
  dataUrl?: string;
  mediaId?: string;
}

export interface Task {
  id: string;
  name: string;
  completed: boolean;
  instructions: string;
  solution: string;
  category: string;
  projectId?: string;
  instructionFiles?: MediaFile[];
  solutionFiles?: MediaFile[];
  instructionFile?: MediaFile | null; // legacy
  solutionFile?: MediaFile | null; // legacy
  critique?: {
    feedbackText: string;
    feedbackScore: number | null;
    feedbackMarkers: any[];
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
  } | null;
  background?: string | null;
  editorText?: string;
  aiInstructions?: string;
  settingsOverride?: ProjectSettingsOverride;
  defaultEditMode?: 'canvas' | 'text' | 'both';
  contextFiles?: MediaFile[];
  templateCanvasData?: string | null;
  providedFiles?: MediaFile[];
  attempts?: TaskAttempt[];
  activeAttemptId?: string | null;
}

export interface TaskAttempt {
  id: string;
  taskId: string;
  name: string;
  timestamp: string;
  canvasData: any;
  editorText: string;
  critique: any;
}

export interface ProjectSettingsOverride {
  overrideSettings: boolean;
  overrideModel?: boolean;
  overrideCanvas?: boolean;
  overrideEditorFontSize?: boolean;
  overrideEraser?: boolean;
  overrideEvaluation?: boolean;
  overrideSystemPrompt?: boolean;
  overrideTaskNumbering?: boolean;
  overrideMediaFilter?: boolean;
  openRouterModel?: string;
  openRouterProvider?: string[];
  openRouterReasoning?: boolean | string;
  showCanvasAnnotations?: boolean;
  sendTaskMedia?: boolean;
  sendSolutionMedia?: boolean;
  sendCanvasBackground?: boolean;
  sendTaskText?: boolean;
  sendSolutionText?: boolean;
  sendContextText?: boolean;
  sendContextMedia?: boolean;
  maxOutputTokens?: number;
  customSystemPrompt?: string;
  language?: string;
  canvasMode?: string;
  canvasFontSize?: number;
  editorFontSize?: number;
  autoNumberTasks?: boolean;
  taskNumberingTemplate?: string;
  eraserMode?: 'normal' | 'stroke';
  eraserRadiusNormal?: number;
  eraserRadiusStroke?: number;
  taskMediaFilterMode?: string;
  taskMediaFilterExtensions?: string;
  solutionMediaFilterMode?: string;
  solutionMediaFilterExtensions?: string;
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
  settingsOverride?: ProjectSettingsOverride;
  default_background?: string | null;
}

export interface StylusButton {
  id: string;
  name: string;
  button: number;
  buttons: number;
  action: string;
}

export interface ApiStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: number;
}

export interface RequestLog {
  id: string;
  timestamp: string;
  provider: 'openrouter';
  model: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: number;
}

export interface DailyStats {
  openrouter: ApiStats;
}

export interface Settings {
  theme: string;
  openRouterApiKey: string;
  openRouterModel: string;
  showCanvasAnnotations: boolean;
  openRouterProvider: string[];
  openRouterReasoning: boolean | string;
  sendTaskMedia: boolean;
  sendSolutionMedia: boolean;
  sendCanvasBackground: boolean;
  sendTaskText: boolean;
  sendSolutionText: boolean;
  sendContextText: boolean;
  sendContextMedia: boolean;
  maxOutputTokens: number;
  canvasMode: string;
  canvasFontSize: number;
  editorFontSize?: number;
  editorShowAllRaw?: boolean;
  customSystemPrompt: string;
  systemPromptEditingEnabled: boolean;
  language: string;
  autoNumberTasks: boolean;
  taskNumberingTemplate: string;
  stylusButtons: StylusButton[];
  stylusMode: boolean;
  autoCompleteOnSuccess: boolean;
  recentColors: string[];
  penSize: number;
  statsEnabled: boolean;
  eraserMode: 'normal' | 'stroke';
  eraserRadiusNormal: number;
  eraserRadiusStroke: number;
  penRecentColors: string[];
  penBrushWidth: number;
  penEraserWidth: number;
  userIcons?: string[];
  taskMediaFilterMode?: string;
  taskMediaFilterExtensions?: string;
  solutionMediaFilterMode?: string;
  solutionMediaFilterExtensions?: string;
  webdavEnabled?: boolean;
  webdavUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  webdavAutoSync?: boolean;
  webdavSyncIntervalMinutes?: number;
  webdavSyncOnStartup?: boolean;
  webdavSyncOnShutdown?: boolean;
  lastSyncedTimestamp?: string;
  lastSyncedDbHash?: string;
  webdavSyncMode?: 'bidirectional' | 'download' | 'upload';
  rememberWindowState?: boolean;
  autoUpdateCheckEnabled?: boolean;
  filterImage?: boolean;
  filterPdf?: boolean;
  filterAudio?: boolean;
  filterVideo?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  sortOrder?: number;
}

export interface CustomBackground {
  id: string;
  name: string;
  mediaId: string;
  iconMediaId: string | null;
  icon: string | null;
}

export interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isAlert?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  thirdLabel?: string;
  onThird?: () => void;
  isPrimary?: boolean;
}

export interface ExportDialog {
  project: Project;
  hasCritique: boolean;
  hasCanvas: boolean;
  onConfirm: (options: { includeCritique: boolean; includeCanvas: boolean; includeCompleted: boolean }) => Promise<void>;
  onCancel: () => void;
}

export interface ImportDialog {
  projectData: any;
  hasCritique: boolean;
  hasCanvas: boolean;
  targetProjectId?: string;
  targetCategory?: string;
  onConfirm: (options: {
    importCritique: boolean;
    importCanvas: boolean;
    importCompleted: boolean;
    mergeProjectId?: string;
    mergeMode?: 'update' | 'skip';
  }) => void;
  onCancel: () => void;
}
