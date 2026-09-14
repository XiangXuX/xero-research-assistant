export interface ChunkOptions {
  maxCharacters?: number;
  overlapCharacters?: number;
}

const DEFAULT_MAX_CHARACTERS = 1_200;
const DEFAULT_OVERLAP_CHARACTERS = 180;

function splitLongParagraph(paragraph: string, maxCharacters: number): string[] {
  if (paragraph.length <= maxCharacters) {
    return [paragraph];
  }

  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences.map((value) => value.trim()).filter(Boolean)) {
    if (sentence.length > maxCharacters) {
      if (current) {
        parts.push(current);
        current = "";
      }

      for (let start = 0; start < sentence.length; start += maxCharacters) {
        parts.push(sentence.slice(start, start + maxCharacters).trim());
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxCharacters) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function trailingOverlap(paragraphs: string[], targetCharacters: number): string[] {
  const overlap: string[] = [];
  let size = 0;

  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    if (!paragraph || size + paragraph.length > targetCharacters) {
      break;
    }

    overlap.unshift(paragraph);
    size += paragraph.length + 2;
  }

  return overlap;
}

export function chunkContent(content: string, options: ChunkOptions = {}): string[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const overlapCharacters = options.overlapCharacters ?? DEFAULT_OVERLAP_CHARACTERS;

  if (maxCharacters < 100 || overlapCharacters < 0 || overlapCharacters >= maxCharacters) {
    throw new Error("Chunk options must use maxCharacters >= 100 and a smaller non-negative overlap.");
  }

  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxCharacters));

  const chunks: string[] = [];
  let current: string[] = [];

  for (const paragraph of paragraphs) {
    const candidate = [...current, paragraph].join("\n\n");
    if (candidate.length <= maxCharacters) {
      current.push(paragraph);
      continue;
    }

    if (current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = trailingOverlap(current, overlapCharacters);
    }

    while ([...current, paragraph].join("\n\n").length > maxCharacters && current.length > 0) {
      current.shift();
    }
    current.push(paragraph);
  }

  if (current.length > 0) {
    const finalChunk = current.join("\n\n");
    if (chunks.at(-1) !== finalChunk) {
      chunks.push(finalChunk);
    }
  }

  return chunks;
}

