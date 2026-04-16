import { GraphState } from "../state";
import { intentLLM } from "./LLM_setup";

export const intentAnalysis = async (state: typeof GraphState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const userContent = lastMessage?.content ?? "";

  const prompt = `You are an intent classifier. Classify the user message into one of two categories:

- "notes"  → the user wants study notes, summaries, explanations, structured content, or documents generated
- "chat"   → the user wants a conversational reply, question answered briefly, or is just chatting

Respond with ONLY the word: notes OR chat

User message: "${userContent}"`;

  const response = await intentLLM.invoke(prompt);
  const raw = typeof response.content === "string" ? response.content.trim().toLowerCase() : "chat";
  const intent = raw.startsWith("notes") ? "notes" : "chat";

  return { intent };
};