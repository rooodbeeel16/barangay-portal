import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

export interface Appointment {
  requestId: string;
  trackingId: string;
  residentName: string;
  documentType: string;
  appointmentDate: string; // ISO string
  appointmentTime: string;
  notes?: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  createdAt: admin.firestore.FieldValue;
}

export async function createAppointment(data: Omit<Appointment, 'status' | 'createdAt'>): Promise<string> {
  const ref = await db().collection('appointments').add({
    ...data,
    status: 'SCHEDULED',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getAppointmentsByDate(date: string): Promise<any[]> {
  const snapshot = await db().collection('appointments')
    .where('appointmentDate', '==', date)
    .where('status', '==', 'SCHEDULED')
    .orderBy('appointmentTime', 'asc')
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}
