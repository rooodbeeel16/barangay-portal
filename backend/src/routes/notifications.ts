import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

const router = Router();

// Helper: convert Firestore Timestamp or plain object to ISO string
function toISO(ts: any): string {
  if (!ts) return new Date().toISOString();
  if (ts._seconds !== undefined) return new Date(ts._seconds * 1000).toISOString();
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000).toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  return new Date(ts).toISOString();
}

// GET /api/notifications — returns recent notification events for admin
// Supports ?before=<ISO timestamp> for pagination (fetches older items)
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const beforeParam = (req.query.before as string) || null;
    const isPaginated = !!beforeParam;
    const PAGE_LIMIT = isPaginated ? 20 : 40;
    const dayWindow  = isPaginated ? 90  : 7;

    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - dayWindow * 24 * 60 * 60 * 1000)
    );

    let beforeTs: admin.firestore.Timestamp | null = null;
    if (beforeParam) {
      const d = new Date(beforeParam);
      if (!isNaN(d.getTime())) beforeTs = admin.firestore.Timestamp.fromDate(d);
    }

    const notifications: object[] = [];

    // ── Requests ──────────────────────────────────────────────────────────────
    let reqRef: admin.firestore.Query = db()
      .collection('requests')
      .where('updatedAt', '>=', cutoff);
    if (beforeTs) reqRef = reqRef.where('updatedAt', '<', beforeTs);
    const reqSnap = await reqRef
      .orderBy('updatedAt', 'desc')
      .limit(PAGE_LIMIT + 1)
      .get();

    for (const doc of reqSnap.docs) {
      const d = doc.data();
      const status: string = d.status || 'PENDING';
      const name = `${d.firstName || ''} ${d.lastName || ''}`.trim();
      const docType = (d.documentType || '').replace(/_/g, ' ');
      const isNew = status === 'PENDING';
      const updatedAt = toISO(d.updatedAt);
      const createdAt = toISO(d.createdAt);

      // Emit one notification per relevant status
      if (isNew) {
        notifications.push({
          id: `req_${doc.id}_PENDING`,
          type: 'request',
          event: 'new_request',
          title: 'New Document Request',
          message: `${name} submitted a ${docType} request`,
          timestamp: createdAt,
          docId: doc.id,
          status,
          trackingId: d.trackingId || null,
          isWalkIn: d.isWalkIn || false,
        });
      } else {
        const labelMap: Record<string, string> = {
          FOR_SIGNATURE: 'Request moved to For Signature',
          READY_FOR_RELEASE: 'Request ready for release',
          RELEASED: 'Request has been released',
        };
        notifications.push({
          id: `req_${doc.id}_${status}`,
          type: 'request',
          event: 'status_update',
          title: labelMap[status] || 'Request Status Updated',
          message: `${name} — ${docType}`,
          timestamp: updatedAt,
          docId: doc.id,
          status,
          trackingId: d.trackingId || null,
          isWalkIn: d.isWalkIn || false,
        });
      }
    }

    // ── Appointment Requests ──────────────────────────────────────────────────
    let aptRef: admin.firestore.Query = db()
      .collection('appointmentRequests')
      .where('createdAt', '>=', cutoff);
    if (beforeTs) aptRef = aptRef.where('createdAt', '<', beforeTs);
    const aptSnap = await aptRef
      .orderBy('createdAt', 'desc')
      .limit(PAGE_LIMIT + 1)
      .get();

    for (const doc of aptSnap.docs) {
      const d = doc.data();
      const status: string = d.status || 'PENDING';
      const createdAt = toISO(d.createdAt);
      const updatedAt = d.updatedAt ? toISO(d.updatedAt) : createdAt;
      const isNew = status === 'PENDING';

      if (isNew) {
        notifications.push({
          id: `apt_${doc.id}_PENDING`,
          type: 'appointment',
          event: 'new_appointment',
          title: 'New Appointment Request',
          message: `${d.name || 'Someone'} requested an appointment on ${d.date || ''}`,
          timestamp: createdAt,
          docId: doc.id,
          status,
          date: d.date || null,
          time: d.time || null,
        });
      } else {
        const labelMap: Record<string, string> = {
          APPROVED: 'Appointment approved',
          DECLINED: 'Appointment declined',
          RESCHEDULED: 'Appointment rescheduled',
        };
        notifications.push({
          id: `apt_${doc.id}_${status}`,
          type: 'appointment',
          event: 'appointment_update',
          title: labelMap[status] || 'Appointment Updated',
          message: `${d.name || 'Someone'} — ${d.purpose || ''}`,
          timestamp: updatedAt,
          docId: doc.id,
          status,
          date: d.date || null,
          time: d.time || null,
        });
      }
    }

    // ── Blotter Cases ─────────────────────────────────────────────────────────
    let blotterRef: admin.firestore.Query = db()
      .collection('blotter')
      .where('isArchived', '==', false)
      .where('updatedAt', '>=', cutoff);
    if (beforeTs) blotterRef = blotterRef.where('updatedAt', '<', beforeTs);
    const blotterSnap = await blotterRef
      .orderBy('updatedAt', 'desc')
      .limit(PAGE_LIMIT + 1)
      .get();

    for (const doc of blotterSnap.docs) {
      const d = doc.data();
      const status: string = d.status || 'OPEN';
      const complainantName = `${d.complainant?.firstName || ''} ${d.complainant?.lastName || ''}`.trim();
      const respondentName = `${d.respondent?.firstName || ''} ${d.respondent?.lastName || ''}`.trim();
      const updatedAt = toISO(d.updatedAt);
      const createdAt = toISO(d.createdAt);
      const isNew = status === 'OPEN' && d.statusHistory?.length <= 1;

      if (isNew) {
        notifications.push({
          id: `blotter_${doc.id}_OPEN`,
          type: 'blotter',
          event: 'new_blotter',
          title: 'New Blotter Case Filed',
          message: `Case ${d.caseNumber}: ${complainantName} vs ${respondentName}`,
          timestamp: createdAt,
          docId: doc.id,
          status,
          caseNumber: d.caseNumber || null,
        });
      } else {
        const labelMap: Record<string, string> = {
          UNDER_MEDIATION: 'Blotter case under mediation',
          SETTLED: 'Blotter case settled',
          ESCALATED: 'Blotter case escalated',
          ESCALATED_RETURNED: 'Blotter case returned from escalation',
          DISMISSED: 'Blotter case dismissed',
        };
        notifications.push({
          id: `blotter_${doc.id}_${status}`,
          type: 'blotter',
          event: 'blotter_update',
          title: labelMap[status] || 'Blotter Case Updated',
          message: `Case ${d.caseNumber}: ${complainantName} vs ${respondentName}`,
          timestamp: updatedAt,
          docId: doc.id,
          status,
          caseNumber: d.caseNumber || null,
        });
      }
    }

    // Sort all notifications by timestamp descending
    notifications.sort((a: any, b: any) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const hasMore = notifications.length > PAGE_LIMIT;
    res.json({ notifications: notifications.slice(0, PAGE_LIMIT), hasMore });
  } catch (err: any) {
    console.error('Error fetching notifications:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;
