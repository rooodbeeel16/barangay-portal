export const BARANGAY = {
  name: 'Barangay Sirangan',
  municipality: 'Sorsogon City',
  province: 'Sorsogon',
  code: 'SIR',
  address: 'Barangay Sirangan, Sorsogon City, Sorsogon',
  phone: '(056) XXX-XXXX',
  email: 'brgy.sirangan@sorsogon.gov.ph',
};

export const DOCUMENT_TYPES = {
  BARANGAY_CLEARANCE: 'Barangay Clearance',
  CERTIFICATE_OF_RESIDENCY: 'Certificate of Residency',
  CERTIFICATE_OF_INDIGENCY: 'Certificate of Indigency',
  BUSINESS_PERMIT_ENDORSEMENT: 'Business Permit Endorsement',
  INCIDENT_REPORT: 'Incident Report',
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const REQUEST_STATUS = {
  PENDING: 'Pending',
  FOR_SIGNATURE: 'For Signature',
  READY_FOR_RELEASE: 'Ready for Release',
  RELEASED: 'Released',
} as const;

export type RequestStatus = keyof typeof REQUEST_STATUS;

export const STATUS_FLOW: Record<string, string[]> = {
  PENDING: ['FOR_SIGNATURE', 'READY_FOR_RELEASE'],
  FOR_SIGNATURE: ['READY_FOR_RELEASE'],
  READY_FOR_RELEASE: ['RELEASED'],
  RELEASED: [],
};

export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
} as const;

// ─── BLOTTER MANAGEMENT ──────────────────────────────────────────────────────

export const BLOTTER_STATUS = {
  OPEN: 'Open',
  UNDER_MEDIATION: 'Under Mediation',
  SETTLED: 'Settled',
  ESCALATED: 'Escalated to Higher Authority',
  ESCALATED_RETURNED: 'Escalated (Returned to Barangay)',
  DISMISSED: 'Dismissed',
} as const;

export type BlotterStatus = keyof typeof BLOTTER_STATUS;

export const BLOTTER_STATUS_FLOW: Record<string, string[]> = {
  OPEN: ['UNDER_MEDIATION', 'DISMISSED'],
  UNDER_MEDIATION: ['SETTLED', 'ESCALATED', 'OPEN'],
  SETTLED: [],
  ESCALATED: ['ESCALATED_RETURNED'],
  ESCALATED_RETURNED: ['UNDER_MEDIATION', 'DISMISSED'],
  DISMISSED: [],
};

export const NATURE_OF_COMPLAINTS = [
  'Noise Complaint',
  'Physical Altercation',
  'Property Dispute',
  'Domestic Dispute',
  'Verbal Abuse / Harassment',
  'Trespassing',
  'Theft / Robbery',
  'Vandalism',
  'Animal Nuisance',
  'Business Dispute',
  'Neighborhood Dispute',
  'Threats / Intimidation',
  'Others',
] as const;

export type NatureOfComplaint = typeof NATURE_OF_COMPLAINTS[number];
