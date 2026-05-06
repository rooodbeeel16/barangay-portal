import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import { logAudit } from '../services/audit.service';
import { sendStatusUpdateEmail } from '../services/email.service';
import { STATUS_FLOW, DOCUMENT_TYPES } from '../config/constants';
import { z } from 'zod';
import * as admin from 'firebase-admin';

const router = Router();

// Get all requests with filters
router.get('/requests', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search, documentType } = req.query;

    const hasStatusFilter = typeof status === 'string' && status !== '' && status !== 'ALL';
    const hasDocTypeFilter = typeof documentType === 'string' && documentType !== '' && documentType !== 'ALL';

    let query: admin.firestore.Query = db().collection('requests');

    if (hasStatusFilter) {
      query = query.where('status', '==', status);
    }
    if (hasDocTypeFilter) {
      query = query.where('documentType', '==', documentType);
    }

    // Only use orderBy when there are no equality filters to avoid requiring
    // a composite index that may not exist in the Firestore project.
    if (!hasStatusFilter && !hasDocTypeFilter) {
      query = query.orderBy('createdAt', 'desc').limit(100);
    }

    const snapshot = await query.get();
    let requests: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sort and cap client-side when Firestore orderBy was skipped
    if (hasStatusFilter || hasDocTypeFilter) {
      requests.sort((a, b) => {
        const aTime: number = a.createdAt?.seconds ?? 0;
        const bTime: number = b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      requests = requests.slice(0, 100);
    }

    // Client-side search filter
    if (typeof search === 'string' && search !== '') {
      const q = search.toLowerCase();
      requests = requests.filter((r: any) =>
        r.trackingId?.toLowerCase().includes(q) ||
        r.firstName?.toLowerCase().includes(q) ||
        r.lastName?.toLowerCase().includes(q)
      );
    }

    res.json({ requests, total: requests.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Get single request details
router.get('/requests/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const doc = await db().collection('requests').doc(req.params.id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to fetch request' });
  }
});

// Update request status
router.patch('/requests/:id/status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      newStatus: z.enum(['PENDING', 'FOR_SIGNATURE', 'READY_FOR_RELEASE', 'RELEASED']),
      remarks: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid status update', details: parsed.error.flatten() });
      return;
    }

    const { newStatus, remarks } = parsed.data;
    const docRef = db().collection('requests').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const data = doc.data()!;
    const currentStatus = data.status;

    // Enforce workflow
    const allowedNext = STATUS_FLOW[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      res.status(400).json({
        error: `Invalid status transition: ${currentStatus} → ${newStatus}`,
        allowedTransitions: allowedNext,
      });
      return;
    }

    const historyEntry = {
      status: newStatus,
      timestamp: admin.firestore.Timestamp.now(),
      staffId: req.user!.uid,
      staffName: req.user!.name,
      remarks: remarks || '',
    };

    await docRef.update({
      status: newStatus,
      statusHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send email notification if email provided
    if (data.email) {
      try {
        await sendStatusUpdateEmail(
          data.email,
          `${data.firstName} ${data.lastName}`,
          data.trackingId,
          DOCUMENT_TYPES[data.documentType as keyof typeof DOCUMENT_TYPES] || data.documentType,
          newStatus,
          remarks
        );
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr);
      }
    }

    // Audit log
    await logAudit({
      action: 'STATUS_UPDATE',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      requestId: req.params.id,
      trackingId: data.trackingId,
      details: `Status changed: ${currentStatus} → ${newStatus}. Remarks: ${remarks || 'None'}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Bulk status update
router.patch('/requests/bulk/status', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      requestIds: z.array(z.string()).min(1).max(50),
      newStatus: z.enum(['PENDING', 'FOR_SIGNATURE', 'READY_FOR_RELEASE', 'RELEASED']),
      remarks: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid bulk update', details: parsed.error.flatten() });
      return;
    }

    const { requestIds, newStatus, remarks } = parsed.data;
    const batch = db().batch();
    const historyEntry = {
      status: newStatus,
      timestamp: admin.firestore.Timestamp.now(),
      staffId: req.user!.uid,
      staffName: req.user!.name,
      remarks: remarks || 'Bulk update',
    };

    for (const id of requestIds) {
      const ref = db().collection('requests').doc(id);
      batch.update(ref, {
        status: newStatus,
        statusHistory: admin.firestore.FieldValue.arrayUnion(historyEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    await logAudit({
      action: 'BULK_STATUS_UPDATE',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Bulk status update to ${newStatus} for ${requestIds.length} requests`,
      ipAddress: req.ip,
    });

    res.json({ success: true, updated: requestIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk update' });
  }
});

// Get dashboard analytics
router.get('/analytics', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('requests').get();
    const requests = snapshot.docs.map(d => d.data());

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const analytics = {
      total: requests.length,
      pending: requests.filter(r => r.status === 'PENDING').length,
      forSignature: requests.filter(r => r.status === 'FOR_SIGNATURE').length,
      readyForRelease: requests.filter(r => r.status === 'READY_FOR_RELEASE').length,
      released: requests.filter(r => r.status === 'RELEASED').length,
      releasedToday: requests.filter(r => {
        if (r.status !== 'RELEASED') return false;
        const ts: any = r.updatedAt || r.createdAt;
        if (!ts) return false;
        const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === todayStart.getTime();
      }).length,
      byDocType: Object.keys(DOCUMENT_TYPES).reduce((acc: Record<string, number>, key) => {
        acc[key] = requests.filter(r => r.documentType === key).length;
        return acc;
      }, {}),
    };

    res.json(analytics);
  } catch {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get audit logs
router.get('/audit-logs', requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .get();

    const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ logs });
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get residents list
router.get('/residents', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('requests')
      .orderBy('createdAt', 'desc')
      .get();

    const seen = new Set<string>();
    const residents: any[] = [];

    snapshot.docs.forEach(doc => {
      const d = doc.data();
      const key = `${d.firstName}_${d.lastName}_${d.birthdate}`;
      if (!seen.has(key)) {
        seen.add(key);
        residents.push({
          id: doc.id,
          firstName: d.firstName,
          middleName: d.middleName,
          lastName: d.lastName,
          birthdate: d.birthdate,
          age: d.age,
          gender: d.gender,
          civilStatus: d.civilStatus,
          purokSitio: d.purokSitio,
          contactNumber: d.contactNumber,
          email: d.email,
          isBlacklisted: d.isBlacklisted || false,
          totalRequests: snapshot.docs.filter(d2 => {
            const d2data = d2.data();
            return `${d2data.firstName}_${d2data.lastName}_${d2data.birthdate}` === key;
          }).length,
        });
      }
    });

    res.json({ residents });
  } catch {
    res.status(500).json({ error: 'Failed to fetch residents' });
  }
});

// Blacklist/unblacklist a resident
router.patch('/requests/:id/blacklist', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { blacklisted, reason } = req.body;
    const docRef = db().collection('requests').doc(req.params.id);
    await docRef.update({ isBlacklisted: blacklisted, blacklistReason: reason || '' });

    await logAudit({
      action: blacklisted ? 'RESIDENT_BLACKLISTED' : 'RESIDENT_UNBLACKLISTED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      requestId: req.params.id,
      details: `Resident ${blacklisted ? 'blacklisted' : 'unblacklisted'}. Reason: ${reason || 'None'}`,
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update blacklist status' });
  }
});

export default router;
