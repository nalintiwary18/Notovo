import { StateGraph, START, END } from "@langchain/langgraph";
import { PlannerState } from "./state";
import { plannerIntent } from "./nodes/plannerIntent";
import { createOutline } from "./nodes/createOutline";
import { generateSection } from "./nodes/generateSection";
import { updateState } from "./nodes/updateState";
import { mergeFinalNotes } from "./nodes/mergeFinalNotes";
import { plannerChatOnly } from "./nodes/plannerChatOnly";

export const plannerWorkflow = new StateGraph(PlannerState)
  .addNode("planner_intent", plannerIntent)
  .addNode("create_outline", createOutline)
  .addNode("generate_section", generateSection)
  .addNode("update_state", updateState)
  .addNode("merge_final_notes", mergeFinalNotes)
  .addNode("chat_only", plannerChatOnly)

  .addEdge(START, "planner_intent")

  .addConditionalEdges("planner_intent", (state) =>
    state.intent === "notes_generation" ? "create_outline" : "chat_only"
  )

  .addEdge("create_outline", "generate_section")
  .addEdge("generate_section", "update_state")

  .addConditionalEdges("update_state", (state) =>
    state.remainingSections.length > 0 ? "generate_section" : "merge_final_notes"
  )

  .addEdge("merge_final_notes", END)
  .addEdge("chat_only", END)

  .compile();
