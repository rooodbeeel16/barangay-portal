import { Router, Response } from 'express';
import multer from 'multer';
import { auth, storage } from '../config/firebase';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  },
});

/**
 * Upload a file to Firebase Cloud Storage and return a permanent download URL.
 * Uses a Firebase Storage download token so the URL works without public bucket ACLs.
 */
async function saveToStorage(buffer: Buffer, subdir: string, ext: string): Promise<{ filename: string; url: string }> {
  const name = `${uuidv4()}${ext}`;
  const filePath = `${subdir}/${name}`;
  const bucket = storage();
  const file = bucket.file(filePath);
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const downloadToken = uuidv4();

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: {
        // Firebase Storage uses this token to build the ?alt=media&token=... URL
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const bucketName = bucket.name;
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;
  return { filename: filePath, url };
}

router.post('/id', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const { filename, url } = await saveToStorage(req.file.buffer, 'ids', ext);
    res.json({ success: true, url, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// POST /uploads/official-image — admin only, permanent URL for official photos
router.post('/official-image', requireAdmin, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const { filename, url } = await saveToStorage(req.file.buffer, 'officials', ext);
    res.json({ success: true, url, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// POST /uploads/profile-image — authenticated user, permanent URL, updates Firebase Auth photoURL
router.post('/profile-image', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const { filename, url } = await saveToStorage(req.file.buffer, 'profiles', ext);
    await auth().updateUser(req.user!.uid, { photoURL: url });
    res.json({ success: true, url, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
