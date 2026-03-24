import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const TIMER_SECONDS = 600; // 10 minutes

// ─── Loading Screen ───────────────────────────────────────────────────────────
function LoadingScreen({ progress, statusText, error }) {
  const pct = Math.min(100, Math.round((progress ?? 0) * 100));

  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="loading-icon">🧠</div>
        <h1>AI Trivia Judge</h1>
        <p className="loading-subtitle">Powered by Qwen2.5-0.5B — running entirely in your browser</p>

        {error ? (
          <div className="loading-error">
            <p>⚠️ Failed to load model: {error}</p>
            <p className="loading-error-hint">
              Make sure you&apos;re using a WebGPU-capable browser (Chrome 113+) or a browser with WebAssembly support.
            </p>
          </div>
        ) : (
          <>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="loading-status">{statusText || 'Initialising model…'}</p>
            <p className="loading-hint">
              The AI judge (≈400 MB) is being downloaded and cached in your browser. This only happens once.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function Timer({ secondsLeft }) {
  const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const s = String(secondsLeft % 60).padStart(2, '0');
  const urgent = secondsLeft <= 60;
  return (
    <div className={`timer ${urgent ? 'timer-urgent' : ''}`}>
      ⏱ {m}:{s}
    </div>
  );
}

// ─── Question Row ─────────────────────────────────────────────────────────────
function QuestionRow({ item, index, isSelected, onSelect }) {
  return (
    <div
      className={`question-row ${isSelected ? 'selected' : ''} ${item.status}`}
      onClick={() => !item.answered && onSelect(index)}
      role="button"
      tabIndex={item.answered ? -1 : 0}
      onKeyDown={(e) => e.key === 'Enter' && !item.answered && onSelect(index)}
      aria-label={`Question ${index + 1}: ${item.question}`}
    >
      <span className="q-number">{index + 1}</span>
      <span className="q-text">{item.question}</span>
      <span className={`q-answer ${item.answered ? 'revealed' : 'hidden'}`}>
        {item.answered ? item.expectedAnswer : '?'}
      </span>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Model / loading state
  const [modelState, setModelState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState('');
  const [loadError, setLoadError] = useState(null);

  // Quiz state
  const [questions, setQuestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputState, setInputState] = useState('idle'); // 'idle' | 'judging' | 'incorrect'
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [gameOver, setGameOver] = useState(false);

  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const pendingRef = useRef({}); // id → resolve

  // ── Boot worker ────────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.addEventListener('error', (event) => {
      const msg = event.error?.message || event.message || 'Worker failed to initialize. Please refresh the page.';
      setLoadError(msg);
      setModelState('error');
    });

    worker.addEventListener('message', (event) => {
      const { type, payload } = event.data;

      if (type === 'loading-progress') {
        if (payload.status === 'download' || payload.status === 'progress') {
          const p = typeof payload.progress === 'number' ? payload.progress / 100 : 0;
          setLoadProgress((prev) => Math.max(prev, p));
          setLoadStatus(`Downloading ${payload.file ?? 'model weights'}… ${Math.round(p * 100)}%`);
        } else if (payload.status === 'initiate') {
          setLoadStatus(`Initialising ${payload.file ?? 'model'}…`);
        } else if (payload.status === 'done') {
          setLoadProgress(1);
          setLoadStatus('Model loaded! Starting quiz…');
        }
      }

      if (type === 'ready') {
        setLoadProgress(1);
        setLoadStatus('Model ready!');
        setTimeout(() => setModelState('ready'), 600);
      }

      if (type === 'error') {
        setLoadError(payload);
        setModelState('error');
      }

      if (type === 'result') {
        const { id, verdict } = payload;
        if (pendingRef.current[id]) {
          pendingRef.current[id](verdict);
          delete pendingRef.current[id];
        }
      }
    });

    return () => worker.terminate();
  }, []);

  // ── Load questions ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('./questions.json')
      .then((r) => r.json())
      .then((data) => {
        setQuestions(
          data.map((q, i) => ({
            id: i,
            question: q.Question,
            expectedAnswer: q.Expected_Answer,
            answered: false,
            status: 'unanswered',
          }))
        );
        // Auto-select the first question once questions are loaded
        setSelectedIndex(0);
      });
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (modelState !== 'ready' || gameOver) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setGameOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [modelState, gameOver]);

  // ── Focus input when question selected ────────────────────────────────────
  useEffect(() => {
    if (modelState === 'ready' && selectedIndex !== null) {
      inputRef.current?.focus();
    }
  }, [selectedIndex, modelState]);

  // ── Submit answer ──────────────────────────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    if (
      selectedIndex === null ||
      !inputValue.trim() ||
      inputState === 'judging' ||
      gameOver
    ) return;

    const q = questions[selectedIndex];
    if (!q || q.answered) return;

    setInputState('judging');

    const id = `${q.id}-${Date.now()}`;
    const verdict = await new Promise((resolve) => {
      pendingRef.current[id] = resolve;
      workerRef.current.postMessage({
        type: 'judge',
        payload: {
          id,
          question: q.question,
          expectedAnswer: q.expectedAnswer,
          userAnswer: inputValue.trim(),
        },
      });
    });

    if (verdict === 'CORRECT') {
      setQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id ? { ...item, answered: true, status: 'correct' } : item
        )
      );
      setScore((s) => s + 1);
      setInputValue('');
      setInputState('idle');

      // Move to next unanswered question
      setQuestions((prev) => {
        const next = prev.findIndex((item, i) => i > selectedIndex && !item.answered);
        const fallback = prev.findIndex((item) => !item.answered);
        const nextIdx = next !== -1 ? next : fallback !== -1 ? fallback : null;
        setSelectedIndex(nextIdx);
        return prev;
      });

      // Check if all answered
      setQuestions((prev) => {
        if (prev.every((item) => item.answered || item.id === q.id)) {
          setGameOver(true);
        }
        return prev;
      });
    } else {
      setInputState('incorrect');
      setTimeout(() => {
        setInputState('idle');
        setInputValue('');
        inputRef.current?.focus();
      }, 800);
    }
  }, [selectedIndex, inputValue, inputState, gameOver, questions]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submitAnswer();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (modelState === 'loading' || modelState === 'error') {
    return (
      <LoadingScreen
        progress={loadProgress}
        statusText={loadStatus}
        error={modelState === 'error' ? loadError : null}
      />
    );
  }

  const totalQuestions = questions.length;
  const selectedQuestion = selectedIndex !== null ? questions[selectedIndex] : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1 className="app-title">🧠 AI Trivia</h1>
        <div className="header-right">
          <div className="score">
            {score} / {totalQuestions}
          </div>
          <Timer secondsLeft={timeLeft} />
        </div>
      </header>

      {/* Game Over Banner */}
      {gameOver && (
        <div className="game-over-banner">
          {timeLeft === 0 ? '⏰ Time is up!' : '🎉 You answered all questions!'}{' '}
          Final score: <strong>{score}/{totalQuestions}</strong>
          <button
            className="restart-btn"
            onClick={() => {
              setScore(0);
              setTimeLeft(TIMER_SECONDS);
              setGameOver(false);
              setSelectedIndex(null);
              setInputValue('');
              setInputState('idle');
              setQuestions((prev) =>
                prev.map((q) => ({ ...q, answered: false, status: 'unanswered' }))
              );
            }}
          >
            Play Again
          </button>
        </div>
      )}

      {/* Answer Input */}
      {!gameOver && (
        <div className="input-section">
          <div className="input-prompt">
            {selectedQuestion
              ? `Answering: "${selectedQuestion.question}"`
              : 'Click a question below to select it'}
          </div>
          <div className="input-row">
            <input
              ref={inputRef}
              type="text"
              className={`answer-input ${inputState}`}
              placeholder="Type your answer and press Enter…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={selectedIndex === null || inputState === 'judging'}
              aria-label="Answer input"
            />
            {inputState === 'judging' && <span className="spinner" aria-label="Judging…" />}
          </div>
        </div>
      )}

      {/* Question Grid */}
      <main className="question-list">
        {questions.map((item, i) => (
          <QuestionRow
            key={item.id}
            item={item}
            index={i}
            isSelected={selectedIndex === i}
            onSelect={setSelectedIndex}
          />
        ))}
      </main>

      <footer className="footer">
        AI judge runs locally in your browser — no data leaves your device.
      </footer>
    </div>
  );
}

