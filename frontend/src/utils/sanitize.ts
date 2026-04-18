import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Allows safe HTML tags for email rendering while stripping scripts and event handlers.
 */
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 'em', 'strong', 'p', 'br', 'div', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'img', 'hr', 'sub', 'sup', 'small',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
      'style', 'class', 'id', 'colspan', 'rowspan',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'], // Allow target for links
  });
};

/**
 * Strip all HTML and return plain text.
 */
export const stripHtml = (html: string): string => {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
};
