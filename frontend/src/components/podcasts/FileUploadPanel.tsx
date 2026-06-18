'use client'

import { useRef, useState } from 'react'
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'
import { usePodcastContentStore } from '@/lib/stores/podcast-content-store'
import { extractPdfText, isPdf, readTextFile } from '@/lib/file-content'

const ACCEPTED_EXTENSIONS = ['.pdf', '.txt', '.text', '.md', '.markdown', '.csv', '.json']
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',')

function isSupportedFile(file: File): boolean {
  if (file.type.startsWith('text/') || isPdf(file)) return true
  const lower = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${performance.now()}`
}

export function FileUploadPanel() {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [url, setUrl] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)

  const uploadedFiles = usePodcastContentStore((s) => s.uploadedFiles)
  const addUploadedFile = usePodcastContentStore((s) => s.addUploadedFile)
  const updateUploadedFile = usePodcastContentStore((s) => s.updateUploadedFile)
  const removeUploadedFile = usePodcastContentStore((s) => s.removeUploadedFile)

  const readFile = async (file: File) => {
    const id = newId()
    addUploadedFile({ id, name: file.name, size: file.size, status: 'reading', progress: 0, text: '' })

    try {
      const onProgress = (pct: number) => updateUploadedFile(id, { progress: pct })
      const text = isPdf(file)
        ? await extractPdfText(file, onProgress)
        : await readTextFile(file, onProgress)

      if (!text.trim()) {
        updateUploadedFile(id, { status: 'error', progress: 0 })
        toast({
          title: 'No text found',
          description: `${file.name} had no extractable text. Scanned PDFs (images) need OCR.`,
          variant: 'destructive',
        })
        return
      }

      updateUploadedFile(id, { status: 'done', progress: 100, text })
    } catch (error) {
      console.error('Failed to read file', error)
      updateUploadedFile(id, { status: 'error', progress: 0 })
      toast({
        title: 'Could not read file',
        description: error instanceof Error ? error.message : `Failed to read ${file.name}.`,
        variant: 'destructive',
      })
    }
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    Array.from(fileList).forEach((file) => {
      if (!isSupportedFile(file)) {
        toast({
          title: 'Unsupported file',
          description: `${file.name} is not supported. Use PDF, TXT, MD, CSV, or JSON.`,
          variant: 'destructive',
        })
        return
      }
      void readFile(file)
    })
  }

  const handleImportUrl = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setImportingUrl(true)
    const id = newId()
    const name = trimmed.split('/').pop() || trimmed
    addUploadedFile({ id, name, size: 0, status: 'reading', progress: 30, text: '' })
    try {
      const res = await fetch(trimmed)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      updateUploadedFile(id, { status: 'done', progress: 100, text, size: text.length })
      setUrl('')
    } catch (error) {
      removeUploadedFile(id)
      toast({
        title: 'Could not import URL',
        description:
          error instanceof Error
            ? `${error.message}. The site may block cross-origin requests.`
            : 'Failed to fetch the URL.',
        variant: 'destructive',
      })
    } finally {
      setImportingUrl(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Content
        </h3>
        <p className="text-xs text-muted-foreground">
          Drop a file to use as the source for this episode.
        </p>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setIsDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/40'
        )}
      >
        <Upload className="mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-foreground">
          Drag &amp; Drop or{' '}
          <span className="font-medium text-primary">Choose file</span> to upload
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, TXT, MD, CSV, or JSON</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* File cards */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((file) => (
            <div key={file.id} className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-background">
                  {file.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : file.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.status === 'reading'
                      ? 'Reading…'
                      : file.status === 'error'
                        ? 'Failed to read'
                        : `${formatBytes(file.size)} · Ready`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {file.status === 'reading' && (
                    <span className="text-xs text-muted-foreground">{file.progress}%</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeUploadedFile(file.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {file.status === 'reading' && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* OR divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium text-muted-foreground">OR</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Import from URL */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Import from URL</p>
        <div className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleImportUrl()
              }
            }}
            placeholder="Add file URL"
            autoComplete="off"
          />
          <Button
            variant="ghost"
            onClick={handleImportUrl}
            disabled={!url.trim() || importingUrl}
            className="text-primary"
          >
            {importingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Upload'}
          </Button>
        </div>
      </div>
    </div>
  )
}
