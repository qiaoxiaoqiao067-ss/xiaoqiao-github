import test from "node:test"
import assert from "node:assert/strict"
import { announceTimelineChange, subscribeTimelineChanges } from "../src/lib/projects/timeline-sync"

test("saving refreshes other subscribers once, skips the writer, and removes listeners on close", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
  Object.defineProperty(globalThis, "window", { value: new EventTarget(), configurable: true })
  Object.defineProperty(globalThis, "document", { value: Object.assign(new EventTarget(), { visibilityState: "visible" }), configurable: true })
  let home = 0, projects = 0
  const closeHome = subscribeTimelineChanges("home", () => { home++ })
  const closeProjects = subscribeTimelineChanges("projects", () => { projects++ })
  try {
    announceTimelineChange("home")
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(home, 0)
    assert.equal(projects, 1, "local event and broadcast must not refresh twice")
    announceTimelineChange("projects")
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(home, 1)
    assert.equal(projects, 1)
    closeProjects()
    announceTimelineChange("home")
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(projects, 1, "closed views must stop receiving changes")
  } finally {
    closeHome(); closeProjects()
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else Reflect.deleteProperty(globalThis, "window")
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument)
    else Reflect.deleteProperty(globalThis, "document")
  }
})
