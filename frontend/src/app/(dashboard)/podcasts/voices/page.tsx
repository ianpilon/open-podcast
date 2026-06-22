'use client'

import { AppShell } from '@/components/layout/AppShell'
import { VoiceLibrary } from '@/components/podcasts/VoiceLibrary'

export default function VoiceLibraryPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Voice Library</h1>
            <p className="text-muted-foreground">
              Browse and preview voices. Click a voice ID to copy it into a speaker configuration.
            </p>
          </header>

          <VoiceLibrary />
        </div>
      </div>
    </AppShell>
  )
}
