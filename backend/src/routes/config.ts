import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import * as admin from 'firebase-admin';

const router = Router();

// Get public barangay config
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const doc = await db().collection('_config').doc('barangay').get();
    if (!doc.exists) {
      res.json({
        name: 'Barangay Sirangan',
        municipality: 'Sorsogon City',
        province: 'Sorsogon',
        address: 'Barangay Sirangan, Sorsogon City, Sorsogon',
        phone: '(056) XXX-XXXX',
        email: 'brgy.sirangan@sorsogon.gov.ph',
        officeHours: 'Monday - Friday, 8:00 AM - 5:00 PM',
        logoUrl: '',
        captainName: '',
        captainSignatureUrl: '',
        holidays: [],
        closureDates: [],
      });
      return;
    }
    res.json(doc.data());
  } catch {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// Public: basic stats for homepage (no auth required)
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('requests').get();
    const requests = snapshot.docs.map(d => d.data());
    const today = new Date().toDateString();
    res.json({
      total: requests.length,
      pending: requests.filter(r => r.status === 'PENDING').length,
      released: requests.filter(r => {
        if (r.status !== 'RELEASED') return false;
        const updated = r.updatedAt?.toDate?.();
        return updated && updated.toDateString() === today;
      }).length,
      documentsAvailable: 5,
    });
  } catch {
    res.json({ total: 0, pending: 0, released: 0, documentsAvailable: 5 });
  }
});

// Admin: update barangay config
router.put('/', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await db().collection('_config').doc('barangay').set({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

export default router;
