import { GraphState } from "../state";
import { plannerLLM } from "./LLM_setup";

export const promptEnhancement = async (state: typeof GraphState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const userContent = lastMessage?.content ?? "";

  const prompt = `You are a prompt engineer for Notovo AI. A user has asked for notes or a document to be generated.

Your job is to rewrite and enhance their request into a clear, structured prompt that will guide an AI to produce high-quality, well-organised study notes.

Enhance the prompt to:
- Specify the desired depth (beginner / intermediate / advanced) based on context
- Name the key sections or topics that should be covered
- Request use of examples where appropriate
- Specify the output should be in structured markdown

Original request: "${userContent}"

Return ONLY the enhanced prompt. No preamble, no explanation.`;

  const response = await plannerLLM.invoke(prompt);
  const enhancedPrompt = typeof response.content === "string" ? response.content.trim() : userContent;

  return { enhancedPrompt };
};
