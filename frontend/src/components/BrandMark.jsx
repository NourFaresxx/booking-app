// A small abstract mark (not a literal calendar icon) used next to the
// "Booking" wordmark in the nav and footer. Inline SVG rather than an image
// so it inherits `currentColor` and needs no asset file.
export default function BrandMark(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="4" width="20" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 2v4M17 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}
