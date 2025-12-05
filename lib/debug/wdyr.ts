/**
 * Why Did You Render (WDYR) Configuration
 * 
 * This must be imported BEFORE React in development mode.
 * It patches React to log why components re-rendered.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Install: bun add -D @welldone-software/why-did-you-render
 * 2. Import this file at the TOP of app/layout.tsx (before any React imports)
 * 
 * Example in app/layout.tsx:
 *   import "@/lib/debug/wdyr"; // Must be first!
 *   import * as React from "react";
 *   // ... rest of imports
 * 
 * To track a specific component, add:
 *   MyComponent.whyDidYouRender = true;
 * 
 * Or wrap with memo and set displayName:
 *   const MyComponent = memo(function MyComponent() { ... });
 *   MyComponent.whyDidYouRender = true;
 */

import * as React from "react";

if (
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined"
) {
  // Dynamic import to avoid bundling in production
  const whyDidYouRender = require("@welldone-software/why-did-you-render");
  
  whyDidYouRender(React, {
    // Track all pure components by default
    trackAllPureComponents: true,
    
    // Also track all hooks (useState, useReducer, useMemo, etc.)
    trackHooks: true,
    
    // Track extra hooks from additional libraries
    trackExtraHooks: [
      // Zustand store hooks
      ["zustand", "useStore"],
    ],
    
    // Log to console with detailed info
    logOnDifferentValues: true,
    
    // Custom logger for better formatting
    notifier: (updateInfo) => {
      console.group(
        `%c🔄 ${updateInfo.displayName} re-rendered`,
        "color: #f97316; font-weight: bold;"
      );
      
      if (updateInfo.reason.propsDifferences) {
        console.log("Props changed:", updateInfo.reason.propsDifferences);
      }
      
      if (updateInfo.reason.stateDifferences) {
        console.log("State changed:", updateInfo.reason.stateDifferences);
      }
      
      if (updateInfo.reason.hookDifferences) {
        console.log("Hook value changed:", updateInfo.reason.hookDifferences);
      }
      
      console.groupEnd();
    },
  });
  
  console.log(
    "🔍 [WDYR] Why Did You Render is enabled.",
    "\n  Add `.whyDidYouRender = true` to components you want to track."
  );
}

// Export a helper to mark components
export function trackRenders<T extends React.ComponentType>(
  Component: T,
  displayName?: string
): T {
  if (process.env.NODE_ENV === "development") {
    (Component as T & { whyDidYouRender?: boolean; displayName?: string }).whyDidYouRender = true;
    if (displayName) {
      (Component as T & { displayName?: string }).displayName = displayName;
    }
  }
  return Component;
}

