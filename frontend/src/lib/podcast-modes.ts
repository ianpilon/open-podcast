// Splits episode profiles into two generation modes: "podcast" (hosts discuss
// the content) and "briefing" (one voice reads and analyzes the user's notes).
// Profiles are backend data with no mode field, so membership lives here —
// add new briefing profile names to this set as they are created.
export const BRIEFING_PROFILE_NAMES = new Set([
  'discovery_debrief',
  'meeting_recap',
  'paper_explainer',
])

export type PodcastMode = 'podcast' | 'briefing'

export function profileMode(profileName: string): PodcastMode {
  return BRIEFING_PROFILE_NAMES.has(profileName) ? 'briefing' : 'podcast'
}

// Turns internal profile names like "discovery_debrief" into "Discovery Debrief".
export function formatProfileLabel(profileName: string): string {
  return profileName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
