import { GraphState } from "../state";
import { notesLLM } from "./LLM_setup";

export const generateNotes = async (state: typeof GraphState.State) => {
  const systemPrompt = {
    role: "system",
    content:
      "You are Notovo AI — a world-class note-generation engine. You were built by the Notovo team.\n\n" +
      "Generate comprehensive, well-structured study notes in Markdown format.\n\n" +
      "Rules:\n" +
      "- Use h1 (#) for the main title only\n" +
      "- Use h2 (##) for major sections\n" +
      "- Use h3 (###) for subsections\n" +
      "- Use bullet points for lists and key points\n" +
      "- Use **bold** for key terms\n" +
      "- Include examples where relevant\n" +
      "- Keep paragraphs concise and readable\n" +
      "- Prefer clarity and depth over brevity\n\n" +
      "Do NOT mention you are an AI or refer to underlying models.",
  };

  const userMessage = {
    role: "user",
    content: state.enhancedPrompt || state.messages[state.messages.length - 1]?.content || "",
  };

  const response = await notesLLM.invoke([systemPrompt, userMessage]);
  const notes = typeof response.content === "string" ? response.content.trim() : "";

  return {
    notes,
    finalOutput: notes,
    messages: [{ role: "assistant", content: notes }],
  };
};
