'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, ChevronsUpDown, Loader2, Play, Square, Trash2, Upload } from 'lucide-react'

import { KOKORO_VOICES, KokoroVoice, VoiceSampleKind, voiceById, voiceSampleUrl } from '@/lib/voices'
import { useSpeakerProfiles, useUpdateSpeakerProfile } from '@/lib/hooks/use-podcasts'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

// One voice plays at a time, app-wide. Module-level so every picker/strip
// instance shares the same channel.
let activeAudio: HTMLAudioElement | null = null
let activeOnStop: (() => void) | null = null

export function stopVoicePlayback() {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio = null
  }
  activeOnStop?.()
  activeOnStop = null
}

function playExclusive(src: string, onStop: () => void) {
  stopVoicePlayback()
  const audio = new Audio(src)
  activeAudio = audio
  activeOnStop = onStop
  const finish = () => {
    if (activeAudio === audio) {
      activeAudio = null
      activeOnStop = null
    }
    onStop()
  }
  audio.onended = finish
  audio.onerror = finish
  void audio.play().catch(finish)
}

function Equalizer() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="voice-eq-bar w-[3px] rounded-sm bg-primary"
          style={{ height: '100%', animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function voiceTagLabel(voice: KokoroVoice, t: (key: string) => string) {
  const gender = voice.gender === 'female' ? t('podcasts.voiceFilterFemale') : t('podcasts.voiceFilterMale')
  return `${voice.accent} · ${gender}`
}

type VoiceFilter = 'all' | 'female' | 'male' | 'US' | 'UK'

// User-cloned voices served by the local voice gateway (F5-TTS). They have no
// pre-rendered samples, so previews synthesize live via /api/voice-preview.
export interface CustomVoice {
  id: string
  name: string
  accent?: string
  gender?: string
}

export function customVoiceTag(voice: CustomVoice, fallback: string): string {
  const parts = [voice.accent, voice.gender].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : fallback
}

export const CUSTOM_PREVIEW_LINES: Record<VoiceSampleKind, string> = {
  podcast: 'Welcome back to the show. Today we are getting into something I think you will want to hear.',
  briefing: "I went through your notes. Here's what stands out, and what I think it means.",
}

export function useCustomVoices() {
  const [voices, setVoices] = useState<CustomVoice[]>([])
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/voice-clone')
      if (response.ok) {
        setVoices(await response.json())
      }
    } catch {
      // Gateway not running: the cloned-voices section simply stays hidden.
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { voices, refresh }
}

interface VoiceGridProps {
  value?: string | null
  onSelect: (voiceId: string) => void
  sampleKind?: VoiceSampleKind
}

export function VoiceGrid({ value, onSelect, sampleKind = 'podcast' }: VoiceGridProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [filter, setFilter] = useState<VoiceFilter>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingCustomId, setLoadingCustomId] = useState<string | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloning, setCloning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { voices: customVoicesAll, refresh: refreshCustomVoices } = useCustomVoices()
  // A cloned voice can also ship in the static list (e.g. "ian"); dedupe.
  const customVoices = useMemo(
    () => customVoicesAll.filter((voice) => !voiceById(voice.id)),
    [customVoicesAll]
  )

  useEffect(() => stopVoicePlayback, [])

  const playCustomSample = useCallback(async (voiceId: string) => {
    if (playingId === voiceId) {
      stopVoicePlayback()
      setPlayingId(null)
      return
    }
    if (loadingCustomId) return
    setLoadingCustomId(voiceId)
    try {
      const response = await fetch('/api/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId, text: CUSTOM_PREVIEW_LINES[sampleKind] }),
      })
      if (!response.ok) throw new Error(`TTS returned ${response.status}`)
      const url = URL.createObjectURL(await response.blob())
      setPlayingId(voiceId)
      playExclusive(url, () => {
        URL.revokeObjectURL(url)
        setPlayingId((current) => (current === voiceId ? null : current))
      })
    } catch (error) {
      console.error('Cloned voice preview failed', error)
      toast({ title: t('podcasts.voicePreviewFailed'), variant: 'destructive' })
    } finally {
      setLoadingCustomId(null)
    }
  }, [playingId, loadingCustomId, sampleKind, toast, t])

  const deleteCustomVoice = useCallback(async (voiceId: string) => {
    try {
      await fetch(`/api/voice-clone?id=${voiceId}`, { method: 'DELETE' })
      await refreshCustomVoices()
    } catch (error) {
      console.error('Failed to delete cloned voice', error)
    }
  }, [refreshCustomVoices])

  const handleCloneFile = useCallback(async (file: File) => {
    setCloning(true)
    try {
      const form = new FormData()
      form.append('name', cloneName.trim())
      form.append('file', file)
      const response = await fetch('/api/voice-clone', { method: 'POST', body: form })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(body.error || `upload failed with ${response.status}`)
      }
      setCloneName('')
      await refreshCustomVoices()
      onSelect(body.id)
    } catch (error) {
      console.error('Voice cloning failed', error)
      toast({
        title: t('podcasts.voiceCloneFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setCloning(false)
    }
  }, [cloneName, onSelect, refreshCustomVoices, toast, t])

  const voices = useMemo(() => {
    switch (filter) {
      case 'female':
      case 'male':
        return KOKORO_VOICES.filter((v) => v.gender === filter)
      case 'US':
      case 'UK':
        return KOKORO_VOICES.filter((v) => v.accent === filter)
      default:
        return KOKORO_VOICES
    }
  }, [filter])

  const togglePlay = useCallback((voice: KokoroVoice) => {
    if (playingId === voice.id) {
      stopVoicePlayback()
      setPlayingId(null)
      return
    }
    setPlayingId(voice.id)
    playExclusive(voiceSampleUrl(voice.id, sampleKind), () => {
      setPlayingId((current) => (current === voice.id ? null : current))
    })
  }, [playingId, sampleKind])

  const filters: Array<{ key: VoiceFilter; label: string }> = [
    { key: 'all', label: t('podcasts.voiceFilterAll') },
    { key: 'female', label: t('podcasts.voiceFilterFemale') },
    { key: 'male', label: t('podcasts.voiceFilterMale') },
    { key: 'US', label: t('podcasts.voiceFilterUS') },
    { key: 'UK', label: t('podcasts.voiceFilterUK') },
  ]

  return (
    <div className="space-y-3">
      {customVoices.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('podcasts.voiceYourVoices')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {customVoices.map((voice) => {
              const selected = value === voice.id
              const playing = playingId === voice.id
              return (
                <div
                  key={voice.id}
                  role="radio"
                  aria-checked={selected}
                  tabIndex={0}
                  onClick={() => onSelect(voice.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(voice.id)
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors',
                    selected ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/60'
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void playCustomSample(voice.id)
                    }}
                    aria-label={playing ? t('podcasts.voiceStopSample') : `${t('podcasts.voicePlaySample')}: ${voice.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background hover:bg-accent"
                  >
                    {loadingCustomId === voice.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : playing
                        ? <Square className="h-3 w-3 fill-current" />
                        : <Play className="ml-0.5 h-3.5 w-3.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{voice.name}</p>
                      {playing && <Equalizer />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {customVoiceTag(voice, t('podcasts.voiceCloned'))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteCustomVoice(voice.id)
                    }}
                    aria-label={`${t('podcasts.delete')}: ${voice.name}`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
              filter === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ScrollArea className="h-[280px] pr-3">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('podcasts.chooseVoice')}>
          {voices.map((voice) => {
            const selected = value === voice.id
            const playing = playingId === voice.id
            return (
              <div
                key={voice.id}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => onSelect(voice.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(voice.id)
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors',
                  selected ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/60'
                )}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePlay(voice)
                  }}
                  aria-label={playing ? t('podcasts.voiceStopSample') : `${t('podcasts.voicePlaySample')}: ${voice.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background hover:bg-accent"
                >
                  {playing ? <Square className="h-3 w-3 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{voice.name}</p>
                    {playing && <Equalizer />}
                  </div>
                  <p className="text-xs text-muted-foreground">{voiceTagLabel(voice, t)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('podcasts.voiceCloneTitle')}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            placeholder={t('podcasts.voiceCloneNamePlaceholder')}
            className="h-8 text-xs"
            disabled={cloning}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleCloneFile(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            disabled={cloning || !cloneName.trim()}
            onClick={() => fileInputRef.current?.click()}
          >
            {cloning
              ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              : <Upload className="mr-1 h-3.5 w-3.5" />}
            {cloning ? t('podcasts.voiceCloneBusy') : t('podcasts.voiceCloneUpload')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('podcasts.voiceCloneHint')}</p>
      </div>
    </div>
  )
}

interface VoicePickerPopoverProps {
  value?: string | null
  onChange: (voiceId: string) => void
  triggerLabel?: string
  triggerVariant?: 'field' | 'link'
  sampleKind?: VoiceSampleKind
}

export function VoicePickerPopover({ value, onChange, triggerLabel, triggerVariant = 'field', sampleKind = 'podcast' }: VoicePickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const known = voiceById(value)
  const isCustom = Boolean(value) && !known
  const [customDraft, setCustomDraft] = useState('')

  useEffect(() => {
    if (!open) {
      stopVoicePlayback()
      setCustomDraft(isCustom ? value ?? '' : '')
    }
  }, [open, isCustom, value])

  const fieldLabel = known
    ? `${known.name} — ${voiceTagLabel(known, t)}`
    : value
      ? `${value} (${t('podcasts.voiceCustomId')})`
      : t('podcasts.chooseVoice')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerVariant === 'link' ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
            {triggerLabel ?? t('podcasts.changeVoice')}
          </Button>
        ) : (
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{fieldLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3" align="start">
        <VoiceGrid value={value} onSelect={(id) => onChange(id)} sampleKind={sampleKind} />
        <div className="mt-3 flex items-end gap-2 border-t pt-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">{t('podcasts.voiceCustomId')}</Label>
            <Input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (customDraft.trim()) onChange(customDraft.trim())
                }
              }}
              placeholder="ff_siwis"
              className="h-8 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customDraft.trim()}
            onClick={() => onChange(customDraft.trim())}
          >
            {t('podcasts.voiceApply')}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            {t('podcasts.voiceDone')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Voice strip for the Generate flow: one row per speaker in the episode's
// speaker profile, with instant samples, voice switching, and an optional
// live "read my content" preview through the local TTS engine.

const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-sky-600',
  'bg-amber-600',
  'bg-violet-600',
]

interface VoiceStripProps {
  speakerProfileName: string
  previewText?: string
  sampleKind?: VoiceSampleKind
}

export function VoiceStrip({ speakerProfileName, previewText, sampleKind = 'podcast' }: VoiceStripProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { speakerProfiles } = useSpeakerProfiles()
  const { voices: customVoices } = useCustomVoices()
  const updateProfile = useUpdateSpeakerProfile()
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  useEffect(() => stopVoicePlayback, [])

  const profile = useMemo(
    () => speakerProfiles?.find((p) => p.name === speakerProfileName),
    [speakerProfiles, speakerProfileName]
  )

  const playSample = useCallback(async (key: string, voiceId: string) => {
    if (playingKey === key) {
      stopVoicePlayback()
      setPlayingKey(null)
      return
    }
    // Resolve aliases ("nova" → af_nova) so the sample URL matches a real file.
    const voice = voiceById(voiceId)
    if (voice) {
      setPlayingKey(key)
      playExclusive(voiceSampleUrl(voice.id, sampleKind), () => {
        setPlayingKey((current) => (current === key ? null : current))
      })
      return
    }
    // Cloned voices have no pre-rendered sample; synthesize the line live.
    if (loadingKey) return
    setLoadingKey(key)
    try {
      const response = await fetch('/api/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId, text: CUSTOM_PREVIEW_LINES[sampleKind] }),
      })
      if (!response.ok) throw new Error(`TTS returned ${response.status}`)
      const url = URL.createObjectURL(await response.blob())
      setPlayingKey(key)
      playExclusive(url, () => {
        URL.revokeObjectURL(url)
        setPlayingKey((current) => (current === key ? null : current))
      })
    } catch (error) {
      console.error('Cloned voice sample failed', error)
      toast({ title: t('podcasts.voicePreviewFailed'), variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }, [playingKey, loadingKey, sampleKind, toast, t])

  const playContentPreview = useCallback(async (key: string, voiceId: string) => {
    if (!previewText?.trim() || loadingKey) return
    stopVoicePlayback()
    setPlayingKey(null)
    setLoadingKey(key)
    try {
      const response = await fetch('/api/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: voiceId, text: previewText }),
      })
      if (!response.ok) throw new Error(`TTS returned ${response.status}`)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      setPlayingKey(key)
      playExclusive(url, () => {
        URL.revokeObjectURL(url)
        setPlayingKey((current) => (current === key ? null : current))
      })
    } catch (error) {
      console.error('Voice content preview failed', error)
      toast({ title: t('podcasts.voicePreviewFailed'), variant: 'destructive' })
    } finally {
      setLoadingKey(null)
    }
  }, [previewText, loadingKey, toast, t])

  const changeVoice = useCallback(async (index: number, voiceId: string) => {
    if (!profile) return
    const speakers = profile.speakers.map((s, i) => (i === index ? { ...s, voice_id: voiceId } : s))
    try {
      await updateProfile.mutateAsync({
        profileId: profile.id,
        payload: {
          name: profile.name,
          description: profile.description ?? '',
          voice_model: profile.voice_model ?? null,
          tts_provider: profile.tts_provider ?? null,
          tts_model: profile.tts_model ?? null,
          speakers,
        },
      })
    } catch (error) {
      console.error('Failed to update speaker voice', error)
    }
  }, [profile, updateProfile])

  if (!profile || profile.speakers.length === 0) {
    return null
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('podcasts.voicesHeading')}
      </p>
      <div className="space-y-2">
        {profile.speakers.map((speaker, index) => {
          const voice = voiceById(speaker.voice_id)
          const customVoice = customVoices.find((v) => v.id === speaker.voice_id)
          const sampleKey = `sample-${index}`
          const contentKey = `content-${index}`
          const initials = speaker.name
            .split(/\s+/)
            .map((part) => part[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase()
          return (
            <div key={`${speaker.name}-${index}`} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
                  AVATAR_COLORS[index % AVATAR_COLORS.length]
                )}
                aria-hidden="true"
              >
                {initials || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{speaker.name}</p>
                  {playingKey === sampleKey || playingKey === contentKey ? <Equalizer /> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {voice
                    ? `${voice.name} — ${voiceTagLabel(voice, t)}`
                    : customVoice
                      ? `${customVoice.name} — ${customVoiceTag(customVoice, t('podcasts.voiceCloned'))}`
                      : speaker.voice_id}
                </p>
              </div>
              {(voice || customVoice) && (
                <button
                  type="button"
                  onClick={() => void playSample(sampleKey, speaker.voice_id)}
                  aria-label={playingKey === sampleKey ? t('podcasts.voiceStopSample') : `${t('podcasts.voicePlaySample')}: ${(voice ?? customVoice)!.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background hover:bg-accent"
                >
                  {loadingKey === sampleKey
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : playingKey === sampleKey
                      ? <Square className="h-3 w-3 fill-current" />
                      : <Play className="ml-0.5 h-3.5 w-3.5" />}
                </button>
              )}
              {previewText?.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 text-xs"
                  disabled={loadingKey !== null}
                  onClick={() => void playContentPreview(contentKey, speaker.voice_id)}
                  title={t('podcasts.voiceReadMyContentDesc')}
                >
                  {loadingKey === contentKey
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <AudioLines className="h-3.5 w-3.5" />}
                  <span className="ml-1">{t('podcasts.voiceReadMyContent')}</span>
                </Button>
              ) : null}
              <VoicePickerPopover
                value={speaker.voice_id}
                onChange={(id) => void changeVoice(index, id)}
                triggerVariant="link"
                sampleKind={sampleKind}
              />
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('podcasts.voiceSavesToProfile').replace('{name}', profile.name)}
      </p>
    </div>
  )
}
