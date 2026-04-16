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
      ? `Previously completed sections for context:\n${state.doneSections.join("\n\n")}\n\n`
      : "";

  const systemPrompt = {
    role: "system",
    content: [
      "You are Notovo AI — a world-class note-generation engine built by the Notovo team.",
      `You are generating ONE section of a multi-section notes document.`,
      `Difficulty level: ${state.difficultyLevel}`,
      `Style: ${state.stylePreference}`,
      "",
      "MANDATORY FORMATTING RULES — follow exactly:",
      "- Start with ## followed by the section title (e.g. ## Core Concepts)",
      "- Use ### for subsections within this section",
      "- Use **bold** for key terms and important phrases",
      "- Use *italic* sparingly for definitions",
      "- Use - bullet lists for grouped facts or properties",
      "- Use numbered lists for sequential steps",
      "- Use > blockquotes for key takeaways or callouts",
      "- Separate sub-sections with a blank line",
      "- Do NOT include the overall document title",
      "- Do NOT include content from other sections",
      "- Do NOT use HTML tags",
    ].join("\n"),
  };

  const userMessage = {
    role: "user",
    content:
      `${previousContext}Write the section titled: "${currentSection}"\n\n` +
      `This is part of a notes document about: "${topic}"\n` +
      `Full planned outline: ${state.outline.join(" → ")}`,
  };

  const response = await notesLLM.invoke([systemPrompt, userMessage]);
  const currentSectionContent =
    typeof response.content === "string" ? response.content.trim() : "";

  return { currentSectionContent };
};
