import { readSetting } from './storage.ts';

// Red marks for entries that break a rule. Off is the hardcore mode; marks for what is already
// satisfied (greyed clues, green counts) stay either way.
export const MISTAKES_KEY = 'ph:mistakes';

export function showMistakes(): boolean {
  return readSetting(MISTAKES_KEY) !== '0';
}
