import { Router, Response } from 'express';
import multer from 'multer';
import { auth } from '../config/firebase';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const UPLOADS_DIR = path.join(__dirname, '../../../uploads');

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

function saveLocally(buffer: Buffer, subdir: string, ext: string): { filename: string; url: string } {
  const name = `${uuidv4()}${ext}`;
  const dir = path.join(UPLOADS_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buffer);
  const url = `${process.env.API_BASE_URL || 'http://localhost:3000'}/uploads/${subdir}/${name}`;
  return { filename: `${subdir}/${name}`, url };
}

router.post('/id', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const { filename, url } = saveLocally(req.file.buffer, 'ids', ext);
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
    const { filename, url } = saveLocally(req.file.buffer, 'officials', ext);
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
    // Use uid as filename so re-uploads overwrite the previous one
    const { filename, url } = saveLocally(req.file.buffer, 'profiles', ext);
    await auth().updateUser(req.user!.uid, { photoURL: url });
    res.json({ success: true, url, filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
