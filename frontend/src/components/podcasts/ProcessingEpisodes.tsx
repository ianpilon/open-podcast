'use client'

import { useCallback, useMemo } from 'react'

import {
  useDeletePodcastEpisode,
  usePodcastEpisodes,
  useRetryPodcastEpisode,
} from '@/lib/hooks/use-podcasts'
import { EpisodeCard } from '@/components/podcasts/EpisodeCard'
import { Separator } from '@/components/ui/separator'

// Shows episodes that are actively generating (running or pending). It auto-polls
// via usePodcastEpisodes and disappears once nothing is processing — at which point
// the finished episode shows up on the History page.
export function ProcessingEpisodes() {
  // Poll steadily so a newly-submitted episode shows up promptly and clears
  // itself once it finishes (then it appears in Completed Episodes).
  const { statusGroups } = usePodcastEpisodes({ pollInterval: 4000 })
  const deleteEpisode = useDeletePodcastEpisode()
  const retryEpisode = useRetryPodcastEpisode()

  const processing = useMemo(
    () => [...statusGroups.running, ...statusGroups.pending],
    [statusGroups.running, statusGroups.pending]
  )

  const handleDelete = useCallback(
    (episodeId: string) => deleteEpisode.mutateAsync(episodeId),
    [deleteEpisode]
  )

  const handleRetry = useCallback(
    async (episodeId: string) => {
      await retryEpisode.mutateAsync(episodeId)
    },
    [retryEpisode]
  )

  if (processing.length === 0) {
    return null
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Currently Processing</h2>
        <p className="text-sm text-muted-foreground">
          Episodes that are actively generating assets.
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        {processing.map((episode) => (
          <EpisodeCard
            key={episode.id}
            episode={episode}
            onDelete={handleDelete}
            deleting={deleteEpisode.isPending}
            onRetry={handleRetry}
            retrying={retryEpisode.isPending}
          />
        ))}
      </div>
    </section>
  )
}
