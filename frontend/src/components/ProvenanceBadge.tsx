type P = 'observed'|'reconstructed'|'predicted'|'synthetic'|'operational'|'real';
const LABELS: Record<P,string> = {
  observed: 'OBSERVED',
  reconstructed: 'RECONSTRUCTED',
  predicted: 'PREDICTED',
  synthetic: 'SYNTHETIC',
  operational: 'COPERNICUS REAL-DATA',
  real: 'COPERNICUS REAL-DATA',
};

export default function ProvenanceBadge({ provenance }: { provenance: string }) {
  const norm = (provenance || 'synthetic').toLowerCase() as P;
  return <span className={'tag tag-' + norm}>{LABELS[norm] || norm.toUpperCase()}</span>;
}
