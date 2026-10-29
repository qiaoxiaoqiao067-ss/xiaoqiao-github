import { NextResponse } from "next/server"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { requireUser } from "@/lib/supabase/require-user"
import { runCodex } from "@/lib/ai/codex"

const SKILL_PROMPT = `你是一个日报生成助手。根据用户提供的简短工作内容，生成一份自然、专业的工作日报。

## 格式要求

标题：YYYY年M月D日 日报

一、今日工作
1.事项描述（简洁、自然的一句话，说明做了什么）
2.事项描述
3.事项描述
（禁止添加任何子标题如"上午""下午""项目名"等）

二、明日工作
1.计划描述（简洁的一句话）
2.计划描述
（禁止添加任何子标题）

三、今日心得
[一个自然段落，2-4句话。只整理用户提供的心得，不得推断或补写。未提供时保留（待填写）。]

四、复盘反思
问题：
[一段话描述今天遇到的问题或不足，1-2句]

改进：
[一段话给出改进思路，1-2句]

## 格式参考（模仿这个风格）

一、今日工作
1.学习 Codex、Claude Code 的使用方式及模型调用逻辑，进一步理解 AI 开发工作流。
2.梳理培训人才发展体系及培训制度，搭建培训机制方案框架。
3.协助同事推进招聘工作，与候选人进行沟通并跟进相关事项。

二、明日工作
1.完成培训人才发展及培训制度机制方案输出。
2.持续学习 AI 工具的调用逻辑，提升实际应用能力。
3.结合业务，持续优化 AI 工作流和应用场景。

三、今日心得
面对新的工具，刚开始都会有畏难情绪，但真正开始动手后，会发现很多内容并没有想象中复杂。先理解整体逻辑，再通过不断实践去验证和调整，能力会在一次次使用中逐步建立起来。

四、复盘反思
问题：
在做方案时，容易直接进入细节，导致整体框架思考不够充分，后续容易反复调整。

改进：
先搭建整体框架，明确目标、模块和逻辑关系，再逐步完善每个细节内容。先有结构，再填内容，既能保证方案完整性，也能提高整体输出效率。

## 禁止事项
- 禁止添加子标题（如"上午""下午""项目A"等）
- 禁止使用"首先""其次""此外""总的来说""综上所述"等 AI 套路词
- 禁止使用感叹号
- 禁止使用 Markdown 标记
- 禁止虚构任何用户未提及的工作内容
- 禁止推断、补写用户未提供的心得、反思、结果或事实；缺失内容保留（待填写）
- 心得不要写成"今天我学到了..."的小学生日记风格，要自然、成熟

请严格按照格式输出，只输出日报内容，不要输出任何其他文字。`

export async function POST(request: Request) {
  const tmpFile = join(tmpdir(), `report-prompt-${randomUUID()}.txt`)

  try {
    const { response } = await requireUser()
    if (response) return response

    const { briefInput } = await request.json()

    if (!briefInput || !briefInput.trim()) {
      return NextResponse.json(
        { error: "请输入工作内容" },
        { status: 400 }
      )
    }

    const userPrompt = `请根据以下简短工作内容，生成一份完整的日报。

用户输入：
${briefInput}

要求：
1. 只整理和润色用户提供的信息，不补充未明确提供的完成结果
2. 如果用户提到了明天计划，放入"二、明日工作"
3. 如果用户没提心得或反思，对应部分输出（待填写），不得推断
4. 严格遵守格式要求，纯文本输出`

    const fullPrompt = `${SKILL_PROMPT}\n\n---\n\n${userPrompt}`

    // Write prompt to temp file to avoid shell escaping issues
    writeFileSync(tmpFile, fullPrompt, "utf-8")

    const reportText = await runCodex(fullPrompt, 60000)

    if (!reportText) {
      return NextResponse.json(
        { error: "AI 返回为空，请重试" },
        { status: 500 }
      )
    }

    return NextResponse.json({ report: reportText })
  } catch (error: unknown) {
    const details = error && typeof error === "object" ? error as Record<string, unknown> : {}
    const message = String(details.stderr || details.stdout || details.message || "未知错误")
    return NextResponse.json(
      { error: `Codex 调用失败: ${message.slice(0, 300)}` },
      { status: 500 }
    )
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}
