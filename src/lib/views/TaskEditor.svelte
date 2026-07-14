<script lang="ts">
  import { store } from '../state/store.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { parseMarkdown } from '../utils/markdown';
  import { t } from '../services/i18n';
  import { saveMediaToDb, getMediaDataUrl, isAudioFile, isVideoFile, isImageFile, getFileIcon, isIntegratedFile, openAttachmentInDefaultApp } from '../db/media';
  import AudioPlayer from '../components/practice/AudioPlayer.svelte';
  import AiModelConfig from '../components/settings/AiModelConfig.svelte';
  import EvaluationDetailsSettings from '../components/settings/EvaluationDetailsSettings.svelte';
  import CanvasModeSelector from '../components/settings/CanvasModeSelector.svelte';
  import MediaFilterSettings from '../components/settings/MediaFilterSettings.svelte';
  import TaskNumberingConfig from '../components/settings/TaskNumberingConfig.svelte';

  // Form states
  let taskName = $state('');
  let targetProjectId = $state('');
  let nameInput = $state<HTMLInputElement | null>(null);
  let instructions = $state('');
  let solution = $state('');
  let aiInstructions = $state('');
  let aiInstructionsExpanded = $state(false);
  let category = $state('Basics');
  let showInstructionsRaw = $state(true);
  let showSolutionRaw = $state(true);
  let defaultEditMode = $state<'canvas' | 'text' | 'both'>('canvas');
  let contextFiles = $state<any[]>([]);
  let providedFiles = $state<any[]>([]);
  let isDragOverProvided = $state(false);
  let providedFilesExpanded = $state(false);

  // Task specific override settings
  let settingsOverride = $state<any>({
    overrideSettings: false,
    overrideModel: false,
    overrideCanvas: false,
    overrideEraser: false,
    overrideEvaluation: false,
    overrideSystemPrompt: false,
    overrideTaskNumbering: false,
    overrideMediaFilter: false,
    apiProvider: 'gemini',
    geminiModel: 'gemini-1.5-pro',
    openRouterModel: 'google/gemini-2.0-pro-exp-02-05:free',
    openRouterProvider: [],
    openRouterReasoning: false,
    sendTaskMedia: true,
    sendSolutionMedia: true,
    sendCanvasBackground: true,
    sendTaskText: true,
    sendSolutionText: true,
    customSystemPrompt: '',
    language: 'de',
    canvasMode: 'infinite',
    canvasFontSize: 13,
    autoNumberTasks: true,
    taskNumberingTemplate: 'Aufgabe {n}',
    eraserMode: 'normal',
    eraserRadiusNormal: 24,
    eraserRadiusStroke: 24,
    taskMediaFilterMode: 'blacklist',
    taskMediaFilterExtensions: '',
    solutionMediaFilterMode: 'blacklist',
    solutionMediaFilterExtensions: ''
  });

  // Overrides tab state
  type TaskTabId = 'model' | 'evaluation' | 'mediaFilter' | 'canvas' | 'editorFontSize' | 'eraser' | 'prompt' | 'numbering';
  let activeTaskTab = $state<TaskTabId>('model');

  // Inline rename state for media attachments
  let editingFileIndex = $state<number | null>(null);
  let editingFileType = $state<'instruction' | 'solution' | 'context' | 'provided' | null>(null);
  let editingFileNameValue = $state<string>('');
  let editingFileExtension = $state<string>('');
  let renameInputEl = $state<HTMLInputElement | null>(null);

  function splitFilename(filename: string): { base: string; ext: string } {
    if (!filename) return { base: '', ext: '' };
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return { base: filename, ext: '' };
    }
    return {
      base: filename.substring(0, lastDotIndex),
      ext: filename.substring(lastDotIndex)
    };
  }

  function getBaseName(filename: string): string {
    return splitFilename(filename).base;
  }

  $effect(() => {
    if (editingFileIndex !== null && renameInputEl) {
      renameInputEl.focus();
      renameInputEl.select();
    }
  });

  function saveInlineRename() {
    if (editingFileIndex === null || editingFileType === null) return;
    const base = editingFileNameValue.trim();
    if (base !== '') {
      const name = base + editingFileExtension;
      if (editingFileType === 'instruction') {
        const files = [...instructionFiles];
        files[editingFileIndex] = { ...files[editingFileIndex], name };
        instructionFiles = files;
      } else if (editingFileType === 'solution') {
        const files = [...solutionFiles];
        files[editingFileIndex] = { ...files[editingFileIndex], name };
        solutionFiles = files;
      } else if (editingFileType === 'context') {
        const files = [...contextFiles];
        files[editingFileIndex] = { ...files[editingFileIndex], name };
        contextFiles = files;
      } else if (editingFileType === 'provided') {
        const files = [...providedFiles];
        files[editingFileIndex] = { ...files[editingFileIndex], name };
        providedFiles = files;
      }
    }
    cancelInlineRename();
  }

  function cancelInlineRename() {
    editingFileIndex = null;
    editingFileType = null;
    editingFileNameValue = '';
    editingFileExtension = '';
  }

  const taskTabs = [
    { id: 'model', labelKey: 'lessonSettings.modelConfigTitle', icon: 'smart_toy' },
    { id: 'evaluation', labelKey: 'lessonSettings.evaluationDetailsTitle', icon: 'fact_check' },
    { id: 'mediaFilter', labelKey: 'settings.api.mediaFilterMode', icon: 'filter_alt' },
    { id: 'canvas', labelKey: 'lessonSettings.canvasLayoutTitle', icon: 'aspect_ratio' },
    { id: 'editorFontSize', labelKey: 'lessonSettings.editorFontSizeTitle', icon: 'format_size' },
    { id: 'eraser', labelKey: 'lessonSettings.eraserTitle', icon: 'ink_eraser' },
    { id: 'prompt', labelKey: 'lessonSettings.systemPromptTitle', icon: 'terminal' },
    { id: 'numbering', labelKey: 'lessonSettings.taskNumberingTitle', icon: 'format_list_numbered' }
  ];

  function handleToggleOverride(category: 'overrideModel' | 'overrideCanvas' | 'overrideEditorFontSize' | 'overrideEraser' | 'overrideEvaluation' | 'overrideSystemPrompt' | 'overrideTaskNumbering' | 'overrideMediaFilter', checked: boolean) {
    settingsOverride[category] = checked;

    if (checked) {
      const parent = store.getEffectiveSettings(targetProjectId);
      if (category === 'overrideModel') {
        settingsOverride.apiProvider = parent.apiProvider;
        settingsOverride.geminiModel = parent.geminiModel;
        settingsOverride.openRouterModel = parent.openRouterModel;
        settingsOverride.openRouterReasoning = parent.openRouterReasoning;
        settingsOverride.openRouterProvider = parent.openRouterProvider;
      } else if (category === 'overrideEvaluation') {
        settingsOverride.sendTaskMedia = parent.sendTaskMedia;
        settingsOverride.sendSolutionMedia = parent.sendSolutionMedia;
        settingsOverride.sendCanvasBackground = parent.sendCanvasBackground;
        settingsOverride.sendTaskText = parent.sendTaskText;
        settingsOverride.sendSolutionText = parent.sendSolutionText;
      } else if (category === 'overrideMediaFilter') {
        settingsOverride.taskMediaFilterMode = parent.taskMediaFilterMode;
        settingsOverride.taskMediaFilterExtensions = parent.taskMediaFilterExtensions;
        settingsOverride.solutionMediaFilterMode = parent.solutionMediaFilterMode;
        settingsOverride.solutionMediaFilterExtensions = parent.solutionMediaFilterExtensions;
      } else if (category === 'overrideCanvas') {
        settingsOverride.canvasMode = parent.canvasMode;
        settingsOverride.canvasFontSize = parent.canvasFontSize;
      } else if (category === 'overrideEditorFontSize') {
        settingsOverride.editorFontSize = parent.editorFontSize;
      } else if (category === 'overrideEraser') {
        settingsOverride.eraserMode = parent.eraserMode;
        settingsOverride.eraserRadiusNormal = parent.eraserRadiusNormal;
        settingsOverride.eraserRadiusStroke = parent.eraserRadiusStroke;
      } else if (category === 'overrideSystemPrompt') {
        settingsOverride.customSystemPrompt = parent.customSystemPrompt || 'You are a thorough but encouraging teacher...';
      } else if (category === 'overrideTaskNumbering') {
        settingsOverride.autoNumberTasks = parent.autoNumberTasks;
        settingsOverride.taskNumberingTemplate = parent.taskNumberingTemplate;
      }
    } else {
      if (category === 'overrideSystemPrompt') {
        settingsOverride.customSystemPrompt = '';
      }
    }
  }

  // Derived edit state
  let isEditMode = $derived(store.editingTask !== null);

  // File names and object references
  let instructionFiles = $state([]);
  let solutionFiles = $state([]);

  // Navigation guard variables
  let isSavingOrCanceling = $state(false);
  let initialValues = $state({
    taskName: '',
    instructions: '',
    solution: '',
    aiInstructions: '',
    category: '',
    targetProjectId: '',
    defaultEditMode: '',
    contextFilesJson: '',
    providedFilesJson: '',
    settingsOverrideJson: ''
  });

  function hasChanges() {
    if (isSavingOrCanceling) return false;
    return taskName !== initialValues.taskName ||
           instructions !== initialValues.instructions ||
           solution !== initialValues.solution ||
           aiInstructions !== initialValues.aiInstructions ||
           category !== initialValues.category ||
           targetProjectId !== initialValues.targetProjectId ||
           defaultEditMode !== initialValues.defaultEditMode ||
           JSON.stringify(contextFiles) !== initialValues.contextFilesJson ||
           JSON.stringify(providedFiles) !== initialValues.providedFilesJson ||
           JSON.stringify(settingsOverride) !== initialValues.settingsOverrideJson;
  }

  onMount(() => {
    if (store.editingTask) {
      taskName = store.editingTask.name;
      instructions = store.editingTask.instructions;
      solution = store.editingTask.solution;
      aiInstructions = store.editingTask.aiInstructions || '';
      aiInstructionsExpanded = !!aiInstructions;
      category = store.editingTask.category || 'Basics';
      targetProjectId = store.editingTask.projectId || store.activeProject?.id || '';
      defaultEditMode = store.editingTask.defaultEditMode || 'both';
      contextFiles = [...(store.editingTask.contextFiles || [])];
      providedFiles = [...(store.editingTask.providedFiles || [])];
      providedFilesExpanded = providedFiles.length > 0;

      const parentSettings = store.getEffectiveSettings(targetProjectId);

      if (store.editingTask.settingsOverride) {
        settingsOverride = {
          overrideSettings: store.editingTask.settingsOverride.overrideSettings ?? false,
          overrideModel: store.editingTask.settingsOverride.overrideModel ?? false,
          overrideCanvas: store.editingTask.settingsOverride.overrideCanvas ?? false,
          overrideEditorFontSize: store.editingTask.settingsOverride.overrideEditorFontSize ?? false,
          overrideEraser: store.editingTask.settingsOverride.overrideEraser ?? false,
          overrideEvaluation: store.editingTask.settingsOverride.overrideEvaluation ?? false,
          overrideSystemPrompt: store.editingTask.settingsOverride.overrideSystemPrompt ?? false,
          overrideTaskNumbering: store.editingTask.settingsOverride.overrideTaskNumbering ?? false,
          overrideMediaFilter: store.editingTask.settingsOverride.overrideMediaFilter ?? false,
          apiProvider: store.editingTask.settingsOverride.apiProvider ?? parentSettings.apiProvider,
          geminiModel: store.editingTask.settingsOverride.geminiModel ?? parentSettings.geminiModel,
          openRouterModel: store.editingTask.settingsOverride.openRouterModel ?? parentSettings.openRouterModel,
          openRouterProvider: store.editingTask.settingsOverride.openRouterProvider ?? parentSettings.openRouterProvider,
          openRouterReasoning: store.editingTask.settingsOverride.openRouterReasoning ?? parentSettings.openRouterReasoning,
          sendTaskMedia: store.editingTask.settingsOverride.sendTaskMedia ?? parentSettings.sendTaskMedia,
          sendSolutionMedia: store.editingTask.settingsOverride.sendSolutionMedia ?? parentSettings.sendSolutionMedia,
          sendCanvasBackground: store.editingTask.settingsOverride.sendCanvasBackground ?? parentSettings.sendCanvasBackground,
          sendTaskText: store.editingTask.settingsOverride.sendTaskText ?? parentSettings.sendTaskText,
          sendSolutionText: store.editingTask.settingsOverride.sendSolutionText ?? parentSettings.sendSolutionText,
          customSystemPrompt: store.editingTask.settingsOverride.customSystemPrompt ?? parentSettings.customSystemPrompt,
          language: store.editingTask.settingsOverride.language ?? parentSettings.language,
          canvasMode: store.editingTask.settingsOverride.canvasMode ?? parentSettings.canvasMode,
          canvasFontSize: store.editingTask.settingsOverride.canvasFontSize ?? parentSettings.canvasFontSize,
          editorFontSize: store.editingTask.settingsOverride.editorFontSize ?? parentSettings.editorFontSize,
          autoNumberTasks: store.editingTask.settingsOverride.autoNumberTasks ?? parentSettings.autoNumberTasks,
          taskNumberingTemplate: store.editingTask.settingsOverride.taskNumberingTemplate ?? parentSettings.taskNumberingTemplate,
          eraserMode: store.editingTask.settingsOverride.eraserMode ?? parentSettings.eraserMode,
          eraserRadiusNormal: store.editingTask.settingsOverride.eraserRadiusNormal ?? parentSettings.eraserRadiusNormal,
          eraserRadiusStroke: store.editingTask.settingsOverride.eraserRadiusStroke ?? parentSettings.eraserRadiusStroke,
          taskMediaFilterMode: store.editingTask.settingsOverride.taskMediaFilterMode ?? parentSettings.taskMediaFilterMode,
          taskMediaFilterExtensions: store.editingTask.settingsOverride.taskMediaFilterExtensions ?? parentSettings.taskMediaFilterExtensions,
          solutionMediaFilterMode: store.editingTask.settingsOverride.solutionMediaFilterMode ?? parentSettings.solutionMediaFilterMode,
          solutionMediaFilterExtensions: store.editingTask.settingsOverride.solutionMediaFilterExtensions ?? parentSettings.solutionMediaFilterExtensions
        };
      } else {
        settingsOverride = {
          overrideSettings: false,
          overrideModel: false,
          overrideCanvas: false,
          overrideEditorFontSize: false,
          overrideEraser: false,
          overrideEvaluation: false,
          overrideSystemPrompt: false,
          overrideTaskNumbering: false,
          overrideMediaFilter: false,
          apiProvider: parentSettings.apiProvider,
          geminiModel: parentSettings.geminiModel,
          openRouterModel: parentSettings.openRouterModel,
          openRouterProvider: parentSettings.openRouterProvider,
          openRouterReasoning: parentSettings.openRouterReasoning,
          sendTaskMedia: parentSettings.sendTaskMedia,
          sendSolutionMedia: parentSettings.sendSolutionMedia,
          sendCanvasBackground: parentSettings.sendCanvasBackground,
          sendTaskText: parentSettings.sendTaskText,
          sendSolutionText: parentSettings.sendSolutionText,
          customSystemPrompt: parentSettings.customSystemPrompt,
          language: parentSettings.language,
          canvasMode: parentSettings.canvasMode,
          canvasFontSize: parentSettings.canvasFontSize,
          editorFontSize: parentSettings.editorFontSize,
          autoNumberTasks: parentSettings.autoNumberTasks,
          taskNumberingTemplate: parentSettings.taskNumberingTemplate,
          eraserMode: parentSettings.eraserMode,
          eraserRadiusNormal: parentSettings.eraserRadiusNormal,
          eraserRadiusStroke: parentSettings.eraserRadiusStroke,
          taskMediaFilterMode: parentSettings.taskMediaFilterMode,
          taskMediaFilterExtensions: parentSettings.taskMediaFilterExtensions,
          solutionMediaFilterMode: parentSettings.solutionMediaFilterMode,
          solutionMediaFilterExtensions: parentSettings.solutionMediaFilterExtensions
        };
      }
      
      // Load saved files
      if (store.editingTask.instructionFiles && Array.isArray(store.editingTask.instructionFiles)) {
        instructionFiles = [...store.editingTask.instructionFiles];
      } else if (store.editingTask.instructionFile) {
        instructionFiles = [store.editingTask.instructionFile];
      }

      if (store.editingTask.solutionFiles && Array.isArray(store.editingTask.solutionFiles)) {
        solutionFiles = [...store.editingTask.solutionFiles];
      } else if (store.editingTask.solutionFile) {
        solutionFiles = [store.editingTask.solutionFile];
      }
    } else if (store.quickAddTaskData) {
      taskName = store.quickAddTaskData.name;
      category = store.quickAddTaskData.category || 'Basics';
      targetProjectId = store.activeProject?.id || (store.projects.find(p => p.profileId === store.activeProfileId)?.id || '');
      store.quickAddTaskData = null; // Clear it out
      
      const parentSettings = store.getEffectiveSettings(targetProjectId);
      settingsOverride = {
        overrideSettings: false,
        overrideModel: false,
        overrideCanvas: false,
        overrideEraser: false,
        overrideEvaluation: false,
        overrideSystemPrompt: false,
        overrideTaskNumbering: false,
        overrideMediaFilter: false,
        apiProvider: parentSettings.apiProvider,
        geminiModel: parentSettings.geminiModel,
        openRouterModel: parentSettings.openRouterModel,
        openRouterProvider: parentSettings.openRouterProvider,
        openRouterReasoning: parentSettings.openRouterReasoning,
        sendTaskMedia: parentSettings.sendTaskMedia,
        sendSolutionMedia: parentSettings.sendSolutionMedia,
        sendCanvasBackground: parentSettings.sendCanvasBackground,
        sendTaskText: parentSettings.sendTaskText,
        sendSolutionText: parentSettings.sendSolutionText,
        customSystemPrompt: parentSettings.customSystemPrompt,
        language: parentSettings.language,
        canvasMode: parentSettings.canvasMode,
        canvasFontSize: parentSettings.canvasFontSize,
        overrideEditorFontSize: false,
        editorFontSize: parentSettings.editorFontSize,
        autoNumberTasks: parentSettings.autoNumberTasks,
        taskNumberingTemplate: parentSettings.taskNumberingTemplate,
        eraserMode: parentSettings.eraserMode,
        eraserRadiusNormal: parentSettings.eraserRadiusNormal,
        eraserRadiusStroke: parentSettings.eraserRadiusStroke,
        taskMediaFilterMode: parentSettings.taskMediaFilterMode,
        taskMediaFilterExtensions: parentSettings.taskMediaFilterExtensions,
        solutionMediaFilterMode: parentSettings.solutionMediaFilterMode,
        solutionMediaFilterExtensions: parentSettings.solutionMediaFilterExtensions
      };

      if (!taskName && targetProjectId) {
        taskName = store.generateNextTaskName(targetProjectId, category);
      }
    } else {
      targetProjectId = store.activeProject?.id || (store.projects.find(p => p.profileId === store.activeProfileId)?.id || '');
      
      const parentSettings = store.getEffectiveSettings(targetProjectId);
      settingsOverride = {
        overrideSettings: false,
        overrideModel: false,
        overrideCanvas: false,
        overrideEditorFontSize: false,
        overrideEraser: false,
        overrideEvaluation: false,
        overrideSystemPrompt: false,
        overrideTaskNumbering: false,
        overrideMediaFilter: false,
        apiProvider: parentSettings.apiProvider,
        geminiModel: parentSettings.geminiModel,
        openRouterModel: parentSettings.openRouterModel,
        openRouterProvider: parentSettings.openRouterProvider,
        openRouterReasoning: parentSettings.openRouterReasoning,
        sendTaskMedia: parentSettings.sendTaskMedia,
        sendSolutionMedia: parentSettings.sendSolutionMedia,
        sendCanvasBackground: parentSettings.sendCanvasBackground,
        sendTaskText: parentSettings.sendTaskText,
        sendSolutionText: parentSettings.sendSolutionText,
        customSystemPrompt: parentSettings.customSystemPrompt,
        language: parentSettings.language,
        canvasMode: parentSettings.canvasMode,
        canvasFontSize: parentSettings.canvasFontSize,
        editorFontSize: parentSettings.editorFontSize,
        autoNumberTasks: parentSettings.autoNumberTasks,
        taskNumberingTemplate: parentSettings.taskNumberingTemplate,
        eraserMode: parentSettings.eraserMode,
        eraserRadiusNormal: parentSettings.eraserRadiusNormal,
        eraserRadiusStroke: parentSettings.eraserRadiusStroke,
        taskMediaFilterMode: parentSettings.taskMediaFilterMode,
        taskMediaFilterExtensions: parentSettings.taskMediaFilterExtensions,
        solutionMediaFilterMode: parentSettings.solutionMediaFilterMode,
        solutionMediaFilterExtensions: parentSettings.solutionMediaFilterExtensions
      };

      taskName = '';
      providedFiles = [];
    }

    setTimeout(() => {
      if (nameInput) {
        nameInput.focus();
        if (taskName) {
          nameInput.select();
        }
      }
    }, 50);

    // Store initial values to track changes
    initialValues = {
      taskName,
      instructions,
      solution,
      aiInstructions,
      category,
      targetProjectId,
      defaultEditMode,
      contextFilesJson: JSON.stringify(contextFiles),
      providedFilesJson: JSON.stringify(providedFiles),
      settingsOverrideJson: JSON.stringify(settingsOverride)
    };

    store.registerTaskEditorGuard({
      hasChanges,
      save: (onComplete: () => void) => {
        isSavingOrCanceling = true;
        if (!taskName.trim()) {
          alert(t('taskEditor.alertEnterName'));
          isSavingOrCanceling = false;
          return;
        }
        if (!targetProjectId) {
          alert(t('taskEditor.alertSelectLesson'));
          isSavingOrCanceling = false;
          return;
        }
        performSave();
        onComplete();
      },
      discard: () => {
        isSavingOrCanceling = true;
      }
    });
  });

  onDestroy(() => {
    store.registerTaskEditorGuard(null);
  });

  function autoResize(node: HTMLTextAreaElement, _val: any) {
    const update = () => {
      node.style.height = 'auto';
      node.style.overflowY = 'hidden';
      const style = window.getComputedStyle(node);
      const isBorderBox = style.boxSizing === 'border-box';
      let height = node.scrollHeight;
      if (isBorderBox) {
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        const borderBottom = parseFloat(style.borderBottomWidth) || 0;
        height += borderTop + borderBottom;
      }
      node.style.height = `${height}px`;
    };
    const timer = setTimeout(update, 0);
    node.addEventListener('input', update);
    return {
      update() {
        update();
      },
      destroy() {
        clearTimeout(timer);
        node.removeEventListener('input', update);
      }
    };
  }

  function handleRenameFile(index: number, type: 'instruction' | 'solution' | 'context' | 'provided') {
    const files = type === 'instruction' ? instructionFiles : (type === 'solution' ? solutionFiles : (type === 'provided' ? providedFiles : contextFiles));
    const file = files[index];
    if (!file) return;

    editingFileIndex = index;
    editingFileType = type;
    const { base, ext } = splitFilename(file.name);
    editingFileNameValue = base;
    editingFileExtension = ext;
  }

  function handleCategoryChange(newCategory: string) {
    if (isEditMode) return;
    const settings = store.getEffectiveSettings(targetProjectId);
    if (!settings.autoNumberTasks) return;

    const isNameEmpty = !taskName.trim();
    const isNameTemplate = store.isNameMatchingTemplate(taskName, targetProjectId);

    if (isNameEmpty || isNameTemplate) {
      taskName = store.generateNextTaskName(targetProjectId, newCategory);
    }
  }

  // Categories list of target project
  let categories = $derived(
    store.projects.find(p => p.id === targetProjectId)?.categories || ['Basics', 'Intermediate', 'Advanced']
  );

  function performSave() {
    if (isEditMode) {
      store.updateTask(targetProjectId, store.editingTask.id, {
        name: taskName.trim(),
        instructions: instructions.trim(),
        solution: solution.trim(),
        aiInstructions: aiInstructions.trim(),
        category,
        instructionFiles,
        solutionFiles,
        // Reset single legacy files to keep database clean
        instructionFile: null,
        solutionFile: null,
        settingsOverride: { ...settingsOverride },
        defaultEditMode,
        contextFiles,
        background: null,
        providedFiles
      });
      store.editingTask = null;
    } else {
      store.addTask(
        targetProjectId,
        taskName.trim(),
        instructions.trim(),
        solution.trim(),
        category,
        instructionFiles,
        solutionFiles,
        { ...settingsOverride },
        aiInstructions.trim(),
        defaultEditMode,
        contextFiles,
        null,
        providedFiles
      );
    }

    // Reset and return
    store.pendingScrollCategory = category;
    taskName = '';
    instructions = '';
    solution = '';
    aiInstructions = '';
    defaultEditMode = 'canvas';
    contextFiles = [];
    providedFiles = [];
    isDragOverContext = false;
  }

  function handleSave(e) {
    if (e) e.preventDefault();
    if (!taskName.trim()) {
      alert(t('taskEditor.alertEnterName'));
      return;
    }
    if (!targetProjectId) {
      alert(t('taskEditor.alertSelectLesson'));
      return;
    }

    isSavingOrCanceling = true;
    performSave();
    store.setView('project-detail');
  }

  function handleCancel() {
    isSavingOrCanceling = true;
    store.pendingScrollCategory = category;
    store.editingTask = null;
    taskName = '';
    instructions = '';
    solution = '';
    aiInstructions = '';
    defaultEditMode = 'canvas';
    contextFiles = [];
    providedFiles = [];
    isDragOverContext = false;
    store.setView(store.activeProject ? 'project-detail' : 'dashboard');
  }

  function triggerUpload(type) {
    const input = document.getElementById(`${type}FileInput`);
    if (input) input.click();
  }



  async function handleFileSelect(e: any, type: string) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []) as File[];
    if (!files.length) return;

    for (const file of files) {
      // For provided files, only allow images
      if (type === 'provided' && !file.type.startsWith('image/')) {
        store.showNotification(t('taskEditor.onlyImagesAllowed'), 'error');
        continue;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl, file.name);
        } catch (e) {
          console.error('Failed to save media file:', e);
          mediaId = '';
        }
        const fileData = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        if (type === 'instruction') {
          instructionFiles = [...instructionFiles, fileData];
        } else if (type === 'solution') {
          solutionFiles = [...solutionFiles, fileData];
        } else if (type === 'context') {
          contextFiles = [...contextFiles, fileData];
        } else if (type === 'provided') {
          providedFiles = [...providedFiles, fileData];
        }
      };
      reader.readAsDataURL(file);
    }
    target.value = '';
  }

  // Preview modal states & handlers
  let previewFile = $state<{ name: string; dataUrl: string } | null>(null);
  let previewIsAudio = $state(false);
  let previewIsVideo = $state(false);
  let modalZoom = $state(1);
  let modalPan = $state({ x: 0, y: 0 });
  let isModalDragging = $state(false);
  let modalDragStart = { x: 0, y: 0 };
  let modalBasePan = { x: 0, y: 0 };
  let modalActivePointers = new Map<number, PointerEvent>();
  let modalIsPinching = false;
  let modalInitialPinchDistance = 0;
  let modalInitialPinchZoom = 1;
  let modalInitialPinchMidpoint = { x: 0, y: 0 };
  let modalInitialPinchPan = { x: 0, y: 0 };

  function decodeBase64Text(dataUrl: string): string {
    if (!dataUrl) return '';
    try {
      const base64Data = dataUrl.split(',')[1];
      return decodeURIComponent(escape(atob(base64Data)));
    } catch (e) {
      console.error('Failed to decode text document', e);
      return t('taskEditor.errorDecode');
    }
  }

  async function openPreview(file: { name: string; dataUrl?: string; mediaId?: string }) {
    if (!isIntegratedFile(file.name)) {
      openAttachmentInDefaultApp(file).catch(err => {
        console.error('Failed to open attachment:', err);
      });
      return;
    }
    let dataUrl = file.dataUrl || '';
    if (!dataUrl && file.mediaId) {
      try {
        dataUrl = await getMediaDataUrl(file.mediaId);
      } catch (_) {}
    }
    previewFile = { name: file.name, dataUrl };
    previewIsAudio = isAudioFile(file.name);
    previewIsVideo = isVideoFile(file.name);
    modalZoom = 1;
    modalPan = { x: 0, y: 0 };
  }

  function closePreview() {
    previewFile = null;
  }

  function handleModalWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = modalZoom + direction * zoomFactor;
    modalZoom = Math.max(0.5, Math.min(newZoom, 8));
    if (modalZoom === 1) {
      modalPan = { x: 0, y: 0 };
    }
  }

  function handleModalPointerDown(e: PointerEvent) {
    const container = e.currentTarget as HTMLElement;
    try { container.setPointerCapture(e.pointerId); } catch (_) {}
    modalActivePointers.set(e.pointerId, e);

    if (modalActivePointers.size === 2) {
      const pts = Array.from(modalActivePointers.values());
      const isMultiTouch = pts.every(p => p.pointerType === 'touch');
      if (isMultiTouch && modalZoom > 0) {
        const p1 = pts[0];
        const p2 = pts[1];
        modalInitialPinchDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
        modalInitialPinchZoom = modalZoom;
        modalInitialPinchMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
        modalInitialPinchPan = { ...modalPan };
        modalIsPinching = true;
        isModalDragging = false;
        e.preventDefault();
        return;
      }
    }

    if (modalActivePointers.size > 2) {
      e.preventDefault();
      return;
    }

    if (modalZoom <= 1) return;
    isModalDragging = true;
    modalDragStart = { x: e.clientX, y: e.clientY };
    modalBasePan = { ...modalPan };
  }

  function handleModalPointerMove(e: PointerEvent) {
    if (e.buttons === 0) {
      modalActivePointers.clear();
      isModalDragging = false;
      modalIsPinching = false;
      return;
    }
    modalActivePointers.set(e.pointerId, e);

    if (modalIsPinching && modalActivePointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(modalActivePointers.values());
      const p1 = pts[0];
      const p2 = pts[1];
      const currentDistance = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const currentMidpoint = { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 };
      if (modalInitialPinchDistance > 0) {
        const factor = currentDistance / modalInitialPinchDistance;
        const newZoom = Math.max(0.5, Math.min(8, modalInitialPinchZoom * factor));
        const containerEl = e.currentTarget as HTMLElement;
        const rect = containerEl.getBoundingClientRect();
        const worldX = (modalInitialPinchMidpoint.x - rect.left - modalInitialPinchPan.x) / modalInitialPinchZoom;
        const worldY = (modalInitialPinchMidpoint.y - rect.top - modalInitialPinchPan.y) / modalInitialPinchZoom;
        modalZoom = newZoom;
        modalPan = {
          x: (currentMidpoint.x - rect.left) - worldX * newZoom,
          y: (currentMidpoint.y - rect.top) - worldY * newZoom
        };
      }
      return;
    }

    if (modalActivePointers.size > 1) return;

    if (!isModalDragging) return;
    const dx = e.clientX - modalDragStart.x;
    const dy = e.clientY - modalDragStart.y;
    modalPan = {
      x: modalBasePan.x + dx,
      y: modalBasePan.y + dy
    };
  }

  function handleModalPointerUp(e: PointerEvent) {
    modalActivePointers.delete(e.pointerId);
    if (modalActivePointers.size < 2) modalIsPinching = false;
    if (modalActivePointers.size === 0) isModalDragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function handleModalPointerCancel(e: PointerEvent) {
    handleModalPointerUp(e);
  }

  // Paste from clipboard logic
  async function handlePasteFromClipboard(type: 'instruction' | 'solution' | 'context' | 'provided') {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let addedAny = false;

      for (const item of clipboardItems) {
        // Check for images
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const base64Data = await blobToBase64(blob);
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, `clipboard_image_${Date.now()}.${ext}`); } catch (_) {}
          const newFile = {
            name: `clipboard_image_${Date.now()}.${ext}`,
            dataUrl: base64Data,
            mediaId: mediaId || undefined
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else if (type === 'solution') {
            solutionFiles = [...solutionFiles, newFile];
          } else if (type === 'context') {
            contextFiles = [...contextFiles, newFile];
          } else if (type === 'provided') {
            providedFiles = [...providedFiles, newFile];
          }
          addedAny = true;
          continue;
        }

        // Check for text
        const textType = item.types.find(t => t === 'text/plain' || t === 'text/html');
        if (textType) {
          const blob = await item.getType(textType);
          const text = await blob.text();
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, `clipboard_text_${Date.now()}.txt`); } catch (_) {}
          const newFile = {
            name: `clipboard_text_${Date.now()}.txt`,
            dataUrl: base64Data,
            mediaId: mediaId || undefined
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else if (type === 'solution') {
            solutionFiles = [...solutionFiles, newFile];
          } else if (type === 'context') {
            contextFiles = [...contextFiles, newFile];
          } else if (type === 'provided') {
            // Skip text for provided, only images allowed
          }
          addedAny = true;
        }
      }

      if (addedAny) {
        store.showNotification(t('taskEditor.pasteSuccess'), 'success');
      } else {
        store.showNotification(t('taskEditor.pasteErrorNoMedia'), 'error');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      // Fallback to text reading if full read is blocked/unsupported
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const base64Data = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
          let mediaId = '';
          try { mediaId = await saveMediaToDb(base64Data, `clipboard_text_${Date.now()}.txt`); } catch (_) {}
          const newFile = {
            name: `clipboard_text_${Date.now()}.txt`,
            dataUrl: base64Data,
            mediaId: mediaId || undefined
          };
          if (type === 'instruction') {
            instructionFiles = [...instructionFiles, newFile];
          } else if (type === 'solution') {
            solutionFiles = [...solutionFiles, newFile];
          } else if (type === 'context') {
            contextFiles = [...contextFiles, newFile];
          } else if (type === 'provided') {
            // Skip text for provided, only images allowed
          }
          store.showNotification(t('taskEditor.pasteTextSuccess'), 'success');
        } else {
          store.showNotification(t('taskEditor.pasteErrorEmpty'), 'error');
        }
      } catch (fallbackErr) {
        console.error('Fallback readText also failed:', fallbackErr);
        store.showNotification(t('taskEditor.pasteErrorPermission'), 'error');
      }
    }
  }

  // Removed local isAudioFile, imported from media.ts instead

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Filesystem drag-and-drop onto upload areas
  let isDragOverInstruction = $state(false);
  let isDragOverSolution = $state(false);
  let isDragOverContext = $state(false);

  // Pointer-based media drag state
  let draggedFileIndex = $state<number | null>(null);
  let draggedFileType = $state<'instruction' | 'solution' | 'context' | 'provided' | null>(null);
  let hoveredFileIndex = $state<number | null>(null);
  let isMediaDragActive = $state(false);
  
  let mediaDragGhostEl: HTMLElement | null = null;
  let mediaDragPointerStartX = 0;
  let mediaDragPointerStartY = 0;
  let mediaDragGhostOffsetX = 0;
  let mediaDragGhostOffsetY = 0;

  function handleFilePointerDown(e: PointerEvent, index: number, type: 'instruction' | 'solution' | 'context' | 'provided') {
    if (e.button !== 0 && e.button !== -1) return;
    const target = e.currentTarget as HTMLElement;
    
    // Ignore if close/remove button is clicked or if preview is clicked (but allow drag-handle inside preview)
    if ((e.target as HTMLElement).closest('.remove-file-btn') || 
        ((e.target as HTMLElement).closest('.preview-file-click') && !(e.target as HTMLElement).closest('.drag-handle'))) return;

    mediaDragPointerStartX = e.clientX;
    mediaDragPointerStartY = e.clientY;

    try { target.setPointerCapture(e.pointerId); } catch (_) {}

    function onMove(me: PointerEvent) {
      const dx = me.clientX - mediaDragPointerStartX;
      const dy = me.clientY - mediaDragPointerStartY;

      if (!isMediaDragActive && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        isMediaDragActive = true;
        draggedFileIndex = index;
        draggedFileType = type;

        const ghost = target.cloneNode(true) as HTMLElement;
        const rect = target.getBoundingClientRect();
        ghost.style.cssText = `
          position: fixed;
          pointer-events: none;
          z-index: 9999;
          width: ${rect.width}px;
          opacity: 0.85;
          left: ${rect.left}px;
          top: ${rect.top}px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          border-radius: 0.5rem;
          transform: scale(1.02);
          transition: none;
        `;
        mediaDragGhostOffsetX = me.clientX - rect.left;
        mediaDragGhostOffsetY = me.clientY - rect.top;
        document.body.appendChild(ghost);
        mediaDragGhostEl = ghost;
      }

      if (!isMediaDragActive) return;

      if (mediaDragGhostEl) {
        mediaDragGhostEl.style.left = `${me.clientX - mediaDragGhostOffsetX}px`;
        mediaDragGhostEl.style.top  = `${me.clientY - mediaDragGhostOffsetY}px`;
      }

      if (mediaDragGhostEl) mediaDragGhostEl.style.display = 'none';
      const el = document.elementFromPoint(me.clientX, me.clientY);
      if (mediaDragGhostEl) mediaDragGhostEl.style.display = '';

      const fileRow = el?.closest('[data-file-index]') as HTMLElement | null;
      if (fileRow && fileRow.dataset.fileType === type) {
        hoveredFileIndex = parseInt(fileRow.dataset.fileIndex || '0', 10);
      } else {
        hoveredFileIndex = null;
      }
    }

    function onUp(ue: PointerEvent) {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      try { target.releasePointerCapture(ue.pointerId); } catch (_) {}

      if (mediaDragGhostEl) {
        mediaDragGhostEl.remove();
        mediaDragGhostEl = null;
      }

      if (isMediaDragActive && draggedFileIndex !== null && hoveredFileIndex !== null && draggedFileIndex !== hoveredFileIndex) {
        reorderFiles(type, draggedFileIndex, hoveredFileIndex);
      }

      isMediaDragActive = false;
      draggedFileIndex = null;
      draggedFileType = null;
      hoveredFileIndex = null;
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  function reorderFiles(type: 'instruction' | 'solution' | 'context' | 'provided', from: number, to: number) {
    if (type === 'instruction') {
      const list = [...instructionFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      instructionFiles = list;
    } else if (type === 'solution') {
      const list = [...solutionFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      solutionFiles = list;
    } else if (type === 'context') {
      const list = [...contextFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      contextFiles = list;
    } else if (type === 'provided') {
      const list = [...providedFiles];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      providedFiles = list;
    }
  }

  function handleDragOver(type: 'instruction' | 'solution' | 'context' | 'provided', e: DragEvent) {
    e.preventDefault();
    if (type === 'instruction') {
      isDragOverInstruction = true;
    } else if (type === 'solution') {
      isDragOverSolution = true;
    } else if (type === 'context') {
      isDragOverContext = true;
    } else if (type === 'provided') {
      isDragOverProvided = true;
    }
  }

  function handleDragLeave(type: 'instruction' | 'solution' | 'context' | 'provided') {
    if (type === 'instruction') {
      isDragOverInstruction = false;
    } else if (type === 'solution') {
      isDragOverSolution = false;
    } else if (type === 'context') {
      isDragOverContext = false;
    } else if (type === 'provided') {
      isDragOverProvided = false;
    }
  }

  function handleFileDrop(type: 'instruction' | 'solution' | 'context' | 'provided', e: DragEvent) {
    e.preventDefault();
    if (type === 'instruction') {
      isDragOverInstruction = false;
    } else if (type === 'solution') {
      isDragOverSolution = false;
    } else if (type === 'context') {
      isDragOverContext = false;
    } else if (type === 'provided') {
      isDragOverProvided = false;
    }
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files) as File[];
    for (const file of fileList) {
      // For provided files, only allow images
      if (type === 'provided' && !file.type.startsWith('image/')) {
        store.showNotification(t('taskEditor.onlyImagesAllowed'), 'error');
        continue;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        let mediaId = '';
        try {
          mediaId = await saveMediaToDb(dataUrl, file.name);
        } catch (e) {
          console.error('Failed to save media file:', e);
          mediaId = '';
        }
        const fileData = {
          name: file.name,
          dataUrl,
          mediaId: mediaId || undefined
        };
        if (type === 'instruction') {
          instructionFiles = [...instructionFiles, fileData];
        } else if (type === 'solution') {
          solutionFiles = [...solutionFiles, fileData];
        } else if (type === 'context') {
          contextFiles = [...contextFiles, fileData];
        } else if (type === 'provided') {
          providedFiles = [...providedFiles, fileData];
        }
      };
      reader.readAsDataURL(file);
    }
  }
</script>

<main class="grow overflow-y-auto bg-surface p-8 custom-scrollbar h-full">
  <div class="max-w-3xl mx-auto flex flex-col gap-6">
    <div class="flex items-center gap-4 -ml-2 border-b border-outline-variant pb-4 mb-2">
      <button 
        onclick={handleSave}
        class="material-symbols-outlined text-primary hover:bg-surface-container-high transition-colors p-2 rounded-full focus:outline-none cursor-pointer"
        title={isEditMode ? t('common.saveChanges') : t('common.saveTask')}
      >
        arrow_back
      </button>
      <div class="flex flex-col gap-0.5">
        <h1 class="text-xl font-bold text-on-surface leading-tight">{isEditMode ? t('taskEditor.editTitle') : t('taskEditor.createTitle')}</h1>
        <p class="text-xs text-on-surface-variant">
          {isEditMode ? t('taskEditor.editSubtitle') : t('taskEditor.createSubtitle')}
        </p>
      </div>
    </div>

    <form onsubmit={handleSave} class="flex flex-col gap-8 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
      


      <!-- Task Name -->
      <div class="flex flex-col gap-2 group">
        <label class="text-sm font-semibold text-on-surface group-focus-within:text-primary transition-colors" for="taskName">{t('taskEditor.nameLabel')}</label>
        <input 
          id="taskName" 
          type="text" 
          bind:this={nameInput}
          bind:value={taskName}
          placeholder={t('taskEditor.namePlaceholder')}
          class="w-full bg-transparent border-0 border-b border-outline-variant px-0 py-2.5 text-base text-on-surface placeholder:text-outline focus:ring-0 focus:border-primary focus:border-b-2 transition-all focus:outline-none"
          required
        />
      </div>

      <!-- Category Level -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-semibold text-on-surface" for="category">{t('taskEditor.categoryLabel')}</label>
        <select 
          id="category"
          value={category}
          onchange={(e) => {
            const oldCategory = category;
            category = e.currentTarget.value;
            if (category !== oldCategory) {
              handleCategoryChange(category);
            }
          }}
          class="w-full bg-surface-container-low border border-outline-variant rounded-lg p-2.5 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        >
          {#each categories as cat}
            <option value={cat} class="bg-surface-container-low text-on-surface">{cat}</option>
          {/each}
        </select>
      </div>

      <!-- Instructions -->
      <div class="flex flex-col gap-2 relative">
        <div class="flex justify-between items-center select-none">
          <div class="flex items-center gap-2">
            <label class="text-sm font-semibold text-on-surface" for="instructions">{t('taskEditor.instructionsLabel')}</label>
            <button 
              type="button"
              onclick={() => showInstructionsRaw = !showInstructionsRaw}
              class="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant flex items-center gap-1 border border-outline-variant/20 cursor-pointer transition-colors focus:outline-none"
              title="Toggle preview/edit mode"
            >
              <span class="w-1.5 h-1.5 rounded-full {showInstructionsRaw ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
              {showInstructionsRaw ? t('taskEditor.editMode') : t('taskEditor.previewMode')}
            </button>
          </div>
        </div>
        
        {#if showInstructionsRaw}
          <textarea 
            id="instructions" 
            bind:value={instructions}
            use:autoResize={instructions}
            placeholder={t('taskEditor.instructionsPlaceholder')} 
            class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-none shadow-sm focus:outline-none overflow-hidden font-sans"
          ></textarea>
        {:else}
          <div 
            class="w-full border border-outline-variant rounded-lg p-4 text-sm text-on-surface bg-surface-container-low/20 min-h-30 text-left leading-relaxed max-w-none prose dark:prose-invert"
          >
            {@html parseMarkdown(instructions)}
          </div>
        {/if}
      </div>

      <!-- Warning Note about API context size and cost -->
      <div class="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-800 dark:text-amber-300">
        <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">warning</span>
        <div class="flex flex-col gap-0.5">
          <p class="text-xs font-semibold">{t('taskEditor.apiCostWarningTitle')}</p>
          <p class="text-[11px] leading-normal opacity-90">{t('taskEditor.apiCostWarningDesc')}</p>
        </div>
      </div>

      <!-- Instruction Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">{t('taskEditor.instructionMaterial')}</span>
        <input 
          type="file" 
          id="instructionFileInput" 
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'instruction')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('instruction')}
          ondragover={(e) => handleDragOver('instruction', e)}
          ondragleave={() => handleDragLeave('instruction')}
          ondrop={(e) => handleFileDrop('instruction', e)}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverInstruction ? 'border-primary bg-primary/5' : ''}"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {instructionFiles.length > 0 ? t('taskEditor.filesSelected', { count: instructionFiles.length }) : t('taskEditor.uploadPrompt')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('taskEditor.uploadSupportInfo')}</p>
          </div>
        </button>

        <!-- Paste from Clipboard button -->
        <button
          type="button"
          onclick={() => handlePasteFromClipboard('instruction')}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>

        {#if instructionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each instructionFiles as file, index}
              {#if isMediaDragActive && draggedFileType === 'instruction' && hoveredFileIndex === index}
                <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                data-file-index={index}
                data-file-type="instruction"
                onpointerdown={(e) => handleFilePointerDown(e, index, 'instruction')}
                class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'instruction' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => {
                    if (editingFileIndex !== index || editingFileType !== 'instruction') {
                      openPreview(file);
                    }
                  }}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                  title={t('taskEditor.clickToPreview')}
                >
                  <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                    drag_indicator
                  </span>
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {getFileIcon(file.name)}
                  </span>
                  {#if editingFileIndex === index && editingFileType === 'instruction'}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <input
                      bind:this={renameInputEl}
                      type="text"
                      bind:value={editingFileNameValue}
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          saveInlineRename();
                        } else if (e.key === 'Escape') {
                          cancelInlineRename();
                        }
                      }}
                      onblur={saveInlineRename}
                      class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium"
                    />
                  {:else}
                    <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button 
                    type="button"
                    onclick={() => handleRenameFile(index, 'instruction')}
                    class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors preview-file-click"
                    title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                  >
                    edit
                  </button>
                  <button 
                    type="button"
                    onclick={() => {
                      instructionFiles = instructionFiles.filter((_, i) => i !== index);
                    }}
                    class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                    title={t('taskEditor.remove')}
                  >
                    close
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Expected Solution -->
      <div class="flex flex-col gap-2 relative">
        <div class="flex justify-between items-center select-none">
          <div class="flex items-center gap-2">
            <label class="text-sm font-semibold text-on-surface" for="solution">{t('taskEditor.solutionLabel')}</label>
            <button 
              type="button"
              onclick={() => showSolutionRaw = !showSolutionRaw}
              class="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant flex items-center gap-1 border border-outline-variant/20 cursor-pointer transition-colors focus:outline-none"
              title="Toggle preview/edit mode"
            >
              <span class="w-1.5 h-1.5 rounded-full {showSolutionRaw ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
              {showSolutionRaw ? t('taskEditor.editMode') : t('taskEditor.previewMode')}
            </button>
          </div>
        </div>

        {#if showSolutionRaw}
          <textarea 
            id="solution" 
            bind:value={solution}
            use:autoResize={solution}
            placeholder={t('taskEditor.solutionPlaceholder')} 
            class="w-full bg-transparent border border-outline-variant rounded-lg p-4 text-sm text-on-surface focus:ring-1 focus:ring-primary focus:border-primary resize-none shadow-sm focus:outline-none overflow-hidden font-sans"
          ></textarea>
        {:else}
          <div 
            class="w-full border border-outline-variant rounded-lg p-4 text-sm text-on-surface bg-surface-container-low/20 min-h-25 text-left leading-relaxed max-w-none prose dark:prose-invert"
          >
            {@html parseMarkdown(solution)}
          </div>
        {/if}
      </div>

      <!-- Expected Solution Material Upload -->
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold text-on-surface">{t('taskEditor.solutionMaterial')}</span>
        <input 
          type="file" 
          id="solutionFileInput" 
          class="hidden" 
          multiple
          onchange={(e) => handleFileSelect(e, 'solution')}
        />
        <button 
          type="button"
          onclick={() => triggerUpload('solution')}
          ondragover={(e) => handleDragOver('solution', e)}
          ondragleave={() => handleDragLeave('solution')}
          ondrop={(e) => handleFileDrop('solution', e)}
          class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverSolution ? 'border-primary bg-primary/5' : ''}"
        >
          <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
            <span class="material-symbols-outlined text-[24px]">upload_file</span>
          </div>
          <div class="text-center">
            <p class="text-sm font-semibold text-on-surface">
              {solutionFiles.length > 0 ? t('taskEditor.filesSelected', { count: solutionFiles.length }) : t('taskEditor.uploadPromptSolution')}
            </p>
            <p class="text-xs text-on-surface-variant mt-1">{t('taskEditor.uploadSupportInfo')}</p>
          </div>
        </button>

        <!-- Paste from Clipboard button -->
        <button
          type="button"
          onclick={() => handlePasteFromClipboard('solution')}
          class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
        >
          <span class="material-symbols-outlined text-[16px]">content_paste</span>
          {t('taskEditor.pasteClipboard')}
        </button>

        {#if solutionFiles.length > 0}
          <div class="mt-2 flex flex-col gap-1.5">
            {#each solutionFiles as file, index}
              {#if isMediaDragActive && draggedFileType === 'solution' && hoveredFileIndex === index}
                <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
              {/if}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div 
                data-file-index={index}
                data-file-type="solution"
                onpointerdown={(e) => handleFilePointerDown(e, index, 'solution')}
                class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'solution' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
              >
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                  onclick={() => {
                    if (editingFileIndex !== index || editingFileType !== 'solution') {
                      openPreview(file);
                    }
                  }}
                  class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                  title={t('taskEditor.clickToPreview')}
                >
                  <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                    drag_indicator
                  </span>
                  <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                    {getFileIcon(file.name)}
                  </span>
                  {#if editingFileIndex === index && editingFileType === 'solution'}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <input
                      bind:this={renameInputEl}
                      type="text"
                      bind:value={editingFileNameValue}
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          saveInlineRename();
                        } else if (e.key === 'Escape') {
                          cancelInlineRename();
                        }
                      }}
                      onblur={saveInlineRename}
                      class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium"
                    />
                  {:else}
                    <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                  {/if}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button 
                    type="button"
                    onclick={() => handleRenameFile(index, 'solution')}
                    class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors preview-file-click"
                    title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                  >
                    edit
                  </button>
                  <button 
                    type="button"
                    onclick={() => {
                      solutionFiles = solutionFiles.filter((_, i) => i !== index);
                    }}
                    class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                    title={t('taskEditor.remove')}
                  >
                    close
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Default Edit Mode Selector -->
      <div class="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant mt-4">
        <div class="flex flex-col gap-0.5">
          <span class="text-xs font-bold text-on-surface">{t('taskEditor.defaultEditModeTitle')}</span>
          <span class="text-[10.5px] text-on-surface-variant">{t('taskEditor.defaultEditModeSubtitle')}</span>
        </div>
        <div class="flex bg-surface-container-high rounded-lg border border-outline-variant p-0.5 shrink-0 select-none">
          <button
            type="button"
            onclick={() => defaultEditMode = 'canvas'}
            class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer border-0 focus:outline-none
                   {defaultEditMode === 'canvas' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
          >
            {t('taskEditor.defaultEditModeCanvas')}
          </button>
          <button
            type="button"
            onclick={() => defaultEditMode = 'text'}
            class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer border-0 focus:outline-none
                   {defaultEditMode === 'text' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
          >
            {t('taskEditor.defaultEditModeText')}
          </button>
          <button
            type="button"
            onclick={() => defaultEditMode = 'both'}
            class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer border-0 focus:outline-none
                   {defaultEditMode === 'both' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-highest'}"
          >
            {t('taskEditor.defaultEditModeBoth')}
          </button>
        </div>
      </div>

      <!-- Provided Canvas Images Collapsible Section -->
      <section class="bg-surface-container-low border border-outline-variant/60 rounded-xl overflow-hidden shrink-0 mt-4">
        <button 
          type="button"
          onclick={() => providedFilesExpanded = !providedFilesExpanded}
          class="w-full flex items-center justify-between px-6 py-4 cursor-pointer bg-transparent border-0 text-left focus:outline-none hover:bg-surface-container-lowest/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-[20px] text-primary">photo_library</span>
            <div>
              <h3 class="font-bold text-sm text-on-surface">{t('taskEditor.providedImagesTitle')}</h3>
              <p class="text-[11px] text-on-surface-variant mt-0.5">
                {t('taskEditor.providedImagesSubtitle')}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            {#if providedFiles.length > 0}
              <span class="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{providedFiles.length}</span>
            {/if}
            <span class="material-symbols-outlined text-on-surface-variant text-[20px] transition-transform" 
                  style="transform: rotate({providedFilesExpanded ? '180' : '0'}deg)">
              expand_more
            </span>
          </div>
        </button>

        {#if providedFilesExpanded}
          <div class="px-6 pb-5 border-t border-outline-variant/30 pt-4 flex flex-col gap-2">
            <span class="text-xs font-semibold text-on-surface">{t('taskEditor.providedImagesLabel')}</span>
            <input 
              type="file" 
              id="providedFileInput" 
              class="hidden" 
              multiple
              accept="image/*"
              onchange={(e) => handleFileSelect(e, 'provided')}
            />
            <button 
              type="button"
              onclick={() => triggerUpload('provided')}
              ondragover={(e) => handleDragOver('provided', e)}
              ondragleave={() => handleDragLeave('provided')}
              ondrop={(e) => handleFileDrop('provided', e)}
              class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverProvided ? 'border-primary bg-primary/5' : ''}"
            >
              <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                <span class="material-symbols-outlined text-[24px]">add_photo_alternate</span>
              </div>
              <div class="text-center">
                <p class="text-xs font-semibold text-on-surface">
                  {providedFiles.length > 0 ? t('taskEditor.providedImagesSelected', { count: providedFiles.length }) : t('taskEditor.providedImagesUploadPrompt')}
                </p>
                <p class="text-[10px] text-on-surface-variant mt-1">{t('taskEditor.providedImagesUploadSupportInfo')}</p>
              </div>
            </button>

            <!-- Paste from Clipboard button -->
            <button
              type="button"
              onclick={() => handlePasteFromClipboard('provided')}
              class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
            >
              <span class="material-symbols-outlined text-[16px]">content_paste</span>
              {t('taskEditor.providedImagesClipboardButton')}
            </button>

            {#if providedFiles.length > 0}
              <div class="mt-2 flex flex-col gap-1.5">
                {#each providedFiles as file, index}
                  {#if isMediaDragActive && draggedFileType === 'provided' && hoveredFileIndex === index}
                    <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
                  {/if}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div 
                    data-file-index={index}
                    data-file-type="provided"
                    onpointerdown={(e) => handleFilePointerDown(e, index, 'provided')}
                    class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'provided' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
                  >
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                      onclick={() => {
                        if (editingFileIndex !== index || editingFileType !== 'provided') {
                          openPreview(file);
                        }
                      }}
                      class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                      title={t('taskEditor.clickToPreview')}
                    >
                      <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                        drag_indicator
                      </span>
                      <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                        image
                      </span>
                      {#if editingFileIndex === index && editingFileType === 'provided'}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <input
                          bind:this={renameInputEl}
                          type="text"
                          bind:value={editingFileNameValue}
                          onclick={(e) => e.stopPropagation()}
                          onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              saveInlineRename();
                            } else if (e.key === 'Escape') {
                              cancelInlineRename();
                            }
                          }}
                          onblur={saveInlineRename}
                          class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium"
                        />
                      {:else}
                        <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button 
                        type="button"
                        onclick={() => handleRenameFile(index, 'provided')}
                        class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors preview-file-click"
                        title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                      >
                        edit
                      </button>
                      <button 
                        type="button"
                        onclick={() => {
                          providedFiles = providedFiles.filter((_, i) => i !== index);
                        }}
                        class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                        title={t('taskEditor.remove')}
                      >
                        close
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Aufgabenkontext / Task Context Collapsible Section -->
      <section class="bg-surface-container-low border border-outline-variant/60 rounded-xl overflow-hidden shrink-0 mt-4">
        <button 
          type="button"
          onclick={() => aiInstructionsExpanded = !aiInstructionsExpanded}
          class="w-full flex items-center justify-between px-6 py-4 cursor-pointer bg-transparent border-0 text-left focus:outline-none hover:bg-surface-container-lowest/50 transition-colors"
        >
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-[20px] text-primary">folder_shared</span>
            <div>
              <h3 class="font-bold text-sm text-on-surface">{t('taskEditor.contextTitle')}</h3>
              <p class="text-[11px] text-on-surface-variant mt-0.5">
                {t('taskEditor.contextSubtitle')}
              </p>
            </div>
          </div>
          <span class="material-symbols-outlined text-on-surface-variant text-[20px] transition-transform" 
                style="transform: rotate({aiInstructionsExpanded ? '180' : '0'}deg)">
            expand_more
          </span>
        </button>

        {#if aiInstructionsExpanded}
          <div class="px-6 pb-5 border-t border-outline-variant/30 pt-4 flex flex-col gap-4">
            <!-- Text Guidelines -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold text-on-surface">{t('taskEditor.contextTextLabel')}</span>
              <textarea
                use:autoResize={aiInstructions}
                bind:value={aiInstructions}
                placeholder={t('taskEditor.contextTextPlaceholder')}
                rows="4"
                class="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary resize-none min-h-20 font-sans"
              ></textarea>
            </div>

            <!-- Context Media Upload -->
            <div class="flex flex-col gap-2">
              <span class="text-xs font-semibold text-on-surface">{t('taskEditor.contextMediaLabel')}</span>
              <input 
                type="file" 
                id="contextFileInput" 
                class="hidden" 
                multiple
                onchange={(e) => handleFileSelect(e, 'context')}
              />
              <button 
                type="button"
                onclick={() => triggerUpload('context')}
                ondragover={(e) => handleDragOver('context', e)}
                ondragleave={() => handleDragLeave('context')}
                ondrop={(e) => handleFileDrop('context', e)}
                class="w-full border-2 border-dashed border-outline-variant rounded-xl bg-surface-container-low p-6 flex flex-col items-center justify-center gap-2 hover:bg-surface-container hover:border-primary/50 transition-all group relative overflow-hidden focus:outline-none cursor-pointer {isDragOverContext ? 'border-primary bg-primary/5' : ''}"
              >
                <div class="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center group-hover:scale-105 transition-transform shadow-sm">
                  <span class="material-symbols-outlined text-[24px]">upload_file</span>
                </div>
                <div class="text-center">
                  <p class="text-xs font-semibold text-on-surface">
                    {contextFiles.length > 0 ? t('taskEditor.contextFilesSelected', { count: contextFiles.length }) : t('taskEditor.contextUploadPrompt')}
                  </p>
                  <p class="text-[10px] text-on-surface-variant mt-1">{t('taskEditor.contextUploadSupportInfo')}</p>
                </div>
              </button>

              <!-- Paste from Clipboard button -->
              <button
                type="button"
                onclick={() => handlePasteFromClipboard('context')}
                class="w-full flex items-center justify-center gap-2 py-2.5 border border-outline-variant rounded-xl bg-surface-container-low text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-primary transition-all cursor-pointer focus:outline-none"
              >
                <span class="material-symbols-outlined text-[16px]">content_paste</span>
                {t('taskEditor.contextClipboardButton')}
              </button>

              {#if contextFiles.length > 0}
                <div class="mt-2 flex flex-col gap-1.5">
                  {#each contextFiles as file, index}
                    {#if isMediaDragActive && draggedFileType === 'context' && hoveredFileIndex === index}
                      <div class="h-1 bg-primary rounded my-1 animate-pulse"></div>
                    {/if}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                      data-file-index={index}
                      data-file-type="context"
                      onpointerdown={(e) => handleFilePointerDown(e, index, 'context')}
                      class="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant shadow-sm touch-none select-none {isMediaDragActive && draggedFileType === 'context' && draggedFileIndex === index ? 'opacity-40 scale-95' : ''}"
                    >
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={() => {
                          if (editingFileIndex !== index || editingFileType !== 'context') {
                            openPreview(file);
                          }
                        }}
                        class="flex items-center gap-2 min-w-0 cursor-pointer hover:text-primary transition-colors grow preview-file-click"
                        title={t('taskEditor.clickToPreview')}
                      >
                        <span class="material-symbols-outlined text-[20px] text-outline cursor-grab active:cursor-grabbing hover:text-primary select-none drag-handle">
                          drag_indicator
                        </span>
                        <span class="material-symbols-outlined text-[20px] text-primary shrink-0">
                          {getFileIcon(file.name)}
                        </span>
                        {#if editingFileIndex === index && editingFileType === 'context'}
                          <!-- svelte-ignore a11y_click_events_have_key_events -->
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <input
                            bind:this={renameInputEl}
                            type="text"
                            bind:value={editingFileNameValue}
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                saveInlineRename();
                              } else if (e.key === 'Escape') {
                                cancelInlineRename();
                              }
                            }}
                            onblur={saveInlineRename}
                            class="bg-surface border border-primary rounded px-2 py-0.5 text-xs text-on-surface focus:outline-none w-full font-medium"
                          />
                        {:else}
                          <span class="text-xs text-on-surface hover:text-primary truncate font-medium">{getBaseName(file.name)}</span>
                        {/if}
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button 
                          type="button"
                          onclick={() => handleRenameFile(index, 'context')}
                          class="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary hover:bg-primary/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors preview-file-click"
                          title={t('taskEditor.renameFileTooltip') || 'Rename File'}
                        >
                          edit
                        </button>
                        <button 
                          type="button"
                          onclick={() => {
                            contextFiles = contextFiles.filter((_, i) => i !== index);
                          }}
                          class="material-symbols-outlined text-[18px] text-error hover:bg-error/10 p-1 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors shrink-0 remove-file-btn"
                          title={t('taskEditor.remove')}
                        >
                          close
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </section>

      <!-- Task Settings Overrides -->
      <div class="border-t border-outline-variant/30 pt-6 mt-4 flex flex-col gap-4">
        <div class="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant">
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-bold text-on-surface">Task-spezifische Einstellungen / Task-Specific Overrides</span>
            <span class="text-xs text-on-surface-variant">Lerneinstellungen für diese spezifische Aufgabe überschreiben</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              bind:checked={settingsOverride.overrideSettings} 
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {#if settingsOverride.overrideSettings}
          <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 flex grow overflow-hidden min-h-0 gap-6 animate-fade-in select-none">
            <!-- Left Tab Navigation Sidebar -->
            <div class="w-48 shrink-0 flex flex-col gap-1 border-r border-outline-variant/30 pr-4 overflow-y-auto no-scrollbar py-1">
              {#each taskTabs as tab}
                <button
                  type="button"
                  onclick={() => activeTaskTab = tab.id as TaskTabId}
                  class="flex items-center gap-2 px-3 py-2.5 font-semibold text-xs rounded-lg transition-colors text-left focus:outline-none w-full cursor-pointer
                         {activeTaskTab === tab.id
                           ? 'text-primary bg-primary/10'
                           : 'text-on-surface-variant hover:bg-surface-variant/30 hover:text-on-surface'}"
                >
                  <span class="material-symbols-outlined text-[18px]">{tab.icon}</span>
                  <span class="truncate">{t(tab.labelKey)}</span>
                </button>
              {/each}
            </div>

            <!-- Right Content Pane -->
            <div class="grow overflow-y-auto py-1 pr-1 flex flex-col gap-4 custom-scrollbar min-h-75">
              {#if activeTaskTab === 'model'}
                <!-- Model Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideModelLabel')}</span>
                    <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideModelDesc')}</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideModel || false} 
                      onchange={(e) => handleToggleOverride('overrideModel', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideModel}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                    <AiModelConfig settings={settingsOverride} showKeys={false} />
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">smart_toy</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      {t('lessonSettings.usingGlobalDesc', { provider: store.settings.apiProvider === 'gemini' ? 'Gemini' : 'OpenRouter', model: store.settings.apiProvider === 'gemini' ? store.settings.geminiModel : store.settings.openRouterModel })}
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'evaluation'}
                <!-- Evaluation Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">Evaluationsdetails überschreiben</span>
                    <span class="text-[10.5px] text-outline leading-tight">Möchtest du festlegen, welche Medien/Texte an die API gesendet werden?</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideEvaluation || false} 
                      onchange={(e) => handleToggleOverride('overrideEvaluation', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideEvaluation}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                    <EvaluationDetailsSettings settings={settingsOverride} hideContextFilters={true} />
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">fact_check</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      Verwendet die globalen/Lektions-Einstellungen für die Evaluation.
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'mediaFilter'}
                <!-- Media Filter Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">{t('settings.api.mediaFilterMode')} (Override)</span>
                    <span class="text-[10.5px] text-outline leading-tight">Möchtest du die Medienfilter für diese Aufgabe überschreiben?</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideMediaFilter || false} 
                      onchange={(e) => handleToggleOverride('overrideMediaFilter', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideMediaFilter}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                    <MediaFilterSettings settings={settingsOverride} />
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">filter_alt</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto font-medium">
                      Verwendet die globalen/Lektions-Medienfilter.
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'canvas'}
                <!-- Canvas Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideCanvasLabel')}</span>
                    <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideCanvasDesc')}</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideCanvas || false} 
                      onchange={(e) => handleToggleOverride('overrideCanvas', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideCanvas}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                    <CanvasModeSelector settings={settingsOverride} />
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">aspect_ratio</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      Verwendet das globale/Lektions-Canvas-Layout.
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'editorFontSize'}
                <!-- Editor Font Size Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">{t('lessonSettings.overrideEditorFontSizeLabel')}</span>
                    <span class="text-[10.5px] text-outline leading-tight">{t('lessonSettings.overrideEditorFontSizeDesc')}</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideEditorFontSize || false} 
                      onchange={(e) => handleToggleOverride('overrideEditorFontSize', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideEditorFontSize}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-4">
                    <div class="flex flex-col gap-2 mt-2">
                      <div class="flex justify-between items-center">
                        <span class="text-xs font-semibold text-on-surface">{t('lessonSettings.editorFontSizeTitle')}</span>
                        <span class="text-xs font-bold text-on-surface w-10 text-right">{settingsOverride.editorFontSize || 16}px</span>
                      </div>
                      <div class="flex items-center gap-4">
                        <span class="text-xs text-outline font-medium shrink-0">10px</span>
                        <input
                          type="range"
                          min="10"
                          max="40"
                          step="1"
                          bind:value={settingsOverride.editorFontSize}
                          class="grow h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <span class="text-xs text-outline font-medium shrink-0">40px</span>
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">format_size</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      {t('lessonSettings.usingGlobalEditorFontSizeDesc')}: {store.getEffectiveSettings(targetProjectId).editorFontSize || 16}px
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'eraser'}
                <!-- Eraser Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">Radiergummi überschreiben</span>
                    <span class="text-[10.5px] text-outline leading-tight">Möchtest du den Radiergummi-Modus und -Radius anpassen?</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideEraser || false} 
                      onchange={(e) => handleToggleOverride('overrideEraser', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideEraser}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-3">
                    <!-- Eraser Mode Selection -->
                    <div class="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant">
                      <span class="text-xs text-on-surface font-semibold flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[18px] text-primary">ink_eraser</span>
                        Modus
                      </span>
                      <select
                        bind:value={settingsOverride.eraserMode}
                        class="bg-surface-container border border-outline-variant rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary font-semibold w-40 text-right"
                      >
                        <option value="normal">Klassisch / Pixels</option>
                        <option value="stroke">Strich radieren</option>
                      </select>
                    </div>

                    <!-- Eraser Normal Radius -->
                    <div class="flex flex-col gap-1.5 bg-surface-container-low px-3 py-2.5 rounded-lg border border-outline-variant">
                      <div class="flex justify-between items-center text-xs font-semibold text-on-surface">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px] text-primary">blur_on</span>Pixel Radius</span>
                        <span class="font-mono text-primary">{settingsOverride.eraserRadiusNormal}px</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        bind:value={settingsOverride.eraserRadiusNormal}
                        class="w-full h-1.5 bg-outline-variant/30 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                      />
                    </div>

                    <!-- Eraser Stroke Radius -->
                    <div class="flex flex-col gap-1.5 bg-surface-container-low px-3 py-2.5 rounded-lg border border-outline-variant">
                      <div class="flex justify-between items-center text-xs font-semibold text-on-surface">
                        <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[18px] text-primary">gesture</span>Strich-Erkennungsradius</span>
                        <span class="font-mono text-primary">{settingsOverride.eraserRadiusStroke}px</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        bind:value={settingsOverride.eraserRadiusStroke}
                        class="w-full h-1.5 bg-outline-variant/30 rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                      />
                    </div>
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">ink_eraser</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      Verwendet die globalen/Lektions-Radiergummi Einstellungen.
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'prompt'}
                <!-- System Prompt Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">System Prompt überschreiben</span>
                    <span class="text-[10.5px] text-outline leading-tight">Möchtest du die KI-Instruktionen anpassen?</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideSystemPrompt || false} 
                      onchange={(e) => handleToggleOverride('overrideSystemPrompt', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideSystemPrompt}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in flex flex-col gap-2">
                    <div class="flex justify-between items-center">
                      <span class="text-xs font-bold text-on-surface">Custom System Prompt</span>
                      <button
                        type="button"
                        onclick={() => settingsOverride.customSystemPrompt = store.settings.customSystemPrompt || 'You are a thorough but encouraging teacher...'}
                        class="text-[10.5px] text-primary font-semibold hover:underline cursor-pointer focus:outline-none"
                      >
                        Auf Standard zurücksetzen
                      </button>
                    </div>
                    <textarea
                      bind:value={settingsOverride.customSystemPrompt}
                      rows="8"
                      class="w-full bg-surface-container border border-outline-variant rounded-lg p-3 text-xs font-mono text-on-surface focus:outline-none focus:border-primary custom-scrollbar resize-y"
                    ></textarea>
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">terminal</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto">
                      Verwendet den globalen/Lektions-System Prompt.
                    </p>
                  </div>
                {/if}

              {:else if activeTaskTab === 'numbering'}
                <!-- Task Numbering Override Toggle -->
                <div class="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-bold text-on-surface">Aufgaben-Nummerierung überschreiben</span>
                    <span class="text-[10.5px] text-outline leading-tight">Möchtest du das Namensschema überschreiben?</span>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={settingsOverride.overrideTaskNumbering || false} 
                      onchange={(e) => handleToggleOverride('overrideTaskNumbering', e.currentTarget.checked)}
                      class="sr-only peer"
                    />
                    <div class="w-9 h-5 bg-outline-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {#if settingsOverride.overrideTaskNumbering}
                  <div class="border-t border-outline-variant/30 pt-4 animate-fade-in">
                    <TaskNumberingConfig settings={settingsOverride} />
                  </div>
                {:else}
                  <div class="text-center py-10 px-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant animate-fade-in">
                    <span class="material-symbols-outlined text-[40px] text-on-surface-variant/40 mb-2">format_list_numbered</span>
                    <p class="text-xs text-on-surface font-semibold">{t('lessonSettings.usingGlobalTitle')}</p>
                    <p class="text-[11.5px] text-on-surface-variant leading-normal mt-1 max-w-sm mx-auto font-medium">
                      Verwendet das globale/Lektions-Schema für die Nummerierung.
                    </p>
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Save / Cancel Buttons -->
      <div class="flex justify-end gap-3 mt-4">
        <button 
          type="button" 
          onclick={handleCancel}
          class="px-5 py-2.5 border border-outline-variant text-on-surface-variant font-semibold text-sm rounded-lg hover:bg-surface-container cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button 
          type="submit" 
          class="px-6 py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-lg hover:opacity-90 active:scale-95 transition-all shadow-[0_4px_14px_rgba(0,64,224,0.15)] flex items-center gap-2 cursor-pointer"
        >
          <span class="material-symbols-outlined text-[18px]">save</span>
          {isEditMode ? t('taskEditor.saveChanges') : t('taskEditor.saveTask')}
        </button>
      </div>
    </form>
  </div>
</main>

{#if previewFile}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    onclick={closePreview}
    class="fixed inset-0 z-100 flex flex-col justify-center items-center bg-black/85 backdrop-blur-sm p-8 select-none"
  >
    <div 
      onclick={(e) => e.stopPropagation()}
      class="relative w-[95%] h-[95%] max-w-[95vw] max-h-[95vh] bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-outline-variant"
    >
      <!-- Modal Header -->
      <header class="flex items-center justify-between px-6 py-4 border-b border-outline-variant select-none shrink-0 bg-surface">
        <div class="flex items-center gap-2 min-w-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">
            {getFileIcon(previewFile.name)}
          </span>
          <h2 class="font-bold text-sm text-on-surface truncate pr-6">{previewFile.name}</h2>
        </div>
        <button 
          type="button" 
          onclick={closePreview}
          class="material-symbols-outlined text-[20px] text-on-surface-variant hover:bg-surface-container-high p-2 rounded-full cursor-pointer focus:outline-none flex items-center justify-center transition-colors"
        >
          close
        </button>
      </header>

      <!-- Modal Body (Max size view with Zoom / Pan support for images) -->
      <div 
        onwheel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? handleModalWheel : null}
        onpointerdown={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? handleModalPointerDown : null}
        onpointermove={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? handleModalPointerMove : null}
        onpointerup={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? handleModalPointerUp : null}
        onpointercancel={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? handleModalPointerCancel : null}
        class="grow bg-surface-container-lowest p-6 flex justify-center items-center min-h-0 select-text {previewFile.name.toLowerCase().endsWith('.pdf') || previewFile.name.toLowerCase().endsWith('.txt') || previewFile.name.toLowerCase().endsWith('.md') || previewIsAudio || previewIsVideo ? 'overflow-auto' : 'overflow-hidden relative'}"
        style={!previewFile.name.toLowerCase().endsWith('.pdf') && !previewFile.name.toLowerCase().endsWith('.txt') && !previewFile.name.toLowerCase().endsWith('.md') && !previewIsAudio && !previewIsVideo ? `cursor: ${modalZoom > 1 ? (isModalDragging ? 'grabbing' : 'grab') : 'zoom-in'}; touch-action: none;` : ''}
      >
        {#if previewIsAudio}
          <div class="w-full max-w-md">
            <AudioPlayer dataUrl={previewFile.dataUrl} />
          </div>
        {:else if previewIsVideo}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video 
            src={previewFile.dataUrl} 
            controls 
            class="max-w-full max-h-full rounded-lg shadow-sm"
          ></video>
        {:else if previewFile.name.toLowerCase().endsWith('.pdf')}
          <iframe 
            src={previewFile.dataUrl} 
            title={previewFile.name} 
            class="w-full h-full border-0 rounded-lg shadow-sm"
          ></iframe>
        {:else if previewFile.name.toLowerCase().endsWith('.md')}
          <div class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm text-on-surface select-text leading-relaxed border border-outline-variant text-left wrap-break-word font-sans">
            {@html parseMarkdown(decodeBase64Text(previewFile.dataUrl))}
          </div>
        {:else if previewFile.name.toLowerCase().endsWith('.txt')}
          <pre class="w-full h-full p-6 overflow-auto bg-surface-container-high rounded-xl text-sm font-mono text-on-surface whitespace-pre-wrap select-text leading-relaxed border border-outline-variant">{decodeBase64Text(previewFile.dataUrl)}</pre>
        {:else}
          <img 
            src={previewFile.dataUrl} 
            alt={previewFile.name} 
            class="max-w-full max-h-full object-contain rounded-lg shadow-md select-none transition-transform duration-75 ease-out"
            style="transform: translate({modalPan.x}px, {modalPan.y}px) scale({modalZoom}); transform-origin: center center;"
            draggable="false"
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

