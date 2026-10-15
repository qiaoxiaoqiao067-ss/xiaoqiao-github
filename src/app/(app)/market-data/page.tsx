"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { PageHero } from "@/components/layout/page-hero";
import { useIdeas } from "@/hooks/use-ideas";
import {
  type MarketDataImport,
  useMarketDataImports,
} from "@/hooks/use-market-data-imports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BarChart3,
  BookmarkPlus,
  CircleCheck,
  CircleOff,
  CloudDownload,
  Database,
  FileDown,
  Flame,
  Layers3,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type Signal = "ad" | "tk" | "other";
type MarketView = "overview" | "analysis" | "data";
type AnalysisMode = "genres" | "works" | "materials" | "markets" | "trends" | "production" | "external";
type PeriodKind = "month" | "week" | "day";
type Work = {
  title: string;
  titleCn: string;
  titleKey: string;
  genre: string;
  platform: string;
  platforms: string[];
  rank: number | null;
  heat: number | null;
  period: string;
  sourceId: string;
  signal: Signal;
};
type Bucket = { name: string; value: number; heat: number };
type Dataset = {
  name: string;
  period: string;
  rows: number;
  aiRows: number;
  works: number;
  heat: number | null;
  signal: string;
  heatLabel: string;
};
type Opportunity = {
  title: string;
  titleCn: string;
  titleKey: string;
  genre: string;
  adHeat: number;
  tkHeat: number;
  score: number;
  quadrant: "双高验证" | "投放待验证" | "自传播机会" | "观察池";
};
type Dashboard = {
  works: Work[];
  genres: Bucket[];
  adGenres: Bucket[];
  tkGenres: Bucket[];
  platforms: Bucket[];
  adPlatforms: Bucket[];
  tkChannels: Bucket[];
  genrePairs: Bucket[];
  opportunities: Opportunity[];
  datasets: Dataset[];
  fields: string[];
  totalWorks: number;
  totalRows: number;
  rawRows: number;
  sharedGenres: Bucket[];
  singleSourceGenres: Bucket[];
  overlapWorks: Work[];
  overlapCount: number;
};
type TrendRow = { name: string; current: number; previous: number; change: number; streak: number };
type WorkTrendRow = { title: string; titleCn: string; currentRank: number | null; previousRank: number | null; movement: number; streak: number };
type TrendAnalysis = {
  currentPeriod: string;
  previousPeriod: string;
  periodCount: number;
  currentIndex: number;
  genres: TrendRow[];
  platforms: TrendRow[];
  works: WorkTrendRow[];
  newGenres: string[];
  fadingGenres: string[];
  periodKind: PeriodKind;
};
type ProductionAssessment = {
  score: number;
  difficulty: "低" | "中" | "高";
  characterRisk: "低" | "中" | "高";
  reuse: "低" | "中" | "高";
  reasons: string[];
};
type ExternalSignal = { id: string; source: string; topic: string; metric: string; value: number | null; change: string; url: string; note: string; period: string };
type HotMaterial = { name: string; work: string; platform: string; heat: number; source: string };

const TITLE = /剧名|作品名称|短剧名称|项目名称|名称|title|drama/i;
const TITLE_CN = /国内剧名|国内短剧|中文剧名|中文名/i;
const GENRE = /题材|类型|赛道|标签|分类|genre|category/i;
const PLATFORM = /投放产品Top[123]|平台|渠道|剧场号|app|platform|发行方/i;
const RANK = /排名|榜单|名次|rank|排行/i;
const HEAT = /播放增量|预估曝光|热度|指数|流水|收入|消耗|gmv|revenue|票房/i;
const MATERIAL = /素材名称|素材标题|广告标题|视频标题|素材ID|creative|material/i;
const GENERIC_TAGS = new Set(["AI仿真人", "实拍", "男频", "女频"]);
const CORE_PLATFORMS = ["ReelShort", "DramaBox", "DramaWave", "FlickReels", "NetShort", "GoodShort", "ShortMax", "FreeReels", "PineDrama", "Melolo"] as const;
const STANDARD_GENRES = ["情感", "家庭", "豪门", "都市", "甜宠", "虐恋", "复仇", "逆袭", "悬疑", "黑帮", "职场", "婚恋", "校园", "玄幻", "奇幻", "科幻", "动作", "战争", "末世", "历史", "年代", "宫斗", "后宫", "群像", "无限流"] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}
function numeric(value: unknown) {
  const raw = text(value).replace(/,/g, "");
  const plain = Number(raw);
  if (Number.isFinite(plain)) return plain;
  const number = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(number)) return null;
  return /亿/.test(raw) ? number * 1e8 : /万/.test(raw) ? number * 1e4 : number;
}
function keyFor(row: Record<string, unknown>, test: RegExp) {
  return Object.keys(row).find((key) => test.test(key));
}
function keysFor(row: Record<string, unknown>, test: RegExp) {
  return Object.keys(row).filter((key) => test.test(key));
}
function short(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function assessProduction(work: Work): ProductionAssessment {
  const tags = work.genre.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean);
  const count = (keywords: string[]) => tags.filter((tag) => keywords.some((keyword) => tag.includes(keyword))).length;
  const fit = count(["都市", "豪门", "家庭", "情感", "甜宠", "虐恋", "复仇", "逆袭", "婚恋", "职场", "校园", "黑帮"]);
  const complex = count(["科幻", "玄幻", "仙侠", "奇幻", "战争", "末世", "动作", "历史", "年代", "宫斗", "灾难", "机甲"]);
  const character = count(["家庭", "豪门", "后宫", "群像", "宫斗", "战争", "黑帮", "多角恋"]);
  const reusable = count(["都市", "豪门", "家庭", "职场", "校园", "医院", "婚恋", "甜宠"]);
  const score = Math.max(20, Math.min(95, 66 + Math.min(20, fit * 4) - complex * 9 - Math.max(0, character - 1) * 4));
  const difficulty: ProductionAssessment["difficulty"] = complex >= 2 ? "高" : complex === 1 ? "中" : "低";
  const characterRisk: ProductionAssessment["characterRisk"] = character >= 2 ? "高" : character === 1 ? "中" : "低";
  const reuse: ProductionAssessment["reuse"] = reusable >= 2 ? "高" : reusable === 1 ? "中" : "低";
  const reasons = [fit > 0 && "现代关系与室内场景较适合AI仿真人", complex > 0 && "包含世界观、动作或特效复杂度", character > 0 && "多角色关系提高人物一致性管理成本", reusable > 0 && "存在可复用的家庭、职场或都市资产"].filter((item): item is string => Boolean(item));
  return { score, difficulty, characterRisk, reuse, reasons: reasons.length ? reasons : ["标签信息有限，建议进行视觉小样测试"] };
}
function signalFor(columns: string[]): Signal {
  const headers = columns.join("|");
  return /新素材|总素材|预估曝光|投放/.test(headers)
    ? "ad"
    : /播放增量|播放总量|剧场号/.test(headers)
      ? "tk"
      : "other";
}
function platformName(
  value: string,
  signal: Signal,
  platformAliasMap: Record<string, string> = {},
) {
  if (!value) return signal === "tk" ? "未标注剧场号" : "未标注平台";
  if (signal === "tk") return value;
  const base =
    CORE_PLATFORMS.find((name) =>
      value.toLocaleLowerCase().includes(name.toLocaleLowerCase()),
    ) || value.split(/[-—–（(：:]/)[0].trim();
  return platformAliasMap[normalizeTitle(base)] || base;
}
function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}
function periodNumber(value: string) {
  const year = Number(value.match(/(20\d{2})/)?.[1] || 0);
  const month = Number(value.match(/(\d{1,2})\s*月/)?.[1] || 0);
  const day = Number(value.match(/(\d{1,2})\s*日/)?.[1] || 0);
  const week = Number(value.match(/第?\s*(\d{1,2})\s*周/)?.[1] || 0);
  return year * 10000 + month * 100 + day + week;
}
function periodKindFor(value: string): PeriodKind {
  return /日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|day/i.test(value) ? "day" : /周|week/i.test(value) ? "week" : "month";
}
function detectMonthLabel(fileName: string, sheetNames: string[], rows: Record<string, unknown>[]) {
  const periodValues = rows.slice(0, 50).flatMap((row) => Object.entries(row).filter(([key]) => /统计期|月份|month|period/i.test(key)).map(([, value]) => text(value)));
  const candidates = [fileName, ...sheetNames, ...periodValues];
  for (const candidate of candidates) {
    const separated = candidate.match(/(20\d{2})\s*[年\-_/\.]\s*(1[0-2]|0?[1-9])\s*月?/);
    if (separated) return `${separated[1]}年${Number(separated[2])}月`;
    const compact = candidate.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
    if (compact) return `${compact[1]}年${Number(compact[2])}月`;
  }
  return "";
}
function buildTrendAnalysis(periods: string[], dashboards: Map<string, Dashboard>, selectedPeriod: string): TrendAnalysis {
  const periodKind = periodKindFor(selectedPeriod);
  const ordered = periods.filter((item) => periodKindFor(item) === periodKind).sort((a, b) => periodNumber(a) - periodNumber(b) || a.localeCompare(b, "zh-CN"));
  const selectedIndex = ordered.indexOf(selectedPeriod);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : ordered.length - 1;
  const currentPeriod = ordered[currentIndex] || selectedPeriod;
  const previousPeriod = currentIndex > 0 ? ordered[currentIndex - 1] : "";
  const current = dashboards.get(currentPeriod);
  const previous = dashboards.get(previousPeriod);
  const streakFor = (name: string, pick: (dashboard: Dashboard) => Bucket[]) => {
    let streak = 0;
    for (let index = currentIndex; index >= 0; index -= 1) {
      const data = dashboards.get(ordered[index]);
      if (!data || !pick(data).some((item) => item.name === name)) break;
      streak += 1;
    }
    return streak;
  };
  const compareBuckets = (currentRows: Bucket[] = [], previousRows: Bucket[] = [], pick: (dashboard: Dashboard) => Bucket[]) => {
    const previousMap = new Map(previousRows.map((item) => [item.name, item.value]));
    return currentRows.map((item) => ({
      name: item.name,
      current: item.value,
      previous: previousMap.get(item.name) || 0,
      change: previousMap.has(item.name) ? item.value - (previousMap.get(item.name) || 0) : item.value,
      streak: streakFor(item.name, pick),
    })).sort((a, b) => b.change - a.change || b.current - a.current);
  };
  const currentGenres = current?.genres || [];
  const previousGenres = previous?.genres || [];
  const previousGenreNames = new Set(previousGenres.map((item) => item.name));
  const currentGenreNames = new Set(currentGenres.map((item) => item.name));
  const previousWorks = new Map((previous?.works || []).map((item) => [item.titleKey, item]));
  const works = [...new Map((current?.works || []).map((item) => [item.titleKey, item])).values()]
    .filter((item) => previousWorks.has(item.titleKey))
    .map((item) => {
      const prior = previousWorks.get(item.titleKey);
      const currentRank = item.rank;
      const previousRank = prior?.rank ?? null;
      let streak = 0;
      for (let index = currentIndex; index >= 0; index -= 1) {
        const data = dashboards.get(ordered[index]);
        if (!data?.works.some((work) => work.titleKey === item.titleKey)) break;
        streak += 1;
      }
      return { title: item.title, titleCn: item.titleCn, currentRank, previousRank, movement: currentRank !== null && previousRank !== null ? previousRank - currentRank : 0, streak };
    })
    .sort((a, b) => b.movement - a.movement || b.streak - a.streak)
    .slice(0, 8);
  return {
    currentPeriod,
    previousPeriod,
    periodCount: Math.max(0, currentIndex + 1),
    currentIndex,
    genres: compareBuckets(currentGenres, previousGenres, (dashboard) => dashboard.genres),
    platforms: compareBuckets(current?.platforms, previous?.platforms, (dashboard) => dashboard.platforms),
    works,
    newGenres: currentGenres.filter((item) => !previousGenreNames.has(item.name)).map((item) => item.name),
    fadingGenres: previousGenres.filter((item) => !currentGenreNames.has(item.name)).map((item) => item.name),
    periodKind,
  };
}

function analyze(
  imports: MarketDataImport[],
  chineseNameMap: Record<string, string> = {},
  titleAliasMap: Record<string, string> = {},
  platformAliasMap: Record<string, string> = {},
  genreAliasMap: Record<string, string> = {},
): Dashboard {
  const marketImports = imports.filter(
    (source) => source.source_name !== "中文名映射" && !source.source_name.startsWith("外部信号:"),
  );
  const genres = new Map<string, Bucket>(),
    adGenres = new Map<string, Bucket>(),
    tkGenres = new Map<string, Bucket>(),
    platforms = new Map<string, Bucket>(),
    adPlatforms = new Map<string, Bucket>(),
    tkChannels = new Map<string, Bucket>(),
    genrePairs = new Map<string, Bucket>(),
    works = new Map<string, Work>(),
    fields = new Set<string>(),
    datasets: Dataset[] = [],
    genreSources = new Map<string, Set<string>>();
  const add = (map: Map<string, Bucket>, name: string, heat: number | null) => {
    if (!name) return;
    const value = map.get(name) || { name, value: 0, heat: 0 };
    value.value += 1;
    value.heat += heat || 0;
    map.set(name, value);
  };
  for (const source of marketImports) {
    const signal = signalFor(source.columns),
      seen = new Set<string>();
    let sumHeat = 0;
    let hasHeat = false;
    let aiRows = 0;
    for (const row of source.raw_rows || []) {
      const titleKey = keyFor(row, TITLE),
        titleCnKey = keyFor(row, TITLE_CN),
        genreKey = keyFor(row, GENRE),
        platformKeys = keysFor(row, PLATFORM),
        rankKey = keyFor(row, RANK),
        heatKey = keyFor(row, HEAT);
      [titleKey, titleCnKey, genreKey, ...platformKeys, rankKey, heatKey]
        .filter(Boolean)
        .forEach((key) => fields.add(key as string));
      const title = titleKey ? text(row[titleKey]) : "",
        titleCnFromSource = titleCnKey ? text(row[titleCnKey]) : "",
        genre = genreKey ? text(row[genreKey]) : "未标注题材";
      if (
        !genre
          .split(/[、,，/]/)
          .map((item) => item.trim())
          .includes("AI仿真人")
      )
        continue;
      aiRows += 1;
      const rawNormalizedTitle = titleKey ? normalizeTitle(title) : "",
        normalizedTitle = titleAliasMap[rawNormalizedTitle]
          ? normalizeTitle(titleAliasMap[rawNormalizedTitle])
          : rawNormalizedTitle,
        titleCn =
          titleCnFromSource ||
          chineseNameMap[rawNormalizedTitle] ||
          chineseNameMap[normalizedTitle] ||
          "",
        rowPlatforms = [
          ...new Set(
            platformKeys
              .map((key) => text(row[key]))
              .filter(Boolean)
              .map((value) => platformName(value, signal, platformAliasMap))
              .filter(Boolean),
          ),
        ],
        platform =
          rowPlatforms[0] ||
          (signal === "tk" ? "未标注剧场号" : "未标注平台"),
        rank = rankKey ? numeric(row[rankKey]) : null,
        heat = heatKey ? numeric(row[heatKey]) : null;
      if (heat !== null) {
        sumHeat += heat;
        hasHeat = true;
      }
      const tags = genre
        .split(/[、,，/]/)
        .map((item) => item.trim())
        .filter((item) => item && !GENERIC_TAGS.has(item));
      const normalizedTags = [...new Set(tags.map((item) => genreAliasMap[normalizeTitle(item)] || item))];
      normalizedTags.forEach((item) => {
        add(genres, item, heat);
        add(
          signal === "ad" ? adGenres : signal === "tk" ? tkGenres : genres,
          item,
          heat,
        );
        const sources = genreSources.get(item) || new Set<string>();
        sources.add(source.id);
        genreSources.set(item, sources);
      });
      normalizedTags
        .slice(0, 8)
        .forEach((first, index) =>
          tags
            .slice(index + 1, 8)
            .forEach((second) =>
              add(
                genrePairs,
                [first, second]
                  .sort((a, b) => a.localeCompare(b, "zh-CN"))
                  .join(" × "),
                heat,
              ),
            ),
        );
      rowPlatforms.forEach((item) => {
        add(platforms, item, heat);
        add(signal === "ad" ? adPlatforms : tkChannels, item, heat);
      });
      if (title && normalizedTitle && title.length <= 120) {
        seen.add(normalizedTitle);
        const id = `${source.id}:${normalizedTitle}`,
          old = works.get(id);
        if (!old)
          works.set(id, {
            title,
            titleCn,
            titleKey: normalizedTitle,
            genre: ["AI仿真人", ...normalizedTags].join("、"),
            platform,
            platforms: rowPlatforms.length ? rowPlatforms : [platform],
            rank,
            heat,
            period: source.period_label || "未标记统计期",
            sourceId: source.id,
            signal,
          });
        else {
          old.heat = (old.heat || 0) + (heat || 0);
          old.platforms = [
            ...new Set([...old.platforms, ...rowPlatforms]),
          ];
          old.platform = old.platforms[0] || old.platform;
          if (!old.titleCn && titleCn) old.titleCn = titleCn;
          if (rank !== null && (old.rank === null || rank < old.rank))
            old.rank = rank;
        }
      }
    }
    datasets.push({
      name: source.file_name,
      period: source.period_label || "未标记统计期",
      rows: source.row_count,
      aiRows,
      works: seen.size,
      heat: hasHeat ? sumHeat : null,
      signal:
        signal === "ad"
          ? "素材/投放势能"
          : signal === "tk"
            ? "热播/扩散势能"
            : "市场样本",
      heatLabel:
        signal === "ad"
          ? "预估曝光合计"
          : signal === "tk"
            ? "播放增量合计"
            : "热度合计",
    });
  }
  const order = (map: Map<string, Bucket>) =>
    [...map.values()]
      .sort((a, b) => b.value - a.value || b.heat - a.heat)
      .slice(0, 8);
  const allWorks = [...works.values()],
    sourceCountByTitle = new Map<string, Set<string>>();
  allWorks.forEach((item) => {
    const sources = sourceCountByTitle.get(item.titleKey) || new Set<string>();
    sources.add(item.sourceId);
    sourceCountByTitle.set(item.titleKey, sources);
  });
  const sortedWorks = allWorks.sort((a, b) =>
    a.rank !== null && b.rank !== null
      ? a.rank - b.rank
      : a.rank !== null
        ? -1
        : b.rank !== null
          ? 1
          : (b.heat || 0) - (a.heat || 0),
  );
  const shared = new Map(
    [...genres].filter(([name]) => (genreSources.get(name)?.size || 0) >= 2),
  );
  const single = new Map(
    [...genres].filter(([name]) => (genreSources.get(name)?.size || 0) === 1),
  );
  const overlapKeys = new Set(
    [...sourceCountByTitle]
      .filter(([, sources]) => sources.size >= 2)
      .map(([key]) => key),
  );
  const byTitle = new Map<string, Work[]>();
  allWorks.forEach((item) =>
    byTitle.set(item.titleKey, [...(byTitle.get(item.titleKey) || []), item]),
  );
  const adThreshold = percentile(
      allWorks
        .filter((item) => item.signal === "ad")
        .map((item) => item.heat || 0),
      0.8,
    ),
    tkThreshold = percentile(
      allWorks
        .filter((item) => item.signal === "tk")
        .map((item) => item.heat || 0),
      0.8,
    );
  const opportunities = [...overlapKeys]
    .map((key) => {
      const matches = byTitle.get(key) || [],
        ad = matches.find((item) => item.signal === "ad"),
        tk = matches.find((item) => item.signal === "tk"),
        adHeat = ad?.heat || 0,
        tkHeat = tk?.heat || 0,
        adHigh = adHeat >= adThreshold,
        tkHigh = tkHeat >= tkThreshold,
        score = Math.min(
          100,
          Math.round(
            50 * Math.min(1, adThreshold ? adHeat / adThreshold : 0) +
              50 * Math.min(1, tkThreshold ? tkHeat / tkThreshold : 0),
          ),
        );
      return {
        title: ad?.title || tk?.title || key,
        titleCn: ad?.titleCn || tk?.titleCn || "",
        titleKey: key,
        genre: ad?.genre || tk?.genre || "",
        adHeat,
        tkHeat,
        score,
        quadrant:
          adHigh && tkHigh
            ? "双高验证"
            : adHigh
              ? "投放待验证"
              : tkHigh
                ? "自传播机会"
                : "观察池",
      } as Opportunity;
    })
    .sort((a, b) => {
      const order = { 双高验证: 0, 自传播机会: 1, 投放待验证: 2, 观察池: 3 };
      return order[a.quadrant] - order[b.quadrant] || b.score - a.score;
    });
  return {
    works: sortedWorks,
    genres: order(genres),
    adGenres: order(adGenres),
    tkGenres: order(tkGenres),
    platforms: order(platforms),
    adPlatforms: order(adPlatforms),
    tkChannels: order(tkChannels),
    genrePairs: order(genrePairs),
    opportunities,
    datasets,
    fields: [...fields],
    totalWorks: new Set(allWorks.map((item) => item.titleKey)).size,
    totalRows: datasets.reduce((sum, item) => sum + item.aiRows, 0),
    rawRows: marketImports.reduce((sum, item) => sum + item.row_count, 0),
    sharedGenres: order(shared),
    singleSourceGenres: order(single),
    overlapWorks: sortedWorks.filter((item) => overlapKeys.has(item.titleKey)),
    overlapCount: overlapKeys.size,
  };
}

export default function MarketDataPage() {
  const { imports, loading, error, addImport, deleteImport } =
    useMarketDataImports();
  const { ideas, addIdea } = useIdeas();
  const fileRef = useRef<HTMLInputElement>(null);
  const chineseNameFileRef = useRef<HTMLInputElement>(null);
  const externalSignalFileRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState("2026年9月");
  const [activeView, setActiveView] = useState<MarketView>("overview");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("works");
  const [uploading, setUploading] = useState(false);
  const [uploadingExternal, setUploadingExternal] = useState(false);
  const [externalSource, setExternalSource] = useState("TikTok话题");
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState("");
  const [chineseNameMap, setChineseNameMap] = useState<Record<string, string>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        const saved = localStorage.getItem("market-data-chinese-name-map");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );
  const [titleAliasMap, setTitleAliasMap] = useState<Record<string, string>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        const saved = localStorage.getItem("market-data-title-alias-map");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );
  const [platformAliasMap, setPlatformAliasMap] = useState<
    Record<string, string>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("market-data-platform-alias-map");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [genreAliasMap, setGenreAliasMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("market-data-genre-alias-map");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [signalFilter, setSignalFilter] = useState<"all" | Signal>("all"),
    [genreFilter, setGenreFilter] = useState("all"),
    [channelQuery, setChannelQuery] = useState(""),
    [nameFilter, setNameFilter] = useState<"all" | "named" | "missing">("all");
  const [selectedWork, setSelectedWork] = useState<Work | null>(null),
    [savingIdea, setSavingIdea] = useState("");
  useEffect(() => {
    const capturedPeriod = localStorage.getItem("market-data-captured-period");
    if (capturedPeriod) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPeriod(capturedPeriod);
      localStorage.removeItem("market-data-captured-period");
    }
  }, []);
  const [sortBy, setSortBy] = useState<"rank" | "heat" | "title">("rank"),
    [page, setPage] = useState(1);
  const syncedChineseNameMap = useMemo(() => {
    const synced = { ...chineseNameMap };
    imports
      .filter((item) => item.source_name === "中文名映射")
      .slice()
      .reverse()
      .forEach((item) =>
        item.raw_rows.forEach((row) => {
          const original = text(row["海外原名"] ?? "");
          const chinese = text(row["中文辅助名"] ?? "");
          if (original && chinese) synced[normalizeTitle(original)] = chinese;
        }),
      );
    return synced;
  }, [imports, chineseNameMap]);
  const periodOptions = useMemo(
    () =>
      [
        ...new Set(
          imports
            .filter((item) => item.source_name !== "中文名映射" && !item.source_name.startsWith("外部信号:"))
            .map((item) => item.period_label)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort((a, b) => b.localeCompare(a, "zh-CN")),
    [imports],
  );
  const periodImports = useMemo(
    () =>
      imports.filter(
        (item) =>
          item.source_name === "中文名映射" || item.period_label === period,
      ),
    [imports, period],
  );
  const dashboard = useMemo(
    () =>
      analyze(
        periodImports,
        syncedChineseNameMap,
        titleAliasMap,
        platformAliasMap,
        genreAliasMap,
      ),
    [
      periodImports,
      syncedChineseNameMap,
      titleAliasMap,
      platformAliasMap,
      genreAliasMap,
    ],
  );
  const periodDashboards = useMemo(() => {
    const result = new Map<string, Dashboard>();
    periodOptions.forEach((option) => {
      result.set(option, analyze(imports.filter((item) => item.source_name === "中文名映射" || item.period_label === option), syncedChineseNameMap, titleAliasMap, platformAliasMap, genreAliasMap));
    });
    return result;
  }, [imports, periodOptions, syncedChineseNameMap, titleAliasMap, platformAliasMap, genreAliasMap]);
  const trendAnalysis = useMemo(
    () => buildTrendAnalysis(periodOptions, periodDashboards, period),
    [periodOptions, periodDashboards, period],
  );
  const periodGroups = useMemo(
    () => ({
      month: periodOptions.filter((item) => periodKindFor(item) === "month"),
      week: periodOptions.filter((item) => periodKindFor(item) === "week"),
      day: periodOptions.filter((item) => periodKindFor(item) === "day"),
    }),
    [periodOptions],
  );
  const uploadMonthOptions = useMemo(() => {
    const now = new Date();
    const generated = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + 3 - index, 1);
      return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    });
    return [...new Set([...periodGroups.month, ...generated])].sort((a, b) => periodNumber(b) - periodNumber(a));
  }, [periodGroups.month]);
  const changePeriodKind = (kind: PeriodKind) => {
    const target = [...periodGroups[kind]].sort((a, b) => periodNumber(b) - periodNumber(a))[0];
    if (target) setPeriod(target);
  };
  const savePlatformAlias = (source: string, target: string) => {
    if (!source.trim() || !target.trim()) return;
    const next = {
      ...platformAliasMap,
      [normalizeTitle(source)]: target.trim(),
    };
    setPlatformAliasMap(next);
    localStorage.setItem("market-data-platform-alias-map", JSON.stringify(next));
    setMessage(`已将平台“${source}”映射为“${target.trim()}”。`);
  };
  const saveTitleAlias = (alias: string, standardTitle: string) => {
    if (!alias.trim() || !standardTitle.trim()) return;
    const next = {
      ...titleAliasMap,
      [normalizeTitle(alias)]: standardTitle.trim(),
    };
    setTitleAliasMap(next);
    localStorage.setItem("market-data-title-alias-map", JSON.stringify(next));
    setMessage(`已将“${alias}”关联到标准剧名“${standardTitle.trim()}”。`);
  };
  const saveGenreAlias = (alias: string, standardGenre: string) => {
    if (!alias.trim() || !standardGenre.trim()) return;
    const next = { ...genreAliasMap, [normalizeTitle(alias)]: standardGenre.trim() };
    setGenreAliasMap(next);
    localStorage.setItem("market-data-genre-alias-map", JSON.stringify(next));
    setMessage(`已将题材“${alias}”归一为“${standardGenre.trim()}”。`);
  };
  const latest = imports.find(
    (item) =>
      item.source_name !== "中文名映射" && !item.source_name.startsWith("外部信号:") && item.period_label === period,
  );
  const externalSignals = useMemo<ExternalSignal[]>(() => imports.filter((item) => item.source_name.startsWith("外部信号:") && item.period_label === period).flatMap((item) => item.raw_rows.map((row, index) => {
    const find = (test: RegExp) => Object.keys(row).find((key) => test.test(key));
    const topicKey = find(/话题|关键词|剧名|作品|title|topic|keyword/i);
    const metricKey = find(/指标|metric|类型/i);
    const valueKey = find(/数值|热度|播放|互动|搜索|下载|排名|value|views|engagement/i);
    const changeKey = find(/趋势|变化|增幅|环比|change|growth/i);
    const urlKey = find(/链接|网址|url|source/i);
    const noteKey = find(/备注|说明|判断|note/i);
    return { id: `${item.id}:${index}`, source: item.source_name.replace("外部信号:", ""), topic: topicKey ? text(row[topicKey]) : "未命名信号", metric: metricKey ? text(row[metricKey]) : "外部热度", value: valueKey ? numeric(row[valueKey]) : null, change: changeKey ? text(row[changeKey]) : "", url: urlKey ? text(row[urlKey]) : "", note: noteKey ? text(row[noteKey]) : "", period: item.period_label || period };
  })), [imports, period]);
  const hotMaterials = useMemo<HotMaterial[]>(() => {
    const materialMap = new Map<string, HotMaterial>();
    periodImports
      .filter((item) => item.source_name !== "中文名映射" && !item.source_name.startsWith("外部信号:"))
      .forEach((item) => item.raw_rows.forEach((row) => {
        const materialKey = keyFor(row, MATERIAL);
        if (!materialKey) return;
        const name = text(row[materialKey]);
        if (!name) return;
        const titleKey = keyFor(row, TITLE);
        const platformKey = keyFor(row, PLATFORM);
        const heatKey = keyFor(row, HEAT);
        const heat = heatKey ? numeric(row[heatKey]) || 0 : 0;
        const key = normalizeTitle(name) || name;
        const existing = materialMap.get(key);
        if (!existing || heat > existing.heat) materialMap.set(key, {
          name,
          work: titleKey ? text(row[titleKey]) : "未关联剧目",
          platform: platformKey ? text(row[platformKey]) : "未标注平台",
          heat,
          source: item.source_name,
        });
      }));
    return [...materialMap.values()].sort((a, b) => b.heat - a.heat).slice(0, 50);
  }, [periodImports]);
  const genreOptions = useMemo(
    () =>
      [
        ...new Set(
          dashboard.works
            .flatMap((work) =>
              work.genre.split(/[、,，/]/).map((item) => item.trim()),
            )
            .filter((item) => item && !GENERIC_TAGS.has(item)),
        ),
      ].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [dashboard.works],
  );
  const filteredWorks = useMemo(
    () =>
      dashboard.works.filter(
        (work) =>
          (signalFilter === "all" || work.signal === signalFilter) &&
          (nameFilter === "all" ||
            (nameFilter === "named" ? Boolean(work.titleCn) : !work.titleCn)) &&
          (genreFilter === "all" ||
            work.genre.split(/[、,，/]/).includes(genreFilter)) &&
          (!channelQuery.trim() ||
            work.platforms.some((platform) =>
              platform
                .toLocaleLowerCase()
                .includes(channelQuery.trim().toLocaleLowerCase()),
            ) ||
            work.title
              .toLocaleLowerCase()
              .includes(channelQuery.trim().toLocaleLowerCase()) ||
            work.titleCn.includes(channelQuery.trim())),
      ),
    [dashboard.works, signalFilter, nameFilter, genreFilter, channelQuery],
  );
  const orderedWorks = useMemo(
    () =>
      [...filteredWorks].sort((a, b) =>
        sortBy === "heat"
          ? (b.heat || 0) - (a.heat || 0)
          : sortBy === "title"
            ? (a.titleCn || a.title).localeCompare(
                b.titleCn || b.title,
                "zh-CN",
              )
            : a.rank !== null && b.rank !== null
              ? a.rank - b.rank
              : a.rank !== null
                ? -1
                : 1,
      ),
    [filteredWorks, sortBy],
  );
  const pageSize = 20,
    maxPage = Math.max(1, Math.ceil(orderedWorks.length / pageSize)),
    safePage = Math.min(page, maxPage),
    visibleWorks = orderedWorks.slice(
      (safePage - 1) * pageSize,
      safePage * pageSize,
    );
  const savedTitles = useMemo(
    () => new Set(ideas.map((idea) => normalizeTitle(idea.title))),
    [ideas],
  );
  const chineseTitleCount = useMemo(
    () =>
      new Set(
        dashboard.works
          .filter((work) => work.titleCn)
          .map((work) => work.titleKey),
      ).size,
    [dashboard.works],
  );
  const chineseTitleCoverage = dashboard.totalWorks
    ? (chineseTitleCount / dashboard.totalWorks) * 100
    : 0;
  const saveOpportunity = async (item: Opportunity) => {
    const saved =
      savedTitles.has(item.titleKey) ||
      (item.titleCn ? savedTitles.has(normalizeTitle(item.titleCn)) : false);
    if (saved) {
      setMessage(`“${item.titleCn || item.title}”已在选题情报中。`);
      return;
    }
    setSavingIdea(item.titleKey);
    try {
      await addIdea({
        title: item.titleCn || item.title,
        source: `ADX · ${latest?.period_label || period}`,
        market: "海外市场 / 北美优先",
        genre: item.genre,
        status: "待调研",
        notes: `${item.titleCn ? `原始剧名：${item.title}。` : ""}市场看板机会指数 ${item.score}。${item.quadrant}：广告预估曝光 ${short(item.adHeat)}，TikTok播放增量 ${short(item.tkHeat)}。下一步核验人物关系、前三集钩子、付费卡点和AI制作难度。`,
      });
      setMessage(
        `已将“${item.titleCn || item.title}”加入选题情报的“待调研”列表。`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "加入选题库失败");
    } finally {
      setSavingIdea("");
    }
  };
  const saveGenrePair = async (item: Bucket) => {
    const title = `题材机会｜${item.name}`;
    const titleKey = normalizeTitle(title);
    if (savedTitles.has(titleKey)) {
      setMessage(`“${item.name}”已在选题情报中。`);
      return;
    }
    setSavingIdea(`genre:${item.name}`);
    try {
      await addIdea({
        title,
        source: `ADX · ${latest?.period_label || period}`,
        market: "海外市场 / 北美优先",
        genre: item.name,
        status: "待调研",
        notes: `本期AI仿真人样本中，“${item.name}”组合共现 ${item.value.toLocaleString()} 次，累计热度 ${short(item.heat)}。建议优先核验具体人物关系、核心冲突、前三集钩子、付费卡点、目标受众与AI制作难度；该记录是数据机会信号，不等同于已确认趋势。`,
      });
      setMessage(`已将题材组合“${item.name}”加入选题情报的“待调研”列表。`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "加入选题库失败");
    } finally {
      setSavingIdea("");
    }
  };
  const exportCurrent = () => {
    const rows = orderedWorks.map((work) => ({
      海外原名: work.title,
      中文译名: work.titleCn,
      统计期: work.period,
      题材标签: work.genre,
      平台或剧场号: work.platforms.join("、"),
      市场信号:
        work.signal === "ad"
          ? "广告投放"
          : work.signal === "tk"
            ? "TikTok播放"
            : "市场样本",
      排名: work.rank,
      热度: work.heat,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(rows),
      "AI短剧筛选结果",
    );
    XLSX.writeFile(book, `AI短剧市场数据_${period.replace(/\s+/g, "")}.xlsx`);
    setMessage(`已导出 ${rows.length.toLocaleString()} 条当前筛选结果。`);
  };
  const exportMonthlyBrief = () => {
    if (!dashboard.datasets.length) {
      setMessage(`“${period}”没有可生成简报的数据。`);
      return;
    }
    const leadGenre = dashboard.sharedGenres[0] || dashboard.genres[0];
    const leadWork = dashboard.opportunities[0];
    const sharedGenres = dashboard.sharedGenres.slice(0, 8).map((item) => item.name);
    const book = XLSX.utils.book_new();
    const append = (name: string, rows: Record<string, unknown>[], widths: number[]) => {
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = widths.map((wch) => ({ wch }));
      if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
      XLSX.utils.book_append_sheet(book, sheet, name);
    };
    append(
      "核心摘要",
      [
        { 项目: "统计期", 内容: period },
        { 项目: "数据覆盖", 内容: `${dashboard.datasets.length} 个来源；${dashboard.rawRows.toLocaleString()} 行原始记录` },
        { 项目: "AI仿真人样本", 内容: `${dashboard.totalRows.toLocaleString()} 条记录；${dashboard.totalWorks.toLocaleString()} 个去重作品` },
        { 项目: "双信号验证", 内容: `${dashboard.overlapCount.toLocaleString()} 个严格同名作品` },
        { 项目: "优先题材", 内容: leadGenre ? `${leadGenre.name}（出现 ${leadGenre.value.toLocaleString()} 次）` : "待识别" },
        { 项目: "共同题材底盘", 内容: sharedGenres.length ? sharedGenres.join("、") : "当前未形成跨来源共同题材" },
        { 项目: "重点作品", 内容: leadWork ? `${leadWork.titleCn || leadWork.title}｜${leadWork.quadrant}｜机会指数 ${leadWork.score}` : "暂无双信号重点作品" },
        { 项目: "本月判断", 内容: "投放信号反映市场在推什么，TikTok播放信号反映用户在看什么；共同出现的题材与作品优先验证。" },
        { 项目: "建议动作", 内容: leadGenre ? `围绕“${leadGenre.name}”拆解具体人物关系、前三集钩子、付费卡点与AI制作可行性。` : "先补齐题材字段和双来源样本。" },
        { 项目: "口径与风险", 内容: "本简报基于当前月榜，只支持当期市场结构判断；广告预估曝光与TikTok播放增量口径不同，不做简单求和。" },
      ],
      [18, 90],
    );
    const adGenreMap = new Map(dashboard.adGenres.map((item) => [item.name, item]));
    const tkGenreMap = new Map(dashboard.tkGenres.map((item) => [item.name, item]));
    append(
      "热门题材",
      dashboard.genres.slice(0, 30).map((item, index) => ({
        排名: index + 1,
        题材: item.name,
        AI样本次数: item.value,
        投放榜次数: adGenreMap.get(item.name)?.value || 0,
        TikTok榜次数: tkGenreMap.get(item.name)?.value || 0,
        累计热度: item.heat,
        信号判断: dashboard.sharedGenres.some((genre) => genre.name === item.name) ? "双来源共同题材" : "单来源信号",
      })),
      [8, 18, 15, 15, 16, 18, 20],
    );
    append(
      "重点作品",
      dashboard.opportunities.slice(0, 50).map((item, index) => ({
        排名: index + 1,
        中文辅助名: item.titleCn,
        海外原名: item.title,
        题材: item.genre,
        机会象限: item.quadrant,
        机会指数: item.score,
        广告预估曝光: item.adHeat,
        TikTok播放增量: item.tkHeat,
        建议: "核验人物关系、前三集钩子、付费卡点与AI制作难度",
      })),
      [8, 28, 42, 28, 16, 12, 18, 18, 46],
    );
    append(
      "平台与渠道",
      [
        ...dashboard.adPlatforms.slice(0, 30).map((item, index) => ({ 排名: index + 1, 类型: "短剧平台投放", 平台或渠道: item.name, AI记录数: item.value, 累计热度: item.heat })),
        ...dashboard.tkChannels.slice(0, 30).map((item, index) => ({ 排名: index + 1, 类型: "TikTok剧场号", 平台或渠道: item.name, AI记录数: item.value, 累计热度: item.heat })),
      ],
      [8, 18, 32, 15, 20],
    );
    append(
      "数据口径",
      dashboard.datasets.map((item) => ({
        数据源: item.name,
        统计期: item.period,
        信号类型: item.signal,
        原始行数: item.rows,
        AI记录数: item.aiRows,
        AI作品数: item.works,
        热度指标: item.heatLabel,
        热度合计: item.heat,
      })),
      [36, 15, 18, 15, 15, 15, 20, 20],
    );
    append(
      "AI制作预评估",
      [...new Map(dashboard.works.map((item) => [item.titleKey, item])).values()].map((work) => {
        const assessment = assessProduction(work);
        return { 中文辅助名: work.titleCn, 海外原名: work.title, 题材: work.genre, AI适配度: assessment.score, 制作难度: assessment.difficulty, 角色一致性风险: assessment.characterRisk, 场景资产复用: assessment.reuse, 规则判断依据: assessment.reasons.join("；"), 使用提醒: "规则预判，立项前需进行视觉小样与人工复核" };
      }).sort((a, b) => b.AI适配度 - a.AI适配度),
      [28, 42, 28, 12, 12, 18, 16, 60, 38],
    );
    if (externalSignals.length) {
      append("外部信号旁证", externalSignals.map((item) => ({ 来源: item.source, 统计期: item.period, 话题或作品: item.topic, 指标: item.metric, 数值: item.value, 环比变化: item.change, 证据链接: item.url, 备注: item.note, 口径提醒: "外部旁证，不与ADX指标混算" })), [22, 15, 32, 24, 16, 16, 45, 45, 30]);
    }
    XLSX.writeFile(book, `海外AI短剧市场简报_${period.replace(/\s+/g, "")}.xlsx`);
    setMessage(`已生成“${period}”市场简报，共 ${externalSignals.length ? 7 : 6} 个工作表。`);
  };
  const exportMissingChineseNames = () => {
    const rows = [
      ...new Map(
        dashboard.works
          .filter((work) => !work.titleCn)
          .map((work) => [work.titleKey, work]),
      ).values(),
    ].map((work) => ({
      海外原名: work.title,
      待填写中文辅助名: "",
      题材标签: work.genre,
      平台或剧场号: work.platforms.join("、"),
      榜单排名: work.rank,
      市场信号:
        work.signal === "ad"
          ? "广告投放"
          : work.signal === "tk"
            ? "TikTok播放"
            : "市场样本",
      统计期: work.period,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(rows),
      "待补中文名",
    );
    XLSX.writeFile(
      book,
      `海外AI短剧_待补中文名_${period.replace(/\s+/g, "")}.xlsx`,
    );
    setMessage(
      `已导出 ${rows.length.toLocaleString()} 个待补中文名的海外作品。`,
    );
  };
  const translateNextBatch = async () => {
    const pending = [
      ...new Map(
        dashboard.works
          .filter((work) => !work.titleCn)
          .map((work) => [work.titleKey, work]),
      ).values(),
    ]
      .sort((a, b) =>
        a.rank !== null && b.rank !== null
          ? a.rank - b.rank
          : a.rank !== null
            ? -1
            : 1,
      )
      .slice(0, 50);
    if (!pending.length) {
      setMessage("所有海外作品都已有中文译名。");
      return;
    }
    setTranslating(true);
    setMessage(`正在翻译排名靠前的 ${pending.length} 部海外短剧…`);
    try {
      const response = await fetch("/api/market-data/translate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: pending.map((work) => work.title) }),
      });
      const result = (await response.json()) as {
        translations?: { original: string; chinese: string }[];
        error?: string;
      };
      if (!response.ok || !result.translations?.length) {
        throw new Error(result.error || "AI未返回有效译名");
      }
      const updates: Record<string, string> = {};
      const syncedRows = result.translations.map((item) => {
        updates[normalizeTitle(item.original)] = item.chinese.trim();
        return { 海外原名: item.original, 中文辅助名: item.chinese.trim() };
      });
      await addImport({
        source_name: "中文名映射",
        period_label: period.trim() || undefined,
        file_name: `AI剧名翻译_${new Date().toISOString().slice(0, 10)}.json`,
        row_count: syncedRows.length,
        columns: ["海外原名", "中文辅助名"],
        raw_rows: syncedRows,
      });
      const next = { ...syncedChineseNameMap, ...updates };
      setChineseNameMap(next);
      localStorage.setItem(
        "market-data-chinese-name-map",
        JSON.stringify(next),
      );
      setMessage(
        `已生成并保存 ${syncedRows.length} 个中文译名。可继续翻译下一批。`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "AI剧名翻译失败");
    } finally {
      setTranslating(false);
    }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setMessage("");
    try {
      let totalRows = 0;
      const targetPeriods = new Set<string>();
      for (const file of files) {
        const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false });
        if (!rows.length) throw new Error(`“${file.name}”未读取到数据行，请确认第一张工作表包含表头和数据`);
        if (rows.length > 5000) throw new Error(`“${file.name}”超过单文件5,000行限制`);
        const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
        const detectedPeriod = detectMonthLabel(file.name, book.SheetNames, rows);
        const targetPeriod = detectedPeriod || period.trim();
        if (!targetPeriod) throw new Error(`无法识别“${file.name}”的月份，请先选择上传月份`);
        await addImport({ source_name: "ADX", period_label: targetPeriod, file_name: file.name, row_count: rows.length, columns, raw_rows: rows });
        totalRows += rows.length;
        targetPeriods.add(targetPeriod);
      }
      const recognized = [...targetPeriods];
      if (recognized.length === 1) setPeriod(recognized[0]);
      setMessage(`已导入 ${files.length} 个文件、${totalRows.toLocaleString()} 行数据，归入 ${recognized.join("、")}；同一月份可继续追加其他榜单。`);
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "导入失败，请检查文件格式",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const downloadExternalSignalTemplate = () => {
    const rows = [{ 话题或作品: "示例：werewolf romance", 指标: "播放量/互动率/搜索指数/下载排名", 数值: "", 环比变化: "", 证据链接: "", 备注: "说明采集日期、地区和口径" }];
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 45 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(book, sheet, "外部信号模板");
    XLSX.writeFile(book, "外部市场信号导入模板.xlsx");
  };
  const importExternalSignals = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingExternal(true);
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false });
      if (!rows.length) throw new Error("外部信号文件没有数据行");
      if (rows.length > 2000) throw new Error("外部信号单次最多导入2,000行");
      const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
      if (!columns.some((key) => /话题|关键词|剧名|作品|title|topic|keyword/i.test(key))) throw new Error("缺少“话题或作品”字段，请先下载标准模板");
      await addImport({ source_name: `外部信号:${externalSource}`, period_label: period.trim() || undefined, file_name: file.name, row_count: rows.length, columns, raw_rows: rows });
      setMessage(`已导入 ${rows.length} 条${externalSource}外部信号；该数据仅作为旁证，不与ADX指标混算。`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "外部信号导入失败");
    } finally {
      setUploadingExternal(false);
      event.target.value = "";
    }
  };
  const importChineseNameMap = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        book.Sheets[book.SheetNames[0]],
        { defval: "", raw: false },
      );
      const updates: Record<string, string> = {};
      rows.forEach((row) => {
        const original = text(
          row["海外原名"] ?? row["原始剧名"] ?? row["剧名"] ?? "",
        );
        const chinese = text(
          row["待填写中文辅助名"] ?? row["中文辅助名"] ?? row["中文剧名"] ?? "",
        );
        if (original && chinese) updates[normalizeTitle(original)] = chinese;
      });
      if (!Object.keys(updates).length) {
        throw new Error("未找到已填写的“海外原名”和“中文辅助名”字段");
      }
      const next = { ...syncedChineseNameMap, ...updates };
      const syncedRows = Object.entries(updates).map(
        ([normalizedOriginal, chinese]) => {
          const matched = dashboard.works.find(
            (work) => work.titleKey === normalizedOriginal,
          );
          return {
            海外原名: matched?.title || normalizedOriginal,
            中文辅助名: chinese,
          };
        },
      );
      await addImport({
        source_name: "中文名映射",
        period_label: period.trim() || undefined,
        file_name: file.name,
        row_count: syncedRows.length,
        columns: ["海外原名", "中文辅助名"],
        raw_rows: syncedRows,
      });
      setChineseNameMap(next);
      localStorage.setItem(
        "market-data-chinese-name-map",
        JSON.stringify(next),
      );
      setMessage(
        `已回填 ${Object.keys(updates).length.toLocaleString()} 个中文辅助名，海外原名与榜单数据未改变。`,
      );
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "中文名映射表导入失败",
      );
    } finally {
      event.target.value = "";
    }
  };
  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero
          eyebrow="ADX · 海外短剧 · 市场趋势"
          title="市场数据看板"
          description="分析海外AI仿真人短剧的投放与播放表现；中文名仅用于团队阅读，海外原名用于作品识别与跨平台匹配。"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-2">
                <span className="text-xs text-white/65">上传月份</span>
                <select value={periodKindFor(period) === "month" ? period : ""} onChange={(event) => setPeriod(event.target.value)} aria-label="选择上传月份" className="h-9 min-w-28 bg-transparent text-sm text-white outline-none">
                  <option value="" disabled className="text-black">选择月份</option>
                  {uploadMonthOptions.map((option) => <option key={option} value={option} className="text-black">{option}</option>)}
                </select>
              </label>
              {dashboard.datasets.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportMonthlyBrief}
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <FileDown className="mr-1.5 h-4 w-4" />
                  导出月度简报
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => void importFile(event)}
              />
              <Button
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                title="可同时选择一个或多个文件；系统会优先自动识别文件中的月份"
                className="bg-[#c9f45a] text-[#102a21] hover:bg-[#d8ff74]"
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}
                {uploading ? "导入中" : `上传${periodKindFor(period) === "month" ? period : "当期"}数据`}
              </Button>
            </div>
          }
        />
        {message && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${message.startsWith("已导入") ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}
          >
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {periodOptions.length > 0 && !periodOptions.includes(period) && (
          <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            “{period}”尚未导入市场数据。请选择已有月份，或保持该月份后上传新榜单。
          </p>
        )}
        <MarketViewTabs activeView={activeView} onChange={setActiveView} />
        <PeriodKindSwitch
          active={periodKindFor(period)}
          monthCount={periodGroups.month.length}
          weekCount={periodGroups.week.length}
          dayCount={periodGroups.day.length}
          onChange={changePeriodKind}
        />
        {activeView === "data" && dashboard.datasets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#d8e4c8] bg-[#f5f8f0] px-4 py-3 text-xs text-[#456052]">
            <Badge className="bg-[#315f4a] text-white">海外短剧数据</Badge>
            <span>
              中文名覆盖 <strong>{chineseTitleCount.toLocaleString()}</strong> /{" "}
              <strong>{dashboard.totalWorks.toLocaleString()}</strong> 个作品（
              {chineseTitleCoverage.toFixed(1)}%）
            </span>
            <span className="text-[#6c8075]">
              · 中文译名由源表或AI生成，海外原名始终保留
            </span>
            <input
              ref={chineseNameFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => void importChineseNameMap(event)}
            />
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 border-[#b9cda9] bg-white text-[#315f4a]"
              disabled={translating}
              onClick={() => void translateNextBatch()}
            >
              {translating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {translating ? "AI翻译中" : "AI翻译下一批（50部）"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-[#b9cda9] bg-white text-[#315f4a]"
              onClick={() => chineseNameFileRef.current?.click()}
            >
              回填中文名映射
            </Button>
          </div>
        )}
        {activeView === "overview" && (
          <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="数据来源"
            value={loading ? "—" : String(dashboard.datasets.length)}
            note={`${dashboard.rawRows.toLocaleString()} 行原始记录`}
          />
          <Metric
            label="AI仿真人作品"
            value={loading ? "—" : dashboard.totalWorks.toLocaleString()}
            note={`${dashboard.totalRows.toLocaleString()} 条AI榜单记录`}
          />
          <Metric
            label="双信号验证作品"
            value={dashboard.overlapCount.toLocaleString()}
            note="同时进入投放榜与TikTok榜"
          />
          <Metric
            label="本月热门题材"
            value={dashboard.genres[0]?.name || "待识别"}
            note={
              dashboard.genres[0]
                ? `AI样本出现 ${dashboard.genres[0].value} 次`
                : latest?.period_label || "上传后显示"
            }
          />
        </div>
        {dashboard.datasets.length > 0 && <MarketConclusions dashboard={dashboard} period={period} periodCount={trendAnalysis.periodCount} periodKind={trendAnalysis.periodKind} />}
        {dashboard.datasets.length > 0 && <ExecutiveCharts dashboard={dashboard} />}
        {dashboard.datasets.length > 0 && (
          <TrendSnapshot trend={trendAnalysis} onOpen={() => { setActiveView("analysis"); setAnalysisMode("trends"); }} />
        )}
        <ADXDecisionOverview dashboard={dashboard} materials={hotMaterials} externalSignals={externalSignals} period={period} />
          </div>
        )}
        {activeView === "analysis" && (
          <div className="space-y-6">
        <AnalysisModeTabs activeMode={analysisMode} onChange={setAnalysisMode} />
        {analysisMode === "works" && (
          <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <Filter
              label="市场信号"
              value={signalFilter}
              onChange={(value) => {
                setSignalFilter(value as "all" | Signal);
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部信号" },
                { value: "ad", label: "广告投放" },
                { value: "tk", label: "TikTok播放" },
              ]}
            />
            <Filter
              label="题材"
              value={genreFilter}
              onChange={(value) => {
                setGenreFilter(value);
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部题材" },
                ...genreOptions.map((item) => ({ value: item, label: item })),
              ]}
            />
            <Filter
              label="中文名状态"
              value={nameFilter}
              onChange={(value) => {
                setNameFilter(value as "all" | "named" | "missing");
                setPage(1);
              }}
              options={[
                { value: "all", label: "全部作品" },
                { value: "named", label: "已有中文名" },
                { value: "missing", label: "待补中文名" },
              ]}
            />
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                搜索作品 / 平台 / 剧场号
              </span>
              <Input
                value={channelQuery}
                onChange={(event) => {
                  setChannelQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="例如 NetShort、DramaWave"
                className="h-9 w-64"
              />
            </label>
            <Filter
              label="排序"
              value={sortBy}
              onChange={(value) => {
                setSortBy(value as "rank" | "heat" | "title");
                setPage(1);
              }}
              options={[
                { value: "rank", label: "按榜单排名" },
                { value: "heat", label: "按热度降序" },
                { value: "title", label: "按作品名称" },
              ]}
            />
            <Button
              variant="outline"
              onClick={exportCurrent}
              disabled={!orderedWorks.length}
            >
              导出筛选结果
            </Button>
            <Button
              variant="outline"
              onClick={exportMissingChineseNames}
              disabled={!dashboard.totalWorks}
            >
              导出待补中文名
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">
              当前显示{" "}
              <strong className="text-foreground">
                {orderedWorks.length.toLocaleString()}
              </strong>{" "}
              个作品记录
            </div>
          </CardContent>
        </Card>
        {selectedWork && (
          <WorkDetail
            work={selectedWork}
            onClose={() => setSelectedWork(null)}
          />
        )}
        <div className="grid gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">AI仿真人榜单作品</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  仅保留海外AI仿真人短剧；中文名方便团队阅读，海外原名仍是识别主键。
                </p>
              </div>
              <Flame className="h-5 w-5 text-[#e99647]" />
            </CardHeader>
            <CardContent>
              {visibleWorks.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="border-b text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2 font-medium">
                            作品（中文译名 / 海外原名）
                          </th>
                          <th className="pb-2 font-medium">题材</th>
                          <th className="pb-2 font-medium">渠道</th>
                          <th className="pb-2 font-medium">信号</th>
                          <th className="pb-2 text-right font-medium">
                            排名 / 热度
                          </th>
                          <th className="pb-2 text-right font-medium">详情</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleWorks.map((work, index) => (
                          <tr
                            key={`${work.sourceId}-${work.titleKey}-${index}`}
                            className="border-b last:border-0"
                          >
                            <td className="max-w-[220px] py-3 pr-3 font-medium">
                              <p className="truncate">
                                {work.titleCn || work.title}
                              </p>
                              {work.titleCn && (
                                <p className="truncate text-[10px] text-muted-foreground">
                                  {work.title}
                                </p>
                              )}
                              <p className="mt-0.5 text-[10px] text-muted-foreground">
                                {work.period}
                              </p>
                            </td>
                            <td className="max-w-[160px] truncate py-3 pr-3 text-xs text-muted-foreground">
                              {work.genre}
                            </td>
                            <td className="max-w-[130px] truncate py-3 pr-3 text-xs text-muted-foreground">
                              {work.platform}
                              {work.platforms.length > 1 && (
                                <span className="ml-1 text-[10px] text-primary">
                                  +{work.platforms.length - 1}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <Badge variant="outline" className="text-[10px]">
                                {work.signal === "ad"
                                  ? "投放"
                                  : work.signal === "tk"
                                    ? "播放"
                                    : "市场"}
                              </Badge>
                            </td>
                            <td className="py-3 text-right text-xs font-semibold text-primary">
                              {work.rank !== null
                                ? `#${work.rank}`
                                : work.heat !== null
                                  ? short(work.heat)
                                  : "—"}
                              {work.heat !== null && work.rank !== null ? (
                                <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                                  {short(work.heat)}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedWork(work)}
                              >
                                查看
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                      第 {safePage} / {maxPage} 页，每页 {pageSize} 条
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={safePage <= 1}
                        onClick={() => setPage(safePage - 1)}
                      >
                        上一页
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={safePage >= maxPage}
                        onClick={() => setPage(safePage + 1)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <Empty message="当前筛选条件下没有AI仿真人作品。" />
              )}
            </CardContent>
          </Card>
        </div>
          </div>
        )}
        {analysisMode === "genres" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="投放榜题材热度"
                icon={Layers3}
                data={dashboard.adGenres}
                empty="导入广告投放榜后显示题材分布。"
              />
              <ChartCard
                title="TikTok播放题材热度"
                icon={Layers3}
                data={dashboard.tkGenres}
                empty="导入TikTok热播榜后显示题材分布。"
              />
            </div>
            <GenreInsight dashboard={dashboard} />
          </div>
        )}
        {analysisMode === "materials" && (
          <HotMaterialsPanel materials={hotMaterials} />
        )}
        {analysisMode === "markets" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="短剧平台投放覆盖"
                icon={BarChart3}
                data={dashboard.adPlatforms}
                empty="导入广告投放榜后显示平台覆盖。"
              />
              <ChartCard
                title="TikTok剧场号覆盖"
                icon={BarChart3}
                data={dashboard.tkChannels}
                empty="导入TikTok热播榜后显示剧场号覆盖。"
              />
            </div>
            <PlatformComparison dashboard={dashboard} previousDashboard={periodDashboards.get(trendAnalysis.previousPeriod)} />
            <MarketCoverageNote />
          </div>
        )}
        {analysisMode === "production" && (
          <div className="space-y-6">
            <OpportunityBoard
              dashboard={dashboard}
              savedTitles={savedTitles}
              savingIdea={savingIdea}
              onSave={saveOpportunity}
              onSaveGenre={saveGenrePair}
            />
            <ProductionAssessmentPanel dashboard={dashboard} />
          </div>
        )}
        {analysisMode === "trends" && <TrendPanel trend={trendAnalysis} />}
        {analysisMode === "external" && (
          <ExternalSignalsPanel signals={externalSignals} source={externalSource} uploading={uploadingExternal} fileRef={externalSignalFileRef} onSourceChange={setExternalSource} onImport={importExternalSignals} onDownloadTemplate={downloadExternalSignalTemplate} />
        )}
          </div>
        )}
        {activeView === "data" && (
          <div className="space-y-6">
          <ADXCaptureGuide addImport={addImport} onImported={(nextMessage, nextPeriod) => { setMessage(nextMessage); setPeriod(nextPeriod); }} />
          <DataOperations
            dashboard={dashboard}
            chineseTitleCoverage={chineseTitleCoverage}
            availablePeriodCount={periodOptions.length}
            platformAliasMap={platformAliasMap}
            titleAliasMap={titleAliasMap}
            genreAliasMap={genreAliasMap}
            onSavePlatformAlias={savePlatformAlias}
            onSaveTitleAlias={saveTitleAlias}
            onSaveGenreAlias={saveGenreAlias}
            onExportMissing={exportMissingChineseNames}
            onImportNames={() => chineseNameFileRef.current?.click()}
            onOpenWorks={() => {
              setActiveView("analysis");
              setAnalysisMode("works");
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">两类市场信号</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                投放与播放口径分开呈现，不直接相加。
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {dashboard.datasets.map((set) => (
                <div
                  key={set.name}
                  className="rounded-xl border bg-muted/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{set.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {set.period} · {set.signal}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {set.aiRows.toLocaleString()} 条AI记录
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">去重AI作品</p>
                      <p className="mt-0.5 font-semibold">{set.works || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{set.heatLabel}</p>
                      <p className="mt-0.5 font-semibold">
                        {set.heat === null ? "—" : short(set.heat)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <TrendReadiness periods={periodOptions} />
              <DataQuality dashboard={dashboard} />
            </CardContent>
          </Card>
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">字段映射与数据质量</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              已识别 {dashboard.fields.length}{" "}
              个核心字段。当前口径：数据对象为海外短剧，标签含“AI仿真人”才进入分析；“预估曝光”代表投放信号，“播放增量”代表消费信号；作品按海外原名去除大小写与标点后进行匹配与去重。
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dashboard.fields.length ? (
                dashboard.fields.map((field) => (
                  <Badge key={field} variant="outline">
                    {field}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  等待数据字段
                </span>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              提示：中文译名由源表或AI生成，只用于内部阅读，不参与榜单归属和趋势统计。双信号作品采用海外原名严格匹配；关键作品的译名仍建议人工复核。
            </p>
          </CardContent>
        </Card>
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">已导入数据源</h2>
            <span className="text-xs text-muted-foreground">
              {imports.length} 个文件
            </span>
          </div>
          {loading ? (
            <Card className="h-20 animate-pulse" />
          ) : imports.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                <Database className="h-5 w-5 text-primary" />
                上传 ADX 数据后，这里将自动生成市场看板。
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              {imports.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <Database className="h-4 w-4 text-primary" />
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-medium">{item.file_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.source_name} · {item.period_label || "未标记统计期"}{" "}
                      · {item.row_count.toLocaleString()} 行
                    </p>
                  </div>
                  <div className="hidden max-w-md gap-1 md:flex">
                    {item.columns.slice(0, 6).map((column) => (
                      <Badge
                        key={column}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {column}
                      </Badge>
                    ))}
                    {item.columns.length > 6 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{item.columns.length - 6}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="删除该数据文件"
                    onClick={() =>
                      confirm(`删除“${item.file_name}”及其导入数据？`) &&
                      void deleteImport(item.id)
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ADXDecisionOverview({ dashboard, materials, externalSignals, period }: { dashboard: Dashboard; materials: HotMaterial[]; externalSignals: ExternalSignal[]; period: string }) {
  const [summaryTab, setSummaryTab] = useState<"rank" | "materials" | "platforms" | "social">("rank");
  const topWorks = dashboard.works.slice(0, 20);
  const sourcePlatforms = dashboard.platforms.slice(0, 8);
  const socialNames = ["TikTok", "Facebook", "YouTube"];
  const socialRows = socialNames.map((name) => {
    const matcher = name === "TikTok" ? /tiktok|tk|抖音/i : name === "Facebook" ? /facebook|face|fb/i : /youtube|油管|yt/i;
    const buckets = dashboard.platforms.filter((item) => matcher.test(item.name));
    const signals = externalSignals.filter((item) => matcher.test(item.source) || matcher.test(item.topic));
    return {
      name,
      samples: buckets.reduce((sum, item) => sum + item.value, 0),
      heat: buckets.reduce((sum, item) => sum + item.heat, 0) + signals.reduce((sum, item) => sum + (item.value || 0), 0),
      status: buckets.length || signals.length ? "已接入数据" : "等待数据",
    };
  });
  const maxPlatform = Math.max(1, ...sourcePlatforms.map((item) => item.heat || item.value));

  return (
    <section aria-labelledby="adx-summary-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">ADX DAILY DESK</p>
          <h2 id="adx-summary-title" className="mt-1 text-xl font-semibold text-[#173f31]">每日市场总结</h2>
          <p className="mt-1 text-sm text-muted-foreground">把榜单、素材和平台表现集中到一屏；当前显示 {period} 已导入数据。</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#cfe0bf] bg-[#f6f9f1] px-3 py-1.5 text-xs text-[#456052]">
          <span className={`h-2 w-2 rounded-full ${dashboard.datasets.length ? "bg-emerald-500" : "bg-amber-400"}`} />
          {dashboard.datasets.length ? "文件数据已连接" : "等待导入 ADX 数据"}
          <span className="text-[#8a9b91]">· API 待授权</span>
        </div>
      </div>
      <div role="tablist" aria-label="每日市场摘要" className="flex flex-wrap gap-1 rounded-xl border border-[#d7e4c8] bg-[#f7f9f3] p-1">
        {([
          ["rank", "短剧榜 Top 20"],
          ["materials", "热门素材 Top 50"],
          ["platforms", "平台表现"],
          ["social", "社媒表现"],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={summaryTab === value} onClick={() => setSummaryTab(value)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${summaryTab === value ? "bg-[#173f31] text-white" : "text-[#50675b] hover:bg-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {summaryTab === "rank" && (
        <Card className="overflow-hidden border-[#d7e4c8]">
          <CardHeader className="border-b border-[#e4eadc] bg-[#f7f9f3] pb-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold tracking-[.16em] text-[#6f8a7b]">DAILY TOP 20</p><CardTitle className="mt-1 text-base">ADX 每日前20榜单</CardTitle></div>
              <Badge variant="outline">{topWorks.length}/20</Badge>
            </div>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto p-0">
            {topWorks.length ? topWorks.map((work, index) => (
              <div key={`${work.sourceId}:${work.titleKey}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                <span className={`text-center text-sm font-bold ${index < 3 ? "text-[#4f7a37]" : "text-muted-foreground"}`}>{String(index + 1).padStart(2, "0")}</span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{work.titleCn || work.title}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{work.titleCn ? work.title : work.genre}</p></div>
                <div className="text-right"><p className="text-xs font-medium">{work.platform}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{work.heat ? short(work.heat) : work.rank ? `榜单 #${work.rank}` : "—"}</p></div>
              </div>
            )) : <EmptySummary text="导入 ADX 短剧榜单后显示每日 Top 20。" />}
          </CardContent>
        </Card>
      )}
      {summaryTab === "materials" && (
        <Card className="overflow-hidden border-[#d7e4c8]">
          <CardHeader className="border-b border-[#e4eadc] bg-[#f7f9f3] pb-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold tracking-[.16em] text-[#6f8a7b]">HOT CREATIVE 50</p><CardTitle className="mt-1 text-base">市场热门素材前50</CardTitle></div><Badge variant="outline">{materials.length}/50</Badge></div>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto p-0">
            {materials.length ? materials.map((item, index) => (
              <div key={`${item.source}:${item.name}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                <span className="text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.work} · {item.platform}</p></div>
                <p className="text-xs font-semibold text-[#315f4a]">{item.heat ? short(item.heat) : "有记录"}</p>
              </div>
            )) : <EmptySummary text="当前文件未识别到素材名称/素材标题字段；导入素材榜后会自动生成前50。" />}
          </CardContent>
        </Card>
      )}
      {summaryTab === "platforms" && (
        <Card className="border-[#d7e4c8]">
          <CardHeader><p className="text-xs font-semibold tracking-[.16em] text-[#6f8a7b]">DAILY PLATFORM</p><CardTitle className="mt-1 text-base">每日平台表现</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sourcePlatforms.length ? sourcePlatforms.map((item) => {
              const metric = item.heat || item.value;
              return <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{item.name}</span><span className="text-muted-foreground">{item.value} 条 · {item.heat ? short(item.heat) : "暂无热度"}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#edf2e8]"><div className="h-full rounded-full bg-gradient-to-r from-[#173f31] to-[#9ac65f]" style={{ width: `${Math.max(4, (metric / maxPlatform) * 100)}%` }} /></div></div>;
            }) : <EmptySummary text="导入带平台字段的 ADX 数据后显示平台表现。" />}
          </CardContent>
        </Card>
      )}
      {summaryTab === "social" && (
        <Card className="border-[#d7e4c8]">
          <CardHeader><p className="text-xs font-semibold tracking-[.16em] text-[#6f8a7b]">SOCIAL CHANNELS</p><CardTitle className="mt-1 text-base">多平台表现</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {socialRows.map((item) => <div key={item.name} className="rounded-2xl border border-[#dfe8d7] bg-[#fafbf7] p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold">{item.name}</p><span className={`h-2 w-2 rounded-full ${item.status === "已接入数据" ? "bg-emerald-500" : "bg-slate-300"}`} /></div><p className="mt-5 text-2xl font-semibold text-[#173f31]">{item.heat ? short(item.heat) : "—"}</p><p className="mt-1 text-xs text-muted-foreground">{item.samples ? `${item.samples} 条样本` : item.status}</p></div>)}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function EmptySummary({ text: message }: { text: string }) {
  return <div className="flex min-h-32 items-center justify-center px-6 py-10 text-center text-sm leading-6 text-muted-foreground">{message}</div>;
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
function PeriodKindSwitch({ active, monthCount, weekCount, dayCount, onChange }: { active: PeriodKind; monthCount: number; weekCount: number; dayCount: number; onChange: (kind: PeriodKind) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold">榜单周期</p>
        <p className="mt-0.5 text-xs text-muted-foreground">周榜捕捉短期变化，月榜判断相对稳定的市场结构；两类数据不混算。</p>
      </div>
      <div role="tablist" aria-label="榜单周期" className="flex gap-1 rounded-lg bg-muted p-1">
        <button type="button" role="tab" aria-selected={active === "day"} disabled={!dayCount} onClick={() => onChange("day")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "day" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>日榜 · {dayCount}</button>
        <button type="button" role="tab" aria-selected={active === "month"} disabled={!monthCount} onClick={() => onChange("month")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "month" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>月榜 · {monthCount}</button>
        <button type="button" role="tab" aria-selected={active === "week"} disabled={!weekCount} onClick={() => onChange("week")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "week" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>周榜 · {weekCount}</button>
      </div>
    </div>
  );
}

const ADX_CAPTURE_BOOKMARKLET = `javascript:(()=>{const t=document.querySelector('table');if(!t){alert('当前页面没有找到可采集的ADX表格');return}const h=[...t.querySelectorAll('thead th')].map((x,i)=>x.innerText.trim()||('字段'+(i+1)));const rows=[...t.querySelectorAll('tbody tr')].map((tr,ri)=>Object.fromEntries([...tr.querySelectorAll('td')].map((td,i)=>[h[i]||('字段'+(i+1)),td.innerText.trim()||((i===0)?String(ri+1):'')])));const inputs=[...document.querySelectorAll('input')].map(x=>x.value).filter(Boolean);const payload={title:document.title,url:location.href,capturedAt:new Date().toISOString(),pageText:document.body.innerText.slice(0,5000),inputs,columns:h,rows};open('http://localhost:3000/market-data/adx-capture#'+encodeURIComponent(JSON.stringify(payload)),'_blank')})()`;

function ADXCaptureGuide({ addImport, onImported }: { addImport: (input: Parameters<ReturnType<typeof useMarketDataImports>["addImport"]>[0]) => Promise<MarketDataImport>; onImported: (message: string, period: string) => void }) {
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const [status, setStatus] = useState<{ profileSaved?: boolean; lastSyncAt?: string; lastRows?: number }>({});
  const [working, setWorking] = useState<"connect" | "week" | "month" | null>(null);
  const [error, setError] = useState("");
  const refreshStatus = async () => {
    const response = await fetch("/api/market-data/adx/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
  };
  useEffect(() => {
    bookmarkRef.current?.setAttribute("href", ADX_CAPTURE_BOOKMARKLET);
    // Initial connector status synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
  }, []);
  const connect = async () => {
    setWorking("connect"); setError("");
    try {
      const response = await fetch("/api/market-data/adx/connect", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ADX连接失败");
      await refreshStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX连接失败"); }
    finally { setWorking(null); }
  };
  const sync = async (rankType: "week" | "month") => {
    setWorking(rankType); setError("");
    try {
      const response = await fetch("/api/market-data/adx/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rankType }) });
      const result = await response.json() as { rows?: Record<string, unknown>[]; columns?: string[]; period?: string; fileName?: string; error?: string };
      if (!response.ok || !result.rows?.length || !result.columns || !result.period) throw new Error(result.error || "ADX没有返回有效数据");
      await addImport({ source_name: `ADX自动同步:${rankType === "month" ? "月榜" : "周榜"}`, period_label: result.period, file_name: result.fileName || `ADX-${rankType}-${result.period}.xlsx`, row_count: result.rows.length, columns: result.columns, raw_rows: result.rows });
      onImported(`ADX ${rankType === "month" ? "月榜" : "周榜"}同步完成：${result.rows.length.toLocaleString()} 条AI仿真人短剧数据。`, result.period);
      await refreshStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX同步失败"); }
    finally { setWorking(null); }
  };
  return <section className="rounded-2xl border border-[#cfe0bf] bg-[#f6f9f1] p-4"><div className="flex flex-wrap items-start gap-4"><div className="min-w-[280px] flex-1"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-[#173f31]">ADX 本地自动同步</p>{status.profileSaved ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CircleCheck className="mr-1 h-3.5 w-3.5" />会话已保存</Badge> : <Badge variant="outline"><CircleOff className="mr-1 h-3.5 w-3.5" />尚未连接</Badge>}</div><p className="mt-1 text-xs leading-5 text-[#60766a]">登录态仅保存在本机 .local 目录，不保存账号密码。同步调用ADX官方Excel导出，并仅保留“AI仿真人”数据。</p>{status.lastSyncAt && <p className="mt-1 text-xs text-[#60766a]">最近同步：{new Date(status.lastSyncAt).toLocaleString("zh-CN")} · {status.lastRows?.toLocaleString()} 条</p>}{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void connect()} disabled={working !== null}>{working === "connect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Database className="mr-1.5 h-4 w-4" />}{status.profileSaved ? "打开ADX会话" : "连接ADX账号"}</Button><Button size="sm" onClick={() => void sync("week")} disabled={working !== null}>{working === "week" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}同步周榜</Button><Button size="sm" onClick={() => void sync("month")} disabled={working !== null}>{working === "month" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}同步月榜</Button></div></div><details className="mt-3 border-t border-[#dbe7d2] pt-3"><summary className="cursor-pointer text-xs text-[#60766a]">备用：页面书签采集（当前页前50条）</summary><div className="mt-3"><a ref={bookmarkRef} href="#" draggable className="inline-flex h-9 cursor-grab items-center rounded-lg border bg-white px-4 text-sm font-semibold text-[#173f31] shadow-sm">拖到书签栏：同步到云霞</a></div></details></section>;
}
function MarketViewTabs({
  activeView,
  onChange,
}: {
  activeView: MarketView;
  onChange: (view: MarketView) => void;
}) {
  const views: {
    value: MarketView;
    label: string;
    description: string;
  }[] = [
    {
      value: "overview",
      label: "市场总览",
      description: "结论、机会与行动",
    },
    {
      value: "analysis",
      label: "市场洞察",
      description: "题材、作品、素材、平台与趋势",
    },
    {
      value: "data",
      label: "数据管理",
      description: "数据源、口径与质量",
    },
  ];
  return (
    <nav
      aria-label="市场数据看板视图"
      className="grid gap-2 rounded-2xl border border-[#d7e4c8] bg-[#f7f9f3] p-2 sm:grid-cols-3"
    >
      {views.map((view) => {
        const selected = activeView === view.value;
        return (
          <button
            key={view.value}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(view.value)}
            className={`rounded-xl px-4 py-3 text-left transition-colors ${
              selected
                ? "bg-[#173f31] text-white shadow-sm"
                : "text-[#365347] hover:bg-white"
            }`}
          >
            <span className="block text-sm font-semibold">{view.label}</span>
            <span
              className={`mt-0.5 block text-xs ${
                selected ? "text-white/65" : "text-[#6c8075]"
              }`}
            >
              {view.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
function AnalysisModeTabs({
  activeMode,
  onChange,
}: {
  activeMode: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}) {
  const modes: { value: AnalysisMode; label: string }[] = [
    { value: "genres", label: "题材" },
    { value: "works", label: "作品" },
    { value: "materials", label: "热门素材" },
    { value: "markets", label: "平台" },
    { value: "trends", label: "趋势" },
    { value: "production", label: "AI机会" },
    { value: "external", label: "外部信号" },
  ];
  return (
    <div
      role="tablist"
      aria-label="题材与作品分析模式"
      className="inline-flex flex-wrap gap-1 rounded-xl border bg-white p-1"
    >
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="tab"
          aria-selected={activeMode === mode.value}
          onClick={() => onChange(mode.value)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeMode === mode.value
              ? "bg-[#315f4a] text-white"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
function GenreInsight({ dashboard }: { dashboard: Dashboard }) {
  const shared = dashboard.sharedGenres.slice(0, 8);
  const pairs = dashboard.genrePairs.slice(0, 8);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">双来源共同题材</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            同时出现在广告投放与TikTok播放样本中的题材，优先用于市场验证。
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {shared.length ? (
            shared.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <Badge variant="outline">{item.value} 条记录</Badge>
              </div>
            ))
          ) : (
            <Empty message="导入两类榜单后识别共同题材。" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">高频题材组合</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            大类标签必须与关系、身份或情节机制组合后，才适合作为选题入口。
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pairs.length ? (
            pairs.map((pair) => (
              <span
                key={pair.name}
                className="rounded-full border border-[#c7dbac] bg-[#f5f8f0] px-3 py-2 text-xs text-[#315f4a]"
              >
                <strong>{pair.name}</strong>
                <span className="ml-1 text-[#68816f]">{pair.value}</span>
              </span>
            ))
          ) : (
            <Empty message="导入带有复合标签的数据后显示题材组合。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function HotMaterialsPanel({ materials }: { materials: HotMaterial[] }) {
  return (
    <section aria-labelledby="hot-materials-title" className="space-y-4">
      <div>
        <p className="section-kicker">Creative intelligence</p>
        <h3 id="hot-materials-title" className="mt-1 text-lg font-semibold">热门素材 Top 50</h3>
        <p className="mt-1 text-xs text-muted-foreground">集中查看素材、关联剧目、投放平台与热度；没有素材字段时不生成虚假结论。</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {materials.length ? (
            <div className="divide-y">
              {materials.map((item, index) => (
                <div key={`${item.source}:${item.name}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[3rem_1.3fr_1fr_8rem] sm:items-center">
                  <span className="text-sm font-bold text-[#759950]">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="truncate text-[11px] text-muted-foreground">{item.source}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">{item.work}</p><p className="truncate text-[11px] text-muted-foreground">{item.platform}</p></div>
                  <p className="text-right text-sm font-semibold text-[#315f4a]">{item.heat ? short(item.heat) : "有记录"}</p>
                </div>
              ))}
            </div>
          ) : <Empty message="当前数据未包含素材名称或素材标题字段。通过ADX素材榜采集或上传素材数据后，这里会生成Top 50。" />}
        </CardContent>
      </Card>
    </section>
  );
}
function ExternalSignalsPanel({ signals, source, uploading, fileRef, onSourceChange, onImport, onDownloadTemplate }: { signals: ExternalSignal[]; source: string; uploading: boolean; fileRef: React.RefObject<HTMLInputElement | null>; onSourceChange: (source: string) => void; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onDownloadTemplate: () => void }) {
  const sources = ["TikTok话题", "Meta广告素材", "YouTube短剧", "App榜单与下载", "Google Trends", "行业新闻与平台动态"];
  const counts = new Map<string, number>();
  signals.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));
  return (
    <section aria-labelledby="external-signals-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">External evidence layer</p><h3 id="external-signals-title" className="mt-1 text-lg font-semibold">外部市场信号</h3><p className="mt-1 text-xs text-muted-foreground">用于验证ADX发现的题材与作品机会；来源口径不同，仅分开展示，不进入ADX热度和机会指数。</p></div><Badge variant="outline">旁证层 · 不混算</Badge></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4"><label className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">信号来源</span><select value={source} onChange={(event) => onSourceChange(event.target.value)} className="h-9 min-w-48 rounded-lg border bg-background px-3 text-sm">{sources.map((item) => <option key={item}>{item}</option>)}</select></label><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} /><Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}{uploading ? "导入中" : "导入外部信号"}</Button><Button size="sm" variant="outline" onClick={onDownloadTemplate}><FileDown className="mr-1.5 h-4 w-4" />下载模板</Button><p className="min-w-[260px] flex-1 text-xs leading-5 text-muted-foreground">标准字段：话题或作品、指标、数值、环比变化、证据链接、备注。建议在备注中记录地区、采集日期和具体口径。</p></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sources.map((item) => <Card key={item}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{item}</p><Badge variant={counts.get(item) ? "secondary" : "outline"}>{counts.get(item) || 0}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{counts.get(item) ? "本期已有旁证记录" : "本期尚未导入"}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle className="text-base">本期外部证据记录</CardTitle></CardHeader><CardContent>{signals.length ? <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 font-medium">来源</th><th className="pb-3 font-medium">话题或作品</th><th className="pb-3 font-medium">指标</th><th className="pb-3 text-right font-medium">数值</th><th className="pb-3 text-right font-medium">变化</th><th className="pb-3 pl-4 font-medium">证据</th></tr></thead><tbody>{signals.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3"><Badge variant="outline">{item.source}</Badge></td><td className="max-w-[220px] truncate py-3 font-medium">{item.topic}</td><td className="py-3 text-muted-foreground">{item.metric}</td><td className="py-3 text-right">{item.value === null ? "—" : short(item.value)}</td><td className="py-3 text-right">{item.change || "—"}</td><td className="max-w-[280px] py-3 pl-4 text-xs text-muted-foreground">{/^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">查看来源</a> : item.note || "未附链接"}</td></tr>)}</tbody></table></div> : <Empty message="本期还没有外部信号。下载模板整理证据后导入，或后续接入正式API。" />}</CardContent></Card>
    </section>
  );
}
function ProductionAssessmentPanel({ dashboard }: { dashboard: Dashboard }) {
  const works = [...new Map(dashboard.works.map((item) => [item.titleKey, item])).values()];
  const assessed = works.map((work) => ({ work, assessment: assessProduction(work) }));
  const candidates = [...assessed].sort((a, b) => b.assessment.score - a.assessment.score || (b.work.heat || 0) - (a.work.heat || 0));
  const highFit = assessed.filter((item) => item.assessment.score >= 75).length;
  const hard = assessed.filter((item) => item.assessment.difficulty === "高").length;
  const highRisk = assessed.filter((item) => item.assessment.characterRisk === "高").length;
  const reusable = assessed.filter((item) => item.assessment.reuse === "高").length;
  return (
    <section aria-labelledby="production-assessment-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="section-kicker">AI production fit</p><h3 id="production-assessment-title" className="mt-1 text-lg font-semibold">AI仿真人制作预评估</h3><p className="mt-1 text-xs text-muted-foreground">基于题材标签的规则评估，用于筛选小样测试对象，不代表实际制作成本或最终可行性。</p></div>
        <Badge variant="outline">规则预判 · 需人工复核</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="高适配候选" value={highFit.toLocaleString()} note="AI适配度评分 ≥ 75" />
        <Metric label="高制作难度" value={hard.toLocaleString()} note="世界观、动作或特效复杂" />
        <Metric label="高一致性风险" value={highRisk.toLocaleString()} note="多角色关系与群像管理" />
        <Metric label="高资产复用" value={reusable.toLocaleString()} note="都市、家庭或职场场景" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">优先小样测试候选</CardTitle><p className="mt-1 text-xs text-muted-foreground">先按AI适配度排序，再参考市场热度；高分不等于可以直接立项。</p></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[820px] w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 font-medium">作品</th><th className="pb-3 text-right font-medium">适配度</th><th className="pb-3 text-center font-medium">制作难度</th><th className="pb-3 text-center font-medium">角色风险</th><th className="pb-3 text-center font-medium">资产复用</th><th className="pb-3 pl-4 font-medium">判断依据</th></tr></thead><tbody>{candidates.slice(0, 20).map(({ work, assessment }) => <tr key={work.titleKey} className="border-b last:border-0"><td className="max-w-[220px] py-3"><p className="truncate font-medium">{work.titleCn || work.title}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{work.genre}</p></td><td className="py-3 text-right font-semibold text-primary">{assessment.score}</td><td className="py-3 text-center"><RiskBadge value={assessment.difficulty} /></td><td className="py-3 text-center"><RiskBadge value={assessment.characterRisk} /></td><td className="py-3 text-center"><ReuseBadge value={assessment.reuse} /></td><td className="max-w-[320px] py-3 pl-4 text-xs leading-5 text-muted-foreground">{assessment.reasons.join("；")}</td></tr>)}</tbody></table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">评估规则说明</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <RuleLine title="适配度" text="现代情感、家庭、豪门、职场等可控关系与室内场景提高基础分。" />
            <RuleLine title="制作难度" text="科幻、玄幻、战争、动作、年代和大规模特效题材提高难度。" />
            <RuleLine title="角色一致性" text="群像、家庭、豪门、后宫、宫斗和黑帮关系增加角色管理风险。" />
            <RuleLine title="资产复用" text="都市、家庭、职场、校园、医院等重复场景具有更高复用潜力。" />
            <div className="rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800">进入开发前必须补做角色定妆、多人同框、核心场景和高难动作的小样测试。</div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
function RiskBadge({ value }: { value: "低" | "中" | "高" }) { return <Badge variant={value === "高" ? "destructive" : value === "中" ? "secondary" : "outline"}>{value}</Badge>; }
function ReuseBadge({ value }: { value: "低" | "中" | "高" }) { return <Badge variant={value === "高" ? "default" : value === "中" ? "secondary" : "outline"}>{value}</Badge>; }
function RuleLine({ title, text }: { title: string; text: string }) { return <div><p className="font-semibold text-foreground">{title}</p><p>{text}</p></div>; }
function PlatformComparison({ dashboard, previousDashboard }: { dashboard: Dashboard; previousDashboard?: Dashboard }) {
  const uniqueWorks = (works: Work[]) => [...new Map(works.map((item) => [item.titleKey, item])).values()];
  const adWorks = uniqueWorks(dashboard.works.filter((item) => item.signal === "ad"));
  const tkKeys = new Set(dashboard.works.filter((item) => item.signal === "tk").map((item) => item.titleKey));
  const previousAdWorks = uniqueWorks((previousDashboard?.works || []).filter((item) => item.signal === "ad"));
  const profiles = CORE_PLATFORMS.map((platform) => {
    const works = adWorks.filter((item) => item.platforms.includes(platform));
    const previousWorks = previousAdWorks.filter((item) => item.platforms.includes(platform));
    const genreCounts = new Map<string, number>();
    works.forEach((work) => work.genre.split(/[、,，/]/).map((item) => item.trim()).filter((item) => item && !GENERIC_TAGS.has(item)).forEach((genre) => genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1)));
    const topGenres = [...genreCounts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    const topWork = [...works].sort((a, b) => (b.heat || 0) - (a.heat || 0))[0];
    const share = adWorks.length ? (works.length / adWorks.length) * 100 : 0;
    const previousShare = previousAdWorks.length ? (previousWorks.length / previousAdWorks.length) * 100 : 0;
    return { platform, works: works.length, share, shareChange: share - previousShare, validated: works.filter((item) => tkKeys.has(item.titleKey)).length, topGenres, topWork, heat: works.reduce((sum, item) => sum + (item.heat || 0), 0) };
  }).sort((a, b) => b.works - a.works || b.heat - a.heat);
  const covered = profiles.filter((item) => item.works > 0);
  const totalAssignments = profiles.reduce((sum, item) => sum + item.works, 0);
  const topThreeShare = totalAssignments ? (profiles.slice(0, 3).reduce((sum, item) => sum + item.works, 0) / totalAssignments) * 100 : 0;
  const totalValidated = profiles.reduce((sum, item) => sum + item.validated, 0);
  return (
    <section aria-labelledby="platform-comparison-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="section-kicker">Top platforms · North America focus</p><h3 id="platform-comparison-title" className="mt-1 text-lg font-semibold">前十平台横向比较</h3><p className="mt-1 text-xs text-muted-foreground">平台归属取广告榜投放产品；TikTok仅通过严格同名作品提供播放侧验证。</p></div>
        <Badge variant="outline">北美优先 · 海外覆盖</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="本期覆盖平台" value={`${covered.length} / ${CORE_PLATFORMS.length}`} note="前十目标平台中有AI样本的平台" />
        <Metric label="头部集中度" value={`${topThreeShare.toFixed(1)}%`} note="前三平台占平台作品归属次数" />
        <Metric label="TikTok验证作品" value={totalValidated.toLocaleString()} note="平台投放作品中同时进入播放榜" />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-5">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 font-medium">平台</th><th className="pb-3 text-right font-medium">AI作品</th><th className="pb-3 text-right font-medium">覆盖率</th><th className="pb-3 text-right font-medium">环比</th><th className="pb-3 text-right font-medium">TikTok验证</th><th className="pb-3 pl-5 font-medium">题材偏好</th><th className="pb-3 pl-5 font-medium">重点作品</th></tr></thead>
            <tbody>{profiles.map((item) => <tr key={item.platform} className="border-b last:border-0"><td className="py-3 font-semibold">{item.platform}</td><td className="py-3 text-right">{item.works}</td><td className="py-3 text-right">{item.share.toFixed(1)}%</td><td className={`py-3 text-right font-medium ${item.shareChange > 0 ? "text-emerald-700" : item.shareChange < 0 ? "text-amber-700" : "text-muted-foreground"}`}>{previousDashboard ? `${item.shareChange > 0 ? "+" : ""}${item.shareChange.toFixed(1)}pp` : "—"}</td><td className="py-3 text-right">{item.validated}</td><td className="py-3 pl-5"><div className="flex flex-wrap gap-1">{item.topGenres.length ? item.topGenres.map((genre) => <Badge key={genre} variant="outline" className="text-[10px]">{genre}</Badge>) : <span className="text-xs text-muted-foreground">暂无样本</span>}</div></td><td className="max-w-[240px] truncate py-3 pl-5" title={item.topWork?.title}>{item.topWork ? item.topWork.titleCn || item.topWork.title : "—"}</td></tr>)}</tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs leading-5 text-muted-foreground">覆盖率表示该平台覆盖的AI投放作品占本期广告榜AI作品的比例；同一作品可能投放多个平台，因此各平台覆盖率不要求相加等于100%。</p>
    </section>
  );
}
function MarketCoverageNote() {
  return (
    <Card className="border-[#d7e4c8] bg-[#f7f9f3]">
      <CardContent className="grid gap-4 p-5 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-[#173f31]">平台口径</p>
          <p className="mt-1 text-sm leading-6 text-[#4b6657]">
            广告榜中的投放产品可归一为ReelShort、DramaBox、NetShort等短剧平台，用于比较投放覆盖与题材偏好。
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#173f31]">TikTok口径</p>
          <p className="mt-1 text-sm leading-6 text-[#4b6657]">
            TikTok表中的剧场号是分发账号，不直接等同于短剧App。账号归属未确认前，必须与平台分析分开呈现。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
function DataOperations({
  dashboard,
  chineseTitleCoverage,
  availablePeriodCount,
  platformAliasMap,
  titleAliasMap,
  genreAliasMap,
  onSavePlatformAlias,
  onSaveTitleAlias,
  onSaveGenreAlias,
  onExportMissing,
  onImportNames,
  onOpenWorks,
}: {
  dashboard: Dashboard;
  chineseTitleCoverage: number;
  availablePeriodCount: number;
  platformAliasMap: Record<string, string>;
  titleAliasMap: Record<string, string>;
  genreAliasMap: Record<string, string>;
  onSavePlatformAlias: (source: string, target: string) => void;
  onSaveTitleAlias: (alias: string, standardTitle: string) => void;
  onSaveGenreAlias: (alias: string, standardGenre: string) => void;
  onExportMissing: () => void;
  onImportNames: () => void;
  onOpenWorks: () => void;
}) {
  const corePlatformNames: string[] = [...CORE_PLATFORMS];
  const corePlatforms = new Set<string>(corePlatformNames);
  const [platformTargets, setPlatformTargets] = useState<
    Record<string, string>
  >({});
  const [titleTargets, setTitleTargets] = useState<Record<string, string>>({});
  const [genreTargets, setGenreTargets] = useState<Record<string, string>>({});
  const periods = availablePeriodCount;
  const platformCandidates = dashboard.adPlatforms.slice(0, 8);
  const standardGenres = new Set<string>(STANDARD_GENRES);
  const genreCandidates = dashboard.genres.filter((item) => !standardGenres.has(item.name)).slice(0, 8);
  const pendingPlatforms = platformCandidates.filter(
    (item) => !corePlatforms.has(item.name),
  ).length;
  const sourceSignals = new Map<string, Set<Signal>>();
  dashboard.works.forEach((work) => {
    const signals = sourceSignals.get(work.titleKey) || new Set<Signal>();
    signals.add(work.signal);
    sourceSignals.set(work.titleKey, signals);
  });
  const matchBase = Math.min(
    ...dashboard.datasets
      .filter((item) => item.works > 0)
      .map((item) => item.works),
  );
  const matchRate =
    Number.isFinite(matchBase) && matchBase > 0
      ? dashboard.overlapCount / matchBase
      : 0;
  const titleReview = [
    ...new Map(
      dashboard.works
        .filter((work) => (sourceSignals.get(work.titleKey)?.size || 0) === 1)
        .sort((a, b) => (b.heat || 0) - (a.heat || 0))
        .map((work) => [work.titleKey, work]),
    ).values(),
  ].slice(0, 6);
  return (
    <section aria-labelledby="data-operations-title" className="space-y-4">
      <div>
        <p className="section-kicker">Data operations</p>
        <h2 id="data-operations-title" className="mt-1 text-lg font-semibold">
          数据健康与待处理项
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="历史月份"
          value={String(periods)}
          note={periods >= 3 ? "可启用短期趋势" : `还需 ${3 - periods} 个月`}
        />
        <Metric
          label="严格同名匹配率"
          value={`${(matchRate * 100).toFixed(1)}%`}
          note={`${dashboard.overlapCount} 部双信号作品`}
        />
        <Metric
          label="中文名覆盖"
          value={`${chineseTitleCoverage.toFixed(1)}%`}
          note="只辅助内部阅读"
        />
        <Metric
          label="平台映射候选"
          value={String(pendingPlatforms)}
          note={`${Object.keys(platformAliasMap).length} 条映射已保存`}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">平台映射候选</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                核心十平台直接归类，其他高频产品保留原名并等待确认。
              </p>
            </div>
            <Badge variant="outline">广告投放口径</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {platformCandidates.length ? (
              platformCandidates.map((item) => {
                const mapped = corePlatforms.has(item.name);
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.value.toLocaleString()} 条
                    </span>
                    {mapped ? (
                      <Badge variant="secondary">已映射</Badge>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <select
                          aria-label={`将${item.name}映射到核心平台`}
                          value={platformTargets[item.name] || ""}
                          onChange={(event) =>
                            setPlatformTargets((current) => ({
                              ...current,
                              [item.name]: event.target.value,
                            }))
                          }
                          className="h-8 rounded-lg border bg-background px-2 text-xs"
                        >
                          <option value="">选择映射</option>
                          {corePlatformNames.map((platform) => (
                            <option key={platform} value={platform}>
                              {platform}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!platformTargets[item.name]}
                          onClick={() =>
                            onSavePlatformAlias(
                              item.name,
                              platformTargets[item.name],
                            )
                          }
                        >
                          确认
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <Empty message="导入广告投放榜后生成平台映射候选。" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">剧名别名核验队列</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                优先检查高热度但只出现在单一来源的作品，不自动认定为同一剧。
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={onOpenWorks}>
              打开作品雷达
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {titleReview.length ? (
              titleReview.map((work) => (
                <div
                  key={`${work.sourceId}-${work.titleKey}`}
                  className="rounded-xl border px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {work.titleCn || work.title}
                      </p>
                      {work.titleCn && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {work.title}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline">
                      {work.signal === "ad" ? "仅投放榜" : "仅播放榜"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={titleTargets[work.title] || ""}
                      onChange={(event) =>
                        setTitleTargets((current) => ({
                          ...current,
                          [work.title]: event.target.value,
                        }))
                      }
                      placeholder="填写另一来源中的标准剧名"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!titleTargets[work.title]?.trim()}
                      onClick={() =>
                        onSaveTitleAlias(
                          work.title,
                          titleTargets[work.title],
                        )
                      }
                    >
                      确认别名
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Empty message="当前没有需要优先核验的单来源作品。" />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div><CardTitle className="text-base">题材标签词典</CardTitle><p className="mt-1 text-xs text-muted-foreground">非标准标签需人工归一；保存后将同步影响趋势、平台偏好、制作评估和导出简报。</p></div>
          <Badge variant="outline">已保存 {Object.keys(genreAliasMap).length} 条映射</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {genreCandidates.length ? genreCandidates.map((item) => <div key={item.name} className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><div className="min-w-[120px] flex-1"><p className="text-sm font-medium">{item.name}</p><p className="text-[11px] text-muted-foreground">出现 {item.value.toLocaleString()} 次</p></div><select aria-label={`将题材${item.name}归一为`} value={genreTargets[item.name] || ""} onChange={(event) => setGenreTargets((current) => ({ ...current, [item.name]: event.target.value }))} className="h-8 rounded-lg border bg-background px-2 text-xs"><option value="">选择标准题材</option>{STANDARD_GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select><Button size="sm" variant="outline" disabled={!genreTargets[item.name]} onClick={() => onSaveGenreAlias(item.name, genreTargets[item.name])}>确认</Button></div>) : <div className="md:col-span-2"><Empty message="当前头部题材均已属于标准词典；后续导入的新标签仍会自动进入待确认队列。" /></div>}
        </CardContent>
      </Card>
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-[240px] flex-1">
            <p className="text-sm font-semibold">中文辅助名维护</p>
            <p className="mt-1 text-xs text-muted-foreground">
              中文名不参与作品匹配。先导出待补清单，人工确认后再回填。
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!dashboard.totalWorks}
            onClick={onExportMissing}
          >
            导出待补中文名
          </Button>
          <Button size="sm" variant="outline" onClick={onImportNames}>
            回填中文名映射
          </Button>
          <Badge variant="secondary">
            已保存 {Object.keys(titleAliasMap).length} 条剧名别名
          </Badge>
        </CardContent>
      </Card>
    </section>
  );
}
function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground">
      {message}
    </div>
  );
}
function MarketConclusions({ dashboard, period, periodCount, periodKind }: { dashboard: Dashboard; period: string; periodCount: number; periodKind: PeriodKind }) {
  const leadGenre = dashboard.sharedGenres[0] || dashboard.genres[0];
  const secondGenre = dashboard.sharedGenres[1] || dashboard.genres[1];
  const leadPair = dashboard.genrePairs[0];
  const leadOpportunity = dashboard.opportunities[0];
  const leadPlatform = dashboard.platforms[0];
  const samples = [
    ...new Map(
      dashboard.overlapWorks.map((item) => [item.titleKey, item]),
    ).values(),
  ].slice(0, 3);
  const signalLabels = dashboard.datasets
    .map((item) => item.signal)
    .filter((item, index, values) => values.indexOf(item) === index);
  return (
    <Card className="overflow-hidden border-[#b6ce92] bg-[linear-gradient(115deg,#eff6e5_0%,#fbfcf8_48%,#eef4ea_100%)]">
      <CardHeader className="border-b border-[#d7e4c8]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-kicker text-[#4f7138]">
              Decision brief · data to development
            </p>
            <CardTitle className="mt-1 text-xl text-[#173f31]">
              重点结论与选题动作
            </CardTitle>
            <p className="mt-1 text-sm text-[#4b6657]">
              只保留能直接影响选题判断的三条信息。
            </p>
          </div>
          <div className="flex gap-1">
            {signalLabels.map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="border-[#a8c77d] bg-white/65 text-[#315f4a]"
              >
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-5 lg:grid-cols-3">
        <Conclusion title="市场正在放大" index="01">
          <p>{leadGenre ? <><strong>{leadGenre.name}</strong> 是当前第一题材信号（{leadGenre.value}条样本）{secondGenre ? `，其次是${secondGenre.name}` : ""}；头部平台为 <strong>{leadPlatform?.name || "待识别"}</strong>。</> : "当前数据不足，暂不形成题材结论。"}</p>
        </Conclusion>
        <Conclusion title="优先拆哪一部" index="02">
          <p>{leadOpportunity ? <><strong>{leadOpportunity.titleCn || leadOpportunity.title}</strong> 是当前优先样本：{leadOpportunity.quadrant}，机会指数 {leadOpportunity.score}。只拆人物关系、前三集承诺和素材钩子。</> : `当前${dashboard.overlapCount}部双信号作品不足以形成明确优先级，先补播放或投放侧数据。`}</p>
        </Conclusion>
        <Conclusion title="今天的选题动作" index="03">
          <p>{leadPair ? <>围绕 <strong>{leadPair.name}</strong> 组合产出3个不同关系切口；每个切口只验证“高概念一句话 + 首集危机 + 第三集卡点”。</> : "从第一题材中提出3个具体人物关系，不直接使用大类标签作为选题。"}</p>
          <p className="mt-2 text-xs text-[#6b8074]">口径：{period} · {periodCount}个{periodKind === "day" ? "日榜" : periodKind === "week" ? "周榜" : "月榜"}周期；曝光与播放不相加。</p>
        </Conclusion>
      </CardContent>
      {samples.length > 0 && (
        <div className="border-t border-[#d7e4c8] bg-white/45 px-5 py-4">
          <p className="text-xs font-semibold text-[#315f4a]">
            投放与播放双信号作品样本
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {samples.map((work) => (
              <span
                key={work.titleKey}
                className="rounded-full border border-[#c7dbac] bg-white px-3 py-1.5 text-xs text-[#315f4a]"
              >
                <strong>{work.titleCn || work.title}</strong>
                {work.titleCn && (
                  <span className="ml-1 text-[#68816f]">({work.title})</span>
                )}
                <span className="ml-1 text-[#68816f]">{work.genre}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
function Conclusion({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#d7e4c8] bg-white/70 p-4 text-sm leading-6 text-[#365347]">
      <p className="text-[11px] font-bold tracking-[.14em] text-[#759950]">
        {index}
      </p>
      <h3 className="mt-1 font-semibold text-[#173f31]">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}
function ExecutiveCharts({ dashboard }: { dashboard: Dashboard }) {
  const genreData = dashboard.genres.slice(0, 8);
  const platformData = dashboard.platforms.slice(0, 8);

  const chartCard =
    "overflow-hidden border-[#d7e4c8] bg-[linear-gradient(145deg,#ffffff_0%,#f6f9f2_100%)]";
  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid #d7e4c8",
    boxShadow: "0 12px 30px rgba(23,63,49,.12)",
    fontSize: 12,
  };

  return (
    <section aria-labelledby="executive-charts-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Visual market brief</p>
          <h2 id="executive-charts-title" className="mt-1 text-lg font-semibold text-[#173f31]">
            市场结构图表
          </h2>
        </div>
        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
          总览只保留题材和平台两项核心结构；详细判断进入“市场洞察”。
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className={chartCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">题材热度 Top 8</CardTitle>
            <p className="text-xs text-muted-foreground">横向比较当前样本中的题材出现次数，热度仅作辅助判断。</p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={genreData} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#e2eadb" strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#668074" }} />
                  <YAxis dataKey="name" type="category" width={76} tick={{ fontSize: 11, fill: "#294d3e" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} 条`, "样本次数"]} />
                  <Bar dataKey="value" fill="#315f4a" radius={[0, 7, 7, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className={chartCard}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">平台表现对比</CardTitle>
            <p className="text-xs text-muted-foreground">按当前统计口径呈现各平台或渠道的AI短剧样本量。</p>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformData} margin={{ top: 8, right: 12, left: 0, bottom: 42 }}>
                  <CartesianGrid vertical={false} stroke="#e2eadb" strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} tick={{ fontSize: 10, fill: "#668074" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#668074" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} 条`, "样本次数"]} />
                  <Bar dataKey="value" fill="#7aa34d" radius={[7, 7, 0, 0]} barSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

      </div>
    </section>
  );
}
function OpportunityBoard({
  dashboard,
  savedTitles,
  savingIdea,
  onSave,
  onSaveGenre,
}: {
  dashboard: Dashboard;
  savedTitles: Set<string>;
  savingIdea: string;
  onSave: (item: Opportunity) => Promise<void>;
  onSaveGenre: (item: Bucket) => Promise<void>;
}) {
  const quadrants: Opportunity["quadrant"][] = [
    "双高验证",
    "自传播机会",
    "投放待验证",
    "观察池",
  ];
  const descriptions = {
    双高验证: "投放和播放均进入各自前20%，优先拆解",
    自传播机会: "播放强于投放，关注自然传播与题材新鲜度",
    投放待验证: "投放强于播放，继续观察消费侧反馈",
    观察池: "已有双信号，但尚未进入两侧头部",
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">双信号作品四象限</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            以各自榜单AI作品热度前20%为高信号阈值，仅比较严格同名作品。
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {quadrants.map((quadrant) => {
            const items = dashboard.opportunities.filter(
              (item) => item.quadrant === quadrant,
            );
            return (
              <div
                key={quadrant}
                className="rounded-2xl border bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{quadrant}</p>
                  <Badge
                    variant={quadrant === "双高验证" ? "default" : "secondary"}
                  >
                    {items.length}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {descriptions[quadrant]}
                </p>
                <div className="mt-3 space-y-2">
                  {items.slice(0, 3).map((item) => {
                    const saved =
                      savedTitles.has(item.titleKey) ||
                      (item.titleCn
                        ? savedTitles.has(normalizeTitle(item.titleCn))
                        : false);
                    return (
                      <div
                        key={item.titleKey}
                        className="rounded-xl bg-background px-3 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {item.titleCn || item.title}
                            </p>
                            {item.titleCn && (
                              <p className="truncate text-[10px] text-muted-foreground">
                                {item.title}
                              </p>
                            )}
                            <p className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                              <span>机会指数 {item.score}</span>
                              <span>曝光 {short(item.adHeat)}</span>
                              <span>播放 {short(item.tkHeat)}</span>
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={saved ? "secondary" : "outline"}
                            disabled={saved || savingIdea === item.titleKey}
                            onClick={() => void onSave(item)}
                            className="h-7 px-2 text-[10px]"
                          >
                            {savingIdea === item.titleKey ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : saved ? (
                              "已加入"
                            ) : (
                              <>
                                <BookmarkPlus className="mr-1 h-3 w-3" />
                                加入选题库
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      本期暂无作品
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">题材组合机会</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            从AI样本的标签共现中提取，作为选题会的组合入口。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {dashboard.genrePairs.slice(0, 6).map((pair, index) => {
            const ideaTitle = `题材机会｜${pair.name}`;
            const saved = savedTitles.has(normalizeTitle(ideaTitle));
            const saving = savingIdea === `genre:${pair.name}`;
            return (
              <div
                key={pair.name}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pair.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    覆盖 {pair.value.toLocaleString()} 条AI记录 · 热度 {short(pair.heat)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={saved ? "secondary" : "outline"}
                  disabled={saved || saving}
                  onClick={() => void onSaveGenre(pair)}
                  className="h-8 shrink-0 px-2.5 text-[11px]"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : saved ? (
                    "已加入"
                  ) : (
                    <>
                      <BookmarkPlus className="mr-1 h-3 w-3" />
                      加入选题库
                    </>
                  )}
                </Button>
              </div>
            );
          })}
          {dashboard.genrePairs.length === 0 && (
            <Empty message="导入带有复合标签的数据后显示题材组合。" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function TrendSnapshot({ trend, onOpen }: { trend: TrendAnalysis; onOpen: () => void }) {
  const rising = trend.genres.filter((item) => item.change > 0).slice(0, 3);
  const falling = trend.genres.filter((item) => item.change < 0).slice(0, 3);
  return (
    <Card className="border-[#d7e4c8] bg-[#f7f9f3]">
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[190px]">
          <p className="text-xs font-semibold tracking-[.14em] text-[#759950]">趋势快照</p>
          <p className="mt-1 text-sm font-semibold text-[#173f31]">{trend.currentPeriod} 对比 {trend.previousPeriod || "上一周期"}</p>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
          {rising.length ? rising.map((item) => <Badge key={item.name} className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">↑ {item.name} +{item.change}</Badge>) : <span className="text-xs text-muted-foreground">暂无明确上升题材</span>}
          {falling.map((item) => <Badge key={item.name} variant="outline" className="border-amber-200 text-amber-800">↓ {item.name} {item.change}</Badge>)}
        </div>
        <Button size="sm" variant="outline" onClick={onOpen}>查看完整趋势</Button>
      </CardContent>
    </Card>
  );
}
function TrendPanel({ trend }: { trend: TrendAnalysis }) {
  const unit = trend.periodKind === "week" ? "周" : "月";
  if (!trend.previousPeriod) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="section-kicker">Cross-month trend</p>
            <p className="mt-1 font-semibold">连续月份趋势</p>
            <p className="mt-1 text-sm text-muted-foreground">当前只有 {trend.currentPeriod || "一个统计期"}，暂不计算环比、连续上榜或题材动量。</p>
          </div>
          <Badge variant="outline">还需至少 1 个{unit}榜周期形成环比</Badge>
        </CardContent>
      </Card>
    );
  }
  const level = trend.periodCount >= 3 ? "短期趋势" : "环比观察";
  const rising = trend.genres.filter((item) => item.change > 0).slice(0, 5);
  const declining = [...trend.genres].filter((item) => item.change < 0).sort((a, b) => a.change - b.change).slice(0, 5);
  const burst = trend.genres.filter((item) => item.streak === 1 && item.change > 0).slice(0, 4);
  const sustained = trend.genres.filter((item) => item.streak >= 3 && item.change > 0).slice(0, 4);
  const stable = trend.genres.filter((item) => item.streak >= 2 && Math.abs(item.change) <= Math.max(1, item.current * 0.1)).slice(0, 4);
  const cooling = trend.genres.filter((item) => item.change < 0).slice(0, 4);
  return (
    <section aria-labelledby="trend-panel-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Cross-month trend</p>
          <h2 id="trend-panel-title" className="mt-1 text-lg font-semibold">连续月份趋势</h2>
          <p className="mt-1 text-xs text-muted-foreground">{trend.currentPeriod} 对比 {trend.previousPeriod}；连续上榜回看至当前月份。</p>
        </div>
        <Badge variant={trend.periodCount >= 3 ? "default" : "outline"}>{level} · {trend.periodCount} 个{unit}榜周期</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrendClassCard label="短期爆发" items={burst} note={trend.periodKind === "week" ? "本周新进入头部且快速增长" : "本月新进入头部，需周榜验证速度"} />
        <TrendClassCard label="持续上升" items={sustained} note={`连续至少 3 个${unit}榜周期且本期继续增长`} />
        <TrendClassCard label="稳定热门" items={stable} note={`连续在榜且本期波动不超过约 10%`} />
        <TrendClassCard label="热度回落" items={cooling} note="本期头部样本次数低于上一周期" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">题材动量</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rising.length ? rising.map((item) => <TrendLine key={item.name} name={item.name} value={`+${item.change}`} note={`本期 ${item.current} 次 · 连续 ${item.streak} 个${unit}榜周期`} positive />) : <Empty message="头部题材中暂无环比上升项。" />}
            {declining.length > 0 && <div className="border-t pt-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">回落观察</p>{declining.map((item) => <TrendLine key={item.name} name={item.name} value={String(item.change)} note={`本期 ${item.current} 次`} />)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">新增与消失信号</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><p className="text-xs font-semibold text-primary">新进入头部题材</p><div className="mt-2 flex flex-wrap gap-1.5">{trend.newGenres.length ? trend.newGenres.map((item) => <Badge key={item} variant="secondary">{item}</Badge>) : <span className="text-xs text-muted-foreground">无新增头部题材</span>}</div></div>
            <div><p className="text-xs font-semibold text-muted-foreground">退出头部题材</p><div className="mt-2 flex flex-wrap gap-1.5">{trend.fadingGenres.length ? trend.fadingGenres.map((item) => <Badge key={item} variant="outline">{item}</Badge>) : <span className="text-xs text-muted-foreground">无退出头部题材</span>}</div></div>
            <p className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">“新增/消失”指进入或退出当月头部题材，不代表市场中首次出现或彻底消失。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">连续上榜作品</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {trend.works.length ? trend.works.slice(0, 6).map((item) => <TrendLine key={item.title} name={item.titleCn || item.title} value={item.currentRank !== null ? `#${item.currentRank}` : "在榜"} note={`${item.movement > 0 ? `上升 ${item.movement} 位` : item.movement < 0 ? `下降 ${Math.abs(item.movement)} 位` : "排名持平或缺少排名"} · 连续 ${item.streak} 个${unit}榜周期`} positive={item.movement > 0} />) : <Empty message="相邻同类榜单尚未识别到严格同名的连续上榜作品。" />}
          </CardContent>
        </Card>
      </div>
      {trend.platforms.length > 0 && (
        <Card><CardContent className="flex flex-wrap items-center gap-2 p-4"><span className="mr-2 text-xs font-semibold">平台覆盖变化</span>{trend.platforms.slice(0, 8).map((item) => <Badge key={item.name} variant="outline">{item.name} {item.change > 0 ? `+${item.change}` : item.change}</Badge>)}</CardContent></Card>
      )}
      {trend.periodCount < 3 && <p className="text-xs leading-5 text-amber-700">当前只有两个连续{unit}榜周期，以上为环比观察信号；累计到3个同类周期后才标记为短期趋势。</p>}
    </section>
  );
}
function TrendClassCard({ label, items, note }: { label: string; items: TrendRow[]; note: string }) {
  return <Card><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{label}</p><Badge variant="secondary">{items.length}</Badge></div><div className="mt-3 flex min-h-7 flex-wrap gap-1.5">{items.length ? items.map((item) => <Badge key={item.name} variant="outline">{item.name}</Badge>) : <span className="text-xs text-muted-foreground">本期暂无</span>}</div><p className="mt-3 text-[11px] leading-5 text-muted-foreground">{note}</p></CardContent></Card>;
}
function TrendLine({ name, value, note, positive = false }: { name: string; value: string; note: string; positive?: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p></div><span className={`shrink-0 text-sm font-semibold ${positive ? "text-emerald-700" : "text-muted-foreground"}`}>{value}</span></div>;
}
function WorkDetail({ work, onClose }: { work: Work; onClose: () => void }) {
  const tags = work.genre.split(/[、,，/]/).filter(Boolean);
  return (
    <Card className="border-primary/30 bg-secondary/25">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <p className="section-kicker">Work detail</p>
          <Badge variant="outline" className="mt-2 text-[10px]">
            海外短剧
          </Badge>
          <CardTitle className="mt-1 text-lg">
            {work.titleCn || work.title}
          </CardTitle>
          {work.titleCn && (
            <p className="mt-1 text-sm text-muted-foreground">
              海外原名：{work.title}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {work.period} ·{" "}
            {work.signal === "ad"
              ? "广告投放信号"
              : work.signal === "tk"
                ? "TikTok播放信号"
                : "市场信号"}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant={tag === "AI仿真人" ? "default" : "outline"}
              >
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">渠道</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {work.platforms.map((platform) => (
                <Badge key={platform} variant="secondary">
                  {platform}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <div className="grid min-w-44 grid-cols-2 gap-3">
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted-foreground">榜单排名</p>
            <p className="mt-1 text-xl font-semibold">
              {work.rank === null ? "—" : `#${work.rank}`}
            </p>
          </div>
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted-foreground">
              {work.signal === "ad" ? "预估曝光" : "播放增量"}
            </p>
            <p className="mt-1 text-xl font-semibold">
              {work.heat === null ? "—" : short(work.heat)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function TrendReadiness({ periods }: { periods: string[] }) {
  const months = periods.filter((item) => periodKindFor(item) === "month");
  const weeks = periods.filter((item) => periodKindFor(item) === "week");
  return (
    <div className="rounded-xl border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">连续周期趋势准备度</p>
        <div className="flex gap-1"><Badge variant="outline">月榜 {months.length}</Badge><Badge variant="outline">周榜 {weeks.length}</Badge></div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {months.length >= 3 || weeks.length >= 3
          ? "至少一种榜单周期已达到短期趋势门槛；周榜与月榜将分别计算连续上榜、排名升降和题材动量。"
          : "周榜和月榜分别累计；任一类型达到3个连续周期后，才标记为短期趋势。"}
      </p>
    </div>
  );
}
function DataQuality({ dashboard }: { dashboard: Dashboard }) {
  const repeated = dashboard.datasets.reduce(
      (sum, item) => sum + Math.max(0, item.aiRows - item.works),
      0,
    ),
    base = Math.min(
      ...dashboard.datasets
        .filter((item) => item.works > 0)
        .map((item) => item.works),
    ),
    matchRate =
      Number.isFinite(base) && base > 0 ? dashboard.overlapCount / base : 0,
    unmapped = dashboard.works.filter((item) =>
      /未知|未标注/.test(item.platform),
    ).length,
    missingRank = dashboard.works.filter((item) => item.rank === null).length,
    missingHeat = dashboard.works.filter((item) => item.heat === null).length,
    nonCorePlatforms = new Set(dashboard.works.filter((item) => item.signal === "ad").flatMap((item) => item.platforms).filter((item) => !CORE_PLATFORMS.includes(item as typeof CORE_PLATFORMS[number]) && !/未标注/.test(item))).size,
    signals = new Set(dashboard.works.map((item) => item.signal)),
    completeSignals = signals.has("ad") && signals.has("tk");
  return (
    <div className="rounded-xl border border-dashed p-3">
      <p className="text-xs font-semibold">数据质量诊断</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-semibold">{repeated.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">同名多分发记录</p>
        </div>
        <div>
          <p className="text-lg font-semibold">
            {(matchRate * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">严格同名匹配率</p>
        </div>
        <div>
          <p className="text-lg font-semibold">{unmapped.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">渠道待映射</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
        同名多分发不等于重复脏数据，可能代表同一作品跨账号或跨产品发行。严格同名匹配率偏低时，应补充别名与多语种标题映射。
      </p>
      <div className="mt-3 space-y-2 border-t pt-3">
        <QualityAlert ok={completeSignals} title="当期数据源完整度" detail={completeSignals ? "投放榜与TikTok播放榜均已导入" : "缺少投放榜或TikTok播放榜，暂不支持双信号判断"} />
        <QualityAlert ok={missingRank === 0} title="榜单排名字段" detail={missingRank ? `${missingRank.toLocaleString()} 条作品记录缺少排名` : "当前作品记录均包含排名"} />
        <QualityAlert ok={missingHeat === 0} title="热度字段" detail={missingHeat ? `${missingHeat.toLocaleString()} 条作品记录缺少曝光或播放指标` : "当前作品记录均包含热度指标"} />
        <QualityAlert ok={unmapped === 0 && nonCorePlatforms === 0} title="平台归一化" detail={unmapped || nonCorePlatforms ? `${unmapped} 条未标注渠道；${nonCorePlatforms} 个非核心平台名称待确认` : "平台字段已归入核心平台或明确渠道"} />
      </div>
    </div>
  );
}
function QualityAlert({ ok, title, detail }: { ok: boolean; title: string; detail: string }) { return <div className="flex items-start gap-2 rounded-lg bg-muted/35 px-3 py-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} /><div><p className="text-xs font-medium">{title}</p><p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{detail}</p></div></div>; }
function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-36 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function ChartCard({
  title,
  icon: Icon,
  data,
  empty,
}: {
  title: string;
  icon: React.ElementType;
  data: Bucket[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 8, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={84}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(201,244,90,.12)" }}
                  formatter={(value) => [`${value} 条目`, "出现次数"]}
                />
                <Bar dataKey="value" fill="#315f4a" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty message={empty} />
        )}
      </CardContent>
    </Card>
  );
}
