import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { execSync } from "child_process"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// GET: fetch weekly reports history or auto-aggregate daily reports
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get("start")
  const endDate = searchParams.get("end")

  try {
    const client = getClient()

    if (startDate && endDate) {
      // Aggregate daily reports for the week
      const { data, error } = await client
        .from("daily_reports")
        .select("*")
        .eq("status", "final")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })

      if (error) throw error
      return NextResponse.json({ reports: data || [], startDate, endDate })
    } else {
      // Fetch weekly report history
      const { data, error } = await client
        .from("weekly_reports")
        .select("*")
        .order("week_start", { ascending: false })
        .limit(10)

      if (error) throw error
      return NextResponse.json({ reports: data || [] })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST: save weekly report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, weekStart, weekEnd, content, summary } = body

    if (!userId || !weekStart || !weekEnd || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const client = getClient()

    // Check existing
    const { data: existing } = await client
      .from("weekly_reports")
      .select("id")
      .eq("week_start", weekStart)
      .eq("user_id", userId)
      .maybeSingle()

    let result
    if (existing) {
      const { data, error } = await client
        .from("weekly_reports")
        .update({ content, summary, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await client
        .from("weekly_reports")
        .insert({ user_id: userId, week_start: weekStart, week_end: weekEnd, content, summary })
        .select()
        .single()
      if (error) throw error
      result = data
    }

    return NextResponse.json({ report: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT: AI-generate weekly report from daily reports
export async function PUT(request: NextRequest) {
  try {
    const { dailyContents, weekStart, weekEnd } = await request.json()

    if (!dailyContents || !dailyContents.length) {
      return NextResponse.json({ error: "本周没有日报记录" }, { status: 400 })
    }

    const startLabel = formatDateLabel(weekStart)
    const endLabel = formatDateLabel(weekEnd)
    const combined = dailyContents.join("\n\n---\n\n")

    const prompt = `你是一个周报生成助手。根据本周的日报记录，生成周报文本内容（后续将用于制作PPT）。

## 本周日期
${startLabel} 至 ${endLabel}

## 本周日报记录
${combined}

## 周报格式要求

${startLabel} - ${endLabel} 周报

一、本周工作综述
📌 [一句话概括本周工作重点]

二、核心工作概览
| 模块 | 工作事项 | 具体产出 | 进度 |
|------|----------|----------|------|
| 模块1 | 事项描述 | 产出内容 | ✅/🔄 |
| 模块2 | 事项描述 | 产出内容 | ✅/🔄 |

三、心得收获
💡 心得1
💡 心得2

四、不足与改进
❓ 问题：[问题描述]
✅ 改进：[改进方案]

五、下周计划
📋 计划事项1
📋 计划事项2
📋 计划事项3

## 约束
- 自然、成熟的语言风格
- 只基于提供的日报内容，不虚构
- 表格用纯文本格式（竖线分隔）
- 心得1-2条，不足1-2条，计划3-5条
- 简洁有力，有逻辑条理

请只输出周报内容。`

    // Write prompt to temp file
    const tmpFile = join(tmpdir(), `weekly-prompt-${randomUUID()}.txt`)
    writeFileSync(tmpFile, prompt, "utf-8")

    try {
      const result = execSync(
        `cat ${tmpFile} | claude -p --model haiku --output-format text 2>/dev/null`,
        { encoding: "utf-8", timeout: 60000, maxBuffer: 1024 * 1024 }
      )
      return NextResponse.json({ report: result.trim() })
    } finally {
      try { unlinkSync(tmpFile) } catch {}
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "生成失败" }, { status: 500 })
  }
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
