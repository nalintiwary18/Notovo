import { PlannerState } from "../state";

export const mergeFinalNotes = async (state: typeof PlannerState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const topic = lastMessage?.content ?? "Notes";

  const titleLine = `# ${topic
    .replace(/^(generate|create|write|make|give me)\s+(notes?|a document|a summary)\s+(on|about|for)?\s*/i, "")
    .trim()
    .split(" ")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")}`;

  const body = state.doneSections.filter(Boolean).join("\n\n---\n\n");

  const finalNotes = `${titleLine}\n\n${body}`;

  return {
    finalNotes,
    messages: [{ role: "assistant", content: finalNotes }],
  };
};
