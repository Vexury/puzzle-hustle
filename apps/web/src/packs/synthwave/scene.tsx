import { useEffect, useState } from 'react';
import { onAppEvent } from '../../lib/appEvents.ts';
import './scene.css';

// A retro sun and a grid rolling toward the horizon behind everything, and a short scanline
// glitch over the screen when a puzzle is solved.
export default function SynthwaveScene() {
  const [glitch, setGlitch] = useState(0);
  useEffect(() => onAppEvent((event) => event === 'solved' && setGlitch((n) => n + 1)), []);
  return (
    <>
      <div className="pack-back sw-back">
        <div className="sw-sun" />
        <div className="sw-floor">
          <div className="sw-grid" />
        </div>
      </div>
      {glitch > 0 && (
        <div className="pack-front">
          <div key={glitch} className="sw-glitch" />
        </div>
      )}
    </>
  );
}
