/**
 * One-time migration: rename all BRGY-SOR-* trackingIds to BRGY-SIR-*
 */
import * as admin from 'firebase-admin';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = require(path.resolve(__dirname, '../src/config/serviceAccount.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function main() {
  const snapshot = await db.collection('requests')
    .where('trackingId', '>=', 'BRGY-SOR-')
    .where('trackingId', '<', 'BRGY-SOS-')
    .get();

  if (snapshot.empty) {
    console.log('No BRGY-SOR-* records found.');
    return;
  }

  const batch = db.batch();
  let count = 0;

  snapshot.forEach(doc => {
    const oldId: string = doc.data().trackingId;
    const newId = oldId.replace('BRGY-SOR-', 'BRGY-SIR-');
    console.log(`  ${oldId}  →  ${newId}`);
    batch.update(doc.ref, { trackingId: newId });
    count++;
  });

  await batch.commit();
  console.log(`\nDone. Updated ${count} record(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
