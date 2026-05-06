import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/firebase';
import { logAudit } from '../services/audit.service';
import { generateBlotterId } from '../services/blotterId.service';
import {
  sendBlotterCaseFiledEmail,
  sendBlotterStatusUpdateEmail,
} from '../services/email.service';
import { BLOTTER_STATUS_FLOW } from '../config/constants';
import { z } from 'zod';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const PartySchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  address: z.string().max(300).optional().default(''),
  contactNumber: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  age: z.number().int().min(1).max(150).optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  civilStatus: z.enum(['Single', 'Married', 'Widowed', 'Separated']).optional(),
});

const CreateBlotterSchema = z.object({
  incidentDate: z.string().min(1),
  incidentTime: z.string().min(1),
  incidentLocation: z.string().min(1).max(300),
  natureOfComplaint: z.string().min(1).max(200),
  narrative: z.string().min(10).max(3000),
  complainant: PartySchema,
  respondent: PartySchema,
  blotterBookPage: z.string().max(50).optional(),
});

const UpdateStatusSchema = z.object({
  newStatus: z.enum(['OPEN', 'UNDER_MEDIATION', 'SETTLED', 'ESCALATED', 'ESCALATED_RETURNED', 'DISMISSED']),
  remarks: z.string().max(1000).optional(),
  resolutionNotes: z.string().max(3000).optional(),
  settlementTerms: z.string().max(3000).optional(),
  escalationReason: z.string().max(1000).optional(),
});

const HearingSchema = z.object({
  date: z.string().min(1),
  time: z.string().min(1),
  venue: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  attendance: z.array(z.object({
    partyType: z.enum(['COMPLAINANT', 'RESPONDENT', 'WITNESS', 'MEDIATOR']),
    name: z.string().min(1).max(200),
    attended: z.boolean().default(false),
  })).optional().default([]),
});

const NoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

const KpChecklistSchema = z.object({
  summonsIssuedToComplainant: z.boolean().optional(),
  summonsIssuedToRespondent: z.boolean().optional(),
  firstHearingConducted: z.boolean().optional(),
  secondHearingConducted: z.boolean().optional(),
  thirdHearingConducted: z.boolean().optional(),
});

// ─── Helper: toISO ────────────────────────────────────────────────────────────
function toISO(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000).toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  return new Date(ts).toISOString();
}

function serializeDoc(id: string, data: any) {
  return {
    id,
    ...data,
    createdAt: data.createdAt ? toISO(data.createdAt) : null,
    updatedAt: data.updatedAt ? toISO(data.updatedAt) : null,
    statusHistory: (data.statusHistory || []).map((h: any) => ({
      ...h,
      timestamp: h.timestamp ? toISO(h.timestamp) : null,
    })),
    hearings: (data.hearings || []).map((h: any) => ({
      ...h,
      createdAt: h.createdAt ? toISO(h.createdAt) : null,
    })),
    caseNotes: (data.caseNotes || []).map((n: any) => ({
      ...n,
      timestamp: n.timestamp ? toISO(n.timestamp) : null,
    })),
  };
}

// ─── POST /api/blotter — Create new blotter case ─────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = CreateBlotterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const data = parsed.data;
    const caseNumber = await generateBlotterId();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const kpChecklist = {
      summonsIssuedToComplainant: false,
      summonsIssuedToRespondent: false,
      firstHearingConducted: false,
      secondHearingConducted: false,
      thirdHearingConducted: false,
    };

    const initialStatus = {
      status: 'OPEN',
      timestamp: admin.firestore.Timestamp.now(),
      staffId: req.user!.uid,
      staffName: req.user!.name,
      remarks: 'Case filed',
    };

    const docData = {
      caseNumber,
      ...data,
      status: 'OPEN',
      statusHistory: [initialStatus],
      kpChecklist,
      hearings: [],
      caseNotes: [],
      resolutionNotes: '',
      settlementTerms: '',
      escalationReason: '',
      isArchived: false,
      filedBy: req.user!.uid,
      filedByName: req.user!.name,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db().collection('blotter').add(docData);

    if (data.complainant.email) {
      try {
        await sendBlotterCaseFiledEmail(
          data.complainant.email,
          `${data.complainant.firstName} ${data.complainant.lastName}`,
          caseNumber,
          data.natureOfComplaint,
          data.incidentDate,
        );
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr);
      }
    }

    await logAudit({
      action: 'BLOTTER_CREATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Blotter case ${caseNumber} filed. Complainant: ${data.complainant.firstName} ${data.complainant.lastName} vs Respondent: ${data.respondent.firstName} ${data.respondent.lastName}`,
    });

    res.status(201).json({ success: true, caseNumber, caseId: docRef.id });
  } catch (err: any) {
    console.error('Error creating blotter case:', err);
    res.status(500).json({ error: 'Failed to create blotter case' });
  }
});

// ─── GET /api/blotter — List cases ───────────────────────────────────────────
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;

    const hasStatusFilter = typeof status === 'string' && status !== '' && status !== 'ALL';

    let query: admin.firestore.Query = db().collection('blotter').where('isArchived', '==', false);

    if (hasStatusFilter) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    let cases: any[] = snapshot.docs.map(doc => serializeDoc(doc.id, doc.data()));

    // Date range filter
    if (typeof dateFrom === 'string' && dateFrom) {
      cases = cases.filter(c => c.incidentDate >= dateFrom);
    }
    if (typeof dateTo === 'string' && dateTo) {
      cases = cases.filter(c => c.incidentDate <= dateTo);
    }

    // Text search
    if (typeof search === 'string' && search !== '') {
      const q = search.toLowerCase();
      cases = cases.filter(c =>
        c.caseNumber?.toLowerCase().includes(q) ||
        c.complainant?.firstName?.toLowerCase().includes(q) ||
        c.complainant?.lastName?.toLowerCase().includes(q) ||
        c.respondent?.firstName?.toLowerCase().includes(q) ||
        c.respondent?.lastName?.toLowerCase().includes(q) ||
        c.natureOfComplaint?.toLowerCase().includes(q)
      );
    }

    // Sort by createdAt desc
    cases.sort((a, b) => {
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bT - aT;
    });

    res.json({ cases, total: cases.length });
  } catch (err: any) {
    console.error('Error listing blotter cases:', err);
    res.status(500).json({ error: 'Failed to fetch blotter cases' });
  }
});

// ─── GET /api/blotter/stats — Case statistics ────────────────────────────────
router.get('/stats', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('blotter').where('isArchived', '==', false).get();
    const stats = { total: 0, OPEN: 0, UNDER_MEDIATION: 0, SETTLED: 0, ESCALATED: 0, DISMISSED: 0, ESCALATED_RETURNED: 0 };
    for (const doc of snapshot.docs) {
      const d = doc.data();
      stats.total++;
      const s = d.status as string;
      if (s in stats) (stats as any)[s]++;
    }
    res.json(stats);
  } catch (err: any) {
    console.error('Error fetching blotter stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/blotter/:id — Get single case ───────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await db().collection('blotter').doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }
    res.json(serializeDoc(doc.id, doc.data()));
  } catch (err: any) {
    console.error('Error fetching blotter case:', err);
    res.status(500).json({ error: 'Failed to fetch blotter case' });
  }
});

// ─── PATCH /api/blotter/:id/status — Update status ───────────────────────────
router.patch('/:id/status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = UpdateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { newStatus, remarks, resolutionNotes, settlementTerms, escalationReason } = parsed.data;
    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const data = doc.data()!;
    const currentStatus = data.status;
    const allowedNext = BLOTTER_STATUS_FLOW[currentStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      res.status(400).json({
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        allowedTransitions: allowedNext,
      });
      return;
    }

    // KP checklist enforcement: cannot escalate without 3 hearings
    if (newStatus === 'ESCALATED') {
      const kp = data.kpChecklist || {};
      if (!kp.firstHearingConducted || !kp.secondHearingConducted || !kp.thirdHearingConducted) {
        res.status(400).json({
          error: 'Cannot escalate: Katarungang Pambarangay requires 3 hearings before escalation. Please complete the KP checklist.',
          kpChecklist: kp,
        });
        return;
      }
    }

    const historyEntry = {
      status: newStatus,
      timestamp: admin.firestore.Timestamp.now(),
      staffId: req.user!.uid,
      staffName: req.user!.name,
      remarks: remarks || '',
    };

    const updateData: any = {
      status: newStatus,
      statusHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (resolutionNotes !== undefined) updateData.resolutionNotes = resolutionNotes;
    if (settlementTerms !== undefined) updateData.settlementTerms = settlementTerms;
    if (escalationReason !== undefined) updateData.escalationReason = escalationReason;

    await docRef.update(updateData);

    const complainantEmail = data.complainant?.email;
    if (complainantEmail) {
      try {
        await sendBlotterStatusUpdateEmail(
          complainantEmail,
          `${data.complainant.firstName} ${data.complainant.lastName}`,
          data.caseNumber,
          newStatus,
          remarks,
        );
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr);
      }
    }

    await logAudit({
      action: 'BLOTTER_STATUS_UPDATE',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Blotter case ${data.caseNumber}: ${currentStatus} → ${newStatus}. ${remarks || ''}`,
    });

    res.json({ success: true, newStatus });
  } catch (err: any) {
    console.error('Error updating blotter status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── POST /api/blotter/:id/hearings — Add hearing ────────────────────────────
router.post('/:id/hearings', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = HearingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const hearing = {
      id: uuidv4(),
      ...parsed.data,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: req.user!.uid,
      createdByName: req.user!.name,
    };

    await docRef.update({
      hearings: admin.firestore.FieldValue.arrayUnion(hearing),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const data = doc.data()!;
    await logAudit({
      action: 'BLOTTER_HEARING_ADDED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Hearing scheduled for blotter case ${data.caseNumber} on ${parsed.data.date} at ${parsed.data.time}`,
    });

    res.status(201).json({ success: true, hearingId: hearing.id });
  } catch (err: any) {
    console.error('Error adding hearing:', err);
    res.status(500).json({ error: 'Failed to add hearing' });
  }
});

// ─── PATCH /api/blotter/:id/hearings/:hearingId — Update hearing ──────────────
router.patch('/:id/hearings/:hearingId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const data = doc.data()!;
    const hearings: any[] = data.hearings || [];
    const idx = hearings.findIndex((h: any) => h.id === req.params.hearingId);
    if (idx === -1) {
      res.status(404).json({ error: 'Hearing not found' });
      return;
    }

    // Merge update
    hearings[idx] = { ...hearings[idx], ...req.body, id: req.params.hearingId };

    await docRef.update({
      hearings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAudit({
      action: 'BLOTTER_HEARING_UPDATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Hearing updated for blotter case ${data.caseNumber}`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating hearing:', err);
    res.status(500).json({ error: 'Failed to update hearing' });
  }
});

// ─── DELETE /api/blotter/:id/hearings/:hearingId — Delete hearing ─────────────
router.delete('/:id/hearings/:hearingId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const data = doc.data()!;
    const hearings: any[] = (data.hearings || []).filter((h: any) => h.id !== req.params.hearingId);

    await docRef.update({
      hearings,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting hearing:', err);
    res.status(500).json({ error: 'Failed to delete hearing' });
  }
});

// ─── POST /api/blotter/:id/notes — Add case note ─────────────────────────────
router.post('/:id/notes', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = NoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const noteEntry = {
      id: uuidv4(),
      note: parsed.data.note,
      staffId: req.user!.uid,
      staffName: req.user!.name,
      timestamp: admin.firestore.Timestamp.now(),
    };

    await docRef.update({
      caseNotes: admin.firestore.FieldValue.arrayUnion(noteEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ success: true, noteId: noteEntry.id });
  } catch (err: any) {
    console.error('Error adding case note:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ─── PATCH /api/blotter/:id/kp-checklist — Update KP checklist ───────────────
router.patch('/:id/kp-checklist', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = KpChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const data = doc.data()!;
    const currentKp = data.kpChecklist || {};
    const updatedKp = { ...currentKp, ...parsed.data };

    await docRef.update({
      kpChecklist: updatedKp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAudit({
      action: 'BLOTTER_KP_CHECKLIST_UPDATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `KP checklist updated for blotter case ${data.caseNumber}`,
    });

    res.json({ success: true, kpChecklist: updatedKp });
  } catch (err: any) {
    console.error('Error updating KP checklist:', err);
    res.status(500).json({ error: 'Failed to update KP checklist' });
  }
});

// ─── PATCH /api/blotter/:id — Update blotter entry fields ─────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    // Whitelist updatable fields
    const allowed = ['incidentDate','incidentTime','incidentLocation','natureOfComplaint','narrative','complainant','respondent','blotterBookPage','resolutionNotes','settlementTerms','escalationReason'];
    const update: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await docRef.update(update);

    const data = doc.data()!;
    await logAudit({
      action: 'BLOTTER_UPDATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Blotter case ${data.caseNumber} details updated`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating blotter:', err);
    res.status(500).json({ error: 'Failed to update blotter case' });
  }
});

// ─── DELETE /api/blotter/:id — Soft-delete (archive) ─────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docRef = db().collection('blotter').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    const data = doc.data()!;
    await docRef.update({
      isArchived: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAudit({
      action: 'BLOTTER_ARCHIVED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Blotter case ${data.caseNumber} archived (soft delete)`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error archiving blotter:', err);
    res.status(500).json({ error: 'Failed to archive blotter case' });
  }
});

export default router;
