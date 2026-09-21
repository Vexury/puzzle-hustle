export function Chevron({ size = 24 }: { size?: number }) {
  return (
    <svg className="chevron" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M15 4.5 7.5 12l7.5 7.5" />
    </svg>
  );
}
