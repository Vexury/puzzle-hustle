import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PUZZLE_META,
  decodeRef,
  encodeRef,
  generateNonogram,
  generateShapes,
  levelRef,
  nonogramAdapter,
  randomRef,
  refId,
  shapesAdapter,
  type PuzzleRef,
} from '@puzzle-hustle/core';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { getSolve, readSetting, recordSolve, useSolves, writeSetting, type SolveRecord } from '../lib/storage.ts';
import { capitalize, formatSeconds, puzzleUrl, share, shareText } from '../lib/share.ts';
import { currentHintProvider } from '../lib/hints.ts';
import { HOW_TO } from '../lib/howto.ts';
import { dailyNumber } from '../lib/stats.ts';
import { ShapesGame } from '../shapes/ShapesGame.tsx';
import { NonogramGame } from '../nonogram/NonogramGame.tsx';
import { toast } from '../components/Toast.tsx';

export function Play({ params }: { params: URLSearchParams }) {
  const ref = decodeRef(params);
  if (!ref) {
    return (
      <section className="page-head">
        <h1>Unknown puzzle</h1>
        <p className="muted">This link does not point to a puzzle.</p>
        <a href={href('/')} className="pill" onClick={onLinkClick}>
          Back to Daily
        </a>
      </section>
    );
  }
  return <PlayPuzzle key={refId(ref)} puzzleRef={ref} />;
}

function subtitle(ref: PuzzleRef): string {
  if (ref.level) return `#${ref.level}`;
  if (ref.period === 'daily' && ref.key) return `Daily #${dailyNumber(ref.key)}`;
  if (ref.period && ref.key) return `${capitalize(ref.period)} ${ref.key}`;
  return 'Random';
}

function backTarget(ref: PuzzleRef): { url: string; label: string } {
  if (ref.level || !ref.period) return { url: href(`/levels/${ref.type}`), label: PUZZLE_META[ref.type].name };
  return { url: href('/'), label: 'Daily' };
}

function PlayPuzzle({ puzzleRef }: { puzzleRef: PuzzleRef }) {
  const id = refId(puzzleRef);
  const solves = useSolves();
  const existing = solves[id];
  const spec = useMemo(
    () =>
      puzzleRef.type === 'nonogram'
        ? generateNonogram(puzzleRef.seed, puzzleRef.difficulty, nonogramAdapter.options(puzzleRef.period))
        : generateShapes(puzzleRef.seed, puzzleRef.difficulty, shapesAdapter.options(puzzleRef.period)),
    [puzzleRef],
  );
  const sizeLabel =
    'pieces' in spec
      ? `${spec.config.inner}×${spec.config.inner}, ${spec.pieces.length} shapes`
      : `${spec.config.rows}×${spec.config.cols}${spec.config.colors > 1 ? `, ${spec.config.colors} colors` : ''}`;
  const [moves, setMoves] = useState(0);
  const [hints, setHints] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SolveRecord | undefined>(existing);
  const seenKey = `ph:howto:${puzzleRef.type}`;
  const [showHelp, setShowHelp] = useState(() => readSetting(seenKey) !== '1');
  const hintProvider = currentHintProvider();
  const back = backTarget(puzzleRef);

  useEffect(() => {
    if (!running) return;
    const tick = () => setSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [running]);

  const onMove = () => {
    setMoves((m) => m + 1);
    if (startedAt.current === null) {
      startedAt.current = Date.now();
      setRunning(true);
      writeSetting(seenKey, '1');
    }
  };

  const onSolved = () => {
    if (result) return;
    setRunning(false);
    const elapsed = startedAt.current ? Math.floor((Date.now() - startedAt.current) / 1000) : 0;
    const record: SolveRecord = { solvedAt: new Date().toISOString(), seconds: elapsed, hints, moves };
    setSeconds(elapsed);
    setResult(record);
    recordSolve(id, record);
  };

  const doShare = async () => {
    const outcome = await share(shareText(puzzleRef, result ?? getSolve(id)), puzzleUrl(puzzleRef));
    if (outcome === 'copied') toast('Link copied');
    else if (outcome === 'failed') toast('Could not share');
  };

  const another = () => navigate(href(`/play?${encodeRef(randomRef(puzzleRef.type, puzzleRef.difficulty))}`));
  const nextLevel = puzzleRef.level ? levelRef(puzzleRef.type, puzzleRef.difficulty, puzzleRef.level + 1) : null;
  const toggleHelp = () => {
    setShowHelp((v) => !v);
    writeSetting(seenKey, '1');
  };

  return (
    <section className="play">
      <div className="play-bar">
        <a href={back.url} onClick={onLinkClick} className="icon-round" aria-label={`Back to ${back.label}`}>
          ‹
        </a>
        <h1>
          {PUZZLE_META[puzzleRef.type].name} <span className="muted">· {subtitle(puzzleRef)}</span>
        </h1>
        <button type="button" className={showHelp ? 'icon-round active' : 'icon-round'} onClick={toggleHelp} aria-label="How to play" aria-pressed={showHelp}>
          ?
        </button>
      </div>

      {result ? (
        <div className="solved-head">
          <h2>Solved!</h2>
          <span className="muted">{sizeLabel}</span>
          <b className="big-time">{formatSeconds(result.seconds)}</b>
          <span className="muted small">
            {result.moves} moves · {result.hints === 0 ? 'no hints' : `${result.hints} hint${result.hints === 1 ? '' : 's'}`}
          </span>
        </div>
      ) : (
        <div className="play-meta">
          <span className="timer">
            <Clock /> {formatSeconds(seconds)}
          </span>
          <span className="muted small">{sizeLabel}</span>
          <span className={`diff-pill ${puzzleRef.difficulty}`}>{puzzleRef.difficulty}</span>
        </div>
      )}

      {'pieces' in spec ? (
        <ShapesGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={() => setHints((h) => h + 1)}
          requestHint={() => hintProvider.request()}
          locked={false}
        />
      ) : (
        <NonogramGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={() => setHints((h) => h + 1)}
          requestHint={() => hintProvider.request()}
          locked={false}
        />
      )}

      {result && (
        <div className="actions solved-actions">
          <button type="button" className="pill" onClick={doShare}>
            Share result
          </button>
          {nextLevel && (
            <a href={href(`/play?${encodeRef(nextLevel)}`)} className="pill outline" onClick={onLinkClick}>
              Level #{nextLevel.level}
            </a>
          )}
          {!puzzleRef.period && !puzzleRef.level && (
            <button type="button" className="pill outline" onClick={another}>
              Another {capitalize(puzzleRef.difficulty)}
            </button>
          )}
          <a href={back.url} className="pill outline" onClick={onLinkClick}>
            {back.label}
          </a>
        </div>
      )}

      {showHelp && (
        <div className="card-lg howto">
          <h2>How to play</h2>
          <ol>
            {HOW_TO[puzzleRef.type].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function Clock() {
  return (
    <svg viewBox="0 0 24 24" className="clock" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9 3h6" />
    </svg>
  );
}
