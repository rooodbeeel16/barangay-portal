import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { generateTrackingId } from '../services/trackingId.service';
import { generateQRCodeDataURL } from '../services/qrcode.service';
import { sendRequestSubmittedEmail } from '../services/email.service';
import { DOCUMENT_TYPES } from '../config/constants';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import rateLimit from 'express-rate-limit';

const router = Router();

// Stricter rate limit for submissions
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many requests submitted. Please wait before trying again.' },
});

const baseRequestSchema = z.object({
  documentType: z.enum(['BARANGAY_CLEARANCE', 'CERTIFICATE_OF_RESIDENCY', 'CERTIFICATE_OF_INDIGENCY', 'BUSINESS_PERMIT_ENDORSEMENT', 'INCIDENT_REPORT']),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  birthdate: z.string(),
  age: z.number().int().min(1).max(150),
  gender: z.enum(['Male', 'Female', 'Other']),
  civilStatus: z.enum(['Single', 'Married', 'Widowed', 'Separated']),
  purokSitio: z.string().min(1).max(100),
  streetAddress: z.string().max(200).optional(),
  purpose: z.string().min(5).max(500),
  contactNumber: z.string().max(20).optional().or(z.literal('')),
  email: z.string().optional().refine(val => !val || val === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
    message: 'Invalid email address'
  }),
  isWalkIn: z.boolean().default(false),
});

// Submit a new document request
router.post('/', submitLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = baseRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;

    // Check for duplicate pending request (wrapped so missing index won't crash submission)
    try {
      const existingQuery = await db().collection('requests')
        .where('lastName', '==', data.lastName)
        .where('firstName', '==', data.firstName)
        .where('documentType', '==', data.documentType)
        .where('status', 'in', ['PENDING', 'FOR_SIGNATURE', 'READY_FOR_RELEASE'])
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const existing = existingQuery.docs[0];
        res.status(409).json({
          error: 'Duplicate request',
          message: 'You already have a pending request for this document type.',
          trackingId: existing.data().trackingId,
        });
        return;
      }
    } catch (dupErr: any) {
      // If composite index is missing, log the index creation URL and continue
      console.warn('⚠️ Duplicate check skipped (index may be missing):', dupErr?.message);
      if (dupErr?.message?.includes('index')) {
        console.warn('Create the required index at:', dupErr.message.match(/https:\/\/[^\s]+/)?.[0] || 'Firebase Console');
      }
    }

    const trackingId = await generateTrackingId();
    const qrCodeDataUrl = await generateQRCodeDataURL(trackingId, process.env.FRONTEND_URL || 'http://localhost:3000');

    const requestData = {
      ...data,
      trackingId,
      qrCodeDataUrl,
      status: 'PENDING',
      statusHistory: [{
        status: 'PENDING',
        timestamp: admin.firestore.Timestamp.now(),
        staffId: data.isWalkIn ? 'system' : 'online',
        staffName: data.isWalkIn ? 'Walk-in (Staff Encoded)' : 'Online Submission',
        remarks: 'Request submitted',
      }],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      uploadedFiles: [],
      isBlacklisted: false,
    };

    const docRef = await db().collection('requests').add(requestData);

    if (data.email) {
      try {
        await sendRequestSubmittedEmail(
          data.email,
          `${data.firstName} ${data.lastName}`,
          trackingId,
          DOCUMENT_TYPES[data.documentType as keyof typeof DOCUMENT_TYPES] || data.documentType,
        );
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr);
      }
    }

    res.status(201).json({
      success: true,
      trackingId,
      requestId: docRef.id,
      qrCodeDataUrl,
      message: 'Request submitted successfully',
    });
  } catch (err: any) {
    console.error('❌ Error creating request:', err?.message || err);
    if (err?.code) console.error('  Error code:', err.code);
    if (err?.details) console.error('  Details:', err.details);
    res.status(500).json({ error: 'Failed to submit request', detail: err?.message });
  }
});

// Public tracking — get request by tracking ID
router.get('/track/:trackingId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { trackingId } = req.params;
    const sanitized = trackingId.replace(/[^A-Z0-9\-]/gi, '').toUpperCase();

    const snapshot = await db().collection('requests')
      .where('trackingId', '==', sanitized)
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(404).json({ error: 'Tracking ID not found' });
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Return only public-safe fields
    res.json({
      trackingId: data.trackingId,
      documentType: data.documentType,
      firstName: data.firstName,
      lastName: data.lastName,
      purpose: data.purpose,
      status: data.status,
      qrCodeDataUrl: data.qrCodeDataUrl,
      statusHistory: data.statusHistory,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  } catch (err) {
    console.error('Error tracking request:', err);
    res.status(500).json({ error: 'Failed to track request' });
  }
});

export default router;
