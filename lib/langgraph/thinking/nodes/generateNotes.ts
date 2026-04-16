import { GraphState } from "../state";
import { notesLLM } from "./LLM_setup";

export const generateNotes = async (state: typeof GraphState.State) => {
  const systemPrompt = {
    role: "system",
    content: [
      "You are Notovo AI — a world-class note-generation engine built by the Notovo team.",
      "Generate comprehensive, well-structured study notes in strict Markdown format.",
      "",
      "MANDATORY FORMATTING RULES — follow exactly:",
      "- Start with a single # for the main title (no sub-bullets under it)",
      "- Use ## for major sections (e.g., ## Introduction, ## Core Concepts)",
      "- Use ### for subsections within major sections",
      "- Use **bold** for key terms and important phrases",
      "- Use *italic* sparingly for definitions or emphasis",
      "- Use - bullet lists for grouped facts, properties, or steps",
      "- Use numbered lists (1. 2. 3.) for sequential processes or ranked items",
      "- Use > blockquotes for important callouts, warnings, or key takeaways",
      "- Separate ALL sections with a blank line",
      "- Do NOT use HTML tags",
      "- Do NOT use plain text without any structure",
      "",
      "CONTENT RULES:",
      "- Cover the topic thoroughly with real examples",
      "- Match depth to the complexity of the topic",
      "- End with a ## Summary or ## Key Takeaways section",
      "- Do NOT mention being an AI or underlying models",
    ].join("\n"),
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
