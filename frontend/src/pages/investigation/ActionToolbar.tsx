import { Crosshair, Link2, ScanSearch, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export const ACTIONS = [
  { id: "analysis", label: "Run analysis", icon: ScanSearch },
  { id: "trace", label: "Trace origin", icon: Crosshair },
  { id: "correlate", label: "Correlate AIS", icon: Link2 },
  { id: "drift", label: "Predict drift", icon: TrendingUp },
] as const;

export type ActionId = (typeof ACTIONS)[number]["id"];

interface ActionToolbarProps {
  active: ActionId | null;
  onSelect: (id: ActionId | null) => void;
}

/**
 * The investigation action bar. Buttons toggle simple frontend state only;
 * real analysis is wired in a later step.
 */
const ActionToolbar = ({ active, onSelect }: ActionToolbarProps) => {
  return (
    <div className="flex flex-wrap gap-2">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        const isActive = active === action.id;
        return (
          <Button
            key={action.id}
            variant={isActive ? "command" : "outlineBlue"}
            size="lg"
            type="button"
            onClick={() => onSelect(isActive ? null : action.id)}
          >
            <Icon />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
};

export default ActionToolbar;
