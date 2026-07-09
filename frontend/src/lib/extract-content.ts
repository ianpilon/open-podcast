import { transformationsApi } from '@/lib/api/transformations'

// Quote-preserving condensation for Briefing mode. Summarization destroys the
// verbatim text analysts must quote, and small local models paraphrase even
// when told to copy exactly. So the model never writes text at all: the source
// is split into numbered segments, the model replies with segment NUMBERS to
// keep, and the kept text is sliced from the original. Verbatim by
// construction, regardless of model quality.

const CHARS_PER_TOKEN = 4
const TARGET_CHARS = 5000 * CHARS_PER_TOKEN // ~20,000, same budget as condensing
const CHUNK_CHARS = 6000 * CHARS_PER_TOKEN // ~24,000 per selection call
const SEGMENT_MIN_CHARS = 150
// Spoken transcripts can run for pages without sentence punctuation; cap
// segment size so selection stays fine-grained on such text.
const SEGMENT_MAX_CHARS = 600
const MAX_PASSES = 3
const SEPARATOR = '\n\n[...]\n\n'

// Split text into segments between SEGMENT_MIN_CHARS and SEGMENT_MAX_CHARS,
// breaking on sentence ends and newlines when possible and on word boundaries
// otherwise, so each segment is a coherent verbatim span.
export function segmentText(text: string): string[] {
  const rough = text.split(/(?<=[.!?])\s+|\n+/)
  const segments: string[] = []
  let current = ''

  const flush = () => {
    if (current) {
      segments.push(current)
      current = ''
    }
  }

  for (const part of rough) {
    let piece = part.trim()
    if (!piece) continue
    // Hard-split pieces with no usable boundaries into word-aligned spans.
    while (piece.length > SEGMENT_MAX_CHARS) {
      flush()
      let cut = piece.lastIndexOf(' ', SEGMENT_MAX_CHARS)
      if (cut < SEGMENT_MIN_CHARS) cut = SEGMENT_MAX_CHARS
      segments.push(piece.slice(0, cut))
      piece = piece.slice(cut).trim()
    }
    if (current && current.length + piece.length + 1 > SEGMENT_MAX_CHARS) {
      flush()
    }
    current = current ? `${current} ${piece}` : piece
    if (current.length >= SEGMENT_MIN_CHARS) {
      flush()
    }
  }
  flush()
  return segments
}

// Parse a model reply like "2, 5-9, 14" into segment indices, ignoring any
// surrounding chatter. Out-of-range numbers are dropped; ranges are clamped.
export function parseSelection(reply: string, segmentCount: number): number[] {
  const picked = new Set<number>()
  for (const match of reply.matchAll(/(\d+)\s*-\s*(\d+)|(\d+)/g)) {
    if (match[1] !== undefined && match[2] !== undefined) {
      let from = parseInt(match[1], 10)
      let to = parseInt(match[2], 10)
      if (from > to) [from, to] = [to, from]
      for (let n = from; n <= to && n - from < 200; n++) picked.add(n)
    } else if (match[3] !== undefined) {
      picked.add(parseInt(match[3], 10))
    }
  }
  return [...picked].filter((n) => n >= 1 && n <= segmentCount).sort((a, b) => a - b)
}

// Split segments into chunks whose numbered text stays under maxChars.
function chunkSegments(segments: string[], maxChars: number): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0
  for (const segment of segments) {
    if (current.length > 0 && size + segment.length > maxChars) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(segment)
    size += segment.length + 8
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

interface ExtractOptions {
  content: string
  transformationId: string
  modelId: string
  onStatus?: (status: string) => void
}

export async function extractVerbatimContent({
  content,
  transformationId,
  modelId,
  onStatus,
}: ExtractOptions): Promise<string> {
  let text = content
  let pass = 0

  while (text.length > TARGET_CHARS && pass < MAX_PASSES) {
    pass++
    const chunks = chunkSegments(segmentText(text), CHUNK_CHARS)
    // Budget per chunk so every part of a long document keeps representation.
    const budgetPerChunk = Math.floor(TARGET_CHARS / chunks.length)
    const kept: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      onStatus?.(`Selecting verbatim excerpts… (pass ${pass}, part ${i + 1}/${chunks.length})`)
      const segments = chunks[i]
      const numbered = segments.map((s, n) => `[${n + 1}] ${s}`).join('\n')
      let selected: number[] = []
      try {
        const result = await transformationsApi.execute({
          transformation_id: transformationId,
          input_text: numbered,
          model_id: modelId,
        })
        selected = parseSelection(result.output ?? '', segments.length)
      } catch (error) {
        console.error('Verbatim selection call failed for chunk', i, error)
      }
      // Nothing usable selected: keep the chunk's opening segments instead of
      // dropping the chunk entirely.
      if (selected.length === 0) {
        let size = 0
        for (let n = 0; n < segments.length && size < budgetPerChunk; n++) {
          selected.push(n + 1)
          size += segments[n].length
        }
      }
      // Trim over-selection to the chunk budget, keeping document order.
      const picked: string[] = []
      let size = 0
      for (const n of selected) {
        const segment = segments[n - 1]
        if (size + segment.length > budgetPerChunk && picked.length > 0) break
        picked.push(segment)
        size += segment.length
      }
      kept.push(picked.join(SEPARATOR))
    }

    const next = kept.join(SEPARATOR)
    // If a pass fails to shrink the text, stop to avoid an infinite loop.
    if (next.length >= text.length) {
      text = next
      break
    }
    text = next
  }

  // Final safety net: hard-truncate rather than exceed the budget wildly.
  if (text.length > TARGET_CHARS * 2) {
    text = text.slice(0, TARGET_CHARS * 2)
  }

  return text
}
