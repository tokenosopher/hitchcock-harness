'use client';
// How a Release page tells Alma something as the user's own message (stage 3): through stage 2's useSendAsUser (the
// thread's own send, as the message box sends), so every chip in "Alma sees" rides along (a pending "Edited" chip
// goes with "Post TikTok now"), with the button's own chip among them carrying exactly what is asked. Only when the
// user presses a button that says it asks her.
import { useCallback } from 'react';
import type { Chip } from '@/server/types';
import { useSendAsUser } from './AskAlma';

export function useTellAlma(film: string) {
  const sendAs = useSendAsUser(film);
  return useCallback(async (text: string, chip?: Chip): Promise<boolean> => {
    // the panel folded away: her answer should be seen
    window.dispatchEvent(new Event('hh:alma-show'));
    return sendAs(text, chip ? [chip] : []);
  }, [sendAs]);
}
