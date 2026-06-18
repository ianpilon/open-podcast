import { create } from 'zustand'

// Shared selection state for podcast content. Lives in a store so the Content
// page (where you pick notebooks/sources/notes) and the Generate Podcast page
// (where you submit) can share the same selections across routes.
export type SourceMode = 'off' | 'insights' | 'full'

export interface NotebookSelection {
  sources: Record<string, SourceMode>
  notes: Record<string, SourceMode>
}

type Selections = Record<string, NotebookSelection>

// A file dropped/chosen on the Generate Podcast page. Text is read client-side.
export interface UploadedFile {
  id: string
  name: string
  size: number
  status: 'reading' | 'done' | 'error'
  progress: number
  text: string
}

interface PodcastContentState {
  selections: Selections
  setSelections: (updater: Selections | ((prev: Selections) => Selections)) => void
  resetSelections: () => void

  uploadedFiles: UploadedFile[]
  addUploadedFile: (file: UploadedFile) => void
  updateUploadedFile: (id: string, partial: Partial<UploadedFile>) => void
  removeUploadedFile: (id: string) => void
  clearUploadedFiles: () => void
}

export const usePodcastContentStore = create<PodcastContentState>((set) => ({
  selections: {},
  setSelections: (updater) =>
    set((state) => ({
      selections: typeof updater === 'function' ? updater(state.selections) : updater,
    })),
  resetSelections: () => set({ selections: {} }),

  uploadedFiles: [],
  addUploadedFile: (file) =>
    set((state) => ({ uploadedFiles: [...state.uploadedFiles, file] })),
  updateUploadedFile: (id, partial) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) => (f.id === id ? { ...f, ...partial } : f)),
    })),
  removeUploadedFile: (id) =>
    set((state) => ({ uploadedFiles: state.uploadedFiles.filter((f) => f.id !== id) })),
  clearUploadedFiles: () => set({ uploadedFiles: [] }),
}))
