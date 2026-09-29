import { LOGO_PATH } from '../lib/logo.ts';

export function Logo({ className }: { className: string }) {
  return (
    <svg className={`logo ${className}`} viewBox="0 0 120 160" aria-hidden="true">
      <path d={LOGO_PATH} />
    </svg>
  );
}
