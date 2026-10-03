/**
 * 글 안의 주소를 찾아 링크로 만들 수 있게 조각낸다.
 *
 * React 요소를 만들지 않고 **조각 목록만** 돌려준다. 화면 쪽이 그걸 `<a>` 로
 * 그린다. 이렇게 나눈 이유는 두 가지다.
 *  - `dangerouslySetInnerHTML` 을 쓰지 않는다. 교사가 쓴 글이 그대로 HTML 이 되면
 *    `<script>` 한 줄로 끝난다
 *  - 규칙(어디서 끊을지)을 브라우저 없이 시험할 수 있다
 *
 * **`http://` 와 `https://` 만 찾는다.** `javascript:`·`data:` 같은 스킴은
 * 아예 후보에 들어오지 않으므로 링크가 될 수 없다.
 */

export type LinkPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string };

/** 주소 뒤에 붙기 쉬운 글자. 문장 부호는 주소의 일부가 아니다. */
const TRAILING = `.,;:!?·…"'`;

/**
 * 주소 끝을 다듬는다.
 *
 * "자세한 내용은 https://a.co/b 참고." 처럼 마침표가 붙거나,
 * "(https://a.co/b)" 처럼 괄호가 감싸는 일이 흔하다. 그대로 두면 링크가 깨진다.
 *
 * 괄호는 **짝이 맞는지 세어 본다.** 위키백과 주소처럼 `...(disambiguation)` 로
 * 끝나는 경우가 있어서, 무조건 떼면 오히려 주소가 잘린다.
 */
function trimTrailing(url: string): string {
  let end = url.length;

  while (end > 0) {
    const ch = url[end - 1];

    if (TRAILING.includes(ch)) {
      end -= 1;
      continue;
    }

    if (ch === ")" || ch === "]" || ch === "}") {
      const open = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      const slice = url.slice(0, end);
      const opens = slice.split(open).length - 1;
      const closes = slice.split(ch).length - 1;
      // 닫는 괄호가 더 많으면 글에서 온 것이다. 떼어낸다.
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }

    break;
  }

  return url.slice(0, end);
}

/** 주소 후보. 공백과 꺾쇠 전까지 가져온 뒤 `trimTrailing` 이 끝을 다듬는다. */
const URL_RE = /https?:\/\/[^\s<>]+/gi;

/**
 * 글을 글자 조각과 주소 조각으로 나눈다.
 *
 * 줄바꿈은 글자 조각 안에 그대로 남는다. 화면 쪽이 `whitespace-pre-wrap` 으로
 * 그리므로 따로 다룰 필요가 없다.
 */
export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;

  // `matchAll` 대신 `exec` 루프를 쓴다. tsconfig 의 target 에서 반복자가 막힌다.
  const re = new RegExp(URL_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const url = trimTrailing(match[0]);

    // 다듬고 나니 스킴만 남았으면 주소로 보지 않는다.
    if (!/^https?:\/\/[^/]/i.test(url)) continue;

    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "link", value: url });
    last = start + url.length;
  }

  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
