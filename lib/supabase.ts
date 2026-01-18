import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Database type definitions
export interface ChatSession {
    id: string
    user_id?: string
    created_at: string
    updated_at: string
}

export interface ChatMessage {
    id: string
    session_id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    show_open_document: boolean
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
    file_name: string
    file_content: string
    file_type?: string
    expires_at: string
    created_at: string
}

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase environment variables not set. Database features will be disabled.')
}

export const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseKey || '')
