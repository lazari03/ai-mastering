import PDFDocument from "pdfkit";

// One generic report renderer reused by every admin report — a title
// header, a grid of stat boxes, then zero or more simple bordered tables —
// rather than a bespoke layout per report. Functional/internal-report
// looking on purpose (see the PDF-library decision in the plan this
// implements): no headless browser, no HTML/CSS, just pdfkit primitives.
// Returns a Buffer (these reports are small — a handful of stat cards and
// one table for a bounded date range — so buffering fully in memory before
// sending is simpler than streaming, and keeps route handlers trivial).

const PAGE_MARGIN = 40;
const ACCENT = "#c9862f"; // brass-ish, close to the dashboard's own accent
const INK = "#1a1a1a";
const MUTED = "#666666";
const BORDER = "#cccccc";

function drawStatCards(doc, statCards) {
  if (!statCards?.length) return;
  const cols = 3;
  const gap = 12;
  const cardWidth = (doc.page.width - PAGE_MARGIN * 2 - gap * (cols - 1)) / cols;
  const cardHeight = 54;
  let x = PAGE_MARGIN;
  let y = doc.y;
  statCards.forEach((card, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) y += cardHeight + gap;
    x = PAGE_MARGIN + col * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4).stroke(BORDER);
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(String(card.label || "").toUpperCase(), x + 8, y + 8, { width: cardWidth - 16 });
    doc
      .fontSize(15)
      .fillColor(INK)
      .text(`${card.value ?? ""}${card.suffix || ""}`, x + 8, y + 22, { width: cardWidth - 16 });
  });
  doc.y = y + cardHeight + 20;
  doc.x = PAGE_MARGIN;
}

function drawTable(doc, section) {
  const { title, columns, rows } = section;
  if (title) {
    doc.fontSize(12).fillColor(INK).text(title, PAGE_MARGIN, doc.y);
    doc.moveDown(0.4);
  }
  if (!rows?.length) {
    doc.fontSize(9).fillColor(MUTED).text("No data for this period.", PAGE_MARGIN);
    doc.moveDown(1);
    return;
  }

  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = tableWidth / columns.length;
  const rowHeight = 18;
  let y = doc.y;

  const drawRow = (values, isHeader) => {
    if (y > doc.page.height - PAGE_MARGIN - rowHeight) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    values.forEach((val, i) => {
      doc
        .fontSize(8)
        .fillColor(isHeader ? INK : "#333333")
        .font(isHeader ? "Helvetica-Bold" : "Helvetica")
        .text(String(val ?? ""), PAGE_MARGIN + i * colWidth, y + 4, { width: colWidth - 6, ellipsis: true });
    });
    doc
      .moveTo(PAGE_MARGIN, y + rowHeight)
      .lineTo(PAGE_MARGIN + tableWidth, y + rowHeight)
      .strokeColor(BORDER)
      .stroke();
    y += rowHeight;
  };

  drawRow(
    columns.map((c) => c.label),
    true
  );
  for (const row of rows) {
    drawRow(columns.map((c) => (c.render ? c.render(row) : row[c.key])));
  }
  doc.y = y + 14;
  doc.x = PAGE_MARGIN;
}

export function buildReportPdf({ title, dateRange, statCards, tableSections }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(8).fillColor(ACCENT).text("AURALITH FORGE — ADMIN REPORT", PAGE_MARGIN, PAGE_MARGIN);
    doc.moveDown(0.3);
    doc.fontSize(18).fillColor(INK).text(title || "Report");
    if (dateRange) {
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor(MUTED).text(dateRange);
    }
    doc.moveDown(0.6);
    doc.fontSize(8).fillColor(MUTED).text(`Generated ${new Date().toISOString()}`);
    doc.moveDown(1);

    drawStatCards(doc, statCards);
    for (const section of tableSections || []) {
      drawTable(doc, section);
    }

    doc.end();
  });
}
