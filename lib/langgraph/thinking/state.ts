import { Annotation } from "@langchain/langgraph";

export const GraphState = Annotation.Root({
  messages: Annotation<Array<{ role: string; content: string }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation<"chat" | "notes">({
    reducer: (_, y) => y,
    default: () => "chat",
  }),
  enhancedPrompt: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),
  clarityPassed: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  notes: Annotation<string>({
    reducer: (curr, next) => (curr ? curr + "\n\n" + next : next),
    default: () => "",
  }),
  finalOutput: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),
});