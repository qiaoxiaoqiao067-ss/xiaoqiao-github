import { NextResponse } from "next/server";
import { runCodex } from "@/lib/ai/codex";
import { requireUser } from "@/lib/supabase/require-user";

type Translation = { original: string; chinese: string };

export async function POST(request: Request) {
  try {
    const { response } = await requireUser();
    if (response) return response;

    const body = (await request.json()) as { titles?: unknown };
    const titles = Array.isArray(body.titles)
      ? body.titles
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];
    if (!titles.length) {
      return NextResponse.json({ error: "没有待翻译的海外剧名" }, { status: 400 });
    }

    const prompt = `你是海外短剧本地化编辑。把以下海外短剧标题翻译为自然、简洁、便于中国内容团队内部阅读的中文剧名。

要求：
1. 忠实保留人物关系、身份、反转和情绪钩子，不擅自改写剧情。
2. 中文译名优先像短剧名，避免生硬逐字翻译；通常控制在4到16个汉字。
3. 人名可音译或按语义处理；CEO、Alpha等行业常用词可保留或自然转译。
4. 每个输入必须返回一条，original必须与输入完全一致。
5. 只输出JSON数组，不要Markdown，不要解释。格式：[{"original":"英文原名","chinese":"中文译名"}]

待翻译标题：
${titles.map((title, index) => `${index + 1}. ${title}`).join("\n")}`;

    const raw = await runCodex(prompt, 120000);
    const jsonText = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(jsonText) as Translation[];
    const requested = new Set(titles);
    const translations = Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            requested.has(item.original) &&
            typeof item.chinese === "string" &&
            item.chinese.trim(),
        )
      : [];
    if (!translations.length) throw new Error("AI未返回有效译名");

    return NextResponse.json({ translations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "剧名翻译失败" },
      { status: 500 },
    );
  }
}
