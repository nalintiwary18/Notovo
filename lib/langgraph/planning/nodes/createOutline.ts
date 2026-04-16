import { PlannerState } from "../state";
import { plannerLLM } from "./LLM_setup";

export const createOutline = async (state: typeof PlannerState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const userContent = lastMessage?.content ?? "";

  const prompt = `You are Notovo AI — a world-class educational content planner. The user has requested notes or a document.

Your task is to produce a JSON response with the following fields:
- "outline": an array of section titles (strings) that will form the document
- "difficultyLevel": one of "beginner", "intermediate", or "advanced" (infer from context)
- "stylePreference": one of "concise", "detailed", or "comprehensive" (infer from context)

The outline should have between 4 and 8 sections. Each section title should be clear and descriptive.

User request: "${userContent}"

Respond ONLY with valid JSON. No preamble, no markdown fences.

Example:
{"outline":["Introduction","Core Concepts","Key Mechanisms","Practical Applications","Summary"],"difficultyLevel":"intermediate","stylePreference":"detailed"}`;

  const response = await plannerLLM.invoke(prompt);
  const raw = typeof response.content === "string" ? response.content.trim() : "{}";

  let outline: string[] = [];
  let difficultyLevel = "intermediate";
  let stylePreference = "detailed";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      outline = Array.isArray(parsed.outline) ? parsed.outline : [];
      difficultyLevel = parsed.difficultyLevel || "intermediate";
      stylePreference = parsed.stylePreference || "detailed";
    }
  } catch {
    outline = ["Introduction", "Core Concepts", "Key Points", "Applications", "Summary"];
  }

  return {
    outline,
    remainingSections: outline,
    difficultyLevel,
    stylePreference,
  };
};
