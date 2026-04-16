import { NextResponse } from "next/server";
import { plannerWorkflow } from "@/lib/langgraph/planning/graph";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const result = await plannerWorkflow.invoke({ messages });

    return NextResponse.json({
      output: result.finalNotes,
      intent: result.intent,
      outline: result.outline,
    });
  } catch (error) {
    console.error("Planning pipeline error:", error);
    return NextResponse.json({ error: "Planning pipeline failed" }, { status: 500 });
  }
}
