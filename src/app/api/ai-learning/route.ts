import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

const today = new Date()
const todayLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

const SEARCH_PROMPT = `你是 AI 学习助手。请参考 WaytoAGI（通往AGI之路）知识库的内容风格和选题方向，从中选取你训练数据中确切知道的一个真实 AI 知识点，写成学习卡片。

WaytoAGI 是国内最大的 AI 开源知识库，涵盖方向包括：
- AI 市场动态与行业趋势
- Prompt 提示词工程技巧
- AI Agent 设计与开发
- Skill/插件开发实践
- AI 工具测评与推荐
- 大模型原理与架构

## 内容真实性要求（极其重要）
- 只写你训练数据中确实验证过的、真实存在的知识
- 具体工具必须用真实名称（如 Claude、GPT、Cursor、ComfyUI 等）
- 具体技术必须真实存在（如 RAG、Function Calling、Chain-of-Thought 等）
- 如涉及事件，注明大致时间
- 如果不确定某个细节，标注"据公开信息"
- 绝对不编造任何工具名、公司名、技术术语

## 输出格式（纯文本，绝对不使用 Markdown）

EMOJI 标题
[emoji + 简洁标题，15字以内]

分类
[市场动态 / 提示词工程 / Skill开发 / Agent设计 / AI工具 / 模型原理]

难度
[入门 / 进阶 / 实战]

为什么重要
[1-2句话]

核心内容
是什么：
[清晰的概念或背景]

怎么用：
[具体技巧或实践要点]

实例：
[真实的应用场景，用真实工具/平台名]

一句话总结
[一行，方便记忆]

实践建议
[具体的 next step]

今天是${todayLabel}。请选择一个你确定真实存在且值得学习的 AI 知识点。优先选择 2025-2026 年间的新进展。

绝对不要使用 ##、**、*、- 、_ 等任何 Markdown 标记。纯文本即可。`

export async function GET(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const client = getClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const difficulty = searchParams.get("difficulty")

    let query = client.from("ai_learnings").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(30)
    if (category) query = query.eq("category", category)
    if (difficulty) query = query.eq("difficulty", parseInt(difficulty))

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ learnings: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    await request.json()

    const todayStr = today.toISOString().slice(0, 10)
    const client = getClient()

    // Check existing
    const { data: existing } = await client
      .from("ai_learnings")
      .select("id")
      .eq("date", todayStr)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existing) {
      const { data } = await client
        .from("ai_learnings")
        .select("*")
        .eq("id", existing.id)
        .single()
      return NextResponse.json({ learning: data })
    }

    const generated = await runCodex(SEARCH_PROMPT, 90000)

    // Parse sections
    const getSection = (label: string, fallback = "") => {
      const re = new RegExp(`${label}\\n([\\s\\S]*?)(?:\\n(?:EMOJI|分类|难度|为什么重要|核心内容|一句话总结|实践建议)|$)`, "i")
      return (generated.match(re)?.[1] || fallback).trim()
    }

    const titleLine = getSection("EMOJI 标题", getSection("EMOJI", "🤖 AI 今日要点"))
    const category = getSection("分类", "AI工具")
    const difficultyLabel = getSection("难度", "入门")
    const whyImportant = getSection("为什么重要", "")
    const coreContent = getSection("核心内容", generated)
    const oneLiner = getSection("一句话总结", "")
    const practiceAdvice = getSection("实践建议", "")

    // Combine into rich content
    const fullContent = [
      whyImportant ? `📌 为什么重要\n${whyImportant}` : "",
      `📖 核心内容\n${coreContent}`,
      oneLiner ? `💡 一句话总结\n${oneLiner}` : "",
      practiceAdvice ? `🚀 立刻试试\n${practiceAdvice}` : "",
    ].filter(Boolean).join("\n\n")

    // Aggressively remove ALL markdown formatting
    const cleanContent = fullContent
      .replace(/^#{1,6}\s+/gm, "")        // ### headers
      .replace(/\*\*(.+?)\*\*/g, "$1")    // **bold**
      .replace(/__(.+?)__/g, "$1")        // __bold__
      .replace(/\*(.+?)\*/g, "$1")        // *italic*
      .replace(/_(.+?)_/g, "$1")          // _italic_
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, "")) // `code`
      .replace(/^\s*[-*+]\s+/gm, "· ")     // bullet lists
      .replace(/^>\s+/gm, "")             // blockquotes
      .replace(/~~(.+?)~~/g, "$1")        // ~~strikethrough~~
      .replace(/\n{3,}/g, "\n\n")         // excessive newlines

    const difficulty = difficultyLabel === "实战" ? 3 : difficultyLabel === "进阶" ? 2 : 1
    const title = titleLine.replace(/^[^\w一-鿿]+/, "").trim() || "AI 今日要点"

    // Map category to valid values
    const validCategories = ["市场动态", "提示词工程", "Skill开发", "Agent设计", "AI工具", "模型原理"]
    const safeCategory = validCategories.includes(category) ? category : "AI工具"

    const { data, error } = await client
      .from("ai_learnings")
      .insert({
        user_id: user.id,
        title,
        content: cleanContent,
        source: "Codex AI 知识库 (基于训练数据)",
        source_url: "",
        category: safeCategory,
        difficulty,
        date: todayStr,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ learning: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "生成失败" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await request.json()
    const { id, notes, learned } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const client = getClient()
    const updates: any = {}
    if (notes !== undefined) updates.notes = notes
    if (learned !== undefined) updates.learned = learned

    const { data, error } = await client
      .from("ai_learnings")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ learning: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
