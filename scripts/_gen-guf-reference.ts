import { generateFamiliesCSVWithMembers } from '../server/csvExportWithMembers';
import { GUF_REFERENCE_FAMILIES } from '../server/__tests__/_fixtures/guf-reference-data';

const csv = generateFamiliesCSVWithMembers(GUF_REFERENCE_FAMILIES, 'update');
const header = "# GENERATED FROM CURRENT EXPORTER (not yet validated against Espe/Sole's GUF reference). Replace with their template before B.3 exit.\n";
process.stdout.write(header + csv);
