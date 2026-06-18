'use client'

import { AppShell } from '@/components/layout/AppShell'
import { EpisodesTab } from '@/components/podcasts/EpisodesTab'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function PodcastHistoryPage() {
  const { t } = useTranslation()

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Completed Episodes</h1>
            <p className="text-muted-foreground">
              {t('podcasts.listDesc')}
            </p>
          </header>

          <EpisodesTab />
        </div>
      </div>
    </AppShell>
  )
}
