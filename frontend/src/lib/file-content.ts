// Client-side extraction of plain text from uploaded files.
// Text files are read directly; PDFs are parsed with pdf.js in the browser.

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function readTextFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export async function extractPdfText(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  // WebKit (the Mac app's engine) has no ReadableStream async iteration, which
  // pdf.js getTextContent relies on ("undefined is not a function (near '...t of e...')").
  if (typeof ReadableStream !== 'undefined' && !(Symbol.asyncIterator in ReadableStream.prototype)) {
    ;(ReadableStream.prototype as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] =
      function (this: ReadableStream) {
        const reader = this.getReader()
        return {
          next: () => reader.read(),
          return: async (value: unknown) => {
            await reader.cancel()
            return { done: true, value }
          },
          [Symbol.asyncIterator]() {
            return this
          },
        }
      }
  }

  // Lazy-import so pdf.js never runs during server-side rendering.
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise

  const pages: string[] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
    onProgress?.(Math.round((pageNum / doc.numPages) * 100))
  }

  return pages.join('\n\n').trim()
}
