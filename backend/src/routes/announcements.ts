import { Router, Request, Response } from 'express';
import { db } from '../config/firebase';
import { requireAuth } from '../middleware/auth.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';
import * as admin from 'firebase-admin';

const router = Router();

// Public: get published announcements
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('announcements')
      .where('published', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    res.json({ announcements: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err: any) {
    // Firestore composite index may not exist yet — fall back to unfiltered query
    if (err?.code === 9 || (err?.message && err.message.includes('index'))) {
      try {
        const snapshot = await db().collection('announcements')
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();
        const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));
        res.json({ announcements: all.filter((a) => a.published === true) });
        return;
      } catch {
        // fall through
      }
    }
    console.error('Announcements fetch error:', err?.message);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Admin: get all announcements
router.get('/all', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('announcements')
      .orderBy('createdAt', 'desc')
      .get();
    res.json({ announcements: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Admin: create announcement
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(5000),
      category: z.enum(['General', 'Health', 'Safety', 'Event', 'Advisory']).default('General'),
      published: z.boolean().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    await db().collection('announcements').add({
      ...parsed.data,
      authorId: req.user!.uid,
      authorName: req.user!.name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Admin: update announcement
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, category, published } = req.body;
    await db().collection('announcements').doc(req.params.id).update({
      title, content, category, published,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Admin: delete announcement
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await db().collection('announcements').doc(req.params.id).delete();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
