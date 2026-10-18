/** A shimmering placeholder grid shown while a page's first data load is in flight. */
export default function SkeletonGrid({ count = 6 }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}
