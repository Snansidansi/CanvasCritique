// CanvasCritique Store Types & Interfaces

export interface MediaFile {
  name: string;
  dataUrl?: string;
  relativePath?: string;
}

export interface Task {
  id: string;
  name: string;
  completed: boolean;
  instructions: string;
  solution: string;
  category: string;
  instructionFiles?: MediaFile[];
  solutionFiles?: MediaFile[];
  instructionFile?: MediaFile | null; // legacy
  solutionFile?: MediaFile | null; // legacy
  critique?: {
    feedbackText: string;
    feedbackScore: number | null;
    feedbackMarkers: any[];
  } | null;
}

export interface ProjectSettingsOverride {
  overrideSettings: boolean;
  overrideModel?: boolean;
  overrideCanvas?: boolean;
  overrideEvaluation?: boolean;
  overrideSystemPrompt?: boolean;
  overrideTaskNumbering?: boolean;
  apiProvider?: string;
  geminiModel?: string;
  openRouterModel?: string;
  openRouterProvider?: string[];
  openRouterReasoning?: boolean;
  sendTaskMedia?: boolean;
  sendSolutionMedia?: boolean;
  sendCanvasBackground?: boolean;
  sendTaskText?: boolean;
  sendSolutionText?: boolean;
  customSystemPrompt?: string;
  language?: string;
  canvasMode?: string;
  autoNumberTasks?: boolean;
  taskNumberingTemplate?: string;
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

export interface DailyStats {
  gemini: ApiStats;
  openrouter: ApiStats;
}

export interface Settings {
  theme: string;
  apiProvider: string;
  geminiApiKey: string;
  openRouterApiKey: string;
  geminiModel: string;
  openRouterModel: string;
  openRouterProvider: string[];
  openRouterReasoning: boolean;
  autoExport: boolean;
  exportFrequency: { days: number; hours: number; minutes: number };
  exportPathSettings: string;
  exportPathData: string;
  autoExportData: boolean;
  exportFrequencyData: { days: number; hours: number; minutes: number };
  sendTaskMedia: boolean;
  sendSolutionMedia: boolean;
  sendCanvasBackground: boolean;
  sendTaskText: boolean;
  sendSolutionText: boolean;
  canvasMode: string;
  customSystemPrompt: string;
  systemPromptEditingEnabled: boolean;
  language: string;
  autoNumberTasks: boolean;
  taskNumberingTemplate: string;
  stylusButtons: StylusButton[];
  stylusMode: boolean;
  autoCompleteOnSuccess: boolean;
  statsEnabled: boolean;
  stats: {
    daily: Record<string, DailyStats>;
  };
}

export interface Profile {
  id: string;
  name: string;
  icon: string | null;
  color: string;
}

export interface CustomBackground {
  id: string;
  name: string;
  relativePath: string;
  icon: string | null;
}

export interface ConfirmDialog {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
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
  onConfirm: (options: {
    importCritique: boolean;
    importCanvas: boolean;
    importCompleted: boolean;
    mergeProjectId?: string;
    mergeMode?: 'update' | 'skip';
  }) => void;
  onCancel: () => void;
}
