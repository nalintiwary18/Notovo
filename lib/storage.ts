import { supabase, ChatSession, ChatMessage, GeneratedDocument, DocumentBlock, UserDocument } from './supabase'

// Session ID storage key
const SESSION_ID_KEY = 'notova_session_id'

// Flag to track if we've warned about missing tables
let hasWarnedAboutTables = false

// Helper to check if error is due to missing table
function isTableMissingError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false
    // PostgreSQL error code for undefined table
    return error.code === '42P01' ||
        (error.message?.includes('relation') ?? false) ||
        (error.message?.includes('does not exist') ?? false)
}

// Suppress repeated table-missing warnings
function handleStorageError(context: string, error: { code?: string; message?: string } | null): void {
    if (isTableMissingError(error)) {
        if (!hasWarnedAboutTables) {
            console.warn('📋 Supabase tables not set up yet. Run supabase_setup.sql in your Supabase dashboard.')
            hasWarnedAboutTables = true
        }
        return
    }
    console.error(`Error ${context}:`, error)
}

// Get or create a session ID (persists across browser refreshes)
export function getOrCreateSessionId(): string {
    if (typeof window === 'undefined') {
        return crypto.randomUUID()
    }

    let sessionId = localStorage.getItem(SESSION_ID_KEY)
    if (!sessionId) {
        sessionId = crypto.randomUUID()
        localStorage.setItem(SESSION_ID_KEY, sessionId)
    }
    return sessionId
}

// Clear the session (start fresh)
export function clearSession(): void {
    if (typeof window !== 'undefined') {
        localStorage.removeItem(SESSION_ID_KEY)
    }
}

// ============ CHAT SESSION FUNCTIONS ============

export async function createChatSession(sessionId: string): Promise<ChatSession | null> {
    const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ id: sessionId })
        .select()
        .single()

    if (error) {
        handleStorageError('creating chat session', error)
        return null
    }
    return data
}

export async function getOrCreateChatSession(sessionId: string): Promise<ChatSession | null> {
    // Try to get existing session
    const { data: existing } = await supabase
        .from('chat_sessions')
        .select()
        .eq('id', sessionId)
        .single()

    if (existing) {
        return existing
    }

    // Create new session
    return createChatSession(sessionId)
}

// ============ CHAT MESSAGE FUNCTIONS ============

export async function saveChatMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    showOpenDocument: boolean = false
): Promise<ChatMessage | null> {
    const { data, error } = await supabase
        .from('chat_messages')
        .insert({
            session_id: sessionId,
            role,
            content,
            show_open_document: showOpenDocument
        })
        .select()
        .single()

    if (error) {
        handleStorageError('saving chat message', error)
        return null
    }
    return data
}

export async function getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
        .from('chat_messages')
        .select()
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

    if (error) {
        handleStorageError('getting chat history', error)
        return []
    }
    return data || []
}

// ============ GENERATED DOCUMENT FUNCTIONS ============

export async function saveGeneratedDocument(
    sessionId: string,
    blocks: DocumentBlock[]
): Promise<GeneratedDocument | null> {
    // Check if document exists for this session
    const { data: existing } = await supabase
        .from('generated_documents')
        .select()
        .eq('session_id', sessionId)
        .single()

    if (existing) {
        // Update existing document
        const { data, error } = await supabase
            .from('generated_documents')
            .update({ blocks, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
            .select()
            .single()

        if (error) {
            handleStorageError('updating generated document', error)
            return null
        }
        return data
    }

    // Create new document
    const { data, error } = await supabase
        .from('generated_documents')
        .insert({ session_id: sessionId, blocks })
        .select()
        .single()

    if (error) {
        handleStorageError('saving generated document', error)
        return null
    }
    return data
}

export async function getGeneratedDocument(sessionId: string): Promise<GeneratedDocument | null> {
    const { data, error } = await supabase
        .from('generated_documents')
        .select()
        .eq('session_id', sessionId)
        .single()

    if (error) {
        if (error.code !== 'PGRST116') { // Not found error is expected
            handleStorageError('getting generated document', error)
        }
        return null
    }
    return data
}

// ============ USER DOCUMENT FUNCTIONS (1 HOUR TTL) ============

export async function saveUserDocument(
    sessionId: string,
    fileName: string,
    fileContent: string,
    fileType?: string
): Promise<UserDocument | null> {
    // Set expiration to 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
        .from('user_documents')
        .insert({
            session_id: sessionId,
            file_name: fileName,
            file_content: fileContent,
            file_type: fileType,
            expires_at: expiresAt
        })
        .select()
        .single()

    if (error) {
        handleStorageError('saving user document', error)
        return null
    }
    return data
}

export async function getUserDocuments(sessionId: string): Promise<UserDocument[]> {
    const { data, error } = await supabase
        .from('user_documents')
        .select()
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

    if (error) {
        handleStorageError('getting user documents', error)
        return []
    }
    return data || []
}

// Client-side cleanup trigger (calls the scheduled function logic)
export async function cleanupExpiredUserDocuments(): Promise<number> {
    const { data, error } = await supabase
        .from('user_documents')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('id')

    if (error) {
        handleStorageError('cleaning up expired documents', error)
        return 0
    }
    return data?.length || 0
}
