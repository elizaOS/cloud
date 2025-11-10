"use client";

import { useEffect } from "react";
import Joyride, { Step, CallBackProps, STATUS, EVENTS } from "react-joyride";
import { useOnboardingStore } from "@/lib/stores/onboarding-store";

const TOUR_STEPS: Step[] = [
  {
    target: "body",
    content: (
      <div>
        <h2 className="text-lg font-bold mb-2">Welcome to Eliza Cloud! 👋</h2>
        <p>
          Let's take a quick 2-minute tour to help you get started with the
          platform.
        </p>
      </div>
    ),
    placement: "center",
    disableBeacon: true,
  },
  {
    target: '[href="/dashboard"]',
    content: (
      <div>
        <h3 className="font-bold mb-1">Dashboard</h3>
        <p>Your command center for monitoring agents, usage, and metrics.</p>
      </div>
    ),
  },
  {
    target: '[href="/dashboard/character-creator"]',
    content: (
      <div>
        <h3 className="font-bold mb-1">Create Agents</h3>
        <p>
          Build custom AI agents with unique personalities, knowledge, and
          capabilities.
        </p>
      </div>
    ),
  },
  {
    target: '[href="/dashboard/chat"]',
    content: (
      <div>
        <h3 className="font-bold mb-1">Chat Playground</h3>
        <p>Test and interact with your agents in real-time conversations.</p>
      </div>
    ),
  },
  {
    target: ".credit-balance",
    content: (
      <div>
        <h3 className="font-bold mb-1">Credit Balance 💰</h3>
        <p>
          Track your credits here. You start with 50,000 free credits ($50
          value) to explore the platform!
        </p>
      </div>
    ),
  },
];

export function ProductTour() {
  const { tourCompleted, tourSkipped, setTourCompleted, setTourSkipped } =
    useOnboardingStore();

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type } = data;

    if (status === STATUS.FINISHED) {
      setTourCompleted();
    } else if (status === STATUS.SKIPPED) {
      setTourSkipped();
    }

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      console.log("[ProductTour] Step completed:", data);
    }
  };

  if (tourCompleted || tourSkipped) {
    return null;
  }

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={true}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: "#FF5800",
          textColor: "#ffffff",
          backgroundColor: "#0A0A0A",
          arrowColor: "#0A0A0A",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 0,
          border: "1px solid rgba(255, 255, 255, 0.1)",
        },
        tooltipContainer: {
          textAlign: "left",
        },
        buttonNext: {
          backgroundColor: "#FF5800",
          borderRadius: 0,
          fontSize: 14,
          padding: "8px 16px",
        },
        buttonBack: {
          color: "rgba(255, 255, 255, 0.6)",
          marginRight: 10,
        },
        buttonSkip: {
          color: "rgba(255, 255, 255, 0.4)",
        },
      }}
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        skip: "Skip tour",
      }}
    />
  );
}
