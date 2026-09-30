/** Browser-only: extract text from a PDF, line by line. Dynamically imported. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 30); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = new Map<number, string[]>();
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      lines.set(y, [...(lines.get(y) ?? []), item.str]);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.join(" "));
    pages.push(`--- Page ${p} ---\n${sorted.join("\n")}`);
  }
  return pages.join("\n").slice(0, 120_000);
}
