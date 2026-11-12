import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { handleScriptSource, MAX_STORED_SOURCE_BYTES, MAX_UPLOADED_SOURCE_BYTES, readBoundedBytes, SourceRequestError, type SourceDependencies, type StoredProjectSource } from "@/lib/statistics/server-source"
import { localizationHistoryRows, retiredLocalizationResponse } from "@/lib/statistics/localization-history"
import type { ScriptSource } from "@/lib/statistics/types"

const OWNER = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"
const FILE = "33333333-3333-4333-8333-333333333333"
const CONTENT = "44444444-4444-4444-8444-444444444444"
const bytes = new TextEncoder().encode("原件\n甲：你好\n乙：再见")
function source(text: string, fileName: string, format: string): ScriptSource {
  return { fileName, format, sourceHash: "test", lines: [{ id: "1:1", paragraph: 1, line: 1, text }], warnings: [] }
}
function fixture(overrides: Partial<SourceDependencies> = {}) {
  const calls: string[] = []
  const row: StoredProjectSource = { id: FILE, user_id: OWNER, project_id: PROJECT, title: "script.docx", version: 3,
    notes: JSON.stringify({ storage_path: `${OWNER}/projects/${PROJECT}/original.docx`, file_name: "script.docx", file_size: bytes.byteLength, text_content: "旧提取文字不应使用" }) }
  const deps: SourceDependencies = {
    authenticate: async () => ({ user: { id: "member" }, response: null }),
    access: async (_user, module) => { calls.push(`access:${module}`); return { ownerId: OWNER } },
    projectFile: async (id, owner) => { calls.push(`project:${id}:${owner}`); return row },
    contentFile: async (id, owner) => { calls.push(`content:${id}:${owner}`); return { id: FILE, user_id: OWNER, content_id: CONTENT, file_name: "script.docx", storage_path: `${OWNER}/${CONTENT}/original.docx`, size_bytes: bytes.byteLength, version: 2 } },
    parentOwned: async (kind, id, owner) => { calls.push(`parent:${kind}:${id}:${owner}`); return true },
    storageSize: async path => { calls.push(`size:${path}`); return bytes.byteLength },
    download: async path => { calls.push(`download:${path}`); return new Blob([bytes]) },
    parseLocal: async (data, name) => { calls.push("parse-original"); return source(new TextDecoder().decode(data), name, "docx") },
    fromText: async (text, name, format) => { calls.push("parse-text"); return source(text, name, format) },
    extractPdf: async () => "第一页\n甲：你好",
    extractDoc: async () => "甲：旧DOC你好",
    ...overrides,
  }
  return { deps, calls, row }
}
function jsonRequest(body: unknown) { return new Request("http://localhost/api/script-statistics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }
function uploadRequest(name = "file.txt", data: Uint8Array = bytes) {
  const form = new FormData()
  form.set("file", new Blob([new Uint8Array(data)]), name)
  return new Request("http://localhost/api/script-statistics", { method: "POST", body: form })
}

test("unauthenticated and unauthorized requests do not read files", async () => {
  const unauthorized = fixture({ authenticate: async () => ({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) }) })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), unauthorized.deps)).status, 401)
  assert.deepEqual(unauthorized.calls, [])
  const denied = fixture({ access: async () => null })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), denied.deps)).status, 403)
  assert.deepEqual(denied.calls, [])
})

test("standalone parsing accepts either view module, but never a member without either", async () => {
  const member = fixture({ access: async (_id, module) => module === "content" ? { ownerId: OWNER } : null })
  assert.equal((await handleScriptSource(uploadRequest(), member.deps)).status, 200)
  assert.ok(member.calls.includes("parse-original"))
  const denied = fixture({ access: async () => null })
  assert.equal((await handleScriptSource(uploadRequest(), denied.deps)).status, 403)
  assert.ok(!denied.calls.includes("parse-original"))
})

test("project file is scoped to workspace owner and parsed from original bytes, not cached text", async () => {
  const { deps, calls } = fixture()
  const response = await handleScriptSource(jsonRequest({ projectFileId: FILE }), deps)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.source.lines[0].text, new TextDecoder().decode(bytes))
  assert.equal(body.source.sourceHash, createHash("sha256").update(bytes).digest("hex"))
  assert.equal(body.source.fileId, FILE)
  assert.equal(body.source.projectId, PROJECT)
  assert.equal(body.source.sourceVersion, 3)
  assert.ok(calls.includes(`project:${FILE}:${OWNER}`))
  assert.ok(calls.includes(`parent:projects:${PROJECT}:${OWNER}`))
  assert.ok(!calls.includes("parse-text"))
})

test("cross-owner rows and projects outside the workspace cannot reach storage", async () => {
  const first = fixture()
  first.row.user_id = "other-owner"
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), first.deps)).status, 404)
  assert.ok(!first.calls.some(c => c.startsWith("size:")))
  const second = fixture({ parentOwned: async () => false })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), second.deps)).status, 404)
  assert.ok(!second.calls.some(c => c.startsWith("download:")))
})

test("metadata cannot redirect a project-file read to another project or owner", async () => {
  const { deps, row, calls } = fixture()
  row.notes = JSON.stringify({ storage_path: `${OWNER}/projects/other-project/a.docx`, file_name: "script.docx", file_size: bytes.byteLength })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), deps)).status, 409)
  assert.ok(!calls.some(c => c.startsWith("size:")))
})

test("project-only permission never grants reading a content-file ID", async () => {
  const { deps, calls } = fixture({ access: async (_id, module) => module === "projects" ? { ownerId: OWNER } : null })
  assert.equal((await handleScriptSource(jsonRequest({ contentFileId: FILE }), deps)).status, 403)
  assert.ok(!calls.some(c => c.startsWith("content:")))
})

test("content reads require the content parent and retain original version identity", async () => {
  const { deps, calls } = fixture()
  const response = await handleScriptSource(jsonRequest({ contentFileId: FILE }), deps)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.source.fileKind, "content")
  assert.equal(body.source.sourceVersion, 2)
  assert.ok(calls.includes(`parent:contents:${CONTENT}:${OWNER}`))
  assert.ok(calls.includes(`content:${FILE}:${OWNER}`))
})

test("two IDs, malformed IDs, and extra fields are rejected before database reads", async () => {
  for (const body of [{ projectFileId: FILE, contentFileId: FILE }, { projectFileId: "not-uuid" }, { projectFileId: FILE, ownerId: OWNER }, {}]) {
    const { deps, calls } = fixture()
    assert.equal((await handleScriptSource(jsonRequest(body), deps)).status, 400)
    assert.deepEqual(calls, [])
  }
})

test("stored object size and metadata must agree before download", async () => {
  const { deps, calls } = fixture({ storageSize: async () => bytes.byteLength + 1 })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), deps)).status, 409)
  assert.ok(!calls.some(c => c.startsWith("download:")))
  const oversized = fixture({ storageSize: async () => MAX_STORED_SOURCE_BYTES + 1 })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), oversized.deps)).status, 413)
  assert.ok(!oversized.calls.some(c => c.startsWith("download:")))
})

test("stored file record above 50MB and unsupported extensions are rejected before storage I/O", async () => {
  const first = fixture()
  const meta = JSON.parse(String(first.row.notes))
  first.row.notes = JSON.stringify({ ...meta, file_size: MAX_STORED_SOURCE_BYTES + 1 })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), first.deps)).status, 413)
  assert.ok(!first.calls.some(c => c.startsWith("size:")))
  const second = fixture()
  second.row.notes = JSON.stringify({ ...meta, file_name: "script.exe" })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), second.deps)).status, 400)
  assert.ok(!second.calls.some(c => c.startsWith("size:")))
})

test("an incomplete download cannot be parsed or quoted", async () => {
  const { deps, calls } = fixture({ download: async () => new Blob(["short"]) })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), deps)).status, 409)
  assert.ok(!calls.includes("parse-original"))
})

test("direct-upload cap is 4MB and applies even without a content-length header", async () => {
  const { deps, calls } = fixture()
  const response = await handleScriptSource(uploadRequest("large.docx", new Uint8Array(MAX_UPLOADED_SOURCE_BYTES + 1)), deps)
  assert.equal(response.status, 413)
  assert.ok(!calls.includes("parse-original"))
})

test("a storage response exceeding its preflight size is canceled before reading its remaining bytes", async () => {
  let chunks = 0
  let canceled = false
  const response = new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(6)); if (chunks === 10) controller.close() },
    cancel() { canceled = true },
  }))
  await assert.rejects(readBoundedBytes(response, 10), error => error instanceof SourceRequestError && error.status === 413)
  assert.ok(chunks < 10)
  assert.equal(canceled, true)
})

test("PDF and legacy DOC explicitly require review and cannot silently look like exact sources", async () => {
  for (const [name, body] of [["source.pdf", "%PDF-original"], ["source.doc", "legacy DOC bytes"]]) {
    const { deps } = fixture()
    const response = await handleScriptSource(uploadRequest(name, new TextEncoder().encode(body)), deps)
    assert.equal(response.status, 200)
    const { source } = await response.json()
    assert.equal(source.requiresReview, true)
    assert.ok(source.warnings.some((warning: string) => warning.includes("不能直接作为精确报价")))
    assert.equal(source.sourceHash, createHash("sha256").update(body).digest("hex"))
  }
})

test("project text records remain usable while records without an original cannot use cached extraction", async () => {
  const text = fixture()
  text.row.notes = JSON.stringify({ text_content: "第1集\n甲：项目正文" })
  const response = await handleScriptSource(jsonRequest({ projectFileId: FILE }), text.deps)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.source.format, "project-text")
  assert.ok(result.source.warnings.some((warning: string) => warning.includes("完整剧本")))
  assert.ok(!text.calls.some(c => c.startsWith("download:")))
  const absent = fixture()
  absent.row.notes = JSON.stringify({ extracted_text: "旧提取文本" })
  assert.equal((await handleScriptSource(jsonRequest({ projectFileId: FILE }), absent.deps)).status, 400)
})

test("retired localization writes are 410; historical owner/project filters do not mutate or delete", async () => {
  const gone = retiredLocalizationResponse()
  assert.equal(gone.status, 410)
  assert.equal((await gone.json()).readOnly, true)
  const rows = [
    { id: "ok", user_id: OWNER, project_id: PROJECT },
    { id: "other-owner", user_id: "someone-else", project_id: PROJECT },
    { id: "foreign-project", user_id: OWNER, project_id: "foreign" },
    { id: "unlinked-job", user_id: OWNER, project_id: null },
  ]
  const before = JSON.stringify(rows)
  assert.deepEqual(localizationHistoryRows(rows, OWNER, new Set([PROJECT]), "job").map(r => r.id), ["ok", "unlinked-job"])
  assert.deepEqual(localizationHistoryRows(rows, OWNER, new Set([PROJECT]), "file").map(r => r.id), ["ok"])
  assert.deepEqual(localizationHistoryRows(rows, OWNER, new Set([PROJECT]), "job", PROJECT).map(r => r.id), ["ok"])
  assert.equal(JSON.stringify(rows), before)
})
