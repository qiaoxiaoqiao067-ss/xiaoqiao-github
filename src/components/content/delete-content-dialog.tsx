"use client"

import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type DeleteContentDialogProps = {
  title: string
  open: boolean
  deleting?: boolean
  onCancel: () => void
  onConfirm: () => void
}

/** A deliberate second step before removing a screenplay and all of its data. */
export function DeleteContentDialog({ title, open, deleting = false, onCancel, onConfirm }: DeleteContentDialogProps) {
  if (!open) return null

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a21]/55 p-4" role="presentation" onMouseDown={onCancel}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="delete-content-title" className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><Trash2 className="h-5 w-5" /></div>
      <h2 id="delete-content-title" className="mt-4 text-lg font-semibold">确认删除剧本？</h2>
      <p className="mt-2 break-words text-sm font-medium">《{title}》</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">删除后会同时移除上传文件、AI 审核历史和人工责编判断，无法恢复。若该剧本正在后台审核，结果也不会再写入工作台。</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={deleting}>取消</Button>
        <Button variant="destructive" onClick={onConfirm} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}确认删除</Button>
      </div>
    </section>
  </div>
}
