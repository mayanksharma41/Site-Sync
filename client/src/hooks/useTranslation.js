import { useLanguage } from '../context/LanguageContext';
import { getTranslation } from '../translations';

export const useTranslation = () => {
  const { language } = useLanguage();

  const t = (path) => {
    return getTranslation(language, path);
  };

  return { t, language };
};
