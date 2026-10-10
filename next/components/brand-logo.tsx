// Custom vector monogram: an upright stem joins an open, wave-shaped shoulder.
// This geometry is shared with the exported SVG logo and favicon assets.
const monogram =
  "M17 13h7v16.5c2.6-3.6 6.5-5.5 11.2-5.5C43.6 24 48 29.4 48 38v12h-7V38.3c0-5.1-2.7-8.2-7.2-8.2-5.7 0-9.8 4-9.8 10.1V50h-7V13Z";

export default function BrandLogo({ href = "#home" }: { href?: string }) {
  return (
    <a className="brand" href={href} aria-label="Handsfree home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="40" height="40" focusable="false">
          <path d={monogram} fill="currentColor" />
        </svg>
      </span>
      <span className="brand-wordmark">handsfree</span>
    </a>
  );
}
