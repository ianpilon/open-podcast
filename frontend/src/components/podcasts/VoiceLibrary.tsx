'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Play, Pause, Loader2, AlertCircle, Pencil, Check, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'

const KOKORO_URL = process.env.NEXT_PUBLIC_KOKORO_URL || 'http://localhost:8880'
const SAMPLE_TEXT =
  "Hello, this is a sample of my voice. Here's how I sound reading a sentence for your podcast."

const LANG: Record<string, string> = {
  a: 'American', b: 'British', e: 'Spanish', f: 'French', h: 'Hindi',
  i: 'Italian', j: 'Japanese', p: 'Portuguese', z: 'Mandarin',
}
const GEN: Record<string, string> = { f: 'Female', m: 'Male' }
const FLAG: Record<string, string> = {
  a: '🇺🇸', b: '🇬🇧', e: '🇪🇸', f: '🇫🇷', h: '🇮🇳',
  i: '🇮🇹', j: '🇯🇵', p: '🇧🇷', z: '🇨🇳',
}
const ORDER: Record<string, number> = { af: 0, am: 1, bf: 2, bm: 3 }

interface Voice {
  id: string
  name: string
  gender: string
  accent: string
  flag: string
  legacy: boolean
  // User-cloned voices come from the local voice gateway, not Kokoro, and
  // must be previewed through /api/voice-preview (same origin).
  cloned?: boolean
}

function parseVoice(id: string): Voice {
  const lang = id[0]
  const g = id[1]
  let name = (id.split('_')[1] || id).replace('v0', '').replace(/^_+|_+$/g, '')
  name = name ? name[0].toUpperCase() + name.slice(1) : id
  return {
    id,
    name,
    gender: GEN[g] || '',
    accent: LANG[lang] || 'Other',
    flag: FLAG[lang] || '🌐',
    legacy: id.includes('v0'),
  }
}

export function VoiceLibrary() {
  const { toast } = useToast()
  const [voices, setVoices] = useState<Voice[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState(false)

  const [search, setSearch] = useState('')
  const [gender, setGender] = useState('')
  const [accent, setAccent] = useState('')

  const [playing, setPlaying] = useState<string | null>(null)
  const [synthing, setSynthing] = useState<string | null>(null)

  // Inline metadata editing for cloned voices (name / accent / gender).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAccent, setEditAccent] = useState('')
  const [editGender, setEditGender] = useState('')
  const [saving, setSaving] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cache = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const audio = new Audio()
    audio.addEventListener('ended', () => setPlaying(null))
    audioRef.current = audio
    return () => {
      audio.pause()
      cache.current.forEach((url) => URL.revokeObjectURL(url))
      cache.current.clear()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingList(true)
      setListError(false)
      try {
        const res = await fetch(`${KOKORO_URL}/v1/audio/voices`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const raw: unknown = Array.isArray(data) ? data : data.voices ?? data
        const ids: string[] = (raw as Array<string | { id: string }>).map((v) =>
          typeof v === 'string' ? v : v.id
        )
        const parsed = ids.map(parseVoice)
        parsed.sort(
          (a, b) =>
            (ORDER[a.id.slice(0, 2)] ?? 99) - (ORDER[b.id.slice(0, 2)] ?? 99) ||
            a.id.localeCompare(b.id)
        )

        // Cloned voices from the local voice gateway, listed first.
        let cloned: Voice[] = []
        try {
          const cloneRes = await fetch('/api/voice-clone')
          if (cloneRes.ok) {
            const entries: Array<{ id: string; name: string; accent?: string; gender?: string }> =
              await cloneRes.json()
            cloned = entries.map((entry) => ({
              id: entry.id,
              name: entry.name,
              gender: entry.gender || '',
              accent: entry.accent || 'Cloned',
              flag: '🎤',
              legacy: false,
              cloned: true,
            }))
          }
        } catch {
          // Gateway not running: just show the Kokoro voices.
        }

        if (!cancelled) setVoices([...cloned, ...parsed])
      } catch {
        if (!cancelled) setListError(true)
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const accents = useMemo(
    () => Array.from(new Set(voices.map((v) => v.accent))).sort(),
    [voices]
  )

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    return voices.filter(
      (v) =>
        (!t || v.id.toLowerCase().includes(t) || v.name.toLowerCase().includes(t)) &&
        (!gender || v.gender === gender) &&
        (!accent || v.accent === accent)
    )
  }, [voices, search, gender, accent])

  const togglePlay = useCallback(
    async (id: string) => {
      const audio = audioRef.current
      if (!audio) return

      if (playing === id) {
        audio.pause()
        setPlaying(null)
        return
      }

      let url = cache.current.get(id)
      if (!url) {
        setSynthing(id)
        try {
          const voice = voices.find((v) => v.id === id)
          // Cloned voices are served by the local gateway via the same-origin
          // preview route; Kokoro voices keep the direct (CORS-enabled) call.
          const res = voice?.cloned
            ? await fetch('/api/voice-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voice: id, text: SAMPLE_TEXT }),
              })
            : await fetch(`${KOKORO_URL}/v1/audio/speech`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'kokoro',
                  input: SAMPLE_TEXT,
                  voice: id,
                  response_format: 'mp3',
                }),
              })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          url = URL.createObjectURL(await res.blob())
          cache.current.set(id, url)
        } catch {
          setSynthing(null)
          toast({
            title: 'Could not play voice',
            description: 'Make sure the Kokoro voice server is running.',
            variant: 'destructive',
          })
          return
        }
        setSynthing(null)
      }

      audio.src = url
      void audio.play()
      setPlaying(id)
    },
    [playing, voices, toast]
  )

  const copyId = useCallback(
    (id: string) => {
      navigator.clipboard.writeText(id).then(() =>
        toast({ title: 'Copied', description: `${id} copied to clipboard.` })
      )
    },
    [toast]
  )

  const startEdit = useCallback((voice: Voice) => {
    setEditingId(voice.id)
    setEditName(voice.name)
    setEditAccent(voice.accent === 'Cloned' ? '' : voice.accent)
    setEditGender(voice.gender)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    try {
      const response = await fetch(`/api/voice-clone?id=${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), accent: editAccent.trim(), gender: editGender }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const meta = await response.json()
      setVoices((current) =>
        current.map((v) =>
          v.id === editingId
            ? { ...v, name: meta.name, accent: meta.accent || 'Cloned', gender: meta.gender || '' }
            : v
        )
      )
      setEditingId(null)
    } catch {
      toast({ title: 'Could not save voice details', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [editingId, editName, editAccent, editGender, toast])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border bg-background px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices..."
            autoComplete="off"
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="">Gender</option>
          <option>Female</option>
          <option>Male</option>
        </select>
        <select
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm"
        >
          <option value="">Accent</option>
          {accents.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        {!loadingList && !listError && (
          <span className="ml-auto pr-1 text-sm text-muted-foreground">
            {filtered.length} voice{filtered.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* States */}
      {loadingList ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading voices…
        </div>
      ) : listError ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            Couldn&apos;t reach the Kokoro voice server at{' '}
            <code className="rounded bg-muted px-1">{KOKORO_URL}</code>. Start it and refresh.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const isPlaying = playing === v.id
            const isSynthing = synthing === v.id
            return (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-[22px] leading-none">
                  {v.flag}
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === v.id ? (
                    <div className="space-y-1.5">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-1.5">
                        <Input
                          value={editAccent}
                          onChange={(e) => setEditAccent(e.target.value)}
                          placeholder="Accent (e.g. Canadian)"
                          className="h-7 text-xs"
                        />
                        <select
                          value={editGender}
                          onChange={(e) => setEditGender(e.target.value)}
                          className="h-7 rounded-lg border bg-background px-2 text-xs"
                        >
                          <option value="">Gender</option>
                          <option>Female</option>
                          <option>Male</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="truncate text-sm font-semibold">{v.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => copyId(v.id)}
                          title="Click to copy"
                          className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 hover:text-foreground"
                        >
                          {v.id}
                        </button>
                        {v.gender && (
                          <span className="rounded border bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {v.gender}
                          </span>
                        )}
                        <span className="rounded border bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {v.accent}
                        </span>
                        {v.cloned && (
                          <span className="rounded border border-emerald-800/40 bg-emerald-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-500/80">
                            cloned
                          </span>
                        )}
                        {v.legacy && (
                          <span className="rounded border border-amber-800/40 bg-amber-950/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-500/80">
                            legacy
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {v.cloned && (
                  editingId === v.id ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => void saveEdit()}
                        disabled={saving || !editName.trim()}
                        aria-label="Save voice details"
                        className="flex h-8 w-8 items-center justify-center rounded-full border bg-background hover:border-primary hover:text-primary"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel editing"
                        className="flex h-8 w-8 items-center justify-center rounded-full border bg-background hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(v)}
                      aria-label={`Edit ${v.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                <button
                  onClick={() => togglePlay(v.id)}
                  aria-label={isPlaying ? `Pause ${v.id}` : `Play ${v.id}`}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isPlaying
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background hover:border-primary hover:text-primary'
                  }`}
                >
                  {isSynthing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
