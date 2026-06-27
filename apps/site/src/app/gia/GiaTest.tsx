"use client";

import { useState, useEffect, useRef } from "react";
import {
  type ReasoningQ,
  type PerceptualQ,
  type NumberQ,
  type WordQ,
  type SpatialQ,
  reasoningQuestions,
  wordQuestions,
  generatePerceptualQuestions,
  generateNumberQuestions,
  generateSpatialQuestions,
} from "./questions";

type Phase =
  | { type: "welcome" }
  | { type: "section-intro"; sectionIdx: number }
  | { type: "testing"; sectionIdx: number }
  | { type: "section-complete"; sectionIdx: number }
  | { type: "results" };

type SectionResult = { correct: number; attempted: number };

const SECTION_DURATION = 180;

const SECTIONS = [
  {
    name: "Reasoning",
    task: "Task 1",
    description:
      "A statement will appear briefly. When it disappears, answer the question by clicking one of the two names.",
  },
  {
    name: "Perceptual Speed",
    task: "Task 2",
    description:
      "Four letter pairs are shown. Click how many pairs show the same letter (upper and lower case). Answer: 0, 1, 2, 3, or 4.",
  },
  {
    name: "Number Speed & Accuracy",
    task: "Task 3",
    description:
      "Three numbers are shown. Click the number that is furthest away from the middle value.",
  },
  {
    name: "Word Meaning",
    task: "Task 4",
    description:
      "Three words are shown. Click the odd one out — the word that does not pair with the other two.",
  },
  {
    name: "Spatial Visualisation",
    task: "Task 5",
    description:
      "Two pairs of R symbols are shown. Rotation doesn't matter — only whether the symbol is a normal R or mirrored Я. Click how many pairs match (0, 1, or 2).",
  },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Reasoning ────────────────────────────────────────────────────────────────

function ReasoningQuestion({
  q,
  onAnswer,
}: {
  q: ReasoningQ;
  onAnswer: (correct: boolean) => void;
}) {
  const [showStatement, setShowStatement] = useState(true);

  useEffect(() => {
    setShowStatement(true);
    const t = setTimeout(() => setShowStatement(false), 3000);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xl">
      <div className="min-h-24 flex items-center justify-center text-center w-full">
        {showStatement ? (
          <p className="text-lg text-fg leading-relaxed px-5 py-4 rounded-lg bg-bg-elev border border-border w-full">
            {q.statement}
          </p>
        ) : (
          <p className="text-xl font-semibold text-fg">{q.question}</p>
        )}
      </div>
      {!showStatement ? (
        <div className="flex gap-4">
          {q.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onAnswer(opt === q.answer)}
              className="px-8 py-3 rounded-lg bg-bg-elev border border-border hover:border-accent hover:bg-bg-glass text-fg text-lg font-medium transition-colors cursor-pointer"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-fg-dim text-sm">Read carefully — it will disappear…</p>
      )}
    </div>
  );
}

// ── Perceptual Speed ──────────────────────────────────────────────────────────

function PerceptualQuestion({
  q,
  onAnswer,
}: {
  q: PerceptualQ;
  onAnswer: (correct: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-lg">
      <div className="grid grid-cols-4 gap-5">
        {q.pairs.map(([upper, lower], i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1 px-5 py-4 rounded-lg bg-bg-elev border border-border"
          >
            <span className="text-2xl font-mono font-bold text-fg">{upper}</span>
            <span className="text-2xl font-mono text-fg-muted">{lower}</span>
          </div>
        ))}
      </div>
      <div>
        <p className="text-fg-dim text-sm text-center mb-4">How many pairs match?</p>
        <div className="flex gap-3">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => onAnswer(n === q.answer)}
              className="w-12 h-12 rounded-lg bg-bg-elev border border-border hover:border-accent hover:bg-bg-glass text-fg text-lg font-semibold transition-colors cursor-pointer"
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Number Speed ──────────────────────────────────────────────────────────────

function NumberQuestion({
  q,
  onAnswer,
}: {
  q: NumberQ;
  onAnswer: (correct: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-md">
      <p className="text-fg-dim text-sm">Click the number furthest from the middle value</p>
      <div className="flex gap-6">
        {q.numbers.map((n, i) => (
          <button
            key={i}
            onClick={() => onAnswer(n === q.answer)}
            className="w-24 h-20 rounded-lg bg-bg-elev border border-border hover:border-accent hover:bg-bg-glass text-fg text-3xl font-bold font-mono transition-colors cursor-pointer"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Word Meaning ──────────────────────────────────────────────────────────────

function WordQuestion({
  q,
  onAnswer,
}: {
  q: WordQ;
  onAnswer: (correct: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-md">
      <p className="text-fg-dim text-sm">Click the odd one out</p>
      <div className="flex gap-4 flex-wrap justify-center">
        {q.words.map((w) => (
          <button
            key={w}
            onClick={() => onAnswer(w === q.answer)}
            className="px-6 py-4 rounded-lg bg-bg-elev border border-border hover:border-accent hover:bg-bg-glass text-fg text-lg font-medium transition-colors cursor-pointer"
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Spatial ───────────────────────────────────────────────────────────────────

function RSymbol({ isNormal, rotation }: { isNormal: boolean; rotation: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "2.5rem",
        fontWeight: 700,
        fontFamily: "monospace",
        lineHeight: 1,
        color: "var(--color-fg)",
        transform: `rotate(${rotation}deg) scaleX(${isNormal ? 1 : -1})`,
      }}
    >
      R
    </span>
  );
}

function SpatialQuestion({
  q,
  onAnswer,
}: {
  q: SpatialQ;
  onAnswer: (correct: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 w-full max-w-md">
      <p className="text-fg-dim text-sm text-center">
        How many pairs show the same symbol family? (rotation ignored)
      </p>
      <div className="flex gap-8">
        {q.pairs.map((pair, pi) => (
          <div key={pi} className="flex flex-col items-center gap-2">
            <span className="text-xs text-fg-dim uppercase tracking-wider">Pair {pi + 1}</span>
            <div className="flex gap-4 items-center px-6 py-5 rounded-lg bg-bg-elev border border-border">
              <RSymbol isNormal={pair[0]} rotation={q.rotations[pi * 2]} />
              <span className="text-fg-dim text-lg">↔</span>
              <RSymbol isNormal={pair[1]} rotation={q.rotations[pi * 2 + 1]} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <p className="text-fg-dim text-sm text-center mb-4">Matching pairs:</p>
        <div className="flex gap-4">
          {[0, 1, 2].map((n) => (
            <button
              key={n}
              onClick={() => onAnswer(n === q.answer)}
              className="w-14 h-14 rounded-lg bg-bg-elev border border-border hover:border-accent hover:bg-bg-glass text-fg text-xl font-semibold transition-colors cursor-pointer"
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Timer bar ─────────────────────────────────────────────────────────────────

function TimerBar({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = (timeLeft / total) * 100;
  const isLow = timeLeft <= 30;
  return (
    <div className="w-full flex items-center gap-4">
      <div className="flex-1 h-2 rounded-full bg-bg-elev overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${pct}%`,
            background: isLow ? "var(--color-red)" : "var(--color-accent)",
          }}
        />
      </div>
      <span
        className="text-sm font-mono font-semibold w-10 text-right"
        style={{ color: isLow ? "var(--color-red)" : "var(--color-fg-muted)" }}
      >
        {timeLeft}s
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function GiaTest() {
  const [phase, setPhase] = useState<Phase>({ type: "welcome" });
  const [timeLeft, setTimeLeft] = useState(SECTION_DURATION);
  const [qIndex, setQIndex] = useState(0);
  const [results, setResults] = useState<SectionResult[]>([]);

  // Use refs to avoid stale closures in the timer callback
  const currentResultRef = useRef<SectionResult>({ correct: 0, attempted: 0 });
  const phaseRef = useRef<Phase>({ type: "welcome" });
  const resultsRef = useRef<SectionResult[]>([]);
  const timerEndedRef = useRef(false);

  function syncPhase(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }

  // Timer
  useEffect(() => {
    if (phase.type !== "testing") return;
    timerEndedRef.current = false;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!timerEndedRef.current) {
            timerEndedRef.current = true;
            // Flush section via timeout to avoid setState-in-render
            setTimeout(() => {
              const p = phaseRef.current;
              if (p.type !== "testing") return;
              const r = currentResultRef.current;
              const newResults = [...resultsRef.current, r];
              resultsRef.current = newResults;
              setResults(newResults);
              syncPhase({ type: "section-complete", sectionIdx: p.sectionIdx });
              setTimeout(() => {
                if (p.sectionIdx >= SECTIONS.length - 1) {
                  syncPhase({ type: "results" });
                } else {
                  syncPhase({ type: "section-intro", sectionIdx: p.sectionIdx + 1 });
                }
              }, 2000);
            }, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.type === "testing" ? (phase as { sectionIdx: number }).sectionIdx : -1]);

  function startSection(idx: number) {
    currentResultRef.current = { correct: 0, attempted: 0 };
    setQIndex(0);
    setTimeLeft(SECTION_DURATION);
    syncPhase({ type: "testing", sectionIdx: idx });
  }

  function handleAnswer(correct: boolean) {
    currentResultRef.current = {
      correct: currentResultRef.current.correct + (correct ? 1 : 0),
      attempted: currentResultRef.current.attempted + 1,
    };
    setQIndex((i) => i + 1);
  }

  // Question pools — generated once per test
  const pools = useRef<{
    reasoning: ReasoningQ[];
    perceptual: PerceptualQ[];
    number: NumberQ[];
    word: WordQ[];
    spatial: SpatialQ[];
  } | null>(null);

  if (!pools.current) {
    pools.current = {
      reasoning: shuffle(reasoningQuestions),
      perceptual: generatePerceptualQuestions(80),
      number: generateNumberQuestions(80),
      word: shuffle(wordQuestions),
      spatial: generateSpatialQuestions(80),
    };
  }

  function getQuestion(sectionIdx: number) {
    const p = pools.current!;
    switch (sectionIdx) {
      case 0: return p.reasoning[qIndex % p.reasoning.length];
      case 1: return p.perceptual[qIndex % p.perceptual.length];
      case 2: return p.number[qIndex % p.number.length];
      case 3: return p.word[qIndex % p.word.length];
      case 4: return p.spatial[qIndex % p.spatial.length];
    }
  }

  // ── Welcome ────────────────────────────────────────────────────────────────

  if (phase.type === "welcome") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-10 px-6">
        <div className="text-center max-w-lg">
          <p className="text-xs font-mono uppercase tracking-widest text-accent mb-4">Practice Test</p>
          <h1 className="text-4xl font-bold text-fg mb-4">Thomas GIA</h1>
          <p className="text-fg-muted leading-relaxed">
            5 sections · 3 minutes each · No feedback during test
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {SECTIONS.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-elev border border-border"
            >
              <span className="text-xs font-mono text-accent w-12 shrink-0">{s.task}</span>
              <span className="text-sm text-fg">{s.name}</span>
              <span className="ml-auto text-xs text-fg-dim shrink-0">3 min</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => syncPhase({ type: "section-intro", sectionIdx: 0 })}
          className="px-10 py-3 rounded-lg bg-accent text-bg font-semibold text-base hover:bg-accent-bright transition-colors cursor-pointer"
        >
          Start Test
        </button>
      </div>
    );
  }

  // ── Section intro ──────────────────────────────────────────────────────────

  if (phase.type === "section-intro") {
    const s = SECTIONS[phase.sectionIdx];
    const idx = phase.sectionIdx;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6">
        <div className="text-center max-w-md">
          <p className="text-xs font-mono uppercase tracking-widest text-accent mb-3">
            {s.task} of 5
          </p>
          <h2 className="text-3xl font-bold text-fg mb-4">{s.name}</h2>
          <p className="text-fg-muted leading-relaxed">{s.description}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-fg-dim">
          <span
            className="w-2 h-2 rounded-full inline-block shrink-0"
            style={{ background: "var(--color-red)" }}
          />
          3 minutes · no feedback · answer as fast as you can
        </div>
        <button
          onClick={() => startSection(idx)}
          className="px-10 py-3 rounded-lg bg-accent text-bg font-semibold text-base hover:bg-accent-bright transition-colors cursor-pointer"
        >
          Begin
        </button>
      </div>
    );
  }

  // ── Section complete ───────────────────────────────────────────────────────

  if (phase.type === "section-complete") {
    const s = SECTIONS[phase.sectionIdx];
    const r = currentResultRef.current;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-6">
        <p className="text-xs font-mono uppercase tracking-widest text-fg-dim">{s.name}</p>
        <h2 className="text-2xl font-bold text-fg">Section Complete</h2>
        <p className="text-5xl font-bold text-accent">
          {r.correct} / {r.attempted}
        </p>
        <p className="text-fg-dim text-sm">answered correctly</p>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────────

  if (phase.type === "results") {
    const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
    const totalAttempted = results.reduce((s, r) => s + r.attempted, 0);
    const pct = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-10 px-6 py-12">
        <div className="text-center">
          <p className="text-xs font-mono uppercase tracking-widest text-accent mb-3">Results</p>
          <h2 className="text-3xl font-bold text-fg">Test Complete</h2>
        </div>
        <div className="w-full max-w-sm flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 rounded-lg bg-bg-elev border border-border"
            >
              <span className="text-xs font-mono text-accent w-14 shrink-0">{SECTIONS[i].task}</span>
              <span className="text-sm text-fg flex-1">{SECTIONS[i].name}</span>
              <span className="text-sm font-semibold text-fg">
                {r.correct}/{r.attempted}
              </span>
              <span className="text-xs text-fg-dim w-8 text-right shrink-0">
                {r.attempted > 0 ? Math.round((r.correct / r.attempted) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
        <div
          className="text-center pt-8 w-full max-w-sm"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <p className="text-fg-dim text-sm mb-2">Total Score</p>
          <p className="text-5xl font-bold text-accent">{pct}%</p>
          <p className="text-fg-dim text-sm mt-2">
            {totalCorrect} correct out of {totalAttempted} attempted
          </p>
        </div>
        <button
          onClick={() => {
            pools.current = null;
            resultsRef.current = [];
            currentResultRef.current = { correct: 0, attempted: 0 };
            setResults([]);
            syncPhase({ type: "welcome" });
          }}
          className="px-8 py-3 rounded-lg bg-bg-elev border border-border hover:border-accent text-fg font-medium transition-colors cursor-pointer"
        >
          Retake Test
        </button>
      </div>
    );
  }

  // ── Testing ────────────────────────────────────────────────────────────────

  const { sectionIdx } = phase;
  const s = SECTIONS[sectionIdx];
  const q = getQuestion(sectionIdx);

  return (
    <div className="flex flex-col min-h-screen px-6 py-6">
      <div className="w-full max-w-xl mx-auto flex flex-col gap-3 mb-10">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-accent uppercase tracking-wider">
            {s.task} — {s.name}
          </span>
          <span className="text-xs text-fg-dim">Q {qIndex + 1}</span>
        </div>
        <TimerBar timeLeft={timeLeft} total={SECTION_DURATION} />
      </div>

      <div className="flex-1 flex items-center justify-center">
        {sectionIdx === 0 && (
          <ReasoningQuestion key={qIndex} q={q as ReasoningQ} onAnswer={handleAnswer} />
        )}
        {sectionIdx === 1 && (
          <PerceptualQuestion key={qIndex} q={q as PerceptualQ} onAnswer={handleAnswer} />
        )}
        {sectionIdx === 2 && (
          <NumberQuestion key={qIndex} q={q as NumberQ} onAnswer={handleAnswer} />
        )}
        {sectionIdx === 3 && (
          <WordQuestion key={qIndex} q={q as WordQ} onAnswer={handleAnswer} />
        )}
        {sectionIdx === 4 && (
          <SpatialQuestion key={qIndex} q={q as SpatialQ} onAnswer={handleAnswer} />
        )}
      </div>
    </div>
  );
}
