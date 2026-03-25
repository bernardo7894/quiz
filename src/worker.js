import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// Qwen2.5-1.5B-Instruct: Good balance of size and intelligence
const MODEL_ID = 'onnx-community/Qwen2.5-1.5B-Instruct';

const SYSTEM_PROMPT = `You are a trivia judge. Output ONLY one word: CORRECT or INCORRECT.

Accept:
- Correct answers with different wording
- Numbers in any format (300000 = 300,000 = 3e5 = 300k)
- Units with different notation (km/s = kilometers per second)
- Common name variations (Leonardo = da Vinci = Leonardo da Vinci)

Reject:
- Wrong answers
- Completely unrelated answers

Examples:
Q: "Speed of light?" Expected: "300000 km/s" User: "300000000 m/s" → CORRECT
Q: "Speed of light?" Expected: "300000 km/s" User: "3e8 m/s" → CORRECT
Q: "Capital of France?" Expected: "Paris" User: "paris" → CORRECT
Q: "Capital of France?" Expected: "Paris" User: "Lyon" → INCORRECT
Q: "Harry Potter author?" Expected: "J.K. Rowling" User: "Joanne Rowling" → CORRECT
Q: "Harry Potter author?" Expected: "J.K. Rowling" User: "Stephen King" → INCORRECT
Q: "Mona Lisa painter?" Expected: "da Vinci" User: "Leonardo" → CORRECT
Q: "Mona Lisa painter?" Expected: "da Vinci" User: "Picasso" → INCORRECT`;

let generator = null;

async function loadModel() {
  self.postMessage({ type: 'loading-start', payload: { modelId: MODEL_ID } });

  // Try q8 first (best quality), then q4 (smaller)
  // WASM only for stability
  const deviceConfigs = [
    { device: 'wasm', dtype: 'q8' },
    { device: 'wasm', dtype: 'q4' },
  ];
  let lastError = null;

  for (const { device, dtype } of deviceConfigs) {
    try {
      self.postMessage({ 
        type: 'loading-progress', 
        payload: { status: 'initiate', file: `model (${dtype})` } 
      });
      
      generator = await pipeline('text-generation', MODEL_ID, {
        dtype,
        device,
        // Increase memory budget for 1.5B model
        max_new_tokens: 10,
        progress_callback: (info) => {
          self.postMessage({ type: 'loading-progress', payload: info });
        },
      });
      self.postMessage({ type: 'ready', payload: { device, dtype } });
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Failed ${device}/${dtype}:`, err.message);
    }
  }

  self.postMessage({ 
    type: 'error', 
    payload: lastError?.message || lastError?.toString() || 'Failed to load model' 
  });
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'judge') {
    if (!generator) {
      self.postMessage({
        type: 'result',
        payload: { id: payload.id, verdict: 'ERROR', error: 'Model not loaded' },
      });
      return;
    }

    const { id, question, expectedAnswer, userAnswer } = payload;

    const userPrompt = `Question: ${question}
Expected: ${expectedAnswer}
User: ${userAnswer}
Judge (CORRECT or INCORRECT only):`;

    try {
      const output = await generator(userPrompt, {
        max_new_tokens: 5,
        temperature: 0,
        do_sample: false,
      });

      const text = output[0]?.generated_text || '';
      const upper = text.toUpperCase();
      
      // Parse output - look for CORRECT/INCORRECT
      let verdict = 'INCORRECT';
      if (upper.includes('CORRECT') && !upper.includes('INCORRECT')) {
        verdict = 'CORRECT';
      }
      
      console.log('Output:', text.trim(), '| Verdict:', verdict);
      self.postMessage({ type: 'result', payload: { id, verdict } });
    } catch (err) {
      self.postMessage({
        type: 'result',
        payload: { id, verdict: 'ERROR', error: err.message },
      });
    }
  }
});

loadModel();
