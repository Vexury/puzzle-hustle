// A sitting cat in a 64 box, drawn as one flat silhouette. The tail is its own path so a scene
// can swing it around its root at (44, 56).
export function SittingCat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path className="cc-tail" d="M44 56c12 1 16-8 11-15" />
      <path className="cc-body" d="M20 61c-4-10-3-22 5-28l-4-15 8 6c2-.6 4-.6 6 0l8-6-4 15c8 6 9 18 5 28Z" />
      <ellipse className="cc-eye" cx="28" cy="27" rx="1.4" ry="2.2" />
      <ellipse className="cc-eye" cx="36" cy="27" rx="1.4" ry="2.2" />
    </svg>
  );
}

// Head and front paws only, for a cat looking in from the edge of the screen.
export function PeekingCat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true">
      <path className="cc-body" d="M14 40c-2-10 2-20 8-24l-2-14 9 8c2-.5 4-.5 6 0l9-8-2 14c6 4 10 14 8 24Z" />
      <ellipse className="cc-body" cx="20" cy="42" rx="7" ry="5" />
      <ellipse className="cc-body" cx="44" cy="42" rx="7" ry="5" />
      <ellipse className="cc-eye" cx="27" cy="24" rx="1.6" ry="2.6" />
      <ellipse className="cc-eye" cx="37" cy="24" rx="1.6" ry="2.6" />
    </svg>
  );
}
