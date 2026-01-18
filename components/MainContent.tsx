'use client'

import 'react-split-pane/styles.css';
import { SplitPane, Pane } from "react-split-pane";
import DocRender from "@/components/DocRender";
import Chat from "@/components/ChatSection";
import { useUIState, SelectionData } from "@/hooks/useUIState";
import { useDocumentStorage } from "@/hooks/useDocumentStorage";
import { motion, AnimatePresence } from "framer-motion";

export interface Block {
    id: string;
    type: 'paragraph';
    content: string;
}

export default function MainContent() {
    const {
        documentBlocks,
        setDocumentBlocks,
        saveUploadedDocument,
        isLoading: isDocumentLoading,
        isSaving
    } = useDocumentStorage();
    const { uiMode, setSelection } = useUIState();

    const handleSelectionChange = (data: SelectionData | null) => {
        setSelection(data);
    };

    // Show loading state while documents are being loaded
    if (isDocumentLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-gray-950 rounded-2xl">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-muted-foreground">Loading session...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen w-full overflow-hidden">
            {/* Saving indicator */}
            {isSaving && (
                <div className="fixed top-4 right-4 z-50 bg-muted px-3 py-1.5 rounded-full text-xs text-muted-foreground flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    Saving...
                </div>
            )}

            <AnimatePresence mode="wait">
                {uiMode === 'chat' ? (
                    // Chat-only mode: full width chat
                    <motion.div
                        key="chat-only"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full w-full"
                    >
                        <div className="h-full overflow-y-auto scrollbar-hide bg-gray-800">
                            <Chat
                                setDocumentBlocks={setDocumentBlocks}
                                documentBlocks={documentBlocks as Block[]}
                                onSaveUploadedDocument={saveUploadedDocument}
                            />
                        </div>
                    </motion.div>
                ) : (
                    // Document mode: split screen with chat on left, document on right
                    <motion.div
                        key="document-mode"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full w-full"
                    >
                        <SplitPane direction="horizontal" className="!h-full">
                            <Pane minSize="30%" defaultSize="40%">
                                <motion.div
                                    initial={{ x: 0 }}
                                    animate={{ x: 0 }}
                                    className="h-full overflow-y-auto scrollbar-hide bg-gray-800 right-2"
                                >
                                    <Chat
                                        setDocumentBlocks={setDocumentBlocks}
                                        documentBlocks={documentBlocks as Block[]}
                                        onSaveUploadedDocument={saveUploadedDocument}
                                    />
                                </motion.div>
                            </Pane>
                            <Pane>
                                <motion.div
                                    initial={{ x: 100, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                                    className="h-full overflow-y-auto scrollbar-hide bg-gray-800"
                                >
                                    <DocRender
                                        documentBlocks={documentBlocks as Block[]}
                                        setDocumentBlocks={setDocumentBlocks}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                </motion.div>
                            </Pane>
                        </SplitPane>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

