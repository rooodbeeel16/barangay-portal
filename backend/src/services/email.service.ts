import nodemailer from 'nodemailer';
import { BARANGAY } from '../config/constants';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendStatusUpdateEmail(
  to: string,
  residentName: string,
  trackingId: string,
  documentType: string,
  status: string,
  remarks?: string
): Promise<void> {
  if (!process.env.SMTP_USER) return; // Email not configured

  const subject = `[${BARANGAY.name}] Request Update - ${trackingId}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
        <h2>${BARANGAY.name}</h2>
        <p>${BARANGAY.municipality}, ${BARANGAY.province}</p>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h3>Document Request Status Update</h3>
        <p>Dear <strong>${residentName}</strong>,</p>
        <p>Your request for <strong>${documentType}</strong> has been updated.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #dbeafe;"><td style="padding: 10px; font-weight: bold;">Tracking ID</td><td style="padding: 10px;">${trackingId}</td></tr>
          <tr><td style="padding: 10px; font-weight: bold;">Document Type</td><td style="padding: 10px;">${documentType}</td></tr>
          <tr style="background: #dbeafe;"><td style="padding: 10px; font-weight: bold;">New Status</td><td style="padding: 10px;"><strong style="color: #1e40af;">${status}</strong></td></tr>
          ${remarks ? `<tr><td style="padding: 10px; font-weight: bold;">Remarks</td><td style="padding: 10px;">${remarks}</td></tr>` : ''}
        </table>
        <p>Track your request at: <a href="http://localhost:3000/track.html?id=${trackingId}">Click here</a></p>
        <hr>
        <small style="color: #6b7280;">${BARANGAY.name} Document Tracking System | ${BARANGAY.address}</small>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"${BARANGAY.name} Portal" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
}
