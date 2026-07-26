import { CalendarClock, MapPin, Users, Lock, ClipboardList } from "lucide-react";
import { type PublicPost } from "@shared/schema";

/**
 * 활동 신청 정보 입력.
 *
 * 글쓰기 화면과 수정 화면이 같은 필드를 쓰므로 한 곳에 모아 둔다.
 * "신청 받기" 를 끄면 지금까지와 똑같은 공지글이고, 켤 때만 아래가 펼쳐진다.
 * 교사가 새로 배울 게 없어야 하므로 필수는 활동 일시 하나뿐이다.
 */
export type ActivityDraft = {
  applyEnabled: boolean;
  eventStart: string; // datetime-local 문자열 (지역 시간)
  eventEnd: string;
  location: string;
  capacity: string; // 비우면 정원 무제한
  applyStart: string; // 비우면 즉시 시작
  applyDeadline: string;
  applyNote: string;
  allowWaitlist: boolean;
  usePassword: boolean;
  applyPassword: string;
};

export const emptyActivity: ActivityDraft = {
  applyEnabled: false,
  eventStart: "",
  eventEnd: "",
  location: "",
  capacity: "",
  applyStart: "",
  applyDeadline: "",
  applyNote: "",
  allowWaitlist: true,
  usePassword: false,
  applyPassword: "",
};

/** Date 또는 ISO 문자열 → datetime-local 입력값 (지역 시간) */
function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local 입력값 → ISO 문자열. 서버는 UTC 로 저장한다. */
function toIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 기존 게시물을 수정 폼 초기값으로 바꾼다. */
export function activityFromPost(post: PublicPost): ActivityDraft {
  return {
    applyEnabled: post.applyEnabled,
    eventStart: toLocalInput(post.eventStart),
    eventEnd: toLocalInput(post.eventEnd),
    location: post.location ?? "",
    capacity: post.capacity == null ? "" : String(post.capacity),
    applyStart: toLocalInput(post.applyStart),
    applyDeadline: toLocalInput(post.applyDeadline),
    applyNote: post.applyNote ?? "",
    allowWaitlist: post.allowWaitlist,
    // 해시는 내려오지 않으므로 설정 여부만 알 수 있다.
    usePassword: post.hasApplyPassword,
    applyPassword: "",
  };
}

/**
 * 서버로 보낼 형태로 바꾼다.
 *
 * 비밀번호는 평문을 읽어올 수 없으므로 규칙을 나눈다.
 * - 사용 안 함  → 수정일 때만 빈 문자열을 보내 기존 비밀번호를 지운다
 * - 사용 + 입력 → 새 값으로 교체
 * - 사용 + 공백 → 아무것도 보내지 않는다 (기존 비밀번호 유지)
 */
export function activityToPayload(a: ActivityDraft, mode: "create" | "update") {
  const base = {
    applyEnabled: a.applyEnabled,
    eventStart: toIso(a.eventStart),
    eventEnd: toIso(a.eventEnd),
    location: a.location.trim() || null,
    capacity: a.capacity.trim() === "" ? null : Number(a.capacity),
    applyStart: toIso(a.applyStart),
    applyDeadline: toIso(a.applyDeadline),
    applyNote: a.applyNote.trim() || null,
    allowWaitlist: a.allowWaitlist,
  };

  if (!a.usePassword) {
    return mode === "update" ? { ...base, applyPassword: "" } : base;
  }
  const pw = a.applyPassword.trim();
  return pw ? { ...base, applyPassword: pw } : base;
}

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border-2 border-border bg-background focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-foreground">
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span>
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function ActivityFields({
  value,
  onChange,
}: {
  value: ActivityDraft;
  onChange: (next: ActivityDraft) => void;
}) {
  const set = <K extends keyof ActivityDraft>(key: K, v: ActivityDraft[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-xl border-2 border-border bg-muted/20 p-4 space-y-4">
      <Toggle
        checked={value.applyEnabled}
        onChange={(v) => set("applyEnabled", v)}
        label="신청 받기"
        hint="켜면 학생이 이 글에서 활동을 신청할 수 있습니다."
      />

      {value.applyEnabled && (
        <div className="space-y-4 pt-2 border-t border-border">
          {/* 활동 일시 */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <CalendarClock className="w-3.5 h-3.5" /> 활동 일시
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="시작 *">
              <input
                type="datetime-local"
                value={value.eventStart}
                onChange={(e) => set("eventStart", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="종료" hint="(선택)">
              <input
                type="datetime-local"
                value={value.eventEnd}
                onChange={(e) => set("eventEnd", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {/* 장소 · 정원 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="장소">
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={value.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="제2과학실"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
            <Field label="정원" hint="(비우면 제한 없음)">
              <div className="relative">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={value.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder="24"
                  className={`${inputClass} pl-8`}
                />
              </div>
            </Field>
          </div>

          {/* 신청 기간 */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary pt-1">
            <ClipboardList className="w-3.5 h-3.5" /> 신청 기간
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="신청 시작" hint="(비우면 지금부터)">
              <input
                type="datetime-local"
                value={value.applyStart}
                onChange={(e) => set("applyStart", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="신청 마감" hint="(비우면 활동 시작까지)">
              <input
                type="datetime-local"
                value={value.applyDeadline}
                onChange={(e) => set("applyDeadline", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Toggle
            checked={value.allowWaitlist}
            onChange={(v) => set("allowWaitlist", v)}
            label="정원이 차면 대기자로 받기"
            hint="끄면 정원이 차는 즉시 신청이 막힙니다."
          />

          {/* 유의사항 */}
          <Field label="준비물 · 유의사항" hint="(선택)">
            <textarea
              value={value.applyNote}
              onChange={(e) => set("applyNote", e.target.value)}
              rows={2}
              placeholder="실험복 지참, 점심 식사 후 집합 등"
              className={`${inputClass} resize-y`}
            />
          </Field>

          {/* 신청 비밀번호 */}
          <div className="space-y-2 pt-1">
            <Toggle
              checked={value.usePassword}
              onChange={(v) => set("usePassword", v)}
              label="신청 비밀번호 사용"
              hint="해당 학급에만 알려주면 사실상 그 반만 신청할 수 있습니다."
            />
            {value.usePassword && (
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={value.applyPassword}
                  onChange={(e) => set("applyPassword", e.target.value)}
                  placeholder="비워 두면 기존 비밀번호를 그대로 씁니다"
                  className={`${inputClass} pl-8`}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
