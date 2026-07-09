// Kokoro voice library metadata. Sample MP3s live in public/voice-samples/,
// pre-generated so the picker plays instantly (regenerate with a new voice list
// by re-running the sample script against the local Kokoro server on :8880).

export interface KokoroVoice {
  id: string
  name: string
  accent: 'US' | 'UK'
  gender: 'female' | 'male'
}

export const KOKORO_VOICES: KokoroVoice[] = [
  // Ian's own voice, served by the F5-TTS clone gateway (not Kokoro); the
  // gateway proxies every other id below to Kokoro so this list stays unified.
  { id: 'ian', name: 'Ian', accent: 'US', gender: 'male' },
  { id: 'af_heart', name: 'Heart', accent: 'US', gender: 'female' },
  { id: 'af_bella', name: 'Bella', accent: 'US', gender: 'female' },
  { id: 'af_nova', name: 'Nova', accent: 'US', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', accent: 'US', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', accent: 'US', gender: 'female' },
  { id: 'af_sky', name: 'Sky', accent: 'US', gender: 'female' },
  { id: 'af_alloy', name: 'Alloy', accent: 'US', gender: 'female' },
  { id: 'af_aoede', name: 'Aoede', accent: 'US', gender: 'female' },
  { id: 'af_jadzia', name: 'Jadzia', accent: 'US', gender: 'female' },
  { id: 'af_jessica', name: 'Jessica', accent: 'US', gender: 'female' },
  { id: 'af_kore', name: 'Kore', accent: 'US', gender: 'female' },
  { id: 'af_river', name: 'River', accent: 'US', gender: 'female' },
  { id: 'am_adam', name: 'Adam', accent: 'US', gender: 'male' },
  { id: 'am_michael', name: 'Michael', accent: 'US', gender: 'male' },
  { id: 'am_echo', name: 'Echo', accent: 'US', gender: 'male' },
  { id: 'am_eric', name: 'Eric', accent: 'US', gender: 'male' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'US', gender: 'male' },
  { id: 'am_liam', name: 'Liam', accent: 'US', gender: 'male' },
  { id: 'am_onyx', name: 'Onyx', accent: 'US', gender: 'male' },
  { id: 'am_puck', name: 'Puck', accent: 'US', gender: 'male' },
  { id: 'am_santa', name: 'Santa', accent: 'US', gender: 'male' },
  { id: 'bf_emma', name: 'Emma', accent: 'UK', gender: 'female' },
  { id: 'bf_alice', name: 'Alice', accent: 'UK', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella', accent: 'UK', gender: 'female' },
  { id: 'bf_lily', name: 'Lily', accent: 'UK', gender: 'female' },
  { id: 'bm_george', name: 'George', accent: 'UK', gender: 'male' },
  { id: 'bm_daniel', name: 'Daniel', accent: 'UK', gender: 'male' },
  { id: 'bm_fable', name: 'Fable', accent: 'UK', gender: 'male' },
  { id: 'bm_lewis', name: 'Lewis', accent: 'UK', gender: 'male' },
]

export function voiceById(id: string | null | undefined): KokoroVoice | undefined {
  if (!id) return undefined
  // Existing profiles may store bare OpenAI-style aliases ("nova", "alloy")
  // which Kokoro also accepts; resolve them by voice name.
  const lower = id.toLowerCase()
  return KOKORO_VOICES.find((v) => v.id === lower || v.name.toLowerCase() === lower)
}

// Two sample sets: the default set opens like a podcast host, the briefing
// set opens like an analyst, so previews match the selected generation mode.
export type VoiceSampleKind = 'podcast' | 'briefing'

export function voiceSampleUrl(id: string, kind: VoiceSampleKind = 'podcast'): string {
  return kind === 'briefing' ? `/voice-samples/briefing/${id}.mp3` : `/voice-samples/${id}.mp3`
}
