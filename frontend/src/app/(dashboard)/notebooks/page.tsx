'use client'

import { useState } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { NotebookList } from './components/NotebookList'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { CreateNotebookDialog } from '@/components/notebooks/CreateNotebookDialog'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function NotebooksPage() {
  const { t } = useTranslation()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const { data: notebooks, isLoading, refetch } = useNotebooks(false)
  const { data: archivedNotebooks } = useNotebooks(true)

  const hasArchived = (archivedNotebooks?.length ?? 0) > 0

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">{t('notebooks.title')}</h1>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          <NotebookList
            notebooks={notebooks}
            isLoading={isLoading}
            title={t('notebooks.activeNotebooks')}
            onAction={() => setCreateDialogOpen(true)}
            actionLabel={t('notebooks.newNotebook')}
          />

          {hasArchived && (
            <NotebookList
              notebooks={archivedNotebooks}
              isLoading={false}
              title={t('notebooks.archivedNotebooks')}
              collapsible
            />
          )}
        </div>
        </div>
      </div>

      <CreateNotebookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </AppShell>
  )
}
