'use client'

import { AppShell } from '@/components/layout/AppShell'
import { TemplatesTab } from '@/components/podcasts/TemplatesTab'

export default function PodcastProfilesPage() {
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <TemplatesTab />
        </div>
      </div>
    </AppShell>
  )
}
