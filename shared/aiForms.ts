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
