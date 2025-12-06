/**
 * Type declarations for @welldone-software/why-did-you-render
 */

declare module "@welldone-software/why-did-you-render" {
  import type { Component, ComponentType } from "react";

  export interface UpdateInfo {
    Component: ComponentType | typeof Component;
    displayName: string;
    hookName?: string;
    prevProps?: Record<string, unknown>;
    nextProps?: Record<string, unknown>;
    prevState?: Record<string, unknown>;
    nextState?: Record<string, unknown>;
    prevHook?: unknown;
    nextHook?: unknown;
    reason: {
      propsDifferences?: Array<{
        pathString: string;
        diffType: string;
        prevValue: unknown;
        nextValue: unknown;
      }>;
      stateDifferences?: Array<{
        pathString: string;
        diffType: string;
        prevValue: unknown;
        nextValue: unknown;
      }>;
      hookDifferences?: Array<{
        pathString: string;
        diffType: string;
        prevValue: unknown;
        nextValue: unknown;
      }>;
    };
  }

  export interface Options {
    include?: RegExp[];
    exclude?: RegExp[];
    trackAllPureComponents?: boolean;
    trackHooks?: boolean;
    trackExtraHooks?: Array<[unknown, string]>;
    logOnDifferentValues?: boolean;
    logOwnerReasons?: boolean;
    collapseGroups?: boolean;
    titleColor?: string;
    diffNameColor?: string;
    diffPathColor?: string;
    notifier?: (info: UpdateInfo) => void;
  }

  function whyDidYouRender<T>(
    react: T,
    options?: Options
  ): T;

  export default whyDidYouRender;
}

// Extend React component types to include whyDidYouRender property
declare global {
  namespace React {
    interface FunctionComponent {
      whyDidYouRender?: boolean;
    }
    interface ComponentClass {
      whyDidYouRender?: boolean;
    }
  }
}

export {};
