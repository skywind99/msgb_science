import type { ContentBlock } from "./schema.js";

/**
 * 본문 블록의 표시 규칙과 편집용 변환.
 *
 * `blocks` 는 한 칸만 채우는 구조로 쓰지만, 예전 글은 한 블록에
 * 이미지·유튜브·글이 **같이** 들어 있다. 그래서 두 가지가 필요하다.
 *  - `renderBlock` : 블록 하나를 화면에 어떻게 그릴지 (상세 페이지가 쓴다)
 *  - `toEditorBlocks` : 그걸 종류별 블록으로 쪼개기 (편집 화면이 쓴다)
 *
 * **둘이 같은 파일에 있는 이유가 중요하다.** 쪼개기 규칙이 표시 규칙과
 * 어긋나면 교사가 예전 글을 열어 저장하는 순간 화면이 달라진다.
 * 상세 페이지도 `renderBlock` 을 쓰므로 한쪽만 고쳐질 수가 없다.
 */

/**
 * 이미지로 볼 수 있는 URL인가.
 *
 * 확장자가 없는 주소도 많아서 경로에 흔히 쓰이는 낱말까지 함께 본다.
 * 예전 글은 이미지 주소를 `content` 칸에 넣어 둔 경우가 있어 이 판정이 필요하다.
 */
export const isImageUrl = (str?: string | null): str is string => {
  if (!str) return false;
  return /^https?:\/\/.+/i.test(str) && (
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(str) ||
    /\/(img|image|photo|upload|thumb|picture|bbs_\d|widg)/i.test(str)
  );
};

/** 블록 하나가 화면에 내놓는 것. 세 칸 모두 비어 있을 수 있다. */
export type RenderedBlock = {
  imgSrc: string | null;
  /** 원문 그대로. 실제로 그릴지는 호출하는 쪽이 유튜브 주소인지 보고 정한다. */
  ytUrl: string | null;
  textContent: string | null;
};

/**
 * 블록 하나를 어떻게 그릴지 정한다. 상세 페이지의 유일한 판정 경로다.
 *
 * `imageUrl` 이 이미지가 아니면 `content` 를 이미지로 쓸 수 있는지 본다.
 * 그리고 `content` 가 이미지 주소면 글로는 그리지 않는다 — 주소가 글처럼
 * 보이는 일을 막기 위해 예전부터 그렇게 동작했고, 그대로 유지한다.
 */
export function renderBlock(block: ContentBlock): RenderedBlock {
  const imgSrc = isImageUrl(block.imageUrl)
    ? block.imageUrl
    : isImageUrl(block.content)
      ? block.content
      : null;

  return {
    imgSrc,
    ytUrl: block.youtubeUrl?.trim() || null,
    textContent: isImageUrl(block.content) ? null : (block.content || null),
  };
}

// ── 편집용 블록 ───────────────────────────────────────────

export type EditorBlockType = "text" | "photo" | "youtube";

/**
 * 편집 화면이 다루는 블록. 종류 하나에 값 하나다.
 *
 * `id` 는 저장되지 않는다. React 가 블록을 순서대로 추적하려면 열(key)이
 * 필요한데, 배열 인덱스를 쓰면 ▲▼ 로 순서를 바꿀 때 입력 중이던 칸이
 * 엉뚱한 블록으로 옮겨간다.
 */
export type EditorBlock = {
  id: string;
  type: EditorBlockType;
  value: string;
};

let idSeq = 0;
export function newEditorBlock(type: EditorBlockType, value = ""): EditorBlock {
  idSeq += 1;
  return { id: `b${idSeq}`, type, value };
}

/**
 * 저장된 블록을 편집용으로 쪼갠다.
 *
 * 한 블록에서 나오는 순서는 **이미지 → 유튜브 → 글**이다.
 * 상세 페이지가 그 순서로 그리기 때문에, 쪼개서 저장해도 화면이 그대로다.
 *
 * `blocks` 가 비어 있으면 글만 가진 예전 글이다. 이때 대표 이미지는
 * 본문 블록으로 끌어오지 않는다 — 대표 이미지는 자기 칸이 따로 있고,
 * 본문에까지 넣으면 저장한 뒤 같은 사진이 두 번 보인다.
 */
export function toEditorBlocks(
  blocks: ContentBlock[] | null | undefined,
  post: { content?: string | null }
): EditorBlock[] {
  const out: EditorBlock[] = [];

  if (blocks && blocks.length > 0) {
    for (const block of blocks) {
      const r = renderBlock(block);

      // 화면에 보이는 이미지가 있으면 그것을 쓴다. 보이지 않더라도 `imageUrl`
      // 에 값이 남아 있으면 버리지 않고 사진 블록으로 들고 간다.
      const photo = r.imgSrc ?? (block.imageUrl?.trim() || null);
      if (photo) out.push(newEditorBlock("photo", photo));
      if (r.ytUrl) out.push(newEditorBlock("youtube", r.ytUrl));
      if (r.textContent) out.push(newEditorBlock("text", r.textContent));
    }
  } else {
    const text = post.content ?? "";
    if (text) out.push(newEditorBlock("text", text));
  }

  // 블록이 하나도 없으면 빈 글상자 하나를 둔다. 편집할 대상이 있어야 한다.
  if (out.length === 0) out.push(newEditorBlock("text"));
  return out;
}

/**
 * 편집용 블록을 저장 형태로 되돌린다. 칸 하나만 채운다.
 *
 * 빈 블록은 버린다. `contentBlockSchema` 는 세 칸이 모두 선택이라
 * 빈 객체도 통과하지만, 아무것도 그리지 않는 블록을 저장할 이유가 없다.
 */
export function toContentBlocks(editorBlocks: EditorBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const b of editorBlocks) {
    const value = b.value.trim();
    if (!value) continue;
    if (b.type === "photo") out.push({ imageUrl: value });
    else if (b.type === "youtube") out.push({ youtubeUrl: value });
    else out.push({ content: value });
  }
  return out;
}

/** 목록 미리보기에 쓰는 글. 첫 글상자의 내용이다. */
export function firstText(blocks: ContentBlock[]): string {
  return blocks.find((b) => b.content)?.content ?? "";
}
