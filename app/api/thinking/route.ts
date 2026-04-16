import { NextResponse } from "next/server";
import { thinkingWorkflow } from "@/lib/langgraph/thinking/graph";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const result = await thinkingWorkflow.invoke({ messages });

    return NextResponse.json({
      output: result.finalOutput,
      intent: result.intent,
      notes: result.notes,
    });
  } catch (error) {
    console.error("Thinking pipeline error:", error);
    return NextResponse.json({ error: "Thinking pipeline failed" }, { status: 500 });
  }
}
