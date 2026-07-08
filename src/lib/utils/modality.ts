import { store } from '../state/store.svelte';

export type Modality = 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'unknown';

export function getFileModality(filename: string): Modality {
  const ext = '.' + filename.split('.').pop()!.toLowerCase();
  const images = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const audios = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
  const videos = ['.mp4', '.webm', '.ogv', '.mov', '.avi'];
  const docs = ['.pdf'];
  const texts = ['.txt', '.md'];

  if (images.includes(ext)) return 'image';
  if (audios.includes(ext)) return 'audio';
  if (videos.includes(ext)) return 'video';
  if (docs.includes(ext)) return 'pdf';
  if (texts.includes(ext)) return 'text';
  return 'unknown';
}

export interface ModelModalities {
  image: boolean;
  audio: boolean;
  video: boolean;
  pdf: boolean;
}

export function getModelSupportedModalities(provider: 'gemini' | 'openrouter' | string, modelId: string, modelObj?: any): ModelModalities {
  const idLower = modelId.toLowerCase();

  if (provider === 'gemini') {
    // All Gemini models in the app are multimodal (1.5 and 2.0 series)
    return { image: true, audio: true, video: true, pdf: true };
  }

  // OpenRouter capability resolution
  let supportsImage = false;
  let supportsAudio = false;
  let supportsVideo = false;
  let supportsPdf = false;

  // 1. Try to find the model in the store's full list (from OpenRouter API)
  const info = modelObj || store.openRouterModels?.find((m: any) => m.id === modelId);
  if (info) {
    const arch = info.architecture;
    if (arch) {
      if (Array.isArray(arch.inputModalities)) {
        supportsImage = arch.inputModalities.includes('image');
        supportsAudio = arch.inputModalities.includes('audio');
        supportsVideo = arch.inputModalities.includes('video');
      } else {
        const modality = (arch.modality || '').toLowerCase();
        if (modality) {
          supportsImage = modality.includes('image') || modality.includes('multimodal');
          supportsAudio = modality.includes('audio') || modality.includes('multimodal');
          supportsVideo = modality.includes('video') || modality.includes('multimodal');
        }
      }
    }
  }

  // 2. Fallbacks and heuristics based on model ID keywords
  if (idLower.includes('gemini')) {
    supportsImage = true;
    supportsAudio = true;
    supportsVideo = true;
    supportsPdf = true;
  } else if (idLower.includes('claude-3') || idLower.includes('claude-3-5')) {
    supportsImage = true;
    supportsPdf = true;
  } else if (idLower.includes('gpt-4o') || idLower.includes('gpt-4-vision')) {
    supportsImage = true;
    supportsPdf = true;
  } else if (idLower.includes('pixtral') || idLower.includes('llava') || idLower.includes('vision') || idLower.includes('vl') || idLower.includes('llama-3.2-11b') || idLower.includes('llama-3.2-90b')) {
    supportsImage = true;
  } else if (idLower.includes('whisper')) {
    supportsAudio = true;
  }

  return { image: supportsImage, audio: supportsAudio, video: supportsVideo, pdf: supportsPdf };
}
