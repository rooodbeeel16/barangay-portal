import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import rateLimit from 'express-rate-limit';

const router = Router();

const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many tracking requests. Please slow down.' },
});

router.get('/:trackingId', trackingLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const trackingId = req.params.trackingId.replace(/[^A-Z0-9\-]/gi, '').toUpperCase();

    const snapshot = await db().collection('requests')
      .where('trackingId', '==', trackingId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(404).json({ error: 'Tracking ID not found' });
      return;
    }

    const data = snapshot.docs[0].data();
    res.json({
      trackingId: data.trackingId,
      documentType: data.documentType,
      firstName: data.firstName,
      lastName: data.lastName,
      middleName: data.middleName,
      purpose: data.purpose,
      status: data.status,
      qrCodeDataUrl: data.qrCodeDataUrl,
      statusHistory: data.statusHistory,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      fees: data.fees || [],
      totalFees: data.totalFees || 0,
      isPaid: data.isPaid || false,
    });
  } catch {
    res.status(500).json({ error: 'Failed to track request' });
  }
});

export default router;
