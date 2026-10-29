import type { ReactNode } from "react"

type PageHeroProps = {
  eyebrow: string
  title: string
  description: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function PageHero({ eyebrow, title, description, action, compact = false }: PageHeroProps) {
  return (
    <section className={`relative overflow-hidden rounded-[1.25rem] bg-[#123b2d] px-5 text-[#f7f4e9] shadow-[0_10px_28px_rgba(18,59,45,.11)] sm:px-6 ${compact ? "py-3" : "py-3.5"}`}>
      <div className="absolute -right-12 -top-20 h-36 w-36 rounded-full bg-[#c9f45a]/14 blur-3xl" />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="shrink-0 text-[9px] font-semibold tracking-[.18em] text-[#c9f45a]">{eyebrow}</p>
          <h1 className="shrink-0 text-xl font-semibold leading-tight tracking-[-.035em] sm:text-2xl">{title}</h1>
          <div className="min-w-0 text-[10px] leading-4 text-white/58 sm:truncate sm:text-xs">{description}</div>
        </div>
        {action && <div className="flex w-full max-w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0 [&_button]:h-8 [&_button]:rounded-full [&_button]:px-3 [&_button]:text-xs">{action}</div>}
      </div>
    </section>
  )
}
