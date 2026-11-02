import { css } from '@emotion/react';

/** Shortest word to hyphenate; the backend hyphenates Finnish words from the same length */
export const HYPHENATE_MIN_WORD_LENGTH = 16;

/** Shortest word to hyphenate in page headings, whose large text needs it on narrow screens */
export const HEADING_HYPHENATE_MIN_WORD_LENGTH = 10;

/**
 * Hyphenation for headings and other titles. The browser hyphenates only long
 * words, which German needs and English seldom has. Browsers hyphenate Finnish
 * poorly, so in Finnish only the soft hyphens from the backend are used.
 */
export const titleHyphenation = css`
  hyphens: auto;
  hyphenate-limit-chars: ${HYPHENATE_MIN_WORD_LENGTH};

  html:lang(fi) & {
    hyphens: manual;
  }

  /* Without the limit (Safari), English would get hyphens in short words too */
  @supports not (hyphenate-limit-chars: 16) {
    html:lang(en) & {
      hyphens: manual;
    }
  }
`;
