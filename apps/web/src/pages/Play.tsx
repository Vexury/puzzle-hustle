import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PUZZLE_META,
  DAILY_TYPES,
  decodeRef,
  encodeRef,
  coinsForSolve,
  crownsAdapter,
  generateCrowns,
  generateKiller,
  generateMosaic,
  generateNonogram,
  generateShapes,
  generateStars,
  generateSudoku,
  generateZip,
  HINT_PRICE,
  levelRef,
  mosaicAdapter,
  nonogramAdapter,
  dailyRef,
  periodRef,
  randomRef,
  refId,
  scheduledRef,
  shapesAdapter,
  starsAdapter,
  zipAdapter,
  zipNumberCount,
  type PuzzleRef,
} from '@puzzle-hustle/core';
import { storedSolves, syncAchievements } from '../lib/achievements.ts';
import { href, navigate, onLinkClick } from '../lib/router.ts';
import { setBackGuard } from '../lib/back.ts';
import { clearProgress, getSolve, keepFinalBoard, readProgress, readSetting, recordSolve, useSolves, writeProgress, writeSetting, type SolveRecord } from '../lib/storage.ts';
import { capitalize, formatSeconds, share, shareText } from '../lib/share.ts';
import { balance, solveCoinLine } from '../lib/coins.ts';
import { syncFlairs } from '../lib/flairs.ts';
import { currentHintProvider, freeHints, type HintChoice } from '../lib/hints.ts';
import { enqueue, flush } from '../lib/queue.ts';
import { HOW_TO } from '../lib/howto.ts';
import { dailyNumber } from '../lib/stats.ts';
import { useSession } from '../lib/auth.ts';
import { ShapesGame } from '../shapes/ShapesGame.tsx';
import { NonogramGame } from '../nonogram/NonogramGame.tsx';
import { ZipGame } from '../zip/ZipGame.tsx';
import { MosaicGame } from '../mosaic/MosaicGame.tsx';
import { SudokuGame } from '../sudoku/SudokuGame.tsx';
import { RegionsGame } from '../regions/RegionsGame.tsx';
import { Chevron } from '../components/Chevron.tsx';
import { toast } from '../components/Toast.tsx';
import * as haptics from '../lib/haptics.ts';
import { useBoard } from '../components/Board.tsx';
import { useGroups } from './Friends.tsx';

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
  // A level or a seeded practice puzzle can be played again for a better time, so reopening one
  // starts a fresh run. A period keeps its first run, that is the time the leaderboard got.
  const replayable = !puzzleRef.period;
  const bestBefore = useRef(existing?.seconds ?? null).current;
  const spec = useMemo(
    () =>
      puzzleRef.type === 'zip'
        ? generateZip(puzzleRef.seed, puzzleRef.difficulty, zipAdapter.options(puzzleRef.period))
        : puzzleRef.type === 'crowns'
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
      : 'walls' in spec
        ? `${spec.config.size}×${spec.config.size}, ${zipNumberCount(spec)} numbers`
        : 'regions' in spec
        ? `${spec.config.size}×${spec.config.size}, ${spec.config.stars} per line`
        : 'cages' in spec
        ? spec.cages.length
          ? `9×9, ${spec.cages.length} cages`
          : `9×9, ${[...spec.givens].filter(Boolean).length} givens`
        : 'clues' in spec
        ? `${spec.config.rows}×${spec.config.cols}, ${[...spec.clues].filter((c) => c >= 0).length} clues`
        : `${spec.config.rows}×${spec.config.cols}${spec.config.colors > 1 ? `, ${spec.config.colors} colors` : ''}`;
  // A solved period comes back with its finished board, which the game shows solved and frozen.
  // Solves from before boards were kept have none, and an empty board under "Solved!" would be
  // playable again, so those show the result alone.
  const saved = useMemo(() => readProgress(id), [id]);
  const showBoard = useRef(replayable || !existing || saved !== null).current;
  const [moves, setMoves] = useState(saved?.moves ?? 0);
  const [hints, setHints] = useState(saved?.hints ?? 0);
  const [seconds, setSeconds] = useState(saved?.seconds ?? 0);
  const startedAt = useRef<number | null>(null);
  const counters = useRef({ moves: saved?.moves ?? 0, hints: saved?.hints ?? 0 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SolveRecord | undefined>(replayable ? undefined : existing);
  const [coinLine, setCoinLine] = useState<string | null>(null);
  // Gates Placement below: it must mount only once the solve just submitted has actually had
  // its round trip, not the instant it is enqueued. A puzzle that was already solved in an
  // earlier session has nothing racing it, so it starts settled.
  const [scoreSettled, setScoreSettled] = useState(() => Boolean(existing));
  const seenKey = `ph:howto:${puzzleRef.type}`;
  const [showHelp, setShowHelp] = useState(() => readSetting(seenKey) !== '1');
  const helpSeen = useRef(readSetting(seenKey) === '1');
  const [askHint, setAskHint] = useState<{ canPay: boolean } | null>(null);
  const [adWait, setAdWait] = useState(false);
  const adWaitRef = useRef(false);
  const hintAnswer = useRef<((choice: HintChoice) => void) | null>(null);
  const [askLeave, setAskLeave] = useState(false);
  const askLeaveRef = useRef(askLeave);
  askLeaveRef.current = askLeave;
  const pausedSince = useRef<number | null>(null);
  const frozen = useRef<number | null>(null);

  const askForHint = (canPay: boolean) =>
    new Promise<HintChoice>((resolve) => {
      hintAnswer.current = resolve;
      setAskHint({ canPay });
    });

  const answerHint = (choice: HintChoice) => {
    setAskHint(null);
    hintAnswer.current?.(choice);
    hintAnswer.current = null;
  };

  useEffect(() => () => hintAnswer.current?.(null), []);

  // Between "Watch video" and the video itself the ad takes a moment to load. The puzzle must not
  // take input or be left in that gap, and the clock stands, as it does during the video.
  const waitForAd = (on: boolean) => {
    adWaitRef.current = on;
    setAdWait(on);
    if (on) pauseClock();
    else resumeClock();
  };

  const hintProvider = currentHintProvider(hints, id, askForHint, waitForAd);
  const back = backTarget(puzzleRef);

  // The clock runs from the moment the puzzle is on screen. Starting it on the first move
  // rewards solving the whole thing in your head and then racing the input.
  useEffect(() => {
    if (result) return;
    startedAt.current = Date.now() - seconds * 1000;
    setRunning(true);
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = () => setSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [running]);

  // The frozen value lives in a ref because `persist` runs from an unmount closure that
  // still holds the seconds of the first render.
  const elapsedNow = () =>
    frozen.current ?? (startedAt.current === null ? seconds : Math.floor((Date.now() - startedAt.current) / 1000));

  const pauseClock = () => {
    if (startedAt.current === null || frozen.current !== null) return;
    frozen.current = Math.floor((Date.now() - startedAt.current) / 1000);
    setSeconds(frozen.current);
    pausedSince.current = Date.now();
    setRunning(false);
  };

  const resumeClock = () => {
    if (pausedSince.current === null || askLeaveRef.current || adWaitRef.current) return;
    if (startedAt.current !== null) {
      startedAt.current += Date.now() - pausedSince.current;
      setRunning(true);
    }
    pausedSince.current = null;
    frozen.current = null;
  };

  // A back gesture next to the board is usually a slip of the thumb, so hold the puzzle and
  // ask. The clock stops meanwhile, the question itself must not cost time.
  useEffect(() => {
    if (result) return;
    setBackGuard(() => {
      if (adWaitRef.current) return true;
      pauseClock();
      setAskLeave(true);
      return true;
    });
    return () => setBackGuard(null);
  });

  const stay = () => {
    setAskLeave(false);
    askLeaveRef.current = false;
    resumeClock();
  };

  // Replace instead of push: a pushed entry would send the next back press straight back
  // into the puzzle we just left.
  const leave = () => {
    setAskLeave(false);
    askLeaveRef.current = false;
    navigate(back.url, true);
  };

  const onMove = () => {
    haptics.tap();
    counters.current.moves++;
    setMoves(counters.current.moves);
    if (helpSeen.current) return;
    helpSeen.current = true;
    writeSetting(seenKey, '1');
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

  // The clock is wall clock based and would keep running while the app sits in the
  // background, so a phone call must not cost the player a minute.
  useEffect(() => {
    const stop = () => {
      pauseClock();
      persist();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? stop() : resumeClock());
    document.addEventListener('visibilitychange', onVisibility);
    // A system overlay such as the notification shade covers the puzzle without stopping the
    // activity, so visibility never changes. MainActivity sends the window focus instead.
    window.addEventListener('appBlur', stop);
    window.addEventListener('appFocus', resumeClock);
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('appBlur', stop);
      window.removeEventListener('appFocus', resumeClock);
      window.removeEventListener('pagehide', persist);
    };
  }, []);

  const onSolved = () => {
    if (result) return;
    setRunning(false);
    haptics.solved();
    const elapsed = elapsedNow();
    const record: SolveRecord = { solvedAt: new Date().toISOString(), seconds: elapsed, hints: counters.current.hints, moves: counters.current.moves };
    setSeconds(elapsed);
    setResult(record);
    const firstSolve = getSolve(id) === undefined;
    recordSolve(id, record);
    try {
      setCoinLine(solveCoinLine(coinsForSolve(id, storedSolves()), firstSolve));
    } catch {
      /* coins never cost a player the solved screen */
    }
    // A shared /play link carries its seed and difficulty as plain query params, so both are
    // forgeable: `s` can be edited to swap in an easier puzzle while `p`/`k` still claim today's
    // real period id. Submitting is gated on the ref actually being the scheduled one for that
    // period and key — local recording above is untouched, only what reaches the server changes.
    const scheduled = puzzleRef.period && puzzleRef.key ? scheduledRef(puzzleRef.type, puzzleRef.period, puzzleRef.key) : null;
    if (scheduled && scheduled.seed === puzzleRef.seed && scheduled.difficulty === puzzleRef.difficulty) {
      enqueue(id, record);
      void flush().finally(() => setScoreSettled(true));
    }
    syncAchievements();
    syncFlairs();
    if (replayable) clearProgress(id);
    else if (lastState.current) keepFinalBoard(id, { state: lastState.current, seconds: elapsed, moves: record.moves, hints: record.hints });
  };

  const doShare = async () => {
    const outcome = await share(shareText(puzzleRef, result ?? getSolve(id)));
    if (outcome === 'copied') toast('Link copied');
    else if (outcome === 'failed') toast('Could not share');
  };

  const another = () => navigate(href(`/play?${encodeRef(randomRef(puzzleRef.type, puzzleRef.difficulty))}`));
  const nextLevel = puzzleRef.level ? levelRef(puzzleRef.type, puzzleRef.difficulty, puzzleRef.level + 1) : null;
  const nextChallenge = useMemo(() => {
    if (!puzzleRef.period) return null;
    const candidates = [...DAILY_TYPES.map((type) => dailyRef(type)), periodRef('weekly'), periodRef('monthly')];
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
          <Chevron />
        </a>
        <h1>
          {PUZZLE_META[puzzleRef.type].name} <span className="muted">· {subtitle(puzzleRef)}</span>
        </h1>
        <button type="button" className={showHelp ? 'icon-round active' : 'icon-round'} onClick={toggleHelp} aria-label="How to play" aria-pressed={showHelp}>
          ?
        </button>
      </div>

      <div className="play-meta">
        <span className="timer">
          <Clock /> {formatSeconds(result ? result.seconds : seconds)}
        </span>
        <span className="muted small">{sizeLabel}</span>
        {result ? <span className="diff-pill solved">Solved</span> : <span className={`diff-pill ${puzzleRef.difficulty}`}>{puzzleRef.difficulty}</span>}
      </div>

      {!showBoard ? null : 'pieces' in spec ? (
        <ShapesGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          hintAd={hintProvider !== freeHints}
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
          hintAd={hintProvider !== freeHints}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
        />
      ) : 'walls' in spec ? (
        <ZipGame
          spec={spec}
          onMove={onMove}
          onSolved={onSolved}
          onHintUsed={onHintUsed}
          requestHint={() => hintProvider.request()}
          hintAd={hintProvider !== freeHints}
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
          hintAd={hintProvider !== freeHints}
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
          hintAd={hintProvider !== freeHints}
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
          hintAd={hintProvider !== freeHints}
          locked={false}
          initialState={saved?.state}
          onStateChange={onStateChange}
          viewKey={id}
        />
      )}

      {result && (
        <div className="solved-head">
          <h2>Solved!</h2>
          <b className="big-time">{formatSeconds(result.seconds)}</b>
          <span className="muted small">
            {result.moves} moves · {result.hints === 0 ? 'no hints' : `${result.hints} hint${result.hints === 1 ? '' : 's'}`}
          </span>
          {coinLine && <span className="coin-line">{coinLine}</span>}
          {replayable && bestBefore !== null && (
            <span className={result.seconds < bestBefore ? 'best-note better' : 'best-note'}>
              {result.seconds < bestBefore ? `New best, ${formatSeconds(bestBefore)} before` : `Your best stays ${formatSeconds(bestBefore)}`}
            </span>
          )}
          {puzzleRef.period && scoreSettled && <Placement puzzle={id} />}
        </div>
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

      {askHint && (
        <div className="ad-ask" role="dialog" aria-modal="true" aria-label="Get another hint">
          <div className="card-lg">
            <b>One more hint?</b>
            <span className="muted small">
              {askHint.canPay
                ? `Pay ${HINT_PRICE} coins or watch a short video. Your first hint on every puzzle is always free.`
                : 'Watch a short video and the next hint is yours. Your first hint on every puzzle is always free.'}
            </span>
            {!askHint.canPay && <span className="muted small">{HINT_PRICE} coins needed, you have {balance()}.</span>}
            <div className="ad-ask-row">
              <button type="button" className="pill outline" onClick={() => answerHint(null)}>
                Not now
              </button>
              {askHint.canPay && (
                <button type="button" className="pill" onClick={() => answerHint('coins')}>
                  Use {HINT_PRICE} coins
                </button>
              )}
              <button type="button" className={askHint.canPay ? 'pill outline' : 'pill'} onClick={() => answerHint('video')}>
                Watch video
              </button>
            </div>
          </div>
        </div>
      )}

      {adWait && (
        <div className="ad-ask" role="status" aria-live="polite">
          <div className="card-lg ad-wait">
            <span className="spinner" aria-hidden="true" />
            <b>Loading video…</b>
          </div>
        </div>
      )}

      {askLeave && (
        <div className="ad-ask" role="dialog" aria-modal="true" aria-label="Leave this puzzle">
          <div className="card-lg">
            <b>Leave this puzzle?</b>
            <span className="muted small">Your progress is kept. The clock is paused while you decide.</span>
            <div className="ad-ask-row">
              <button type="button" className="pill outline" onClick={leave}>
                Leave
              </button>
              <button type="button" className="pill" onClick={stay}>
                Keep playing
              </button>
            </div>
          </div>
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

// Mounted only once PlayPuzzle's flush() attempt for this solve has settled (scoreSettled), so
// this component's own GET /board never races the POST /scores from onSolved — the two need a
// different number of sequential D1 round trips and neither was ever guaranteed to finish
// first. Offline (submission still queued) or signed out or groupless, this renders nothing
// rather than an error: the result screen must never look broken over it.
function Placement({ puzzle }: { puzzle: string }) {
  const session = useSession();
  const { groups } = useGroups();
  const group = groups[0] ?? null;
  const { board } = useBoard(group?.id ?? null, puzzle);
  if (!session || !group || !board?.me) return null;
  const suffix = board.me === 1 ? 'st' : board.me === 2 ? 'nd' : board.me === 3 ? 'rd' : 'th';
  return (
    <span className="muted small">
      {board.me}
      {suffix} of {board.entries.length} in {group.name}
    </span>
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
