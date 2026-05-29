import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
// Vite ?url suffix bundles the worker as a static asset with a correct URL
// that WebKit in Tauri can actually load — avoids the worker-init hang
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type SupportedFileType = "pdf" | "docx" | "xlsx" | "xls";

export function getSupportedFileType(file: File): SupportedFileType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".xls")) return "xls";
  return null;
}

async function extractPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    if (pageText.trim()) parts.push(pageText);
  }
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

function extractExcel(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const lines: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          if (csv.trim()) {
            lines.push(`--- Sheet: ${sheetName} ---`);
            lines.push(csv);
          }
        }
        resolve(lines.join("\n\n"));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(file);
  });
}

export async function extractTextFromFile(file: File): Promise<string> {
  const type = getSupportedFileType(file);
  if (!type) throw new Error(`Unsupported file type: ${file.name}`);

  const TIMEOUT_MS = 30_000;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("File extraction timed out after 30 s — the PDF may be corrupted or too large.")), TIMEOUT_MS)
  );

  const extract = (() => {
    switch (type) {
      case "pdf":  return extractPdf(file);
      case "docx": return extractDocx(file);
      case "xlsx":
      case "xls":  return extractExcel(file);
    }
  })();

  return Promise.race([extract, timeout]);
}

// Headings that signal the start of a reference list — handles normal, ALL-CAPS,
// inline (no preceding newline), and journal-specific variants like "REFERENCES\n1."
const REFERENCE_SECTION_PATTERNS = [
  /\n\s*(REFERENCES|BIBLIOGRAPHY)\s*\n/,                        // all-caps (Nature, Science, Lancet)
  /\n\s*(references?|bibliography|works\s+cited|literature\s+cited|reference\s+list|citations?)\s*\n/i,
  /\n\s*(references?|bibliography)\s*\r?\n\s*\d+\./i,           // heading immediately followed by "1."
];

// Count how many numbered references appear in a text block.
// Matches [1], 1., 1) at the start of a line (after optional whitespace).
function countNumberedRefs(text: string): number {
  const matches = text.match(/(?:^|\n)\s*(?:\[\d+\]|\d+[\.\)])\s+[A-Z]/g);
  return matches ? matches.length : 0;
}

/**
 * Finds and returns only the reference section from a full document text.
 * Uses multiple fallback strategies to handle multi-column PDF layouts
 * where heading detection often fails.
 */
export function extractReferenceSection(text: string): { refs: string; wasDetected: boolean; estimatedCount: number } {
  // Try each heading pattern in order
  for (const pattern of REFERENCE_SECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const refs = text.slice(match.index + match[0].length).trim();
      if (refs.length > 200) {
        return { refs, wasDetected: true, estimatedCount: countNumberedRefs(refs) };
      }
    }
  }

  // No heading found — try progressively larger windows from the end.
  // Multi-column PDFs need a bigger window because column-interleaved text
  // spreads references across a larger character span.
  for (const fraction of [0.35, 0.45, 0.55]) {
    const start = Math.floor(text.length * (1 - fraction));
    const slice = text.slice(start).trim();
    const count = countNumberedRefs(slice);
    // Accept this window if it contains at least 3 numbered references
    if (count >= 3) {
      return { refs: slice, wasDetected: false, estimatedCount: count };
    }
  }

  // Last resort — take final 55%
  const fallbackStart = Math.floor(text.length * 0.45);
  const refs = text.slice(fallbackStart).trim();
  return { refs, wasDetected: false, estimatedCount: countNumberedRefs(refs) };
}

export function buildVerificationPrompt(filename: string, text: string): string {
  const fileExt = filename.split(".").pop()?.toLowerCase();

  // Excel files: pass the full content (it's already structured)
  if (fileExt === "xlsx" || fileExt === "xls") {
    const truncated = text.length > 40000 ? text.slice(0, 40000) + "\n\n[...truncated]" : text;
    return [
      `I have uploaded a spreadsheet: **${filename}**`,
      ``,
      `Please extract all references/citations from the data below and verify each one.`,
      `Check for hallucinations, retractions, and incorrect metadata.`,
      ``,
      `---`,
      ``,
      truncated,
    ].join("\n");
  }

  // PDF / Word: extract only the reference section — skip the manuscript body
  const { refs, wasDetected, estimatedCount } = extractReferenceSection(text);
  // Fix multi-column PDF artifacts:
  // 1. Spaces inside DOIs: "10.5281/ zenodo.xxx" → "10.5281/zenodo.xxx"
  // 2. Hyphenated word breaks from column wrapping: "urogen-\n  ital" → "urogenital"
  const normalizedRefs = refs
    .replace(/\b(10\.\d{4,})\s*\/\s*/g, "$1/")
    .replace(/(\w)-\s*\n\s*([a-z])/g, "$1$2");
  const truncated = normalizedRefs.length > 40000 ? normalizedRefs.slice(0, 40000) + "\n\n[...truncated]" : normalizedRefs;

  const sectionNote = wasDetected
    ? `The reference section was automatically detected and extracted.`
    : `No explicit "References" heading was found (common in multi-column journal PDFs) — showing the final portion of the document where references typically appear.`;

  const countNote = estimatedCount > 0
    ? `Approximately **${estimatedCount} numbered references** were detected in this section. You MUST verify ALL of them — do not stop after the first batch.`
    : `Verify ALL references found in the text below.`;

  return [
    `I have uploaded a manuscript: **${filename}**`,
    ``,
    sectionNote,
    ``,
    countNote,
    ``,
    `Extract every numbered or author-date reference and verify each one using the citation verification tools. For each reference, parse the doi directly from the reference text (look for patterns like "https://doi.org/10.xxxx/..." or "doi:10.xxxx/..."). Process in batches of 20 if needed but report the combined result for all references.`,
    `Check for hallucinations, retractions, and incorrect metadata.`,
    ``,
    `---`,
    ``,
    truncated,
  ].join("\n");
}
