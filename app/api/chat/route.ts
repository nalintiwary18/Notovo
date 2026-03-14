
import { ChatGroq } from "@langchain/groq";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { BaseMessage } from "@langchain/core/messages";
const pdfParse = require('pdf-parse-fork');

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "openai/gpt-oss-120b",
  temperature: 0.7,
});


export const runtime = "nodejs";

type ChatMessage = { role: string; content: string };

interface StreamChunk {
  content: string | ContentBlock[];
}

interface ContentBlock {
  text?: string;
}

// PDF parsing with retry for first-time initialization
async function parsePdfWithRetry(buffer: Buffer, maxRetries = 2): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await pdfParse(buffer);

      if (!data.text) {
        throw new Error("PDF contains no extractable text.");
      }
      return data.text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`PDF Parsing attempt ${attempt}/${maxRetries} failed:`, error);

      // Small delay before retry to allow initialization to complete
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  throw new Error(`Failed to parse PDF file after ${maxRetries} attempts: ${lastError?.message}`);
}

async function extractText(file: File, buffer: Buffer) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".pdf")) {
    return await parsePdfWithRetry(buffer);
  }

  if (fileName.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error("Unsupported file type");
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  console.log("Content-Type:", contentType);

  let messages: ChatMessage[];
  let extractedText = "";

  if (contentType.includes("multipart/form-data")) {
    // Handle file upload with chat
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      console.log("No file found in formData");
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e) {
      console.log("Failed to read file:", e);
      return NextResponse.json({ error: "Failed to read uploaded file" }, { status: 400 });
    }

    // Parse messages from form data
    const rawMessages = formData.get("messages");
    console.log("Raw messages from form data:", rawMessages);

    if (typeof rawMessages !== "string") {
      console.log("Messages field is not a string:", typeof rawMessages);
      return new Response("Bad Request: messages field (JSON string) required", { status: 400 });
    }

    try {
      const parsed: unknown = JSON.parse(rawMessages);
      console.log("Parsed messages:", parsed);

      if (!Array.isArray(parsed)) {
        console.log("Parsed messages is not an array:", typeof parsed);
        return new Response("Bad Request: messages must be an array", { status: 400 });
      }

      messages = parsed
        .map((m: unknown) => {
          if (
            typeof m === "object" &&
            m !== null &&
            "role" in m &&
            "content" in m &&
            typeof (m as { role: unknown }).role === "string" &&
            typeof (m as { content: unknown }).content === "string"
          ) {
            return m as ChatMessage;
          }
          return null;
        })
        .filter((m: ChatMessage | null): m is ChatMessage => m !== null);

      console.log("Filtered messages:", messages);

      if (messages.length === 0) {
        console.log("No valid messages found");
        return new Response("Bad Request: messages array is empty or invalid", { status: 400 });
      }
    } catch (e) {
      console.log("JSON parse error:", e);
      return new Response("Bad Request: messages must be valid JSON", { status: 400 });
    }

    // Extract text from the uploaded document
    try {
      extractedText = await extractText(file, buffer);
      console.log("Extracted text length:", extractedText.length);
    } catch (e: unknown) {
      console.log("Text extraction error:", e);
      const message = typeof e === "object" && e !== null && "message" in e ? String((e as { message?: unknown }).message) : "Unsupported or unreadable file";
      return NextResponse.json({ error: message }, { status: 400 });
    }

  } else if (contentType.includes("application/json")) {
    // Handle regular chat without file
    try {
      const body = await req.json();
      console.log("JSON body:", body);
      messages = body.messages;

      if (!Array.isArray(messages) || messages.length === 0) {
        console.log("Invalid messages array:", messages);
        return new Response("Bad Request: messages array required", { status: 400 });
      }
    } catch (e) {
      console.log("JSON parsing error:", e);
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }
  } else {
    console.log("Unsupported content type:", contentType);
    return new Response("Bad Request: Content-Type must be application/json or multipart/form-data", { status: 400 });
  }

  console.log("Final messages count:", messages.length);

  const NOTOVO_AI_SYSTEM_PROMPT = `You are Notovo AI — the intelligent writing engine built into the Notovo platform.

Your purpose is to help users think clearly, write better, and refine structured documents with precision.

Core Traits:
- Professional but approachable
- Concise but insightful
- Structured in responses
- Never robotic
- Never generic

Capabilities:
- Generate structured documents
- Rewrite and refine text
- Improve clarity and tone
- Expand or compress content
- Suggest improvements
- Assist with brainstorming
- Maintain formatting awareness

Identity Rules:
- Your name is "Notovo AI".
- You were built by the Notovo team.
- Do NOT say you are ChatGPT, Claude, or any other AI product.
- Do NOT say you were created by OpenAI, Anthropic, Google, or any other provider.
- Do NOT mention underlying model providers unless explicitly asked.
- If asked who made you, respond: "I am Notovo AI, built by the Notovo team."
- If asked what model or architecture you run on, respond EXACTLY: "Notovo AI is powered by advanced large-language models and proprietary orchestration systems developed by the Notovo team." Do NOT elaborate further or invent technical details.

Behavior Rules:
- Default to structured formatting (headings, bullet points, clarity).
- Avoid filler phrases like "As an AI language model..."
- Be confident, not apologetic.
- When editing, preserve the user's voice unless instructed otherwise.
- When generating documents, follow A4-style clean formatting.
- When unsure, ask for clarification briefly and intelligently.

Tone: Clear. Focused. Premium. Minimal fluff.`;

  const systemContent = extractedText
    ? `${NOTOVO_AI_SYSTEM_PROMPT}\n\nThe user has provided the following document. Use it to answer questions and generate content. Format information clearly without markdown table separators.\n\n---\n${extractedText.slice(0, 15000)}`
    : NOTOVO_AI_SYSTEM_PROMPT;

  const messagesWithContext: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...messages,
  ];

  try {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of await llm.stream(messagesWithContext as unknown as BaseMessage[])) {
            const streamChunk = chunk as StreamChunk;
            const content =
              typeof streamChunk.content === "string"
                ? streamChunk.content
                : streamChunk.content
                  .map((block: ContentBlock) => {
                    if (typeof block === "string") return block;
                    return block.text || "";
                  })
                  .join("");

            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          console.log("Streaming error:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",

      },
    });
  } catch (e) {
    console.log("Stream creation error:", e);
    return new Response("Failed to process chat request", { status: 500 });
  }
}
