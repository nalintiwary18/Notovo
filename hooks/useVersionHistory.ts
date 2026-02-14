'use client';

import { useState, useCallback, useMemo } from 'react';

export interface Block {
    id: string;
    type: 'paragraph';
    content: string;
    metadata?: Record<string, unknown>;
}

export type ChangeType = 'MAJOR' | 'MINOR';

export interface DocumentVersion {
    id: string;
    timestamp: number;
    blocks: Block[];
    changeType: ChangeType;
    description?: string;
}

export interface VersionHistoryState {
    versions: DocumentVersion[];
    currentVersionIndex: number;
}

const MAX_VERSIONS = 10;

export function useVersionHistory(initialBlocks: Block[] = []) {
    const [state, setState] = useState<VersionHistoryState>(() => {
        if (initialBlocks.length === 0) {
            return { versions: [], currentVersionIndex: -1 };
        }

        // Create initial version from existing blocks
        const initialVersion: DocumentVersion = {
            id: `v-${Date.now()}`,
            timestamp: Date.now(),
            blocks: initialBlocks,
            changeType: 'MAJOR',
            description: 'Initial version'
        };

        return {
            versions: [initialVersion],
            currentVersionIndex: 0
        };
    });

    // Current version (read-only computed value)
    const currentVersion = useMemo(() => {
        if (state.currentVersionIndex < 0 || state.versions.length === 0) {
            return null;
        }
        return state.versions[state.currentVersionIndex];
    }, [state.versions, state.currentVersionIndex]);

    // Current blocks (what to render)
    const currentBlocks = useMemo(() => {
        return currentVersion?.blocks || [];
    }, [currentVersion]);

    // Can undo?
    const canUndo = useMemo(() => {
        return state.currentVersionIndex > 0;
    }, [state.currentVersionIndex]);

    // Has document?
    const hasDocument = useMemo(() => {
        return currentBlocks.length > 0;
    }, [currentBlocks]);

    /**
     * Create a new MAJOR version (full regeneration, adding sections)
     */
    const createMajorVersion = useCallback((
        newBlocks: Block[],
        description: string = 'Major change'
    ) => {
        setState(prev => {
            const newVersion: DocumentVersion = {
                id: `v-${Date.now()}`,
                timestamp: Date.now(),
                blocks: newBlocks,
                changeType: 'MAJOR',
                description
            };

            // Slice off any versions after current (if we undid and then made a change)
            const slicedVersions = prev.versions.slice(0, prev.currentVersionIndex + 1);

            // Add new version
            let newVersions = [...slicedVersions, newVersion];

            // Trim to max versions
            if (newVersions.length > MAX_VERSIONS) {
                newVersions = newVersions.slice(-MAX_VERSIONS);
            }

            return {
                versions: newVersions,
                currentVersionIndex: newVersions.length - 1
            };
        });
    }, []);

    /**
     * Apply a MINOR edit (in-place, doesn't create new version)
     */
    const applyMinorEdit = useCallback((
        blockId: string,
        newContent: string
    ) => {
        setState(prev => {
            if (prev.currentVersionIndex < 0 || prev.versions.length === 0) {
                return prev;
            }

            const updatedVersions = [...prev.versions];
            const currentVersion = { ...updatedVersions[prev.currentVersionIndex] };

            // Update the block content in-place
            currentVersion.blocks = currentVersion.blocks.map(block =>
                block.id === blockId
                    ? { ...block, content: newContent }
                    : block
            );
            currentVersion.timestamp = Date.now();

            updatedVersions[prev.currentVersionIndex] = currentVersion;

            return {
                ...prev,
                versions: updatedVersions
            };
        });
    }, []);

    /**
     * Apply edit using the content replacement approach (for AI edits that replace substrings)
     */
    const applyContentEdit = useCallback((
        blockId: string,
        startOffset: number,
        endOffset: number,
        newText: string
    ) => {
        setState(prev => {
            if (prev.currentVersionIndex < 0 || prev.versions.length === 0) {
                return prev;
            }

            const updatedVersions = [...prev.versions];
            const currentVersion = { ...updatedVersions[prev.currentVersionIndex] };

            currentVersion.blocks = currentVersion.blocks.map(block => {
                if (block.id !== blockId) return block;

                const before = block.content.substring(0, startOffset);
                const after = block.content.substring(endOffset);

                return {
                    ...block,
                    content: before + newText + after
                };
            });
            currentVersion.timestamp = Date.now();

            updatedVersions[prev.currentVersionIndex] = currentVersion;

            return {
                ...prev,
                versions: updatedVersions
            };
        });
    }, []);

    /**
     * Undo to previous version
     */
    const undo = useCallback(() => {
        setState(prev => {
            if (prev.currentVersionIndex <= 0) {
                return prev;
            }
            return {
                ...prev,
                currentVersionIndex: prev.currentVersionIndex - 1
            };
        });
    }, []);

    /**
     * Redo to next version (if we undid)
     */
    const redo = useCallback(() => {
        setState(prev => {
            if (prev.currentVersionIndex >= prev.versions.length - 1) {
                return prev;
            }
            return {
                ...prev,
                currentVersionIndex: prev.currentVersionIndex + 1
            };
        });
    }, []);

    /**
     * Can redo?
     */
    const canRedo = useMemo(() => {
        return state.currentVersionIndex < state.versions.length - 1;
    }, [state.currentVersionIndex, state.versions.length]);

    /**
     * Add blocks to current version (for streaming/incremental updates)
     */
    const addBlocksToCurrentVersion = useCallback((
        newBlocks: Block[],
        isMajorChange: boolean = true
    ) => {
        setState(prev => {
            if (isMajorChange || prev.versions.length === 0) {
                // Create new major version with combined blocks
                const combinedBlocks = [
                    ...(prev.currentVersionIndex >= 0 ? prev.versions[prev.currentVersionIndex].blocks : []),
                    ...newBlocks
                ];

                const newVersion: DocumentVersion = {
                    id: `v-${Date.now()}`,
                    timestamp: Date.now(),
                    blocks: combinedBlocks,
                    changeType: 'MAJOR',
                    description: 'Added new content'
                };

                const slicedVersions = prev.versions.slice(0, prev.currentVersionIndex + 1);
                let newVersions = [...slicedVersions, newVersion];

                if (newVersions.length > MAX_VERSIONS) {
                    newVersions = newVersions.slice(-MAX_VERSIONS);
                }

                return {
                    versions: newVersions,
                    currentVersionIndex: newVersions.length - 1
                };
            } else {
                // Add to current version (minor)
                const updatedVersions = [...prev.versions];
                const currentVersion = { ...updatedVersions[prev.currentVersionIndex] };

                currentVersion.blocks = [...currentVersion.blocks, ...newBlocks];
                currentVersion.timestamp = Date.now();

                updatedVersions[prev.currentVersionIndex] = currentVersion;

                return {
                    ...prev,
                    versions: updatedVersions
                };
            }
        });
    }, []);

    /**
     * Replace all blocks (for document regeneration)
     */
    const replaceBlocks = useCallback((newBlocks: Block[], description: string = 'Document regenerated') => {
        createMajorVersion(newBlocks, description);
    }, [createMajorVersion]);

    /**
     * Clear all versions
     */
    const clearVersions = useCallback(() => {
        setState({ versions: [], currentVersionIndex: -1 });
    }, []);

    return {
        // State
        currentBlocks,
        currentVersion,
        versions: state.versions,
        currentVersionIndex: state.currentVersionIndex,
        hasDocument,
        canUndo,
        canRedo,

        // Actions
        createMajorVersion,
        applyMinorEdit,
        applyContentEdit,
        addBlocksToCurrentVersion,
        replaceBlocks,
        undo,
        redo,
        clearVersions
    };
}
