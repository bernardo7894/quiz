import { pipeline, env } from '@huggingface/transformers';

// Only use remote models from HuggingFace Hub
env.allowLocalModels = false;

// Qwen2.5-0.5B-Instruct: Smaller model that works reliably in browsers
// 1.5B model causes WebAssembly crashes due to memory limits
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

const SYSTEM_PROMPT = `You are a strict but fair trivia judge. You are evaluating a user's answer to a trivia question. 
You will be given the Question, the Exact Expected Answer, and the User's Answer.
Your rule: Determine if the User's Answer is semantically correct. Ignore minor typos, spelling errors, or slight variations in phrasing (e.g., 'A brothel' equals 'A whorehouse'). Do NOT accept overly broad answers (e.g., 'A building' is incorrect if the expected answer is 'A brothel'). Do NOT accept completely wrong answers.
Output strictly the word 'CORRECT' if they get the point, or 'INCORRECT' if they do not. Do not output any other text.`;

let generator = null;

async function loadModel() {
  self.postMessage({ type: 'loading-start', payload: { modelId: MODEL_ID } });

  // Try WASM backends first (more reliable), then WebGPU
  // Start with q8 for maximum compatibility, then try q4 for smaller memory footprint
  const deviceConfigs = [
    { device: 'wasm', dtype: 'q8' },     // Most compatible, good quality
    { device: 'wasm', dtype: 'q4' },     // Smaller memory footprint
    { device: 'webgpu', dtype: 'q4' },   // GPU acceleration if available
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
      // Try next configuration
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
User Answer: ${userAnswer}`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    try {
      const output = await generator(messages, {
        max_new_tokens: 10,
        temperature: 0,
        do_sample: false,
      });

      // Extract the last assistant message from the generated output
      const generated = output[0].generated_text;
      const assistantContent = Array.isArray(generated)
        ? (generated.at(-1)?.content ?? '')
        : generated;

      const verdict = assistantContent.trim().toUpperCase().startsWith('CORRECT')
        ? 'CORRECT'
        : 'INCORRECT';

      self.postMessage({ type: 'result', payload: { id, verdict } });
    } catch (err) {
      self.postMessage({
        type: 'result',
        payload: { id, verdict: 'ERROR', error: err.message },
      });
    }
  }
});

// Auto-load the model when the worker starts
loadModel();
