// Company-approved reference lists for child records.
//
// Case types and case categories are now sourced from the official
// NACC-SAMD-GF-000 (June 2025) certification tool. SURRENDERED_BY and the
// location lists below are STILL PLACEHOLDER VALUES pending confirmation
// from NACC / RACCO I.
// V2: "Adoption" included per the psychologist interview ("active/adoption,
// active/foster care"); final list pending RACCO I confirmation. This
// placement-track list is now corroborated by NACC-SAMD-GF-000 KRA III
// (transition strategies: adoption, kinship/foster care, family
// reunification, independent living).

export const CASE_TYPES = [
  'Adoption',
  'Foster Care',
  'Kinship Care',
  'Residential Care',
  'Family Tracing & Reunification',
  'Independent Living',
];

// Official "Service Users by Case Category" list, NACC-SAMD-GF-000 (June 2025).
export const CASE_CATEGORIES = [
  'Abandoned',
  'Foundling',
  'Surrendered',
  'Neglected',
  'Dependent',
  'Orphaned',
  'Victim of Physical Abuse',
  'Victim of Sexual Abuse',
  'Victim of OSAEC/CSAEM',
  'Trafficked',
  'CICL',
  'Children at Risk (CAR)',
  'Children in Street Situation',
  'Victim of Child Labor',
  'Child With Disability',
  'Child Living with HIV',
  'Indigenous Peoples',
  'Others',
];

// Termination reason categories (must match backend TerminationRecord.REASON_CHOICES).
export const TERMINATION_REASONS = [
  'Reunified with family',
  'Adoption finalized',
  'Transferred to another agency',
  'Aged out of program',
  'Services completed',
  'Other',
];

// Adviser: record who surrendered the child to NACC/RACCO I.
// PLACEHOLDER — pending confirmation from NACC / RACCO I.
export const SURRENDERED_BY = [
  'Social Worker',
  'Police',
  'Relatives',
];

// Province → Municipality/City → Barangay pickers.
// PLACEHOLDER dataset scoped to Region I (La Union), pending confirmation
// from NACC / RACCO I. Expand per company guidance.
export const PROVINCES = ['La Union', 'Ilocos Norte', 'Ilocos Sur', 'Pangasinan'];

export const MUNICIPALITIES = {
  'La Union': ['San Fernando City', 'Agoo', 'Bauang', 'Naguilian', 'Rosario'],
  'Ilocos Norte': ['Laoag City', 'Batac City', 'Paoay'],
  'Ilocos Sur': ['Vigan City', 'Candon City', 'Bantay'],
  Pangasinan: ['Dagupan City', 'Lingayen', 'Urdaneta City'],
};

export const BARANGAYS = {
  'San Fernando City': ['Catbangen', 'Lingsat', 'Pagdaraoan', 'Sevilla'],
  Agoo: ['San Roque East', 'Santa Rita East', 'Purok'],
  Bauang: ['Central East', 'Disso-or', 'Payocpoc Norte'],
  Naguilian: ['Aguioas', 'Bancagan', 'Ortega'],
  Rosario: ['Camp One', 'Carunuan', 'Subusob'],
};
