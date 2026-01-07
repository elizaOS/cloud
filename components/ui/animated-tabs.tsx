"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface Tab {
  value: string;
  label: string;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  variant?: "default" | "orange";
  fullWidth?: boolean;
}

export function AnimatedTabs({ tabs, value, onValueChange, variant = "default", fullWidth = false }: AnimatedTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, visible: false, animate: true });

  const isOrange = variant === "orange";

  const updateIndicator = useCallback((shouldAnimate: boolean = true) => {
    const container = containerRef.current;
    if (!container) return;

    const activeIndex = tabs.findIndex((tab) => tab.value === value);
    const buttons = container.querySelectorAll("button");
    const activeButton = buttons[activeIndex];

    if (activeButton) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      setIndicatorStyle((prev) => ({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
        visible: true,
        animate: shouldAnimate && prev.visible,
      }));
    } else {
      setIndicatorStyle((prev) => ({ ...prev, visible: false }));
    }
  }, [tabs, value]);

  // Update indicator on value/tabs change
  useEffect(() => {
    updateIndicator(true);
  }, [updateIndicator]);

  // Update indicator on resize (without animation)
  useEffect(() => {
    const handleResize = () => {
      updateIndicator(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? "flex w-full" : "inline-flex"} items-center gap-0.5 p-1 rounded-full bg-white/5 border border-white/10`}
    >
      {/* Animated indicator */}
      <div
        className={`absolute top-1 bottom-1 rounded-full ease-out ${isOrange ? "bg-[#FF5800]" : "bg-white"}`}
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          opacity: indicatorStyle.visible ? 1 : 0,
          transition: indicatorStyle.animate ? "all 300ms ease-out" : "opacity 300ms ease-out",
        }}
      />

      {/* Tab buttons */}
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={`relative z-10 px-3 py-1.5 text-sm font-medium rounded-full transition-colors duration-300 ${
            fullWidth ? "flex-1 text-center" : ""
          } ${
            value === tab.value
              ? isOrange ? "text-white" : "text-black"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
