import { motion } from "framer-motion";
import { ArrowRight, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";

const reveal = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

const transition = { duration: 0.55, ease: [0.4, 0, 0.2, 1] as const };

interface HeroProps {
  onStartInvestigation: () => void;
  isTransitioning?: boolean;
}

/** Primary value proposition of the platform. */
const Hero = ({ onStartInvestigation, isTransitioning = false }: HeroProps) => {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      transition={{ staggerChildren: 0.09 }}
      className="max-w-xl"
    >
      <motion.div
        variants={reveal}
        transition={transition}
        className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1.5"
      >
        <Radar className="size-3.5 text-primary" strokeWidth={1.75} />
        <span className="text-label">Maritime intelligence</span>
      </motion.div>

      <motion.h1
        variants={reveal}
        transition={transition}
        className="mt-7 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
      >
        TRACE THE SPILL.
        <br />
        <span className="text-primary">FIND THE SOURCE.</span>
      </motion.h1>

      <motion.p
        variants={reveal}
        transition={transition}
        className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground"
      >
        AI-powered maritime intelligence for oil spill detection, source
        attribution and drift prediction.
      </motion.p>

      <motion.div
        variants={reveal}
        transition={transition}
        className="mt-9 flex flex-col gap-3 sm:flex-row"
      >
        <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }}>
          <Button
            variant="command"
            size="xl"
            type="button"
            className="w-full sm:w-auto"
            onClick={onStartInvestigation}
            disabled={isTransitioning}
          >
            Start Investigation
            <ArrowRight />
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Hero;
