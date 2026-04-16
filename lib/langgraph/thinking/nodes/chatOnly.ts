import { GraphState } from "../state";
import { notesLLM } from "./LLM_setup";

export const chatOnly = async (state: typeof GraphState.State) => {
  const systemPrompt = {
    role: "system",
    content:
      "You are Notovo AI — a helpful, concise assistant. Reply conversationally. Use plain text only. No markdown, no bullet points, no document structure. Keep answers brief and direct.",
  };

  const response = await notesLLM.invoke([systemPrompt, ...state.messages]);
  const content = typeof response.content === "string" ? response.content.trim() : "";

  return {
    finalOutput: content,
    messages: [{ role: "assistant", content }],
  };
};
