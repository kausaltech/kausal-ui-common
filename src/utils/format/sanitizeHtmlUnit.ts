// Attempt to sanitize HTML unit strings to make them more readable where html can not be rendered
export const sanitizeHtmlUnit = (unit: string): string => {
  let text = unit || '';

  // Convert specific HTML sub/sup tags to Unicode before stripping all tags
  text = text
    .replace(/\<sub\>0\<\/sub\>/g, '₀')
    .replace(/\<sub\>1\<\/sub\>/g, '₁')
    .replace(/\<sub\>2\<\/sub\>/g, '₂')
    .replace(/\<sub\>3\<\/sub\>/g, '₃')
    .replace(/\<sub\>4\<\/sub\>/g, '₄')
    .replace(/\<sub\>5\<\/sub\>/g, '₅')
    .replace(/\<sub\>6\<\/sub\>/g, '₆')
    .replace(/\<sub\>7\<\/sub\>/g, '₇')
    .replace(/\<sub\>8\<\/sub\>/g, '₈')
    .replace(/\<sub\>9\<\/sub\>/g, '₉')
    .replace(/\<sup\>0\<\/sup\>/g, '⁰')
    .replace(/\<sup\>1\<\/sup\>/g, '¹')
    .replace(/\<sup\>2\<\/sup\>/g, '²')
    .replace(/\<sup\>3\<\/sup\>/g, '³')
    .replace(/\<sup\>4\<\/sup\>/g, '⁴')
    .replace(/\<sup\>5\<\/sup\>/g, '⁵')
    .replace(/\<sup\>6\<\/sup\>/g, '⁶')
    .replace(/\<sup\>7\<\/sup\>/g, '⁷')
    .replace(/\<sup\>8\<\/sup\>/g, '⁸')
    .replace(/\<sup\>9\<\/sup\>/g, '⁹');

  // Keep removing remaining tags until none remain (prevents pattern re-emergence)
  let previousLength;
  do {
    previousLength = text.length;
    // Remove both complete tags and incomplete tags (missing closing >)
    text = text.replace(/<[^>]*>?/g, '');
  } while (text.length !== previousLength);

  // Basic entity decoding for common unit symbols
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&sup2;/g, '²')
    .replace(/&sup3;/g, '³')
    .replace(/&micro;/g, 'µ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
};
