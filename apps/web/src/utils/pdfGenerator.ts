import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PdfReportData {
  title: string;
  subtitle?: string;
  dateStr: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: { label: string; value: string }[];
}

export function generatePdfReport(data: PdfReportData, filename: string = 'Shiksha_Academy_Report.pdf') {
  const doc = new jsPDF();

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('SHIKSHA ACADEMY', 14, 15);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Tuition Fee & Academy Administration Report', 14, 23);

  doc.setFontSize(9);
  doc.text(`Generated: ${data.dateStr}`, 150, 23);

  // Sub-header / Title
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title, 14, 44);

  if (data.subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(data.subtitle, 14, 50);
  }

  const startY = data.subtitle ? 56 : 50;

  // Table
  autoTable(doc, {
    startY: startY,
    head: [data.columns],
    body: data.rows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    margin: { left: 14, right: 14 }
  });

  // Totals Section
  if (data.totals && data.totals.length > 0) {
    let finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, finalY, 182, 12 + data.totals.length * 6, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);

    data.totals.forEach((item, idx) => {
      doc.text(`${item.label}:`, 20, finalY + 8 + idx * 6);
      doc.text(item.value, 150, finalY + 8 + idx * 6);
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Shiksha Academy — Authoritative Financial Record System', 14, 287);
    doc.text(`Page ${i} of ${pageCount}`, 180, 287);
  }

  doc.save(filename);
}
