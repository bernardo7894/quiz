# 🧠 AI Trivia Judge

A **Sporcle-style trivia game** where answers are graded by a real AI — running entirely in your browser. No server, no API keys, no cloud costs.

**Model:** [onnx-community/Qwen3.5-0.8B-Text-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX) loaded locally via [Transformers.js](https://huggingface.co/docs/transformers.js).

## How it works

1. On first load the model weights (~800 MB) are downloaded and cached by your browser.
2. Every answer you submit is evaluated by the local LLM running inside a Web Worker — your answers never leave your device.
3. The model judges semantic correctness (typos, paraphrases, synonyms are accepted; vague or wrong answers are rejected).

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + Vite 8 |
| AI library | `@huggingface/transformers` v3 (ONNX runtime) |
| Model | `onnx-community/Qwen3.5-0.8B-Text-ONNX` (q4f16 for WebGPU, q8 for WASM) |
| Inference thread | WebWorker (non-blocking UI) |
| Hosting | GitHub Pages (fully static) |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev
```

> **Browser requirement:** Chrome 113+ (WebGPU) or any modern browser with WebAssembly support as fallback.

---

## Building for Production

```bash
npm run build
```

The optimised static files are written to the **`dist/`** folder. You can serve them with any static host:

```bash
# Preview the production build locally
npm run preview
```

---

## Deploying to GitHub Pages

### Automatic (recommended) — GitHub Actions

The repository includes `.github/workflows/deploy.yml`. After enabling GitHub Pages in your repository settings, every push to `main` will automatically build and deploy the site.

**One-time setup:**

1. Go to your repository on GitHub.
2. Navigate to **Settings → Pages**.
3. Under **Source**, select **"GitHub Actions"**.
4. Push (or merge) to `main` — the workflow runs automatically.

Your site will be live at:
```
https://<your-github-username>.github.io/quiz/
```

### Manual deployment

```bash
npm run build

# Option A: Use gh-pages npm package
npx gh-pages -d dist

# Option B: Copy dist/ contents to your static host manually
```

### Changing the base path

If your repository is **not** named `quiz`, update `vite.config.js`:

```js
base: '/your-repo-name/',
```

If you are using a **custom domain** (CNAME), set:

```js
base: '/',
```

---

## Customising the Questions

Edit `public/questions.json`. The format is a JSON array:

```json
[
  { "Question": "What is the capital of France?", "Expected_Answer": "Paris" },
  { "Question": "Who painted the Mona Lisa?",     "Expected_Answer": "Leonardo da Vinci" }
]
```

You can also provide a CSV file with columns `Question` and `Expected_Answer` and convert it to JSON with any standard tool.

---

## Project Structure

```
quiz/
├── public/
│   └── questions.json          # Quiz questions (editable)
├── src/
│   ├── worker.js               # Web Worker — loads model, runs inference
│   ├── App.jsx                 # Main React UI
│   ├── App.css                 # Styles
│   └── main.jsx                # React entry point
├── .github/workflows/
│   └── deploy.yml              # Auto-deploy to GitHub Pages
├── index.html
└── vite.config.js
```

---

*Last cache invalidation: March 25, 2026*

