import { ShieldCheck, AlertTriangle } from "lucide-react";

/**
 * 개인정보처리방침 (`/privacy`).
 *
 * **여기 적힌 내용은 실제 구현과 일치해야 한다.** 방침은 학생에게 하는 약속이고,
 * 지키지 않으면 문서만 있는 것보다 나쁘다. 아래 항목을 바꿀 때는 짝이 되는 코드를
 * 같이 확인할 것.
 *
 * | 방침 내용 | 실제 구현 |
 * |---|---|
 * | 수집 항목 | `shared/schema.ts` 의 `applications` 테이블 |
 * | 보유 기간 30일 | `script/cleanup.ts` + keep-alive 워크플로 |
 * | 비밀번호 해시 저장 | `server/applyPassword.ts` |
 * | 명단 접근 제한 | `server/routes.ts` 의 `loadOwnedActivity` |
 * | 조회 요청 제한 | `server/rateLimit.ts` 의 `lookupPerStudent` |
 * | 집계만 공개 | `server/applications.ts` 의 `summaryFor` |
 *
 * 신청 폼(`ApplyDialog.tsx`)의 짧은 고지와도 어긋나면 안 된다.
 */

/** 아직 실제 값을 받지 못한 항목. 공개 전에 반드시 채워야 한다. */
const PLACEHOLDER = "확인 후 기재";

const CONTACT = {
  officer: PLACEHOLDER, // 개인정보 보호책임자 (보통 정보부장)
  role: PLACEHOLDER, // 직위
  phone: PLACEHOLDER, // 교무실 전화
};

/** 방침을 마지막으로 고친 날. 내용이 바뀌면 같이 고칠 것. */
const EFFECTIVE_DATE = "2026년 7월 28일";

const needsFilling = Object.values(CONTACT).includes(PLACEHOLDER);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b-2 border-border">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`py-2 pr-4 ${j === 0 ? "font-semibold text-foreground whitespace-nowrap" : "text-muted-foreground"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-gradient-to-br from-primary/8 via-background to-blue-50/40 border-b border-primary/10 pt-14 pb-10">
        <div className="max-w-3xl mx-auto px-4">
          <h1 className="flex items-center gap-2 text-3xl md:text-4xl font-black text-foreground mb-3">
            <ShieldCheck className="w-8 h-8 text-primary" />
            개인정보처리방침
          </h1>
          <p className="text-muted-foreground">
            미사강변고등학교 과학중점고 사이트는 활동 신청에 필요한 최소한의 정보만 받고,
            정해진 기간이 지나면 자동으로 지웁니다.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        {/* 실제 값을 채우기 전에 공개되면 안 되므로 눈에 띄게 알린다. */}
        {needsFilling && (
          <div className="flex gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-bold text-amber-900">아직 작성 중인 항목이 있습니다.</p>
              <p className="text-amber-800 mt-1">
                개인정보 보호책임자와 연락처를 확인해 채워야 합니다.
                (<code className="text-xs">client/src/pages/Privacy.tsx</code> 의{" "}
                <code className="text-xs">CONTACT</code>)
              </p>
            </div>
          </div>
        )}

        <Section title="1. 수집하는 항목">
          <p>활동을 신청할 때만 아래 정보를 받습니다. 그 외에는 어떤 정보도 받지 않습니다.</p>
          <Table
            head={["항목", "필수 여부", "받는 이유"]}
            rows={[
              ["학년 · 반 · 번호", "필수", "같은 학생이 두 번 신청하지 않도록 구분합니다."],
              ["이름", "필수", "담당 선생님이 참가자를 확인합니다."],
              ["확인 비밀번호", "필수", "본인이 신청을 조회·취소할 때 씁니다."],
              ["남기는 말", "선택", "알레르기·희망 조 등 참고 사항입니다. 비워도 됩니다."],
            ]}
          />
          <p className="pt-2">
            <b className="text-foreground">
              전화번호, 이메일, 생년월일, 주소, 사진은 받지 않습니다.
            </b>{" "}
            학생 계정도 만들지 않습니다.
          </p>
        </Section>

        <Section title="2. 이용 목적">
          <p>
            받은 정보는 <b className="text-foreground">활동 참가자 확인과 명단 관리</b>에만
            씁니다. 광고나 통계 분석 등 다른 용도로 쓰지 않고, 자동으로 무언가를 결정하는 데
            쓰지도 않습니다.
          </p>
        </Section>

        <Section title="3. 보유 기간과 파기">
          <p>
            신청 기록은 <b className="text-foreground">활동이 끝난 뒤 30일 이내에 자동으로
            삭제</b>됩니다. 삭제 작업은 사람이 하지 않고 정해진 주기로 자동 실행되며,
            지워진 기록은 복구할 수 없습니다.
          </p>
          <p>
            학생이 직접 취소한 신청은 <b className="text-foreground">그 즉시 삭제</b>됩니다.
            보관해 두지 않습니다.
          </p>
        </Section>

        <Section title="4. 제3자 제공과 처리 위탁">
          <p>
            수집한 정보를 <b className="text-foreground">다른 기관이나 업체에 제공하지 않습니다.</b>{" "}
            다만 사이트를 운영하려면 아래 서비스를 씁니다.
          </p>
          <Table
            head={["업체", "맡기는 일", "보관 위치"]}
            rows={[
              ["Supabase", "데이터베이스 저장", "대한민국 서울"],
              ["Vercel", "웹사이트 호스팅 및 요청 처리", "아래 5번 참고"],
            ]}
          />
        </Section>

        <Section title="5. 국외 이전">
          <p>
            신청 기록이 저장되는 데이터베이스는 <b className="text-foreground">대한민국 서울</b>에
            있습니다.
          </p>
          <p>
            다만 웹 요청을 처리하는 서버는 현재 <b className="text-foreground">미국</b>에 있어,
            신청 내용이 처리 과정에서 국외 서버를 거칩니다. 이 부분은 국내(서울)로 옮기는 작업을
            진행 중입니다.
          </p>
        </Section>

        <Section title="6. 학생의 권리">
          <p>
            신청할 때 정한 <b className="text-foreground">확인 비밀번호</b>로 언제든지 본인의
            신청 내용을 보고, 취소할 수 있습니다. 활동 글에서 "확인 비밀번호로 내 신청 조회 ·
            취소"를 누르면 됩니다.
          </p>
          <p>
            비밀번호를 잊었다면 <b className="text-foreground">담당 선생님께 말씀하세요.</b>{" "}
            선생님도 학생의 비밀번호를 볼 수는 없지만, 명단에서 직접 확인하고 지워 드릴 수
            있습니다.
          </p>
        </Section>

        <Section title="7. 안전을 위해 하고 있는 것">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              확인 비밀번호는 <b className="text-foreground">알아볼 수 없는 형태로 바꿔서</b>{" "}
              저장합니다. 선생님도 관리자도 원래 값을 볼 수 없습니다.
            </li>
            <li>
              신청자 명단은 <b className="text-foreground">해당 활동의 담당 선생님과 관리자만</b>{" "}
              볼 수 있습니다.
            </li>
            <li>
              누구나 볼 수 있는 화면에는 <b className="text-foreground">신청 인원수와 남은
              자리 같은 숫자만</b> 나옵니다. 누가 신청했는지는 나오지 않습니다.
            </li>
            <li>
              비밀번호를 여러 번 틀리면 잠시 조회가 막힙니다. 다른 사람이 아무 번호나 넣어
              보며 명단을 알아내는 것을 막기 위한 장치입니다.
            </li>
            <li>추측하기 쉬운 비밀번호(1234, 생년월일, 본인 학번 등)는 쓸 수 없습니다.</li>
          </ul>
        </Section>

        <Section title="8. 개인정보 보호책임자">
          <p>개인정보와 관련해 궁금한 점이나 요청이 있으면 아래로 연락해 주세요.</p>
          <Table
            head={["구분", "내용"]}
            rows={[
              ["책임자", CONTACT.officer],
              ["직위", CONTACT.role],
              ["연락처", CONTACT.phone],
            ]}
          />
        </Section>

        <Section title="9. 방침 변경">
          <p>
            이 방침을 고칠 때는 이 페이지에 바뀐 내용을 반영하고 아래 시행일을 갱신합니다.
          </p>
        </Section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          시행일: {EFFECTIVE_DATE}
        </p>
      </div>
    </div>
  );
}
