import { supabase, ChatSession, ChatMessage, GeneratedDocument, DocumentBlock, UserDocument, DocumentVersion } from './supabase'

// Session ID storage key
const SESSION_ID_KEY = 'notova_session_id'

// Helper: Create short MD5-like hash for content_hash (avoids index size limit)
function createShortHash(content: string): string {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
}

// Helper: Sanitize file content to remove null bytes (binary files)
function sanitizeForStorage(content: string): string {
    // Remove null bytes and other problematic characters
    return content.replace(/\u0000/g, '')
}

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
function handleStorageError(context: string, error: { code?: string; message?: string; details?: string; hint?: string } | null): void {
    if (isTableMissingError(error)) {
        if (!hasWarnedAboutTables) {
            console.warn('📋 Supabase tables not set up yet. Run supabase_setup.sql in your Supabase dashboard.')
            hasWarnedAboutTables = true
        }
        return
    }
    // Log full error details for debugging
    console.error(`Error ${context}:`, {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint
    })
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

export async function createChatSession(sessionId: string, userId?: string, title?: string): Promise<ChatSession | null> {
    const insertData: { id: string; user_id?: string; title?: string } = { id: sessionId }
    if (userId) insertData.user_id = userId
    if (title) insertData.title = title

    const { data, error } = await supabase
        .from('chat_sessions')
        .insert(insertData)
        .select()
        .single()

    if (error) {
        handleStorageError('creating chat session', error)
        return null
    }
    return data
}

export async function getOrCreateChatSession(sessionId: string, userId?: string): Promise<ChatSession | null> {
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
    return createChatSession(sessionId, userId)
}

export async function getUserChatSessions(userId: string): Promise<ChatSession[]> {
    const { data, error } = await supabase
        .from('chat_sessions')
        .select()
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20)

    if (error) {
        handleStorageError('getting user chat sessions', error)
        return []
    }
    return data || []
}

export async function updateChatSessionTitle(sessionId: string, title: string): Promise<void> {
    const { error } = await supabase
        .from('chat_sessions')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', sessionId)

    if (error) {
        handleStorageError('updating chat session title', error)
    }
}

// ============ CHAT MESSAGE FUNCTIONS ============

export async function saveChatMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    showOpenDocument: boolean = false,
    versionIndex?: number,
    fileMetadata?: { fileName: string; fileSize: number; fileType: string },
    editMetadata?: { selectedText: string; command: string }
): Promise<ChatMessage | null> {
    const insertData: Record<string, unknown> = {
        session_id: sessionId,
        role,
        content,
        show_open_document: showOpenDocument
    }

    // Only include optional fields if defined
    if (versionIndex !== undefined) {
        insertData.version_index = versionIndex
    }
    if (fileMetadata) {
        insertData.file_metadata = fileMetadata
    }
    if (editMetadata) {
        insertData.edit_metadata = editMetadata
    }

    const { data, error } = await supabase
        .from('chat_messages')
        .insert(insertData)
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

// ============ USER DOCUMENT FUNCTIONS ============
// Logged-in users: 3 hour TTL
// Guest users: 1 hour TTL

export async function saveUserDocument(
    sessionId: string,
    fileName: string,
    fileContent: string,
    fileType?: string,
    fileSize?: number,
    userId?: string
): Promise<UserDocument | null> {
    // 3 hours for logged-in users, 1 hour for guests
    const ttlHours = userId ? 3 : 1
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()

    const insertData: Record<string, unknown> = {
        session_id: sessionId,
        file_name: fileName,
        file_content: sanitizeForStorage(fileContent), // Remove null bytes
        file_type: fileType,
        file_size: fileSize,
        expires_at: expiresAt
    }

    if (userId) {
        insertData.user_id = userId
    }

    console.log('🔍 DEBUG: Inserting user_document:', { sessionId, fileName, fileType, fileSize, hasUserId: !!userId })

    const { data, error } = await supabase
        .from('user_documents')
        .insert(insertData)
        .select()
        .single()

    if (error) {
        console.log('❌ DEBUG: Insert error raw:', JSON.stringify(error, null, 2))
        handleStorageError('saving user document', error)
        return null
    }
    console.log('✅ DEBUG: Insert success:', data?.id)
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

// ============ DOCUMENT VERSION FUNCTIONS ============

const MAX_VERSIONS_PER_SESSION = 10

export async function saveDocumentVersion(
    sessionId: string,
    versionIndex: number,
    blocks: DocumentBlock[],
    contentHash: string
): Promise<DocumentVersion | null> {
    console.log('🔍 DEBUG: Inserting document_version:', { sessionId, versionIndex, contentHash, blocksCount: blocks.length })

    const { data, error } = await supabase
        .from('document_versions')
        .insert({
            session_id: sessionId,
            version_index: versionIndex,
            blocks,
            content_hash: contentHash
        })
        .select()
        .single()

    if (error) {
        console.log('❌ DEBUG: document_version error raw:', JSON.stringify(error, null, 2))
        handleStorageError('saving document version', error)
        return null
    }

    console.log('✅ DEBUG: document_version success:', data?.id)

    // Cleanup old versions if we exceed the limit
    await cleanupOldVersions(sessionId)

    return data
}

export async function getDocumentVersions(sessionId: string): Promise<DocumentVersion[]> {
    const { data, error } = await supabase
        .from('document_versions')
        .select()
        .eq('session_id', sessionId)
        .order('version_index', { ascending: true })

    if (error) {
        handleStorageError('getting document versions', error)
        return []
    }
    return data || []
}

export async function getLatestVersionIndex(sessionId: string): Promise<number> {
    const { data, error } = await supabase
        .from('document_versions')
        .select('version_index')
        .eq('session_id', sessionId)
        .order('version_index', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        if (error.code !== 'PGRST116') { // Not found is expected for new sessions
            handleStorageError('getting latest version index', error)
        }
        return -1
    }
    return data?.version_index ?? -1
}

export async function deleteVersionsAfter(sessionId: string, versionIndex: number): Promise<void> {
    const { error } = await supabase
        .from('document_versions')
        .delete()
        .eq('session_id', sessionId)
        .gt('version_index', versionIndex)

    if (error) {
        handleStorageError('deleting versions after index', error)
    }
}

async function cleanupOldVersions(sessionId: string): Promise<void> {
    // Get all versions for this session
    const { data: versions, error } = await supabase
        .from('document_versions')
        .select('id, version_index')
        .eq('session_id', sessionId)
        .order('version_index', { ascending: false })

    if (error || !versions) return

    // If we have more than max, delete the oldest ones
    if (versions.length > MAX_VERSIONS_PER_SESSION) {
        const toDelete = versions.slice(MAX_VERSIONS_PER_SESSION)
        const idsToDelete = toDelete.map(v => v.id)

        await supabase
            .from('document_versions')
            .delete()
            .in('id', idsToDelete)
    }
}

export async function checkVersionExists(sessionId: string, contentHash: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('document_versions')
        .select('id')
        .eq('session_id', sessionId)
        .eq('content_hash', contentHash)
        .limit(1)

    if (error) {
        return false
    }
    return (data?.length ?? 0) > 0
}
