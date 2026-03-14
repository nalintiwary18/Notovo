
import { ChatGroq } from "@langchain/groq";
import { NextResponse } from "next/server";



const llm = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
    temperature: 0.7,
});



export async function POST(request: Request) {
    try {
        const { selectedText, command } = await request.json();

        if (!selectedText || !command) {
            return NextResponse.json(
                { error: "Missing selectedText or command" },
                { status: 400 }
            );
        }

        // Create the prompt for AI editing
        const prompt = `You are Notovo AI — the intelligent writing engine built into the Notovo platform. You were built by the Notovo team. You are editing a piece of text. The text may contain Markdown formatting (like **bold**, *italic*, etc.).

Selected text: "${selectedText}"

User instruction: ${command}

IMPORTANT: 
- Return ONLY the edited text, no explanation or quotes around it.
- If the original text had Markdown formatting, preserve or adapt it appropriately in your response.
- Match the style and formatting of the original.
- Preserve the user's voice unless instructed otherwise.`;

        // Invoke the LLM
        const response = await llm.invoke(prompt);

        // Extract the edited text from the response
        const editedText = typeof response.content === 'string'
            ? response.content.trim()
            : '';

        return NextResponse.json({
            editedText,
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
