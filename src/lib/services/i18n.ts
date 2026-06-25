import { store } from '../state/store.svelte';
import en from '../i18n/en.json';
import de from '../i18n/de.json';

const translations: Record<string, any> = {
  English: en,
  Deutsch: de
};

/**
 * Translates a key path into the current active language string.
 * Supports nested dot-notation paths (e.g., 'settings.title')
 * and placeholder replacements (e.g., {name: 'John'} replaces '{name}').
 */
export function t(key: string, replacements?: Record<string, string | number>): string {
  const lang = store.settings?.language || 'English';
  const dict = translations[lang] || translations['English'] || {};
  
  const keys = key.split('.');
  let value: any = dict;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English if the key is missing in the current language
      let fallbackValue: any = translations['English'];
      for (const fk of keys) {
        if (fallbackValue && typeof fallbackValue === 'object' && fk in fallbackValue) {
          fallbackValue = fallbackValue[fk];
        } else {
          fallbackValue = undefined;
          break;
        }
      }
      value = fallbackValue;
      break;
    }
  }
  
  if (typeof value !== 'string') {
    return key;
  }
  
  if (replacements) {
    let result = value;
    for (const [k, val] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`{${k}}`, 'g'), String(val));
    }
    return result;
  }
  
  return value;
}
