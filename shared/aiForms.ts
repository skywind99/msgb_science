import { z } from "zod";
import { AI_PROVIDERS } from "./schema.js";

/**
 * AI 설정·호출 요청 스키마.
 *
 * `schema.ts` 가 아니라 여기 있는 이유는 `applyForms.ts` 와 같다 —
 * drizzle-kit 이 `schema.ts` 를 CJS 로 직접 읽어서, 거기서 다른 shared 모듈을
 * import 하면 `npm run db:push` 가 MODULE_NOT_FOUND 로 죽는다.
 * **schema.ts 에는 다른 shared 모듈을 import 하지 말 것.**
 */

/** 공급자 이름 검증. 라우트와 화면이 같은 것을 쓴다. */
export const aiProviderSchema = z.enum(AI_PROVIDERS);

/**
 * 키 등록·교체 본문.
 *
 * 길이 상한을 두는 이유는 두 가지다 — 실수로 파일 내용을 붙여넣는 것을 막고,
 * 터무니없이 큰 값이 암호화·DB 로 흘러가지 않게 한다.
 * 공백은 먼저 떼어낸다. 복사할 때 줄바꿈이 붙어 오는 일이 흔하다.
 */
export const putAiKeySchema = z.object({
  provider: aiProviderSchema,
  key: z
    .string()
    .trim()
    .min(10, "키가 너무 짧습니다. 다시 확인해 주세요.")
    .max(500, "키가 너무 깁니다. 키만 붙여 넣었는지 확인해 주세요."),
});

export type PutAiKeyRequest = z.infer<typeof putAiKeySchema>;

/**
 * `POST /api/ai/fill` 요청. 두 모드 중 하나만 보낸다.
 *
 * - `imageUrl` — 대표 이미지 한 장을 읽어 제목·본문·활동 정보까지
 * - `text`     — 본문 글자만 보내 활동 정보만. 이미지는 보내지 않는다
 */
export const aiFillRequestSchema = z
  .object({
    imageUrl: z.string().trim().url("이미지 주소가 올바르지 않습니다.").optional(),
    text: z.string().trim().max(8000, "글이 너무 깁니다.").optional(),
  })
  .refine((v) => !!v.imageUrl !== !!v.text, {
    message: "imageUrl 또는 text 중 하나만 보내 주세요.",
  });

export type AiFillRequest = z.infer<typeof aiFillRequestSchema>;

/**
 * AI 가 돌려주는 결과. **서버가 공급자 응답을 이 스키마로 다시 검증한다.**
 *
 * Gemini 는 `responseSchema` 로 모양을 강제할 수 있지만 Groq 은 "JSON 으로 답하라"
 * 수준이라, 두 쪽 모두 믿지 않고 여기서 한 번 더 거른다.
 *
 * 모든 항목이 선택이다. **글에 없는 값은 비워야 하고, 추측은 틀린 답이다.**
 */
const trimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : v ?? null),
    z.string().max(max).nullable()
  );

/** "2026-11-07" */
const dateOnly = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null),
  z.string().nullable()
);

/** "14:00" — 한 자리 시(9:00)도 받아 두 자리로 맞춘다. */
const timeOnly = z.preprocess((v) => {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}, z.string().nullable());

/** "2026-10-26T00:00" */
const localDateTime = z.preprocess(
  (v) =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.trim())
      ? v.trim()
      : null,
  z.string().nullable()
);

export const aiFillResultSchema = z.object({
  title: trimmed(200),
  body: trimmed(2000),
  date: dateOnly,
  endDate: dateOnly,
  startTime: timeOnly,
  endTime: timeOnly,
  location: trimmed(100),
  capacity: z.preprocess((v) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null;
  }, z.number().int().nullable()),
  applyStart: localDateTime,
  applyDeadline: localDateTime,
  applyNote: trimmed(500),
});

export type AiFillResult = z.infer<typeof aiFillResultSchema>;
