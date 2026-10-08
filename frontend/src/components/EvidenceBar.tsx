

interface EvidenceBarProps {
  label: string; rawValue: number; rawUnit: string;
  normalized: number; weight: number; contribution: number;
}
export default function EvidenceBar({ label, rawValue, rawUnit, normalized, weight, contribution }: EvidenceBarProps) {
  return (
    <div className="evidence-bar">
      <div className="evidence-bar__header">
        <span className="evidence-bar__label">{label}</span>
        <span className="evidence-bar__values mono">{rawValue.toFixed(2)} {rawUnit} | norm: {normalized.toFixed(3)} | wt: {(weight*100).toFixed(0)}%</span>
      </div>
      <div className="evidence-bar__track">
        <div className="evidence-bar__fill" style={{width:(normalized*100)+'%'}} />
      </div>
      <div className="evidence-bar__contribution">Contribution: {contribution.toFixed(4)}</div>
    </div>
  );
}
