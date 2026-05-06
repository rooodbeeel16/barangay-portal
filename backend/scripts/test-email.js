require('dotenv').config();
const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false }
});

console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS length:', process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0);

t.verify()
  .then(() => {
    console.log('SMTP credentials OK');
    return t.sendMail({
      from: '"Barangay Sirangan" <' + process.env.SMTP_USER + '>',
      to: process.env.SMTP_USER,
      subject: '[Test] Barangay Sirangan Email Notification',
      html: '<h2>Test email</h2><p>Email notifications are working correctly.</p>'
    });
  })
  .then(info => console.log('Test email sent! messageId:', info.messageId))
  .catch(err => console.error('SMTP Error:', err.message));
