import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { generateDocumentPDF, generateDTSSlip, generateBlotterCertification, generateBlotterSummary, generateBlotterSummons } from '../services/pdf.service';
import { db } from '../config/firebase';
import { logAudit } from '../services/audit.service';

const router = Router();

// Generate and download a document PDF (admin only)
router.get('/generate/:requestId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { buffer, filename } = await generateDocumentPDF(req.params.requestId);

    await logAudit({
      action: 'PDF_GENERATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      requestId: req.params.requestId,
      details: `PDF generated: ${filename}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate PDF' });
  }
});

// Preview a document PDF inline in the browser (admin only)
router.get('/preview/:requestId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { buffer, filename } = await generateDocumentPDF(req.params.requestId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  } catch (err: any) {
    console.error('PDF preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate PDF preview' });
  }
});

// Generate and download a DTS Slip PDF
router.get('/dts-slip/:requestId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docSnap = await db().collection('requests').doc(req.params.requestId).get();
    if (!docSnap.exists) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const data = docSnap.data() as any;
    const buffer = await generateDTSSlip(data);
    const filename = `DTS_Slip_${data.trackingId}.pdf`;

    await logAudit({
      action: 'DTS_SLIP_PRINTED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      requestId: req.params.requestId,
      trackingId: data.trackingId,
      details: `DTS Slip printed for ${data.trackingId}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('DTS slip error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate DTS slip' });
  }
});

// Public DTS Slip (no auth required — used from tracking page)
router.get('/dts-slip-public/:trackingId', async (req, res: Response): Promise<void> => {
  try {
    const trackingId = req.params.trackingId.replace(/[^A-Z0-9\-]/gi, '').toUpperCase();
    const snapshot = await db().collection('requests').where('trackingId', '==', trackingId).limit(1).get();

    if (snapshot.empty) {
      res.status(404).json({ error: 'Tracking ID not found' });
      return;
    }

    const data = snapshot.docs[0].data() as any;
    const buffer = await generateDTSSlip(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="DTS_${trackingId}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate slip' });
  }
});


// ─── BLOTTER PDF ROUTES ───────────────────────────────────────────────────────

// GET /api/pdf/blotter/certification/:caseId — Short blotter certification PDF
router.get('/blotter/certification/:caseId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const caseDoc = await db().collection('blotter').doc(req.params.caseId).get();
    if (!caseDoc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    // Fetch captain name from config
    let captainName: string | undefined;
    try {
      const configSnap = await db().collection('_config').doc('barangay').get();
      if (configSnap.exists) captainName = configSnap.data()?.captainName;
    } catch { /* use default */ }

    const data = { ...caseDoc.data(), captainName } as any;
    // Serialize timestamps
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();

    const buffer = await generateBlotterCertification(data);
    const filename = `Blotter_Certification_${data.caseNumber}.pdf`;

    await logAudit({
      action: 'BLOTTER_CERTIFICATION_GENERATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Blotter certification generated for case ${data.caseNumber}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Blotter certification PDF error:', err);
    res.status(500).json({ error: 'Failed to generate blotter certification' });
  }
});

// GET /api/pdf/blotter/certification/:caseId/preview — Preview inline
router.get('/blotter/certification/:caseId/preview', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const caseDoc = await db().collection('blotter').doc(req.params.caseId).get();
    if (!caseDoc.exists) { res.status(404).json({ error: 'Blotter case not found' }); return; }
    let captainName: string | undefined;
    try { const cs = await db().collection('_config').doc('barangay').get(); if (cs.exists) captainName = cs.data()?.captainName; } catch { }
    const data = { ...caseDoc.data(), captainName } as any;
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
    const buffer = await generateBlotterCertification(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Blotter_Cert_${data.caseNumber}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// GET /api/pdf/blotter/summary/:caseId — Full blotter case summary PDF
router.get('/blotter/summary/:caseId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const caseDoc = await db().collection('blotter').doc(req.params.caseId).get();
    if (!caseDoc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    let captainName: string | undefined;
    try {
      const configSnap = await db().collection('_config').doc('barangay').get();
      if (configSnap.exists) captainName = configSnap.data()?.captainName;
    } catch { }

    const rawData = caseDoc.data() as any;
    const data = {
      ...rawData,
      captainName,
      createdAt: rawData.createdAt?.toDate ? rawData.createdAt.toDate().toISOString() : null,
      hearings: (rawData.hearings || []).map((h: any) => ({
        ...h,
        createdAt: h.createdAt?.toDate ? h.createdAt.toDate().toISOString() : null,
      })),
    };

    const buffer = await generateBlotterSummary(data);
    const filename = `Blotter_Summary_${data.caseNumber}.pdf`;

    await logAudit({
      action: 'BLOTTER_SUMMARY_GENERATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Full blotter summary generated for case ${data.caseNumber}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Blotter summary PDF error:', err);
    res.status(500).json({ error: 'Failed to generate blotter summary' });
  }
});

// GET /api/pdf/blotter/summons/:caseId/:partyType — Summons letter PDF
// partyType: 'COMPLAINANT' or 'RESPONDENT'
// Query params: hearingDate (YYYY-MM-DD), hearingTime (HH:MM), hearingVenue (optional)
router.get('/blotter/summons/:caseId/:partyType', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { partyType, caseId } = req.params;
    if (partyType !== 'COMPLAINANT' && partyType !== 'RESPONDENT') {
      res.status(400).json({ error: 'partyType must be COMPLAINANT or RESPONDENT' });
      return;
    }

    const { hearingDate, hearingTime, hearingVenue } = req.query as Record<string, string>;
    if (!hearingDate || !hearingTime) {
      res.status(400).json({ error: 'hearingDate and hearingTime query parameters are required' });
      return;
    }

    const caseDoc = await db().collection('blotter').doc(caseId).get();
    if (!caseDoc.exists) {
      res.status(404).json({ error: 'Blotter case not found' });
      return;
    }

    let captainName: string | undefined;
    try {
      const configSnap = await db().collection('_config').doc('barangay').get();
      if (configSnap.exists) captainName = configSnap.data()?.captainName;
    } catch { }

    const data = { ...caseDoc.data(), captainName } as any;

    const buffer = await generateBlotterSummons(data, partyType as 'COMPLAINANT' | 'RESPONDENT', hearingDate, hearingTime, hearingVenue);
    const filename = `Summons_${data.caseNumber}_${partyType}.pdf`;

    await logAudit({
      action: 'BLOTTER_SUMMONS_GENERATED',
      staffId: req.user!.uid,
      staffName: req.user!.name,
      staffEmail: req.user!.email,
      details: `Summons generated for ${partyType} in blotter case ${data.caseNumber}`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Blotter summons PDF error:', err);
    res.status(500).json({ error: 'Failed to generate summons' });
  }
});

export default router;

