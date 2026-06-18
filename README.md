# Open Podcast

Open Podcast is a local-first podcast generator. Drop in a document (PDF, text, markdown, CSV, or JSON) and it writes a multi-speaker episode and renders it to audio, entirely on your own machine using local models.

It is a focused fork of [Open Notebook](https://github.com/lfnovo/open-notebook) (MIT), stripped down to do one thing well: turn documents into podcasts.

![Open Podcast](assets/screenshot.png)

## What's different from Open Notebook

Open Notebook is a broad, privacy-focused research assistant (notebooks, sources, notes, chat, search, and podcasts). Open Podcast keeps the podcast engine and removes the rest, with the workflow rebuilt around uploading a document and generating an episode:

- **Podcast-only navigation:** Generate Podcast, Completed Episodes, Speaker configurations, Episode formatting, Content.
- **Drag-and-drop upload** as the primary way to add content (PDF, TXT, MD, CSV, JSON), plus import-from-URL.
- **Client-side PDF text extraction** (via pdf.js) so PDFs work without extra setup.
- **Auto-filled episode name** taken from the uploaded file.
- **Currently Processing panel** on the Generate page so you can watch an episode render, then find it under Completed Episodes when it's done.
- **Smart model routing:** small documents use a fast local model; large ones automatically switch to a more capable model, with a heads-up that it may take a little longer.
- **Auto-condensing:** documents too large for the model's context window are summarized first (map-reduce) so generation still succeeds.

## How it works

Everything runs locally, no data leaves your machine:

- **Text** (outline + script): [Ollama](https://ollama.com) — `qwen2.5` for small documents, `qwen2.5:14b` for large ones
- **Voices** (text-to-speech): [Kokoro](https://github.com/remsky/Kokoro-FastAPI)
- **API:** FastAPI (port 5055)
- **Database:** SurrealDB
- **UI:** Next.js (this fork's frontend lives in `frontend/`)

## Quick start

Prerequisites: [Docker](https://www.docker.com/), [Ollama](https://ollama.com), and [Node.js](https://nodejs.org/).

1. Pull the local models:
   ```bash
   ollama pull qwen2.5         # fast model for small documents
   ollama pull qwen2.5:14b     # capable model for large documents
   ollama pull nomic-embed-text
   ```
   Large documents need a bigger context window, so start Ollama with:
   ```bash
   OLLAMA_CONTEXT_LENGTH=32768 ollama serve
   ```

2. Create a local `.env` with an encryption key (used to encrypt any stored API keys):
   ```bash
   echo "OPEN_NOTEBOOK_ENCRYPTION_KEY=$(openssl rand -hex 24)" > .env
   ```

3. Start the API, database, and Kokoro voices:
   ```bash
   docker compose up -d
   docker run -d --name kokoro-tts -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
   ```

4. Run the Open Podcast UI from source:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:3000.

> **Note:** `docker compose` runs the upstream prebuilt API image. The Open Podcast interface is the Next.js app in `frontend/`, so run it with `npm run dev` (or build the included `Dockerfile`).

Before generating, open **Models** to register your local Ollama and Kokoro models, then set them on your profiles under **Speaker configurations** and **Episode formatting**.

## Credit

Built on [Open Notebook](https://github.com/lfnovo/open-notebook) by lfnovo, MIT licensed (see [LICENSE](LICENSE)). The upstream project is a full research assistant and is well worth a look. This is a personal fork and a work in progress.
