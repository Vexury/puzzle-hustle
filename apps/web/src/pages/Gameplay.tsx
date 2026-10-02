import { useState } from 'react';
import { HAPTICS_KEY, hapticsAvailable, tap } from '../lib/haptics.ts';
import * as sound from '../lib/sound.ts';
import { MISTAKES_KEY, showMistakes } from '../lib/mistakes.ts';
import { readSetting, writeSetting } from '../lib/storage.ts';
import { SubpageHead } from '../components/SubpageHead.tsx';

export function Gameplay() {
  const [numberHighlight, setNumberHighlight] = useState(readSetting('ph:sudokuHighlight') !== '0');
  const [soundOn, setSoundOn] = useState(readSetting(sound.SOUND_KEY) !== '0');
  const [hapticsOn, setHapticsOn] = useState(readSetting(HAPTICS_KEY) !== '0');
  const [mistakes, setMistakes] = useState(showMistakes);

  return (
    <>
      <SubpageHead title="Gameplay" />
      <div className="stack">
        <OnOff
          title="Highlight matching numbers"
          text="Sudoku lights up every cell and note with the number you tap."
          value={numberHighlight}
          onChange={(on) => {
            setNumberHighlight(on);
            writeSetting('ph:sudokuHighlight', on ? '1' : '0');
          }}
        />
        <OnOff
          title="Show mistakes"
          text="Marks an entry in red when it breaks a rule. Off for hardcore: you find out only when the puzzle does not solve."
          value={mistakes}
          onChange={(on) => {
            setMistakes(on);
            writeSetting(MISTAKES_KEY, on ? '1' : '0');
          }}
        />
        <OnOff
          title="Sound effects"
          text="A soft click with every move and a chime when a puzzle is solved."
          value={soundOn}
          onChange={(on) => {
            setSoundOn(on);
            writeSetting(sound.SOUND_KEY, on ? '1' : '0');
            sound.play('place');
          }}
        />
        {hapticsAvailable && (
          <OnOff
            title="Haptic feedback"
            text="A light tap with every move and a buzz when a puzzle is solved."
            value={hapticsOn}
            onChange={(on) => {
              setHapticsOn(on);
              writeSetting(HAPTICS_KEY, on ? '1' : '0');
              tap();
            }}
          />
        )}
      </div>
    </>
  );
}

export function OnOff({ title, text, value, onChange }: { title: string; text: string; value: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="card-lg">
      <b>{title}</b>
      <span className="muted small">{text}</span>
      <div className="segmented two" role="radiogroup" aria-label={title}>
        {[true, false].map((on) => (
          <button key={String(on)} type="button" role="radio" aria-checked={value === on} className={value === on ? 'seg active' : 'seg'} onClick={() => onChange(on)}>
            {on ? 'On' : 'Off'}
          </button>
        ))}
      </div>
    </div>
  );
}
