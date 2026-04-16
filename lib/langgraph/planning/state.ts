import { Annotation } from "@langchain/langgraph";

export const PlannerState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "chat_only",
  }),
  outline: Annotation<string[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  doneSections: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  remainingSections: Annotation<string[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  difficultyLevel: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "intermediate",
  }),
  stylePreference: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "detailed",
  }),
  currentSectionContent: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "",
  }),
  finalNotes: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "",
  }),
});
