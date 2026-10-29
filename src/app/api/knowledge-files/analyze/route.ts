import { join } from "node:path"
import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"

const GENRES = ["豪门与婚恋情感", "复仇与逆袭", "黑帮与犯罪", "狼人、吸血鬼与超自然", "BL与同性情感", "家庭伦理与亲子", "悬疑惊悚与谜案", "奇幻、重生与规则", "校园与青春", "职场专业剧", "生存、末日与科幻", "动作、竞技与体育", "历史、年代与西部", "喜剧与轻喜", "其他待归类"]
const TAGS = ["女频", "男频", "BL", "豪门", "黑帮", "狼人", "吸血鬼", "契约婚姻", "闪婚", "追妻", "先婚后爱", "禁忌恋", "年龄差", "多角关系", "复仇", "隐藏身份", "重生", "穿越", "萌宝", "家庭背叛", "甜宠", "虐恋", "医疗", "律政", "校园", "体育", "求生"]
let workerReady = false
const extension = (name: string) => name.split(".").pop()?.toLowerCase() || ""
async function extract(file: File) {
  const type = extension(file.name)
  if (type === "txt" || type === "md") return (await file.text()).trim()
  if (type === "docx") return (await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })).value.trim()
  if (type === "pdf") {
    if (!workerReady) { PDFParse.setWorker(join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")); workerReady = true }
    const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) })
    try { return (await parser.getText()).text.trim() } finally { await parser.destroy() }
  }
  throw new Error("仅支持 DOCX、PDF、TXT、Markdown")
}
function parseJson(text: string) { const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); return JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1)) as Record<string, unknown> }

export async function POST(request: Request) {
  try {
    const { response } = await requireUser(); if (response) return response
    const form = await request.formData(); const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择文件" }, { status: 400 })
    if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "文件不能超过50MB" }, { status: 400 })
    const content = await extract(file); if (!content) return NextResponse.json({ error: "文件没有可识别文字" }, { status: 400 })
    let suggestions: Record<string, unknown> = {}
    try {
      suggestions = parseJson(await runCodex(`你是海外AI真人短剧责编和爆款拆解分析师。只依据以下文本，不得虚构。输出JSON：{"title":"作品名称","logline":"一句话梗概","relationships":"主要人物关系","primaryGenre":"主类型","tags":["标签"],"hook":"一句话钩子","conflict":"核心冲突","emotion":"情绪发动机","structure":"结构与节奏","learnable":"值得学习","transferable":"可迁移到自己的创作","avoid":"不建议照搬"}\n主类型：${GENRES.join("、")}\n标签：${TAGS.join("、")}\n文本：\n${content.slice(0, 60000)}`, 90000))
    } catch { suggestions = {} }
    return NextResponse.json({ content, suggestions })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文件分析失败" }, { status: 500 }) }
}
