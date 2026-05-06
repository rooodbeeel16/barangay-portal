import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { createAppointment, getAppointmentsByDate } from '../services/appointment.service';
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';
import { z } from 'zod';

const router = Router();

// ─── General Appointment Requests (walk-in scheduling, public) ───────────────

const generalRequestSchema = z.object({
  name:    z.string().min(1).max(200),
  contact: z.string().min(1).max(50),
  email:   z.string().email().max(200),
  purpose: z.string().min(1).max(300),
  date:    z.string().min(1),
  time:    z.string().min(1),
});

// Create general appointment request (public)
router.post('/general', async (req, res: Response): Promise<void> => {
  const parsed = generalRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const ref = await db().collection('appointmentRequests').add({
      ...parsed.data,
      status: 'PENDING',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ success: true, id: ref.id });
  } catch {
    res.status(500).json({ error: 'Failed to create appointment request' });
  }
});

// Get all general appointment requests (admin)
router.get('/general', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('appointmentRequests')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    res.json({ appointments: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointment requests' });
  }
});

// Get all archived general appointment requests (admin)
// Must be defined BEFORE /general/:id routes so "archive" is not captured as :id
router.get('/general/archive', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('appointmentRequestsArchive')
      .orderBy('archivedAt', 'desc')
      .limit(500)
      .get();
    res.json({ appointments: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch archived appointments' });
  }
});

// Purge expired archived records (>3 months old) — must be before /general/:id/archive
router.post('/general/archive/purge-expired', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const snapshot = await db().collection('appointmentRequestsArchive')
      .where('deleteAfter', '<=', now)
      .get();
    const batch = db().batch();
    snapshot.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ success: true, purged: snapshot.size });
  } catch {
    res.status(500).json({ error: 'Failed to purge expired records' });
  }
});

// Permanent-delete an archived record — must be before DELETE /general/:id
router.delete('/general/archive/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await db().collection('appointmentRequestsArchive').doc(req.params.id).delete();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete archived record' });
  }
});

// Admin action: approve / decline / reschedule
router.patch('/general/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const schema = z.object({
    action:  z.enum(['APPROVE', 'DECLINE', 'RESCHEDULE']),
    reason:  z.string().max(500).optional(),
    newDate: z.string().optional(),
    newTime: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { action, reason, newDate, newTime } = parsed.data;
  const update: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (action === 'APPROVE') {
    update.status = 'APPROVED';
  } else if (action === 'DECLINE') {
    update.status = 'DECLINED';
    if (reason) update.declineReason = reason;
  } else {
    if (!newDate || !newTime) {
      res.status(400).json({ error: 'newDate and newTime are required for reschedule' });
      return;
    }
    update.status = 'RESCHEDULED';
    update.date = newDate;
    update.time = newTime;
    if (reason) update.rescheduleNote = reason;
  }
  try {
    await db().collection('appointmentRequests').doc(req.params.id).update(update);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update appointment request' });
  }
});

// Archive a general appointment request — moves to archive collection (admin)
router.post('/general/:id/archive', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docRef = db().collection('appointmentRequests').doc(req.params.id);
    const snap = await docRef.get();
    if (!snap.exists) { res.status(404).json({ error: 'Not found' }); return; }
    await db().collection('appointmentRequestsArchive').doc(req.params.id).set({
      ...snap.data(),
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      deleteAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await docRef.delete();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to archive appointment request' });
  }
});

// Permanent-delete a general appointment request (admin)
router.delete('/general/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await db().collection('appointmentRequests').doc(req.params.id).delete();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete appointment request' });
  }
});

// ─── Document-Pickup Appointments ────────────────────────────────────────────

// Create appointment (public — no auth needed, resident books from tracking page)
router.post('/', async (req, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      requestId: z.string().min(1),
      trackingId: z.string().min(1),
      residentName: z.string().min(1).max(200),
      documentType: z.string().min(1),
      appointmentDate: z.string().min(1),
      appointmentTime: z.string().min(1),
      notes: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    // Only allow booking when status is READY_FOR_RELEASE
    const docSnap = await db().collection('requests').doc(parsed.data.requestId).get();
    if (!docSnap.exists) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (docSnap.data()?.status !== 'READY_FOR_RELEASE') {
      res.status(400).json({ error: 'Appointments can only be booked when document is Ready for Release' });
      return;
    }

    const id = await createAppointment(parsed.data);
    res.status(201).json({ success: true, appointmentId: id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Get appointments by date (admin)
router.get('/by-date/:date', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const appointments = await getAppointmentsByDate(req.params.date);
    res.json({ appointments });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Get all appointments (admin)
router.get('/', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('appointments')
      .orderBy('appointmentDate', 'desc')
      .limit(100)
      .get();
    res.json({ appointments: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Update appointment status (admin)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    await db().collection('appointments').doc(req.params.id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

export default router;
