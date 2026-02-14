'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    getOrCreateSessionId,
    getOrCreateChatSession,
    saveChatMessage,
    getChatHistory,
    cleanupExpiredUserDocuments,
    updateChatSessionTitle
} from '@/lib/storage'
import { ChatMessage } from '@/lib/supabase'
import { useAuth } from '@/hooks/AuthContext'

export interface Message {
    role: 'user' | 'assistant' | 'system'
    content: string
    showOpenDocument?: boolean
    versionIndex?: number  // For tracking which version this message relates to
    fileMetadata?: {  // For persistent file attachment preview
        fileName: string
        fileSize: number
        fileType: string
    }
    editMetadata?: {  // For persistent edit with AI preview
        selectedText: string
        command: string
    }
}


export function useChatStorage() {
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInitialized, setIsInitialized] = useState(false)
    const initRef = useRef(false)
    const titleUpdatedRef = useRef(false)
    const sessionCreatedRef = useRef(false) // Track if session exists in DB
    const { user, isAuthenticated } = useAuth()

    // Initialize session and load chat history
    useEffect(() => {
        if (initRef.current) return
        initRef.current = true

        const initSession = async () => {
            try {
                const sid = getOrCreateSessionId()
                setSessionId(sid)

                // DON'T create session in database here - wait until first message is sent
                // Only load existing chat history if session exists
                const history = await getChatHistory(sid)

                // If we have history, the session already exists in DB
                if (history.length > 0) {
                    sessionCreatedRef.current = true
                }

                // Convert database messages to local format
                const localMessages: Message[] = history.map((msg: ChatMessage) => ({
                    role: msg.role,
                    content: msg.content,
                    showOpenDocument: msg.show_open_document,
                    versionIndex: msg.version_index,
                    fileMetadata: msg.file_metadata,  // Load file metadata from database
                    editMetadata: msg.edit_metadata   // Load edit metadata from database
                }))

                setMessages(localMessages)

                // Cleanup expired user documents on session start
                cleanupExpiredUserDocuments().then(count => {
                    if (count > 0) {
                        console.log(`Cleaned up ${count} expired user documents`)
                    }
                })
            } catch (error) {
                console.error('Error initializing chat session:', error)
            } finally {
                setIsLoading(false)
                setIsInitialized(true)
            }
        }

        initSession()
    }, [user?.id])

    // Auto-generate session title from first user message (for authenticated users only)
    useEffect(() => {
        if (!isAuthenticated || !sessionId || titleUpdatedRef.current) return

        // Find first user message
        const firstUserMessage = messages.find(m => m.role === 'user')
        if (firstUserMessage) {
            titleUpdatedRef.current = true
            // Create title from first ~50 chars of message
            const title = firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
            updateChatSessionTitle(sessionId, title)
        }
    }, [messages, sessionId, isAuthenticated])

    // Add a message (saves to database and updates local state)
    // For anonymous users, only save to Supabase temporarily
    const addMessage = useCallback(async (message: Message) => {
        if (!sessionId) return

        // Update local state immediately
        setMessages(prev => [...prev, message])

        // Save to database in background (for all users - anon sessions have TTL)
        try {
            // Lazily create the session in DB only when the first message is sent
            if (!sessionCreatedRef.current) {
                await getOrCreateChatSession(sessionId, user?.id)
                sessionCreatedRef.current = true
            }

            await saveChatMessage(
                sessionId,
                message.role,
                message.content,
                message.showOpenDocument || false,
                message.versionIndex,
                message.fileMetadata,
                message.editMetadata
            )
        } catch (error) {
            console.error('Error saving message:', error)
        }
    }, [sessionId, user?.id])

    // Add messages without saving (for local-only updates)
    const addLocalMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message])
    }, [])

    // Save a message to database (useful for assistant responses)
    const saveMessage = useCallback(async (message: Message) => {
        if (!sessionId) return

        try {
            await saveChatMessage(
                sessionId,
                message.role,
                message.content,
                message.showOpenDocument || false,
                message.versionIndex  // Pass versionIndex to persist
            )
        } catch (error) {
            console.error('Error saving message:', error)
        }
    }, [sessionId])

    // Replace last message (useful for streaming updates)
    const replaceLastMessage = useCallback((message: Message) => {
        setMessages(prev => {
            if (prev.length === 0) return [message]
            return [...prev.slice(0, -1), message]
        })
    }, [])

    // Clear messages (local only - doesn't delete from database)
    const clearMessages = useCallback(() => {
        setMessages([])
    }, [])

    return {
        sessionId,
        messages,
        setMessages,
        addMessage,
        addLocalMessage,
        saveMessage,
        replaceLastMessage,
        clearMessages,
        isLoading,
        isInitialized,
        isAuthenticated
    }
}
