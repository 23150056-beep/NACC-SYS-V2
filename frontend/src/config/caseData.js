// Company-approved reference lists for child records.
//
// ⚠️ PLACEHOLDER VALUES — pending confirmation from NACC / the partner agency.
// These are sensible starters drawn from the existing seed data and RACCO I's
// region (La Union). Replace the contents of each list with the official,
// company-approved values once the business-process interview is complete.
// Adviser note: "Adoption" is intentionally excluded here and handled separately.

export const CASE_TYPES = [
  'Foster Care',
  'Kinship Care',
  'Residential Care',
  'Family Tracing & Reunification',
  'Independent Living',
];

// Adviser: record who surrendered the child to NACC/RACCO I.
export const SURRENDERED_BY = [
  'Social Worker',
  'Police',
  'Relatives',
];

// Province → Municipality/City → Barangay pickers.
// Starter dataset scoped to Region I (La Union). Expand per company guidance.
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
