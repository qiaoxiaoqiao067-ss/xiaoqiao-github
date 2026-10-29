import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function errorMessage(error: unknown, fallback = "操作失败") {
  return error instanceof Error ? error.message : fallback
}

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

const today = new Date()
const todayLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`

const SEARCH_PROMPT = `你是海外 AI 短剧行业学习助手。请只选择与用户工作直接相关、且你确切知道的一个知识点，写成可供内容策划、责编、编剧或 AI 制作人员使用的学习卡片。

选题范围严格限定为：
- 海外竖屏短剧平台、受众、题材与商业模式
- 北美为主的短剧叙事、人物关系、前三集钩子和付费卡点
- AI 仿真人短剧的剧本、分镜、角色一致性、视频生成、配音与后期流程
- 中文剧本英文本地化、双语稿审核与海外文化适配
- 责编审稿、选题、爆款拆解、项目复盘与内容方法论
- 与上述工作直接相关的 AI 工具或制作技术

不要输出泛 AI 新闻、通用办公效率、通用 Agent 开发、大模型原理或与短剧行业无关的工具介绍。

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
[平台趋势 / 题材洞察 / 剧本方法 / 本地化 / AI制作 / 责编方法]

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

今天是${todayLabel}。请选择一个真实、可执行且与海外 AI 短剧直接相关的知识点。若内容涉及会变化的平台数据或行业趋势，不得虚构具体数字；应说明需要结合最新外部来源核验。

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
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
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
    const category = getSection("分类", "AI制作")
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
    const validCategories = ["平台趋势", "题材洞察", "剧本方法", "本地化", "AI制作", "责编方法"]
    const safeCategory = validCategories.includes(category) ? category : "AI制作"

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
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, "生成失败") }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const body = await request.json() as { id?: string; notes?: string; learned?: boolean }
    const { id, notes, learned } = body
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const client = getClient()
    const updates: { notes?: string; learned?: boolean } = {}
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
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}
