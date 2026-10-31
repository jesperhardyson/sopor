import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Bottenark på mobil, centrerad dialog från md och uppåt (som i designen). */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Arket får fokus i stället för första fältet, annars öppnas tangentbordet på mobil och täcker knapparna.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
        className="top-auto bottom-0 left-0 flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-[18px] overflow-y-auto rounded-t-[28px] rounded-b-none bg-surface px-5 pt-2.5 pb-7 text-text ring-0 sm:max-w-none md:top-1/2 md:bottom-auto md:left-1/2 md:max-w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:p-7"
      >
        <span className="mx-auto h-[5px] w-10 rounded-[3px] bg-border md:hidden" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="text-[22px] font-extrabold text-text">{title}</DialogTitle>
          <DialogDescription className="text-[15px] leading-[1.4] text-text-2">{description}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}
