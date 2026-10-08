export default function SarLimitation() {
  return (
    <div className="alert alert-warning" style={{ borderRadius: 'var(--radius-sm)', fontSize: '11px', lineHeight: 1.4 }}>
      <strong style={{ color: 'var(--oil)', fontFamily: 'var(--font-mono)' }}>[PHYSICAL LIMITATION]</strong>
      <div>
        SAR backscatter reduction indicates capillary wave damping. Natural biogenic films, low-wind sheens (&lt;3 m/s), and internal waves create false positives. Detections constitute investigative indicators requiring multi-source corroboration.
      </div>
    </div>
  );
}
