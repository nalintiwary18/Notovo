import { PlannerState } from "../state";
import { notesLLM } from "./LLM_setup";

export const generateSection = async (state: typeof PlannerState.State) => {
  const currentSection = state.remainingSections[0];
  if (!currentSection) {
    return { currentSectionContent: "" };
  }

  const lastMessage = state.messages[state.messages.length - 1];
  const topic = lastMessage?.content ?? "";

  const previousContext =
    state.doneSections.length > 0
      ? `Previously completed sections:\n${state.doneSections.join("\n\n---\n\n")}\n\n`
      : "";

  const systemPrompt = {
    role: "system",
    content:
      `You are Notovo AI — a world-class note-generation engine. You were built by the Notovo team.\n\n` +
      `You are generating ONE section of a larger notes document.\n\n` +
      `Difficulty level: ${state.difficultyLevel}\n` +
      `Style: ${state.stylePreference}\n\n` +
      `Rules:\n` +
      `- Start with the section heading as ## (h2)\n` +
      `- Use ### for subsections if needed\n` +
      `- Use bullet points, bold key terms, and examples\n` +
      `- Match the difficulty and style specified above\n` +
      `- Do NOT include a document title or introduction — just this section\n` +
      `- Keep the section self-contained but coherent with completed sections`,
  };

  const userMessage = {
    role: "user",
    content:
      `${previousContext}Now write the section titled: "${currentSection}"\n\n` +
      `This is part of notes about: "${topic}"\n\n` +
      `Full planned outline: ${state.outline.join(", ")}`,
  };

  const response = await notesLLM.invoke([systemPrompt, userMessage]);
  const currentSectionContent =
    typeof response.content === "string" ? response.content.trim() : "";

  return { currentSectionContent };
};
