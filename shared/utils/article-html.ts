/**
 * Strip the multi-megabyte WeChat page shell before parsing article content.
 * Recent pages embed large runtime scripts after the article, which can exceed
 * Cloudflare Worker CPU or memory limits when Cheerio parses the full document.
 */
export function compactArticleHtml(rawHTML: string): string {
  const articleRoot = /<div\b[^>]*\bid=(["'])js_article\1[^>]*>/i.exec(rawHTML);
  if (articleRoot?.index === undefined) {
    return rawHTML;
  }

  const articleAndTail = rawHTML.slice(articleRoot.index);
  const qrCode = /<div\b[^>]*\bid=(["'])js_pc_qr_code\1[^>]*>/i.exec(articleAndTail);
  if (qrCode?.index === undefined) {
    return rawHTML;
  }

  const articleHTML = articleAndTail.slice(0, qrCode.index);
  return `<!DOCTYPE html><html lang="zh_CN"><body>${articleHTML}</div></body></html>`;
}
