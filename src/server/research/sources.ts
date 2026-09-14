export interface ConfiguredSource {
  key: string;
  url: string;
  topic: string;
}

export const configuredSources = [
  {
    key: "accounting-software",
    url: "https://www.xero.com/au/accounting-software/",
    topic: "Product and core accounting features",
  },
  {
    key: "pricing-plans",
    url: "https://www.xero.com/au/pricing-plans/",
    topic: "Australian plans, pricing, currency, and inclusions",
  },
  {
    key: "small-businesses",
    url: "https://www.xero.com/au/small-businesses/",
    topic: "Intended small-business customers and industries",
  },
  {
    key: "accounting-partners",
    url: "https://www.xero.com/au/accountants-bookkeepers/",
    topic: "Accountants, bookkeepers, and the partner offering",
  },
] satisfies ConfiguredSource[];

function validateConfiguredSources(sources: readonly ConfiguredSource[]): void {
  const keys = new Set<string>();
  const urls = new Set<string>();

  for (const source of sources) {
    const parsedUrl = new URL(source.url);
    const isXeroHost =
      parsedUrl.hostname === "xero.com" || parsedUrl.hostname.endsWith(".xero.com");

    if (parsedUrl.protocol !== "https:" || !isXeroHost) {
      throw new Error(`Configured source must use an HTTPS Xero URL: ${source.url}`);
    }

    if (keys.has(source.key)) {
      throw new Error(`Duplicate configured source key: ${source.key}`);
    }

    if (urls.has(source.url)) {
      throw new Error(`Duplicate configured source URL: ${source.url}`);
    }

    keys.add(source.key);
    urls.add(source.url);
  }

  if (sources.length < 3 || sources.length > 5) {
    throw new Error("Configure between three and five Xero sources.");
  }
}

validateConfiguredSources(configuredSources);

