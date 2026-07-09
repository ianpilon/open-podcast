// Proxies short text snippets to the local Kokoro TTS server so the browser
// can preview a voice reading the user's own content without CORS issues.
// App routes take precedence over the /api/* rewrite to the FastAPI backend.

const KOKORO_URL = process.env.KOKORO_URL || 'http://localhost:8880'
const MAX_PREVIEW_CHARS = 300

export async function POST(request: Request) {
  let voice: unknown
  let text: unknown
  try {
    ;({ voice, text } = await request.json())
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }
  if (typeof voice !== 'string' || !voice || typeof text !== 'string' || !text.trim()) {
    return new Response('voice and text are required', { status: 400 })
  }

  const upstream = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      input: text.trim().slice(0, MAX_PREVIEW_CHARS),
      voice,
      response_format: 'mp3',
    }),
  }).catch(() => null)

  if (!upstream || !upstream.ok) {
    return new Response('Voice preview failed', { status: 502 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
