import type { RetrievalResponse } from "../../shared/contracts.js";
import type { SearchableChunk } from "../database/research-repository.js";

const DEFAULT_TOP_K = 5;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "design",
  "designed",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "provide",
  "show",
  "tell",
  "that",
  "the",
  "their",
  "these",
  "this",
  "to",
  "what",
  "when",
  "which",
  "who",
  "why",
  "with",
]);

const CORPUS_COMMON_TERMS = new Set(["au", "australia", "australian", "xero"]);

const NORMAL_FORMS: Record<string, string> = {
  accountants: "accountant",
  audiences: "audience",
  businesses: "business",
  clients: "client",
  costs: "cost",
  customers: "customer",
  designed: "design",
  designing: "design",
  employees: "employee",
  features: "feature",
  forecasted: "forecast",
  forecasts: "forecast",
  invoices: "invoice",
  invoicing: "invoice",
  bookkeepers: "bookkeeper",
  partners: "partner",
  payments: "payment",
  planned: "plan",
  plans: "plan",
  prices: "price",
  priced: "price",
  pricing: "price",
  services: "service",
  subscriptions: "subscription",
  users: "user",
};

const QUERY_EXPANSIONS: Record<string, string[]> = {
  audience: ["customer", "business", "user", "small"],
  cost: ["price", "plan"],
  customer: ["business", "user", "small"],
  serve: ["customer", "business", "user", "small"],
  subscription: ["plan", "price"],
};

function normaliseToken(token: string): string {
  const normalised = token.toLocaleLowerCase("en-AU").replace(/[’']s$/u, "");
  return NORMAL_FORMS[normalised] ?? normalised;
}

function tokenise(text: string): string[] {
  return (text.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(normaliseToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

interface QueryConcept {
  root: string;
  alternatives: string[];
}

function queryConcepts(question: string): QueryConcept[] {
  const initial = [...new Set(tokenise(question))];
  const withoutCorpusTerms = initial.filter((term) => !CORPUS_COMMON_TERMS.has(term));
  const meaningful = withoutCorpusTerms.length > 0 ? withoutCorpusTerms : initial;

  return meaningful.map((root) => ({
    root,
    alternatives: [root, ...(QUERY_EXPANSIONS[root] ?? [])],
  }));
}

function termCounts(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

interface IndexedChunk {
  chunk: SearchableChunk;
  length: number;
  terms: Map<string, number>;
}

function indexChunk(chunk: SearchableChunk): IndexedChunk {
  const contentTokens = tokenise(chunk.content);
  const metadataTokens = tokenise(
    `${chunk.sourceTitle} ${chunk.sourceTitle} ${chunk.sourceKey} ${chunk.sourceUrl}`,
  );

  return {
    chunk,
    length: Math.max(contentTokens.length, 1),
    terms: termCounts([...contentTokens, ...metadataTokens]),
  };
}

export function retrieveEvidence(
  question: string,
  chunks: SearchableChunk[],
  topK = DEFAULT_TOP_K,
  searchedAt = new Date().toISOString(),
): RetrievalResponse {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    throw new Error("Question must not be empty.");
  }
  if (!Number.isInteger(topK) || topK < 1 || topK > 10) {
    throw new Error("topK must be an integer between 1 and 10.");
  }

  const concepts = queryConcepts(trimmedQuestion);
  const terms = [...new Set(concepts.flatMap((concept) => concept.alternatives))];
  const documents = chunks.map(indexChunk);
  const averageLength = documents.length
    ? documents.reduce((sum, document) => sum + document.length, 0) / documents.length
    : 1;

  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    documentFrequency.set(
      term,
      documents.filter((document) => document.terms.has(term)).length,
    );
  }

  const ranked = documents
    .map((document) => {
      let score = 0;
      const matchedTerms: string[] = [];

      for (const term of terms) {
        const frequency = document.terms.get(term) ?? 0;
        if (frequency === 0) {
          continue;
        }

        matchedTerms.push(term);
        const frequencyAcrossDocuments = documentFrequency.get(term) ?? 0;
        const inverseDocumentFrequency = Math.log(
          1 +
            (documents.length - frequencyAcrossDocuments + 0.5) /
              (frequencyAcrossDocuments + 0.5),
        );
        const lengthNormalisation =
          frequency +
          BM25_K1 * (1 - BM25_B + BM25_B * (document.length / averageLength));
        score +=
          inverseDocumentFrequency * ((frequency * (BM25_K1 + 1)) / lengthNormalisation);
      }

      const matchedConceptCount = concepts.filter((concept) =>
        concept.alternatives.some((term) => document.terms.has(term)),
      ).length;
      const queryCoverage = concepts.length > 0 ? matchedConceptCount / concepts.length : 0;

      return { document, matchedTerms, queryCoverage, score };
    })
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.chunk.position - right.document.chunk.position ||
        left.document.chunk.id - right.document.chunk.id,
    )
    .slice(0, topK);

  const bestCoverage = ranked[0]?.queryCoverage ?? 0;

  return {
    question: trimmedQuestion,
    method: "bm25-keyword",
    searchedAt,
    totalChunksSearched: chunks.length,
    topK,
    queryTerms: concepts.map((concept) => concept.root),
    matchQuality: ranked.length === 0 ? "none" : bestCoverage >= 0.6 ? "strong" : "weak",
    results: ranked.map(({ document, matchedTerms, queryCoverage, score }, index) => ({
      evidenceId: `E${index + 1}`,
      id: document.chunk.id,
      sourceId: document.chunk.sourceId,
      position: document.chunk.position,
      content: document.chunk.content,
      sourceKey: document.chunk.sourceKey,
      sourceTitle: document.chunk.sourceTitle,
      sourceUrl: document.chunk.sourceUrl,
      retrievedAt: document.chunk.retrievedAt,
      score: Number(score.toFixed(4)),
      queryCoverage: Number(queryCoverage.toFixed(2)),
      matchedTerms,
    })),
  };
}
