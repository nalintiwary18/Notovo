'use client';

import { useState, useCallback, createContext, useContext, ReactNode, useMemo } from 'react';
import { IntentType } from '@/lib/intentTypes';

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
  intentMode: IntentType | null;
  isProcessingIntent: boolean;
  hasDocument: boolean;
}

export interface UIStateActions {
  openDocument: () => void;
  closeDocument: () => void;
  setDocumentReady: (ready: boolean) => void;
  setSelection: (data: SelectionData | null) => void;
  clearSelection: () => void;
  setIntentMode: (intent: IntentType | null) => void;
  setProcessingIntent: (processing: boolean) => void;
  setHasDocument: (has: boolean) => void;
}

export type UIStateContextValue = UIState & UIStateActions;

const UIStateContext = createContext<UIStateContextValue | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [uiMode, setUIMode] = useState<UIMode>('chat');
  const [documentReady, setDocumentReadyState] = useState(false);
  const [selection, setSelectionState] = useState<SelectionData | null>(null);
  const [intentMode, setIntentModeState] = useState<IntentType | null>(null);
  const [isProcessingIntent, setIsProcessingIntent] = useState(false);
  const [hasDocument, setHasDocumentState] = useState(false);

  const openDocument = useCallback(() => {
    setUIMode('document');
  }, []);

  const closeDocument = useCallback(() => {
    setUIMode('chat');
    setSelectionState(null);  // Clear selection when closing document
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

  const setIntentMode = useCallback((intent: IntentType | null) => {
    setIntentModeState(intent);
  }, []);

  const setProcessingIntent = useCallback((processing: boolean) => {
    setIsProcessingIntent(processing);
  }, []);

  const setHasDocument = useCallback((has: boolean) => {
    setHasDocumentState(has);
  }, []);

  // Computed: has active selection
  const hasActiveSelection = useMemo(() => {
    return selection !== null && selection.selectedText.length > 0;
  }, [selection]);

  const value: UIStateContextValue = {
    uiMode,
    documentReady,
    selection,
    intentMode,
    isProcessingIntent,
    hasDocument,
    openDocument,
    closeDocument,
    setDocumentReady,
    setSelection,
    clearSelection,
    setIntentMode,
    setProcessingIntent,
    setHasDocument,
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
