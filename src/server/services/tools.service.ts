// ---------------------------------------------------------------------------
// TOOLS service — the free tools page (столп 4): the content-plan generator,
// the Reels ideas and the hashtag picker for the TOURISM business. All three
// run on the same provider chain as the tutor (Z.ai GLM-4.5-flash → Gemini →
// …, see src/lib/ai.ts) and answer in the interface language of the visitor.
// The templates tool is static (no AI) — it lives on the client.
// ---------------------------------------------------------------------------

import { aiChat } from "@/lib/ai";
import { Lang } from "@/lib/i18n";

export type ToolKind = "content-plan" | "reels-ideas" | "hashtags";

const LANG_INSTRUCTION: Record<Lang, string> = {
  en: "Answer in English.",
  ru: "Отвечай на русском языке.",
  uz: "Javobni o'zbek tilida (lotin yozuvida) ber.",
};

const BUSINESS_LABEL: Record<Lang, string> = {
  en: "tourism business",
  ru: "туристический бизнес",
  uz: "turizm biznesi",
};

export async function runTool(kind: ToolKind, business: string, platform: string, lang: Lang, details: string) {
  const biz = (business || "").trim().slice(0, 200) || BUSINESS_LABEL[lang];
  const plat = (platform || "").trim().slice(0, 40);
  const det = (details || "").trim().slice(0, 1500);

  if (kind === "content-plan") {
    const system = `Ты — опытный SMM-маркетолог, который специализируется на туристическом бизнесе (отели, гостевые дома, гиды, турфирмы, рестораны при отелях). Ты составляешь контент-планы, которые реально приводят гостей.
${LANG_INSTRUCTION[lang]}
ФОРМАТ ОТВЕТА (строго): план на 7 дней, каждый день — строка вида:
День N — [Формат: Reels/Пост/Сторис/Карусель] — [тема] — [хук/идея в одной фразе] — [CTA]
Перед планом одна строка с общей стратегией недели. После плана — 3 коротких совета по съёмке на телефоне.`;
    const user = `Составь контент-план на неделю для: ${biz}${plat ? ` (платформа: ${plat})` : ""}${det ? `\nДетали: ${det}` : ""}`;
    return aiChat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.7, max_tokens: 1600 });
  }

  if (kind === "reels-ideas") {
    const system = `Ты — продюсер коротких видео для туристического бизнеса. Ты придумываешь идеи Reels/TikTok с сильными хуками в первые 2 секунды.
${LANG_INSTRUCTION[lang]}
ФОРМАТ ОТВЕТА (строго): ровно 8 идей, каждая — блок:
Идея N: [название]
Хук: [первые 2 секунды]
Сюжет: [что происходит в видео, 1-2 фразы]
CTA: [призыв в конце]`;
    const user = `Придумай 8 идей Reels для: ${biz}${det ? `\nДетали: ${det}` : ""}`;
    return aiChat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.8, max_tokens: 1600 });
  }

  // hashtags
  const system = `Ты — SMM-специалист по туризму в Узбекистане и Средней Азии. Ты подбираешь рабочие хештеги: микс локальных (город, страна), тематических (отель, тур, гастрономия) и нишевых с низкой конкуренцией.
${LANG_INSTRUCTION[lang]}
ФОРМАТ ОТВЕТА (строго): три группы по одной строке, хештеги через пробел:
Широкие (большой охват): #…
Средние (тематика): #…
Локальные (низкая конкуренция): #…
После групп — 2 коротких совета, как комбинировать хештеги.`;
    const user = `Подбери хештеги для: ${biz}${plat ? ` (платформа: ${plat})` : ""}${det ? `\nДетали: ${det}` : ""}`;
    return aiChat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.5, max_tokens: 900 });
}

export async function generateTool(
  kind: string,
  business: string,
  platform: string,
  lang: Lang,
  details: string
): Promise<string> {
  const k: ToolKind =
    kind === "reels-ideas" ? "reels-ideas" : kind === "hashtags" ? "hashtags" : "content-plan";
  const { text } = await runTool(k, business, platform, lang, details);
  return text || "";
}
