'use client';

import { useState, useCallback, createContext, useContext, ReactNode } from 'react';

export type UIMode = 'chat' | 'document';

export interface SelectionData {
  blockId: string;
  selectedText: string;        // The rendered text user sees/selects
  originalMarkdown: string;    // The actual Markdown source substring
  startOffset: number;
  endOffset: number;
}

export interface UIState {
  uiMode: UIMode;
  documentReady: boolean;
  selection: SelectionData | null;
}

export interface UIStateActions {
  openDocument: () => void;
  closeDocument: () => void;
  setDocumentReady: (ready: boolean) => void;
  setSelection: (data: SelectionData | null) => void;
  clearSelection: () => void;
}

export type UIStateContextValue = UIState & UIStateActions;

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [uiMode, setUIMode] = useState<UIMode>('chat');
  const [documentReady, setDocumentReadyState] = useState(false);
  const [selection, setSelectionState] = useState<SelectionData | null>(null);

  const openDocument = useCallback(() => {
    setUIMode('document');
  }, []);

  const closeDocument = useCallback(() => {
    setUIMode('chat');
  }, []);

  const setDocumentReady = useCallback((ready: boolean) => {
    setDocumentReadyState(ready);
  }, []);

  const setSelection = useCallback((data: SelectionData | null) => {
    setSelectionState(data);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionState(null);
  }, []);

  const value: UIStateContextValue = {
    uiMode,
    documentReady,
    selection,
    openDocument,
    closeDocument,
    setDocumentReady,
    setSelection,
    clearSelection,
  };

  return (
    <UIStateContext.Provider value={value}>
      {children}
    </UIStateContext.Provider>
  );
}

export function useUIState(): UIStateContextValue {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('useUIState must be used within a UIStateProvider');
  }
  return context;
}
