import { api } from "@shared/routes";
import {
  AI_FILL_MESSAGES,
  type AiFillErrorCode,
  type AiStatusResponse,
} from "@shared/schema";
import type { AiFillResponse } from "@shared/aiForms";

/**
 * AI 보조 입력 호출.
 *
 * **이미지는 버튼을 눌러야만 전송된다.** 올리기만 해서는 어떤 분석 호출도 하지 않는다.
 * 그래서 이 모듈의 함수는 전부 사용자 동작에서만 불린다 — 자동 실행 경로를 만들지 말 것.
 */

export type AiFillError = { code: AiFillErrorCode | "unknown"; message: string };

/** 서버가 보내는 `{code, message}` 를 그대로 쓴다. 문구가 한 곳에서만 정해지도록. */
async function toError(res: Response): Promise<AiFillError> {
  const body = (await res.json().catch(() => null)) as
    | { code?: string; message?: string }
    | null;

  const code = body?.code as AiFillErrorCode | undefined;
  if (code && code in AI_FILL_MESSAGES) {
    return { code, message: body?.message ?? AI_FILL_MESSAGES[code] };
  }
  if (res.status === 429) {
    return { code: "rate_limited", message: body?.message ?? AI_FILL_MESSAGES.rate_limited };
  }
  if (res.status === 401 || res.status === 403) {
    return { code: "unknown", message: "로그인이 필요합니다." };
  }
  return { code: "unknown", message: body?.message ?? "AI 호출에 실패했어요." };
}

/** 키가 등록돼 있는지. 둘 중 하나라도 쓸 수 있으면 AI 버튼을 켠다. */
export async function fetchAiStatus(
  authHeaders: Record<string, string>
): Promise<AiStatusResponse> {
  const res = await fetch(api.ai.status.path, { headers: authHeaders });
  if (!res.ok) return { groq: false, gemini: false };
  return (await res.json()) as AiStatusResponse;
}

async function callFill(
  body: Record<string, string>,
  authHeaders: Record<string, string>
): Promise<AiFillResponse> {
  const res = await fetch(api.ai.fill.path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AiFillResponse;
}

/**
 * 대표 이미지 한 장을 읽는다. 제목·본문·활동 정보까지 돌아온다.
 * 서버가 우리 Storage 도메인만 받으므로, 외부 URL 이면 버튼 자체를 막아 둔다.
 */
export const readImage = (imageUrl: string, authHeaders: Record<string, string>) =>
  callFill({ imageUrl }, authHeaders);

/** 본문 글자만 보낸다. **이미지는 보내지 않는다.** */
export const readText = (text: string, authHeaders: Record<string, string>) =>
  callFill({ text }, authHeaders);

/** 던져진 값이 우리가 만든 오류인지. */
export function isAiFillError(err: unknown): err is AiFillError {
  return typeof err === "object" && err !== null && "message" in err && "code" in err;
}

export function errorMessage(err: unknown): string {
  if (isAiFillError(err)) return err.message;
  return err instanceof Error ? err.message : "AI 호출에 실패했어요.";
}
