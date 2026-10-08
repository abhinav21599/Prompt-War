import { Radio, Satellite, Ship, Waves } from "lucide-react";
import { motion } from "framer-motion";

interface IntelligenceHudProps {
  vesselsTracked?: number;
  satellitesActive?: number;
}

const reveal = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

/**
 * Small floating readouts layered over the globe. Deliberately not dashboard
 * cards: they suggest a live monitoring system without stealing focus from
 * the Earth or the hero copy.
 */
const IntelligenceHud = ({
  vesselsTracked = 0,
  satellitesActive = 3,
}: IntelligenceHudProps) => {
  const readouts = [
    {
      id: "status",
      icon: Radio,
      label: "System status",
      value: "Operational",
      live: true,
      className: "left-0 top-2 sm:left-2",
    },
    {
      id: "satellites",
      icon: Satellite,
      label: "Satellites",
      value: `${satellitesActive} active`,
      live: false,
      className: "right-0 top-12 sm:right-2 sm:top-16",
    },
    {
      id: "vessels",
      icon: Ship,
      label: "Vessels tracked",
      value: String(vesselsTracked),
      live: false,
      className: "bottom-14 left-0 sm:left-2",
    },
    {
      id: "ocean",
      icon: Waves,
      label: "Ocean monitoring",
      value: "Active",
      live: true,
      className: "bottom-2 right-0 sm:right-2",
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 hidden md:block">
      {readouts.map((readout, index) => {
        const Icon = readout.icon;
        return (
          <motion.div
            key={readout.id}
            variants={reveal}
            initial="hidden"
            animate="show"
            transition={{
              duration: 0.5,
              delay: 0.5 + index * 0.12,
              ease: [0.4, 0, 0.2, 1],
            }}
            className={`absolute ${readout.className} hud-panel px-2.5 py-1.5`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className="size-3 text-primary" strokeWidth={2} />
              <span className="font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-muted-foreground">
                {readout.label}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              {readout.live ? (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                </span>
              ) : null}
              <span className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-foreground">
                {readout.value}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default IntelligenceHud;
