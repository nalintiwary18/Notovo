import { StateGraph, START, END } from "@langchain/langgraph";
import { GraphState } from "./state";
import { intentAnalysis } from "./nodes/intentAnalysis";
import { promptEnhancement } from "./nodes/promptEnhancement";
import { clarityCheck } from "./nodes/clarityCheck";
import { generateNotes } from "./nodes/generateNotes";
import { chatOnly } from "./nodes/chatOnly";

export const thinkingWorkflow = new StateGraph(GraphState)
  .addNode("intent_analysis", intentAnalysis)
  .addNode("prompt_enhancement", promptEnhancement)
  .addNode("clarity_check", clarityCheck)
  .addNode("generate_notes", generateNotes)
  .addNode("chat_only", chatOnly)

  .addEdge(START, "intent_analysis")

  .addConditionalEdges("intent_analysis", (state) =>
    state.intent === "notes" ? "prompt_enhancement" : "chat_only"
  )

  .addEdge("prompt_enhancement", "clarity_check")

  .addConditionalEdges("clarity_check", (state) =>
    state.clarityPassed ? "generate_notes" : "generate_notes"
  )

  .addEdge("generate_notes", END)
  .addEdge("chat_only", END)

  .compile();
