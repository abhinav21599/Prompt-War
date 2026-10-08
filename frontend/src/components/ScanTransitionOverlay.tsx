import { motion } from "framer-motion";
import { Radar } from "lucide-react";

interface ScanTransitionOverlayProps {
  /** Label of the detection being opened, shown while the scan sweeps. */
  label?: string;
}

/**
 * A calm blue scanning wash that covers the screen at the end of the
 * START INVESTIGATION transition, just before the route changes.
 */
const ScanTransitionOverlay = ({ label }: ScanTransitionOverlayProps) => {
  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent opacity-40" />

      <div className="absolute inset-x-0 top-0 h-full pointer-events-none">
        <div className="h-20 w-full animate-scan-line bg-gradient-to-b from-transparent via-primary/20 to-transparent" />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <Radar className="size-8 animate-pulse text-primary" strokeWidth={1.5} />
        <div className="flex flex-col items-center gap-2">
          <p className="text-label text-xs uppercase tracking-widest text-primary font-bold">Initialising Investigation</p>
          {label ? (
            <p className="font-mono text-sm text-foreground font-semibold">{label}</p>
          ) : (
            <div className="h-4 w-48 rounded bg-primary/15 animate-pulse" />
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <div className="h-2 w-16 rounded bg-primary/20 animate-pulse" />
          <div className="h-2 w-24 rounded bg-primary/30 animate-pulse" />
          <div className="h-2 w-16 rounded bg-primary/20 animate-pulse" />
        </div>
      </div>
    </motion.div>
  );
};

export default ScanTransitionOverlay;
