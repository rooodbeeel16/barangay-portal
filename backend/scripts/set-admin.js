/**
 * Bootstrap script — sets the Firebase custom claim `role: 'admin'` on a user.
 *
 * Usage:
 *   node scripts/set-admin.js <email>
 *
 * Example:
 *   node scripts/set-admin.js superadmin@brgy-sirangan.gov.ph
 *
 * Run from the backend/ directory so the relative path to serviceAccount.json resolves.
 */

'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const serviceAccountPath = path.join(__dirname, '../src/config/serviceAccount.json');

let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.error('❌  Could not load serviceAccount.json from:', serviceAccountPath);
  console.error('    Make sure you are running this script from the backend/ directory.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/set-admin.js <email>');
    process.exit(1);
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    console.error(`❌  No Firebase user found with email: ${email}`);
    process.exit(1);
  }

  // Preserve any existing claims and add/overwrite the role
  const existing = userRecord.customClaims || {};
  await admin.auth().setCustomUserClaims(userRecord.uid, { ...existing, role: 'admin' });

  console.log(`✅  role: 'admin' set for ${email} (uid: ${userRecord.uid})`);
  console.log('    The user must sign out and back in (or wait up to 1 hr) for the new token to include the claim.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌  Unexpected error:', err.message); process.exit(1); });
