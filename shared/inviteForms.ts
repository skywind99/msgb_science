import { z } from "zod";
import { passwordSchema } from "./passwordRule.js";
import { checkTeacherId, MAX_ID_LENGTH } from "./teacherId.js";

/**
 * 교사 초대 요청 스키마.
 *
 * `schema.ts` 가 아니라 여기 있는 이유는 `applyForms.ts` 와 같다 — drizzle-kit 이
 * `schema.ts` 를 CJS 로 직접 읽어서, 그 파일이 다른 shared 모듈을 import 하면
 * `npm run db:push` 가 MODULE_NOT_FOUND 로 죽는다.
 */

// 관리자가 초대를 발급할 때
export const createInviteSchema = z.object({
  role: z.enum(["teacher", "admin"]).default("teacher"),
  memo: z.string().trim().max(100, "메모가 너무 깁니다.").optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

/**
 * 초대받은 교사가 계정을 만들 때. 공개 경로다.
 *
 * 이메일이 아니라 아이디를 받는다. 서버가 내부 이메일(`kim@msgb.invalid`)로 바꿔
 * Supabase 에 넘긴다. 자세한 이유는 `shared/teacherId.ts` 참고.
 */
export const acceptInviteSchema = z
  .object({
    token: z.string().min(20).max(200),
    loginId: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "아이디를 입력해 주세요.")
      .max(MAX_ID_LENGTH),
    // 가입·변경·관리자 재설정이 **같은 규칙**을 쓴다. 갈라지면 가입은 막는데
    // 변경은 통과하는 식이 되고, 안내 문구도 서로 달라진다.
    password: passwordSchema,
    name: z.string().trim().min(2, "이름을 입력해 주세요.").max(20),
  })
  // 클라이언트도 같은 함수로 검사한다. 규칙이 갈라지면 화면은 통과인데 서버가 400 을 준다.
  .superRefine((v, ctx) => {
    const problem = checkTeacherId(v.loginId);
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ["loginId"] });
    }
  });

// 링크를 열었을 때 유효한 초대인지만 먼저 확인한다
export const checkInviteSchema = z.object({
  token: z.string().min(20).max(200),
});

/**
 * 관리자가 교사 비밀번호를 재설정할 때.
 *
 * `password` 를 비우면 서버가 무작위로 만들어 **한 번만** 보여준다. 넣으면 그
 * 값으로 바꾸고 응답에는 담지 않는다. 규칙은 가입·본인 변경과 같다.
 */
export const resetPasswordSchema = z.object({
  teacherId: z.string().uuid(),
  password: passwordSchema.optional(),
});

/** 본문만 따로 검사할 때 (라우트는 `:id` 를 경로에서 받는다). */
export const resetPasswordBodySchema = z.object({
  password: passwordSchema.optional(),
});

export type CreateInviteRequest = z.infer<typeof createInviteSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;
