import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

export interface AuditEntry {
  action: string;
  staffId: string;
  staffName: string;
  staffEmail: string;
  requestId?: string;
  trackingId?: string;
  details: string;
  timestamp: admin.firestore.FieldValue;
  ipAddress?: string;
}

export async function logAudit(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
  await db().collection('audit_logs').add({
    ...entry,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}
