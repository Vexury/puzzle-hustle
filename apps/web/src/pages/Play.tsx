import { useEffect, useMemo, useRef, useState } from 'react';
import { PUZZLE_META, decodeRef, encodeRef, generateNonogram, generateShapes, levelRef, nonogramAdapter, randomRef, refId, shapesAdapter, type PuzzleRef } from '@puzzle-hustle/core';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { getSolve, recordSolve, useSolves, type SolveRecord } from '../lib/storage.ts';
import { capitalize, formatSeconds, periodLabel, puzzleUrl, share, shareText } from '../lib/share.ts';
import { currentHintProvider } from '../lib/hints.ts';
import { ShapesGame } from '../shapes/ShapesGame.tsx';
import { NonogramGame } from '../nonogram/NonogramGame.tsx';
import { toast } from '../components/Toast.tsx';

export function Play({ params }: { params: URLSearchParams }) {
  const ref = decodeRef(params);
  if (!ref) {
    return (
      <section className="section">
        <h1>Unknown puzzle</h1>
        <p className="muted">This link does not point to a puzzle.</p>
        <a href={href('/')} className="btn" onClick={onLinkClick}>Back to puzzles</a>
      </section>
    );
  }
  return <PlayPuzzle key={refId(ref)} puzzleRef={ref} />;
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
      ? `${spec.config.inner}×${spec.config.inner} · ${spec.pieces.length} shapes`
      : `${spec.config.rows}×${spec.config.cols}${spec.config.colors > 1 ? ` · ${spec.config.colors} colors` : ''}`;
  const [moves, setMoves] = useState(0);
  const [hints, setHints] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SolveRecord | undefined>(existing);
  const hintProvider = currentHintProvider();

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
    if (outcome === 'copied') toast('Copied to clipboard');
    else if (outcome === 'failed') toast('Could not share');
  };

  const another = () => navigate(href(`/play?${encodeRef(randomRef(puzzleRef.type, puzzleRef.difficulty))}`));
  const nextLevel = puzzleRef.level ? levelRef(puzzleRef.type, puzzleRef.difficulty, puzzleRef.level + 1) : null;

  return (
    <section className="section">
      <div className="play-head">
        <div>
          <h1>{PUZZLE_META[puzzleRef.type].name}</h1>
          <div className="play-meta">
            <span>{periodLabel(puzzleRef)}</span>
            {puzzleRef.period && <span>{capitalize(puzzleRef.difficulty)}</span>}
            <span>{sizeLabel}</span>
            <span>
              <b>{formatSeconds(result?.seconds ?? seconds)}</b>
            </span>
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn small" onClick={doShare}>Share</button>
          <a href={href('/')} className="btn small" onClick={onLinkClick}>All puzzles</a>
        </div>
      </div>

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
        <div className="result">
          <h2>Solved</h2>
          <div className="stats">
            <span><b>{formatSeconds(result.seconds)}</b><span className="muted small">time</span></span>
            <span><b>{result.moves}</b><span className="muted small">moves</span></span>
            <span><b>{result.hints}</b><span className="muted small">hints</span></span>
          </div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={doShare}>Share result</button>
            {nextLevel && (
              <a href={href(`/play?${encodeRef(nextLevel)}`)} className="btn" onClick={onLinkClick}>
                Level {nextLevel.level}
              </a>
            )}
            {!puzzleRef.period && !puzzleRef.level && <button type="button" className="btn" onClick={another}>Another {capitalize(puzzleRef.difficulty)}</button>}
            <a href={href('/')} className="btn" onClick={onLinkClick}>All puzzles</a>
          </div>
        </div>
      )}
    </section>
  );
}
