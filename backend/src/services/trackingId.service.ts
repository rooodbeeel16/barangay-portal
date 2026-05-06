import { db } from '../config/firebase';
import { BARANGAY } from '../config/constants';

export async function generateTrackingId(): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = db().collection('_counters').doc(`requests_${year}`);

  let newCount = 0;
  await db().runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    newCount = (doc.exists ? (doc.data()?.count ?? 0) : 0) + 1;
    tx.set(counterRef, { count: newCount }, { merge: true });
  });

  const padded = String(newCount).padStart(6, '0');
  return `BRGY-${BARANGAY.code}-${year}-${padded}`;
}
