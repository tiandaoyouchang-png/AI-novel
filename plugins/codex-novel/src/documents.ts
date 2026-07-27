import * as fs from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";
import { atomicWriteText, pathExists, readState } from "./io.js";
import { initializeWorkspace } from "./workspace.js";

type ChapterDocument = {
  chapter: number;
  title: string;
  markdown: string;
  plainText: string;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function markdownToText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
}

function chapterTitle(markdown: string, chapter: number): string {
  const heading = markdown.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading || `第${chapter}章`;
}

async function committedChapters(workspace: string): Promise<ChapterDocument[]> {
  const state = await readState(workspace);
  if (state.continuity.lastCommittedChapter === 0) {
    throw new Error("No continuity-committed chapters are available to export.");
  }
  const chapters: ChapterDocument[] = [];
  for (let chapter = 1; chapter <= state.continuity.lastCommittedChapter; chapter++) {
    const directory = String(chapter).padStart(4, "0");
    const source = path.join(workspace, "chapters", directory, "final.md");
    if (!(await pathExists(source))) {
      throw new Error(`Committed chapter is missing accepted prose: chapters/${directory}/final.md`);
    }
    const markdown = (await fs.readFile(source, "utf8")).trim();
    chapters.push({
      chapter,
      title: chapterTitle(markdown, chapter),
      markdown,
      plainText: markdownToText(markdown)
    });
  }
  return chapters;
}

function paragraphsXml(text: string): string {
  return text
    .split(/\n+/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(paragraph.trim())}</w:t></w:r></w:p>`
    )
    .join("");
}

async function exportDocx(
  workspace: string,
  title: string,
  novelId: string,
  chapters: ChapterDocument[]
): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );
  const body = [
    paragraphsXml(title),
    ...chapters.map((chapter) => paragraphsXml(`${chapter.title}\n${chapter.plainText}`))
  ].join("");
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${body}<w:sectPr/></w:body></w:document>`
  );
  const output = path.join(workspace, "exports", `${novelId}.docx`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return output;
}

async function exportEpub(
  workspace: string,
  title: string,
  novelId: string,
  language: string,
  chapters: ChapterDocument[]
): Promise<string> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF")?.file(
    "container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
      `<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>` +
      `</rootfiles></container>`
  );
  const oebps = zip.folder("OEBPS");
  const manifestItems = chapters
    .map((chapter) => `<item id="c${chapter.chapter}" href="chapter-${chapter.chapter}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("");
  const spineItems = chapters.map((chapter) => `<itemref idref="c${chapter.chapter}"/>`).join("");
  const navItems = chapters
    .map((chapter) => `<li><a href="chapter-${chapter.chapter}.xhtml">${xmlEscape(chapter.title)}</a></li>`)
    .join("");
  oebps?.file(
    "content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">` +
      `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:identifier id="book-id">${xmlEscape(novelId)}</dc:identifier>` +
      `<dc:title>${xmlEscape(title)}</dc:title><dc:language>${xmlEscape(language)}</dc:language>` +
      `<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta>` +
      `</metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>` +
      `${manifestItems}</manifest><spine>${spineItems}</spine></package>`
  );
  oebps?.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xmlEscape(language)}">` +
      `<head><title>${xmlEscape(title)}</title></head><body><nav epub:type="toc"><h1>目录</h1><ol>${navItems}</ol></nav></body></html>`
  );
  for (const chapter of chapters) {
    const paragraphs = chapter.plainText
      .split(/\n+/)
      .filter(Boolean)
      .map((paragraph) => `<p>${xmlEscape(paragraph)}</p>`)
      .join("");
    oebps?.file(
      `chapter-${chapter.chapter}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>` +
        `<html xmlns="http://www.w3.org/1999/xhtml" lang="${xmlEscape(language)}">` +
        `<head><title>${xmlEscape(chapter.title)}</title></head>` +
        `<body><h1>${xmlEscape(chapter.title)}</h1>${paragraphs}</body></html>`
    );
  }
  const output = path.join(workspace, "exports", `${novelId}.epub`);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return output;
}

export async function exportDocument(
  workspace: string,
  format: "docx" | "epub"
): Promise<{ output: string; chapters: number[] }> {
  const state = await readState(workspace);
  const chapters = await committedChapters(workspace);
  const output = format === "docx"
    ? await exportDocx(workspace, state.novel.title, state.novel.id, chapters)
    : await exportEpub(
        workspace,
        state.novel.title,
        state.novel.id,
        state.novel.language,
        chapters
      );
  return { output, chapters: chapters.map((chapter) => chapter.chapter) };
}

function splitManuscript(source: string): string[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const sections: string[] = [];
  let current: string[] = [];
  const heading = /^(?:#{1,2}\s+.+|第[零一二三四五六七八九十百千万两\d]+[章节卷回].*)$/;
  for (const line of lines) {
    if (heading.test(line.trim()) && current.some((item) => item.trim().length > 0)) {
      sections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((item) => item.trim().length > 0)) sections.push(current.join("\n").trim());
  return sections.filter(Boolean);
}

export async function importManuscript(
  workspace: string,
  sourcePath: string,
  title: string
): Promise<{ chapters: number; manifest: string }> {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension !== ".md" && extension !== ".txt") {
    throw new Error("Manuscript import currently supports Markdown (.md) and text (.txt).");
  }
  const source = await fs.readFile(sourcePath, "utf8");
  const chapters = splitManuscript(source);
  if (chapters.length === 0) throw new Error("No manuscript content could be detected.");
  await initializeWorkspace(workspace, { title });
  const importRoot = path.join(workspace, "imports", "chapters");
  await fs.mkdir(importRoot, { recursive: true });
  for (const [index, chapter] of chapters.entries()) {
    await atomicWriteText(
      path.join(importRoot, `${String(index + 1).padStart(4, "0")}.md`),
      `${chapter}\n`
    );
  }
  const manifest = path.join(workspace, "imports", "manifest.json");
  await atomicWriteText(
    manifest,
    `${JSON.stringify({
      schemaVersion: 1,
      importedAt: new Date().toISOString(),
      sourceName: path.basename(sourcePath),
      detectedChapters: chapters.length,
      status: "awaiting-continuity-extraction",
      note: "Imported prose is not accepted canon until Codex extracts and the author confirms continuity."
    }, null, 2)}\n`
  );
  return { chapters: chapters.length, manifest };
}
