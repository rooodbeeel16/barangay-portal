import { Router, Request, Response } from 'express';
import { auth, db } from '../config/firebase';
import { requireAdmin, requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';

const router = Router();

// Create staff/admin user (admin only)
router.post('/create-staff', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      displayName: z.string().min(1).max(100),
      role: z.enum(['admin', 'staff']).default('staff'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { email, password, displayName, role } = parsed.data;

    const userRecord = await auth().createUser({ email, password, displayName });
    await auth().setCustomUserClaims(userRecord.uid, { role });

    await db().collection('staff').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: req.user!.uid,
    });

    res.status(201).json({ success: true, uid: userRecord.uid });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create staff' });
  }
});

// Verify token (used by frontend to check auth)
router.get('/verify', async (req: Request, res: Response): Promise<void> => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }
  try {
    const decoded = await auth().verifyIdToken(token);
    res.json({ authenticated: true, uid: decoded.uid, role: decoded.role, email: decoded.email });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

// GET /auth/staff — list all staff accounts (admin only)
router.get('/staff', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = await db().collection('staff').orderBy('createdAt', 'desc').get();
    const staff = snapshot.docs.map(doc => doc.data());
    res.json({ staff });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch staff' });
  }
});

// PATCH /auth/staff/:uid/deactivate — toggle active status (admin only)
router.patch('/staff/:uid/deactivate', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid } = req.params;
    if (uid === req.user!.uid) {
      res.status(400).json({ error: 'Cannot deactivate your own account' });
      return;
    }
    const staffRef = db().collection('staff').doc(uid);
    const staffDoc = await staffRef.get();
    if (!staffDoc.exists) {
      res.status(404).json({ error: 'Staff not found' });
      return;
    }
    const currentActive = staffDoc.data()?.isActive !== false;
    const newActive = !currentActive;
    await auth().updateUser(uid, { disabled: !newActive });
    await staffRef.update({ isActive: newActive });
    res.json({ success: true, isActive: newActive });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update staff status' });
  }
});

// DELETE /auth/staff/:uid — delete a staff account (admin only)
router.delete('/staff/:uid', requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { uid } = req.params;
    if (uid === req.user!.uid) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    const staffRef = db().collection('staff').doc(uid);
    const staffDoc = await staffRef.get();
    if (!staffDoc.exists) {
      res.status(404).json({ error: 'Staff not found' });
      return;
    }
    await auth().deleteUser(uid);
    await staffRef.delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete staff' });
  }
});

// PATCH /auth/profile — update own display name
router.patch('/profile', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).max(100),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    await auth().updateUser(req.user!.uid, { displayName: parsed.data.displayName });

    // Update Firestore staff record if it exists
    try {
      const staffRef = db().collection('staff').doc(req.user!.uid);
      const staffDoc = await staffRef.get();
      if (staffDoc.exists) {
        await staffRef.update({ displayName: parsed.data.displayName });
      }
    } catch (_) { /* non-fatal */ }

    res.json({ success: true, displayName: parsed.data.displayName });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update profile' });
  }
});

export default router;
