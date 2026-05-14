import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { checkPageLimit } from "@/lib/usage";
const pdfParse = require('pdf-parse-fork');

export const runtime = "nodejs";

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

/**
 * Estimate page count from file size.
 * Avg ~50KB per PDF page, ~40KB per DOCX page.
 */
function estimatePagesFromFileSize(file: File): number {
  const bytesPerPage = file.name.toLowerCase().endsWith('.pdf') ? 50_000 : 40_000;
  return Math.max(1, Math.ceil(file.size / bytesPerPage));
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = (formData.get("userId") as string | null) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // ── PAGE LIMIT CHECK (before reading the file — security first) ──────────
    if (userId) {
      const estimatedPages = estimatePagesFromFileSize(file);
      const pageCheck = await checkPageLimit(userId, estimatedPages);
      if (!pageCheck.allowed) {
        return NextResponse.json(
          { error: pageCheck.code, message: pageCheck.message },
          { status: 403 }
        );
      }
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e) {
      console.error("Failed to read file buffer:", e);
      return NextResponse.json({ error: "Failed to read uploaded file" }, { status: 400 });
    }

    // Extract text from the uploaded document
    let extractedText = "";
    try {
      extractedText = await extractText(file, buffer);
    } catch (e: unknown) {
      console.error("Text extraction error:", e);
      const message = typeof e === "object" && e !== null && "message" in e ? String((e as { message?: unknown }).message) : "Unsupported or unreadable file";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    console.error("File parsing route error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
