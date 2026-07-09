// Proxies voice-clone management to the local voice gateway so the browser
// can list, create, and delete cloned voices without CORS issues. The gateway
// transcribes the uploaded recording and serves the voice via /v1/audio/speech.

const GATEWAY_URL = process.env.KOKORO_URL || 'http://localhost:8881'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function GET() {
  const upstream = await fetch(`${GATEWAY_URL}/clone/voices`).catch(() => null)
  if (!upstream || !upstream.ok) {
    return Response.json([], { status: 200 })
  }
  return Response.json(await upstream.json())
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return new Response('multipart form data required', { status: 400 })
  }
  const name = String(form.get('name') ?? '').trim()
  const file = form.get('file')
  if (!name || !(file instanceof File)) {
    return new Response('name and file are required', { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return new Response('recording too large', { status: 413 })
  }

  const audio = Buffer.from(await file.arrayBuffer()).toString('base64')
  const upstream = await fetch(`${GATEWAY_URL}/clone/voices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, audio_b64: audio }),
  }).catch(() => null)

  if (!upstream) {
    return new Response('voice gateway unavailable', { status: 502 })
  }
  return Response.json(await upstream.json(), { status: upstream.status })
}

export async function PATCH(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[a-z0-9_]+$/.test(id)) {
    return new Response('invalid voice id', { status: 400 })
  }
  const body = await request.json().catch(() => null)
  if (!body) {
    return new Response('JSON body required', { status: 400 })
  }
  const upstream = await fetch(`${GATEWAY_URL}/clone/voices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!upstream) {
    return new Response('voice gateway unavailable', { status: 502 })
  }
  return Response.json(await upstream.json(), { status: upstream.status })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[a-z0-9_]+$/.test(id)) {
    return new Response('invalid voice id', { status: 400 })
  }
  const upstream = await fetch(`${GATEWAY_URL}/clone/voices/${id}`, {
    method: 'DELETE',
  }).catch(() => null)
  if (!upstream) {
    return new Response('voice gateway unavailable', { status: 502 })
  }
  return Response.json(await upstream.json(), { status: upstream.status })
}
