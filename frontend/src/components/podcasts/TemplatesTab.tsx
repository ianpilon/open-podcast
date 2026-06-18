'use client'

import { AlertCircle, Lightbulb, Loader2 } from 'lucide-react'

import { SpeakerProfilesPanel } from '@/components/podcasts/SpeakerProfilesPanel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useEpisodeProfiles, useSpeakerProfiles } from '@/lib/hooks/use-podcasts'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useTranslation } from '@/lib/hooks/use-translation'

export function TemplatesTab() {
  const { t } = useTranslation()
  const {
    episodeProfiles,
    isLoading: loadingEpisodeProfiles,
    error: episodeProfilesError,
  } = useEpisodeProfiles()

  const {
    speakerProfiles,
    usage,
    isLoading: loadingSpeakerProfiles,
    error: speakerProfilesError,
  } = useSpeakerProfiles(episodeProfiles)

  const isLoading = loadingEpisodeProfiles || loadingSpeakerProfiles
  const hasError = episodeProfilesError || speakerProfilesError

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Speaker configurations</h1>
        <p className="text-muted-foreground">
          Configure reusable voices and personalities for your generated episodes.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="overview"
          className="overflow-hidden rounded-xl border border-border bg-muted/40 px-4"
        >
          <AccordionTrigger className="gap-2 py-4 text-left text-sm font-semibold">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              {t('podcasts.howTemplatesPowerTitle')}
            </div>
          </AccordionTrigger>
          <AccordionContent className="text-sm text-muted-foreground">
            <div className="space-y-4">
              <p className="text-muted-foreground/90">
                {t('podcasts.howTemplatesPowerDesc')}
              </p>

              <div className="space-y-2">
                <h4 className="font-medium text-foreground">{t('podcasts.episodeProfilesSetFormat')}</h4>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t('podcasts.episodeProfilesList1')}</li>
                  <li>{t('podcasts.episodeProfilesList2')}</li>
                  <li>{t('podcasts.episodeProfilesList3')}</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-foreground">Speaker configurations bring voices to life</h4>
                <ul className="list-disc space-y-1 pl-5">
                  <li>{t('podcasts.speakerProfilesList1')}</li>
                  <li>{t('podcasts.speakerProfilesList2')}</li>
                  <li>{t('podcasts.speakerProfilesList3')}</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-foreground">{t('podcasts.recommendedWorkflow')}</h4>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>{t('podcasts.workflowStep1')}</li>
                  <li>{t('podcasts.workflowStep2')}</li>
                  <li>{t('podcasts.workflowStep3')}</li>
                </ol>
                <p className="text-xs text-muted-foreground/80">
                  {t('podcasts.workflowHint')}
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {hasError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('podcasts.failedToLoadTemplates')}</AlertTitle>
          <AlertDescription>
            {t('podcasts.failedToLoadTemplatesDesc')}
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('podcasts.loadingTemplates')}
        </div>
      ) : (
        <SpeakerProfilesPanel
          speakerProfiles={speakerProfiles}
          usage={usage}
        />
      )}
    </div>
  )
}
