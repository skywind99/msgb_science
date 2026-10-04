import { z } from "zod";
import { CATEGORY_IDS } from "./categories.js";
import { CATEGORY_LABEL_MAX } from "./schema.js";

/**
 * 게시판 관리 요청 스키마.
 *
 * `schema.ts` 가 아니라 여기 있는 이유는 `aiForms.ts`·`applyForms.ts` 와 같다 —
 * drizzle-kit 이 `schema.ts` 를 CJS 로 직접 읽어서, 거기서 다른 shared 모듈을
 * import 하면 `npm run db:push` 가 MODULE_NOT_FOUND 로 죽는다.
 * **`schema.ts` 에는 다른 shared 모듈을 import 하지 말 것.**
 */

/**
 * 게시판 이름.
 *
 * 공백을 먼저 떼고 길이를 본다. 순서가 반대면 `"   "` 가 3자로 통과해서 메뉴에
 * 빈칸이 생긴다. **DB 의 `CHECK (char_length(btrim(label)) between 1 and 16)` 과
 * 같은 규칙이다** — 둘이 갈라지면 화면은 통과인데 DB 가 거부한다.
 */
export const categoryLabelSchema = z
  .string()
  .trim()
  .min(1, "게시판 이름을 입력해 주세요.")
  .max(CATEGORY_LABEL_MAX, `게시판 이름은 ${CATEGORY_LABEL_MAX}자 이하여야 합니다.`);

/** 1단계에서 다룰 수 있는 id 만. 모르는 id 로 행이 생기는 길을 막는다. */
export const categoryIdSchema = z.enum(CATEGORY_IDS as [string, ...string[]]);

/**
 * 이름·숨김 변경. **둘 다 선택이지만 하나는 있어야 한다.**
 * 빈 본문을 받아 아무것도 안 하고 200 을 주면, 저장이 된 줄 알게 된다.
 */
export const updateCategorySchema = z
  .object({
    label: categoryLabelSchema.optional(),
    hidden: z.boolean().optional(),
  })
  .refine((v) => v.label !== undefined || v.hidden !== undefined, {
    message: "바꿀 내용이 없습니다.",
  });

/**
 * 순서 일괄 저장.
 *
 * **개별 저장이 아니라 배열 하나로 받는다.** ▲▼ 한 번이 두 행을 동시에 바꾸므로,
 * 개별 요청이면 둘 사이에 다른 admin 이 끼어들거나 하나가 실패해서 `sort_order` 가
 * 겹친다. 배열을 받아 한 트랜잭션에서 다시 매기면 중간 상태가 없다.
 *
 * **빠진 id 나 중복이 있으면 거부한다.** 일부만 보내면 남은 행의 순번이 어떻게
 * 되는지 아무도 모른다.
 */
export const reorderCategoriesSchema = z.object({
  ids: z
    .array(categoryIdSchema)
    .length(CATEGORY_IDS.length, "게시판 전체를 순서대로 보내 주세요.")
    .refine((ids) => new Set(ids).size === ids.length, { message: "같은 게시판이 두 번 들어 있습니다." }),
});

export type UpdateCategoryRequest = z.infer<typeof updateCategorySchema>;
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesSchema>;
