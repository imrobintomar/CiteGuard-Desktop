import type { Citation, Conversation } from "../stores/chatStore";

// ── CSV export ────────────────────────────────────────────────────────────────

function escCsv(v: string | number | undefined): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportCsv(citations: Citation[], filename = "citeguard-report.csv"): void {
  const headers = ["Status", "Confidence %", "Title", "DOI", "Journal", "Year", "Retracted"];
  const rows = citations.map((c) => [
    escCsv(c.status),
    escCsv(c.confidence !== undefined ? Math.round(c.confidence * 100) : ""),
    escCsv(c.title),
    escCsv(c.doi),
    escCsv(c.journal),
    escCsv(c.year),
    escCsv(c.isRetracted ? "YES" : "No"),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  downloadText(csv, filename, "text/csv");
}

// ── BibTeX export ─────────────────────────────────────────────────────────────

export function exportBibtex(citations: Citation[], filename = "citeguard-references.bib"): void {
  const entries = citations
    .filter((c) => c.doi || c.title)
    .map((c, i) => {
      const key = c.doi
        ? c.doi.replace(/[^a-zA-Z0-9]/g, "_")
        : `ref${i + 1}`;
      const lines = [
        `@article{${key},`,
        c.title   ? `  title   = {${c.title}},`   : null,
        c.doi     ? `  doi     = {${c.doi}},`     : null,
        c.journal ? `  journal = {${c.journal}},` : null,
        c.year    ? `  year    = {${c.year}},`    : null,
        c.authors?.length ? `  author  = {${c.authors.join(" and ")}},` : null,
        `}`,
      ].filter(Boolean);
      return lines.join("\n");
    });
  downloadText(entries.join("\n\n"), filename, "text/plain");
}

// ── RIS export ────────────────────────────────────────────────────────────────

export function exportRis(citations: Citation[], filename = "citeguard-references.ris"): void {
  const entries = citations
    .filter((c) => c.doi || c.title)
    .map((c) => {
      const lines = [
        "TY  - JOUR",
        c.title   ? `TI  - ${c.title}`   : null,
        c.doi     ? `DO  - ${c.doi}`     : null,
        c.journal ? `JO  - ${c.journal}` : null,
        c.year    ? `PY  - ${c.year}`    : null,
        ...(c.authors ?? []).map((a) => `AU  - ${a}`),
        "ER  -",
      ].filter(Boolean);
      return lines.join("\n");
    });
  downloadText(entries.join("\n\n"), filename, "application/x-research-info-systems");
}

// ── HTML/Print report ─────────────────────────────────────────────────────────

export function exportHtmlReport(citations: Citation[], convTitle: string): void {
  const statusColor: Record<string, string> = {
    VERIFIED:          "#22c55e",
    LIKELY_VALID:      "#86efac",
    PARTIALLY_CORRECT: "#facc15",
    WEB_RESOURCE:      "#60a5fa",
    PREPRINT:          "#38bdf8",
    UNVERIFIABLE:      "#94a3b8",
    HALLUCINATED:      "#f87171",
    RETRACTED:         "#fb923c",
  };

  const rows = citations.map((c) => {
    const color = statusColor[c.status] ?? "#94a3b8";
    const pct = c.status === "WEB_RESOURCE"
      ? "—"
      : c.confidence !== undefined ? `${Math.round(c.confidence * 100)}%` : "—";
    return `
      <tr>
        <td style="color:${color};font-weight:600">${c.status.replace(/_/g, " ")}</td>
        <td>${pct}</td>
        <td>${c.title ?? "—"}</td>
        <td style="font-family:monospace;font-size:12px">${c.doi ?? "—"}</td>
        <td>${c.journal ?? "—"}</td>
        <td>${c.year ?? "—"}</td>
        <td style="color:${c.isRetracted ? "#f87171" : "inherit"}">${c.isRetracted ? "⚠ YES" : "No"}</td>
      </tr>`;
  }).join("");

  const verified   = citations.filter((c) => c.status === "VERIFIED").length;
  const issues     = citations.filter((c) => ["HALLUCINATED","RETRACTED","PARTIALLY_CORRECT"].includes(c.status)).length;
  const webRes     = citations.filter((c) => c.status === "WEB_RESOURCE").length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CiteGuard Report — ${convTitle}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1e293b; padding: 32px; max-width: 1100px; margin: 0 auto; }
  h1 { color: #1e40af; } h2 { color: #334155; }
  .summary { display:flex; gap:24px; margin:16px 0 24px; }
  .stat { background:#f1f5f9; border-radius:8px; padding:12px 20px; text-align:center; }
  .stat strong { display:block; font-size:1.5rem; color:#1e40af; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th { background:#1e40af; color:white; padding:8px 12px; text-align:left; }
  td { padding:8px 12px; border-bottom:1px solid #e2e8f0; }
  tr:nth-child(even) td { background:#f8fafc; }
  .footer { margin-top:32px; font-size:12px; color:#94a3b8; }
</style>
</head>
<body>
<h1>🛡️ CiteGuard Verification Report</h1>
<p><strong>Session:</strong> ${convTitle} &nbsp;|&nbsp; <strong>Generated:</strong> ${new Date().toLocaleString()}</p>
<div class="summary">
  <div class="stat"><strong>${citations.length}</strong>Total</div>
  <div class="stat"><strong style="color:#22c55e">${verified}</strong>Verified</div>
  <div class="stat"><strong style="color:#f87171">${issues}</strong>Issues</div>
  <div class="stat"><strong style="color:#60a5fa">${webRes}</strong>Web Resources</div>
</div>
<table>
  <thead><tr><th>Status</th><th>Confidence</th><th>Title</th><th>DOI</th><th>Journal</th><th>Year</th><th>Retracted</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Generated by CiteGuard Desktop · ${new Date().getFullYear()}</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.print();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function allCitationsFromConversation(conv: Conversation): Citation[] {
  return conv.messages.flatMap((m) => m.citations ?? []);
}
