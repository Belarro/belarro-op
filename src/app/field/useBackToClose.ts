'use client';

import { useEffect, useRef } from 'react';

// Makes the Android/browser hardware back button close an open modal/sheet
// instead of falling through to the previous page (which, with nothing
// behind it in a PWA, exits the whole app). Push a history entry while the
// modal is open; a back-press pops it and fires onBack instead of leaving.
export function useBackToClose(isOpen: boolean, onBack: () => void) {
  const closingViaBackRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: true }, '');

    const handlePopState = () => {
      closingViaBackRef.current = true;
      onBack();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // If the modal is closing for any reason OTHER than the user pressing
      // back (e.g. Save/✕ tapped), consume the history entry we pushed so
      // it doesn't leave a dangling "back" that reopens nothing.
      if (!closingViaBackRef.current) {
        window.history.back();
      }
      closingViaBackRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
