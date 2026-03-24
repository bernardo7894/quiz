import { AutoProcessor, Qwen3_5ForConditionalGeneration, env } from '@huggingface/transformers';

// Only use remote models from HuggingFace Hub
env.allowLocalModels = false;

// Qwen3.5-0.8B: sub-1B parameter instruction-tuned model.
// At q4 quantisation it fits comfortably within browser memory while still
// being capable enough to follow the strict judge system prompt reliably.
// Using huggingworld ONNX-converted version for Transformers.js compatibility.
const MODEL_ID = 'huggingworld/Qwen3.5-0.8B-ONNX';

const SYSTEM_PROMPT = `You are a strict but fair trivia judge. You are evaluating a user's answer to a trivia question. 
You will be given the Question, the Exact Expected Answer, and the User's Answer.
Your rule: Determine if the User's Answer is semantically correct. Ignore minor typos, spelling errors, or slight variations in phrasing (e.g., 'A brothel' equals 'A whorehouse'). Do NOT accept overly broad answers (e.g., 'A building' is incorrect if the expected answer is 'A brothel'). Do NOT accept completely wrong answers.
Output strictly the word 'CORRECT' if they get the point, or 'INCORRECT' if they do not. Do not output any other text.`;

let processor = null;
let model = null;

async function loadModel() {
  self.postMessage({ type: 'loading-start', payload: { modelId: MODEL_ID } });

  // Try WebGPU first, fall back to WASM
  const deviceOptions = ['webgpu', 'wasm'];
  let lastError = null;

  for (const device of deviceOptions) {
    try {
      // Load processor and model separately for Qwen3.5 architecture
      processor = await AutoProcessor.from_pretrained(MODEL_ID);
      model = await Qwen3_5ForConditionalGeneration.from_pretrained(MODEL_ID, {
        dtype: 'q4',
        device,
        progress_callback: (info) => {
          self.postMessage({ type: 'loading-progress', payload: info });
        },
      });
      self.postMessage({ type: 'ready', payload: { device } });
      return;
    } catch (err) {
      lastError = err;
      // Try next device option
    }
  }

  self.postMessage({ type: 'error', payload: lastError?.message ?? 'Failed to load model' });
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'judge') {
    if (!model || !processor) {
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
      // Apply chat template and process inputs
      const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
      const inputs = await processor(text);

      // Generate output
      const outputs = await model.generate({
        ...inputs,
        max_new_tokens: 5,
        temperature: 0,
        do_sample: false,
      });

      // Decode the output, skipping the input tokens
      const decoded = processor.batch_decode(
        outputs.slice(null, [inputs.input_ids.dims.at(-1), null]),
        { skip_special_tokens: true }
      );

      const verdict = decoded[0].trim().toUpperCase().startsWith('CORRECT')
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
