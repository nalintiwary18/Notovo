// Intent classification types and utilities
// Uses AI API for accurate intent detection

export type IntentType = 'CHAT_ONLY' | 'DOCUMENT_CREATE' | 'DOCUMENT_EDIT';

export interface IntentClassification {
    intent: IntentType;
    confidence: number;
    reason: string;
}

// Keywords that strongly suggest document creation (adding new content)
const DOCUMENT_CREATE_KEYWORDS = [
    'generate', 'create', 'make', 'write', 'notes', 'summarize', 'summary',
    'explain', 'document', 'outline', 'study guide', 'flashcards', 'create notes',
    'add new', 'also add', 'add a section', 'add section', 'add info', 'add information',
    'include', 'append', 'add more', 'add the', 'add about', 'how to use'
];

// Keywords that suggest chat-only (greetings, questions about AI)
const CHAT_ONLY_PATTERNS = [
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/i,
    /^(how are you|what can you do|who are you|what is your name)/i,
    /^(thanks|thank you|bye|goodbye|see you)/i,
    /\?$/  // Simple questions often just need chat response
];

/**
 * Quick local classification before AI call (for obvious cases)
 */
export function quickClassify(
    message: string,
    hasSelection: boolean,
    hasFile: boolean
): IntentType | null {
    const trimmed = message.trim().toLowerCase();

    // File upload always means document creation
    if (hasFile) {
        return 'DOCUMENT_CREATE';
    }

    // Selection always means document edit
    if (hasSelection) {
        return 'DOCUMENT_EDIT';
    }

    // Check for obvious chat-only patterns
    for (const pattern of CHAT_ONLY_PATTERNS) {
        if (pattern.test(trimmed)) {
            return 'CHAT_ONLY';
        }
    }

    // Check for explicit document creation keywords
    for (const keyword of DOCUMENT_CREATE_KEYWORDS) {
        if (trimmed.includes(keyword)) {
            return 'DOCUMENT_CREATE';
        }
    }

    // Check for patterns suggesting adding to document (not editing)
    // These patterns mean "add new content" not "edit existing"
    const addContentPatterns = [
        /^add\s/i,           // starts with "add "
        /also\s+add/i,       // "also add"
        /add\s+.*\s+to/i,    // "add X to"
        /include\s/i,        // starts with "include"
        /\badd\s+new/i,      // "add new"
        /\badd\s+(a\s+)?section/i,  // "add section" or "add a section"
        /\bversion\b/i       // mentions "version" (new version of content)
    ];

    for (const pattern of addContentPatterns) {
        if (pattern.test(trimmed)) {
            return 'DOCUMENT_CREATE';
        }
    }

    // Uncertain - needs AI classification
    return null;
}

/**
 * AI-based intent classification for ambiguous messages
 */
export async function classifyIntentWithAI(
    message: string,
    hasDocument: boolean
): Promise<IntentClassification> {
    try {
        const response = await fetch('/api/intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, hasDocument })
        });

        if (!response.ok) {
            throw new Error('Intent API failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Intent classification failed:', error);
        // Default to chat-only on error (safe fallback)
        return {
            intent: 'CHAT_ONLY',
            confidence: 0.5,
            reason: 'Fallback due to classification error'
        };
    }
}

/**
 * Main intent classification function
 * Uses quick local check first, then AI for ambiguous cases
 */
export async function classifyIntent(
    message: string,
    hasSelection: boolean,
    hasFile: boolean,
    hasDocument: boolean
): Promise<IntentClassification> {
    // Try quick local classification first
    const quickResult = quickClassify(message, hasSelection, hasFile);

    if (quickResult !== null) {
        return {
            intent: quickResult,
            confidence: 0.95,
            reason: quickResult === 'DOCUMENT_EDIT' ? 'Text selection detected' :
                quickResult === 'DOCUMENT_CREATE' ? (hasFile ? 'File upload detected' : 'Document creation keyword detected') :
                    'Chat-only pattern detected'
        };
    }

    // Use AI for ambiguous cases
    return classifyIntentWithAI(message, hasDocument);
}
