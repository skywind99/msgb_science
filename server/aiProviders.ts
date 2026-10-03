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
  gemini: {
    // 확인 전 — Gemini 키가 등록되면 모델 목록을 찍어 안정판으로 확정한다.
    // `gemini-2.0-flash` 는 종료, `gemini-2.5-flash` 는 접근 제한이다.
    text: "gemini-3.5-flash",
    vision: "gemini-3.5-flash",
  },
} as const;

/**
 * 공급자 우선순위. **상수만 바꾸면 뒤집힌다.**
 *
 * 텍스트는 Groq 이 빠르고 모델이 Production 이라 먼저 본다.
 * 이미지는 Groq 의 비전 모델이 Preview 뿐이라 Gemini 를 먼저 본다.
 * 실제 한국어 포스터로 비교한 뒤 바꿀 수 있다.
 */
export const PROVIDER_ORDER: Record<"text" | "image", readonly AiProvider[]> = {
  text: ["groq", "gemini"],
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

/** 아직 확인하지 못한 부분이 있어 호출을 막아 둔 표시. */
export class NotVerifiedError extends Error {
  constructor(readonly provider: AiProvider) {
    super(`${provider} 호출 형식이 아직 확인되지 않았습니다.`);
    this.name = "NotVerifiedError";
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
 * Groq 호출.
 *
 * **확인 전** — OpenAI 호환 `chat/completions` 에 `response_format:
 * {"type":"json_object"}` 를 쓰는 형태로 문서에 나와 있다. 이미지는 공개 URL 과
 * base64 둘 다 받는다(요청당 20MB, 이미지 3장). 실제 키로 한 번 찍어 보고
 * 요청 본문을 확정한다.
 */
async function callGroq(
  _key: string,
  _input: ProviderInput,
  _signal: AbortSignal
): Promise<unknown> {
  throw new NotVerifiedError("groq");
}

/**
 * Gemini 호출.
 *
 * **확인 전 — 두 가지가 남았다.**
 * 1. JSON 스키마를 강제하는 필드 이름. 문서가 `/v1beta/interactions` 에
 *    `response_format: {type, mime_type, schema}` 를 쓰는 형태를 보여주는데,
 *    예전 `generateContent` + `generationConfig.responseSchema` 와 다르다.
 * 2. 이미지를 공개 URL 로 넘기는 정확한 필드. 문서는 URL 을 지원한다고 하지만
 *    SDK 가 대신 내려받는 것인지 API 가 직접 가져가는 것인지가 불분명하다.
 *    **API 가 직접 가져간다면 용량을 미리 막을 수 없으므로**, Storage 에 HEAD 를
 *    먼저 보내 `content-length` 로 `MAX_IMAGE_BYTES` 를 거는 쪽으로 간다.
 *    안 되면 inline base64 로 폴백한다.
 */
async function callGemini(
  _key: string,
  _input: ProviderInput,
  _signal: AbortSignal
): Promise<unknown> {
  throw new NotVerifiedError("gemini");
}

/** 기본 호출자. 5단계에서 위 두 함수의 몸통을 채운다. */
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
  if (err instanceof NotVerifiedError)
    return { code: "bad_response", reason: "호출 형식 확인 전" };
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
