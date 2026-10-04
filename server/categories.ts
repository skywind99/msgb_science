import { eq, inArray } from "drizzle-orm";
import { db } from "./db.js";
import { categories, type PublicCategory } from "../shared/schema.js";
import { CATEGORY_DEFAULTS, CATEGORY_IDS } from "../shared/categories.js";

/**
 * 게시판 목록을 읽는다. **실패해도 던지지 않는다.**
 *
 * 테이블이 없거나 조회가 실패하면 코드 기본값으로 돌려준다(fail open).
 * 메뉴는 사이트의 뼈대라서 **DB 가 흔들릴 때 사라지는 것이 가장 나쁘다.**
 * 글이 안 보이는 것보다 막막하다 — 어디로 가야 할지조차 모르게 된다.
 *
 * `ai_settings` 의 `readRow` 와 같은 방침이다. 거기도 조회 실패를 삼켜서
 * `/api/ai/status` 가 500 을 내지 않게 했다.
 */

type Row = { id: string; label: string; hidden: boolean; sortOrder: number };

const fallback = (): Row[] =>
  CATEGORY_DEFAULTS.map((c) => ({
    id: c.id,
    label: c.label,
    hidden: false,
    sortOrder: c.sortOrder,
  }));

/**
 * 행과 기본값을 **합친다.**
 *
 * 일부 행만 있는 경우가 생길 수 있다 — 시드가 중간에 끊겼거나 2단계에서 행을
 * 지웠을 때다. 그때 DB 행만 쓰면 **게시판이 메뉴에서 사라진다.** 기본값을 바탕에
 * 깔고 DB 값으로 덮어써서, 아는 게시판은 늘 다섯 개가 되게 한다.
 */
function merge(rows: Row[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return fallback()
    .map((d) => byId.get(d.id) ?? d)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/** 전부(숨김 포함). 관리 화면과 서버 내부 판정이 쓴다. */
export async function loadCategories(): Promise<Row[]> {
  try {
    const rows = await db
      .select({
        id: categories.id,
        label: categories.label,
        hidden: categories.hidden,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(inArray(categories.id, CATEGORY_IDS));
    return merge(rows);
  } catch (err) {
    // 테이블이 없는 경우가 정상적으로 가능하다 — 코드가 먼저 배포되고 DDL 이
    // 나중에 적용될 수 있다. 조용히 넘기지 않고 로그는 남긴다.
    console.error("[categories] 조회 실패 — 기본값으로 동작한다:", err instanceof Error ? err.message : err);
    return fallback();
  }
}

/** 숨긴 게시판의 id. 목록에서 거르는 곳들이 같은 함수를 쓴다. */
export async function hiddenCategoryIds(): Promise<string[]> {
  return (await loadCategories()).filter((c) => c.hidden).map((c) => c.id);
}

/**
 * 화면에 내려보낼 모양.
 *
 * **`hidden` 은 admin 응답에만 붙인다.** 비로그인에게는 숨긴 게시판 자체가 목록에
 * 없으므로 그 필드가 있을 이유가 없고, 있으면 "숨겨진 게시판이 있다" 는 사실이
 * 새어 나간다.
 */
export function toPublicCategories(rows: Row[], isAdmin: boolean): PublicCategory[] {
  if (isAdmin) return rows.map((r) => ({ id: r.id, label: r.label, hidden: r.hidden }));
  return rows.filter((r) => !r.hidden).map((r) => ({ id: r.id, label: r.label }));
}

export type SaveResult = { ok: true } | { ok: false; status: number; message: string };

/** 이름·숨김 한 행 변경. 행이 없으면 만든다(시드가 빠진 경우). */
export async function saveCategory(
  id: string,
  input: { label?: string; hidden?: boolean },
  updatedBy: string
): Promise<SaveResult> {
  const base = CATEGORY_DEFAULTS.find((c) => c.id === id);
  if (!base) return { ok: false, status: 404, message: "게시판을 찾을 수 없습니다." };

  try {
    // 행이 없을 수 있다. upsert 로 넣으면서 기본값을 채운다.
    await db
      .insert(categories)
      .values({
        id,
        label: input.label ?? base.label,
        hidden: input.hidden ?? false,
        sortOrder: base.sortOrder,
        updatedBy,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: {
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
          updatedBy,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  } catch (err) {
    console.error("[categories] 저장 실패:", err instanceof Error ? err.message : err);
    return { ok: false, status: 500, message: "게시판을 저장하지 못했습니다." };
  }
}

/**
 * 순서 일괄 저장. **한 트랜잭션에서 전부 다시 매긴다.**
 *
 * 개별 저장이면 두 요청 사이에 `sort_order` 가 겹치는 순간이 생긴다. 배열 순서대로
 * 10, 20, 30… 을 다시 넣으면 중간 상태가 없다.
 */
export async function reorderCategories(ids: string[], updatedBy: string): Promise<SaveResult> {
  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        const base = CATEGORY_DEFAULTS.find((c) => c.id === ids[i]);
        if (!base) continue;
        const sortOrder = (i + 1) * 10;
        await tx
          .insert(categories)
          .values({ id: ids[i], label: base.label, hidden: false, sortOrder, updatedBy, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: categories.id,
            // **이름과 숨김은 건드리지 않는다.** 순서만 바꾸는 요청이다.
            set: { sortOrder, updatedBy, updatedAt: new Date() },
          });
      }
    });
    return { ok: true };
  } catch (err) {
    console.error("[categories] 순서 저장 실패:", err instanceof Error ? err.message : err);
    return { ok: false, status: 500, message: "순서를 저장하지 못했습니다." };
  }
}

/** 한 게시판이 숨겨졌는지. 게시판 페이지가 쓴다. */
export async function isCategoryHidden(id: string): Promise<boolean> {
  return (await loadCategories()).some((c) => c.id === id && c.hidden);
}

export { eq };
