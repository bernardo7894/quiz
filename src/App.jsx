import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const TIMER_SECONDS = 600; // 10 minutes

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one question.' };

  function parseLine(line) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let j = i + 1;
        let field = '';
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') {
            field += '"';
            j += 2;
          } else if (line[j] === '"') {
            j++;
            break;
          } else {
            field += line[j++];
          }
        }
        fields.push(field);
        if (line[j] === ',') j++;
        i = j;
      } else {
        const end = line.indexOf(',', i);
        const stop = end === -1 ? line.length : end;
        fields.push(line.slice(i, stop).trim());
        i = stop + 1;
      }
    }
    return fields;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const hintIdx = headers.indexOf('hint');
  const answerIdx = headers.indexOf('answer');

  if (hintIdx === -1 || answerIdx === -1) {
    return { error: 'CSV must have "Hint" and "Answer" columns.' };
  }

  const questions = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseLine(lines[i]);
    const hint = fields[hintIdx]?.trim();
    const answer = fields[answerIdx]?.trim();
    if (hint && answer) questions.push({ question: hint, expectedAnswer: answer });
  }

  if (questions.length === 0) return { error: 'No valid questions found in CSV.' };
  return { questions };
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ defaultCount, onStart }) {
  const [csvQuestions, setCsvQuestions] = useState(null);
  const [csvError, setCsvError] = useState('');
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = parseCSV(ev.target.result);
      if (result.error) {
        setCsvError(result.error);
        setCsvQuestions(null);
      } else {
        setCsvError('');
        setCsvQuestions(result.questions);
      }
    };
    reader.readAsText(file);
  }

  const questionCount = csvQuestions ? csvQuestions.length : defaultCount;
  const source = csvQuestions ? 'imported' : 'default';

  return (
    <div className="loading-screen">
      <div className="loading-card setup-card">
        <div className="loading-icon">📋</div>
        <h1>Set Up Your Quiz</h1>
        <p className="loading-subtitle">Import your own questions or play with the defaults</p>

        <div className="setup-section">
          <p className="setup-label">Import questions from CSV</p>
          <p className="setup-hint">
            The file must have <code>Hint</code> and <code>Answer</code> column headers.
          </p>
          <button className="csv-import-btn" onClick={() => fileInputRef.current?.click()}>
            📂 Choose CSV File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          {csvError && <p className="csv-error">{csvError}</p>}
          {csvQuestions && (
            <p className="csv-success">
              ✓ {csvQuestions.length} question{csvQuestions.length !== 1 ? 's' : ''} loaded from CSV
            </p>
          )}
        </div>

        <button className="start-btn" onClick={() => onStart(csvQuestions)}>
          ▶ Start Quiz ({questionCount} {source} question{questionCount !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}

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
  const [gameStarted, setGameStarted] = useState(false);
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
    if (!gameStarted || gameOver) return;
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
  }, [gameStarted, gameOver]);

  // ── Focus input when question selected ────────────────────────────────────
  useEffect(() => {
    if (gameStarted && selectedIndex !== null) {
      inputRef.current?.focus();
    }
  }, [selectedIndex, gameStarted]);

  // ── Start game (from setup screen) ────────────────────────────────────────
  const handleStart = useCallback((csvQuestions) => {
    if (csvQuestions) {
      setQuestions(
        csvQuestions.map((q, i) => ({
          id: i,
          question: q.question,
          expectedAnswer: q.expectedAnswer,
          answered: false,
          status: 'unanswered',
        }))
      );
      setSelectedIndex(0);
    }
    setGameStarted(true);
  }, []);

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

  // ── Navigate between unanswered questions ─────────────────────────────────
  const navigateQuestion = useCallback((direction) => {
    if (gameOver || questions.length === 0) return;
    const unanswered = questions
      .map((q, i) => ({ ...q, index: i }))
      .filter((q) => !q.answered);
    if (unanswered.length === 0) return;
    const currentPos = unanswered.findIndex((q) => q.index === selectedIndex);
    let nextPos;
    if (direction === 'up') {
      nextPos = currentPos <= 0 ? unanswered.length - 1 : currentPos - 1;
    } else {
      nextPos = currentPos >= unanswered.length - 1 ? 0 : currentPos + 1;
    }
    setSelectedIndex(unanswered[nextPos].index);
  }, [gameOver, questions, selectedIndex]);

  // ── Global arrow-key navigation ────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const onKey = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateQuestion(e.key === 'ArrowUp' ? 'up' : 'down');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [gameStarted, gameOver, navigateQuestion]);

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

  if (!gameStarted) {
    return <SetupScreen defaultCount={questions.length} onStart={handleStart} />;
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

