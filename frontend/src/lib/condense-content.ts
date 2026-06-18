import { transformationsApi } from '@/lib/api/transformations'

// Map-reduce summarization to fit large documents inside the model context window.
// Rough heuristic: ~4 characters per token for English text.
const CHARS_PER_TOKEN = 4

// Final condensed content. Kept small because dense/long input breaks the
// structured-outline step even on larger models; a short, clean summary is what
// the outline model can reliably turn into segments.
const TARGET_TOKENS = 5000
const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN // ~20,000

// Per-chunk input for each summary call. Summarization (no structured output) is
// robust, but keep chunks modest so each pass is reliable and not too slow.
const CHUNK_TOKENS = 6000
const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN // ~24,000

// Absolute ceiling we will ever send, even if summarization can't shrink further.
const HARD_CAP_CHARS = 100000

const MAX_PASSES = 3

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function needsCondensing(text: string): boolean {
  return text.length > TARGET_CHARS
}

// Split text into chunks no larger than maxChars, preferring paragraph boundaries.
function chunkText(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current)
      current = ''
    }
    if (paragraph.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < paragraph.length; i += maxChars) {
        chunks.push(paragraph.slice(i, i + maxChars))
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)
  return chunks
}

interface CondenseOptions {
  content: string
  transformationId: string
  modelId: string
  onStatus?: (status: string) => void
}

export async function condenseContent({
  content,
  transformationId,
  modelId,
  onStatus,
}: CondenseOptions): Promise<string> {
  let text = content
  let pass = 0

  while (text.length > TARGET_CHARS && pass < MAX_PASSES) {
    pass++
    const chunks = chunkText(text, CHUNK_CHARS)
    const summaries: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      onStatus?.(`Condensing large document… (pass ${pass}, part ${i + 1}/${chunks.length})`)
      const result = await transformationsApi.execute({
        transformation_id: transformationId,
        input_text: chunks[i],
        model_id: modelId,
      })
      summaries.push(result.output)
    }

    const next = summaries.join('\n\n')
    // If a pass fails to shrink the text, stop to avoid an infinite loop.
    if (next.length >= text.length) {
      text = next
      break
    }
    text = next
  }

  // Final safety net: never exceed the hard ceiling.
  if (text.length > HARD_CAP_CHARS) {
    text = text.slice(0, HARD_CAP_CHARS)
  }

  return text
}
