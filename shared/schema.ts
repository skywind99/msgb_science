import { pgTable, text, serial, integer, timestamp, json, boolean, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── 게시물 본문 블록 ──────────────────────────────────────
export const contentBlockSchema = z.object({
  imageUrl: z.string().optional(),
  content: z.string().optional(),
  youtubeUrl: z.string().optional(),
});
export type ContentBlock = z.infer<typeof contentBlockSchema>;

// ── 교사 계정 ─────────────────────────────────────────────
// Supabase Auth 의 auth.users 와 1:1. id 는 auth.users.id 를 그대로 사용한다.
// 학생 계정은 만들지 않는다. 신청은 무계정 + 학생이 정한 확인 비밀번호 방식.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("teacher"), // "admin" | "teacher"
  createdAt: timestamp("created_at").defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;

// ── 교사 초대 ─────────────────────────────────────────────
// 자율 가입은 열지 않는다. 관리자가 발급한 초대 링크로만 계정 생성 가능.
// 원문 토큰은 저장하지 않고 해시만 보관한다.
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role").notNull().default("teacher"),
  memo: text("memo"), // "2학년 과학 김OO 선생님" 같은 발급 메모
  expiresAt: timestamp("expires_at").notNull(),
  usedBy: uuid("used_by").references(() => profiles.id, { onDelete: "set null" }),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Invite = typeof invites.$inferSelect;

// 초대 요청 스키마(`createInviteSchema`, `acceptInviteSchema`, `checkInviteSchema`)는
// `shared/inviteForms.ts` 에 있다. 아이디 규칙을 쓰기 때문이다.
// 이 파일에서 다른 shared 모듈을 import 하면 db:push 가 깨진다 (아래 활동 신청 주석 참고).

/** 관리자 화면에 보여주는 초대 정보. 토큰 해시는 내보내지 않는다. */
export type InviteSummary = {
  id: number;
  role: "teacher" | "admin";
  memo: string | null;
  expiresAt: string;
  createdAt: string | null;
  usedAt: string | null;
  used: boolean;
  expired: boolean;
};

export function toInviteSummary(invite: Invite, now = new Date()): InviteSummary {
  return {
    id: invite.id,
    role: invite.role === "admin" ? "admin" : "teacher",
    memo: invite.memo,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt ? invite.createdAt.toISOString() : null,
    usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
    used: !!invite.usedBy || !!invite.usedAt,
    expired: invite.expiresAt < now,
  };
}

/** 발급 응답. 평문 토큰이 실리는 유일한 곳이다. 다시 볼 수 없다. */
export type CreateInviteResponse = {
  invite: InviteSummary;
  /** 교사에게 전달할 초대 링크 경로 (`/invite/<token>`) */
  link: string;
};

/** 초대 링크를 열었을 때 보여줄 정보 */
export type CheckInviteResponse = {
  valid: boolean;
  role?: "teacher" | "admin";
  memo?: string | null;
  reason?: "notfound" | "used" | "expired";
};

/** 관리자 화면의 교사 계정 목록 */
export type TeacherAccount = {
  id: string;
  /** 로그인 아이디. 내부 이메일에서 도메인을 떼어낸 값 */
  loginId: string;
  name: string;
  role: "teacher" | "admin";
  createdAt: string | null;
};

/**
 * 비밀번호 재설정 결과.
 *
 * 교사는 메일을 받을 수 없는 주소를 쓰므로 스스로 재설정할 수 없다.
 * 관리자가 임시 비밀번호를 받아 당사자에게 직접 전달한다.
 * 평문이 실리는 유일한 응답이고 다시 볼 수 없다.
 */
export type ResetPasswordResponse = {
  loginId: string;
  tempPassword: string;
};

// ── 게시물 (공지 + 활동 겸용) ─────────────────────────────
// applyEnabled 가 false 면 지금까지와 동일한 일반 공지글.
// true 면 하단에 신청 폼이 붙고 정원·마감이 적용된다.
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  blocks: json("blocks").$type<ContentBlock[]>(),
  authorId: uuid("author_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),

  // 활동 정보 (applyEnabled 가 true 일 때만 의미 있음)
  applyEnabled: boolean("apply_enabled").notNull().default(false),
  eventStart: timestamp("event_start"),
  eventEnd: timestamp("event_end"),
  location: text("location"),
  capacity: integer("capacity"),          // null 이면 정원 무제한
  applyStart: timestamp("apply_start"),   // null 이면 즉시 시작
  applyDeadline: timestamp("apply_deadline"),
  applyNote: text("apply_note"),          // 준비물, 유의사항
  applyPasswordHash: text("apply_password_hash"), // null 이면 누구나 신청 가능
  allowWaitlist: boolean("allow_waitlist").notNull().default(true),
}, (t) => ({
  categoryIdx: index("posts_category_idx").on(t.category),
  eventStartIdx: index("posts_event_start_idx").on(t.eventStart),
}));

// 날짜는 JSON 으로 오갈 때 문자열이 된다. 폼에서 비워 두면 빈 문자열이 오므로
// 빈 문자열과 null 을 모두 "입력 안 함"으로 본다.
const optionalTimestamp = z
  .preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.coerce.date({ invalid_type_error: "날짜 형식이 올바르지 않습니다." }).nullable()
  )
  .optional();

// 정원도 마찬가지. 비워 두면 정원 무제한이다.
const optionalCapacity = z
  .preprocess(
    (v) => (v === "" || v === null ? null : v),
    z.coerce
      .number({ invalid_type_error: "정원은 숫자로 입력해 주세요." })
      .int()
      .min(1, "정원은 1명 이상이어야 합니다.")
      .max(1000, "정원이 너무 큽니다.")
      .nullable()
  )
  .optional();

export const insertPostSchema = createInsertSchema(posts, {
  blocks: z.array(contentBlockSchema).optional(),
  eventStart: optionalTimestamp,
  eventEnd: optionalTimestamp,
  applyStart: optionalTimestamp,
  applyDeadline: optionalTimestamp,
  capacity: optionalCapacity,
  location: z.string().trim().max(100, "장소가 너무 깁니다.").nullable().optional(),
  applyNote: z.string().trim().max(500, "유의사항이 너무 깁니다.").nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  authorId: true,          // 서버가 로그인 세션에서 채운다
  applyPasswordHash: true, // 서버가 평문을 받아 해싱한다
});

// 활동 일시·마감의 앞뒤 관계 검사. 값이 없는 필드는 통과시키므로
// 부분 수정(PATCH)에도 그대로 쓸 수 있다.
type ActivityDates = {
  applyEnabled?: boolean;
  eventStart?: Date | null;
  eventEnd?: Date | null;
  applyStart?: Date | null;
  applyDeadline?: Date | null;
};

function checkActivityDates<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .refine((v: ActivityDates) => !v.applyEnabled || !!v.eventStart, {
      message: "신청을 받으려면 활동 일시를 입력해야 합니다.",
      path: ["eventStart"],
    })
    .refine((v: ActivityDates) => !v.eventEnd || !v.eventStart || v.eventEnd >= v.eventStart, {
      message: "종료 일시가 시작 일시보다 빠릅니다.",
      path: ["eventEnd"],
    })
    .refine(
      (v: ActivityDates) => !v.applyDeadline || !v.eventStart || v.applyDeadline <= v.eventStart,
      { message: "신청 마감은 활동 시작 이전이어야 합니다.", path: ["applyDeadline"] }
    )
    .refine(
      (v: ActivityDates) => !v.applyStart || !v.applyDeadline || v.applyStart <= v.applyDeadline,
      { message: "신청 시작이 신청 마감보다 늦습니다.", path: ["applyStart"] }
    );
}

// 교사 활동 등록 폼이 실제로 보내는 형태
export const createPostSchema = checkActivityDates(
  insertPostSchema.extend({
    applyPassword: z.string().min(1, "신청 비밀번호를 입력해 주세요.").max(50).optional(),
  })
);

// 수정 폼. 빈 문자열 비밀번호는 "비밀번호 사용 안 함"이라는 뜻이다.
export const updatePostSchema = checkActivityDates(
  insertPostSchema
    .extend({ applyPassword: z.string().max(50).optional() })
    .partial()
);

export type InsertPost = z.infer<typeof insertPostSchema>;
export type CreatePostRequest = z.infer<typeof createPostSchema>;
export type UpdatePostRequest = z.infer<typeof updatePostSchema>;
export type Post = typeof posts.$inferSelect;

/** 스토리지가 실제로 쓰는 형태. 평문 비밀번호 대신 해시와 작성자가 들어간다. */
export type NewPost = InsertPost & {
  applyPasswordHash?: string | null;
  authorId?: string | null;
};

/**
 * 게시물 API 가 내려보내는 형태.
 *
 * `applyPasswordHash` 를 절대 포함하지 않는다. 게시물 조회는 공개 API 이고,
 * 신청 비밀번호는 교사가 학급에 구두로 알려주는 짧은 문자열이라
 * 해시가 유출되면 오프라인 대입으로 뚫린다.
 * 폼에서 필요한 것은 "설정 여부"뿐이므로 불리언만 내려보낸다.
 */
export type PublicPost = Omit<Post, "applyPasswordHash"> & {
  hasApplyPassword: boolean;
};

export function toPublicPost(post: Post): PublicPost {
  const { applyPasswordHash, ...rest } = post;
  return { ...rest, hasApplyPassword: !!applyPasswordHash };
}

// ── 활동 신청 ─────────────────────────────────────────────
// 계정 없이 신청한다. 수집 항목은 학년·반·번호·이름 넷뿐.
// 연락처, 이메일, 생년월일은 받지 않는다.
//
// 확인 비밀번호: 학생이 신청할 때 직접 정하고, 서버는 해시만 저장한다.
// 본인 신청을 조회·취소할 때 학년·반·번호 + 비밀번호로 대조한다.
// 잊어버리면 담당 교사가 명단에서 직접 처리한다.
//
// `code_hash` 라는 열 이름은 처음에 서버가 6자리 랜덤 코드를 발급했을 때 붙은 것이다.
// 지금 담기는 값은 학생이 정한 비밀번호의 해시다. 열 이름을 바꾸면 마이그레이션이
// 필요해서 그대로 뒀다.
export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  grade: integer("grade").notNull(),
  classNo: integer("class_no").notNull(),
  studentNo: integer("student_no").notNull(),
  name: text("name").notNull(),
  memo: text("memo"), // 학생이 남기는 한 줄 (알레르기, 희망 조 등). 선택 입력.
  codeHash: text("code_hash").notNull(),
  status: text("status").notNull().default("applied"), // "applied" | "waitlisted" | "cancelled"
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // 한 활동에 같은 학생이 두 번 신청되는 것을 DB 차원에서 막는다.
  // 장난 신청을 1인 1건으로 제한하는 역할도 한다.
  uniqStudent: uniqueIndex("applications_student_uniq").on(t.postId, t.grade, t.classNo, t.studentNo),
  postIdx: index("applications_post_idx").on(t.postId),
}));

export const insertApplicationSchema = createInsertSchema(applications, {
  grade: z.number().int().min(1).max(3),
  classNo: z.number().int().min(1).max(20),
  studentNo: z.number().int().min(1).max(50),
  name: z.string().trim().min(2, "이름을 입력해 주세요.").max(20),
  memo: z.string().trim().max(200).optional(),
}).omit({
  id: true,
  createdAt: true,
  codeHash: true, // 서버가 생성한다
  status: true,   // 서버가 정원을 보고 정한다
});

// 신청 폼이 실제로 보내는 형태(`applyRequestSchema`, `lookupApplicationSchema`)는
// `shared/applyForms.ts` 에 있다. 비밀번호 강도 규칙을 쓰기 때문이다.
//
// **이 파일에서 다른 shared 모듈을 import 하지 말 것.**
// drizzle-kit 이 이 파일을 CJS 로 직접 읽으면서 `.js` 확장자를 `.ts` 로 되돌리지
// 못해, 상대 import 를 하나만 넣어도 `npm run db:push` 가 MODULE_NOT_FOUND 로 죽는다.

export type InsertApplication = z.infer<typeof insertApplicationSchema>;
export type Application = typeof applications.$inferSelect;

// 학생에게 내려보내는 공개 정보. 명단은 교사만 볼 수 있으므로
// 목록 API 는 개별 신청자가 아니라 집계만 반환한다.
export type ApplicationSummary = {
  postId: number;
  capacity: number | null;
  applied: number;
  waitlisted: number;
  /** 정원이 있을 때 남은 자리. 정원 무제한이면 null. */
  remaining: number | null;
  isOpen: boolean;
  closesAt: string | null;
};

/**
 * 신청한 학생 본인에게만 내려보내는 형태.
 * 확인 비밀번호 해시는 물론이고, 다른 신청자의 정보는 어떤 경우에도 포함하지 않는다.
 */
export type MyApplication = {
  postId: number;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
  memo: string | null;
  status: "applied" | "waitlisted";
  createdAt: string | null;
  /** 대기자일 때 앞에 몇 명이 있는지. 신청 확정이면 null. */
  waitlistPosition: number | null;
};

export function toMyApplication(
  app: Application,
  waitlistPosition: number | null = null
): MyApplication {
  return {
    postId: app.postId,
    grade: app.grade,
    classNo: app.classNo,
    studentNo: app.studentNo,
    name: app.name,
    memo: app.memo,
    status: app.status === "waitlisted" ? "waitlisted" : "applied",
    createdAt: app.createdAt ? app.createdAt.toISOString() : null,
    waitlistPosition,
  };
}

/**
 * 교사용 명단 항목.
 *
 * 개별 신청자가 나가는 유일한 인증 경로다. 담당 교사와 `admin` 만 받을 수 있다.
 * 확인 비밀번호 해시는 절대 포함하지 않는다 — 학생이 정한 값이라 해시가 새면
 * 오프라인 대입으로 쉽게 뚫린다.
 */
export type RosterEntry = {
  id: number;
  grade: number;
  classNo: number;
  studentNo: number;
  name: string;
  memo: string | null;
  status: "applied" | "waitlisted";
  createdAt: string | null;
};

export function toRosterEntry(app: Application): RosterEntry {
  return {
    id: app.id,
    grade: app.grade,
    classNo: app.classNo,
    studentNo: app.studentNo,
    name: app.name,
    memo: app.memo,
    status: app.status === "waitlisted" ? "waitlisted" : "applied",
    createdAt: app.createdAt ? app.createdAt.toISOString() : null,
  };
}

/** 교사가 신청 상태를 직접 바꿀 때. 대기자를 신청 확정으로 올리는 것이 주 용도다. */
export const updateApplicationSchema = z.object({
  status: z.enum(["applied", "waitlisted"], {
    errorMap: () => ({ message: "상태는 applied 또는 waitlisted 여야 합니다." }),
  }),
});

export type RosterResponse = {
  postId: number;
  title: string;
  capacity: number | null;
  entries: RosterEntry[];
};

/**
 * 신청 완료 응답.
 *
 * 비밀번호는 학생이 직접 정한 값이라 되돌려줄 필요가 없다.
 * 서버는 해시만 갖고 있으므로 돌려줄 수도 없다.
 */
export type ApplyResponse = {
  application: MyApplication;
  summary: ApplicationSummary;
};

export type LookupResponse = {
  application: MyApplication;
  summary: ApplicationSummary;
};

export type CancelResponse = {
  cancelled: true;
  /** 빈 자리에 대기자가 올라갔는지 */
  promoted: boolean;
  summary: ApplicationSummary;
};

// ── 요청 제한 카운터 ──────────────────────────────────────
// 서버리스에서는 모듈 전역 변수가 인스턴스마다 따로 놀아 카운터로 쓸 수 없다
// (뉴스 캐시가 같은 이유로 무효다). 그래서 DB 에 둔다.
//
// key 는 원문이 아니라 해시를 넣는다. 원문에는 IP 나 학년·반·번호가 들어가므로
// 요청 제한 테이블이 또 하나의 개인정보 보관소가 되면 안 된다.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start").notNull().defaultNow(),
});

// ── 팝업 ──────────────────────────────────────────────────
export const popups = pgTable("popups", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPopupSchema = createInsertSchema(popups, {
  title: z.string().trim().min(1).max(100),
  // javascript: 스킴 차단
  linkUrl: z.string().regex(/^(https?:\/\/|\/)/, "올바른 링크가 아닙니다.").optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
});

export type InsertPopup = z.infer<typeof insertPopupSchema>;
export type Popup = typeof popups.$inferSelect;
