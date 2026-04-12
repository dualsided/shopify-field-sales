'use client';

import { useEffect, useRef } from 'react';
import { useSaveBarContext } from './SaveBarContext';

interface SaveBarProps {
  isDirty: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  discardLabel?: string;
}

export function SaveBar({
  isDirty,
  isSaving = false,
  onSave,
  onDiscard,
  saveLabel = 'Save',
  discardLabel = 'Discard',
}: SaveBarProps) {
  const { setIsDirty, isShaking } = useSaveBarContext();
  const hasAnimatedIn = useRef(false);

  // Sync local isDirty state with context
  useEffect(() => {
    setIsDirty(isDirty);
    if (!isDirty) {
      hasAnimatedIn.current = false;
    }
    return () => setIsDirty(false);
  }, [isDirty, setIsDirty]);

  // Mark as animated after mount
  useEffect(() => {
    if (isDirty && !hasAnimatedIn.current) {
      hasAnimatedIn.current = true;
    }
  }, [isDirty]);

  if (!isDirty) return null;

  // Only show slide-up on initial appearance, shake when triggered
  const animationClass = isShaking
    ? 'animate-shake'
    : !hasAnimatedIn.current
      ? 'animate-slide-up'
      : '';

  return (
    <div className={`fixed bottom-20 left-4 right-4 z-50 ${animationClass}`}>
      <div className="bg-white rounded-xl shadow-lg border border-primary-600 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-900">Unsaved changes</p>
          <div className="flex items-center gap-2">
            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="btn-secondary text-sm"
            >
              {discardLabel}
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              className="btn-primary text-sm"
            >
              {isSaving ? 'Saving...' : saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SaveBar;
