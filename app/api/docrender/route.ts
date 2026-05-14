
import { ChatGroq } from "@langchain/groq";
import { NextResponse } from "next/server";
import {
    checkTokenLimit,
    checkEditLimit,
    incrementTokenUsage,
    incrementEditCount,
    estimateTokens,
} from "@/lib/usage";



const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-20b",
    temperature: 0.7,
});



export async function POST(request: Request) {
    try {
        const { selectedText, command, userId, useThinking } = await request.json();

        if (!selectedText || !command) {
            return NextResponse.json(
                { error: "Missing selectedText or command" },
                { status: 400 }
            );
        }

        // ── TOKEN LIMIT CHECK ─────────────────────────────────────────────────
        if (userId) {
            const tokenCheck = await checkTokenLimit(userId);
            if (!tokenCheck.allowed) {
                return NextResponse.json(
                    { error: tokenCheck.code, message: tokenCheck.message, usage: tokenCheck.usage },
                    { status: 429 }
                );
            }
        }

        // ── DAILY EDIT LIMIT CHECK ────────────────────────────────────────────
        if (userId) {
            const editCheck = await checkEditLimit(userId);
            if (!editCheck.allowed) {
                return NextResponse.json(
                    { error: editCheck.code, message: editCheck.message },
                    { status: 429 }
                );
            }
        }

        // Build prompt — optionally wrap with Think Mode instructions
        const basePrompt = `You are Notovo AI — the intelligent writing engine built into the Notovo platform. You were built by the Notovo team. You are editing a piece of text. The text may contain Markdown formatting (like **bold**, *italic*, etc.).

Selected text: "${selectedText}"

User instruction: ${command}

IMPORTANT: 
- Return ONLY the edited text, no explanation or quotes around it.
- If the original text had Markdown formatting, preserve or adapt it appropriately in your response.
- Match the style and formatting of the original.
- Preserve the user's voice unless instructed otherwise.`;

        const THINK_EDIT_SUFFIX = `

IMPORTANT OVERRIDE: You are in Think Mode. Respond ONLY in this exact format:
<reasoning_summary>1-3 short user-friendly sentences on what you focused on. No jargon, no steps.</reasoning_summary>
<answer>The edited text only, no extra text</answer>`;

        const prompt = useThinking ? basePrompt + THINK_EDIT_SUFFIX : basePrompt;

        // Invoke the LLM
        const response = await llm.invoke(prompt);

        // Extract response — handle Think Mode XML tags vs plain text
        let editedText: string;
        let reasoningSummary: string | undefined;

        const rawContent = typeof response.content === 'string' ? response.content.trim() : '';

        if (useThinking) {
            const summaryMatch = rawContent.match(/<reasoning_summary>([\/\s\S]*?)<\/reasoning_summary>/);
            const answerMatch  = rawContent.match(/<answer>([\/\s\S]*?)<\/answer>/);
            // Failsafe: if no XML tags found, treat entire output as editedText
            editedText = answerMatch ? answerMatch[1].trim() : rawContent;
            reasoningSummary = summaryMatch
                ? summaryMatch[1].trim().split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')
                : undefined;
        } else {
            editedText = rawContent;
        }

        // ── TOKEN TRACKING + EDIT COUNT (fire-and-forget after success) ───────
        if (userId) {
            const inputTokens = estimateTokens(prompt);
            const outputTokens = estimateTokens(editedText);
            incrementTokenUsage(userId, inputTokens + outputTokens).catch(console.error);
            incrementEditCount(userId).catch(console.error);
        }

        return NextResponse.json({
            editedText,
            reasoningSummary,  // undefined when Think Mode is off — frontend ignores it
            success: true
        });

    } catch (error) {
        console.error("Error processing AI edit:", error);
        return NextResponse.json(
            { error: "Failed to process AI command" },
            { status: 500 }
        );
    }
}
