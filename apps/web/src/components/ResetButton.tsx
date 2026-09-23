import { useEffect, useState } from 'react';
import { ToolButton } from './ToolButton.tsx';

const REVERT_MS = 4000;

// A reset throws the whole board away, so the first press only arms the button.
export function ResetButton({ onReset, disabled }: { onReset: () => void; disabled: boolean }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), REVERT_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <ToolButton
      icon="reset"
      label={armed ? 'Sure?' : 'Reset'}
      className={armed ? 'danger' : 'warn'}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onReset();
      }}
      disabled={disabled}
    />
  );
}
