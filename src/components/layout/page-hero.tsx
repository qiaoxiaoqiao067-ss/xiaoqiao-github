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
    <section className={`relative overflow-hidden bg-[#123b2d] text-[#f7f4e9] shadow-[0_18px_45px_rgba(18,59,45,.15)] ${compact ? "rounded-[1.25rem] px-5 py-3 sm:px-6 sm:py-3.5" : "rounded-[1.5rem] px-5 py-4 sm:px-6 sm:py-5"}`}>
      <div className="absolute -right-16 -top-24 h-44 w-44 rounded-full bg-[#c9f45a]/15 blur-3xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[.22em] text-[#c9f45a]">{eyebrow}</p>
          <h1 className={`${compact ? "mt-1 text-xl sm:text-2xl" : "mt-1.5 text-2xl sm:text-3xl"} font-semibold leading-tight tracking-[-.045em]`}>{title}</h1>
          <div className={`${compact ? "mt-1 text-xs leading-5" : "mt-1.5 text-sm leading-6"} max-w-xl text-white/62`}>{description}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  )
}
