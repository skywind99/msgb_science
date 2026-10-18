/**
 * 사이언스타임즈 목록·기사 페이지 파싱. **순수 함수만 둔다.**
 *
 * 긁는 일(`fetch`)은 서버가 하고, 여기서는 받은 HTML 에서 값을 뽑는다. 이렇게
 * 나눈 이유는 **가짜 HTML 로 시험할 수 있어야** 하기 때문이다. 짝짓기가 한 칸
 * 밀리거나 블록 경계가 어긋나는 종류의 버그는 화면에서는 "사진이 좀 안 맞네" 로
 * 보일 뿐이라, 눌러 보는 것으로는 못 잡는다.
 *
 * **이미지는 목록에서 뽑지 않는다.** 기사 페이지의 `og:image` 에서 가져온다.
 * 목록 블록의 정규식으로도 6/6 맞게 짝지어지는 것을 확인했지만(2026-10-18),
 * 블록 경계가 마크업 변화에 약하고 `og:image` 는 기사가 스스로 선언하는 값이라
 * 더 믿을 수 있다.
 */

export type NewsListItem = {
  title: string;
  summary: string;
  link: string;
  date: string;
};

/** 요약을 이 길이에서 자른다. 카드에 두세 줄로 들어갈 만큼. */
const SUMMARY_MAX = 200;

const SITE = "https://www.sciencetimes.co.kr";
export const SCIENCE_TIMES_LIST = `${SITE}/nscvrg/list/menu/265?sersYn=Y`;

/** 태그를 떼고 공백을 정리한다. */
const plain = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/**
 * 목록 페이지에서 기사 하나하나를 뽑는다.
 *
 * 블록 경계는 `class="sub_txt"` 의 등장 위치다. 날짜는 **그 앞**에 있다
 * (`<div class="sub_info"> … <span> 2026-10-16</span></div>` 다음에 `sub_txt` 가 온다).
 * 그래서 날짜는 블록 앞쪽 일부에서 **마지막** 날짜를 집는다 — 앞 기사의 날짜가
 * 섞이지 않게 하려면 "마지막" 이어야 한다.
 */
export function parseNewsList(html: string, limit = 6): NewsListItem[] {
  const starts: number[] = [];
  let pos = 0;
  while ((pos = html.indexOf('class="sub_txt"', pos)) !== -1) {
    starts.push(pos);
    pos++;
  }

  const items: NewsListItem[] = [];
  for (let i = 0; i < starts.length && items.length < limit; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : start + 2000;
    const block = html.slice(start, end);

    const title = plain(block.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? "");
    if (!title) continue;

    const rawSummary = plain(block.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? "");
    const summary =
      rawSummary.length > SUMMARY_MAX ? rawSummary.slice(0, SUMMARY_MAX) + "…" : rawSummary;

    const href = block.match(/href="([^"]*nscvrgSn=\d+[^"]*)"/)?.[1] ?? "";
    const link = href ? (href.startsWith("http") ? href : SITE + href) : SCIENCE_TIMES_LIST;

    // 날짜는 블록 **앞**에 있다. 500자만 보고 그중 마지막 날짜를 쓴다.
    const before = html.slice(Math.max(0, start - 500), start);
    const dates = before.match(/\d{4}-\d{2}-\d{2}/g);
    const date = dates ? dates[dates.length - 1] : "";

    items.push({ title, summary, link, date });
  }
  return items;
}

/**
 * `<meta>` 한 개를 읽는다. 속성 순서가 뒤바뀐 경우도 받는다.
 *
 * `content` 가 먼저 오고 `property` 가 뒤에 오는 마크업이 실제로 있다. 한쪽만
 * 보면 이미지가 조용히 사라진다.
 */
function meta(html: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']+)["']`, "i")
  );
  if (a) return a[1];
  const b = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${esc}["']`, "i")
  );
  return b ? b[1] : null;
}

/**
 * 기사 페이지의 대표 이미지. `og:image` → `twitter:image` 순서.
 *
 * **상대 경로를 절대 주소로 바꾼다.** 그대로 두면 우리 도메인 기준으로 해석돼
 * 없는 주소가 된다. `http(s)` 가 아닌 스킴(`data:`·`javascript:`)은 버린다 —
 * 이 값이 `<img src>` 로 그대로 들어간다.
 */
export function pickArticleImage(articleHtml: string, base = SITE): string | null {
  const raw = meta(articleHtml, "og:image") ?? meta(articleHtml, "twitter:image");
  if (!raw) return null;

  const value = raw.trim();
  if (!value) return null;

  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 기사 페이지의 게시일(`YYYY-MM-DD`).
 *
 * 목록의 날짜와 6/6 일치하는 것을 확인했으므로(2026-10-18) 지금은 쓰지 않는다.
 * 목록 쪽이 틀리기 시작하면 이걸로 바꾼다 — 그때 다시 긁어 보지 않아도 되게 둔다.
 */
export function pickArticleDate(articleHtml: string): string | null {
  const t = meta(articleHtml, "article:published_time");
  const fromMeta = t?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (fromMeta) return fromMeta;
  return articleHtml.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}
