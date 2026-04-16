import { PlannerState } from "../state";
import { intentLLM } from "./LLM_setup";

export const plannerIntent = async (state: typeof PlannerState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const userContent = lastMessage?.content ?? "";

  const prompt = `You are an intent classifier for a note-generation planning system. Classify the user message into one of two categories:

- "notes_generation" → the user wants notes, summaries, structured documents, or study materials generated
- "chat_only"        → the user wants a conversational reply or is just chatting

Respond with ONLY one of: notes_generation OR chat_only

User message: "${userContent}"`;

  const response = await intentLLM.invoke(prompt);
  const raw = typeof response.content === "string" ? response.content.trim().toLowerCase() : "chat_only";
  const intent = raw.includes("notes_generation") ? "notes_generation" : "chat_only";

  return { intent };
};
