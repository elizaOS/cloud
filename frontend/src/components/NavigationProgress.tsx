import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import nprogress from "nprogress";

nprogress.configure({ showSpinner: false, trickleSpeed: 120 });

/**
 * Drives the nprogress bar from react-router navigation.
 * Replaces the Next.js `nextjs-toploader` we used in the legacy root layout.
 *
 * Strategy: start the bar whenever the location changes, then immediately
 * finish on the next tick. For a true "in-flight" bar we'd hook into data-router
 * navigation state, but the existing app does its own data fetching, so the
 * cheap pageview tick mirrors the previous UX.
 */
export function NavigationProgress() {
  const location = useLocation();
  const navType = useNavigationType();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    nprogress.start();
    const id = window.setTimeout(() => nprogress.done(), 250);
    return () => {
      window.clearTimeout(id);
      nprogress.done();
    };
  }, [location.pathname, location.search, navType]);

  return null;
}
