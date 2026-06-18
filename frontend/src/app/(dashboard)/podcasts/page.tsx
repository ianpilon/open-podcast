'use client'

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FileUploadPanel } from '@/components/podcasts/FileUploadPanel'
import { GeneratePodcastForm } from '@/components/podcasts/GeneratePodcastDialog'
import { ProcessingEpisodes } from '@/components/podcasts/ProcessingEpisodes'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useEpisodeProfiles, useSpeakerProfiles } from '@/lib/hooks/use-podcasts'
import { needsModelSetup } from '@/lib/types/podcasts'

export default function PodcastsPage() {
  const { t } = useTranslation()

  const { episodeProfiles } = useEpisodeProfiles()
  const { speakerProfiles } = useSpeakerProfiles(episodeProfiles)

  const hasUnconfiguredProfiles = useMemo(() => {
    return episodeProfiles.some(needsModelSetup) || speakerProfiles.some(needsModelSetup)
  }, [episodeProfiles, speakerProfiles])

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('podcasts.generateEpisode')}</h1>
            <p className="text-muted-foreground">
              {t('podcasts.generateEpisodeDesc')}
            </p>
          </header>

          {hasUnconfiguredProfiles ? (
            <Alert className="bg-amber-50 text-amber-900 border-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t('podcasts.setupRequired')}</AlertTitle>
              <AlertDescription>
                {t('podcasts.setupRequiredDesc')}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
            <FileUploadPanel />
            <GeneratePodcastForm active />
          </div>

          <ProcessingEpisodes />
        </div>
      </div>
    </AppShell>
  )
}
