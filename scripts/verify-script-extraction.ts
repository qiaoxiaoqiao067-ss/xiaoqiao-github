import { loadEnvConfig } from "@next/env"
import { writeFile } from "node:fs/promises"
import { extractScript } from "../src/lib/content/extract-script"

loadEnvConfig(process.cwd())
async function main() {
  const { serviceClient: db } = await import("../src/lib/supabase/service")
  const ids = process.argv.slice(2)
  for (const id of ids) {
    const { data: file, error } = await db.from("content_files").select("id,file_name,storage_path").eq("id", id).single()
    if (error) throw error
    const { data, error: downloadError } = await db.storage.from("content-files").download(file.storage_path)
    if (downloadError || !data) throw downloadError || new Error("download failed")
    const bytes = Buffer.from(await data.arrayBuffer())
    await writeFile(`/private/tmp/verify-script-${id}.bin`, bytes)
    const started = Date.now()
    const result = await extractScript(bytes, file.file_name.split(".").pop()!.toLowerCase())
    await writeFile(`/private/tmp/verify-script-${id}.json`, JSON.stringify(result))
    console.log(JSON.stringify({ id, name: file.file_name, seconds: (Date.now()-started)/1000, status: result.status, length: result.text?.length, error: result.error, preview: result.text?.slice(0, 200) }))
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
