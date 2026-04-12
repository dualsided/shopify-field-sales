'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SaveBarContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  triggerShake: () => void;
  isShaking: boolean;
}

const SaveBarContext = createContext<SaveBarContextType | null>(null);

export function SaveBarProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  }, []);

  return (
    <SaveBarContext.Provider value={{ isDirty, setIsDirty, triggerShake, isShaking }}>
      {children}
    </SaveBarContext.Provider>
  );
}

export function useSaveBarContext() {
  const context = useContext(SaveBarContext);
  if (!context) {
    throw new Error('useSaveBarContext must be used within a SaveBarProvider');
  }
  return context;
}
