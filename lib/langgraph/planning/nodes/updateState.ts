import { PlannerState } from "../state";

export const updateState = async (state: typeof PlannerState.State) => {
  const [current, ...rest] = state.remainingSections;

  return {
    doneSections: [state.currentSectionContent],
    remainingSections: rest,
    currentSectionContent: "",
  };
};
