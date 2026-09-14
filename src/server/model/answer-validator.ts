interface ModelAnswerPayload {
  answer: string;
  citations: string[];
  insufficientEvidence: boolean;
}

export class InvalidModelResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inlineCitationIds(answer: string): string[] {
  const citationGroups = [...answer.matchAll(/\[((?:E\d+\s*,\s*)*E\d+)\]/g)];
  const citationIds = citationGroups.flatMap((group) => group[1]?.match(/E\d+/g) ?? []);

  return [...new Set(citationIds)];
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function parseAndValidateModelAnswer(
  rawText: string,
  allowedEvidenceIds: string[],
): ModelAnswerPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new InvalidModelResponseError("The model output was not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new InvalidModelResponseError("The model output must be a JSON object.");
  }

  const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const citations = parsed.citations;
  const insufficientEvidence = parsed.insufficientEvidence;

  if (!answer || answer.length > 5_000) {
    throw new InvalidModelResponseError(
      "The model answer must contain between 1 and 5,000 characters.",
    );
  }
  if (
    !Array.isArray(citations) ||
    !citations.every((citation) => typeof citation === "string")
  ) {
    throw new InvalidModelResponseError("The model citations must be an array of strings.");
  }
  if (typeof insufficientEvidence !== "boolean") {
    throw new InvalidModelResponseError(
      "The model insufficientEvidence field must be a boolean.",
    );
  }

  const uniqueCitations = [...new Set(citations)];
  if (uniqueCitations.length !== citations.length) {
    throw new InvalidModelResponseError("The model returned duplicate evidence citations.");
  }

  const invalidCitation = uniqueCitations.find(
    (citation) => !allowedEvidenceIds.includes(citation),
  );
  if (invalidCitation) {
    throw new InvalidModelResponseError(
      `The model cited an evidence id that was not provided: ${invalidCitation}`,
    );
  }

  const inlineCitations = inlineCitationIds(answer);
  const invalidInlineCitation = inlineCitations.find(
    (citation) => !allowedEvidenceIds.includes(citation),
  );
  if (invalidInlineCitation) {
    throw new InvalidModelResponseError(
      `The answer used an evidence id that was not provided: ${invalidInlineCitation}`,
    );
  }

  if (!insufficientEvidence && uniqueCitations.length === 0) {
    throw new InvalidModelResponseError(
      "A supported answer must include at least one evidence citation.",
    );
  }
  if (!sameStringSet(uniqueCitations, inlineCitations)) {
    throw new InvalidModelResponseError(
      "Inline evidence markers must exactly match the citations array.",
    );
  }

  return { answer, citations: uniqueCitations, insufficientEvidence };
}
