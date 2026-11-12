const CHANNEL = "yunxia-project-timeline-changed"
type Signal = { source: string; id: string }
let revision = 0

// Only send an invalidation signal. Each page reloads through its own authorized API.
export function announceTimelineChange(source: string) {
  const signal: Signal = { source, id: `${source}:${++revision}` }
  window.dispatchEvent(new CustomEvent(CHANNEL, { detail: signal }))
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL)
      channel.postMessage(signal)
      channel.close()
    } else {
      window.localStorage.setItem(CHANNEL, JSON.stringify({ ...signal, at: Date.now() }))
    }
  } catch { /* Focus refresh remains available when browser messaging is blocked. */ }
}

export function subscribeTimelineChanges(source: string, refresh: () => void) {
  let received = ""
  const receive = (signal?: Signal) => {
    if (!signal?.id || !signal.source || signal.source === source || signal.id === received) return
    received = signal.id
    refresh()
  }
  const local = (event: Event) => receive((event as CustomEvent<Signal>).detail)
  const storage = (event: StorageEvent) => {
    if (event.key !== CHANNEL || !event.newValue) return
    try { receive(JSON.parse(event.newValue) as Signal) } catch { /* Ignore unrelated malformed signals. */ }
  }
  let lastFocus = 0
  const focus = () => {
    if (document.visibilityState !== "visible" || Date.now() - lastFocus < 1000) return
    lastFocus = Date.now()
    refresh()
  }
  let channel: BroadcastChannel | undefined
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (event: MessageEvent<Signal>) => receive(event.data)
    }
  } catch { /* Fall back to focus refresh. */ }
  window.addEventListener(CHANNEL, local)
  window.addEventListener("storage", storage)
  window.addEventListener("focus", focus)
  document.addEventListener("visibilitychange", focus)
  return () => {
    channel?.close()
    window.removeEventListener(CHANNEL, local)
    window.removeEventListener("storage", storage)
    window.removeEventListener("focus", focus)
    document.removeEventListener("visibilitychange", focus)
  }
}
