'use client'

import 'react-split-pane/styles.css';
import { SplitPane, Pane } from "react-split-pane";
import DocRender from "@/components/DocRender";
import Chat from "@/components/ChatSection";
import { useUIState, SelectionData } from "@/hooks/useUIState";
import { useDocumentStorage } from "@/hooks/useDocumentStorage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { motion, AnimatePresence } from "framer-motion";
import { Undo2, Redo2, ChevronLeft, Download, Maximize2, Minimize2, ChevronDown } from "lucide-react";
import { useCallback, useRef, useState, useEffect } from "react";
import {
    getDocumentVersions,
    saveDocumentVersion,
    checkVersionExists,
    getOrCreateSessionId
} from "@/lib/storage";

export interface Block {
    id: string;
    type: 'paragraph';
    content: string;
}

// Version type matching Supabase schema
interface DocumentVersion {
    id: string;
    blocks: Block[];
    version_index: number;
    content_hash: string;
}

const MAX_VERSIONS = 10;

export default function MainContent() {
    const {
        documentBlocks,
        setDocumentBlocks,
        saveUploadedDocument,
        isLoading: isDocumentLoading,
        isSaving
    } = useDocumentStorage();

    const { uiMode, setSelection, closeDocument } = useUIState();
    const isMobile = useIsMobile();

    // UI state for document panel
    const [isMaximized, setIsMaximized] = useState(false);
    const [showVersionDropdown, setShowVersionDropdown] = useState(false);
    const [mobileFocus, setMobileFocus] = useState<'doc' | 'chat'>('doc');

    // Version history state
    const [versions, setVersions] = useState<DocumentVersion[]>([]);
    const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
    const [isLoadingVersions, setIsLoadingVersions] = useState(true);

    // Track the last hash to prevent duplicate versions
    const lastBlocksHashRef = useRef<string>('');
    const sessionIdRef = useRef<string>('');

    // Generate a SHORT hash of blocks for comparison (avoids index size limits)
    const getBlocksHash = (blocks: Block[]): string => {
        const content = blocks.map(b => b.content).join('|||');
        // Simple hash function - creates a short numeric string
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    };

    // Load versions from Supabase on mount
    useEffect(() => {
        const loadVersions = async () => {
            const sessionId = getOrCreateSessionId();
            sessionIdRef.current = sessionId;

            try {
                const savedVersions = await getDocumentVersions(sessionId);
                if (savedVersions.length > 0) {
                    const mappedVersions: DocumentVersion[] = savedVersions.map(v => ({
                        id: v.id,
                        blocks: v.blocks as Block[],
                        version_index: v.version_index,
                        content_hash: v.content_hash
                    }));
                    setVersions(mappedVersions);

                    // Restore document blocks from the latest version
                    const latestVersion = mappedVersions[mappedVersions.length - 1];
                    if (latestVersion?.blocks) {
                        setDocumentBlocks(latestVersion.blocks);
                    }

                    setCurrentVersionIndex(mappedVersions.length - 1);
                    lastBlocksHashRef.current = latestVersion.content_hash;
                }
            } catch (error) {
                console.error('Error loading versions:', error);
            } finally {
                setIsLoadingVersions(false);
            }
        };

        loadVersions();
    }, []);

    // Create a new version (called after content changes)
    const isCreatingVersionRef = useRef(false);
    const createVersion = useCallback(async (blocks: Block[]) => {
        // Don't create versions while loading existing ones or if document is loading
        if (isLoadingVersions || isDocumentLoading) {
            return;
        }

        // Prevent concurrent version creation
        if (isCreatingVersionRef.current) {
            return;
        }

        const hash = getBlocksHash(blocks);

        // Don't create duplicate versions
        if (hash === lastBlocksHashRef.current) {
            return;
        }

        isCreatingVersionRef.current = true;

        try {
            // Check if this hash already exists in DB
            const exists = await checkVersionExists(sessionIdRef.current, hash);
            if (exists) {
                lastBlocksHashRef.current = hash;
                return;
            }

            lastBlocksHashRef.current = hash;
            // Always append at end (branching: don't delete future versions)
            const newVersionIndex = versions.length;

            // Save to Supabase
            const savedVersion = await saveDocumentVersion(
                sessionIdRef.current,
                newVersionIndex,
                blocks,
                hash
            );

            if (savedVersion) {
                const newVersion: DocumentVersion = {
                    id: savedVersion.id,
                    blocks: [...blocks],
                    version_index: newVersionIndex,
                    content_hash: hash
                };

                setVersions(prev => {
                    const updated = [...prev, newVersion];
                    return updated.length > MAX_VERSIONS
                        ? updated.slice(-MAX_VERSIONS)
                        : updated;
                });

                setCurrentVersionIndex(newVersionIndex);
            }
        } finally {
            isCreatingVersionRef.current = false;
        }
    }, [currentVersionIndex, versions.length, isLoadingVersions, isDocumentLoading]);

    // Wrapper for setDocumentBlocks that creates versions
    const handleSetDocumentBlocks = useCallback((
        blocksOrUpdater: Block[] | ((prev: Block[]) => Block[])
    ) => {
        if (typeof blocksOrUpdater === 'function') {
            setDocumentBlocks((prev) => {
                const newBlocks = blocksOrUpdater(prev as Block[]);
                // Create version after state update
                setTimeout(() => createVersion(newBlocks), 0);
                return newBlocks;
            });
        } else {
            setDocumentBlocks(blocksOrUpdater);
            if (blocksOrUpdater.length > 0) {
                setTimeout(() => createVersion(blocksOrUpdater), 0);
            }
        }
    }, [setDocumentBlocks, createVersion]);

    // Can undo/redo?
    const canUndo = currentVersionIndex > 0;
    const canRedo = currentVersionIndex < versions.length - 1;



    // Handle undo - restore previous version
    const handleUndo = useCallback(() => {
        if (currentVersionIndex > 0) {
            const prevVersion = versions[currentVersionIndex - 1];
            if (prevVersion) {
                // Update hash to prevent creating a new version
                lastBlocksHashRef.current = getBlocksHash(prevVersion.blocks);
                setDocumentBlocks(prevVersion.blocks);
                setCurrentVersionIndex(currentVersionIndex - 1);
            }
        }
    }, [versions, currentVersionIndex, setDocumentBlocks]);

    // Handle redo - restore next version
    const handleRedo = useCallback(() => {
        if (currentVersionIndex < versions.length - 1) {
            const nextVersion = versions[currentVersionIndex + 1];
            if (nextVersion) {
                // Update hash to prevent creating a new version
                lastBlocksHashRef.current = getBlocksHash(nextVersion.blocks);
                setDocumentBlocks(nextVersion.blocks);
                setCurrentVersionIndex(currentVersionIndex + 1);
            }
        }
    }, [versions, currentVersionIndex, setDocumentBlocks]);

    // Handle switching to a specific version (from chat version buttons)
    const handleSwitchToVersion = useCallback((versionIndex: number) => {
        // Find version by version_index property, not array position
        const targetVersion = versions.find(v => v.version_index === versionIndex);

        if (!targetVersion) {
            console.warn(`Version ${versionIndex} not found in versions array`);
            return;
        }

        // Already on this version
        const targetArrayIndex = versions.indexOf(targetVersion);
        if (targetArrayIndex === currentVersionIndex) return;

        // Update hash to prevent creating a new version
        lastBlocksHashRef.current = getBlocksHash(targetVersion.blocks);
        setDocumentBlocks(targetVersion.blocks);
        setCurrentVersionIndex(targetArrayIndex);
    }, [versions, currentVersionIndex, setDocumentBlocks]);

    const handleSelectionChange = (data: SelectionData | null) => {
        setSelection(data);
    };




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
                        className="h-full w-full flex flex-col"
                    >

                        <div className="flex-1 overflow-y-auto scrollbar-hide bg-gray-800">
                            <Chat
                                setDocumentBlocks={handleSetDocumentBlocks}
                                documentBlocks={documentBlocks as Block[]}
                                onSaveUploadedDocument={saveUploadedDocument}
                                currentVersionIndex={currentVersionIndex}
                                totalVersions={versions.length}
                                onSwitchToVersion={handleSwitchToVersion}
                            />
                        </div>
                    </motion.div>
                ) : isMobile ? (
                    // Mobile Document mode: stacked layout (document on top, chat below)
                    <motion.div
                        key="document-mode"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full w-full"
                    >
                        {isMaximized ? (
                            // Maximized: Document takes full width
                            <div className="h-full flex flex-col bg-gray-800 relative">
                                {/* Enhanced Document Toolbar */}
                                <div className="flex-shrink-0 z-10 bg-neutral-900 backdrop-blur-md border-b border-gray-700/50 px-3 py-2">
                                    <div className="flex items-center justify-between">
                                        {/* Left: Close button */}
                                        <button
                                            onClick={closeDocument}
                                            className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                            title="Close document"
                                        >
                                            <ChevronLeft size={18} />
                                        </button>

                                        {/* Center: Download + Version dropdown */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const downloadBtn = document.querySelector('[data-export-pdf]') as HTMLButtonElement;
                                                    downloadBtn?.click();
                                                }}
                                                className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                title="Download PDF"
                                            >
                                                <Download size={18} />
                                            </button>

                                            {/* Version dropdown */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/50 text-sm font-medium text-gray-300 transition-colors"
                                                >
                                                    <span>V{versions.length > 0 ? currentVersionIndex + 1 : 1}</span>
                                                    <ChevronDown size={14} className={`transition-transform ${showVersionDropdown ? 'rotate-180' : ''}`} />
                                                </button>

                                                {showVersionDropdown && versions.length > 0 && (
                                                    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl py-1 min-w-[120px] z-20">
                                                        {versions.map((_, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    const version = versions[idx];
                                                                    if (version) {
                                                                        setDocumentBlocks(version.blocks);
                                                                        setCurrentVersionIndex(idx);
                                                                    }
                                                                    setShowVersionDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${idx === currentVersionIndex ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-700'}`}
                                                            >
                                                                Version {idx + 1}
                                                                {idx === versions.length - 1 && <span className="ml-2 text-xs text-gray-500">(latest)</span>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Minimize button */}
                                        <button
                                            onClick={() => setIsMaximized(false)}
                                            className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                            title="Exit fullscreen"
                                        >
                                            <Minimize2 size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto scrollbar-hide">
                                    <DocRender
                                        documentBlocks={documentBlocks as Block[]}
                                        setDocumentBlocks={handleSetDocumentBlocks}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                </div>
                            </div>
                        ) : (
                            // Normal mobile: Stacked layout — doc on top, chat below
                            <div className="h-full flex flex-col">
                                {/* Document section */}
                                <div
                                    className="flex flex-col bg-gray-800 relative border-b border-gray-700/50"
                                    style={{
                                        height: mobileFocus === 'doc' ? '60dvh' : '40dvh',
                                        transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                    onClick={() => mobileFocus !== 'doc' && setMobileFocus('doc')}
                                >
                                    {/* Document Toolbar */}
                                    <div className="flex-shrink-0 bg-neutral-900 backdrop-blur-md border-b border-gray-700/50 px-3 py-2">
                                        <div className="flex items-center justify-between">
                                            {/* Left: Close button */}
                                            <button
                                                onClick={closeDocument}
                                                className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                title="Close document"
                                            >
                                                <ChevronLeft size={18} />
                                            </button>

                                            {/* Center: Download + Version dropdown */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        const downloadBtn = document.querySelector('[data-export-pdf]') as HTMLButtonElement;
                                                        downloadBtn?.click();
                                                    }}
                                                    className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                    title="Download PDF"
                                                >
                                                    <Download size={18} />
                                                </button>

                                                {/* Version dropdown */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/50 text-sm font-medium text-gray-300 transition-colors"
                                                    >
                                                        <span>V{versions.length > 0 ? currentVersionIndex + 1 : 1}</span>
                                                        <ChevronDown size={14} className={`transition-transform ${showVersionDropdown ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {showVersionDropdown && versions.length > 0 && (
                                                        <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl py-1 min-w-[120px] z-20">
                                                            {versions.map((_, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => {
                                                                        const version = versions[idx];
                                                                        if (version) {
                                                                            setDocumentBlocks(version.blocks);
                                                                            setCurrentVersionIndex(idx);
                                                                        }
                                                                        setShowVersionDropdown(false);
                                                                    }}
                                                                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${idx === currentVersionIndex ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-700'}`}
                                                                >
                                                                    Version {idx + 1}
                                                                    {idx === versions.length - 1 && <span className="ml-2 text-xs text-gray-500">(latest)</span>}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right: Maximize button */}
                                            <button
                                                onClick={() => setIsMaximized(true)}
                                                className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                title="Maximize"
                                            >
                                                <Maximize2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Document content — scrolls independently */}
                                    <div className="flex-1 overflow-y-auto scrollbar-hide">
                                        <DocRender
                                            documentBlocks={documentBlocks as Block[]}
                                            setDocumentBlocks={handleSetDocumentBlocks}
                                            onSelectionChange={handleSelectionChange}
                                        />
                                    </div>
                                </div>

                                {/* Chat section */}
                                <div
                                    className="overflow-hidden bg-gray-800"
                                    style={{
                                        height: mobileFocus === 'chat' ? '60dvh' : '40dvh',
                                        transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                                    }}
                                    onClick={() => mobileFocus !== 'chat' && setMobileFocus('chat')}
                                >
                                    <Chat
                                        setDocumentBlocks={handleSetDocumentBlocks}
                                        documentBlocks={documentBlocks as Block[]}
                                        onSaveUploadedDocument={saveUploadedDocument}
                                        currentVersionIndex={currentVersionIndex}
                                        totalVersions={versions.length}
                                        onSwitchToVersion={handleSwitchToVersion}
                                    />
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    // Desktop Document mode: split screen with chat on left, document on right
                    <motion.div
                        key="document-mode"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="h-full w-full"
                    >
                        {isMaximized ? (
                            // Maximized: Document takes full width
                            <div className="h-full flex flex-col bg-gray-800 relative">
                                {/* Enhanced Document Toolbar */}
                                <div className="flex-shrink-0 z-10 bg-neutral-900 backdrop-blur-md border-b border-gray-700/50 px-3 py-2">
                                    <div className="flex items-center justify-between">
                                        {/* Left: Close button */}
                                        <button
                                            onClick={closeDocument}
                                            className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                            title="Close document"
                                        >
                                            <ChevronLeft size={18} />
                                        </button>

                                        {/* Center: Download + Version dropdown */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const downloadBtn = document.querySelector('[data-export-pdf]') as HTMLButtonElement;
                                                    downloadBtn?.click();
                                                }}
                                                className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                title="Download PDF"
                                            >
                                                <Download size={18} />
                                            </button>

                                            {/* Version dropdown */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/50 text-sm font-medium text-gray-300 transition-colors"
                                                >
                                                    <span>V{versions.length > 0 ? currentVersionIndex + 1 : 1}</span>
                                                    <ChevronDown size={14} className={`transition-transform ${showVersionDropdown ? 'rotate-180' : ''}`} />
                                                </button>

                                                {showVersionDropdown && versions.length > 0 && (
                                                    <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl py-1 min-w-[120px] z-20">
                                                        {versions.map((_, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => {
                                                                    const version = versions[idx];
                                                                    if (version) {
                                                                        setDocumentBlocks(version.blocks);
                                                                        setCurrentVersionIndex(idx);
                                                                    }
                                                                    setShowVersionDropdown(false);
                                                                }}
                                                                className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${idx === currentVersionIndex ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-700'}`}
                                                            >
                                                                Version {idx + 1}
                                                                {idx === versions.length - 1 && <span className="ml-2 text-xs text-gray-500">(latest)</span>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Minimize button */}
                                        <button
                                            onClick={() => setIsMaximized(false)}
                                            className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                            title="Exit fullscreen"
                                        >
                                            <Minimize2 size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="scrollbar-hide">
                                    <DocRender
                                        documentBlocks={documentBlocks as Block[]}
                                        setDocumentBlocks={handleSetDocumentBlocks}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                </div>
                            </div>
                        ) : (
                            // Normal: Split pane layout
                            <SplitPane direction="horizontal" className="!h-full">
                                <Pane minSize="30%" defaultSize="40%">
                                    <motion.div
                                        initial={{ x: 0 }}
                                        animate={{ x: 0 }}
                                        className="h-full overflow-y-auto scrollbar-hide bg-gray-800 right-2"
                                    >
                                        <Chat
                                            setDocumentBlocks={handleSetDocumentBlocks}
                                            documentBlocks={documentBlocks as Block[]}
                                            onSaveUploadedDocument={saveUploadedDocument}
                                            currentVersionIndex={currentVersionIndex}
                                            totalVersions={versions.length}
                                            onSwitchToVersion={handleSwitchToVersion}
                                        />
                                    </motion.div>
                                </Pane>
                                <Pane>
                                    <motion.div
                                        initial={{ x: 100, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                                        className="h-full flex flex-col bg-gray-800 relative"
                                    >
                                        {/* Enhanced Document Toolbar */}
                                        <div className="flex-shrink-0 z-10 bg-neutral-900 backdrop-blur-md border-b border-gray-700/50 border-l-2 rounded-t-2xl px-3 py-2">
                                            <div className="flex items-center justify-between">
                                                {/* Left: Close button */}
                                                <button
                                                    onClick={closeDocument}
                                                    className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                    title="Close document"
                                                >
                                                    <ChevronLeft size={18} />
                                                </button>

                                                {/* Center: Download + Version dropdown */}
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const downloadBtn = document.querySelector('[data-export-pdf]') as HTMLButtonElement;
                                                            downloadBtn?.click();
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                        title="Download PDF"
                                                    >
                                                        <Download size={18} />
                                                    </button>

                                                    {/* Version dropdown */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/50 text-sm font-medium text-gray-300 transition-colors"
                                                        >
                                                            <span>V{versions.length > 0 ? currentVersionIndex + 1 : 1}</span>
                                                            <ChevronDown size={14} className={`transition-transform ${showVersionDropdown ? 'rotate-180' : ''}`} />
                                                        </button>

                                                        {showVersionDropdown && versions.length > 0 && (
                                                            <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600/50 rounded-lg shadow-xl py-1 min-w-[120px] z-20">
                                                                {versions.map((_, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => {
                                                                            const version = versions[idx];
                                                                            if (version) {
                                                                                setDocumentBlocks(version.blocks);
                                                                                setCurrentVersionIndex(idx);
                                                                            }
                                                                            setShowVersionDropdown(false);
                                                                        }}
                                                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${idx === currentVersionIndex ? 'bg-primary/20 text-primary' : 'text-gray-300 hover:bg-gray-700'}`}
                                                                    >
                                                                        Version {idx + 1}
                                                                        {idx === versions.length - 1 && <span className="ml-2 text-xs text-gray-500">(latest)</span>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right: Maximize button */}
                                                <button
                                                    onClick={() => setIsMaximized(true)}
                                                    className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
                                                    title="Maximize"
                                                >
                                                    <Maximize2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                                            <DocRender
                                                documentBlocks={documentBlocks as Block[]}
                                                setDocumentBlocks={handleSetDocumentBlocks}
                                                onSelectionChange={handleSelectionChange}
                                            />
                                        </div>
                                    </motion.div>
                                </Pane>
                            </SplitPane>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
