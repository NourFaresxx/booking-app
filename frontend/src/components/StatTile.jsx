/** A single headline number with a label — the right answer when there's one number to show, not a trend. */
export default function StatTile({ label, value, sublabel }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile-value">{value}</span>
      <span className="stat-tile-label">{label}</span>
      {sublabel && <span className="stat-tile-sublabel">{sublabel}</span>}
    </div>
  );
}
