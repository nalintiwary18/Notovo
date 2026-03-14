import { ChatGroq } from "@langchain/groq";
import { NextResponse } from "next/server";

const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
    temperature: 0.1,  // Low temp for classification
});

interface IntentRequest {
    message: string;
    hasDocument: boolean;
}

export async function POST(request: Request) {
    try {
        const { message, hasDocument }: IntentRequest = await request.json();

        if (!message) {
            return NextResponse.json(
                { error: "Missing message" },
                { status: 400 }
            );
        }

        const prompt = `You are an intent classifier for Notovo AI — an intelligent writing engine built into the Notovo platform. Classify the user's message into one of three intents:

1. CHAT_ONLY - The user wants to chat, ask questions, or get information WITHOUT creating/modifying a document. Examples: greetings, general questions, asking about capabilities, "how are you", "what can you do".

2. DOCUMENT_CREATE - The user wants to ADD or GENERATE NEW content for a document. This includes:
   - "create notes about X", "summarize this", "write about Y"
   - "add information about Z", "also add X", "add a section on Y"
   - "include details about", "add new version", "how to use X"
   - ANY request to ADD, APPEND, or CREATE new content goes here

3. DOCUMENT_EDIT - The user wants to MODIFY or CHANGE EXISTING text that they have SELECTED in the document. This requires text to already be selected. Examples: "make this shorter", "rewrite this paragraph", "fix the grammar". If the user hasn't selected text, they probably mean DOCUMENT_CREATE instead.

IMPORTANT: "add" or "also add" almost always means DOCUMENT_CREATE (adding new content), NOT DOCUMENT_EDIT.

Context:
- User has existing document: ${hasDocument ? 'Yes' : 'No'}

User message: "${message}"

Respond in JSON format only:
{
  "intent": "CHAT_ONLY" | "DOCUMENT_CREATE" | "DOCUMENT_EDIT",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

        const response = await llm.invoke(prompt);

        const content = typeof response.content === 'string'
            ? response.content.trim()
            : '';

        // Parse the JSON response
        try {
            // Extract JSON from potential markdown code blocks
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return NextResponse.json({
                    intent: parsed.intent || 'CHAT_ONLY',
                    confidence: parsed.confidence || 0.7,
                    reason: parsed.reason || 'AI classification'
                });
            }
        } catch {
            console.error('Failed to parse intent response:', content);
        }

        // Fallback if parsing fails
        return NextResponse.json({
            intent: 'CHAT_ONLY',
            confidence: 0.5,
            reason: 'Fallback - could not parse AI response'
        });

    } catch (error) {
        console.error("Error classifying intent:", error);
        return NextResponse.json(
            { error: "Failed to classify intent" },
            { status: 500 }
        );
    }
}
