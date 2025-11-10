import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChecklistItem {
  id: string;
  label: string;
  url: string;
  completed: boolean;
}

interface OnboardingState {
  tourCompleted: boolean;
  tourSkipped: boolean;
  checklistDismissed: boolean;
  checklistItems: ChecklistItem[];
  setTourCompleted: () => void;
  setTourSkipped: () => void;
  dismissChecklist: () => void;
  completeChecklistItem: (id: string) => void;
  restartTour: () => void;
}

const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "profile_complete",
    label: "Complete your profile",
    url: "/dashboard/account",
    completed: false,
  },
  {
    id: "first_agent",
    label: "Create your first agent",
    url: "/dashboard/character-creator",
    completed: false,
  },
  {
    id: "test_chat",
    label: "Test agent in chat",
    url: "/dashboard/chat",
    completed: false,
  },
  {
    id: "generate_image",
    label: "Generate an image",
    url: "/dashboard/image",
    completed: false,
  },
  {
    id: "api_key_created",
    label: "Generate API key",
    url: "/dashboard/api-keys",
    completed: false,
  },
];

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      tourCompleted: false,
      tourSkipped: false,
      checklistDismissed: false,
      checklistItems: DEFAULT_CHECKLIST_ITEMS,

      setTourCompleted: () => set({ tourCompleted: true }),

      setTourSkipped: () => set({ tourSkipped: true }),

      dismissChecklist: () => set({ checklistDismissed: true }),

      completeChecklistItem: (id: string) =>
        set((state) => ({
          checklistItems: state.checklistItems.map((item) =>
            item.id === id ? { ...item, completed: true } : item,
          ),
        })),

      restartTour: () =>
        set({
          tourCompleted: false,
          tourSkipped: false,
          checklistDismissed: false,
          checklistItems: DEFAULT_CHECKLIST_ITEMS,
        }),
    }),
    {
      name: "eliza-onboarding-storage",
    },
  ),
);
