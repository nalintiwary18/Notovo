import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Database type definitions

// Metadata for file attachments (persisted with chat messages)
export interface FileMetadata {
    fileName: string
    fileSize: number
    fileType: string
}

// Metadata for AI edits (persisted with chat messages)
export interface EditMetadata {
    selectedText: string
    command: string
}

export interface ChatSession {
    id: string
    user_id?: string
    title?: string
    created_at: string
    updated_at: string
}

export interface ChatMessage {
    id: string
    session_id: string
    chat_id?: string  // Links messages to specific chat for version tracking
    role: 'user' | 'assistant' | 'system'
    content: string
    show_open_document: boolean
    version_index?: number  // For tracking which version this message relates to
    file_metadata?: FileMetadata  // For persistent file attachment preview
    edit_metadata?: EditMetadata  // For persistent edit with AI preview
    created_at: string
}


export interface GeneratedDocument {
    id: string
    session_id: string
    blocks: DocumentBlock[]
    created_at: string
    updated_at: string
}

export interface DocumentBlock {
    id: string
    type: 'paragraph'
    content: string
    metadata?: Record<string, unknown>
}

export interface UserDocument {
    id: string
    session_id: string
    user_id?: string
    file_name: string
    file_content: string
    file_type?: string
    file_size?: number
    expires_at: string
    created_at: string
}

export interface DocumentVersion {
    id: string
    session_id: string
    version_index: number
    blocks: DocumentBlock[]
    content_hash: string
    created_at: string
}

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase environment variables not set. Database features will be disabled.')
}

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseKey || '')
