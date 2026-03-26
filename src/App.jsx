import { useState, useEffect, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import './App.css';

const TIMER_SECONDS = 600; // 10 minutes
const STORAGE_KEY = 'quiz_questions_cache';

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart }) {
  const [csvError, setCsvError] = useState('');
  const [cachedData, setCachedData] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load cached questions', e);
    }
    return null;
  });

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setCsvError(`CSV Error: ${results.errors[0].message}`);
          return;
        }

        const data = results.data;
        // Try to find question/answer columns
        const questions = [];
        
        for (const row of data) {
          // Flexible column matching
          const qText = row['Hint'] || row['Question'] || row['question'] || row['hint'];
          const aText = row['Answer'] || row['Expected_Answer'] || row['answer'] || row['expected_answer'];

          if (qText && aText) {
            questions.push({
              id: crypto.randomUUID(),
              question: qText.trim(),
              expectedAnswer: aText.trim(),
              answered: false,
              status: 'unanswered'
            });
          }
        }

        if (questions.length === 0) {
          setCsvError('No valid questions found. CSV must have headers like "Hint"/"Question" and "Answer".');
          return;
        }

        // Cache and start
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
        } catch (e) {
          console.warn('Failed to save to localStorage', e);
        }
        onStart(questions);
      },
      error: (err) => {
        setCsvError(`Parse error: ${err.message}`);
      }
    });
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>🧠 AI Trivia Setup</h1>
        <p>Import a CSV file to start the quiz.</p>
        
        <div className="file-upload-area">
          <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileUpload} 
            id="csv-upload" 
            className="file-input"
          />
          <label htmlFor="csv-upload" className="file-label">
            📂 Select CSV File
          </label>
        </div>

        {csvError && <p className="error-msg">{csvError}</p>}

        {cachedData && (
          <div className="cached-data-section">
            <p>Found a previous quiz with {cachedData.length} questions.</p>
            <button className="primary-btn" onClick={() => onStart(cachedData)}>
              Resume Previous Quiz
            </button>
            <button className="secondary-btn" onClick={() => {
              localStorage.removeItem(STORAGE_KEY);
              setCachedData(null);
            }}>
              Clear Saved Quiz
            </button>
          </div>
        )}

        <div className="default-option">
          <p>Or use the default set:</p>
          <button className="secondary-btn" onClick={() => {
             // Fetch default questions
             fetch('./questions.json')
              .then(r => r.json())
              .then(data => {
                 const qs = data.map((q, i) => ({
                    id: i,
                    question: q.Question,
                    expectedAnswer: q.Expected_Answer,
                    answered: false,
                    status: 'unanswered',
                  }));
                  onStart(qs);
              })
              .catch(() => setCsvError("Failed to load default questions"));
          }}>
            Load Default Questions
          </button>
        </div>
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
        <p className="loading-subtitle">Powered by Qwen3.5-0.8B — running entirely in your browser</p>

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
              The AI judge (≈800 MB) is being downloaded and cached in your browser. This only happens once.
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

  // App flow state
  const [screen, setScreen] = useState('loading'); // 'loading' -> 'setup' -> 'quiz'

  // Quiz state
  const [questions, setQuestions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputState, setInputState] = useState('idle'); // 'idle' | 'judging' | 'incorrect'
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [gameOver, setGameOver] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [lastDebugLog, setLastDebugLog] = useState(null);

  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const pendingRef = useRef({}); // id → resolve

  // ── Boot worker ────────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

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
        setTimeout(() => {
            setModelState('ready');
            setScreen('setup'); // Go to setup after model load
        }, 600);
      }

      if (type === 'error') {
        setLoadError(payload);
        setModelState('error');
      }

      if (type === 'result') {
        const { id, verdict, debugInfo } = payload;
        if (pendingRef.current[id]) {
          pendingRef.current[id](verdict);
          delete pendingRef.current[id];
        }
        if (debugInfo) {
           setLastDebugLog(debugInfo);
        }
      }
    });

    worker.addEventListener('error', (event) => {
      setLoadError(event.error?.message || event.message || 'Unexpected worker error');
      setModelState('error');
    });

    return () => worker.terminate();
  }, []);

  // ── Start Quiz ─────────────────────────────────────────────────────────────
  const startQuiz = (loadedQuestions) => {
    setQuestions(loadedQuestions);
    setSelectedIndex(0);
    setScreen('quiz');
    setTimeLeft(TIMER_SECONDS);
    setScore(0);
    setGameOver(false);
  };

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'quiz' || gameOver) return;
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
  }, [screen, gameOver]);

  // ── Focus input when question selected ────────────────────────────────────
  useEffect(() => {
    if (screen === 'quiz' && selectedIndex !== null) {
      inputRef.current?.focus();
    }
  }, [selectedIndex, screen]);

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
          debug: debugMode
        },
      });
    });

    if (verdict === 'CORRECT') {
      setQuestions((prev) => {
        const updated = prev.map((item) =>
          item.id === q.id ? { ...item, answered: true, status: 'correct' } : item
        );
        // Persist progress if using localStorage
        // Note: For simplicity, we just save the initial list. If we want to save progress, we'd update here.
        // Let's update storage if valid
        try {
             if (localStorage.getItem(STORAGE_KEY)) {
                 localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
             }
        } catch {
          // ignore
        }
        return updated;
      });
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

  const handleKeyDown = useCallback((e) => {
    if (screen !== 'quiz' || gameOver) return;

    // Up/Down navigation
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
            if (prev === null) return 0;
            return Math.max(0, prev - 1);
        });
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
            if (prev === null) return 0;
            return Math.min(questions.length - 1, prev + 1);
        });
    }
  }, [screen, gameOver, questions.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleInputKeyDown = (e) => {
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

  if (screen === 'setup') {
      return <SetupScreen onStart={startQuiz} />;
  }

  const totalQuestions = questions.length;
  const selectedQuestion = selectedIndex !== null ? questions[selectedIndex] : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1 className="app-title">🧠 AI Trivia</h1>
        <div className="header-right">
          <button 
             className="debug-toggle-btn"
             onClick={() => setDebugMode(!debugMode)}
             title="Toggle Debug Mode"
          >
             {debugMode ? '🐞' : '⚙️'}
          </button>
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
               // Reset logic
               setScreen('setup'); // Go back to setup to choose new quiz or same
            }}
          >
            New Game
          </button>
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

      {/* Fixed Bottom Input */}
      {!gameOver && (
        <div className="input-section-fixed">
          <div className="input-container-inner">
             <div className="input-prompt">
                {selectedQuestion
                  ? `Answering Q${selectedIndex + 1}: ${selectedQuestion.question}`
                  : 'Select a question to answer'}
              </div>
              <div className="input-row">
                <input
                  ref={inputRef}
                  type="text"
                  className={`answer-input ${inputState}`}
                  placeholder={selectedQuestion ? "Type answer..." : "Select a question first..."}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={selectedIndex === null || inputState === 'judging'}
                  aria-label="Answer input"
                />
                {inputState === 'judging' && <span className="spinner" aria-label="Judging…" />}
              </div>
          </div>
        </div>
      )}

      {debugMode && lastDebugLog && (
        <div className="debug-panel">
            <h4>🐞 AI Debugger</h4>
            <div className="debug-row">
                <strong>Verdict:</strong> <span>{lastDebugLog.generatedText?.trim()}</span>
            </div>
            <div className="debug-row">
                <strong>Execution Time:</strong> <span>{lastDebugLog.executionTimeMs} ms</span>
            </div>
            <div className="debug-row">
                <strong>Device:</strong> <span>{lastDebugLog.device} ({lastDebugLog.dtype})</span>
            </div>
            {lastDebugLog.loadErrors && (
               <div className="debug-errors">
                 <strong>Load Errors (Fallback triggered):</strong>
                 <ul>
                   {lastDebugLog.loadErrors.map((err, i) => (
                     <li key={i}>{err.device} ({err.dtype}): {err.error}</li>
                   ))}
                 </ul>
               </div>
            )}
            <details>
                <summary>Raw JSON Output</summary>
                <pre>{JSON.stringify(lastDebugLog, null, 2)}</pre>
            </details>
            <button className="close-debug" onClick={() => setLastDebugLog(null)}>Close</button>
        </div>
      )}

      <footer className="footer">
        AI judge runs locally in your browser — no data leaves your device.
      </footer>
    </div>
  );
}

