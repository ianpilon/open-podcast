import { toast as sonnerToast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'

type ToastProps = {
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  durationMs?: number
}

export function useToast() {
  const { t } = useTranslation()

  return {
    toast: ({ title, description, variant = 'default', durationMs }: ToastProps) => {
      if (variant === 'destructive') {
        sonnerToast.error(title || t('common.error'), {
          description,
          duration: durationMs,
        })
      } else {
        sonnerToast.success(title || t('common.success'), {
          description,
          duration: durationMs,
        })
      }
    }
  }
}