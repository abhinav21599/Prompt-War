import { Waves } from "lucide-react";
import { Link } from "react-router-dom";

import ThemeToggle from "@/components/ThemeToggle";

/** Minimal top bar: wordmark, live system status and the theme switch. */
const Header = () => {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4 lg:px-10">
      <div className="flex items-center gap-2.5">
        <Waves className="size-5 text-primary" strokeWidth={1.75} />
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
          OilTrace<span className="text-primary"> AI</span>
        </span>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">

        <ThemeToggle />
      </div>
    </header>
  );
};


export default Header;
