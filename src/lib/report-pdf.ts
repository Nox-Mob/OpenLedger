// Client-only PDF export for reports. Loaded dynamically so jsPDF never runs during SSR.
import type { Terms, Terminology } from "@/lib/terminology";
import { accountTypeLabel } from "@/lib/terminology";

type Row = { name: string; totalCents: number };
interface OrgInfo { name: string; orgType: string; currency: string; fiscalYearStartMonth: number }

const GREEN: [number, number, number] = [34, 84, 61];
const INK: [number, number, number] = [40, 36, 30];
const MUTED: [number, number, number] = [120, 112, 100];
const PAPER: [number, number, number] = [246, 242, 233];

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
function prettyDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

async function setup(org: OrgInfo, title: string, subtitle: string, pref: Terminology) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, w, 6, "F");
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(org.name.toUpperCase(), 56, 60);
  doc.setTextColor(...INK);
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.text(title, 56, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, 56, 110);
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(1);
  doc.line(56, 124, w - 56, 124);
  const fy = new Date(2000, org.fiscalYearStartMonth - 1, 1).toLocaleDateString("en-US", { month: "long" });
  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      const h = doc.internal.pageSize.getHeight();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        `Prepared with Open Ledger · Amounts in ${org.currency} · Fiscal year starts ${fy} · Generated ${prettyDate(new Date().toISOString().slice(0, 10))}`,
        56, h - 32,
      );
      doc.text(`Page ${i} of ${pages}`, w - 56, h - 32, { align: "right" });
    }
  };
  return { doc, autoTable, footer };
}

function section(autoTable: any, doc: any, startY: number, heading: string, rows: Row[], totalLabel: string, total: number, currency: string, extra: Row[] = []) {
  autoTable(doc, {
    startY,
    margin: { left: 56, right: 56 },
    head: [[heading, ""]],
    body: [
      ...rows.map((r) => [r.name, money(r.totalCents, currency)]),
      ...extra.map((r) => [{ content: r.name, styles: { fontStyle: "italic", textColor: MUTED } }, money(r.totalCents, currency)]),
      ...(rows.length + extra.length === 0 ? [[{ content: "Nothing recorded", styles: { textColor: MUTED, fontStyle: "italic" } }, ""]] : []),
    ],
    foot: [[totalLabel, money(total, currency)]],
    theme: "plain",
    styles: { font: "helvetica", fontSize: 10, textColor: INK, cellPadding: { top: 6, bottom: 6, left: 8, right: 8 } },
    headStyles: { fillColor: PAPER, textColor: GREEN, fontStyle: "bold", fontSize: 11 },
    footStyles: { fillColor: PAPER, textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", font: "courier" } },
    didParseCell: (d: any) => { if (d.column.index === 1) d.cell.styles.halign = "right"; },
    bodyStyles: { lineColor: [225, 219, 207], lineWidth: { bottom: 0.5 } },
  });
  return (doc as any).lastAutoTable.finalY + 18;
}

function totalBar(doc: any, y: number, label: string, value: string, negative: boolean) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...GREEN);
  doc.roundedRect(56, y, w - 112, 36, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.text(label, 68, y + 23);
  doc.setFont("courier", "bold");
  doc.text(negative ? `(${value.replace("-", "")})` : value, w - 68, y + 23, { align: "right" });
  return y + 54;
}

export async function exportIncomePdf(p: {
  org: OrgInfo; terms: Terms; pref: Terminology; from: string; to: string;
  data: { revenue: Row[]; expenses: Row[]; totalRevenueCents: number; totalExpensesCents: number; netCents: number };
}) {
  const { org, terms, pref, data } = p;
  const { doc, autoTable, footer } = await setup(org, terms.incomeStatement, `For the period ${prettyDate(p.from)} – ${prettyDate(p.to)}`, pref);
  let y = section(autoTable, doc, 142, terms.revenue, data.revenue, `Total ${terms.revenue.toLowerCase()}`, data.totalRevenueCents, org.currency);
  y = section(autoTable, doc, y, terms.expenses, data.expenses, `Total ${terms.expenses.toLowerCase()}`, data.totalExpensesCents, org.currency);
  totalBar(doc, y, terms.netIncome, money(data.netCents, org.currency), data.netCents < 0);
  footer();
  doc.save(`${org.name} - ${terms.incomeStatement} ${p.from} to ${p.to}.pdf`);
}

export async function exportBalancePdf(p: {
  org: OrgInfo; terms: Terms; pref: Terminology; asOf: string;
  data: { assets: Row[]; liabilities: Row[]; equity: Row[]; netIncomeCents: number; totalAssetsCents: number; totalLiabilitiesCents: number; totalEquityCents: number };
}) {
  const { org, terms, pref, data } = p;
  const { doc, autoTable, footer } = await setup(org, terms.balanceSheet, `As of ${prettyDate(p.asOf)}`, pref);
  const assetsL = accountTypeLabel("asset", terms);
  const liabL = accountTypeLabel("liability", terms);
  let y = section(autoTable, doc, 142, assetsL, data.assets, `Total ${assetsL.toLowerCase()}`, data.totalAssetsCents, org.currency);
  y = section(autoTable, doc, y, liabL, data.liabilities, `Total ${liabL.toLowerCase()}`, data.totalLiabilitiesCents, org.currency);
  y = section(autoTable, doc, y, terms.equity, data.equity, `Total ${terms.equity.toLowerCase()}`, data.totalEquityCents, org.currency,
    [{ name: `${terms.netIncome} (all time)`, totalCents: data.netIncomeCents }]);
  const label = terms.levels.liabilities === "accounting" ? `Total ${liabL.toLowerCase()} & ${terms.equity.toLowerCase()}` : `What you owe + ${terms.equity.toLowerCase()}`;
  const sum = data.totalLiabilitiesCents + data.totalEquityCents;
  y = totalBar(doc, y, label, money(sum, org.currency), sum < 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const ok = sum === data.totalAssetsCents;
  doc.text(ok ? (terms.levels.assets === "accounting" ? "Balanced: assets equal liabilities plus equity." : "Everything adds up: what you have equals what you owe plus what's yours.") : "Warning: totals do not balance.", 56, y);
  footer();
  doc.save(`${org.name} - ${terms.balanceSheet} ${p.asOf}.pdf`);
}
