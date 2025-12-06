"use client";

/**
 * Development Provider
 * 
 * This provider initializes development tools like why-did-you-render
 * and render tracking utilities. It only runs in development mode.
 * 
 * In production, this component just renders its children with no overhead.
 */

import { useEffect } from "react";

import { useRenderTracking, useWhyDidUpdate } from "@/lib/dev/render-tracking";

interface DevProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that initializes development tools
 */
export function DevProvider({ children }: DevProviderProps) {
  useEffect(() => {
    // Only initialize in development
    if (process.env.NODE_ENV !== "development") return;

    // Note: WDYR disabled due to hook order issues with React 18+ strict mode
    // Using our own render tracking instead
    console.log(
      "%c🛠️ Development tools ready",
      "color: #10b981; font-weight: bold;",
      "\n  Console commands:",
      "\n    __logRenderStats__()       - Show render statistics",
      "\n    __clearRenderStats__()     - Clear render statistics",
      "\n    __renderStats__()          - Get raw render data",
      "\n    __setRenderLogLevel__(lvl) - Set log level: 'silent' | 'warn' | 'error' | 'verbose'"
    );

    // Intercept React's infinite loop errors with helpful tips
    const originalError = console.error;
    let errorInterceptActive = true;
    
    console.error = (...args: Parameters<typeof console.error>) => {
      if (!errorInterceptActive) {
        return originalError.apply(console, args);
      }
      
      const message = args[0];
      if (
        typeof message === "string" &&
        (message.includes("Maximum update depth exceeded") ||
          message.includes("Too many re-renders"))
      ) {
        // Prevent recursion
        errorInterceptActive = false;
        
        console.group("🚨 React Render Loop Detected!");
        originalError.apply(console, args);
        console.log("\n💡 Common causes:");
        console.log("  • State update in useEffect without proper dependencies");
        console.log("  • Inline object/array/function as prop (use useMemo/useCallback)");
        console.log("  • State update that triggers re-render that updates same state");
        console.log("\n💡 Debug tips:");
        console.log("  • Run __logRenderStats__() to see which components re-render most");
        console.log("  • Add useRenderTracking('ComponentName') to suspect components");
        console.groupEnd();
        
        errorInterceptActive = true;
        return;
      }
      
      return originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return children;
}

/**
 * HOC to wrap a component with render tracking
 * 
 * In production, this returns the original component unchanged.
 * In development, it wraps the component with tracking hooks.
 * 
 * @param Component - The component to wrap
 * @param displayName - Name to display in tracking logs
 * 
 * @example
 * ```tsx
 * function MyComponent(props: Props) {
 *   return <div>{props.title}</div>;
 * }
 * 
 * export default withRenderTracking(MyComponent, "MyComponent");
 * ```
 */
export function withRenderTracking<P extends object>(
  Component: React.ComponentType<P>,
  displayName: string
): React.ComponentType<P> {
  // Production: return original component unchanged
  if (process.env.NODE_ENV !== "development") {
    return Component;
  }

  // Development: wrap with tracking
  function WrappedComponent(props: P) {
    useRenderTracking(displayName);
    useWhyDidUpdate(displayName, props as Record<string, unknown>);

    return <Component {...props} />;
  }

  WrappedComponent.displayName = `Tracked(${displayName})`;

  // Mark for WDYR tracking
  (WrappedComponent as React.FC & { whyDidYouRender?: boolean }).whyDidYouRender = true;

  return WrappedComponent;
}
