import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"
import { PageHero } from "@/components/layout/page-hero"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowUpRight } from "lucide-react"

export type ModuleItem = { title: string; description: string; icon: LucideIcon; href?: string; label?: string }

export function ModulePage({ eyebrow, title, description, items }: { eyebrow: string; title: string; description: string; items: ModuleItem[] }) {
  return <AppLayout><div className="space-y-6"><PageHero eyebrow={eyebrow} title={title} description={description} /><section><div className="mb-4"><p className="section-kicker">Workspace</p><h2 className="mt-1 text-2xl font-semibold">工作分区</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(({ title: itemTitle, description: itemDescription, icon: Icon, href, label }) => <Card key={itemTitle} className="group min-h-48 overflow-hidden"><CardContent className="flex h-full flex-col p-5"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-6 text-lg font-semibold">{itemTitle}</h3><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{itemDescription}</p>{href ? <Link href={href} className="mt-5"><Button variant="ghost" className="-ml-3">{label || "打开"}<ArrowUpRight className="ml-1 h-4 w-4" /></Button></Link> : <p className="mt-5 text-xs font-semibold text-primary/55">即将接入</p>}</CardContent></Card>)}</div></section></div></AppLayout>
}
