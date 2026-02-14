'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    getOrCreateSessionId,
    saveGeneratedDocument,
    getGeneratedDocument,
    saveUserDocument,
    getUserDocuments
} from '@/lib/storage'
import { DocumentBlock, UserDocument } from '@/lib/supabase'

export interface Block {
    id: string
    type: 'paragraph'
    content: string
    metadata?: Record<string, unknown>
}

export function useDocumentStorage() {
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [documentBlocks, setDocumentBlocks] = useState<Block[]>([])
    const [userDocuments, setUserDocuments] = useState<UserDocument[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const initRef = useRef(false)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // Initialize session and load document
    useEffect(() => {
        if (initRef.current) return
        initRef.current = true

        const initSession = async () => {
            try {
                const sid = getOrCreateSessionId()
                setSessionId(sid)

                // Load existing generated document
                const doc = await getGeneratedDocument(sid)
                if (doc && doc.blocks) {
                    setDocumentBlocks(doc.blocks as Block[])
                }

                // Load user documents (non-expired)
                const userDocs = await getUserDocuments(sid)
                setUserDocuments(userDocs)
            } catch (error) {
                console.error('Error initializing document session:', error)
            } finally {
                setIsLoading(false)
            }
        }

        initSession()
    }, [])

    // Auto-save document blocks when they change (debounced)
    useEffect(() => {
        if (!sessionId || documentBlocks.length === 0) return

        // Debounce saves
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
        }

        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true)
            try {
                await saveGeneratedDocument(sessionId, documentBlocks as DocumentBlock[])
            } catch (error) {
                console.error('Error auto-saving document:', error)
            } finally {
                setIsSaving(false)
            }
        }, 2000) // 2 second debounce

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current)
            }
        }
    }, [sessionId, documentBlocks])

    // Force save document immediately
    const saveDocument = useCallback(async () => {
        if (!sessionId || documentBlocks.length === 0) return

        setIsSaving(true)
        try {
            await saveGeneratedDocument(sessionId, documentBlocks as DocumentBlock[])
        } catch (error) {
            console.error('Error saving document:', error)
        } finally {
            setIsSaving(false)
        }
    }, [sessionId, documentBlocks])

    // Save user uploaded document (3 hour TTL for logged-in, 1 hour for guests)
    const saveUploadedDocument = useCallback(async (
        fileName: string,
        fileContent: string,
        fileType?: string,
        fileSize?: number,
        userId?: string
    ) => {
        if (!sessionId) return null

        try {
            const doc = await saveUserDocument(sessionId, fileName, fileContent, fileType, fileSize, userId)
            if (doc) {
                setUserDocuments(prev => [doc, ...prev])
            }
            return doc
        } catch (error) {
            console.error('Error saving user document:', error)
            return null
        }
    }, [sessionId])

    // Refresh user documents (to remove expired ones)
    const refreshUserDocuments = useCallback(async () => {
        if (!sessionId) return

        try {
            const userDocs = await getUserDocuments(sessionId)
            setUserDocuments(userDocs)
        } catch (error) {
            console.error('Error refreshing user documents:', error)
        }
    }, [sessionId])

    // Update document blocks
    const updateDocumentBlocks = useCallback((
        updater: Block[] | ((prev: Block[]) => Block[])
    ) => {
        setDocumentBlocks(prev => {
            if (typeof updater === 'function') {
                return updater(prev)
            }
            return updater
        })
    }, [])

    // Add new blocks to document
    const addBlocks = useCallback((newBlocks: Block[]) => {
        setDocumentBlocks(prev => [...prev, ...newBlocks])
    }, [])

    // Clear document
    const clearDocument = useCallback(() => {
        setDocumentBlocks([])
    }, [])

    return {
        sessionId,
        documentBlocks,
        setDocumentBlocks: updateDocumentBlocks,
        addBlocks,
        clearDocument,
        saveDocument,
        userDocuments,
        saveUploadedDocument,
        refreshUserDocuments,
        isLoading,
        isSaving
    }
}
