import { en } from './en';
import { hi } from './hi';
import { ta } from './ta';
import { mr } from './mr';

export const translations = {
  en,
  hi,
  ta,
  mr
};

export const getTranslation = (language, path) => {
  const keys = path.split('.');
  let value = translations[language] || translations.en;
  
  for (const key of keys) {
    if (value && value[key]) {
      value = value[key];
    } else {
      // Fallback to English if translation not found
      value = translations.en;
      for (const k of keys) {
        if (value && value[k]) {
          value = value[k];
        } else {
          return path; // Return path if translation not found
        }
      }
      break;
    }
  }
  
  return value || path;
};
