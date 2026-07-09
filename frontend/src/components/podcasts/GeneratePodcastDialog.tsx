'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, Loader2, Mic } from 'lucide-react'

import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useEpisodeProfiles, useGeneratePodcast } from '@/lib/hooks/use-podcasts'
import { useTransformations } from '@/lib/hooks/use-transformations'
import { useModels } from '@/lib/hooks/use-models'
import { podcastsApi } from '@/lib/api/podcasts'
import { chatApi } from '@/lib/api/chat'
import { BuildContextRequest } from '@/lib/types/api'
import { PodcastGenerationRequest } from '@/lib/types/podcasts'
import { condenseContent, needsCondensing } from '@/lib/condense-content'
import { extractVerbatimContent } from '@/lib/extract-content'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { usePodcastContentStore } from '@/lib/stores/podcast-content-store'
import { VoiceStrip } from '@/components/podcasts/VoicePicker'
import { PodcastMode, formatProfileLabel, profileMode } from '@/lib/podcast-modes'

interface GeneratePodcastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface GeneratePodcastFormProps {
  // Gates the reset behaviour. Always true when rendered as a page.
  active?: boolean
  // Called after a successful generation submit.
  onGenerated?: () => void
  // Optional cancel action (used by the modal wrapper; hidden on the page).
  onCancel?: () => void
  showCancel?: boolean
}

// Model routing: small uploads use the fast model, large ones use a more capable
// (and slower) model that's reliable at structured output on big documents.
const FAST_MODEL_NAME = 'qwen2.5:latest'
const BIG_MODEL_NAME = 'qwen2.5:14b'
const LARGE_FILE_CHARS = 24000

export function GeneratePodcastForm({ active = true, onGenerated, onCancel, showCancel = false }: GeneratePodcastFormProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [mode, setMode] = useState<PodcastMode>('podcast')
  const [episodeProfileId, setEpisodeProfileId] = useState<string>('')
  const [episodeName, setEpisodeName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [isBuildingContext, setIsBuildingContext] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [showLargeFileModal, setShowLargeFileModal] = useState(false)

  const { data: transformations } = useTransformations()
  const { data: models } = useModels()

  const fastModel = useMemo(() => models?.find((m) => m.name === FAST_MODEL_NAME), [models])
  const bigModel = useMemo(() => models?.find((m) => m.name === BIG_MODEL_NAME), [models])

  // Content comes from two shared sources: files uploaded on this page (primary)
  // and notebook/source selections made on the Content page (secondary).
  const selections = usePodcastContentStore((state) => state.selections)
  const uploadedFiles = usePodcastContentStore((state) => state.uploadedFiles)
  const clearUploadedFiles = usePodcastContentStore((state) => state.clearUploadedFiles)

  const notebooksQuery = useNotebooks()
  const episodeProfilesQuery = useEpisodeProfiles()
  const generatePodcast = useGeneratePodcast()

  const notebooks = useMemo(() => notebooksQuery.data ?? [], [notebooksQuery.data])
  const episodeProfiles = useMemo(
    () => episodeProfilesQuery.episodeProfiles ?? [],
    [episodeProfilesQuery.episodeProfiles]
  )

  const resetState = useCallback(() => {
    setMode('podcast')
    setEpisodeProfileId('')
    setEpisodeName('')
    setNameEdited(false)
    setInstructions('')
  }, [])

  useEffect(() => {
    if (!active) {
      resetState()
    }
  }, [active, resetState])

  // Auto-fill the episode name from the uploaded file's title (without extension),
  // unless the user has typed their own name. They can still edit it freely.
  useEffect(() => {
    if (nameEdited || uploadedFiles.length === 0) {
      return
    }
    const latest = uploadedFiles[uploadedFiles.length - 1]
    const title = latest.name.replace(/\.[^/.]+$/, '').trim()
    if (title) {
      setEpisodeName(title)
    }
  }, [uploadedFiles, nameEdited])

  const visibleProfiles = useMemo(
    () => episodeProfiles.filter((profile) => profileMode(profile.name) === mode),
    [episodeProfiles, mode]
  )

  // Keep the selected format valid for the current mode; when a mode has a
  // single format, select it so the user isn't asked a one-option question.
  useEffect(() => {
    if (episodeProfileId && !visibleProfiles.some((profile) => profile.id === episodeProfileId)) {
      setEpisodeProfileId('')
      return
    }
    if (!episodeProfileId && visibleProfiles.length === 1) {
      setEpisodeProfileId(visibleProfiles[0].id)
    }
  }, [episodeProfileId, visibleProfiles])

  const selectedEpisodeProfile = useMemo(() => {
    if (!episodeProfileId) {
      return undefined
    }
    return episodeProfiles.find((profile) => profile.id === episodeProfileId)
  }, [episodeProfileId, episodeProfiles])

  // First lines of the uploaded content, used by the voice strip so a voice
  // can read the user's actual opening before they commit to generating.
  const voicePreviewText = useMemo(() => {
    const firstDone = uploadedFiles.find((file) => file.status === 'done' && file.text.trim())
    return firstDone ? firstDone.text.trim().slice(0, 240) : ''
  }, [uploadedFiles])

  const buildContentFromSelections = useCallback(async () => {
    const parts: string[] = []

    // Uploaded files are the primary content source on the Generate page.
    uploadedFiles
      .filter((file) => file.status === 'done' && file.text.trim())
      .forEach((file) => parts.push(`File: ${file.name}\n${file.text}`))

    const tasks: Array<{ notebookId: string; payload: BuildContextRequest }> = []

    Object.entries(selections).forEach(([notebookId, selection]) => {
      const sourcesConfig = Object.entries(selection.sources)
        .filter(([, mode]) => mode !== 'off')
        .reduce<Record<string, string>>((acc, [sourceId, mode]) => {
          const normalizedId = sourceId.replace(/^source:/, '')
          acc[normalizedId] = mode === 'insights' ? 'insights' : 'full content'
          return acc
        }, {})

      const notesConfig = Object.entries(selection.notes)
        .filter(([, mode]) => mode !== 'off')
        .reduce<Record<string, string>>((acc, [noteId]) => {
          const normalizedId = noteId.replace(/^note:/, '')
          acc[normalizedId] = 'full content'
          return acc
        }, {})

      if (Object.keys(sourcesConfig).length === 0 && Object.keys(notesConfig).length === 0) {
        return
      }

      tasks.push({
        notebookId,
        payload: {
          notebook_id: notebookId,
          context_config: {
            sources: sourcesConfig,
            notes: notesConfig,
          },
        },
      })
    })

    for (const task of tasks) {
      try {
        const response = await chatApi.buildContext(task.payload)
        const notebookName = notebooks.find((nb) => nb.id === task.notebookId)?.name ?? task.notebookId
        const contextString = JSON.stringify(response.context, null, 2)
        const snippet = `${t('common.notebookLabel').replace('{name}', notebookName)}\n${contextString}`
        parts.push(snippet)
      } catch (error) {
        console.error('Failed to build context for notebook', task.notebookId, error)
        throw new Error(t('podcasts.buildContextFailed'))
      }
    }

    return parts.join('\n\n')
  }, [notebooks, selections, uploadedFiles, t])

  const runGeneration = useCallback(
    async (useBig: boolean) => {
      if (!selectedEpisodeProfile) return

      const useBigModel = useBig && Boolean(bigModel)
      const chosenModelId = useBigModel ? bigModel?.id : fastModel?.id
      const chosenModelName = useBigModel ? BIG_MODEL_NAME : FAST_MODEL_NAME

      setIsBuildingContext(true)
      try {
        let content = await buildContentFromSelections()
        if (!content.trim()) {
          toast({
            title: t('podcasts.addContext'),
            description: t('podcasts.addContextDesc'),
            variant: 'destructive',
          })
          return
        }

        // Auto-condense content that's too large for the model's context window.
        // Briefing analysts must quote verbatim, so their content is shrunk by
        // SELECTING exact passages (verified against the source) instead of
        // summarizing, which would destroy every quotable line.
        if (needsCondensing(content)) {
          const useExtraction = mode === 'briefing'
          const extractId = transformations?.find((tr) => tr.name === 'Verbatim Extract')?.id
          const summaryId = transformations?.find((tr) => tr.name === 'Simple Summary')?.id
          const transformationId = useExtraction ? (extractId ?? summaryId) : summaryId
          // Summarization is robust on the fast model, so use it for the condense passes.
          const condenseModelId = fastModel?.id ?? chosenModelId
          if (transformationId && condenseModelId) {
            try {
              const shrink = useExtraction && extractId ? extractVerbatimContent : condenseContent
              content = await shrink({
                content,
                transformationId,
                modelId: condenseModelId,
                onStatus: setStatusText,
              })
            } catch (condenseError) {
              console.error('Failed to condense content', condenseError)
              toast({
                title: 'Could not condense document',
                description: 'Used a truncated version instead. Try a shorter document.',
              })
              content = content.slice(0, 100000)
            } finally {
              setStatusText(null)
            }
          } else {
            content = content.slice(0, 100000)
          }
        }

        // Route to the chosen model by setting it on the selected profile.
        if (chosenModelId) {
          try {
            await podcastsApi.updateEpisodeProfile(selectedEpisodeProfile.id, {
              name: selectedEpisodeProfile.name,
              description: selectedEpisodeProfile.description,
              speaker_config: selectedEpisodeProfile.speaker_config,
              language: selectedEpisodeProfile.language,
              default_briefing: selectedEpisodeProfile.default_briefing,
              num_segments: selectedEpisodeProfile.num_segments,
              outline_llm: chosenModelId,
              transcript_llm: chosenModelId,
              outline_provider: 'ollama',
              outline_model: chosenModelName,
              transcript_provider: 'ollama',
              transcript_model: chosenModelName,
            })
          } catch (modelError) {
            console.error('Failed to set generation model', modelError)
          }
        }

        const payload: PodcastGenerationRequest = {
          episode_profile: selectedEpisodeProfile.name,
          speaker_profile: selectedEpisodeProfile.speaker_config,
          episode_name: episodeName.trim(),
          content,
          briefing_suffix: instructions.trim() ? instructions.trim() : undefined,
        }

        await generatePodcast.mutateAsync(payload)

        toast({
          title: t('common.success'),
          description: t('podcasts.podcastTaskStarted'),
        })

        setTimeout(() => {
          onGenerated?.()
          resetState()
          clearUploadedFiles()
        }, 500)
      } catch (error) {
        console.error('Failed to generate podcast', error)
        toast({
          title: t('podcasts.generationFailed'),
          description: error instanceof Error ? error.message : t('common.refreshPage'),
          variant: 'destructive',
        })
      } finally {
        setIsBuildingContext(false)
        setStatusText(null)
      }
    },
    [
      bigModel,
      fastModel,
      buildContentFromSelections,
      clearUploadedFiles,
      episodeName,
      generatePodcast,
      instructions,
      mode,
      onGenerated,
      resetState,
      selectedEpisodeProfile,
      transformations,
      toast,
      t,
    ]
  )

  const handleGenerateClick = useCallback(() => {
    if (!selectedEpisodeProfile) {
      toast({
        title: t('podcasts.profileRequired'),
        description: t('podcasts.profileRequiredDesc'),
        variant: 'destructive',
      })
      return
    }
    if (!episodeName.trim()) {
      toast({
        title: t('podcasts.nameRequired'),
        description: t('podcasts.nameRequiredDesc'),
        variant: 'destructive',
      })
      return
    }

    const uploadedChars = uploadedFiles
      .filter((file) => file.status === 'done')
      .reduce((sum, file) => sum + file.text.length, 0)

    // Large upload + a big model available → confirm the model switch first.
    if (uploadedChars > LARGE_FILE_CHARS && bigModel) {
      setShowLargeFileModal(true)
      return
    }
    void runGeneration(false)
  }, [selectedEpisodeProfile, episodeName, uploadedFiles, bigModel, runGeneration, toast, t])

  const isSubmitting = generatePodcast.isPending || isBuildingContext

  return (
    <div className="space-y-6 max-w-md">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('podcasts.episodeSettings')}
        </h3>
        {episodeProfilesQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('podcasts.loadingProfiles')}
          </div>
        ) : episodeProfiles.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            {t('podcasts.noProfilesFound')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('podcasts.modeQuestion')}</Label>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('podcasts.modeQuestion')}>
                {(
                  [
                    { value: 'podcast', Icon: Mic, title: t('podcasts.modePodcast'), desc: t('podcasts.modePodcastDesc') },
                    { value: 'briefing', Icon: ClipboardList, title: t('podcasts.modeBriefing'), desc: t('podcasts.modeBriefingDesc') },
                  ] as const
                ).map(({ value, Icon, title, desc }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={mode === value}
                    onClick={() => setMode(value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      mode === value
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:bg-muted/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" /> {title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('podcasts.episodeProfile')}</Label>
              {visibleProfiles.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                  {t('podcasts.noProfilesFound')}
                </div>
              ) : (
                <div className="space-y-2" role="radiogroup" aria-label={t('podcasts.episodeProfile')}>
                  {visibleProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      role="radio"
                      aria-checked={episodeProfileId === profile.id}
                      onClick={() => setEpisodeProfileId(profile.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        episodeProfileId === profile.id
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:bg-muted/50'
                      }`}
                    >
                      <span className="block text-sm font-medium">{formatProfileLabel(profile.name)}</span>
                      {profile.description && (
                        <span className="mt-1 block text-xs text-muted-foreground">{profile.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedEpisodeProfile && (
              <VoiceStrip
                speakerProfileName={selectedEpisodeProfile.speaker_config}
                previewText={voicePreviewText}
                sampleKind={mode}
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="episode_name">{t('podcasts.episodeName')}</Label>
              <Input
                id="episode_name"
                name="episode_name"
                value={episodeName}
                onChange={(event) => {
                  setEpisodeName(event.target.value)
                  setNameEdited(true)
                }}
                placeholder={t('podcasts.episodeNamePlaceholder')}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">{t('podcasts.additionalInstructions')}</Label>
              <Textarea
                id="instructions"
                name="instructions"
                placeholder={t('podcasts.instructionsPlaceholder')}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                className="min-h-[100px] text-xs"
                autoComplete="off"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={handleGenerateClick} disabled={isSubmitting} className="w-full">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('podcasts.generating') : t('podcasts.generate')}
        </Button>
        {statusText && (
          <p className="text-center text-xs text-muted-foreground">{statusText}</p>
        )}
        {showCancel && (
          <Button
            variant="outline"
            onClick={() => onCancel?.()}
            disabled={isSubmitting}
            className="w-full"
          >
            {t('common.cancel')}
          </Button>
        )}
      </div>

      <Dialog open={showLargeFileModal} onOpenChange={setShowLargeFileModal}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Large file detected</DialogTitle>
            <DialogDescription>
              This document is on the larger side, so we&apos;ll automatically switch to a more
              capable model ({BIG_MODEL_NAME}) for reliable results. Generation may take a bit
              longer than usual.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowLargeFileModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                setShowLargeFileModal(false)
                void runGeneration(true)
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function GeneratePodcastDialog({ open, onOpenChange }: GeneratePodcastDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[1080px] max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('podcasts.generateEpisode')}</DialogTitle>
          <DialogDescription>{t('podcasts.generateEpisodeDesc')}</DialogDescription>
        </DialogHeader>
        <GeneratePodcastForm
          active={open}
          showCancel
          onGenerated={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
