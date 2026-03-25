import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

// Phi-3-mini-4k-instruct: 3.8B model with excellent instruction following
// Much better at understanding semantic equivalence than Qwen2.5-0.5B
const MODEL_ID = 'onnx-community/Phi-3-mini-4k-instruct';

const SYSTEM_PROMPT = `You are a trivia judge. Output ONLY one word: CORRECT or INCORRECT.

Rules:
- Accept answers with correct meaning even if wording differs
- Accept correct numbers in different formats (e.g., "300000" = "300,000" = "3e5")
- Accept correct units with different notation (e.g., "km/s" = "kilometers per second")
- Reject answers that are wrong or too vague

Examples:
Q: "What is the speed of light?" Expected: "300000 km/s" User: "300000000 m/s" → CORRECT
Q: "What is the speed of light?" Expected: "300000 km/s" User: "3e8 meters per second" → CORRECT
Q: "Capital of France?" Expected: "Paris" User: "paris" → CORRECT
Q: "Capital of France?" Expected: "Paris" User: "Lyon" → INCORRECT
Q: "Who painted Mona Lisa?" Expected: "da Vinci" User: "Leonardo" → CORRECT
Q: "Who painted Mona Lisa?" Expected: "da Vinci" User: "Michelangelo" → INCORRECT`;

let generator = null;

async function loadModel() {
  self.postMessage({ type: 'loading-start', payload: { modelId: MODEL_ID } });

  // Phi-3 works best with q4 quantization
  const deviceConfigs = [
    { device: 'wasm', dtype: 'q4' },
    { device: 'webgpu', dtype: 'q4' },
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
        progress_callback: (info) => {
          self.postMessage({ type: 'loading-progress', payload: info });
        },
      });
      self.postMessage({ type: 'ready', payload: { device, dtype } });
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Failed to load with ${device}/${dtype}:`, err.message);
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
Expected Answer: ${expectedAnswer}
User Answer: ${userAnswer}

Judge (output ONLY CORRECT or INCORRECT):`;

    try {
      const output = await generator(userPrompt, {
        max_new_tokens: 5,
        temperature: 0,
        do_sample: false,
      });

      const generated = output[0].generated_text;
      const text = typeof generated === 'string' ? generated : 
                   Array.isArray(generated) ? generated.at(-1)?.content ?? '' : 
                   String(generated);

      // More robust parsing - look for CORRECT/INCORRECT anywhere in output
      const upper = text.toUpperCase();
      let verdict = 'INCORRECT';
      
      if (upper.includes('CORRECT') && !upper.includes('INCORRECT')) {
        verdict = 'CORRECT';
      } else if (upper.includes('INCORRECT')) {
        verdict = 'INCORRECT';
      }

      console.log('Model output:', text, '| Verdict:', verdict);
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
