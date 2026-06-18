'use client'

import { AppShell } from '@/components/layout/AppShell'
import { EpisodeProfilesPanel } from '@/components/podcasts/EpisodeProfilesPanel'
import { useEpisodeProfiles, useSpeakerProfiles } from '@/lib/hooks/use-podcasts'

export default function EpisodeProfilesPage() {
  const { episodeProfiles } = useEpisodeProfiles()
  const { speakerProfiles } = useSpeakerProfiles(episodeProfiles)

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <EpisodeProfilesPanel
            episodeProfiles={episodeProfiles}
            speakerProfiles={speakerProfiles}
          />
        </div>
      </div>
    </AppShell>
  )
}
