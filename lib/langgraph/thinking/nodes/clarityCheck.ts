import { GraphState } from "../state";
import { plannerLLM } from "./LLM_setup";

export const clarityCheck = async (state: typeof GraphState.State) => {
  const prompt = `You are a quality-control reviewer for an AI note-generation system.

Evaluate the following enhanced prompt and decide if it is clear and specific enough to generate useful, structured notes.

Enhanced prompt: "${state.enhancedPrompt}"

Respond with ONLY the word: pass OR fail`;

  const response = await plannerLLM.invoke(prompt);
  const raw = typeof response.content === "string" ? response.content.trim().toLowerCase() : "pass";
  const clarityPassed = raw.startsWith("pass");

  return { clarityPassed };
};
