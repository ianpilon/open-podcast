'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'

import { AppShell } from '@/components/layout/AppShell'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { chatApi } from '@/lib/api/chat'
import { sourcesApi } from '@/lib/api/sources'
import { notesApi } from '@/lib/api/notes'
import { NoteResponse, SourceListResponse } from '@/lib/types/api'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  ContentSelectionPanel,
  getSourceDefaultMode,
  hasSelections,
} from '@/components/podcasts/ContentSelectionPanel'
import {
  usePodcastContentStore,
  type SourceMode,
} from '@/lib/stores/podcast-content-store'

export default function PodcastContentPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [expandedNotebooks, setExpandedNotebooks] = useState<string[]>([])
  const [tokenCount, setTokenCount] = useState<number>(0)
  const [charCount, setCharCount] = useState<number>(0)

  const selections = usePodcastContentStore((state) => state.selections)
  const setSelections = usePodcastContentStore((state) => state.setSelections)

  const notebooksQuery = useNotebooks()
  const notebooks = useMemo(() => notebooksQuery.data ?? [], [notebooksQuery.data])

  // Fetch sources and notes for notebooks using useQueries
  const sourcesQueries = useQueries({
    queries: notebooks.map((notebook) => ({
      queryKey: QUERY_KEYS.sources(notebook.id),
      queryFn: () => sourcesApi.list({ notebook_id: notebook.id }),
      enabled:
        expandedNotebooks.includes(notebook.id) || hasSelections(selections[notebook.id]),
    })),
  })

  const notesQueries = useQueries({
    queries: notebooks.map((notebook) => ({
      queryKey: QUERY_KEYS.notes(notebook.id),
      queryFn: () => notesApi.list({ notebook_id: notebook.id }),
      enabled:
        expandedNotebooks.includes(notebook.id) || hasSelections(selections[notebook.id]),
    })),
  })

  const sourcesByNotebook = useMemo<Record<string, SourceListResponse[]>>(() => {
    const map: Record<string, SourceListResponse[]> = {}
    notebooks.forEach((notebook, index) => {
      map[notebook.id] = sourcesQueries[index]?.data ?? []
    })
    return map
  }, [notebooks, sourcesQueries])

  const notesByNotebook = useMemo<Record<string, NoteResponse[]>>(() => {
    const map: Record<string, NoteResponse[]> = {}
    notebooks.forEach((notebook, index) => {
      map[notebook.id] = notesQueries[index]?.data ?? []
    })
    return map
  }, [notebooks, notesQueries])

  const fetchingKey = useMemo(
    () => sourcesQueries.map((q) => (q.isFetching ? '1' : '0')).join(''),
    [sourcesQueries]
  )

  const fetchingNotebookIds = useMemo(() => {
    const ids = new Set<string>()
    notebooks.forEach((notebook, index) => {
      if (sourcesQueries[index]?.isFetching) {
        ids.add(notebook.id)
      }
    })
    return ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebooks, fetchingKey])

  const dataKey = useMemo(() => {
    const sourceIds = sourcesQueries
      .map((q) => q.data?.map((s) => s.id)?.join(',') ?? '')
      .join('|')
    const noteIds = notesQueries
      .map((q) => q.data?.map((n) => n.id)?.join(',') ?? '')
      .join('|')
    return `${sourceIds}::${noteIds}`
  }, [sourcesQueries, notesQueries])

  // Initialise selection defaults when content loads
  useEffect(() => {
    setSelections((prev) => {
      let changed = false
      const next = { ...prev }

      notebooks.forEach((notebook, index) => {
        const sources = sourcesQueries[index]?.data
        const notes = notesQueries[index]?.data

        if (!sources && !notes) {
          return
        }

        if (!next[notebook.id]) {
          next[notebook.id] = { sources: {}, notes: {} }
          changed = true
        }

        if (sources) {
          const currentSources = next[notebook.id].sources
          sources.forEach((source) => {
            if (!(source.id in currentSources)) {
              currentSources[source.id] = getSourceDefaultMode(source)
              changed = true
            }
          })
        }

        if (notes) {
          const currentNotes = next[notebook.id].notes
          notes.forEach((note) => {
            if (!(note.id in currentNotes)) {
              currentNotes[note.id] = 'full'
              changed = true
            }
          })
        }
      })

      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebooks, dataKey])

  // Update token/char counts when selections change
  useEffect(() => {
    const updateContextCounts = async () => {
      const hasAnySelections = Object.values(selections).some(
        (selection) =>
          Object.values(selection.sources).some((mode) => mode !== 'off') ||
          Object.values(selection.notes).some((mode) => mode !== 'off')
      )

      if (!hasAnySelections) {
        setTokenCount(0)
        setCharCount(0)
        return
      }

      try {
        let totalTokens = 0
        let totalChars = 0

        for (const [notebookId, selection] of Object.entries(selections)) {
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
            continue
          }

          const response = await chatApi.buildContext({
            notebook_id: notebookId,
            context_config: {
              sources: sourcesConfig,
              notes: notesConfig,
            },
          })

          totalTokens += response.token_count
          totalChars += response.char_count
        }

        setTokenCount(totalTokens)
        setCharCount(totalChars)
      } catch (error) {
        console.error('Error updating context counts:', error)
      }
    }

    updateContextCounts()
  }, [selections])

  const selectedNotebookSummaries = useMemo(() => {
    return notebooks.map((notebook) => {
      const selection = selections[notebook.id]
      if (!selection) {
        return { notebookId: notebook.id, sources: 0, notes: 0 }
      }
      const sourcesCount = Object.values(selection.sources).filter((mode) => mode !== 'off').length
      const notesCount = Object.values(selection.notes).filter((mode) => mode !== 'off').length
      return { notebookId: notebook.id, sources: sourcesCount, notes: notesCount }
    })
  }, [notebooks, selections])

  const handleNotebookToggle = (notebookId: string, checked: boolean | 'indeterminate') => {
    const shouldCheck = checked === 'indeterminate' ? true : checked
    const sources = sourcesByNotebook[notebookId] ?? []
    const notes = notesByNotebook[notebookId] ?? []
    setSelections((prev) => {
      if (shouldCheck) {
        const nextSources: Record<string, SourceMode> = {}
        sources.forEach((source) => {
          nextSources[source.id] = getSourceDefaultMode(source)
        })
        const nextNotes: Record<string, SourceMode> = {}
        notes.forEach((note) => {
          nextNotes[note.id] = 'full'
        })
        return { ...prev, [notebookId]: { sources: nextSources, notes: nextNotes } }
      }

      const clearedSources: Record<string, SourceMode> = {}
      sources.forEach((source) => {
        clearedSources[source.id] = 'off'
      })
      const clearedNotes: Record<string, SourceMode> = {}
      notes.forEach((note) => {
        clearedNotes[note.id] = 'off'
      })
      return { ...prev, [notebookId]: { sources: clearedSources, notes: clearedNotes } }
    })
  }

  const handleSourceModeChange = (notebookId: string, sourceId: string, mode: SourceMode) => {
    setSelections((prev) => ({
      ...prev,
      [notebookId]: {
        sources: { ...(prev[notebookId]?.sources ?? {}), [sourceId]: mode },
        notes: prev[notebookId]?.notes ?? {},
      },
    }))
  }

  const handleNoteToggle = (notebookId: string, noteId: string, checked: boolean | 'indeterminate') => {
    setSelections((prev) => ({
      ...prev,
      [notebookId]: {
        sources: prev[notebookId]?.sources ?? {},
        notes: { ...(prev[notebookId]?.notes ?? {}), [noteId]: checked ? 'full' : 'off' },
      },
    }))
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t('podcasts.content')}</h1>
            <p className="text-muted-foreground">{t('podcasts.contentDesc')}</p>
          </header>

          <div className="max-w-3xl">
            <ContentSelectionPanel
              notebooks={notebooks}
              isLoading={notebooksQuery.isLoading}
              selectedNotebookSummaries={selectedNotebookSummaries}
              tokenCount={tokenCount}
              charCount={charCount}
              expandedNotebooks={expandedNotebooks}
              setExpandedNotebooks={setExpandedNotebooks}
              selections={selections}
              sourcesByNotebook={sourcesByNotebook}
              notesByNotebook={notesByNotebook}
              fetchingNotebookIds={fetchingNotebookIds}
              handleNotebookToggle={handleNotebookToggle}
              handleSourceModeChange={handleSourceModeChange}
              handleNoteToggle={handleNoteToggle}
              queryClient={queryClient}
            />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
