"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/layout/app-layout";
import { BoardComparisons } from "@/components/market/board-comparisons";
import { BoardPlatforms } from "@/components/market/board-platforms";
import { boardSamples, compareBoards } from "@/lib/market/board-analysis";
import { MarketResearchPanel } from "@/components/market/market-research";
import { buildMarketResearch, type ResearchFinding } from "@/lib/market/research";
import { MonitorOverview } from "@/components/market/monitor-overview";
import { sampleMarketRows, latestBoardImports, marketBoardKey } from "@/lib/market/monitoring-policy";
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

type Signal = "ad" | "tk" | "platform" | "other";
type ImportMode = "append" | "replace" | "version";
type FieldRole = "title" | "genre" | "platform" | "rank" | "heat" | "material" | "materialCount";
type ImportAudit = {
  fileName: string;
  period: string;
  signal: Signal;
  rawRows: number;
  importedRows: number;
  invalidRows: number;
  duplicateTitles: number;
  titleColumn: string;
};
type ParsedImportFile = {
  fileName: string;
  targetPeriod: string;
  sourceRows: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  columns: string[];
  signal: Signal;
  rawRows: number;
  invalidRows: number;
  duplicateTitles: number;
  titleColumn: string;
};
type PendingImport = { mode: ImportMode; files: ParsedImportFile[] };
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
  boardKey: string;
  signal: Signal;
};
type Bucket = { name: string; value: number; heat: number };
type Dataset = {
  boardKey: string;
  name: string;
  period: string;
  rows: number;
  aiRows: number;
  sampledRows: number;
  works: number;
  heat: number | null;
  signal: string;
  heatLabel: string;
};
type Dashboard = {
  works: Work[];
  genres: Bucket[];
  adGenres: Bucket[];
  tkGenres: Bucket[];
  platforms: Bucket[];
  platformBoards: Bucket[];
  adPlatforms: Bucket[];
  tkChannels: Bucket[];
  genrePairs: Bucket[];
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
type ExternalSignal = { id: string; source: string; topic: string; metric: string; value: number | null; change: string; url: string; note: string; period: string };
type AssetRankRow = { title: string; genre: string; totalMaterials: number; newMaterials: number | null; impressions: number | null; platform: string; source: string };

const TITLE = /剧名|作品名称|短剧名称|项目名称|名称|title|drama/i;
const TITLE_CN = /国内剧名|国内短剧|中文剧名|中文名/i;
const GENRE = /题材|类型|赛道|标签|分类|genre|category/i;
const PLATFORM = /投放产品Top[123]|平台|渠道|剧场号|app|platform|发行方/i;
const RANK = /排名|榜单|名次|rank|排行/i;
const HEAT = /播放增量|预估曝光|热度|指数|流水|收入|消耗|gmv|revenue|票房/i;
const MATERIAL = /素材名称|素材标题|广告标题|视频标题|素材ID|creative|material/i;
const MATERIAL_COUNT = /总素材数|素材总数|素材数量|total\s*materials?/i;
const NEW_MATERIAL_COUNT = /新素材数|新增素材|new\s*materials?/i;
const GENERIC_TAGS = new Set(["AI仿真人", "实拍", "男频", "女频"]);
const VERSION_MARKER_PREFIX = "市场版本:";
const DATA_VERSION_PREFIX = "ADX版本:";
const SIGNAL_OVERRIDE_PREFIX = "__market_signal_";
const FIELD_ROLE_LABELS: Record<FieldRole, string> = {
  title: "作品名",
  genre: "题材标签",
  platform: "平台/渠道",
  rank: "榜单排名",
  heat: "热度/播放/曝光",
  material: "素材名称",
  materialCount: "总素材数",
};

function isMarketImport(item: MarketDataImport) {
  return (
    item.source_name !== "中文名映射" &&
    !item.source_name.startsWith("ADX日报:") &&
    !item.source_name.startsWith("外部信号:") &&
    !item.source_name.startsWith(VERSION_MARKER_PREFIX)
  );
}

function versionIdFor(item: MarketDataImport) {
  return item.source_name.startsWith(DATA_VERSION_PREFIX)
    ? item.source_name.slice(DATA_VERSION_PREFIX.length)
    : "legacy";
}

function activeVersionFor(imports: MarketDataImport[], period: string) {
  const marker = imports
    .filter(
      (item) =>
        item.period_label === period &&
        item.source_name.startsWith(VERSION_MARKER_PREFIX),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const versionId = marker?.raw_rows?.[0]?.version_id;
  return typeof versionId === "string" && versionId ? versionId : "legacy";
}

function activeImportsForPeriod(imports: MarketDataImport[], period: string) {
  const activeVersion = activeVersionFor(imports, period);
  return imports.filter(
    (item) =>
      item.source_name === "中文名映射" ||
      (item.period_label === period &&
        isMarketImport(item) &&
        versionIdFor(item) === activeVersion),
  );
}
const CORE_PLATFORMS = ["Vigloo", "DramaBox", "DramaWave", "FreeReels", "NetShort", "MoboReels", "PineDrama", "GoodShort", "StardustTV", "ShortMax", "ReelShort", "FlickReels"] as const;
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
function mappedKeyFor(row: Record<string, unknown>, test: RegExp, fieldRoleMap: Record<string, FieldRole>, role: FieldRole) {
  return Object.keys(row).find((key) => fieldRoleMap[key] === role) || keyFor(row, test);
}
function mappedKeysFor(row: Record<string, unknown>, test: RegExp, fieldRoleMap: Record<string, FieldRole>, role: FieldRole) {
  const mapped = Object.keys(row).filter((key) => fieldRoleMap[key] === role);
  return mapped.length ? mapped : keysFor(row, test);
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
function signalFor(columns: string[]): Signal {
  const override = columns.find((column) => column.startsWith(SIGNAL_OVERRIDE_PREFIX))?.slice(SIGNAL_OVERRIDE_PREFIX.length);
  if (override === "ad" || override === "tk" || override === "platform" || override === "other") return override;
  const headers = columns.join("|");
  return /新素材|总素材|预估曝光|投放/.test(headers)
    ? "ad"
    : /播放增量|播放总量|剧场号/.test(headers)
      ? "tk"
      : "other";
}
function platformForFile(fileName: string) {
  return CORE_PLATFORMS.find((name) => fileName.toLowerCase().includes(name.toLowerCase())) || "";
}
function signalForFile(fileName: string, columns: string[]): Signal {
  return platformForFile(fileName) ? "platform" : signalFor(columns);
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
function periodNumber(value: string) {
  const year = Number(value.match(/(20\d{2})/)?.[1] || 0);
  const week = Number(value.match(/(?:第\s*|W)(\d{1,2})\s*(?:周)?/i)?.[1] || 0);
  if (week && /周|week|W\d/i.test(value)) return year * 100 + week;
  const date = value.match(/20\d{2}\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])(?:\s*(\d{1,2})\s*日?)?/);
  const month = Number(date?.[1] || value.match(/(\d{1,2})\s*月/)?.[1] || 0);
  const day = Number(date?.[2] || value.match(/(\d{1,2})\s*日/)?.[1] || 0);
  return year * 10000 + month * 100 + day;
}
function periodKindFor(value: string): PeriodKind {
  return /日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|day/i.test(value) ? "day" : /周|week|W\d{1,2}/i.test(value) ? "week" : "month";
}
function comparePeriods(a: string, b: string) {
  const order: Record<PeriodKind, number> = { day: 0, week: 1, month: 2 };
  const kindDifference = order[periodKindFor(a)] - order[periodKindFor(b)];
  return kindDifference || periodNumber(b) - periodNumber(a) || b.localeCompare(a, "zh-CN");
}
function isoWeekValue(date: Date) {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function defaultUploadPeriod(kind: PeriodKind) {
  const now = new Date();
  if (kind === "month") {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${previousMonth.getFullYear()}年${previousMonth.getMonth() + 1}月`;
  }
  if (kind === "week") {
    const previousWeek = new Date(now);
    previousWeek.setDate(previousWeek.getDate() - 7);
    const [year, week] = isoWeekValue(previousWeek).split("-W");
    return `${year}年第${Number(week)}周`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return `${yesterday.getFullYear()}年${yesterday.getMonth() + 1}月${yesterday.getDate()}日`;
}
function uploadInputValue(label: string, kind: PeriodKind) {
  if (kind === "week") {
    const matched = label.match(/(20\d{2}).*?第?\s*(\d{1,2})\s*周/);
    return matched ? `${matched[1]}-W${String(Number(matched[2])).padStart(2, "0")}` : "";
  }
  const matched = label.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/);
  if (!matched) return "";
  const base = `${matched[1]}-${String(Number(matched[2])).padStart(2, "0")}`;
  return kind === "day" && matched[3] ? `${base}-${String(Number(matched[3])).padStart(2, "0")}` : base;
}
function uploadPeriodFromInput(value: string, kind: PeriodKind) {
  if (kind === "week") {
    const matched = value.match(/(20\d{2})-W(\d{1,2})/);
    return matched ? `${matched[1]}年第${Number(matched[2])}周` : "";
  }
  const matched = value.match(/(20\d{2})-(\d{2})(?:-(\d{2}))?/);
  if (!matched) return "";
  return kind === "day" && matched[3]
    ? `${matched[1]}年${Number(matched[2])}月${Number(matched[3])}日`
    : `${matched[1]}年${Number(matched[2])}月`;
}
function revalidateImportFile(item: ParsedImportFile, titleColumn: string) {
  const nonEmptyRows = item.sourceRows.filter((row) => Object.values(row).some((value) => text(value)));
  const rows = titleColumn ? nonEmptyRows.filter((row) => text(row[titleColumn])) : nonEmptyRows;
  const seenTitles = new Set<string>();
  let duplicateTitles = 0;
  if (titleColumn) {
    rows.forEach((row) => {
      const normalized = normalizeTitle(text(row[titleColumn]));
      if (!normalized) return;
      if (seenTitles.has(normalized)) duplicateTitles += 1;
      else seenTitles.add(normalized);
    });
  }
  return { ...item, titleColumn, rows, invalidRows: item.sourceRows.length - rows.length, duplicateTitles };
}
function detectPeriodLabel(fileName: string, sheetNames: string[], rows: Record<string, unknown>[]) {
  const periodValues = rows.slice(0, 50).flatMap((row) => Object.entries(row).filter(([key]) => /统计期|日期|日榜|周榜|月份|month|week|date|period/i.test(key)).map(([, value]) => text(value)));
  const candidates = [fileName, ...sheetNames, ...periodValues];
  for (const candidate of candidates) {
    const week = candidate.match(/(20\d{2})\s*(?:年|-)?\s*(?:第|W)?\s*(\d{1,2})\s*(?:周|week)/i);
    if (week) return `${week[1]}年第${Number(week[2])}周`;
    const isoWeek = candidate.match(/(20\d{2})-W(\d{1,2})/i);
    if (isoWeek) return `${isoWeek[1]}年第${Number(isoWeek[2])}周`;
    const day = candidate.match(/(20\d{2})\s*[年\-_/\.]\s*(1[0-2]|0?[1-9])\s*[月\-_/\.]\s*(3[01]|[12]\d|0?[1-9])\s*日?/);
    if (day) return `${day[1]}年${Number(day[2])}月${Number(day[3])}日`;
    const separated = candidate.match(/(20\d{2})\s*[年\-_/\.]\s*(1[0-2]|0?[1-9])\s*月?/);
    if (separated) return `${separated[1]}年${Number(separated[2])}月`;
    const compact = candidate.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
    if (compact) return `${compact[1]}年${Number(compact[2])}月`;
  }
  return "";
}
function analyze(
  imports: MarketDataImport[],
  chineseNameMap: Record<string, string> = {},
  titleAliasMap: Record<string, string> = {},
  platformAliasMap: Record<string, string> = {},
  genreAliasMap: Record<string, string> = {},
  fieldRoleMap: Record<string, FieldRole> = {},
): Dashboard {
  const marketImports = latestBoardImports(imports.filter(isMarketImport));
  const genres = new Map<string, Bucket>(),
    adGenres = new Map<string, Bucket>(),
    tkGenres = new Map<string, Bucket>(),
    platforms = new Map<string, Bucket>(),
    platformBoards = new Map<string, Bucket>(),
    adPlatforms = new Map<string, Bucket>(),
    tkChannels = new Map<string, Bucket>(),
    genrePairs = new Map<string, Bucket>(),
    works = new Map<string, Work>(),
    fields = new Set<string>(),
    datasets: Dataset[] = [],
    genreSources = new Map<string, Set<string>>(),
    genreWorkKeys = new Set<string>(),
    genrePairWorkKeys = new Set<string>(),
    adGenreWorkKeys = new Set<string>(),
    tkGenreWorkKeys = new Set<string>();
  const add = (map: Map<string, Bucket>, name: string, heat: number | null) => {
    if (!name) return;
    const value = map.get(name) || { name, value: 0, heat: 0 };
    value.value += 1;
    value.heat += heat || 0;
    map.set(name, value);
  };
  for (const source of marketImports) {
    const signal = signalForFile(source.file_name, source.columns),
      seen = new Set<string>();
    let sumHeat = 0;
    let hasHeat = false;
    let aiRows = 0;
    let rowOrdinal = 0;
    const sampledRows = sampleMarketRows(source.raw_rows || [], periodKindFor(source.period_label || ""), row => {
      const rankKey = mappedKeyFor(row, RANK, fieldRoleMap, "rank");
      return rankKey ? numeric(row[rankKey]) : null;
    });
    for (const row of sampledRows) {
      const stableRowKey = `${source.id}:${rowOrdinal++}`;
      const titleKey = mappedKeyFor(row, TITLE, fieldRoleMap, "title"),
        titleCnKey = keyFor(row, TITLE_CN),
        genreKey = mappedKeyFor(row, GENRE, fieldRoleMap, "genre"),
        platformKeys = mappedKeysFor(row, PLATFORM, fieldRoleMap, "platform"),
        rankKey = mappedKeyFor(row, RANK, fieldRoleMap, "rank"),
        heatKey = signal === "tk" || signal === "platform" ? keyFor(row, /^播放增量$/) : signal === "ad" ? keyFor(row, /^预估曝光$/) : undefined;
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
          ...new Set([
            ...(signal === "platform" ? [platformForFile(source.file_name)] : []),
            ...platformKeys
              .map((key) => text(row[key]))
              .filter(Boolean)
              .map((value) => platformName(value, signal, platformAliasMap))
              .filter(Boolean),
          ]),
        ],
        platform =
          rowPlatforms[0] ||
          (signal === "tk" ? "未标注剧场号" : "未标注平台"),
        rank = rankKey ? numeric(row[rankKey]) : null,
        heat = heatKey ? numeric(row[heatKey]) : null;
      const genreWorkKey = normalizedTitle || stableRowKey;
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
        const uniqueGenreKey = `${item}:${genreWorkKey}`;
        if (!genreWorkKeys.has(uniqueGenreKey)) {
          add(genres, item, heat);
          genreWorkKeys.add(uniqueGenreKey);
        }
        if (signal === "ad" && !adGenreWorkKeys.has(uniqueGenreKey)) {
          add(adGenres, item, heat);
          adGenreWorkKeys.add(uniqueGenreKey);
        }
        if (signal === "tk" && !tkGenreWorkKeys.has(uniqueGenreKey)) {
          add(tkGenres, item, heat);
          tkGenreWorkKeys.add(uniqueGenreKey);
        }
        const sources = genreSources.get(item) || new Set<string>();
        sources.add(source.id);
        genreSources.set(item, sources);
      });
      normalizedTags.slice(0, 8).forEach((first, index) =>
        normalizedTags.slice(index + 1, 8).forEach((second) => {
          const pairName = [first, second].sort((a, b) => a.localeCompare(b, "zh-CN")).join(" × ");
          const pairKey = `${pairName}:${genreWorkKey}`;
          if (!genrePairWorkKeys.has(pairKey)) {
            add(genrePairs, pairName, heat);
            genrePairWorkKeys.add(pairKey);
          }
        }),
      );
      rowPlatforms.forEach((item) => {
        add(platforms, item, heat);
        if (signal === "platform") add(platformBoards, item, heat);
        if (signal === "ad") add(adPlatforms, item, heat);
        if (signal === "tk") add(tkChannels, item, heat);
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
            boardKey: marketBoardKey(source.source_name, source.file_name),
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
      boardKey: marketBoardKey(source.source_name, source.file_name),
      name: source.file_name,
      period: source.period_label || "未标记统计期",
      rows: source.row_count,
      aiRows,
      sampledRows: sampledRows.length,
      works: seen.size,
      heat: hasHeat ? sumHeat : null,
      signal:
        signal === "ad"
          ? "素材/投放势能"
          : signal === "tk"
            ? "热播/扩散势能"
          : signal === "platform" ? "平台播放增量" : "市场样本",
      heatLabel:
        signal === "ad"
          ? "预估曝光合计"
          : signal === "tk" || signal === "platform"
            ? "播放增量合计"
            : "热度合计",
    });
  }
  const order = (map: Map<string, Bucket>) =>
    [...map.values()]
      .sort((a, b) => b.value - a.value || b.heat - a.heat);
  const allWorks = [...works.values()],
    signalsByTitle = new Map<string, Set<Signal>>();
  allWorks.forEach((item) => {
    const signals = signalsByTitle.get(item.titleKey) || new Set<Signal>();
    signals.add(item.signal);
    signalsByTitle.set(item.titleKey, signals);
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
    [...signalsByTitle]
      .filter(([, signals]) => signals.has("ad") && signals.has("tk"))
      .map(([key]) => key),
  );
  return {
    works: sortedWorks,
    genres: order(genres),
    adGenres: order(adGenres),
    tkGenres: order(tkGenres),
    platforms: order(platforms),
    platformBoards: order(platformBoards),
    adPlatforms: order(adPlatforms),
    tkChannels: order(tkChannels),
    genrePairs: order(genrePairs),
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
  const { ideas, addIdea } = useIdeas();
  const fileRef = useRef<HTMLInputElement>(null);
  const chineseNameFileRef = useRef<HTMLInputElement>(null);
  const externalSignalFileRef = useRef<HTMLInputElement>(null);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${previousMonth.getFullYear()}年${previousMonth.getMonth() + 1}月`;
  });
  const [comparisonChoice, setComparisonChoice] = useState("");
  const { imports, loading, metadataLoading, error, addImport, deleteImport, refetch } = useMarketDataImports(period, comparisonChoice);
  const initialPeriodResolved = useRef(false);
  const [activeView, setActiveView] = useState<MarketView>("overview");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("works");
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [uploadPeriodKind, setUploadPeriodKind] = useState<PeriodKind>("month");
  const [uploadPeriod, setUploadPeriod] = useState(() => defaultUploadPeriod("month"));
  const [uploading, setUploading] = useState(false);
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [uploadingExternal, setUploadingExternal] = useState(false);
  const [externalSource, setExternalSource] = useState("TikTok话题");
  const [translating, setTranslating] = useState(false);
  const [message, setMessage] = useState("");
  const [lastImportAudit, setLastImportAudit] = useState<ImportAudit[]>([]);
  const [importExpanded, setImportExpanded] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
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
  const [fieldRoleMap, setFieldRoleMap] = useState<Record<string, FieldRole>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("market-data-field-role-map");
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
            .filter(isMarketImport)
            .map((item) => item.period_label)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort(comparePeriods),
    [imports],
  );
  useEffect(() => {
    if (metadataLoading || initialPeriodResolved.current) return;
    initialPeriodResolved.current = true;
    const capturedPeriod = localStorage.getItem("market-data-captured-period");
    const latestImportedPeriod = periodOptions.find(option => periodKindFor(option) === "month") || periodOptions[0];
    const target = capturedPeriod && periodOptions.includes(capturedPeriod) ? capturedPeriod : latestImportedPeriod;
    const timer = target
      ? window.setTimeout(() => setPeriod(target), 0)
      : undefined;
    if (capturedPeriod) localStorage.removeItem("market-data-captured-period");
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [metadataLoading, periodOptions]);
  const periodImports = useMemo(
    () => activeImportsForPeriod(imports, period),
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
        fieldRoleMap,
      ),
    [
      periodImports,
      syncedChineseNameMap,
      titleAliasMap,
      platformAliasMap,
      genreAliasMap,
      fieldRoleMap,
    ],
  );
  const comparablePeriods = periodOptions.filter(p => periodKindFor(p) === periodKindFor(period) && p !== period);
  const previousPeriod = comparablePeriods.includes(comparisonChoice) ? comparisonChoice : comparablePeriods.filter(p => periodNumber(p) < periodNumber(period)).sort(comparePeriods)[0] || "";
  const currentBoards = useMemo(() => boardSamples(periodImports.filter(isMarketImport), periodKindFor(period)), [periodImports, period]);
  const previousBoards = boardSamples(activeImportsForPeriod(imports, previousPeriod).filter(isMarketImport), periodKindFor(period));
  const boardComparisons = compareBoards(currentBoards, previousBoards);
  const marketResearch = buildMarketResearch(currentBoards, boardComparisons);
  const periodGroups = useMemo(
    () => ({
      month: periodOptions.filter((item) => periodKindFor(item) === "month").sort(comparePeriods),
      week: periodOptions.filter((item) => periodKindFor(item) === "week").sort(comparePeriods),
      day: periodOptions.filter((item) => periodKindFor(item) === "day").sort(comparePeriods),
    }),
    [periodOptions],
  );
  const versionOptions = useMemo(() => {
    const versionIds = [
      ...new Set(
        imports
          .filter((item) => item.period_label === period && isMarketImport(item))
          .map(versionIdFor),
      ),
    ];
    return versionIds.map((versionId) => {
      const marker = imports.find(
        (item) =>
          item.period_label === period &&
          item.source_name === `${VERSION_MARKER_PREFIX}${versionId}` &&
          item.raw_rows?.[0]?.label,
      );
      return {
        value: versionId,
        label:
          versionId === "legacy"
            ? "初始版本"
            : text(marker?.raw_rows?.[0]?.label) || versionId,
      };
    });
  }, [imports, period]);
  const uploadMonthOptions = useMemo(() => {
    const now = new Date();
    const generated = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + 3 - index, 1);
      return `${date.getFullYear()}年${date.getMonth() + 1}月`;
    });
    return [...new Set([...periodGroups.month, ...generated])].sort(comparePeriods);
  }, [periodGroups.month]);
  const changePeriodKind = (kind: PeriodKind) => {
    const target = periodGroups[kind][0];
    if (target) setPeriod(target);
  };
  const changeUploadPeriodKind = (kind: PeriodKind) => {
    setUploadPeriodKind(kind);
    setUploadPeriod(defaultUploadPeriod(kind));
  };
  const switchVersion = async (versionId: string) => {
    if (!versionId || versionId === activeVersionFor(imports, period)) return;
    setSwitchingVersion(true);
    try {
      await addImport({
        source_name: `${VERSION_MARKER_PREFIX}${versionId}`,
        period_label: period,
        file_name: `切换版本_${versionId}.json`,
        row_count: 0,
        columns: ["version_id", "label"],
        raw_rows: [{ version_id: versionId, label: versionId === "legacy" ? "初始版本" : versionId }],
      });
      setMessage(`已切换“${period}”的数据版本。历史文件仍然保留。`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "切换数据版本失败");
    } finally {
      setSwitchingVersion(false);
    }
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
  const saveFieldRole = (field: string, role: FieldRole | "") => {
    const next = { ...fieldRoleMap };
    if (role) next[field] = role;
    else delete next[field];
    setFieldRoleMap(next);
    localStorage.setItem("market-data-field-role-map", JSON.stringify(next));
    setMessage(role ? `已将字段“${field}”指定为“${FIELD_ROLE_LABELS[role]}”，看板已重新计算。` : `已取消字段“${field}”的手动映射，恢复自动识别。`);
  };
  const availableSourceFields = useMemo(
    () => [...new Set(periodImports.filter(isMarketImport).flatMap((item) => item.columns))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [periodImports],
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
  const assetRanking = useMemo<AssetRankRow[]>(() => periodImports
    .filter((item) => isMarketImport(item) && item.raw_rows.some((row) => mappedKeyFor(row, MATERIAL_COUNT, fieldRoleMap, "materialCount")))
    .flatMap((item) => item.raw_rows.flatMap((row) => {
      const countKey = mappedKeyFor(row, MATERIAL_COUNT, fieldRoleMap, "materialCount");
      const titleKey = mappedKeyFor(row, TITLE, fieldRoleMap, "title");
      if (!countKey || !titleKey || !text(row[titleKey])) return [];
      const newCountKey = keyFor(row, NEW_MATERIAL_COUNT);
      const impressionKey = keyFor(row, /预估曝光|曝光量|impressions/i);
      const genreKey = mappedKeyFor(row, GENRE, fieldRoleMap, "genre");
      const genre = genreKey ? text(row[genreKey]) : "未标注题材";
      if (!genre.split(/[、,，/]/).map((item) => item.trim()).includes("AI仿真人")) return [];
      const platformKeys = mappedKeysFor(row, PLATFORM, fieldRoleMap, "platform");
      return [{ title: text(row[titleKey]), genre, totalMaterials: numeric(row[countKey]) || 0, newMaterials: newCountKey ? numeric(row[newCountKey]) : null, impressions: impressionKey ? numeric(row[impressionKey]) : null, platform: platformKeys.map((key) => platformName(text(row[key]), "ad", platformAliasMap)).filter(Boolean).join("、") || "未标注平台", source: item.file_name }];
    }))
    .sort((a, b) => b.totalMaterials - a.totalMaterials)
    .slice(0, 50), [periodImports, fieldRoleMap, platformAliasMap]);
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
  const researchTitle = (item: ResearchFinding) => `市场研究｜${period}｜${item.title}`;
  const researchSaved = (item: ResearchFinding) => savedTitles.has(normalizeTitle(researchTitle(item)));
  const saveResearch = async (item: ResearchFinding) => {
    if (researchSaved(item) || savingIdea) return;
    setSavingIdea(item.id);
    try {
      await addIdea({
        title: researchTitle(item), source: `市场研判 · ${period} 对比 ${previousPeriod || "无历史"}`,
        market: "目标市场待核验", genre: item.genre, status: "待评估",
        notes: ["研究建议，未经剧情及商业效果验证。", ...item.facts, `判断：${item.judgment}`, `开发：${item.development}`, `投放测试：${item.advertising}`, `复核条件：${item.validation}`, ...item.cautions, ...item.cases.map(c => `对标：${c.title}｜${c.period}｜${c.source}｜原榜${c.rank}｜${c.metric} ${c.value ?? "未提供"}｜${c.channel}｜${c.regions}`)].join("\n"),
      });
      setMessage(`已保存“${item.genre}”研究方向到选题情报，状态为待评估。`);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "保存研究方向失败"); }
    finally { setSavingIdea(""); }
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
            : work.signal === "platform" ? "平台播放增量" : "市场样本",
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
        { 项目: "对比期", 内容: previousPeriod || "无历史数据" },
        ...marketResearch.findings.map(f => ({ 项目: f.title, 内容: [f.facts.join("；"), f.judgment, f.development].join("\n") })),
        { 项目: "证据缺口", 内容: marketResearch.limitations.join("\n") },
        { 项目: "研究筛选规则", 内容: marketResearch.method },
        { 项目: "口径与风险", 内容: "每来源、每榜单日50/周300/月500；基于当前样本，不等于整个市场。广告预估曝光与TikTok播放增量分开呈现。" },
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
        信号判断: dashboard.sharedGenres.some((genre) => genre.name === item.name) ? "双来源共同题材" : "单来源信号",
      })),
      [8, 18, 15, 15, 16, 18, 20],
    );
    append(
      "重点作品",
      marketResearch.findings.flatMap(f => f.cases.map(c => ({ 研究方向: f.genre, 作品: c.title, 来源: c.source, 统计期: c.period, 原榜排名: c.rank, 指标: c.metric, 数值: c.value, 剧场号: c.channel, 国家Top3: c.regions, 说明: "同榜同标签按指标选取，剧情未核验，不代表跨榜同一作品" }))),
      [18, 42, 40, 16, 12, 16, 18, 24, 24, 50],
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
      "研究行动",
      marketResearch.findings.map(f => ({ 方向: f.title, 决定: f.decision, 榜单依据: f.facts.join("\n"), 判断: f.judgment, 开发动作: f.development, 投放测试: f.advertising, 复核条件: f.validation, 风险: f.cautions.join("\n") })),
      [32, 18, 70, 60, 70, 70, 70, 60],
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
            : work.signal === "platform" ? "平台播放增量" : "市场样本",
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
    setLastImportAudit([]);
    try {
      const parsedFiles: ParsedImportFile[] = [];
      for (const file of files) {
        const fileBuffer = await file.arrayBuffer();
        const isCsv = /\.csv$/i.test(file.name);
        const book = XLSX.read(isCsv ? new TextDecoder("utf-8").decode(fileBuffer) : fileBuffer, { type: isCsv ? "string" : "array", cellDates: false });
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "", raw: false });
        if (!rows.length) throw new Error(`“${file.name}”未读取到数据行，请确认第一张工作表包含表头和数据`);
        if (rows.length > 5000) throw new Error(`“${file.name}”超过单文件5,000行限制`);
        const filePlatform = platformForFile(file.name);
        const columns = Array.from(new Set([...rows.flatMap((row) => Object.keys(row)), ...(filePlatform && !rows.some((row) => keyFor(row, PLATFORM)) ? ["平台"] : [])]));
        const sourceRows = filePlatform && !rows.some((row) => keyFor(row, PLATFORM))
          ? rows.map((row) => ({ ...row, 平台: filePlatform }))
          : rows;
        const titleColumn = columns.find((column) => fieldRoleMap[column] === "title") || columns.find((column) => TITLE.test(column) && !TITLE_CN.test(column)) || "";
        const nonEmptyRows = sourceRows.filter((row) => Object.values(row).some((value) => text(value)));
        const validRows = titleColumn
          ? nonEmptyRows.filter((row) => text(row[titleColumn]))
          : nonEmptyRows;
        if (!validRows.length) throw new Error(`“${file.name}”没有可导入的有效数据行，请检查剧名或作品名称列`);
        const seenTitles = new Set<string>();
        let duplicateTitles = 0;
        if (titleColumn) {
          validRows.forEach((row) => {
            const normalized = normalizeTitle(text(row[titleColumn]));
            if (!normalized) return;
            if (seenTitles.has(normalized)) duplicateTitles += 1;
            else seenTitles.add(normalized);
          });
        }
        const detectedPeriod = detectPeriodLabel(file.name, book.SheetNames, rows);
        const targetPeriod = detectedPeriod || uploadPeriod.trim();
        if (!targetPeriod) throw new Error(`无法识别“${file.name}”的榜单周期，请先选择上传周期`);
        parsedFiles.push({
          fileName: file.name,
          targetPeriod,
          sourceRows,
          rows: validRows,
          columns,
          signal: signalForFile(file.name, columns),
          rawRows: rows.length,
          invalidRows: rows.length - validRows.length,
          duplicateTitles,
          titleColumn,
        });
      }

      if (importMode === "append") {
        const duplicate = parsedFiles.find((candidate) =>
          activeImportsForPeriod(imports, candidate.targetPeriod).some(
            (item) =>
              isMarketImport(item) &&
              item.file_name.trim().toLocaleLowerCase() === candidate.fileName.trim().toLocaleLowerCase() &&
              item.row_count === candidate.rows.length,
          ),
        );
        if (duplicate) {
          throw new Error(`“${duplicate.fileName}”已存在于${duplicate.targetPeriod}的当前版本中。若这是修订文件，请选择“新建版本”或“替换同类来源”。`);
        }
      }
      setPendingImport({ mode: importMode, files: parsedFiles });
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "导入失败，请检查文件格式",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };
  const updatePendingFile = (index: number, update: (item: ParsedImportFile) => ParsedImportFile) => {
    setPendingImport((current) => current ? { ...current, files: current.files.map((item, itemIndex) => itemIndex === index ? update(item) : item) } : current);
  };
  const confirmPendingImport = async () => {
    if (!pendingImport) return;
    const { files: parsedFiles, mode } = pendingImport;
    setUploading(true);
    setMessage("");
    try {
      if (mode === "replace") {
        const signalsByPeriod = new Map<string, Set<Signal>>();
        const platformsByPeriod = new Map<string, Set<string>>();
        parsedFiles.forEach((item) => {
          const signals = signalsByPeriod.get(item.targetPeriod) || new Set<Signal>();
          signals.add(item.signal);
          signalsByPeriod.set(item.targetPeriod, signals);
          if (item.signal === "platform") {
            const platforms = platformsByPeriod.get(item.targetPeriod) || new Set<string>();
            const platform = platformForFile(item.fileName);
            if (platform) platforms.add(platform);
            platformsByPeriod.set(item.targetPeriod, platforms);
          }
        });
        const affected = imports.filter((item) => {
          if (!item.period_label || !isMarketImport(item)) return false;
          const signals = signalsByPeriod.get(item.period_label);
          const existingSignal = signalFor(item.columns);
          const samePlatformFile = existingSignal === "platform" && platformsByPeriod.get(item.period_label)?.has(platformForFile(item.file_name));
          return Boolean((samePlatformFile || (existingSignal !== "platform" && signals?.has(existingSignal))) && versionIdFor(item) === activeVersionFor(imports, item.period_label));
        });
        if (affected.length > 0 && !window.confirm(`将替换 ${affected.length} 个当前版本中的同类数据文件，原文件记录会被删除。是否继续？`)) {
          setMessage("已取消替换，现有数据没有变化。");
          return;
        }
        for (const item of affected) await deleteImport(item.id);
      }

      const versionIds = new Map<string, string>();
      if (mode === "version") {
        const base = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        parsedFiles.forEach((item) => {
          if (!versionIds.has(item.targetPeriod)) versionIds.set(item.targetPeriod, `${base}-${periodNumber(item.targetPeriod)}`);
        });
      }

      let totalRows = 0;
      const targetPeriods = new Set<string>();
      for (const item of parsedFiles) {
        const activeVersion = activeVersionFor(imports, item.targetPeriod);
        const versionId = versionIds.get(item.targetPeriod);
        const sourceName = versionId ? `${DATA_VERSION_PREFIX}${versionId}` : activeVersion === "legacy" ? "ADX" : `${DATA_VERSION_PREFIX}${activeVersion}`;
        await addImport({
          source_name: sourceName,
          period_label: item.targetPeriod,
          file_name: item.fileName,
          row_count: item.rows.length,
          columns: [...item.columns.filter((column) => !column.startsWith(SIGNAL_OVERRIDE_PREFIX)), `${SIGNAL_OVERRIDE_PREFIX}${item.signal}`],
          raw_rows: item.rows,
        });
        totalRows += item.rows.length;
        targetPeriods.add(item.targetPeriod);
      }

      if (mode === "version") {
        for (const [targetPeriod, versionId] of versionIds) {
          await addImport({
            source_name: `${VERSION_MARKER_PREFIX}${versionId}`,
            period_label: targetPeriod,
            file_name: `版本_${versionId}.json`,
            row_count: 0,
            columns: ["version_id", "label", "file_count"],
            raw_rows: [{ version_id: versionId, label: `${targetPeriod} · ${new Date().toLocaleString("zh-CN")}`, file_count: parsedFiles.filter((item) => item.targetPeriod === targetPeriod).length }],
          });
        }
      }

      const recognized = [...targetPeriods];
      if (recognized.length === 1) setPeriod(recognized[0]);
      const nextFieldRoleMap = { ...fieldRoleMap };
      parsedFiles.forEach((item) => {
        if (item.titleColumn) nextFieldRoleMap[item.titleColumn] = "title";
      });
      setFieldRoleMap(nextFieldRoleMap);
      localStorage.setItem("market-data-field-role-map", JSON.stringify(nextFieldRoleMap));
      const action = mode === "version" ? "建立新版本" : mode === "replace" ? "替换同类来源" : "追加";
      setMessage(`已${action}：${parsedFiles.length} 个文件、${totalRows.toLocaleString()} 行数据，归入 ${recognized.join("、")}。`);
      setLastImportAudit(parsedFiles.map((item) => ({ fileName: item.fileName, period: item.targetPeriod, signal: item.signal, rawRows: item.rawRows, importedRows: item.rows.length, invalidRows: item.invalidRows, duplicateTitles: item.duplicateTitles, titleColumn: item.titleColumn })));
      setPendingImport(null);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "导入失败，请稍后重试");
    } finally {
      setUploading(false);
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
          description="日榜发现信号，周榜验证持续性，月榜形成方向判断。每个来源、每个榜单分别采样，再合并作品与证据。"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="bg-[#c9f45a] text-[#173f31] hover:bg-[#d8ff76]" onClick={() => { setActiveView("data"); setImportExpanded(true); }}>采集 / 上传数据</Button>
              {dashboard.datasets.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || !!error} onClick={exportMonthlyBrief}
                  className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                >
                  <FileDown className="mr-1.5 h-4 w-4" />
                  导出本期简报
                </Button>
              )}
            </div>
          }
        />
        <MarketViewTabs activeView={activeView} onChange={setActiveView} />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7e4c8] bg-white p-4">
          <div><p className="text-sm font-semibold text-[#173f31]">每来源 · 每榜单：日50 / 周300 / 月500</p><p className="mt-1 text-xs text-muted-foreground">按原榜排名先取TopN，再分析其中AI仿真人条目；不会向榜外补足AI数量。</p></div>
          <label className="flex items-center gap-2 text-xs text-[#61766b]">统计期
            <select aria-label="监测统计期" value={periodOptions.includes(period) ? period : ""} onChange={(event) => setPeriod(event.target.value)} className="h-9 max-w-full rounded-lg border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31]">
              <option value="" disabled>暂无已导入周期</option>
              {periodOptions.filter(option => periodKindFor(option) === periodKindFor(period)).map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="rounded-2xl border border-[#d7e4c8] bg-white p-4 text-xs">
          <label className="flex flex-wrap items-center gap-2">对比统计期
            <select aria-label="对比统计期" value={previousPeriod} onChange={e=>setComparisonChoice(e.target.value)} className="max-w-full rounded-lg border border-[#c8d9bc] bg-white p-2"><option value="">暂无对比期</option>{comparablePeriods.map(p=><option key={p} value={p}>{p}</option>)}</select>
            <span>{boardComparisons.filter(c=>!c.reason).length}个榜单可独立比较 · 原始快照口径待核验</span>
            <Button size="sm" variant="ghost" onClick={()=>{setActiveView("analysis");setAnalysisMode("trends")}}>查看分榜比较</Button>
          </label>
          <details className="mt-3"><summary className="cursor-pointer font-medium text-[#315f4a]">查看采样范围与数据质量</summary><p className="mt-2 leading-6">旧版先筛AI再取TopN；现在先取原榜TopN，AI数量下降可能来自取样修正，不代表市场回落。榜单排名、播放和素材分别解释，海外榜不直接代表北美。</p>{currentBoards.map(b=><div key={b.key} className="mt-2 border-t pt-2"><p className="break-all">{b.name}：原榜{b.rows.length}条，其中AI {b.ai.length}条；指标：{b.metric||'未识别'}</p>{b.issues.map((issue,i)=><p key={i} className="mt-1 text-amber-800">{issue}</p>)}</div>)}</details>
        </div>
        {activeView === "data" && <>
        <section className="overflow-hidden rounded-2xl border border-[#cfe0bf] bg-gradient-to-br from-[#f7fbef] via-white to-[#eef7e7] shadow-[0_16px_40px_rgba(23,63,49,0.07)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#dce9d2] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#173f31] text-[#d8ff74] shadow-sm">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-[#173f31]">榜单数据导入与校验</h2>
                <p className="mt-1 text-xs leading-5 text-[#61766b]">月榜/周榜/日榜均可从此处导入；展开后配置上传与查看校验结果。</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">当前周期 {periodImports.filter(isMarketImport).length} 个文件</Badge>
              <Button size="sm" variant="outline" onClick={() => setImportExpanded((value) => !value)} aria-expanded={importExpanded}>
                {importExpanded ? "收起导入区" : "展开导入区"}
              </Button>
            </div>

          </div>
          {importExpanded && <>
          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.15fr_1fr_1fr_auto] lg:items-end">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-[#456052]">1. 选择榜单类型</span>
              <div className="grid grid-cols-3 rounded-xl border border-[#c8d9bc] bg-white p-1" role="tablist" aria-label="上传榜单类型">
                {(["day", "week", "month"] as PeriodKind[]).map((kind) => (
                  <button key={kind} type="button" role="tab" aria-selected={uploadPeriodKind === kind} onClick={() => changeUploadPeriodKind(kind)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${uploadPeriodKind === kind ? "bg-[#173f31] text-white shadow-sm" : "text-[#61766b] hover:bg-[#f2f7ec]"}`}>
                    {kind === "month" ? "月榜" : kind === "week" ? "周榜" : "日榜"}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-[#456052]">2. 选择上传周期</span>
              {uploadPeriodKind === "month" ? (
                <select value={uploadPeriod} onChange={(event) => setUploadPeriod(event.target.value)} aria-label="选择上传月份" className="h-11 rounded-xl border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31] outline-none focus:ring-2 focus:ring-[#b6dc61]">
                  {uploadMonthOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input type={uploadPeriodKind === "week" ? "week" : "date"} value={uploadInputValue(uploadPeriod, uploadPeriodKind)} onChange={(event) => setUploadPeriod(uploadPeriodFromInput(event.target.value, uploadPeriodKind))} aria-label={uploadPeriodKind === "week" ? "选择上传周" : "选择上传日期"} className="h-11 rounded-xl border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31] outline-none focus:ring-2 focus:ring-[#b6dc61]" />
              )}
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-[#456052]">3. 选择导入方式</span>
              <select value={importMode} onChange={(event) => setImportMode(event.target.value as ImportMode)} aria-label="选择导入方式" className="h-11 rounded-xl border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31] outline-none focus:ring-2 focus:ring-[#b6dc61]">
                <option value="append">追加数据</option>
                <option value="version">新建版本</option>
                <option value="replace">替换同类来源</option>
              </select>
            </label>
            <div>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void importFile(event)} />
              <Button disabled={uploading || !uploadPeriod} onClick={() => fileRef.current?.click()} title="可同时选择一个或多个文件" className="h-11 w-full bg-[#c9f45a] px-5 font-semibold text-[#102a21] shadow-sm hover:bg-[#d8ff74] lg:w-auto">
                {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                {uploading ? "导入中" : `上传${uploadPeriodKind === "month" ? "月榜" : uploadPeriodKind === "week" ? "周榜" : "日榜"}`}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dce9d2] bg-white/65 px-5 py-3 text-xs text-[#61766b]">
            <span>
              {importMode === "append"
                ? "追加数据：保留当前版本已有文件，适合补传同周期的另一张榜单。"
                : importMode === "version"
                  ? "新建版本：保留历史版本，新上传文件成为该周期的活动版本。"
                  : "替换同类来源：仅替换当前版本中同周期、同信号类型的文件，操作前会再次确认。"}
              <span className="ml-2 text-[#819087]">识别不到周期时，将归入 {uploadPeriod}。</span>
            </span>
            <div className="flex items-center gap-2">
            {versionOptions.length > 1 && (
              <label className="flex items-center gap-2">
                <span>查看版本</span>
                <select
                  value={activeVersionFor(imports, period)}
                  disabled={switchingVersion}
                  onChange={(event) => void switchVersion(event.target.value)}
                  aria-label="切换数据版本"
                  className="h-8 max-w-64 rounded-lg border bg-background px-2 text-xs text-foreground"
                >
                  {versionOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
            <Badge variant="outline">
              当前版本：{activeVersionFor(imports, period) === "legacy" ? "初始版本" : activeVersionFor(imports, period)}
            </Badge>
          </div>
          </div>
          </>}
        </section>
        {pendingImport && (
          <section className="overflow-hidden rounded-2xl border-2 border-[#aeca86] bg-white shadow-[0_18px_45px_rgba(23,63,49,0.10)]" aria-labelledby="import-preview-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dce9d2] bg-[#f5faec] px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#c9f45a] text-[#173f31]">写入前检查</Badge>
                  <h2 id="import-preview-title" className="font-semibold text-[#173f31]">请确认本次导入</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#61766b]">以下数据仍在本地预览，尚未写入市场数据库。确认周期和字段无误后再导入。</p>
              </div>
              <Badge variant="outline">{pendingImport.mode === "append" ? "追加数据" : pendingImport.mode === "version" ? "新建版本" : "替换同类来源"}</Badge>
            </div>
            <div className="divide-y divide-[#edf2e9]">
              {pendingImport.files.map((item, index) => {
                const kind = periodKindFor(item.targetPeriod);
                return (
                  <div key={`${item.fileName}-${index}`} className="space-y-4 px-5 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-[#173f31]" title={item.fileName}>{item.fileName}</p>
                      <span className="text-[11px] text-[#708077]">可在写入前修正识别结果</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-1.5 text-xs text-[#61766b]">
                        <span>周期类型</span>
                        <select value={kind} onChange={(event) => updatePendingFile(index, (current) => ({ ...current, targetPeriod: defaultUploadPeriod(event.target.value as PeriodKind) }))} className="h-10 rounded-lg border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31]">
                          <option value="day">日榜</option>
                          <option value="week">周榜</option>
                          <option value="month">月榜</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs text-[#61766b]">
                        <span>统计周期</span>
                        <input type={kind === "month" ? "month" : kind === "week" ? "week" : "date"} value={uploadInputValue(item.targetPeriod, kind)} onChange={(event) => updatePendingFile(index, (current) => ({ ...current, targetPeriod: uploadPeriodFromInput(event.target.value, kind) }))} className="h-10 rounded-lg border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31]" aria-label={`修正${item.fileName}的统计周期`} />
                      </label>
                      <label className="grid gap-1.5 text-xs text-[#61766b]">
                        <span>榜单信号</span>
                        <select value={item.signal} onChange={(event) => updatePendingFile(index, (current) => ({ ...current, signal: event.target.value as Signal }))} className="h-10 rounded-lg border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31]" aria-label={`修正${item.fileName}的榜单信号`}>
                          <option value="ad">投放榜</option>
                          <option value="tk">播放榜</option>
                        <option value="platform">平台播放榜</option>
                          <option value="other">综合榜/其他</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-xs text-[#61766b]">
                        <span>作品字段</span>
                        <select value={item.titleColumn} onChange={(event) => updatePendingFile(index, (current) => revalidateImportFile(current, event.target.value))} className={`h-10 rounded-lg border bg-white px-3 text-sm ${item.titleColumn ? "border-[#c8d9bc] text-[#173f31]" : "border-amber-300 text-amber-700"}`} aria-label={`修正${item.fileName}的作品字段`}>
                          <option value="">未指定作品字段</option>
                          {item.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <AuditMetric label="原始行" value={item.rawRows} />
                      <AuditMetric label="将写入" value={item.rows.length} tone="good" />
                      <AuditMetric label="异常行" value={item.invalidRows} tone={item.invalidRows ? "warn" : "neutral"} />
                      <AuditMetric label="同表重名" value={item.duplicateTitles} tone={item.duplicateTitles ? "warn" : "neutral"} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dce9d2] bg-[#fbfcf9] px-5 py-4">
              <p className="text-xs text-[#61766b]">共 {pendingImport.files.length} 个文件，预计写入 {pendingImport.files.reduce((sum, item) => sum + item.rows.length, 0).toLocaleString()} 行。</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={uploading} onClick={() => setPendingImport(null)}>取消导入</Button>
                <Button disabled={uploading} onClick={() => void confirmPendingImport()} className="bg-[#173f31] text-white hover:bg-[#245744]">
                  {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleCheck className="mr-1.5 h-4 w-4" />}
                  {uploading ? "正在写入" : "确认写入数据库"}
                </Button>
              </div>
            </div>
          </section>
        )}
        {message && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${/^已(导入|追加|建立|替换)/.test(message) ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-800"}`}
          >
            {message}
          </p>
        )}
        {lastImportAudit.length > 0 && (
          <details className="group rounded-2xl border border-[#cfe0bf] bg-white shadow-[0_10px_30px_rgba(23,63,49,0.05)]">
            <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-[#315f4a]">上次导入校验结果 · {lastImportAudit.length} 个文件（点击展开）</summary>
          <section className="overflow-hidden border-t border-[#e2ebda]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2ebda] bg-[#f7fbef] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CircleCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="import-audit-title" className="text-sm font-semibold text-[#173f31]">导入校验结果</h2>
                  <p className="mt-0.5 text-xs text-[#61766b]">已核对周期、榜单信号、空行和同表重复作品。</p>
                </div>
              </div>
              <Badge className="bg-[#315f4a] text-white">{lastImportAudit.length} 个文件已写入</Badge>
            </div>
            <div className="divide-y divide-[#edf2e9]">
              {lastImportAudit.map((audit) => (
                <div key={`${audit.fileName}-${audit.period}`} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(90px,auto))] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#173f31]" title={audit.fileName}>{audit.fileName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{audit.period}</Badge>
                      <Badge variant="outline">{audit.signal === "ad" ? "投放榜" : audit.signal === "tk" ? "TikTok播放榜" : audit.signal === "platform" ? "平台播放榜" : "综合榜"}</Badge>
                    </div>
                  </div>
                  <AuditMetric label="原始行" value={audit.rawRows} />
                  <AuditMetric label="有效写入" value={audit.importedRows} tone="good" />
                  <AuditMetric label="异常行" value={audit.invalidRows} tone={audit.invalidRows ? "warn" : "neutral"} />
                  <AuditMetric label="同表重名" value={audit.duplicateTitles} tone={audit.duplicateTitles ? "warn" : "neutral"} />
                  <div className="text-xs text-[#61766b]">
                    <p>作品字段</p>
                    <p className="mt-1 max-w-28 truncate font-medium text-[#173f31]" title={audit.titleColumn || "未识别"}>{audit.titleColumn || "未识别"}</p>
                  </div>
                </div>
              ))}
            </div>
            {lastImportAudit.some((item) => item.invalidRows > 0 || item.duplicateTitles > 0 || !item.titleColumn) && (
              <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-800">
                <CircleOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>异常行已排除；同表重名仅作提示，不自动删除，因为可能是同一作品在不同平台或账号的有效记录。未识别作品字段的文件建议到“数据管理”检查字段映射。</span>
              </div>
            )}
          </section>
          </details>
        )}
        </>}
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>数据服务暂时没有响应：{error}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              重新连接
            </Button>
          </div>
        )}
        {periodOptions.length > 0 && !periodOptions.includes(period) && (
          <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            “{period}”尚未导入市场数据。请选择已有月份，或保持该月份后上传新榜单。
          </p>
        )}

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
        {!error && activeView === "overview" && <MonitorOverview data={dashboard} research={marketResearch} kind={periodKindFor(period)} period={period} loading={loading} onCollect={() => setActiveView("data")} onInspect={(mode) => { setActiveView("analysis"); setAnalysisMode(mode); }} />}
        {activeView === "analysis" && loading && <p role="status" className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">正在按需读取所选周期，完成后统一更新比较结果…</p>}
        {!loading && !error && activeView === "analysis" && (
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
                { value: "platform", label: "12个平台播放榜" },
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
                                    : work.signal === "platform" ? "平台播放" : "市场"}
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
                title="投放榜题材作品数"
                icon={Layers3}
                data={dashboard.adGenres}
                empty="导入广告投放榜后显示题材分布。"
              />
              <ChartCard
                title="TikTok榜题材作品数"
                icon={Layers3}
                data={dashboard.tkGenres}
                empty="导入TikTok热播榜后显示题材分布。"
              />
            </div>
            <GenreInsight dashboard={dashboard} />
          </div>
        )}
        {analysisMode === "materials" && (
          <AssetRankingPanel rows={assetRanking} />
        )}
        {analysisMode === "markets" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="投放样本中平台关联记录数"
                icon={BarChart3}
                data={dashboard.adPlatforms}
                empty="导入广告投放榜后显示平台覆盖。"
              />
              <ChartCard
                title="TikTok样本中剧场号记录数"
                icon={BarChart3}
                data={dashboard.tkChannels}
                empty="导入TikTok热播榜后显示剧场号覆盖。"
              />
            </div>
            <BoardPlatforms samples={currentBoards} />
            <MarketCoverageNote />
          </div>
        )}
        {analysisMode === "production" && (
          <div className="space-y-6">
            <MarketResearchPanel research={marketResearch} onSave={saveResearch} saved={researchSaved} saving={savingIdea} />
          </div>
        )}
        {analysisMode === "trends" && <BoardComparisons comparisons={boardComparisons} current={period} previous={previousPeriod} />}
        {analysisMode === "external" && (
          <ExternalSignalsPanel signals={externalSignals} source={externalSource} uploading={uploadingExternal} fileRef={externalSignalFileRef} onSourceChange={setExternalSource} onImport={importExternalSignals} onDownloadTemplate={downloadExternalSignalTemplate} />
        )}
          </div>
        )}
        {activeView === "data" && (
          <div className="space-y-6">
          <ADXCaptureGuide onImported={(nextMessage, nextPeriod) => { setMessage(nextMessage); setPeriod(nextPeriod); }} />
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
              <CardTitle className="text-base">市场信号分层</CardTitle>
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
        <details className="rounded-2xl border border-[#d7e4c8] bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#315f4a]">字段映射设置（高级） · 当前周期 {availableSourceFields.length} 个字段，手动修正 {Object.keys(fieldRoleMap).length} 项</summary>
          <Card className="rounded-t-none border-x-0 border-b-0 border-t border-[#d7e4c8] shadow-none">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">字段识别与手动映射</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">字段=Excel列名；系统根据列名猜它是作品名、播放增量、总素材数等。猜错时可手动指定，结果立即重算，不改原Excel也不用重新上传。</p>
            </div>
            <Badge variant="outline">已手动映射 {Object.keys(fieldRoleMap).length} 项</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableSourceFields.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {availableSourceFields.map((field) => {
                  const automaticRole = TITLE.test(field) && !TITLE_CN.test(field)
                    ? "作品名"
                    : GENRE.test(field)
                      ? "题材标签"
                      : PLATFORM.test(field)
                        ? "平台/渠道"
                        : RANK.test(field)
                          ? "榜单排名"
                          : HEAT.test(field)
                            ? "热度/播放/曝光"
                            : MATERIAL_COUNT.test(field)
                              ? "总素材数"
                              : MATERIAL.test(field)
                                ? "素材名称"
                                : "未识别";
                  return (
                    <label key={field} className={`grid gap-2 rounded-xl border p-3 ${fieldRoleMap[field] ? "border-[#aeca86] bg-[#f7fbef]" : "bg-white"}`}>
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium" title={field}>{field}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">自动：{automaticRole}</span>
                      </span>
                      <select value={fieldRoleMap[field] || ""} onChange={(event) => saveFieldRole(field, event.target.value as FieldRole | "")} aria-label={`设置字段${field}的含义`} className="h-9 rounded-lg border bg-background px-2 text-xs">
                        <option value="">使用自动识别</option>
                        {(Object.entries(FIELD_ROLE_LABELS) as [FieldRole, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Empty message="当前周期没有可映射字段。上传榜单后，源表字段会自动出现在这里。" />
            )}
            <div className="rounded-xl bg-[#f5f8f0] px-4 py-3 text-xs leading-5 text-[#536b5e]">
              当前识别到 {dashboard.fields.length} 个分析字段。手动映射只改变“这列按什么指标计算”；选择“使用自动识别”即可撤销。中文译名只用于团队阅读，不参与作品匹配。
            </div>
          </CardContent>
          </Card>
        </details>
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
function AuditMetric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="rounded-lg bg-[#f7f9f5] px-3 py-2 text-xs md:bg-transparent md:px-0 md:py-0">
      <p className="text-[#708077]">{label}</p>
      <p className={`mt-1 text-base font-semibold ${tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-[#173f31]"}`}>{value.toLocaleString()}</p>
    </div>
  );
}

function PeriodKindSwitch({ active, monthCount, weekCount, dayCount, onChange }: { active: PeriodKind; monthCount: number; weekCount: number; dayCount: number; onChange: (kind: PeriodKind) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold">榜单周期</p>
        <p className="mt-0.5 text-xs text-muted-foreground">日榜观察即时变化，周榜捕捉短期趋势，月榜判断市场结构；不同周期分别比较。</p>
      </div>
      <div role="tablist" aria-label="榜单周期" className="flex gap-1 rounded-lg bg-muted p-1">
        <button type="button" role="tab" aria-selected={active === "day"} disabled={!dayCount} onClick={() => onChange("day")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "day" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>日榜 · {dayCount}</button>
        <button type="button" role="tab" aria-selected={active === "week"} disabled={!weekCount} onClick={() => onChange("week")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "week" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>周榜 · {weekCount}</button>
        <button type="button" role="tab" aria-selected={active === "month"} disabled={!monthCount} onClick={() => onChange("month")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${active === "month" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"} disabled:opacity-40`}>月榜 · {monthCount}</button>
      </div>
    </div>
  );
}

const ADX_CAPTURE_BOOKMARKLET = `javascript:(()=>{const t=document.querySelector('table');if(!t){alert('当前页面没有找到可采集的ADX表格');return}const h=[...t.querySelectorAll('thead th')].map((x,i)=>x.innerText.trim()||('字段'+(i+1)));const rows=[...t.querySelectorAll('tbody tr')].map((tr,ri)=>Object.fromEntries([...tr.querySelectorAll('td')].map((td,i)=>[h[i]||('字段'+(i+1)),td.innerText.trim()||((i===0)?String(ri+1):'')])));const inputs=[...document.querySelectorAll('input')].map(x=>x.value).filter(Boolean);const payload={title:document.title,url:location.href,capturedAt:new Date().toISOString(),pageText:document.body.innerText.slice(0,5000),inputs,columns:h,rows};open('http://localhost:3000/market-data/adx-capture#'+encodeURIComponent(JSON.stringify(payload)),'_blank')})()`;

function ADXCaptureGuide({ onImported }: { onImported: (message: string, period: string) => void }) {
  const bookmarkRef = useRef<HTMLAnchorElement>(null);
  const [targetMonth, setTargetMonth] = useState("2026-08");
  const [status, setStatus] = useState<{ profileSaved?: boolean; profileExists?: boolean; authenticated?: boolean; lastSyncAt?: string; lastRows?: number; lastError?: string; apiError?: string }>({});
  const [working, setWorking] = useState<"connect" | "test" | "day" | "week" | "month" | "schedule" | "short-drama" | "tiktok-hot" | "platform" | null>(null);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState<{ enabled: boolean; nextRuns: string[]; recentRuns: { id: string; rankType: string; boardType?: string; platform?: string; period: string; attemptedAt: string; status: string; rows?: number; message: string }[] }>({ enabled: false, nextRuns: [], recentRuns: [] });
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const refreshStatus = async () => {
    const response = await fetch("/api/market-data/adx/status", { cache: "no-store" });
    if (response.ok) setStatus(await response.json());
    else setStatus((current) => ({ ...current, apiError: response.status === 401 ? "工作台登录已失效" : `本机状态读取失败（${response.status}）` }));
  };
  const refreshSchedule = async () => {
    const response = await fetch("/api/market-data/adx/schedule", { cache: "no-store" });
    if (response.ok) setSchedule(await response.json());
  };
  useEffect(() => {
    bookmarkRef.current?.setAttribute("href", ADX_CAPTURE_BOOKMARKLET);
    // Initial connector status synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
    void refreshSchedule();
  }, []);
  useEffect(() => {
    if (!status.profileExists || status.authenticated) return;
    const timer = window.setInterval(() => {
      void fetch("/api/market-data/adx/status", { cache: "no-store" }).then(async (response) => {
        if (response.ok) setStatus(await response.json());
      }).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status.profileExists, status.authenticated]);
  const connect = async () => {
    setWorking("connect"); setError("");
    try {
      const response = await fetch("/api/market-data/adx/connect", { method: "POST" });
      const result = await response.json() as { error?: string; authenticated?: boolean };
      if (!response.ok) throw new Error(result.error || "ADX连接失败");
      await refreshStatus();
      if (!result.authenticated) setError("ADX专用窗口已打开，但尚未验证登录。请在该窗口手动完成登录；登录成功后此处会更新状态。普通 Chrome 里的 ADX 登录不会自动共享给这个专用窗口。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX连接失败"); }
    finally { setWorking(null); }
  };
  const testCapture = async () => {
    setWorking("test"); setError("");
    try {
      const response = await fetch("/api/market-data/adx/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rankType: "week", dryRun: true }) });
      const result = await response.json() as { tested?: boolean; period?: string; rowCount?: number; error?: string };
      if (!response.ok || !result.tested || !result.rowCount || !result.period) throw new Error(result.error || "ADX测试抓取未完成");
      onImported(`ADX测试抓取成功：读取 ${result.rowCount.toLocaleString()} 条，周期 ${result.period}；仅验证、不导入。`, result.period);
      await refreshStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX测试抓取失败"); }
    finally { setWorking(null); }
  };
  const sync = async (rankType: PeriodKind) => {
    setWorking(rankType); setError("");
    try {
      const response = await fetch("/api/market-data/adx/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rankType }) });
      const result = await response.json() as { imported?: boolean; period?: string; rowCount?: number; error?: string };
      if (!response.ok || !result.imported || !result.rowCount || !result.period) throw new Error(result.error || "ADX没有返回有效数据或工作台没有确认写入");
      const rankLabel = rankType === "day" ? "日榜" : rankType === "month" ? "月榜" : "周榜";
      onImported(`ADX ${rankLabel}已抓取并写入工作台：${result.rowCount.toLocaleString()} 条，统计期 ${result.period}。`, result.period);
      await refreshStatus();
      await refreshStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX同步失败"); }
    finally { setWorking(null); }
  };
  const syncAugustBoard = async (boardType: "short-drama" | "tiktok-hot" | "platform") => {
    const [year, month] = targetMonth.split("-");
    const expectedPeriod = `${year}年${Number(month)}月`;
    const labels = { "short-drama": "短剧排行榜", "tiktok-hot": "TikTok短剧热播榜", platform: "12个平台榜" };
    setWorking(boardType); setError("");
    try {
      const requestSync = (dryRun: boolean) => fetch("/api/market-data/adx/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rankType: "month", boardType, expectedPeriod, dryRun }) });
      const testResponse = await requestSync(true);
      const testResult = await testResponse.json() as { tested?: boolean; period?: string; rowCount?: number; platformCount?: number; error?: string };
      if (!testResponse.ok || !testResult.tested || testResult.period !== expectedPeriod || (boardType === "platform" && testResult.platformCount !== 12)) {
        throw new Error(testResult.error || `${labels[boardType]}未通过全量验证，未执行导入。`);
      }
      const response = await requestSync(false);
      const result = await response.json() as { imported?: boolean; period?: string; rowCount?: number; platformCount?: number; completed?: { platform?: string; rows: number; skipped?: boolean }[]; expectedPlatformCount?: number; resumable?: boolean; error?: string };
      if (!response.ok || !result.imported || (boardType === "platform" && result.platformCount !== 12) || (!result.rowCount && !result.completed?.length) || result.period !== expectedPeriod) {
        const progress = result.resumable ? `；已完成 ${result.platformCount ?? result.completed?.length ?? 0}/${result.expectedPlatformCount ?? 12} 个平台，已完成项会在重试时跳过` : "";
        throw new Error((result.error || `${labels[boardType]}没有返回已核验的${expectedPeriod}数据`) + progress);
      }
      const extra = boardType === "platform" ? `，覆盖 ${result.platformCount ?? 0}/12 个平台` : "";
      const summary = result.rowCount ? `导入 ${result.rowCount.toLocaleString()} 条` : "该周期数据已存在，无需重复导入";
      onImported(`${result.period} ${labels[boardType]}${summary}${extra}。`, result.period);
      await refreshStatus();
    } catch (caught) { setError(caught instanceof Error ? caught.message : `${labels[boardType]}抓取失败`); }
    finally { setWorking(null); }
  };
  const updateSchedule = async (enabled: boolean) => {
    setWorking("schedule"); setError("");
    try {
      const response = await fetch("/api/market-data/adx/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, rulesConfirmed }) });
      const result = await response.json() as { enabled?: boolean; nextRuns?: string[]; recentRuns?: typeof schedule.recentRuns; error?: string };
      if (!response.ok) throw new Error(result.error || "ADX定时任务设置失败");
      setSchedule({ enabled: Boolean(result.enabled), nextRuns: result.nextRuns || [], recentRuns: result.recentRuns || [] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "ADX定时任务设置失败"); }
    finally { setWorking(null); }
  };
  return (
    <section className="rounded-2xl border border-[#cfe0bf] bg-[#f6f9f1] p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[280px] flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#173f31]">ADX 本地自动同步</p>
            {status.authenticated ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CircleCheck className="mr-1 h-3.5 w-3.5" />ADX登录已验证</Badge> : <Badge variant="outline"><CircleOff className="mr-1 h-3.5 w-3.5" />{status.profileExists ? "本地会话待验证" : "尚未连接"}</Badge>}
          </div>
          <p className="mt-1 text-xs leading-5 text-[#60766a]">工作台使用独立的本机 ADX 浏览器资料，不会继承普通 Chrome 标签页的登录。请先在“连接ADX账号”打开的专用窗口登录；不保存账号密码。日榜前50、周榜前300、月榜前500通过校验后由服务端直接写入当前工作台账号。</p>
          {status.lastSyncAt && <p className="mt-1 text-xs text-[#60766a]">最近同步：{new Date(status.lastSyncAt).toLocaleString("zh-CN")} · {status.lastRows?.toLocaleString()} 条</p>}
          {status.apiError && <p className="mt-1 text-xs text-amber-700">{status.apiError}</p>}
          {status.lastError && <p className="mt-1 text-xs text-amber-700">{status.lastError}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void connect()} disabled={working !== null}>{working === "connect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Database className="mr-1.5 h-4 w-4" />}{status.profileExists ? "打开ADX专用会话" : "连接ADX账号"}</Button>
          <Button size="sm" variant="outline" onClick={() => void testCapture()} disabled={working !== null}>{working === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}测试周榜抓取（不导入）</Button>
          <Button size="sm" onClick={() => void sync("day")} disabled={working !== null}>{working === "day" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}同步短剧日榜 · 前50</Button>
          <Button size="sm" onClick={() => void sync("week")} disabled={working !== null}>{working === "week" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}同步短剧周榜 · 前300</Button>
          <Button size="sm" onClick={() => void sync("month")} disabled={working !== null}>{working === "month" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-1.5 h-4 w-4" />}同步短剧月榜 · 前500</Button>
        </div>
      </div>
      <div className="mt-4 border-t border-[#dbe7d2] pt-4">
        <p className="text-sm font-semibold text-[#173f31]">指定月份补采</p>
        <p className="mt-1 text-xs leading-5 text-[#60766a]">先选自然月，再分别抓取三类榜单。每次导入前会校验 ADX 页面统计期；平台榜必须能拆分并验证12个平台，否则整批不导入。</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-[#456052]">目标月份 <input aria-label="ADX目标月份" type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} className="ml-2 h-9 rounded-lg border border-[#c8d9bc] bg-white px-3 text-sm text-[#173f31]" /></label>
          <Button size="sm" onClick={() => void syncAugustBoard("short-drama")} disabled={working !== null || !targetMonth}>{working === "short-drama" ? "抓取中…" : "抓取短剧排行榜 · Top500"}</Button>
          <Button size="sm" onClick={() => void syncAugustBoard("tiktok-hot")} disabled={working !== null || !targetMonth}>{working === "tiktok-hot" ? "抓取中…" : "抓取 TikTok 热播榜 · Top500"}</Button>
          <Button size="sm" onClick={() => void syncAugustBoard("platform")} disabled={working !== null || !targetMonth}>{working === "platform" ? "抓取中…" : "抓取 12 个平台榜 · 各Top500"}</Button>
        </div>
      </div>
      <details className="mt-3 border-t border-[#dbe7d2] pt-3">
        <summary className="cursor-pointer text-xs text-[#60766a]">定时同步设置与运行记录</summary>
        <div className="mt-3 rounded-xl border border-[#dbe7d2] bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#173f31]">{schedule.enabled ? "本机定时同步已启用" : "本机定时同步已暂停"}</p>
              <p className="mt-1 text-xs leading-5 text-[#60766a]">日榜每天 11:30，17:30 补采；周榜周二 11:30，周三补采；月榜每月 3 日 11:30，4 日补采。采集上一完整周期，仅最近一期漏采会补跑。Mac 需登录且唤醒；工作台页面无需打开。</p>
              {!status.authenticated && !schedule.enabled && <p className="mt-1 text-xs text-amber-700">启用前请打开 ADX 专用窗口并确认当前登录有效。</p>}
              {schedule.nextRuns.length > 0 && <p className="mt-1 text-xs text-[#60766a]">{schedule.nextRuns.join(" · ")}</p>}
            </div>
            <Button size="sm" variant={schedule.enabled ? "outline" : "default"} onClick={() => void updateSchedule(!schedule.enabled)} disabled={working !== null || (!schedule.enabled && (!rulesConfirmed || !status.authenticated))}>
              {working === "schedule" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{schedule.enabled ? "暂停定时任务" : "启用本机定时任务"}
            </Button>
          </div>
          {!schedule.enabled && <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#52685d]">
            <input type="checkbox" className="mt-1 accent-[#315f4a]" checked={rulesConfirmed} onChange={(event) => setRulesConfirmed(event.target.checked)} />
            <span>我已核对适用于本账号的 ADX 规则，并确认允许按上述频率通过登录会话同步榜单。若尚未确认，请保持定时任务关闭。</span>
          </label>}
          {schedule.recentRuns.length > 0 && <div className="mt-3 space-y-1 border-t border-[#e4ecdf] pt-2">
            <p className="text-xs font-semibold text-[#456052]">最近运行记录</p>
            {schedule.recentRuns.slice(0, 8).map((run) => <p key={run.id} className="text-xs leading-5 text-[#60766a]">{new Date(run.attemptedAt).toLocaleString("zh-CN")} · {run.platform ? `${run.platform}平台榜` : run.boardType === "tiktok-hot" ? "TK热播榜" : run.boardType === "short-drama" ? "短剧榜" : run.rankType === "day" ? "日榜" : run.rankType === "week" ? "周榜" : "月榜"} · {run.rankType === "day" ? "日" : run.rankType === "week" ? "周" : "月"} {run.period} · {run.status === "success" ? `成功 ${run.rows ?? 0} 条` : run.status === "skipped" ? "跳过" : `失败：${run.message}`}</p>)}
          </div>}
        </div>
      </details>
      <details className="mt-2 border-t border-[#dbe7d2] pt-3">
        <summary className="cursor-pointer text-xs text-[#60766a]">备用：页面书签采集（当前页前50条）</summary>
        <div className="mt-3"><a ref={bookmarkRef} href="#" draggable className="inline-flex h-9 cursor-grab items-center rounded-lg border bg-white px-4 text-sm font-semibold text-[#173f31] shadow-sm">拖到书签栏：同步到云霞</a></div>
      </details>
    </section>
  );
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
      label: "监测结论",
      description: "事实、判断与下一步",
    },
    {
      value: "analysis",
      label: "榜单与趋势",
      description: "题材、作品、素材、平台与趋势",
    },
    {
      value: "data",
      label: "数据采集",
      description: "来源、上传与数据校验",
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
    { value: "materials", label: "总素材数" },
    { value: "markets", label: "平台" },
    { value: "trends", label: "趋势" },
    { value: "production", label: "研究与行动" },
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
function AssetRankingPanel({ rows }: { rows: AssetRankRow[] }) {
  return (
    <section aria-labelledby="hot-materials-title" className="space-y-4">
      <div>
        <p className="section-kicker">ASSET SCALE · AD SIGNAL</p>
        <h3 id="hot-materials-title" className="mt-1 text-lg font-semibold">总素材数作品榜 Top 50</h3>
        <p className="mt-1 text-xs text-muted-foreground">按短剧榜“总素材数”降序；这是作品素材投放规模，不是单条广告创意素材排行。</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {rows.length ? (
            <div className="divide-y">
              {rows.map((item, index) => (
                <div key={`${item.source}:${item.title}`} className="grid gap-2 px-4 py-3 sm:grid-cols-[3rem_1.3fr_1fr_8rem] sm:items-center">
                  <span className="text-sm font-bold text-[#759950]">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="truncate text-[11px] text-muted-foreground">{item.genre} · {item.source}</p></div>
                  <div className="min-w-0"><p className="truncate text-xs">平台：{item.platform}</p><p className="truncate text-[11px] text-muted-foreground">{item.newMaterials === null ? "新素材数未提供" : `新素材 ${short(item.newMaterials)}`} · {item.impressions === null ? "曝光未提供" : `预估曝光 ${short(item.impressions)}`}</p></div>
                  <p className="text-right text-sm font-semibold text-[#315f4a]">{short(item.totalMaterials)} 条素材</p>
                </div>
              ))}
            </div>
          ) : <Empty message="当前周期没有包含“总素材数”的短剧榜。导入后将按作品素材投放规模生成Top 50。" />}
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
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">External evidence layer</p><h3 id="external-signals-title" className="mt-1 text-lg font-semibold">外部市场信号</h3><p className="mt-1 text-xs text-muted-foreground">用于验证ADX发现的题材与作品机会；来源口径不同，仅分开展示，不与ADX指标合并计算。</p></div><Badge variant="outline">旁证层 · 不混算</Badge></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4"><label className="grid gap-1.5"><span className="text-xs font-medium text-muted-foreground">信号来源</span><select value={source} onChange={(event) => onSourceChange(event.target.value)} className="h-9 min-w-48 rounded-lg border bg-background px-3 text-sm">{sources.map((item) => <option key={item}>{item}</option>)}</select></label><input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onImport} /><Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}{uploading ? "导入中" : "导入外部信号"}</Button><Button size="sm" variant="outline" onClick={onDownloadTemplate}><FileDown className="mr-1.5 h-4 w-4" />下载模板</Button><p className="min-w-[260px] flex-1 text-xs leading-5 text-muted-foreground">标准字段：话题或作品、指标、数值、环比变化、证据链接、备注。建议在备注中记录地区、采集日期和具体口径。</p></CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{sources.map((item) => <Card key={item}><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{item}</p><Badge variant={counts.get(item) ? "secondary" : "outline"}>{counts.get(item) || 0}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{counts.get(item) ? "本期已有旁证记录" : "本期尚未导入"}</p></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle className="text-base">本期外部证据记录</CardTitle></CardHeader><CardContent>{signals.length ? <div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-3 font-medium">来源</th><th className="pb-3 font-medium">话题或作品</th><th className="pb-3 font-medium">指标</th><th className="pb-3 text-right font-medium">数值</th><th className="pb-3 text-right font-medium">变化</th><th className="pb-3 pl-4 font-medium">证据</th></tr></thead><tbody>{signals.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="py-3"><Badge variant="outline">{item.source}</Badge></td><td className="max-w-[220px] truncate py-3 font-medium">{item.topic}</td><td className="py-3 text-muted-foreground">{item.metric}</td><td className="py-3 text-right">{item.value === null ? "—" : short(item.value)}</td><td className="py-3 text-right">{item.change || "—"}</td><td className="max-w-[280px] py-3 pl-4 text-xs text-muted-foreground">{/^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">查看来源</a> : item.note || "未附链接"}</td></tr>)}</tbody></table></div> : <Empty message="本期还没有外部信号。下载模板整理证据后导入，或后续接入正式API。" />}</CardContent></Card>
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
                12个平台榜按文件名归属；广告榜中未归一化的其他投放产品仍保留原名并等待确认。
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
                : work.signal === "platform" ? "平台播放增量信号" : "市场信号"}
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
  const days = periods.filter((item) => periodKindFor(item) === "day");
  const months = periods.filter((item) => periodKindFor(item) === "month");
  const weeks = periods.filter((item) => periodKindFor(item) === "week");
  return (
    <div className="rounded-xl border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">连续周期趋势准备度</p>
        <div className="flex gap-1"><Badge variant="outline">日榜 {days.length}</Badge><Badge variant="outline">周榜 {weeks.length}</Badge><Badge variant="outline">月榜 {months.length}</Badge></div>
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
          <div className="max-h-[480px] space-y-3 overflow-y-auto pr-2">
            <p className="text-xs leading-5 text-muted-foreground">按数量降序；平台/剧场号统计关联记录，题材统计同名去重作品。关联数不是用户数或市场份额。</p>
            {[...data].sort((a,b)=>b.value-a.value).map((item,index)=><div key={item.name} className="rounded-lg border border-[#e2eadb] p-3">
              <div className="flex justify-between gap-3 text-xs"><span className="min-w-0 break-words"><strong className="mr-2 text-[#315f4a]">{index+1}</strong>{item.name}</span><span className="shrink-0 font-semibold">{item.value.toLocaleString()}</span></div>
              <div className="mt-2 h-2 rounded-full bg-[#edf1e8]"><div className={`h-2 rounded-full ${index<3?'bg-[#173f31]':'bg-[#71947d]'}`} style={{width:`${item.value/Math.max(1,...data.map(d=>d.value))*100}%`}} /></div>
            </div>)}
          </div>
        ) : (
          <Empty message={empty} />
        )}
      </CardContent>
    </Card>
  );
}
