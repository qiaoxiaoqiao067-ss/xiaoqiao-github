/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises")
const { createClient } = require("@supabase/supabase-js")

const SOURCE = "海外AI真人短剧日报"
const CONVERSATION_ID = "6aaf988e-3530-83eb-b276-bc6716d138c4"
const SHARE_URL = "https://chatgpt.com/share/6b001fd7-c938-83ec-a845-84e45e5fd4f2"
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : "" }
function validate(report) {
  if (!report || !/^20\d{2}-\d{2}-\d{2}$/.test(String(report.date || ""))) throw new Error("日报日期必须为YYYY-MM-DD")
  if (!String(report.title || "").includes("海外AI真人短剧日报")) throw new Error("未识别为海外AI真人短剧日报")
  if (String(report.content || "").length < 300) throw new Error("日报正文过短，拒绝覆盖已有记录")
}
async function main() {
  const file = argument("--file"), owner = argument("--owner")
  if (!file || !owner) throw new Error("必须提供--file和--owner")
  const report = JSON.parse(await fs.readFile(file, "utf8")); validate(report)
  const row = { date: report.date, title: report.title, content: report.content, source: "ChatGPT｜海外AI真人短剧日报", conversationId: CONVERSATION_ID, shareUrl: SHARE_URL }
  const { data: existing, error: findError } = await client.from("market_data_imports").select("id,raw_rows").eq("user_id", owner).eq("source_name", SOURCE).eq("period_label", report.date).maybeSingle()
  if (findError) throw findError
  if (existing && existing.raw_rows?.[0]?.content === row.content) return console.log(JSON.stringify({ status: "unchanged", date: report.date }))
  const payload = { user_id: owner, source_name: SOURCE, period_label: report.date, file_name: `${report.date}_海外AI真人短剧日报.md`, row_count: 1, columns: ["date", "title", "content", "source", "conversationId", "shareUrl"], raw_rows: [row], updated_at: new Date().toISOString() }
  const { error } = existing ? await client.from("market_data_imports").update(payload).eq("id", existing.id) : await client.from("market_data_imports").insert(payload)
  if (error) throw error
  console.log(JSON.stringify({ status: existing ? "updated" : "inserted", date: report.date }))
}
main().catch(error => { console.error(error.message); process.exit(1) })
