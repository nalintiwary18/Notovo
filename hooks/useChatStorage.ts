'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
    getOrCreateSessionId,
    getOrCreateChatSession,
    saveChatMessage,
    getChatHistory,
    cleanupExpiredUserDocuments
} from '@/lib/storage'
import { ChatMessage } from '@/lib/supabase'

export interface Message {
    role: 'user' | 'assistant' | 'system'
    content: string
    showOpenDocument?: boolean
}

export function useChatStorage() {
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isInitialized, setIsInitialized] = useState(false)
    const initRef = useRef(false)

    // Initialize session and load chat history
    useEffect(() => {
        if (initRef.current) return
        initRef.current = true

        const initSession = async () => {
            try {
                const sid = getOrCreateSessionId()
                setSessionId(sid)

                // Ensure session exists in database
                await getOrCreateChatSession(sid)

                // Load existing chat history
                const history = await getChatHistory(sid)

                // Convert database messages to local format
                const localMessages: Message[] = history.map((msg: ChatMessage) => ({
                    role: msg.role,
                    content: msg.content,
                    showOpenDocument: msg.show_open_document
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
    }, [])

    // Add a message (saves to database and updates local state)
    const addMessage = useCallback(async (message: Message) => {
        if (!sessionId) return

        // Update local state immediately
        setMessages(prev => [...prev, message])

        // Save to database in background
        try {
            await saveChatMessage(
                sessionId,
                message.role,
                message.content,
                message.showOpenDocument || false
            )
        } catch (error) {
            console.error('Error saving message:', error)
        }
    }, [sessionId])

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
                message.showOpenDocument || false
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
        isInitialized
    }
}
