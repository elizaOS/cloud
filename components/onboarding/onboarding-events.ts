export const ONBOARDING_STEP_IDS = {
  TEST_AGENT: "test",
  ADD_KNOWLEDGE: "knowledge",
  CONFIGURE_API_KEYS: "api-keys",
  DEPLOY_AGENT: "deploy",
  EDIT_CUSTOMIZE: "edit",
} as const;

export type OnboardingStepId =
  (typeof ONBOARDING_STEP_IDS)[keyof typeof ONBOARDING_STEP_IDS];

const ONBOARDING_EVENT_NAME = "onboarding-step-complete";

interface OnboardingStepCompleteDetail {
  stepId: OnboardingStepId;
  agentId?: string;
}

export function dispatchOnboardingComplete(
  stepId: OnboardingStepId,
  agentId?: string,
): void {
  if (typeof window === "undefined") return;

  const event = new CustomEvent<OnboardingStepCompleteDetail>(
    ONBOARDING_EVENT_NAME,
    {
      detail: { stepId, agentId },
      bubbles: true,
    },
  );
  window.dispatchEvent(event);
}

export function subscribeToOnboardingEvents(
  callback: (detail: OnboardingStepCompleteDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<OnboardingStepCompleteDetail>;
    callback(customEvent.detail);
  };

  window.addEventListener(ONBOARDING_EVENT_NAME, handler);
  return () => window.removeEventListener(ONBOARDING_EVENT_NAME, handler);
}
