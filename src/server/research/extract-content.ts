import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

export interface ExtractedPage {
  title: string;
  content: string;
}

const CONTENT_BLOCK_SELECTOR = "h1,h2,h3,h4,p,li,dt,dd,th,td";
const MINIMUM_CONTENT_LENGTH = 400;
const MAXIMUM_CONTENT_LENGTH = 250_000;
const BOILERPLATE = /^(buy now|learn more|read more|sign up|get started|log in|menu|image|back to top)$/i;

function normalizeInlineText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function removeNoise($: CheerioAPI): void {
  $(
    "script,style,noscript,template,svg,canvas,iframe,nav,header,footer,form,dialog,[role='navigation'],[role='dialog'],[aria-modal='true']",
  ).remove();

  $("[class],[id]").each((_index, element) => {
    const candidate = `${$(element).attr("class") ?? ""} ${$(element).attr("id") ?? ""}`;
    if (/\b(cookie|consent|modal|popup|breadcrumb|site-header|site-footer)\b/i.test(candidate)) {
      $(element).remove();
    }
  });
}

function chooseMainContent($: CheerioAPI): Cheerio<AnyNode> {
  const candidates = $("main,article,[role='main']").toArray();

  if (candidates.length === 0) {
    return $("body").first();
  }

  const largest = candidates.reduce((best, candidate) => {
    const candidateLength = normalizeInlineText($(candidate).text()).length;
    const bestLength = normalizeInlineText($(best).text()).length;
    return candidateLength > bestLength ? candidate : best;
  });

  return $(largest);
}

function collectContentBlocks($: CheerioAPI, root: Cheerio<AnyNode>): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();

  root.find(CONTENT_BLOCK_SELECTOR).each((_index, element) => {
    const tagName = element.type === "tag" ? element.name.toLowerCase() : "";
    const hasNestedBlock =
      tagName === "li" && $(element).find(CONTENT_BLOCK_SELECTOR).length > 0;

    if (hasNestedBlock) {
      return;
    }

    const text = normalizeInlineText($(element).text());
    const fingerprint = text.toLocaleLowerCase("en-AU");

    if (text.length < 2 || BOILERPLATE.test(text) || seen.has(fingerprint)) {
      return;
    }

    seen.add(fingerprint);
    blocks.push(text);
  });

  return blocks;
}

export function extractPageContent(html: string, url: string): ExtractedPage {
  const $ = load(html);
  const rawTitle =
    normalizeInlineText($("title").first().text()) ||
    normalizeInlineText($("meta[property='og:title']").attr("content") ?? "") ||
    normalizeInlineText($("h1").first().text());

  removeNoise($);
  const root = chooseMainContent($);
  let content = collectContentBlocks($, root).join("\n\n");

  if (content.length < MINIMUM_CONTENT_LENGTH) {
    content = normalizeInlineText(root.text());
  }

  content = content.slice(0, MAXIMUM_CONTENT_LENGTH).trim();

  if (!rawTitle) {
    throw new Error(`No page title could be extracted from ${url}`);
  }

  if (content.length < MINIMUM_CONTENT_LENGTH) {
    throw new Error(
      `Only ${content.length} characters of useful content were extracted from ${url}`,
    );
  }

  return { title: rawTitle, content };
}

