import { readFile } from 'node:fs/promises';
import path from 'node:path';

const KNOWLEDGE_FILES = [
  'product-overview.md',
  'executable-pipelines.md',
  'node-catalog.md',
  'assistant-policy.md',
] as const;

interface KnowledgeSection {
  content: string;
  source: string;
  title: string;
}

export async function searchAssistantKnowledge(query: string, maxResults = 3) {
  const terms = tokenize(query);
  const sections = await loadKnowledgeSections();
  const ranked = sections
    .map((section) => ({ section, score: scoreSection(section, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(Math.max(maxResults, 1), 5));

  return {
    query,
    results: ranked.map(({ section }) => ({
      excerpt: section.content.slice(0, 2_400),
      source: section.source,
      title: section.title,
    })),
  };
}

async function loadKnowledgeSections(): Promise<KnowledgeSection[]> {
  const knowledgeRoot = path.join(process.cwd(), 'docs', 'assistant-knowledge');
  const documents = await Promise.all(KNOWLEDGE_FILES.map(async (file) => ({
    file,
    text: await readFile(path.join(knowledgeRoot, file), 'utf8'),
  })));
  return documents.flatMap(({ file, text }) => splitMarkdown(file, text));
}

function splitMarkdown(source: string, markdown: string): KnowledgeSection[] {
  const sections: KnowledgeSection[] = [];
  let title = source;
  let lines: string[] = [];
  const flush = () => {
    const content = lines.join('\n').trim();
    if (content) sections.push({ content, source, title });
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      title = heading[2]?.trim() || source;
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function scoreSection(section: KnowledgeSection, terms: string[]) {
  if (terms.length === 0) return 1;
  const title = section.title.toLocaleLowerCase('ru-RU');
  const content = section.content.toLocaleLowerCase('ru-RU');
  return terms.reduce((score, term) => (
    score + (title.includes(term) ? 5 : 0) + (content.includes(term) ? 1 : 0)
  ), 0);
}

function tokenize(value: string) {
  return Array.from(new Set(value.toLocaleLowerCase('ru-RU').split(/[^\p{L}\p{N}-]+/u)
    .filter((term) => term.length >= 2))).slice(0, 16);
}
