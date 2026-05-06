import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFImage, RGB } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { BARANGAY } from '../config/constants';
import { db, storage } from '../config/firebase';
import * as admin from 'firebase-admin';

// A4 page dimensions in points (1 inch = 72 pts)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 57; // ~2 cm
const PRIMARY = rgb(0.07, 0.23, 0.37); // #1e3a5f
const GOLD = rgb(0.55, 0.42, 0.07);
const DARK = rgb(0.1, 0.1, 0.1);
const MID = rgb(0.4, 0.4, 0.4);

interface RequestData {
  trackingId: string;
  documentType: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  birthdate: string;
  age: number;
  gender: string;
  civilStatus: string;
  purokSitio: string;
  streetAddress?: string;
  purpose: string;
  createdAt: any;
  fees?: Array<{ description: string; amount: number }>;
  totalFees?: number;
  isPaid?: boolean;
  captainName?: string;
  captainSignatureUrl?: string;
  qrCodeDataUrl?: string;
}

// Helper: draw centered text
function drawCenteredText(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB = rgb(0, 0, 0)) {
  const textWidth = font.widthOfTextAtSize(text, size);
  const { width } = page.getSize();
  page.drawText(text, { x: (width - textWidth) / 2, y, font, size, color });
}

// Helper: draw full-width horizontal rule between two x positions
function drawLine(page: PDFPage, y: number, x1 = MARGIN, x2?: number, color = GOLD, thickness = 0.8) {
  const { width } = page.getSize();
  page.drawLine({ start: { x: x1, y }, end: { x: x2 ?? width - MARGIN, y }, thickness, color });
}

// Helper: wrap text into lines that fit within maxWidth
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Helper: draw wrapped paragraph, returns new y
function drawParagraph(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, lineHeight = 18, color: RGB = DARK): number {
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    page.drawText(line, { x, y, font, size, color });
    y -= lineHeight;
  }
  return y;
}

// Helper: decorative double border
function addPageBorder(page: PDFPage) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: PRIMARY, borderWidth: 2 });
  page.drawRectangle({ x: 23, y: 23, width: width - 46, height: height - 46, borderColor: GOLD, borderWidth: 0.6 });
}

// Load logo bytes once (cached after first call)
let _logoBytes: Buffer | null = null;
function getLogoBytes(): Buffer | null {
  if (_logoBytes) return _logoBytes;
  const p = path.join(__dirname, '../../../assets/logo/sirangan-bg.png');
  if (fs.existsSync(p)) {
    _logoBytes = fs.readFileSync(p);
    return _logoBytes;
  }
  return null;
}

// Header shared by all documents – returns Y position below header
async function addDocumentHeader(pdfDoc: PDFDocument, page: PDFPage, boldFont: PDFFont, regularFont: PDFFont, documentTitle: string): Promise<number> {
  const { height } = page.getSize();
  addPageBorder(page);

  // Try to embed logo
  let logoImage: PDFImage | null = null;
  try {
    const logoBytes = getLogoBytes();
    if (logoBytes) logoImage = await pdfDoc.embedPng(logoBytes);
  } catch { /* no logo fallback */ }

  const logoSize = 60;
  const logoY = height - 30 - logoSize;

  if (logoImage) {
    page.drawImage(logoImage, { x: (A4_WIDTH - logoSize) / 2, y: logoY, width: logoSize, height: logoSize });
  }

  const textStart = logoImage ? logoY - 14 : height - 50;

  drawCenteredText(page, 'Republic of the Philippines', textStart, regularFont, 8.5, MID);
  drawCenteredText(page, 'Province of Sorsogon', textStart - 12, regularFont, 8.5, MID);
  drawCenteredText(page, 'City of Sorsogon', textStart - 24, regularFont, 8.5, MID);
  drawCenteredText(page, BARANGAY.name.toUpperCase(), textStart - 40, boldFont, 15, PRIMARY);

  const divY = textStart - 52;
  drawLine(page, divY);

  drawCenteredText(page, documentTitle.toUpperCase(), divY - 18, boldFont, 14, PRIMARY);

  const divY2 = divY - 30;
  drawLine(page, divY2);

  return divY2 - 22; // content starts here
}

// Signature block (returns y after block)
function addSignatureBlock(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont, captainName: string, y: number): number {
  const sigX = MARGIN;
  const lineEndX = MARGIN + 200;

  page.drawText('Attested by:', { x: sigX, y, font: regularFont, size: 10, color: DARK });
  y -= 45;
  page.drawLine({ start: { x: sigX, y: y + 8 }, end: { x: lineEndX, y: y + 8 }, thickness: 1, color: DARK });
  page.drawText(captainName.toUpperCase(), { x: sigX, y, font: boldFont, size: 11, color: PRIMARY });
  y -= 14;
  page.drawText('Punong Barangay', { x: sigX, y, font: regularFont, size: 9, color: DARK });
  y -= 12;
  page.drawText(BARANGAY.name, { x: sigX, y, font: regularFont, size: 9, color: MID });
  return y - 10;
}

// Footer with tracking info
function addFooter(page: PDFPage, italicFont: PDFFont, trackingId: string) {
  const y = 34;
  drawLine(page, y + 14);
  page.drawText(
    `Tracking ID: ${trackingId}  |  This document is electronically generated by the Barangay Sirangan Digital Portal`,
    { x: MARGIN, y, font: italicFont, size: 7.5, color: MID },
  );
}

// Control number + date line
function addControlDateLine(page: PDFPage, regularFont: PDFFont, trackingId: string, y: number, label = 'Control No.') {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  page.drawText(`${label}: ${trackingId}`, { x: MARGIN, y, font: regularFont, size: 9, color: MID });
  const dateText = `Date: ${dateStr}`;
  const dateW = regularFont.widthOfTextAtSize(dateText, 9);
  page.drawText(dateText, { x: A4_WIDTH - MARGIN - dateW, y, font: regularFont, size: 9, color: MID });
}

// Fee box (right side)
function addFeeBox(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont, fees: Array<{ description: string; amount: number }> | undefined, totalFees: number | undefined, y: number) {
  if (!totalFees && (!fees || !fees.length)) return;
  const total = totalFees ?? (fees ?? []).reduce((s, f) => s + (parseFloat(String(f.amount)) || 0), 0);
  if (total <= 0) return;
  const bx = A4_WIDTH - MARGIN - 160;
  const by = y - 55;
  page.drawRectangle({ x: bx, y: by, width: 160, height: 65, borderColor: PRIMARY, borderWidth: 1 });
  page.drawRectangle({ x: bx, y: by + 45, width: 160, height: 20, color: PRIMARY });
  const feeLabel = 'OFFICIAL FEES';
  const feeLabelW = boldFont.widthOfTextAtSize(feeLabel, 9);
  page.drawText(feeLabel, { x: bx + (160 - feeLabelW) / 2, y: by + 50, font: boldFont, size: 9, color: rgb(1, 1, 1) });
  page.drawText(`\u20B1${total.toFixed(2)}`, { x: bx + 10, y: by + 26, font: boldFont, size: 16, color: PRIMARY });
  page.drawText(total > 0 ? 'Amount Due' : 'No Fee', { x: bx + 10, y: by + 10, font: regularFont, size: 8, color: MID });
}

// Full name helper
function fullName(data: RequestData): string {
  return `${data.firstName} ${data.middleName ? data.middleName + ' ' : ''}${data.lastName}`;
}

// Address helper
function address(data: RequestData): string {
  const purok = data.purokSitio || '';
  const street = data.streetAddress || '';
  const parts = [purok, street].filter(Boolean);
  return `${parts.join(', ')}, ${BARANGAY.name}, Sorsogon City, Sorsogon`;
}

const DEFAULT_CAPTAIN = 'Paquito Eduarte';

// Generate Barangay Clearance
export async function generateBarangayClearance(data: RequestData, captainName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'Barangay Clearance');

  addControlDateLine(page, regularFont, data.trackingId, y);
  y -= 30;

  drawCenteredText(page, 'TO WHOM IT MAY CONCERN:', y, boldFont, 11, DARK);
  y -= 28;

  const name = fullName(data).toUpperCase();
  const addr = address(data);
  const contentW = A4_WIDTH - MARGIN * 2;

  const paragraphs = [
    `       This is to certify that ${name}, ${data.age || ''} years old, ${data.civilStatus || ''}, ${data.gender || ''}, a resident of ${addr}, is personally known to this office and is a bonafide resident of this barangay.`,
    `       This further certifies that he/she has no derogatory record filed in this office and is a person of good moral character and law-abiding citizen of this community.`,
    `       This certification is being issued upon the request of the above-named person for the purpose of ${data.purpose} and for whatever legal purpose it may serve.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 10;
  }

  y -= 10;
  page.drawText('Valid for six (6) months from date of issue.', { x: MARGIN, y, font: italicFont, size: 9, color: MID });
  y -= 40;

  addFeeBox(page, boldFont, regularFont, data.fees, data.totalFees, y + 55);
  addSignatureBlock(page, boldFont, regularFont, captainName || DEFAULT_CAPTAIN, y);
  addFooter(page, italicFont, data.trackingId);

  return Buffer.from(await pdfDoc.save());
}

// Generate Certificate of Residency
export async function generateCertificateOfResidency(data: RequestData, captainName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'Certificate of Residency');

  addControlDateLine(page, regularFont, data.trackingId, y);
  y -= 30;

  drawCenteredText(page, 'TO WHOM IT MAY CONCERN:', y, boldFont, 11, DARK);
  y -= 28;

  const name = fullName(data).toUpperCase();
  const addr = address(data);
  const contentW = A4_WIDTH - MARGIN * 2;

  const paragraphs = [
    `       This is to certify that ${name}, ${data.age || ''} years old, ${data.civilStatus || ''}, ${data.gender || ''}, is a bonafide resident of ${addr}.`,
    `       This certification is issued to attest to the above-named person's residency in this barangay for a period of more than six (6) months.`,
    `       This certification is being issued upon the request of the above-named person for the purpose of ${data.purpose} and for whatever legal purpose it may serve.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 10;
  }

  y -= 40;
  addSignatureBlock(page, boldFont, regularFont, captainName || DEFAULT_CAPTAIN, y);
  addFooter(page, italicFont, data.trackingId);

  return Buffer.from(await pdfDoc.save());
}

// Generate Certificate of Indigency
export async function generateCertificateOfIndigency(data: RequestData, captainName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'Certificate of Indigency');

  addControlDateLine(page, regularFont, data.trackingId, y);
  y -= 30;

  drawCenteredText(page, 'TO WHOM IT MAY CONCERN:', y, boldFont, 11, DARK);
  y -= 28;

  const name = fullName(data).toUpperCase();
  const addr = address(data);
  const contentW = A4_WIDTH - MARGIN * 2;

  const paragraphs = [
    `       This is to certify that ${name}, ${data.age || ''} years old, ${data.civilStatus || ''}, ${data.gender || ''}, a resident of ${addr}, belongs to the indigent sector of our community.`,
    `       This further certifies that the above-named person and his/her family are among the economically disadvantaged members of our community who are dependent on daily wages or minimum income for livelihood.`,
    `       This certification is being issued upon his/her request for the purpose of ${data.purpose} and for whatever legal purpose it may serve.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 10;
  }

  y -= 40;
  addSignatureBlock(page, boldFont, regularFont, captainName || DEFAULT_CAPTAIN, y);
  addFooter(page, italicFont, data.trackingId);

  return Buffer.from(await pdfDoc.save());
}

// Generate Business Permit Endorsement
export async function generateBusinessPermitEndorsement(data: RequestData, captainName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'Business Permit Endorsement');

  addControlDateLine(page, regularFont, data.trackingId, y, 'Ref. No.');
  y -= 30;

  drawCenteredText(page, 'TO THE CITY BUSINESS PERMIT AND LICENSING OFFICE', y, boldFont, 10, DARK);
  y -= 16;
  drawCenteredText(page, 'City of Sorsogon, Sorsogon', y, regularFont, 10, MID);
  y -= 30;

  const name = fullName(data).toUpperCase();
  const addr = address(data);
  const contentW = A4_WIDTH - MARGIN * 2;

  const paragraphs = [
    `       This is to endorse ${name}, a bonafide resident of ${addr}, who is applying for a business permit/license.`,
    `       This endorsement certifies that the above-named person is known to this office and that the establishment is located within the jurisdiction of ${BARANGAY.name}, Sorsogon City.`,
    `       Purpose: ${data.purpose}`,
    `       We recommend favorable action on this application.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 10;
  }

  y -= 40;
  addSignatureBlock(page, boldFont, regularFont, captainName || DEFAULT_CAPTAIN, y);
  addFooter(page, italicFont, data.trackingId);

  return Buffer.from(await pdfDoc.save());
}

// Generate Incident Report
export async function generateIncidentReport(data: RequestData, captainName: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'Incident Report');

  addControlDateLine(page, regularFont, data.trackingId, y, 'Report No.');
  y -= 35;

  const name = fullName(data);
  const addr = address(data);
  const contentW = A4_WIDTH - MARGIN * 2;

  // Complainant info section
  page.drawText('COMPLAINANT INFORMATION', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 5;
  drawLine(page, y, MARGIN, A4_WIDTH - MARGIN, PRIMARY, 0.5);
  y -= 18;

  const fields: [string, string][] = [
    ['Name', name],
    ['Age', String(data.age || 'N/A')],
    ['Gender', data.gender || 'N/A'],
    ['Civil Status', data.civilStatus || 'N/A'],
    ['Address', addr],
  ];

  for (const [label, value] of fields) {
    page.drawText(`${label}:`, { x: MARGIN, y, font: boldFont, size: 10, color: MID });
    y = drawParagraph(page, value, MARGIN + 100, y, regularFont, 10, contentW - 100, 16, DARK);
    y -= 4;
  }

  y -= 12;
  page.drawText('INCIDENT DETAILS', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 5;
  drawLine(page, y, MARGIN, A4_WIDTH - MARGIN, PRIMARY, 0.5);
  y -= 18;

  page.drawText('Nature / Description of Incident:', { x: MARGIN, y, font: boldFont, size: 10, color: MID });
  y -= 16;
  y = drawParagraph(page, `       ${data.purpose}`, MARGIN, y, regularFont, 11, contentW, 18, DARK);

  y -= 40;

  // Dual signature: Secretary + Captain
  const secX = MARGIN;
  const capX = A4_WIDTH / 2 + 20;

  page.drawText('Prepared by:', { x: secX, y, font: regularFont, size: 9, color: DARK });
  page.drawText('Noted by:', { x: capX, y, font: regularFont, size: 9, color: DARK });
  y -= 40;

  page.drawLine({ start: { x: secX, y: y + 8 }, end: { x: secX + 170, y: y + 8 }, thickness: 1, color: DARK });
  page.drawLine({ start: { x: capX, y: y + 8 }, end: { x: capX + 170, y: y + 8 }, thickness: 1, color: DARK });

  page.drawText('Barangay Secretary', { x: secX, y, font: regularFont, size: 9, color: DARK });
  page.drawText((captainName || DEFAULT_CAPTAIN).toUpperCase(), { x: capX, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 13;
  page.drawText('Punong Barangay', { x: capX, y, font: regularFont, size: 9, color: DARK });
  y -= 12;
  page.drawText(BARANGAY.name, { x: capX, y, font: regularFont, size: 9, color: MID });

  addFooter(page, italicFont, data.trackingId);

  return Buffer.from(await pdfDoc.save());
}

// Generate DTS Slip (2 copies on one page)
export async function generateDTSSlip(data: RequestData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 500]); // Shorter page for slip
  const { width, height } = page.getSize();

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const docTypeLabel: Record<string, string> = {
    BARANGAY_CLEARANCE: 'Barangay Clearance',
    CERTIFICATE_OF_RESIDENCY: 'Certificate of Residency',
    CERTIFICATE_OF_INDIGENCY: 'Certificate of Indigency',
    BUSINESS_PERMIT_ENDORSEMENT: 'Business Permit Endorsement',
    INCIDENT_REPORT: 'Incident Report',
  };


  const docType = docTypeLabel[data.documentType] || data.documentType;
  const fullName = `${data.firstName} ${data.middleName ? data.middleName + ' ' : ''}${data.lastName}`;

  // Draw a single copy
  function drawCopy(startY: number, label: string) {
    const boxHeight = 210;

    // Border
    page.drawRectangle({ x: 30, y: startY - boxHeight, width: width - 60, height: boxHeight, borderColor: rgb(0.07, 0.23, 0.37), borderWidth: 2 });

    // Header bar
    page.drawRectangle({ x: 30, y: startY - 30, width: width - 60, height: 30, color: rgb(0.07, 0.23, 0.37) });
    const headerText = `BARANGAY SIRANGAN - DOCUMENT TRACKING SLIP (${label})`;
    const headerWidth = boldFont.widthOfTextAtSize(headerText, 9);
    page.drawText(headerText, { x: (width - headerWidth) / 2, y: startY - 20, font: boldFont, size: 9, color: rgb(1, 1, 1) });

    let y = startY - 50;

    // Left side content
    page.drawText('Tracking ID:', { x: 45, y, font: boldFont, size: 9 });
    page.drawText(data.trackingId, { x: 130, y, font: boldFont, size: 11, color: rgb(0.07, 0.23, 0.37) });
    y -= 18;

    page.drawText('Resident Name:', { x: 45, y, font: boldFont, size: 9 });
    page.drawText(fullName, { x: 130, y, font: regularFont, size: 9 });
    y -= 15;

    page.drawText('Document:', { x: 45, y, font: boldFont, size: 9 });
    page.drawText(docType, { x: 130, y, font: regularFont, size: 9 });
    y -= 15;

    page.drawText('Purpose:', { x: 45, y, font: boldFont, size: 9 });
    const purposeTrunc = data.purpose.length > 45 ? data.purpose.substring(0, 45) + '...' : data.purpose;
    page.drawText(purposeTrunc, { x: 130, y, font: regularFont, size: 8 });
    y -= 15;

    page.drawText('Date Submitted:', { x: 45, y, font: boldFont, size: 9 });
    page.drawText(dateStr, { x: 130, y, font: regularFont, size: 9 });
    y -= 15;


    // QR Code placeholder area (right side)
    page.drawRectangle({ x: width - 130, y: startY - 175, width: 85, height: 85, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
    page.drawText('QR CODE', { x: width - 113, y: startY - 128, font: boldFont, size: 7, color: rgb(0.6, 0.6, 0.6) });
    page.drawText(data.trackingId, { x: width - 130, y: startY - 182, font: regularFont, size: 6, color: rgb(0.4, 0.4, 0.4) });

    // Instructions
    page.drawText('Scan QR or enter Tracking ID at:', { x: 45, y, font: italicFont, size: 8, color: rgb(0.4, 0.4, 0.4) });
    y -= 12;
    page.drawText('http://localhost:3000/track.html', { x: 45, y, font: regularFont, size: 8, color: rgb(0.07, 0.23, 0.37) });
  }

  // Draw Office Copy (top)
  drawCopy(height - 20, 'OFFICE COPY');

  // Dashed divider
  page.drawLine({ start: { x: 30, y: height / 2 - 5 }, end: { x: width - 30, y: height / 2 - 5 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5), dashArray: [5, 5] });
  page.drawText('CUT HERE', { x: width / 2 - 20, y: height / 2 - 3, font: regularFont, size: 7, color: rgb(0.5, 0.5, 0.5) });

  // Draw Client Copy (bottom)
  drawCopy(height / 2 - 15, 'CLIENT COPY');

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// Main generator function
export async function generateDocumentPDF(requestId: string): Promise<{ buffer: Buffer; filename: string }> {
  const docSnap = await db().collection('requests').doc(requestId).get();
  if (!docSnap.exists) throw new Error('Request not found');

  const data = docSnap.data() as RequestData;

  // Get captain name from config
  const configSnap = await db().collection('_config').doc('barangay').get();
  const captainName = configSnap.exists ? (configSnap.data()?.captainName || '') : '';

  let buffer: Buffer;
  const filename = `${data.trackingId}_${data.documentType}.pdf`;

  switch (data.documentType) {
    case 'BARANGAY_CLEARANCE':
      buffer = await generateBarangayClearance(data, captainName);
      break;
    case 'CERTIFICATE_OF_RESIDENCY':
      buffer = await generateCertificateOfResidency(data, captainName);
      break;
    case 'CERTIFICATE_OF_INDIGENCY':
      buffer = await generateCertificateOfIndigency(data, captainName);
      break;
    case 'BUSINESS_PERMIT_ENDORSEMENT':
      buffer = await generateBusinessPermitEndorsement(data, captainName);
      break;
    case 'INCIDENT_REPORT':
      buffer = await generateIncidentReport(data, captainName);
      break;
    default:
      throw new Error(`Unknown document type: ${data.documentType}`);
  }

  // Upload to Firebase Storage
  const storageFile = storage().file(`documents/${filename}`);
  await storageFile.save(buffer, { metadata: { contentType: 'application/pdf' } });

  // Update request with PDF URL
  const [signedUrl] = await storageFile.getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
  });

  await db().collection('requests').doc(requestId).update({
    pdfUrl: signedUrl,
    pdfGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { buffer, filename };
}

// ─── BLOTTER CERTIFICATION (short) ────────────────────────────────────────────
export interface BlotterData {
  caseNumber: string;
  incidentDate: string;
  incidentTime: string;
  incidentLocation: string;
  natureOfComplaint: string;
  narrative: string;
  complainant: {
    firstName: string;
    middleName?: string;
    lastName: string;
    address?: string;
    contactNumber?: string;
    age?: number;
    gender?: string;
  };
  respondent: {
    firstName: string;
    middleName?: string;
    lastName: string;
    address?: string;
    contactNumber?: string;
    age?: number;
    gender?: string;
  };
  status: string;
  blotterBookPage?: string;
  hearings?: Array<{
    date: string;
    time: string;
    venue?: string;
    notes?: string;
    attendance?: Array<{ partyType: string; name: string; attended: boolean }>;
  }>;
  resolutionNotes?: string;
  settlementTerms?: string;
  escalationReason?: string;
  kpChecklist?: {
    summonsIssuedToComplainant: boolean;
    summonsIssuedToRespondent: boolean;
    firstHearingConducted: boolean;
    secondHearingConducted: boolean;
    thirdHearingConducted: boolean;
  };
  filedByName?: string;
  createdAt?: any;
  captainName?: string;
}

function blotterPartyFullName(p: { firstName: string; middleName?: string; lastName: string }): string {
  return `${p.firstName} ${p.middleName ? p.middleName + ' ' : ''}${p.lastName}`.trim();
}

function blotterFooter(page: PDFPage, italicFont: PDFFont, caseNumber: string) {
  const y = 34;
  drawLine(page, y + 14);
  page.drawText(
    `Case No.: ${caseNumber}  |  This document is electronically generated by the Barangay Sirangan Digital Portal`,
    { x: MARGIN, y, font: italicFont, size: 7.5, color: MID },
  );
}

// Short Blotter Certification — official document that a blotter was filed
export async function generateBlotterCertification(data: BlotterData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'BLOTTER CERTIFICATION');

  const captainName = data.captainName || DEFAULT_CAPTAIN;
  const contentW = A4_WIDTH - MARGIN * 2;

  // Control number & date
  addControlDateLine(page, regularFont, data.caseNumber, y, 'Case No.');
  y -= 30;

  drawCenteredText(page, 'TO WHOM IT MAY CONCERN:', y, boldFont, 11, DARK);
  y -= 28;

  const complainantName = blotterPartyFullName(data.complainant).toUpperCase();
  const today = new Date();
  const filedDateStr = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : today.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const incidentDateStr = data.incidentDate
    ? new Date(data.incidentDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  const statusLabel: Record<string, string> = {
    OPEN: 'Open / Pending', UNDER_MEDIATION: 'Under Mediation', SETTLED: 'Settled',
    ESCALATED: 'Escalated to Higher Authority', ESCALATED_RETURNED: 'Returned from Escalation', DISMISSED: 'Dismissed',
  };

  const paragraphs = [
    `       This is to certify that a blotter entry has been filed in this office by ${complainantName}, a resident of ${BARANGAY.name}, ${BARANGAY.municipality}, ${BARANGAY.province}.`,
    `       The said blotter entry, docketed as Case No. ${data.caseNumber}${data.blotterBookPage ? `, Page ${data.blotterBookPage} of the Official Blotter Book,` : ','} pertains to a complaint for ${data.natureOfComplaint}, allegedly committed on ${incidentDateStr} at ${data.incidentLocation}.`,
    `       This certification is issued upon the request of the above-named complainant and to attest that the same case is on record in this office as of this date, with current status: ${statusLabel[data.status] || data.status}.`,
    `       This certification is issued for whatever legal purpose it may serve.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 12;
  }

  y -= 20;
  addSignatureBlock(page, boldFont, regularFont, captainName, y);
  blotterFooter(page, italicFont, data.caseNumber);

  return Buffer.from(await pdfDoc.save());
}

// Full Blotter Case Summary — comprehensive internal document
export async function generateBlotterSummary(data: BlotterData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const captainName = data.captainName || DEFAULT_CAPTAIN;
  const contentW = A4_WIDTH - MARGIN * 2;

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'BLOTTER CASE SUMMARY');

  addControlDateLine(page, regularFont, data.caseNumber, y, 'Case No.');
  y -= 24;

  if (data.blotterBookPage) {
    page.drawText(`Blotter Book Page: ${data.blotterBookPage}`, { x: MARGIN, y, font: regularFont, size: 9, color: MID });
    y -= 18;
  }

  const statusLabel: Record<string, string> = {
    OPEN: 'Open / Pending', UNDER_MEDIATION: 'Under Mediation', SETTLED: 'Settled',
    ESCALATED: 'Escalated to Higher Authority', ESCALATED_RETURNED: 'Returned from Escalation', DISMISSED: 'Dismissed',
  };

  // Status badge
  page.drawText('Status: ', { x: MARGIN, y, font: boldFont, size: 10, color: MID });
  page.drawText(statusLabel[data.status] || data.status, { x: MARGIN + 45, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 20;

  drawLine(page, y);
  y -= 16;

  // ── Incident Information ───────────────────────────────────────────────────
  page.drawText('INCIDENT INFORMATION', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 5; drawLine(page, y, MARGIN, A4_WIDTH - MARGIN, PRIMARY, 0.5); y -= 14;

  const incidentFields: [string, string][] = [
    ['Date of Incident', data.incidentDate ? new Date(data.incidentDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'],
    ['Time of Incident', data.incidentTime || 'N/A'],
    ['Location', data.incidentLocation || 'N/A'],
    ['Nature of Complaint', data.natureOfComplaint || 'N/A'],
  ];
  for (const [label, val] of incidentFields) {
    page.drawText(`${label}:`, { x: MARGIN, y, font: boldFont, size: 9, color: MID });
    y = drawParagraph(page, val, MARGIN + 130, y, regularFont, 9, contentW - 130, 14, DARK);
    y -= 4;
  }
  y -= 6;
  page.drawText('Narrative:', { x: MARGIN, y, font: boldFont, size: 9, color: MID }); y -= 14;
  const narrativeTrunc = (data.narrative || '').substring(0, 800);
  y = drawParagraph(page, `       ${narrativeTrunc}${data.narrative && data.narrative.length > 800 ? '...' : ''}`, MARGIN, y, regularFont, 9, contentW, 14, DARK);
  y -= 14;

  // ── Parties ────────────────────────────────────────────────────────────────
  const partyColW = (contentW - 10) / 2;
  page.drawText('COMPLAINANT', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
  page.drawText('RESPONDENT', { x: MARGIN + partyColW + 10, y, font: boldFont, size: 10, color: PRIMARY });
  y -= 5;
  drawLine(page, y, MARGIN, MARGIN + partyColW, PRIMARY, 0.5);
  drawLine(page, y, MARGIN + partyColW + 10, A4_WIDTH - MARGIN, PRIMARY, 0.5);
  y -= 14;

  const parties = [data.complainant, data.respondent];

  const partyStartY = y;
  for (let col = 0; col < 2; col++) {
    let py = partyStartY;
    const px = col === 0 ? MARGIN : MARGIN + partyColW + 10;
    const party = parties[col] as any;
    const pname = blotterPartyFullName(party);
    page.drawText('Name:', { x: px, y: py, font: boldFont, size: 8.5, color: MID });
    py = drawParagraph(page, pname, px + 55, py, regularFont, 8.5, partyColW - 60, 13, DARK); py -= 4;
    if (party.address) {
      page.drawText('Address:', { x: px, y: py, font: boldFont, size: 8.5, color: MID });
      py = drawParagraph(page, party.address || 'N/A', px + 55, py, regularFont, 8.5, partyColW - 60, 13, DARK); py -= 4;
    }
    if (party.contactNumber) {
      page.drawText('Contact:', { x: px, y: py, font: boldFont, size: 8.5, color: MID });
      page.drawText(party.contactNumber, { x: px + 55, y: py, font: regularFont, size: 8.5, color: DARK }); py -= 16;
    }
    if (party.age) {
      page.drawText(`Age/Gender:`, { x: px, y: py, font: boldFont, size: 8.5, color: MID });
      page.drawText(`${party.age || ''}${party.gender ? ', ' + party.gender : ''}`, { x: px + 65, y: py, font: regularFont, size: 8.5, color: DARK }); py -= 16;
    }
  }

  // Find the lower of two columns
  y = Math.min(partyStartY - 60, y - 10);
  y -= 10;

  // ── Hearings ───────────────────────────────────────────────────────────────
  if (data.hearings && data.hearings.length > 0) {
    page.drawText('HEARING RECORDS', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
    y -= 5; drawLine(page, y, MARGIN, A4_WIDTH - MARGIN, PRIMARY, 0.5); y -= 14;

    for (let i = 0; i < Math.min(data.hearings.length, 4); i++) {
      const h = data.hearings[i];
      if (y < 120) break;
      const hDateStr = h.date ? new Date(h.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';
      page.drawText(`Hearing ${i + 1}: ${hDateStr} at ${h.time || 'N/A'}${h.venue ? ' — ' + h.venue : ''}`, { x: MARGIN, y, font: regularFont, size: 9, color: DARK });
      y -= 14;
      if (h.notes) {
        y = drawParagraph(page, `  Notes: ${h.notes}`, MARGIN + 10, y, italicFont, 8, contentW - 10, 13, MID);
        y -= 4;
      }
    }
    y -= 6;
  }

  // ── Resolution ─────────────────────────────────────────────────────────────
  if (data.resolutionNotes || data.settlementTerms || data.escalationReason) {
    if (y < 130) {
      // skip if no space — page would overflow
    } else {
      page.drawText('RESOLUTION / OUTCOME', { x: MARGIN, y, font: boldFont, size: 10, color: PRIMARY });
      y -= 5; drawLine(page, y, MARGIN, A4_WIDTH - MARGIN, PRIMARY, 0.5); y -= 14;
      if (data.resolutionNotes) {
        page.drawText('Resolution Notes:', { x: MARGIN, y, font: boldFont, size: 9, color: MID }); y -= 14;
        y = drawParagraph(page, data.resolutionNotes.substring(0, 400), MARGIN + 10, y, regularFont, 9, contentW - 10, 14, DARK); y -= 8;
      }
      if (data.settlementTerms) {
        page.drawText('Settlement Terms:', { x: MARGIN, y, font: boldFont, size: 9, color: MID }); y -= 14;
        y = drawParagraph(page, data.settlementTerms.substring(0, 400), MARGIN + 10, y, regularFont, 9, contentW - 10, 14, DARK); y -= 8;
      }
      if (data.escalationReason) {
        page.drawText('Escalation Reason:', { x: MARGIN, y, font: boldFont, size: 9, color: MID }); y -= 14;
        y = drawParagraph(page, data.escalationReason.substring(0, 300), MARGIN + 10, y, regularFont, 9, contentW - 10, 14, DARK); y -= 8;
      }
    }
  }

  if (y > 120) {
    y -= 10;
    addSignatureBlock(page, boldFont, regularFont, captainName, y);
  }
  blotterFooter(page, italicFont, data.caseNumber);

  return Buffer.from(await pdfDoc.save());
}

// Blotter Summons — letter to respondent or complainant scheduling hearing
export async function generateBlotterSummons(data: BlotterData, partyType: 'COMPLAINANT' | 'RESPONDENT', hearingDate: string, hearingTime: string, hearingVenue?: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const captainName = data.captainName || DEFAULT_CAPTAIN;
  const contentW = A4_WIDTH - MARGIN * 2;

  let y = await addDocumentHeader(pdfDoc, page, boldFont, regularFont, 'SUMMONS');

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const hearingDateStr = hearingDate
    ? new Date(hearingDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'TBD';

  addControlDateLine(page, regularFont, data.caseNumber, y, 'Case No.');
  y -= 30;

  const party = partyType === 'COMPLAINANT' ? data.complainant : data.respondent;
  const partyName = blotterPartyFullName(party).toUpperCase();
  const complainantName = blotterPartyFullName(data.complainant).toUpperCase();
  const respondentName = blotterPartyFullName(data.respondent).toUpperCase();

  // Addressee block
  page.drawText(`To: ${partyName}`, { x: MARGIN, y, font: boldFont, size: 11, color: DARK }); y -= 15;
  if (party.address) {
    y = drawParagraph(page, `     ${party.address}`, MARGIN, y, regularFont, 10, contentW, 15, MID); y -= 6;
  }
  y -= 10;

  page.drawText(`Greetings:`, { x: MARGIN, y, font: italicFont, size: 11, color: DARK }); y -= 22;

  const venue = hearingVenue || `Barangay Hall, ${BARANGAY.name}, Sorsogon City`;
  const paragraphs = [
    `       You are hereby SUMMONED to appear before the Lupong Tagapamayapa of ${BARANGAY.name}, ${BARANGAY.municipality}, ${BARANGAY.province}, in connection with a complaint filed against you/by you (Case No. ${data.caseNumber}):`,
    `       COMPLAINANT: ${complainantName}`,
    `       RESPONDENT: ${respondentName}`,
    `       NATURE OF COMPLAINT: ${data.natureOfComplaint}`,
    `       You are required to appear in person on ${hearingDateStr} at ${hearingTime} at the ${venue} for purposes of mediation/conciliation proceedings under the Katarungang Pambarangay Law (P.D. 1508 / R.A. 7160).`,
    `       FAILURE TO APPEAR shall be treated as waiver on your part, and the appropriate action shall be taken in accordance with law.`,
  ];

  for (const para of paragraphs) {
    y = drawParagraph(page, para, MARGIN, y, regularFont, 11, contentW, 18, DARK);
    y -= 8;
  }

  y -= 14;
  page.drawText(`Issued this ${dateStr} at ${BARANGAY.name}, Sorsogon City, Sorsogon.`, { x: MARGIN, y, font: italicFont, size: 10, color: MID });
  y -= 40;
  addSignatureBlock(page, boldFont, regularFont, captainName, y);
  blotterFooter(page, italicFont, data.caseNumber);

  return Buffer.from(await pdfDoc.save());
}

