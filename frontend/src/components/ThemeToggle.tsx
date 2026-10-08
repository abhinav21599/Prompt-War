import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/theme-context";
import { cn } from "@/lib/utils";

/**
 * Light / dark switch for the navigation. The knob slides between a day and an
 * orbital-night state; theme tokens cross-fade without a reload.
 */
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-7 w-[3.25rem] items-center rounded-full border border-border",
        "bg-surface transition-colors duration-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span
        className={cn(
          "absolute flex size-5 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-panel",
          "transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isDark ? "translate-x-[1.625rem]" : "translate-x-[0.1875rem]",
        )}
      >
        {isDark ? (
          <Moon className="size-3" strokeWidth={2} />
        ) : (
          <Sun className="size-3" strokeWidth={2} />
        )}
      </span>
    </button>
  );
};

export default ThemeToggle;
