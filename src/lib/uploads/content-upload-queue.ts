"use client"

export type QueuedContentUpload = {
  id: string
  fileName: string
  mimeType: string
  lastModified: number
  blob: Blob
  contentType: "submission" | "development" | "benchmark" | "original"
  createdAt: string
  error: string | null
}

const DATABASE_NAME = "story-desk-upload-queue"
const STORE_NAME = "content-uploads"

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("无法打开本地上传队列"))
  })
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openQueue()
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode)
    const request = action(tx.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("本地上传队列操作失败"))
    tx.oncomplete = () => database.close()
    tx.onerror = () => database.close()
  })
}

export async function enqueueContentFiles(
  files: File[],
  contentType: QueuedContentUpload["contentType"],
) {
  const entries: QueuedContentUpload[] = files.map((file) => ({
    id: crypto.randomUUID(),
    fileName: file.name,
    mimeType: file.type,
    lastModified: file.lastModified,
    blob: file,
    contentType,
    createdAt: new Date().toISOString(),
    error: null,
  }))
  const database = await openQueue()
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    entries.forEach((entry) => store.put(entry))
    tx.oncomplete = () => { database.close(); resolve() }
    tx.onerror = () => { database.close(); reject(tx.error || new Error("无法保存待上传文件")) }
  })
  return entries
}

export async function getQueuedContentUploads() {
  const items = await transaction<QueuedContentUpload[]>("readonly", (store) => store.getAll())
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removeQueuedContentUpload(id: string) {
  await transaction("readwrite", (store) => store.delete(id))
}

export async function updateQueuedContentUploadError(id: string, error: string | null) {
  const item = await transaction<QueuedContentUpload | undefined>("readonly", (store) => store.get(id))
  if (!item) return
  await transaction("readwrite", (store) => store.put({ ...item, error }))
}

export function queuedUploadFile(entry: QueuedContentUpload) {
  return new File([entry.blob], entry.fileName, { type: entry.mimeType, lastModified: entry.lastModified })
}
