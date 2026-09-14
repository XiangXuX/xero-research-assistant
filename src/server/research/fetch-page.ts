import { appConfig } from "../config.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; XeroResearchAssistant/0.1; recruitment exercise)";

export class PageFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PageFetchError";
  }
}

export async function fetchPageHtml(url: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(appConfig.fetchTimeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown network error";
    throw new PageFetchError(`Could not fetch the page: ${detail}`);
  }

  if (!response.ok) {
    throw new PageFetchError(
      `Page returned HTTP ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new PageFetchError(`Expected HTML but received ${contentType || "an unknown content type"}`);
  }

  return response.text();
}

