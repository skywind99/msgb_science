import { z } from "zod";
import { insertApplicationSchema } from "./schema.js";
import { checkStudentPassword, MAX_LENGTH } from "./studentSecret.js";

/**
 * 학생 신청 폼의 요청 스키마.
 *
 * `schema.ts` 가 아니라 여기 있는 이유: drizzle-kit 이 `drizzle.config.ts` 의
 * `schema: "./shared/schema.ts"` 를 CJS 로 직접 읽는다. 그 과정에서 `.js` 확장자를
 * 붙인 상대 경로를 `.ts` 로 되돌리지 못해서, schema.ts 가 다른 shared 모듈을
 * import 하는 순간 `npm run db:push` 가 MODULE_NOT_FOUND 로 죽는다.
 *
 * 애초에 비밀번호 강도 규칙은 DB 스키마와 상관이 없다. 마이그레이션 도구가
 * 앱 검증 로직을 읽을 이유가 없으므로 분리하는 것이 맞다.
 * **schema.ts 에는 다른 shared 모듈을 import 하지 말 것.**
 */

// postId 는 URL 에서 받으므로 본문에서는 빼둔다. 둘이 어긋날 여지를 없앤다.
//
// 비밀번호가 두 개 나오는데 주인이 다르다. 헷갈리지 말 것.
// - `applyPassword`  : 교사가 활동에 걸어둔 것. 해당 학급에만 구두로 알려준다.
// - `studentPassword`: 학생이 자기 신청을 조회·취소하려고 직접 정하는 것.
export const applyRequestSchema = insertApplicationSchema
  .omit({ postId: true })
  .extend({
    applyPassword: z.string().max(50).optional(),
    studentPassword: z.string().min(1, "확인 비밀번호를 정해 주세요.").max(MAX_LENGTH),
    // 수집 항목·보유기간 고지에 대한 동의. 체크하지 않으면 접수하지 않는다.
    agree: z.literal(true, {
      errorMap: () => ({ message: "개인정보 수집·이용에 동의해야 신청할 수 있습니다." }),
    }),
  })
  // 추측하기 쉬운 비밀번호를 여기서 막는다. 학생이 정하는 값이라 그냥 두면
  // 절반이 1234 나 생년월일을 쓴다. 자세한 이유는 shared/studentSecret.ts 참고.
  .superRefine((v, ctx) => {
    const problem = checkStudentPassword(v.studentPassword, {
      grade: v.grade,
      classNo: v.classNo,
      studentNo: v.studentNo,
    });
    if (problem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: problem,
        path: ["studentPassword"],
      });
    }
  });

// 본인 신청 조회·취소.
// 여기서는 강도 검사를 하지 않는다. 규칙이 바뀌기 전에 만든 비밀번호로도
// 조회할 수 있어야 하고, 검사 결과가 "이 값은 규칙에 안 맞음"이라는 힌트가 되면
// 오히려 추측 범위를 좁혀 준다.
export const lookupApplicationSchema = z.object({
  postId: z.number().int(),
  grade: z.number().int().min(1).max(3),
  classNo: z.number().int().min(1).max(20),
  studentNo: z.number().int().min(1).max(50),
  studentPassword: z.string().min(1, "확인 비밀번호를 입력해 주세요.").max(MAX_LENGTH),
});

export type ApplyRequest = z.infer<typeof applyRequestSchema>;
export type LookupApplicationRequest = z.infer<typeof lookupApplicationSchema>;
