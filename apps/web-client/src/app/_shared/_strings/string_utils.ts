import { ENGLISH_STRINGS } from './english_strings';
import { SPANISH_STRINGS } from './spanish_strings';
import { STRING_IDS_ENUM } from './string_ids';

/*
    * Utility function to get the string desired based on the current language setting.
    * The language setting is stored in local storage under the key "app_language".
    * Defaults to English ("en") if no setting is found.
    * Parameters:
        - stringId: number - The ID of the string to retrieve.
        - example usage: getString(STRING_IDS_ENUM.STR_ID_1)
    * Returns:
        - string - The localized string corresponding to the provided stringId.  
*/
export const getString = (stringId: number): string => {
  const currLanguage = localStorage.getItem('app_language') || 'en';
  switch (currLanguage) {
    case 'en':
      return ENGLISH_STRINGS[stringId];
    case 'es':
      return SPANISH_STRINGS[stringId];
  }
  return '';
};
