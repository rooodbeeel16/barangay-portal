import nodemailer from 'nodemailer';
import { BARANGAY } from '../config/constants';

const SENDER_NAME = 'Barangay Sirangan';

// Transporter is created lazily so credentials are read AFTER dotenv.config() runs.
// (TypeScript hoists all require() calls above inline dotenv.config() in index.ts)
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

// ─── Shared template helpers ─────────────────────────────────────────────────

function buildEmailTemplate(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1e40af; color: white; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px;">${BARANGAY.name}</h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.85;">${BARANGAY.municipality}, ${BARANGAY.province}</p>
      </div>
      <div style="background: #1e3a8a; color: white; padding: 10px 24px; text-align: center;">
        <p style="margin: 0; font-size: 14px; font-weight: bold; letter-spacing: 0.5px;">${title}</p>
      </div>
      <div style="padding: 28px 24px; background: #f9fafb;">
        ${bodyHtml}
      </div>
      <div style="background: #1e3a8a; color: rgba(255,255,255,0.75); padding: 16px 24px; text-align: center; font-size: 12px;">
        <p style="margin: 0;">${BARANGAY.address} | ${BARANGAY.phone}</p>
        <p style="margin: 4px 0 0 0;">This is an automated message. Please do not reply to this email.</p>
      </div>
    </div>
  `;
}

function tableRow(label: string, value: string, shaded = false): string {
  const bg = shaded ? 'background: #dbeafe;' : 'background: #ffffff;';
  return `<tr style="${bg}">
    <td style="padding: 10px 12px; font-weight: bold; color: #374151; width: 40%; border-bottom: 1px solid #e5e7eb;">${label}</td>
    <td style="padding: 10px 12px; color: #111827; border-bottom: 1px solid #e5e7eb;">${value}</td>
  </tr>`;
}

function detailsTable(rows: string): string {
  return `<table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e5e7eb;">${rows}</table>`;
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('[Email] Skipped: SMTP_USER or SMTP_PASS not configured');
    return;
  }

  const transporter = createTransporter();

  try {
    const fromEmail = process.env.SMTP_FROM || user;
    const info = await transporter.sendMail({
      from: `"${SENDER_NAME}" <${fromEmail}>`,
      to,
      subject,
      html,
    });
    console.log(`[Email] Sent to ${to} | messageId: ${info.messageId}`);
  } catch (err: any) {
    console.error(`[Email] Failed to send to ${to}:`, err?.message || err);
    throw err;
  }
}

// ─── 1. Document request submitted ──────────────────────────────────────────

export async function sendRequestSubmittedEmail(
  to: string,
  residentName: string,
  trackingId: string,
  documentType: string,
): Promise<void> {
  const subject = `[Barangay Sirangan] Request Received – ${trackingId}`;
  const body = `
    <p style="color: #111827;">Dear <strong>${residentName}</strong>,</p>
    <p style="color: #374151;">Your document request has been received and is now pending review.</p>
    ${detailsTable(
      tableRow('Tracking ID', `<strong>${trackingId}</strong>`, true) +
      tableRow('Document Type', documentType) +
      tableRow('Status', '<strong style="color: #1e40af;">Pending</strong>', true)
    )}
    <p style="color: #374151;">Track your request: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track.html?id=${trackingId}" style="color: #1e40af;">Click here</a></p>
    <p style="color: #6b7280; font-size: 13px;">Keep your Tracking ID for future reference.</p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Document Request Received', body));
}

// ─── 2. Document request status update ──────────────────────────────────────

export async function sendStatusUpdateEmail(
  to: string,
  residentName: string,
  trackingId: string,
  documentType: string,
  status: string,
  remarks?: string
): Promise<void> {
  const statusLabels: Record<string, string> = {
    PENDING: 'Pending',
    FOR_SIGNATURE: 'For Signature',
    READY_FOR_RELEASE: 'Ready for Release',
    RELEASED: 'Released',
    REJECTED: 'Rejected',
  };
  const statusLabel = statusLabels[status] || status;
  const subject = `[Barangay Sirangan] Request Update – ${trackingId}`;
  const body = `
    <p style="color: #111827;">Dear <strong>${residentName}</strong>,</p>
    <p style="color: #374151;">Your request for <strong>${documentType}</strong> has been updated.</p>
    ${detailsTable(
      tableRow('Tracking ID', trackingId, true) +
      tableRow('Document Type', documentType) +
      tableRow('New Status', `<strong style="color: #1e40af;">${statusLabel}</strong>`, true) +
      (remarks ? tableRow('Remarks', remarks) : '')
    )}
    <p style="color: #374151;">Track your request: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track.html?id=${trackingId}" style="color: #1e40af;">Click here</a></p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Document Request Status Update', body));
}

// ─── 3. General appointment request submitted ────────────────────────────────

export async function sendAppointmentRequestEmail(
  to: string,
  name: string,
  purpose: string,
  date: string,
  time: string,
): Promise<void> {
  const subject = `[Barangay Sirangan] Appointment Request Received`;
  const body = `
    <p style="color: #111827;">Dear <strong>${name}</strong>,</p>
    <p style="color: #374151;">Your appointment request has been received. Our staff will review and confirm your schedule.</p>
    ${detailsTable(
      tableRow('Purpose', purpose, true) +
      tableRow('Requested Date', date) +
      tableRow('Requested Time', time, true) +
      tableRow('Status', '<strong style="color: #1e40af;">Pending</strong>')
    )}
    <p style="color: #6b7280; font-size: 13px;">You will receive another email once your appointment is confirmed or declined.</p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Appointment Request Received', body));
}

// ─── 4. General appointment status update (approved / declined / rescheduled)

export async function sendAppointmentStatusEmail(
  to: string,
  name: string,
  purpose: string,
  action: 'APPROVE' | 'DECLINE' | 'RESCHEDULE',
  newDate?: string,
  newTime?: string,
  reason?: string,
): Promise<void> {
  const labels: Record<string, string> = { APPROVE: 'Approved', DECLINE: 'Declined', RESCHEDULE: 'Rescheduled' };
  const colors: Record<string, string> = { APPROVE: '#16a34a', DECLINE: '#dc2626', RESCHEDULE: '#d97706' };
  const label = labels[action];
  const color = colors[action];
  const subject = `[Barangay Sirangan] Appointment ${label}`;
  const extraRows = (action === 'RESCHEDULE' && newDate && newTime)
    ? tableRow('New Date', newDate) + tableRow('New Time', newTime, true)
    : '';
  const body = `
    <p style="color: #111827;">Dear <strong>${name}</strong>,</p>
    <p style="color: #374151;">Your appointment request has been <strong style="color: ${color};">${label.toLowerCase()}</strong>.</p>
    ${detailsTable(
      tableRow('Purpose', purpose, true) +
      tableRow('Status', `<strong style="color: ${color};">${label}</strong>`) +
      extraRows +
      (reason ? tableRow('Note', reason, true) : '')
    )}
    ${action === 'APPROVE' ? '<p style="color: #374151;">Please be at the barangay hall on the scheduled date and time.</p>' : ''}
    ${action === 'RESCHEDULE' ? '<p style="color: #374151;">Please take note of your new schedule.</p>' : ''}
  `;
  await sendMail(to, subject, buildEmailTemplate(`Appointment ${label}`, body));
}

// ─── 5. Document pickup appointment booked ───────────────────────────────────

export async function sendPickupAppointmentEmail(
  to: string,
  residentName: string,
  documentType: string,
  trackingId: string,
  appointmentDate: string,
  appointmentTime: string,
): Promise<void> {
  const subject = `[Barangay Sirangan] Pickup Appointment Confirmed – ${trackingId}`;
  const body = `
    <p style="color: #111827;">Dear <strong>${residentName}</strong>,</p>
    <p style="color: #374151;">Your document pickup appointment has been scheduled.</p>
    ${detailsTable(
      tableRow('Tracking ID', trackingId, true) +
      tableRow('Document Type', documentType) +
      tableRow('Pickup Date', appointmentDate, true) +
      tableRow('Pickup Time', appointmentTime)
    )}
    <p style="color: #374151;">Please bring a valid ID when claiming your document.</p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Document Pickup Appointment', body));
}

// ─── 6. Blotter case filed (to complainant) ──────────────────────────────────

export async function sendBlotterCaseFiledEmail(
  to: string,
  complainantName: string,
  caseNumber: string,
  natureOfComplaint: string,
  incidentDate: string,
): Promise<void> {
  const subject = `[Barangay Sirangan] Blotter Case Filed – ${caseNumber}`;
  const body = `
    <p style="color: #111827;">Dear <strong>${complainantName}</strong>,</p>
    <p style="color: #374151;">Your blotter case has been officially filed and recorded.</p>
    ${detailsTable(
      tableRow('Case Number', `<strong>${caseNumber}</strong>`, true) +
      tableRow('Nature of Complaint', natureOfComplaint) +
      tableRow('Incident Date', incidentDate, true) +
      tableRow('Status', '<strong style="color: #1e40af;">Open</strong>')
    )}
    <p style="color: #6b7280; font-size: 13px;">You will be notified of any updates. Please visit the Barangay Hall for inquiries.</p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Blotter Case Filed', body));
}

// ─── 7. Blotter status update (to complainant) ───────────────────────────────

export async function sendBlotterStatusUpdateEmail(
  to: string,
  complainantName: string,
  caseNumber: string,
  newStatus: string,
  remarks?: string,
): Promise<void> {
  const statusLabels: Record<string, string> = {
    OPEN: 'Open',
    UNDER_MEDIATION: 'Under Mediation',
    SETTLED: 'Settled',
    ESCALATED: 'Escalated to Higher Authority',
    ESCALATED_RETURNED: 'Escalated (Returned to Barangay)',
    DISMISSED: 'Dismissed',
  };
  const statusLabel = statusLabels[newStatus] || newStatus;
  const subject = `[Barangay Sirangan] Blotter Case Update – ${caseNumber}`;
  const body = `
    <p style="color: #111827;">Dear <strong>${complainantName}</strong>,</p>
    <p style="color: #374151;">There has been an update on your blotter case.</p>
    ${detailsTable(
      tableRow('Case Number', caseNumber, true) +
      tableRow('New Status', `<strong style="color: #1e40af;">${statusLabel}</strong>`) +
      (remarks ? tableRow('Remarks', remarks, true) : '')
    )}
    <p style="color: #6b7280; font-size: 13px;">Please visit the Barangay Hall for more information.</p>
  `;
  await sendMail(to, subject, buildEmailTemplate('Blotter Case Status Update', body));
}
