import type { AiFillErrorCode, AiProvider } from "../shared/schema.js";

/**
 * AI 공급자 호출.
 *
 * 두 곳에 키가 있고(`server/aiKeys.ts`) 둘 중 하나가 실패하면 다른 쪽으로 넘긴다.
 * 모델명과 타임아웃은 **이 파일의 상수 한 곳**에만 둔다.
 *
 * **아직 외부로 요청을 보내지 않는다.** 실제 키가 없어 확인할 수 없는 두 가지가
 * 남아 있어서, 그 부분은 `확인 전` 으로 표시해 두고 호출부만 만들었다.
 * 남은 항목은 `docs/TODO.md` 의 "AI 키·호출 설계" 아래에 적혀 있다.
 */

// ── 모델명 ────────────────────────────────────────────────
// **문서가 아니라 계정의 실제 목록을 기준으로 한다.**
// 2026-10-03 에 `GET /openai/v1/models` 로 확인했다. 문서의 Production 목록에
// 있던 `llama-3.3-70b-versatile` 는 이 계정에서 404 였다 — 문서만 믿으면 안 된다.
// 바꿀 때는 목록을 다시 찍어 보고, 합성 안내문으로 채점까지 할 것.
//
// Groq 선택 근거 (같은 합성 안내문, 8개 항목 채점)
//   openai/gpt-oss-120b  8/8  1800ms  ← 텍스트 기본. Production 이라 오래 간다
//   qwen/qwen3.8-27b     8/8   636ms     가장 빠르고 정확하지만 **Preview**
//   openai/gpt-oss-20b   7/8  1349ms     제목을 비웠다
// 텍스트는 같은 점수를 받은 Production 쪽을 쓴다. 둘 다 예산(8초) 안이라
// 속도를 위해 Preview 를 기본으로 둘 이유가 없다.
//
// Groq 의 **비전 모델은 `qwen/qwen3.8-27b` 하나뿐이고 Preview** 다
// (모델 목록 API 는 Preview 여부를 알려주지 않는다. 문서 쪽 표시를 따랐다).
// 그래서 이미지 모드의 기본 공급자는 Gemini 다 — 프리뷰 모델이 내려가는 날
// 기본 경로가 끊기면 안 된다.
export const MODELS = {
  groq: {
    text: "openai/gpt-oss-120b", // Production, ctx 131k
    vision: "qwen/qwen3.8-27b", // Preview — 내려갈 수 있다
  },
  // Gemini 선택 근거 (같은 포스터 2장, 9개 항목 채점, 2026-10-03)
  //   gemini-3.1-flash-lite  9/9 x5, 8/9 x1   1.5~2.6초   <- 기본. 가장 빠르고 싸다
  //   gemini-3.8-flash       9/9 x5, 503 x1   3.1~5.1초
  //   gemini-3.5-flash       9/9 x2           4.7~7.6초
  //   gemini-flash-latest    9/9 x2           4.0~7.8초   떠다니는 별칭이라 조용히 바뀐다
  // 정확도가 비슷하면 빠르고 싼 쪽을 쓴다. 틀리면 Groq 로 넘어가고, 교사 화면이
  // AI 가 채운 칸을 보라색으로 표시하므로 한 번 더 걸러진다.
  // **포스터 2장으로만 비교했다.** 실제 학교 포스터가 쌓이면 다시 재 볼 것.
  gemini: {
    text: "gemini-3.1-flash-lite",
    vision: "gemini-3.1-flash-lite",
  },
} as const;

/**
 * 공급자 우선순위. **상수만 바꾸면 뒤집힌다.**
 *
 * 2026-10-03 에 실제로 재 보고 **두 모드 모두 Gemini 를 앞에 뒀다.**
 *
 * | 자료 | Groq | Gemini |
 * |---|---|---|
 * | 포스터 P1 (여러 날·정원 없음) | 8/9 | 9/9 |
 * | 포스터 P2 | 7/9 | 9/9 |
 * | 안내문 A (천체관측) | 7/8 | 8/8 |
 * | 안내문 B (진로특강) | 7/8 | 8/8 |
 * | 안내문 C (실험교실) | 8/8 | 8/8 |
 *
 * Groq 은 **장소를 비우는 일이 잦다** — 다섯 번 중 네 번 그랬다. 틀린 값을 넣는
 * 것이 아니라 빈칸이라 위험하진 않지만, 교사가 매번 장소를 직접 쳐야 한다.
 * 속도 차이는 0.5초 안쪽이라 정확도를 택했다.
 *
 * Groq 을 뒤에 둬도 폴백은 그대로다 — Gemini 가 한도에 걸리면 자동으로 넘어간다.
 * 모드별로 나눠 둔 구조는 유지한다. 나중에 한쪽만 바꿀 수 있어야 한다.
 */
export const PROVIDER_ORDER: Record<"text" | "image", readonly AiProvider[]> = {
  text: ["gemini", "groq"],
  image: ["gemini", "groq"],
};

/**
 * 타임아웃.
 *
 * 플랫폼 한도를 막으려는 것이 아니다 — Vercel 쪽은 Fluid compute 가 켜져 있으면
 * 300초다. 막아야 할 대상은 **교사가 버튼을 누르고 기다리는 시간**이다.
 * 느린 실패는 실패로 보고 바로 폴백한다.
 */
export const TIMEOUTS = {
  groq: 8_000,
  gemini: 15_000,
  /** 폴백까지 합한 상한. 이 안에서 끝나야 한다. */
  total: 25_000,
} as const;

/** 이미지 용량 상한. 공급자 한도(20MB)보다 훨씬 낮게 잡는다 — 학교 포스터면 충분하다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ── 이미지 주소 허용 ──────────────────────────────────────

/**
 * 우리 Supabase Storage 의 공개 URL 만 허용한다.
 *
 * 허용하지 않으면 로그인한 교사가 서버를 시켜 **아무 주소로나 요청을 보내게**
 * 할 수 있다 (사설 IP 포함). 공급자에게 URL 을 그대로 넘기든 서버가 받아서
 * 넘기든, 검사는 똑같이 필요하다.
 */
export function isAllowedImageUrl(raw: string): boolean {
  const base = process.env.SUPABASE_URL;
  if (!base) return false;

  let url: URL;
  let allowed: URL;
  try {
    url = new URL(raw);
    allowed = new URL(base);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.hostname !== allowed.hostname) return false;
  // 공개 객체 경로만. 서명 URL 이나 관리 API 경로는 받지 않는다.
  return url.pathname.startsWith("/storage/v1/object/public/");
}

// ── 호출 ──────────────────────────────────────────────────

export type AiFillMode = "text" | "image";

export type ProviderInput = {
  mode: AiFillMode;
  /** `mode === "text"` 일 때의 본문 글자. */
  text?: string;
  /** `mode === "image"` 일 때의 이미지 주소. 허용 검사를 통과한 것만 들어온다. */
  imageUrl?: string;
  /** 연도 없는 날짜를 해석하는 기준. KST 로 만든 오늘 날짜(yyyy-MM-dd). */
  today: string;
};

/** 공급자 호출이 실패한 이유. 라우트가 오류 분류로 옮긴다. */
export class ProviderError extends Error {
  constructor(
    readonly code: AiFillErrorCode,
    /** 로그에 남겨도 되는 짧은 사유. **키나 요청 내용을 넣지 말 것.** */
    readonly reason: string
  ) {
    super(reason);
    this.name = "ProviderError";
  }
}

/** 공급자 하나를 부르는 함수. 테스트에서 가짜로 바꿔 끼울 수 있게 타입을 둔다. */
export type ProviderCaller = (
  provider: AiProvider,
  key: string,
  input: ProviderInput,
  signal: AbortSignal
) => Promise<unknown>;

/**
 * 두 공급자에게 요구하는 응답 모양. Gemini 는 이걸로 강제하고,
 * Groq 은 글로만 요구한 뒤 서버에서 `aiFillResultSchema` 로 다시 검증한다.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", nullable: true },
    body: { type: "string", nullable: true },
    date: { type: "string", nullable: true },
    endDate: { type: "string", nullable: true },
    startTime: { type: "string", nullable: true },
    endTime: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    capacity: { type: "integer", nullable: true },
    applyStart: { type: "string", nullable: true },
    applyDeadline: { type: "string", nullable: true },
    applyNote: { type: "string", nullable: true },
  },
} as const;

/**
 * 지시문.
 *
 * "없으면 null" 을 거듭 적는 이유는 모델이 빈칸을 그럴듯한 값으로 채우려 하기
 * 때문이다. 교사가 확인하지 않고 저장하면 틀린 날짜가 공지로 나간다.
 *
 * 행사 일시와 신청 기간을 구분하라는 문장도 반드시 있어야 한다 — 포스터에
 * 신청 기간이 없으면 행사 날짜를 그리로 옮겨 적으려는 경향이 있다.
 */
function instruction(mode: AiFillMode, today: string): string {
  const lines = [
    "학교·기관 활동 안내에서 아래 항목을 뽑아 JSON 으로만 답하세요.",
    "글에 없는 값은 반드시 null 로 두세요. 절대 추측하지 마세요.",
    "date 는 시작 날짜 YYYY-MM-DD, endDate 는 여러 날 행사일 때의 종료 날짜(아니면 null).",
    "startTime·endTime 은 HH:MM (24시간).",
    "applyStart·applyDeadline 은 **신청 접수 기간**이며 YYYY-MM-DDTHH:MM 입니다.",
    "행사 일시와 신청 기간은 다릅니다. 신청 기간이 적혀 있지 않으면 둘 다 null 입니다.",
    "신청 기간에 시각이 없으면 시작은 00:00, 마감은 23:59 로 하세요.",
    `연도가 적혀 있지 않으면 오늘(${today}) 의 연도를 쓰세요.`,
    "capacity 는 모집 인원 숫자만. '누구나' 처럼 인원 제한이 없으면 null.",
    "title 은 행사 이름만.",
    mode === "image"
      ? "body 에는 안내문의 설명을 2~3줄로 간추려 넣으세요."
      : "body 는 null 로 두세요. 본문은 이미 교사가 쓴 것입니다.",
  ];
  return lines.join(" ");
}

/** 모델이 코드 울타리를 붙이는 경우가 있어 벗겨낸다. */
function parseJson(text: string): unknown {
  const fence = /^```(?:json)?\s*|\s*```$/gi;
  try {
    return JSON.parse(text.trim().replace(fence, "").trim());
  } catch {
    throw new ProviderError("bad_response", "JSON 으로 읽을 수 없음");
  }
}

/** HTTP 오류를 분류로 옮긴다. 응답 본문은 로그에도 남기지 않는다. */
function errorFor(status: number): ProviderError {
  return new ProviderError(codeForStatus(status), `HTTP ${status}`);
}

/**
 * 이미지 용량을 **보내기 전에** 확인한다.
 *
 * 공급자가 URL 을 직접 가져가므로 우리는 바이트를 보지 않는다. 그래서 미리 막아야 한다.
 * Supabase Storage 는 HEAD 에 `content-length` 를 준다 (2026-10-03 확인).
 *
 * **아무 CDN 에나 통하는 방법이 아니다.** 같은 날 어떤 뉴스 CDN 은 HEAD 에 404,
 * GET 에 200 을 줬다. 허용 도메인을 우리 Supabase 로 묶어 두는 것이 그래서 중요하다.
 * 크기를 알 수 없으면 통과시키지 않는다 — 막는 쪽으로 실패한다.
 */
export async function checkImageSize(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: true; bytes: number } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, { method: "HEAD", signal });
    if (!res.ok) return { ok: false, reason: `HEAD ${res.status}` };

    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return { ok: false, reason: "이미지가 아님" };

    const len = Number(res.headers.get("content-length"));
    if (!Number.isFinite(len) || len <= 0) return { ok: false, reason: "크기를 알 수 없음" };
    if (len > MAX_IMAGE_BYTES) return { ok: false, reason: "용량 초과" };

    return { ok: true, bytes: len };
  } catch {
    return { ok: false, reason: "확인 실패" };
  }
}

/**
 * Groq — OpenAI 호환 `chat/completions`.
 *
 * 이미지는 `image_url` 로 **공개 URL 을 그대로** 넘긴다. base64 도 되지만
 * 무료 등급의 분당 토큰 한도(TPM 8000)를 금방 넘긴다 — 816KB 포스터 한 장을
 * base64 로 보냈더니 실제로 429 가 났다.
 */
async function callGroq(
  key: string,
  input: ProviderInput,
  signal: AbortSignal
): Promise<unknown> {
  const isImage = input.mode === "image";
  const content = isImage
    ? [
        { type: "text", text: instruction("image", input.today) },
        { type: "image_url", image_url: { url: input.imageUrl } },
      ]
    : `${instruction("text", input.today)}\n\n${input.text ?? ""}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: isImage ? MODELS.groq.vision : MODELS.groq.text,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    signal,
  });
  if (!res.ok) throw errorFor(res.status);

  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError("bad_response", "응답에 본문이 없음");
  return parseJson(text);
}

/**
 * Gemini — `generateContent` + `generationConfig.responseSchema`.
 *
 * **이 형태가 맞다.** 문서가 보여주던 `/v1beta/interactions` + `response_format`
 * 쪽도 찔러 봤는데, 200 은 오지만 우리가 요구한 항목이 하나도 담기지 않았다.
 * 2026-10-03 에 실제 호출로 확인했다. 문서만 보고 고르면 안 된다.
 *
 * 이미지는 `file_data.file_uri` 로 공개 URL 을 그대로 넘긴다. 바이트가 우리
 * 함수를 거치지 않으므로 Supabase(서울)에서 바로 가져간다. base64 와 걸린 시간이
 * 거의 같았고, 용량은 `checkImageSize` 로 미리 막는다.
 *
 * 키를 쿼리스트링이 아니라 헤더로 보낸다. URL 은 로그에 남기 쉽다.
 */
async function callGemini(
  key: string,
  input: ProviderInput,
  signal: AbortSignal
): Promise<unknown> {
  const isImage = input.mode === "image";
  const model = isImage ? MODELS.gemini.vision : MODELS.gemini.text;

  const parts: Array<Record<string, unknown>> = [
    { text: instruction(input.mode, input.today) },
  ];
  if (isImage) {
    parts.push({ file_data: { mime_type: "image/jpeg", file_uri: input.imageUrl } });
  } else {
    parts.push({ text: input.text ?? "" });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal,
    }
  );
  if (!res.ok) throw errorFor(res.status);

  const body = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new ProviderError("bad_response", "응답에 본문이 없음");
  return parseJson(text);
}

/** 기본 호출자. 테스트에서는 가짜로 바꿔 끼운다. */
export const defaultCaller: ProviderCaller = (provider, key, input, signal) =>
  provider === "groq" ? callGroq(key, input, signal) : callGemini(key, input, signal);

/** 폴백 한 번의 결과. */
export type AttemptResult =
  | { ok: true; provider: AiProvider; data: unknown }
  | { ok: false; provider: AiProvider; code: AiFillErrorCode; reason: string };

/**
 * 우선순위대로 부르고, 실패하면 다음 공급자로 넘긴다.
 *
 * `keys` 에 없는 공급자는 건너뛴다 — 키가 하나만 등록돼 있어도 동작해야 한다.
 * 전체 예산(`TIMEOUTS.total`)을 넘기면 더 시도하지 않는다.
 *
 * `caller` 를 바깥에서 받는 이유는 **외부 호출 없이 이 흐름을 검증**하기 위함이다.
 */
export async function callWithFallback(
  mode: AiFillMode,
  keys: Partial<Record<AiProvider, string>>,
  input: ProviderInput,
  caller: ProviderCaller = defaultCaller,
  now: () => number = Date.now
): Promise<{ result: AttemptResult; attempts: AttemptResult[] }> {
  const startedAt = now();
  const attempts: AttemptResult[] = [];
  let lastFailure: AttemptResult | null = null;

  for (const provider of PROVIDER_ORDER[mode]) {
    const key = keys[provider];
    if (!key) continue;

    if (now() - startedAt >= TIMEOUTS.total) {
      const timedOut: AttemptResult = {
        ok: false,
        provider,
        code: "bad_response",
        reason: "전체 예산 초과로 시도하지 않음",
      };
      attempts.push(timedOut);
      lastFailure = timedOut;
      break;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS[provider]);
    try {
      const data = await caller(provider, key, input, controller.signal);
      const ok: AttemptResult = { ok: true, provider, data };
      attempts.push(ok);
      return { result: ok, attempts };
    } catch (err) {
      const failure: AttemptResult = { ok: false, provider, ...classify(err) };
      attempts.push(failure);
      lastFailure = failure;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    result:
      lastFailure ?? {
        ok: false,
        provider: PROVIDER_ORDER[mode][0],
        code: "key_missing",
        reason: "등록된 키가 없음",
      },
    attempts,
  };
}

/** 예외를 오류 분류로 옮긴다. **메시지에 키나 요청 내용이 섞이지 않게 한다.** */
function classify(err: unknown): { code: AiFillErrorCode; reason: string } {
  if (err instanceof ProviderError) return { code: err.code, reason: err.reason };
  if (err instanceof Error && err.name === "AbortError")
    return { code: "bad_response", reason: "타임아웃" };
  return { code: "bad_response", reason: "알 수 없는 오류" };
}

/**
 * HTTP 상태를 오류 분류로 옮긴다. 5단계에서 실제 호출이 쓴다.
 * 여기서 분기해 두면 두 공급자가 같은 규칙을 쓴다.
 */
export function codeForStatus(status: number): AiFillErrorCode {
  if (status === 401 || status === 403) return "key_rejected";
  if (status === 429) return "rate_limited";
  if (status === 404) return "model_gone";
  return "bad_response";
}

/** 연도 없는 날짜를 해석할 기준 날짜. **KST 로 만든다** — Vercel 함수는 UTC 다. */
export function todayInKst(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
