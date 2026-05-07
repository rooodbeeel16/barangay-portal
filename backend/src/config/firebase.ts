import * as admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import type { Bucket } from '@google-cloud/storage';
import * as fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export function initFirebase(): void {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(__dirname, 'serviceAccount.json');

  if (fs.existsSync(serviceAccountPath)) {
    // Local development: use service account key file
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } else {
    // Cloud Run / App Hosting: use Application Default Credentials
    admin.initializeApp({
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  console.log('✅ Firebase Admin initialized');
}

export const db = () => admin.firestore();
export const auth = (): Auth => admin.auth();
export const storage = (): Bucket => admin.storage().bucket();
