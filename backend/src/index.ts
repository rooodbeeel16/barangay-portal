import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { initFirebase } from './config/firebase';
import requestRoutes from './routes/requests';
import trackingRoutes from './routes/tracking';
import adminRoutes from './routes/admin';
import announcementRoutes from './routes/announcements';
import configRoutes from './routes/config';
import uploadRoutes from './routes/uploads';
import authRoutes from './routes/auth';
import pdfRoutes from './routes/pdf';
import appointmentRoutes from './routes/appointments';
import notificationRoutes from './routes/notifications';
import blotterRoutes from './routes/blotter';

// Initialize Firebase Admin
initFirebase();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for serving static HTML
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Serve static frontend files from ../frontend
// Disable caching for HTML and JS so auth fixes always take effect
app.use(express.static(path.join(__dirname, '../../frontend'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// API Routes
app.use('/api/requests', requestRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/config', configRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/blotter', blotterRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), barangay: 'Sirangan, Sorsogon City' });
});

// Catch-all: serve frontend index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🏘️  Barangay Sirangan Portal running on http://localhost:${PORT}`);
});

export default app;
