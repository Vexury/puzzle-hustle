import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PUZZLE_META,
  PUZZLE_TYPES,
  decodeRef,
  encodeRef,
  crownsAdapter,
  generateCrowns,
  generateKiller,
  generateMosaic,
  generateNonogram,
  generateShapes,
  generateStars,
  generateSudoku,
  levelRef,
  mosaicAdapter,
  nonogramAdapter,
  periodRef,
  randomRef,
  refId,
  shapesAdapter,
  starsAdapter,
  type PuzzleRef,
} from '@puzzle-hustle/core';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { clearProgress, getSolve, readProgress, readSetting, recordSolve, useSolves, writeProgress, writeSetting, type SolveRecord } from '../lib/storage.ts';
import { capitalize, formatSeconds, puzzleUrl, share, shareText } from '../lib/share.ts';
import { currentHintProvider } from '../lib/hints.ts';
import { HOW_TO } from '../lib/howto.ts';
import { dailyNumber } from '../lib/stats.ts';
import { ShapesGame } from '../shapes/ShapesGame.tsx';
import { NonogramGame } from '../nonogram/NonogramGame.tsx';
import { MosaicGame } from '../mosaic/MosaicGame.tsx';
import { SudokuGame } from '../sudoku/SudokuGame.tsx';
import { RegionsGame } from '../regions/RegionsGame.tsx';
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
      puzzleRef.type === 'crowns'
        ? generateCrowns(puzzleRef.seed, puzzleRef.difficulty, crownsAdapter.options(puzzleRef.period))
        : puzzleRef.type === 'stars'
          ? generateStars(puzzleRef.seed, puzzleRef.difficulty, starsAdapter.options(puzzleRef.period))
          : puzzleRef.type === 'sudoku'
        ? generateSudoku(puzzleRef.seed, puzzleRef.difficulty)
        : puzzleRef.type === 'killer'
          ? generateKiller(puzzleRef.seed, puzzleRef.difficulty)
          : puzzleRef.type === 'nonogram'
        ? generateNonogram(puzzleRef.seed, puzzleRef.difficulty, nonogramAdapter.options(puzzleRef.period))
        : puzzleRef.type === 'mosaic'
          ? generateMosaic(puzzleRef.seed, puzzleRef.difficulty, mosaicAdapter.options(puzzleRef.period))
          : generateShapes(puzzleRef.seed, puzzleRef.difficulty, shapesAdapter.options(puzzleRef.period)),
    [puzzleRef],
  );
  const sizeLabel =
    'pieces' in spec
      ? `${spec.config.inner}×${spec.config.inner}, ${spec.pieces.length} shapes`
      : 'regions' in spec
        ? `${spec.config.size}×${spec.config.size}, ${spec.config.stars} per line`
        : 'cages' in spec
        ? spec.cages.length
          ? `9×9, ${spec.cages.length} cages`
          : `9×9, ${[...spec.givens].filter(Boolean).length} givens`
        : 'clues' in spec
        ? `${spec.config.rows}×${spec.config.cols}, ${[...spec.clues].filter((c) => c >= 0).length} clues`
        : `${spec.config.rows}×${spec.config.cols}${spec.config.colors > 1 ? `, ${spec.config.colors} colors` : ''}`;
  const saved = useMemo(() => (existing ? null : readProgress(id)), [id, existing]);
  const [moves, setMoves] = useState(saved?.moves ?? 0);
  const [hints, setHints] = useState(saved?.hints ?? 0);
  const [seconds, setSeconds] = useState(saved?.seconds ?? 0);
  const startedAt = useRef<number | null>(null);
  const counters = useRef({ moves: saved?.moves ?? 0, hints: saved?.hints ?? 0 });
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

  const elapsedNow = () => (startedAt.current === null ? seconds : Math.floor((Date.now() - startedAt.current) / 1000));

  const onMove = () => {
    counters.current.moves++;
    setMoves(counters.current.moves);
    if (startedAt.current === null) {
      startedAt.current = Date.now() - seconds * 1000;
      setRunning(true);
      writeSetting(seenKey, '1');
    }
  };

  const onHintUsed = () => {
    counters.current.hints++;
    setHints(counters.current.hints);
  };

  const lastState = useRef<number[] | null>(saved?.state ?? null);
  const resultRef = useRef(result);
  resultRef.current = result;

  const persist = () => {
    if (resultRef.current || !lastState.current || startedAt.current === null) return;
    writeProgress(id, { state: lastState.current, seconds: elapsedNow(), moves: counters.current.moves, hints: counters.current.hints });
  };

  const onStateChange = (state: number[]) => {
    lastState.current = state;
    persist();
  };

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', persist);
    };
  }, []);

  const onSolved = () => {
    if (result) return;
    setRunning(false);
    const elapsed = elapsedNow();
    const record: SolveRecord = { solvedAt: new Date().toISOString(), seconds: elapsed, hints: counters.current.hints, moves: counters.current.moves };
    setSeconds(elapsed);
    setResult(record);
    recordSolve(id, record);
    clearProgress(id);
  };

  const doShare = async () => {
    const outcome = await share(shareText(puzzleRef, result ?? getSolve(id)), puzzleUrl(puzzleRef));
    if (outcome === 'copied') toast('Link copied');
    else if (outcome === 'failed') toast('Could not share');
  };

  const another = () => navigate(href(`/play?${encodeRef(randomRef(puzzleRef.type, puzzleRef.difficulty))}`));
  const nextLevel = puzzleRef.level ? levelRef(puzzleRef.type, puzzleRef.difficulty, puzzleRef.level + 1) : null;
  const nextChallenge = useMemo(() => {
    if (!puzzleRef.period) return null;
    const candidates = [...PUZZLE_TYPES.map((type) => ({ ...periodRef('daily'), type })), periodRef('weekly'), periodRef('monthly')];
    return candidates.find((c) => refId(c) !== id && !solves[refId(c)]) ?? null;
  }, [puzzleRef, id, solves]);
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
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
          viewKey={id}
        />
      ) : 'regions' in spec ? (
        <RegionsGame
          spec={spec}
          symbol={puzzleRef.type === 'crowns' ? 'crown' : 'star'}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
        />
      ) : 'cages' in spec ? (
        <SudokuGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
        />
      ) : 'clues' in spec ? (
        <MosaicGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
          viewKey={id}
        />
      ) : (
        <NonogramGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
          viewKey={id}
        />
      )}

      {result && (
        <div className="solved-actions">
          <button type="button" className="icon-round" onClick={doShare} aria-label="Share result" title="Share result">
            <ShareIcon />
          </button>
          {nextLevel && (
            <a href={href(`/play?${encodeRef(nextLevel)}`)} className="pill" onClick={onLinkClick}>
              Level #{nextLevel.level} ›
            </a>
          )}
          {!puzzleRef.period && !puzzleRef.level && (
            <button type="button" className="pill" onClick={another}>
              Another {capitalize(puzzleRef.difficulty)} ›
            </button>
          )}
          {nextChallenge && (
            <a href={href(`/play?${encodeRef(nextChallenge)}`)} className="pill" onClick={onLinkClick}>
              {nextChallenge.period === 'daily' ? PUZZLE_META[nextChallenge.type].name : capitalize(nextChallenge.period!)} ›
            </a>
          )}
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

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="share-icon" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
    </svg>
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
