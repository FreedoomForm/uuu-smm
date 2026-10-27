// ---------------------------------------------------------------------------
// SMM AGENT service — the platform AUTOMATION agent that replaced the free
// tools page. One button in the top panel opens the agent sheet; the agent
// EXECUTES tasks instead of just chatting:
//   * content-plan — a ready week plan (the old tool)
//   * reels-ideas  — 8 ideas with hooks/plots/CTAs (the old tool)
//   * hashtags     — wide/medium/local groups (the old tool)
//   * event-tz     — the full ТЗ of an order as STRICT JSON; the client turns
//                    it into a real мероприятие with ONE tap (automation!)
// All four run on the same provider chain as the tutor (Z.ai GLM-4.5-flash →
// Gemini → …, see src/lib/ai.ts) and answer in the interface language.
// ---------------------------------------------------------------------------

import { aiChat } from "@/lib/ai";
import { Lang } from "@/lib/i18n";
import { runTool, ToolKind } from "@/server/services/tools.service";

export type AgentTask = "content-plan" | "reels-ideas" | "hashtags" | "event-tz";

const AGENT_TASKS: AgentTask[] = ["content-plan", "reels-ideas", "hashtags", "event-tz"];

// The platform categories the ТЗ can map onto (the same set SmmEvent keeps).
const CATEGORIES = ["instagram", "reels", "hotel-review", "photo", "content-plan", "blogger-tour", "other"];
const PLATFORMS = ["instagram", "telegram", "youtube", "tiktok"];

export interface AgentEventTz {
  title: string;
  summary: string;
  brief: string;
  category: string;
  platform: string;
  format: string;
  deadline: string;
  budget: string;
  restrictions: string;
}

export interface AgentResult {
  text: string;
  engine: string;
  data: AgentEventTz | null;
}

function coerceTz(raw: unknown): AgentEventTz | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const title = s(o.title, 120);
  const brief = s(o.brief, 4000);
  if (!title || !brief) return null;
  const category = CATEGORIES.includes(s(o.category, 40)) ? s(o.category, 40) : "other";
  const platform = PLATFORMS.includes(s(o.platform, 40)) ? s(o.platform, 40) : "";
  const format = s(o.format, 20) === "offline" ? "offline" : "online";
  return {
    title,
    summary: s(o.summary, 300) || title,
    brief,
    category,
    platform,
    format,
    deadline: s(o.deadline, 120),
    budget: s(o.budget, 120),
    restrictions: s(o.restrictions, 1000),
  };
}

/** Pull the first JSON object out of a model reply (```json fence or bare). */
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const TZ_LANG: Record<Lang, string> = {
  en: "Write the human-readable part in English.",
  ru: "Пояснения пиши на русском языке.",
  uz: "Izohlarni o'zbek tilida (lotin yozuvida) yoz.",
};

function tzSystem(lang: Lang): string {
  return `Ты — ИИ-агент платформы ТУРИЗМ × SMM, которая соединяет туристический бизнес (отели, гиды, турфирмы, рестораны) и SMM-специалистов. Ты составляешь ПОЛНОЕ ТЗ (техническое задание) на рекламный заказ для SMM-специалиста.
${TZ_LANG[lang]}
ОТВЕТ СТРОГО В ДВУХ ЧАСТЯХ:
1) Краткое пояснение (2-4 предложения, что заложено в ТЗ и почему).
2) Затем ОДИН блок \`\`\`json строго такой структуры (без комментариев внутри):
{
  "title": "название заказа (до 80 знаков)",
  "summary": "краткое описание для карточки (1 предложение)",
  "brief": "полное ТЗ: что снимать/публиковать, сколько единиц контента, ключевые сообщения, отметки локации и партнёров, сроки согласования",
  "category": "instagram | reels | hotel-review | photo | content-plan | blogger-tour | other",
  "platform": "instagram | telegram | youtube | tiktok",
  "format": "online | offline",
  "deadline": "срок текстом (например: до 15 ноября)",
  "budget": "оплата текстом (например: 1 500 000 сум или бартер за 2 ночи)",
  "restrictions": "ограничения и доп. условия"
}`;
}

async function runEventTz(business: string, details: string, lang: Lang) {
  const biz = (business || "").trim().slice(0, 200) || "туристический бизнес";
  const det = (details || "").trim().slice(0, 1500);
  const user = `Составь ТЗ рекламного заказа для: ${biz}${det ? `\nДетали от заказчика: ${det}` : ""}`;
  const res = await aiChat({
    messages: [
      { role: "system", content: tzSystem(lang) },
      { role: "user", content: user },
    ],
    temperature: 0.6,
    max_tokens: 1800,
  });
  const data = coerceTz(extractJson(res.text));
  return { ...res, data };
}

export async function smmAgent(
  task: string,
  business: string,
  platform: string,
  details: string,
  lang: Lang
): Promise<AgentResult> {
  const t: AgentTask = (AGENT_TASKS as string[]).includes(task) ? (task as AgentTask) : "content-plan";
  if (t === "event-tz") {
    const r = await runEventTz(business, details, lang);
    return { text: r.text || "", engine: r.engine, data: r.data };
  }
  const kind: ToolKind = t === "reels-ideas" ? "reels-ideas" : t === "hashtags" ? "hashtags" : "content-plan";
  const r = await runTool(kind, business, platform, lang, details);
  return { text: r.text || "", engine: r.engine, data: null };
}
