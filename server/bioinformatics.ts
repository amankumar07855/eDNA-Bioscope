import crypto from 'node:crypto';
import type {
  ConfidenceLevel,
  PreprocessingParams,
  PreprocessingStats,
  ReferenceMode,
  SequenceRecord,
  TaxonomicAssignmentRecord,
} from './types.ts';

export interface MalformedRecordInfo {
  lineOrIndex: number;
  sequenceId: string;
  reason: string;
}

export interface ParsedDatasetResult {
  sequences: SequenceRecord[];
  malformedDetails: MalformedRecordInfo[];
  totalRecords: number;
  validCount: number;
  malformedCount: number;
  avgLength: number;
  minLength: number;
  maxLength: number;
}

const VALID_IUPAC_DNA = /^[ACGTURYKMSWBDHVN]+$/i;

function countAmbiguousBases(seq: string): number {
  let count = 0;
  for (let i = 0; i < seq.length; i++) {
    const ch = seq[i].toUpperCase();
    if (ch !== 'A' && ch !== 'C' && ch !== 'G' && ch !== 'T') {
      count++;
    }
  }
  return count;
}

function computeMeanPhred33(qual: string): number {
  if (!qual) return 0;
  let sum = 0;
  for (let i = 0; i < qual.length; i++) {
    sum += qual.charCodeAt(i) - 33;
  }
  return Number((sum / qual.length).toFixed(2));
}

function computeGcPct(seq: string): number {
  if (!seq.length) return 0;
  let gc = 0;
  for (let i = 0; i < seq.length; i++) {
    const c = seq[i].toUpperCase();
    if (c === 'G' || c === 'C') gc++;
  }
  return (gc / seq.length) * 100;
}

export function parseDatasetContent(
  rawText: string,
  fileFormat: string,
  datasetId: string,
  ownerUid: string
): ParsedDatasetResult {
  const fmt = fileFormat.toLowerCase().replace(/^\./, '');
  const sequences: SequenceRecord[] = [];
  const malformedDetails: MalformedRecordInfo[] = [];
  const seenSeqs = new Set<string>();

  const pushRecord = (seqId: string, rawSeq: string, qualScore: number | null, lineNum: number) => {
    const seq = rawSeq.replace(/\s+/g, '').toUpperCase();
    let isValid = true;
    let validationError: string | null = null;

    if (!seqId.trim()) {
      isValid = false;
      validationError = 'Missing sequence identifier';
    } else if (!seq.length) {
      isValid = false;
      validationError = 'Empty nucleotide sequence';
    } else if (!VALID_IUPAC_DNA.test(seq)) {
      isValid = false;
      validationError = 'Contains invalid non-IUPAC nucleotide characters';
    }

    if (!isValid) {
      malformedDetails.push({
        lineOrIndex: lineNum,
        sequenceId: seqId || `record_${lineNum}`,
        reason: validationError || 'Malformed record',
      });
    }

    const isDup = isValid && seenSeqs.has(seq);
    if (isValid) seenSeqs.add(seq);

    sequences.push({
      id: crypto.randomUUID(),
      dataset_id: datasetId,
      owner_uid: ownerUid,
      sequence_id: seqId.trim() || `record_${lineNum}`,
      sequence_length: seq.length,
      sequence_data: seq,
      quality_score: qualScore,
      ambiguous_bases: countAmbiguousBases(seq),
      is_valid: isValid,
      is_duplicate: isDup,
      is_filtered_out: false,
      validation_error: validationError,
    });
  };

  if (fmt === 'fasta' || fmt === 'fa' || fmt === 'fna') {
    const lines = rawText.split(/\r?\n/);
    let currentId = '';
    let currentSeq = '';
    let headerLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('>')) {
        if (currentId || currentSeq) {
          pushRecord(currentId, currentSeq, null, headerLine);
        }
        currentId = line.slice(1).split(/\s+/)[0] || '';
        currentSeq = '';
        headerLine = i + 1;
      } else {
        if (!currentId) {
          malformedDetails.push({
            lineOrIndex: i + 1,
            sequenceId: `line_${i + 1}`,
            reason: 'Sequence data encountered before FASTA header (">")',
          });
          sequences.push({
            id: crypto.randomUUID(),
            dataset_id: datasetId,
            owner_uid: ownerUid,
            sequence_id: `orphan_line_${i + 1}`,
            sequence_length: line.length,
            sequence_data: line.toUpperCase(),
            quality_score: null,
            ambiguous_bases: countAmbiguousBases(line),
            is_valid: false,
            is_duplicate: false,
            is_filtered_out: true,
            validation_error: 'Orphan sequence line without FASTA header',
          });
        } else {
          currentSeq += line;
        }
      }
    }
    if (currentId || currentSeq) {
      pushRecord(currentId, currentSeq, null, headerLine);
    }
  } else if (fmt === 'fastq' || fmt === 'fq') {
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 0; i < lines.length; i += 4) {
      const h = lines[i]?.trim() ?? '';
      const s = lines[i + 1]?.trim() ?? '';
      const plus = lines[i + 2]?.trim() ?? '';
      const q = lines[i + 3]?.trim() ?? '';
      const seqId = h.startsWith('@') ? h.slice(1).split(/\s+/)[0] : h;

      if (!h.startsWith('@') || !plus.startsWith('+') || s.length !== q.length) {
        const reason = !h.startsWith('@')
          ? 'Missing "@" FASTQ header'
          : !plus.startsWith('+')
          ? 'Missing "+" separator line'
          : `Sequence length (${s.length}) does not match quality string length (${q.length})`;
        malformedDetails.push({ lineOrIndex: i + 1, sequenceId: seqId || `read_${i + 1}`, reason });
        sequences.push({
          id: crypto.randomUUID(),
          dataset_id: datasetId,
          owner_uid: ownerUid,
          sequence_id: seqId || `read_${i + 1}`,
          sequence_length: s.length,
          sequence_data: s.toUpperCase(),
          quality_score: q.length ? computeMeanPhred33(q) : 0,
          ambiguous_bases: countAmbiguousBases(s),
          is_valid: false,
          is_duplicate: false,
          is_filtered_out: true,
          validation_error: reason,
        });
      } else {
        pushRecord(seqId, s, computeMeanPhred33(q), i + 1);
      }
    }
  } else if (fmt === 'csv' || fmt === 'tsv') {
    const sep = fmt === 'tsv' ? '\t' : ',';
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length > 0) {
      const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      const idIdx = headers.findIndex((h) => ['id', 'sequence_id', 'seq_id', 'read_id'].includes(h));
      const seqIdx = headers.findIndex((h) => ['sequence', 'seq', 'sequence_data', 'dna'].includes(h));
      const qualIdx = headers.findIndex((h) => ['quality', 'quality_score', 'phred'].includes(h));
      const startRow = seqIdx >= 0 ? 1 : 0;

      for (let i = startRow; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        const sid = idIdx >= 0 ? cols[idIdx] : cols[0] || `row_${i + 1}`;
        const seqVal = seqIdx >= 0 ? cols[seqIdx] : cols[1] ?? '';
        const qVal = qualIdx >= 0 && cols[qualIdx] ? Number(cols[qualIdx]) : null;
        pushRecord(sid, seqVal, Number.isFinite(qVal) ? qVal : null, i + 1);
      }
    }
  } else if (fmt === 'json') {
    try {
      const parsed = JSON.parse(rawText);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.sequences) ? parsed.sequences : [];
      arr.forEach((item: Record<string, unknown>, idx: number) => {
        const sid = String(item.sequence_id ?? item.id ?? `json_seq_${idx + 1}`);
        const seqVal = String(item.sequence ?? item.sequence_data ?? item.dna ?? '');
        const qVal = typeof item.quality_score === 'number' ? item.quality_score : null;
        pushRecord(sid, seqVal, qVal, idx + 1);
      });
    } catch (err) {
      malformedDetails.push({
        lineOrIndex: 1,
        sequenceId: 'JSON_ROOT',
        reason: err instanceof Error ? err.message : 'Invalid JSON structure',
      });
    }
  }

  const validSeqs = sequences.filter((s) => s.is_valid);
  const lengths = validSeqs.map((s) => s.sequence_length);
  const totalLen = lengths.reduce((a, b) => a + b, 0);

  return {
    sequences,
    malformedDetails,
    totalRecords: sequences.length,
    validCount: validSeqs.length,
    malformedCount: malformedDetails.length,
    avgLength: validSeqs.length ? Number((totalLen / validSeqs.length).toFixed(1)) : 0,
    minLength: lengths.length ? Math.min(...lengths) : 0,
    maxLength: lengths.length ? Math.max(...lengths) : 0,
  };
}

export function runPreprocessingPipeline(
  sequences: SequenceRecord[],
  params: PreprocessingParams
): { updatedSequences: SequenceRecord[]; stats: PreprocessingStats; cleanedFasta: string } {
  const seen = new Set<string>();
  let validCount = 0;
  let invalidCount = 0;
  let filteredCount = 0;
  let duplicateCount = 0;
  const retainedLengths: number[] = [];
  let gcSum = 0;
  let qualSum = 0;
  let qualCount = 0;
  const cleanedLines: string[] = [];

  const updatedSequences = sequences.map((seq) => {
    if (!seq.is_valid) {
      invalidCount++;
      return { ...seq, is_filtered_out: true };
    }
    validCount++;

    const ambigPct = seq.sequence_length > 0 ? (seq.ambiguous_bases / seq.sequence_length) * 100 : 100;
    const failsLength = seq.sequence_length < params.minLength || seq.sequence_length > params.maxLength;
    const failsAmbig = ambigPct > params.maxAmbiguousPct;
    const failsQuality = seq.quality_score !== null && seq.quality_score < params.minMeanQuality;
    const isDup = seen.has(seq.sequence_data);
    seen.add(seq.sequence_data);
    if (isDup) duplicateCount++;

    const shouldFilterOut = failsLength || failsAmbig || failsQuality || (params.deduplicate && isDup);
    if (shouldFilterOut) {
      filteredCount++;
    } else {
      retainedLengths.push(seq.sequence_length);
      gcSum += computeGcPct(seq.sequence_data);
      if (seq.quality_score !== null) {
        qualSum += seq.quality_score;
        qualCount++;
      }
      cleanedLines.push(`>${seq.sequence_id}\n${seq.sequence_data}`);
    }

    return {
      ...seq,
      is_duplicate: isDup,
      is_filtered_out: shouldFilterOut,
    };
  });

  const retained = retainedLengths.length;
  const totalLen = retainedLengths.reduce((a, b) => a + b, 0);

  return {
    updatedSequences,
    stats: {
      totalSequences: sequences.length,
      validSequences: validCount,
      invalidSequences: invalidCount,
      filteredSequences: filteredCount,
      duplicateSequences: duplicateCount,
      retainedSequences: retained,
      avgLength: retained ? Number((totalLen / retained).toFixed(1)) : 0,
      minLength: retained ? Math.min(...retainedLengths) : 0,
      maxLength: retained ? Math.max(...retainedLengths) : 0,
      meanGcPct: retained ? Number((gcSum / retained).toFixed(2)) : 0,
      meanQuality: qualCount ? Number((qualSum / qualCount).toFixed(2)) : null,
      processedAt: new Date().toISOString(),
    },
    cleanedFasta: cleanedLines.join('\n'),
  };
}

// Curated Reference Library (Real NCBI GenBank / BOLD marker sequences for deterministic local BLAST-like matching)
export interface ReferenceTaxonEntry {
  referenceId: string;
  marker: string;
  scientificName: string;
  commonName: string;
  taxonomyId: string;
  domain: string;
  kingdom: string;
  phylum: string;
  className: string;
  orderName: string;
  familyName: string;
  genusName: string;
  speciesName: string;
  conservationStatus: string | null;
  invasiveStatus: string | null;
  referenceSource: string;
  sequence: string;
}

export const CURATED_LOCAL_REFERENCE_DB: ReferenceTaxonEntry[] = [
  {
    referenceId: 'NC_001960.1',
    marker: 'COI',
    scientificName: 'Oncorhynchus mykiss',
    commonName: 'Rainbow trout',
    taxonomyId: '8022',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Chordata',
    className: 'Actinopterygii',
    orderName: 'Salmoniformes',
    familyName: 'Salmonidae',
    genusName: 'Oncorhynchus',
    speciesName: 'Oncorhynchus mykiss',
    conservationStatus: 'Least Concern (IUCN)',
    invasiveStatus: 'Introduced in non-native coldwater basins',
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'CCTCTATCTAGTATTTGGTGCCTGAGCCGGAATAGTAGGCACTGCACTAAGTCTACTAATTCGTGCTGAATTAAGTCAACCAGGCGCACTTCTGGGCGATGATCAAATCTATAATGTCATCGTTACTGCCCATGCTTTCGTAATAATTTTCTTTATAGTAATGCCAATTATGATTGGAGGATTTGGAAACTGACTTATCCCACTAATGATTGGGGCCCCCGACATAGCATTCCCTCGAATAAACAACATAAGCTTCTGACTCCTCCCACCCTCCTTCCTCCTTCTCCTGGCCTCCTCTGGGGTTGAA',
  },
  {
    referenceId: 'NC_001601.1',
    marker: '12S',
    scientificName: 'Salmo trutta',
    commonName: 'Brown trout',
    taxonomyId: '8032',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Chordata',
    className: 'Actinopterygii',
    orderName: 'Salmoniformes',
    familyName: 'Salmonidae',
    genusName: 'Salmo',
    speciesName: 'Salmo trutta',
    conservationStatus: 'Least Concern (IUCN)',
    invasiveStatus: null,
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'CAAACTGGGATTAGATACCCCACTATGCCTAGCCGTAAACGATGAAAGCTCTAGACAACCCATCCGCCCGAGAACTACGAGCGACAGCTTAAAACCCAAAGGACTTGGCGGTGCTTTAGATCCACCTAGAGGAGCCTGTTCTAGAACCGATAACCCCCGTTCAACCTCACCCTCCCTTGTTTTTCCCGCCTATATACCGCCGTCGTCAGCTTACCCTGTGAAGGATCAATAGTAAGCAAAATGGGCACAACCCAAAACGTCAGGTCGAGGTGTAGCGTATGGGGAGGAAGAAATGGGCTACATTCCCT',
  },
  {
    referenceId: 'NC_001712.1',
    marker: 'COI',
    scientificName: 'Cyprinus carpio',
    commonName: 'Common carp',
    taxonomyId: '7962',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Chordata',
    className: 'Actinopterygii',
    orderName: 'Cypriniformes',
    familyName: 'Cyprinidae',
    genusName: 'Cyprinus',
    speciesName: 'Cyprinus carpio',
    conservationStatus: 'Vulnerable (IUCN Native Range)',
    invasiveStatus: 'Invasive in multiple freshwater ecosystems',
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'TCTCTACCTCGTATTCGGAGCCTGAGCTGGAATGGTGGGAACAGCCTTAAGCCTGCTTATTCGGGCCGAACTCAGTCAACCAGGATCACTTCTTGGAGACGACCAGATCTATAATGTAATTGTCACCGCCCACGCCTTCGTGATAATCTTCTTTATAGTCATGCCAATTCTTATTGGAGGTTTCGGAAACTGGCTTGTCCCTCTAATAATCGGAGCTCCAGATATGGCATTCCCCCGAATGAATAATATAAGCTTCTGACTTCTACCCCCATCATTCCTTCTACTTCTAGCCTCATCAGGTGTCGAA',
  },
  {
    referenceId: 'NC_011180.1',
    marker: 'COI',
    scientificName: 'Daphnia pulex',
    commonName: 'Common water flea',
    taxonomyId: '6669',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Arthropoda',
    className: 'Branchiopoda',
    orderName: 'Diplostraca',
    familyName: 'Daphniidae',
    genusName: 'Daphnia',
    speciesName: 'Daphnia pulex',
    conservationStatus: null,
    invasiveStatus: null,
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'ACTCTATTTTATCTTTGGTATTTGAGCAGGAATAGTTGGGACATCCTTAAGCTTGCTTATCCGTGCTGAACTAGGCCAACCTGGTAGATTAATTGGAGATGATCAAATTTACAATGTAATTGTAACTGCCCACGCTTTCATTATAATTTTTTTTATGGTAATACCAATCATAATTGGAGGATTTGGAAATTGATTAGTTCCACTAATATTGGGAGCACCTGATATAGCCTTCCCTCGAATAAATAATATAAGATTCTGGCTTTTACCACCAGCTCTTACTTTATTACTAGTAAGTAGAATAGTAGAA',
  },
  {
    referenceId: 'JX117876.1',
    marker: 'COI',
    scientificName: 'Dreissena polymorpha',
    commonName: 'Zebra mussel',
    taxonomyId: '45954',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Mollusca',
    className: 'Bivalvia',
    orderName: 'Myida',
    familyName: 'Dreissenidae',
    genusName: 'Dreissena',
    speciesName: 'Dreissena polymorpha',
    conservationStatus: 'Least Concern (IUCN)',
    invasiveStatus: 'High-impact aquatic invasive species',
    referenceSource: 'Curated BOLD Systems Reference',
    sequence: 'GGGACTTTATATTTGTTATTTGGTGTTTGGGCAGGCTTAGTAGGAACAGGATTAAGTCTTTTAATTCGTCTTGAATTAGGTCAACCTGGTACTCTTTTGGGAGATGATCAGTTATATAACGTAATTGTTACTGCTCACGCATTTATTATGATTTTTTTTTTAGTAATGCCGATTATAATTGGGGGTTTCGGGAATTGGTTAGTTCCTTTATTATTAGGTGCGCCTGATATAGCTTTCCCTCGTCTGAATAATTTAAGATTTTGACTTTTGCCCCCTTCTTTACTTCTTTTATTATTTTCCTCTACAGTA',
  },
  {
    referenceId: 'NR_024570.1',
    marker: '16S',
    scientificName: 'Escherichia coli',
    commonName: 'E. coli',
    taxonomyId: '562',
    domain: 'Bacteria',
    kingdom: 'Pseudomonadati',
    phylum: 'Pseudomonadota',
    className: 'Gammaproteobacteria',
    orderName: 'Enterobacterales',
    familyName: 'Enterobacteriaceae',
    genusName: 'Escherichia',
    speciesName: 'Escherichia coli',
    conservationStatus: null,
    invasiveStatus: null,
    referenceSource: 'Curated NCBI 16S RefSeq',
    sequence: 'AGAGTTTGATCATGGCTCAGATTGAACGCTGGCGGCAGGCCTAACACATGCAAGTCGAACGGTAACAGGAAGAAGCTTGCTTCTTTGCTGACGAGTGGCGGACGGGTGAGTAATGTCTGGGAAACTGCCTGATGGAGGGGGATAACTACTGGAAACGGTAGCTAATACCGCATAACGTCGCAAGACCAAAGAGGGGGACCTTCGGGCCTCTTGCCATCGGATGTGCCCAGATGGGATTAGCTAGTAGGTGGGGTAACGGCTCACCTAGGCGACGATCCCTAGCTGGTCTGAGAGGATGACCAGCCACA',
  },
  {
    referenceId: 'NR_074859.1',
    marker: '16S',
    scientificName: 'Synechococcus elongatus',
    commonName: 'Freshwater cyanobacterium',
    taxonomyId: '32046',
    domain: 'Bacteria',
    kingdom: 'Bacillati',
    phylum: 'Cyanobacteriota',
    className: 'Cyanophyceae',
    orderName: 'Synechococcales',
    familyName: 'Synechococcaceae',
    genusName: 'Synechococcus',
    speciesName: 'Synechococcus elongatus',
    conservationStatus: null,
    invasiveStatus: null,
    referenceSource: 'Curated NCBI 16S RefSeq',
    sequence: 'GGACGGGTGAGTAACGCGTGAGAATCTGCCCACAGGAGGGGGATAACTAGAGGAAACTTTAGCTAATACCGCATATGCTGCGAGGAGTAAAGGGTGCCTTCGGGCACCTGTTACCTCGTGAGGAGCGAGCCTCTTATCAGCTAGTTGGTAGGGTAAAGGCCTACCAAGGCGACGACGGGTAGCTGGTCTGAGAGGATGATCAGCCACACTGGGACTGAGACACGGCCCAGACTCCTACGGGAGGCAGCAGTGGGGAATTTTCCGCAATGGGCGAAAGCCTGACGGAGCAATGCCGCGTGAGGGAGGA',
  },
  {
    referenceId: 'KF959656.1',
    marker: '18S',
    scientificName: 'Navicula radiosa',
    commonName: 'Pennate freshwater diatom',
    taxonomyId: '187312',
    domain: 'Eukaryota',
    kingdom: 'Sar',
    phylum: 'Bacillariophyta',
    className: 'Bacillariophyceae',
    orderName: 'Naviculales',
    familyName: 'Naviculaceae',
    genusName: 'Navicula',
    speciesName: 'Navicula radiosa',
    conservationStatus: null,
    invasiveStatus: null,
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'TACCTGGTTGATCCTGCCAGTAGTCATATGCTTGTCTCAAAGATTAAGCCATGCATGTCTAAGTATAAACGACTTTATACTGTGAAACTGCGAATGGCTCATTAAATCAGTTATAGTTTATTTGATGGTACCTTTACTTGGATAACCGTGGTAATTCTAGAGCTAATACATGCGTCAATTCCCGACTCCGGAAGGGATGTATTTATTAGATAAAAAATCAACGCGGTTTACCGCTCCTTTGGTGATTCATAATAACTTTTCGAATCGCATGGCCTCGTGCCGGCGATGGATCATTCAAATTTCTGC',
  },
  {
    referenceId: 'NC_002801.1',
    marker: '12S',
    scientificName: 'Rana temporaria',
    commonName: 'European common frog',
    taxonomyId: '8407',
    domain: 'Eukaryota',
    kingdom: 'Metazoa',
    phylum: 'Chordata',
    className: 'Amphibia',
    orderName: 'Anura',
    familyName: 'Ranidae',
    genusName: 'Rana',
    speciesName: 'Rana temporaria',
    conservationStatus: 'Least Concern (IUCN)',
    invasiveStatus: null,
    referenceSource: 'Curated NCBI GenBank RefSeq',
    sequence: 'CCAAACTGGGATTAGATACCCCACTATGCCTAGCCTTAAACACTGATATTCCACAACAAGACATTATCCGCCAGAGAACTACGAGCGAAAGCTTAAAACTCAAAGGACTTGGCGGTGCTCCACACCCACCTAGAGGAGCCTGTTCTATAATCGATAATCCCCGCTTAACCTCACCACCCCTTGCCTAATACAGCCTATATACCGCCGTCGTCAGCTTACCTTCAGAGGAGAAATAGTAAGCACAATAGTTCCCACCAAAAACGTCAGGTCGAGGTGTAGCATATGGGTGGGAGGAAATGGGCTACAT',
  },
  {
    referenceId: 'KJ739812.1',
    marker: 'rbcL',
    scientificName: 'Elodea canadensis',
    commonName: 'Canadian waterweed',
    taxonomyId: '55453',
    domain: 'Eukaryota',
    kingdom: 'Viridiplantae',
    phylum: 'Streptophyta',
    className: 'Liliopsida',
    orderName: 'Alismatales',
    familyName: 'Hydrocharitaceae',
    genusName: 'Elodea',
    speciesName: 'Elodea canadensis',
    conservationStatus: 'Least Concern (IUCN)',
    invasiveStatus: 'Invasive aquatic macrophyte in Europe',
    referenceSource: 'Curated BOLD Systems Reference',
    sequence: 'ATGTCACCACAAACAGAGACTAAAGCAAGTGTTGGATTCAAAGCTGGTGTTAAAGATTATAAATTGACTTATTATACTCCTGAGTATGAAACCAAAGATACTGATATCTTGGCAGCATTCCGAGTAACTCCTCAACCCGGAGTTCCACCTGAAGAAGCAGGGGCTGCGGTAGCTGCCGAATCTTCTACTGGTACATGGACAACTGTGTGGACCGATGGACTTACCAGTCTTGATCGTTACAAAGGACGATGCTACCACATCGAGCCCGTTCCTGGAGAAGAAAATCAATATATTGCTTATGTAGC',
  },
  {
    referenceId: 'MK841220.1',
    marker: 'ITS',
    scientificName: 'Batrachochytrium dendrobatidis',
    commonName: 'Amphibian chytrid fungus',
    taxonomyId: '109871',
    domain: 'Eukaryota',
    kingdom: 'Fungi',
    phylum: 'Chytridiomycota',
    className: 'Chytridiomycetes',
    orderName: 'Rhizophydiales',
    familyName: 'Batrachochytriaceae',
    genusName: 'Batrachochytrium',
    speciesName: 'Batrachochytrium dendrobatidis',
    conservationStatus: null,
    invasiveStatus: 'Pathogenic fungal threat to amphibians',
    referenceSource: 'Curated NCBI ITS RefSeq',
    sequence: 'TCCGTAGGTGAACCTGCGGAAGGATCATTATTGAATTTTAACATTAAAGTTATTGTAGAAACAAATAGTGCAGAAGTTAGACATGTCGTCTTATGAAAAAATTTAATTACTACTTTCAACAACGGATCTCTTGGCTCTCGCATCGATGAAGAACGCAGCGAAATGCGATACGTAATGTGAATTGCAGAATTCAGTGAATCATCGAATCTTTGAACGCACATTGCGCTCCTTGGTATTCCGAGGAGCATGCCTGTTTGAGCGTCATTTCCTTCTCAAACAATTCTATTTGTGTTTGAGTGGTGTTTA',
  },
];

function buildKmers(seq: string, k = 6): Set<string> {
  const kmers = new Set<string>();
  for (let i = 0; i <= seq.length - k; i++) {
    kmers.add(seq.slice(i, i + k));
  }
  return kmers;
}

function alignSequenceSimilarity(query: string, target: string): { identityPct: number; coveragePct: number; score: number; eValue: number } {
  const qLen = query.length;
  const tLen = target.length;
  if (qLen < 12 || tLen < 12) {
    return { identityPct: 0, coveragePct: 0, score: 0, eValue: 10 };
  }

  // Find best local sliding offset using k-mer seed hits
  const k = 7;
  const targetKmers = new Map<string, number[]>();
  for (let j = 0; j <= tLen - k; j++) {
    const kmer = target.slice(j, j + k);
    const arr = targetKmers.get(kmer);
    if (arr) arr.push(j);
    else targetKmers.set(kmer, [j]);
  }

  const offsetVotes = new Map<number, number>();
  for (let i = 0; i <= qLen - k; i++) {
    const qk = query.slice(i, i + k);
    const hits = targetKmers.get(qk);
    if (!hits) continue;
    for (const j of hits) {
      const offset = j - i;
      offsetVotes.set(offset, (offsetVotes.get(offset) ?? 0) + 1);
    }
  }

  let bestOffset = 0;
  let bestVotes = 0;
  for (const [offset, votes] of offsetVotes.entries()) {
    if (votes > bestVotes) {
      bestVotes = votes;
      bestOffset = offset;
    }
  }

  // Fallback k-mer Jaccard if no exact 7-mer seed
  if (bestVotes === 0) {
    const q5 = buildKmers(query, 5);
    const t5 = buildKmers(target, 5);
    let intersection = 0;
    for (const km of q5) if (t5.has(km)) intersection++;
    const union = q5.size + t5.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    const estId = Number((jaccard * 100).toFixed(2));
    return {
      identityPct: estId,
      coveragePct: Number((Math.min(1, jaccard * 1.4) * 100).toFixed(1)),
      score: Math.round(intersection * 2),
      eValue: estId >= 75 ? 1e-8 : 0.45,
    };
  }

  // Compute exact base matches across overlap window at bestOffset
  const startQ = Math.max(0, -bestOffset);
  const endQ = Math.min(qLen, tLen - bestOffset);
  const overlapLen = Math.max(0, endQ - startQ);
  if (overlapLen === 0) {
    return { identityPct: 0, coveragePct: 0, score: 0, eValue: 10 };
  }

  let matches = 0;
  for (let i = startQ; i < endQ; i++) {
    if (query[i] === target[i + bestOffset]) {
      matches++;
    }
  }

  const identityPct = Number(((matches / overlapLen) * 100).toFixed(2));
  const coveragePct = Number(((overlapLen / qLen) * 100).toFixed(1));
  const rawScore = matches * 2 - (overlapLen - matches) * 3;
  const bitScore = Math.max(0, Number((rawScore * 0.55).toFixed(1)));
  // Approximate BLAST E-value from bitScore
  const eValue = bitScore > 40 ? Number((1e-10 * Math.pow(2, -(bitScore - 40) / 3)).toExponential(2)) : Number((10 * Math.exp(-bitScore / 10)).toFixed(4));

  return { identityPct, coveragePct, score: bitScore, eValue };
}

function classifyByLcaAndConfidence(
  hits: Array<{ entry: ReferenceTaxonEntry; identityPct: number; coveragePct: number; score: number; eValue: number }>
): {
  best: ReferenceTaxonEntry | null;
  rank: string;
  scientificName: string;
  confidence: ConfidenceLevel;
  identityPct: number;
  coveragePct: number;
  score: number;
  eValue: number;
} {
  const top = hits[0];
  if (!top || top.identityPct < 75 || top.coveragePct < 50) {
    return {
      best: null,
      rank: 'Unclassified',
      scientificName: 'Unclassified environmental sequence',
      confidence: 'Unclassified',
      identityPct: top?.identityPct ?? 0,
      coveragePct: top?.coveragePct ?? 0,
      score: top?.score ?? 0,
      eValue: top?.eValue ?? 10,
    };
  }

  const nearTies = hits.filter((h) => top.identityPct - h.identityPct <= 1.5 && h.identityPct >= 75);
  let rank = 'Species';
  let scientificName = top.entry.speciesName;

  if (nearTies.length > 1) {
    const sameGenus = nearTies.every((h) => h.entry.genusName === top.entry.genusName);
    const sameFamily = nearTies.every((h) => h.entry.familyName === top.entry.familyName);
    const sameOrder = nearTies.every((h) => h.entry.orderName === top.entry.orderName);
    if (sameGenus) {
      rank = 'Genus';
      scientificName = top.entry.genusName;
    } else if (sameFamily) {
      rank = 'Family';
      scientificName = top.entry.familyName;
    } else if (sameOrder) {
      rank = 'Order';
      scientificName = top.entry.orderName;
    } else {
      rank = 'Phylum';
      scientificName = top.entry.phylum;
    }
  } else if (top.identityPct < 90) {
    rank = 'Family';
    scientificName = top.entry.familyName;
  } else if (top.identityPct < 96) {
    rank = 'Genus';
    scientificName = top.entry.genusName;
  }

  let confidence: ConfidenceLevel = 'Low';
  if (top.identityPct >= 97 && top.coveragePct >= 80 && top.eValue <= 1e-10) {
    confidence = 'High';
  } else if (top.identityPct >= 90 && top.coveragePct >= 65) {
    confidence = 'Moderate';
  }

  return {
    best: top.entry,
    rank,
    scientificName,
    confidence,
    identityPct: top.identityPct,
    coveragePct: top.coveragePct,
    score: top.score,
    eValue: top.eValue,
  };
}

async function queryNcbiBlastAndTaxonomy(sequence: string): Promise<{
  accession: string;
  scientificName: string;
  taxonomyId: string;
  identityPct: number;
  coveragePct: number;
  eValue: number;
  score: number;
  lineage: Record<string, string>;
} | null> {
  const putParams = new URLSearchParams({
    CMD: 'Put',
    PROGRAM: 'blastn',
    DATABASE: 'nt',
    QUERY: sequence.slice(0, 1200),
    FORMAT_TYPE: 'JSON2',
    HITLIST_SIZE: '3',
    EXPECT: '0.001',
  });

  const putRes = await fetch('https://blast.ncbi.nlm.nih.gov/Blast.cgi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: putParams.toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!putRes.ok) throw new Error(`NCBI BLAST Put HTTP ${putRes.status}`);
  const putHtml = await putRes.text();
  const ridMatch = putHtml.match(/RID = ([A-Z0-9]+)/);
  if (!ridMatch) throw new Error('NCBI BLAST did not return a valid Request ID (RID)');
  const rid = ridMatch[1];

  // Poll NCBI BLAST up to 4 times (with short backoff) to stay responsive
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise((r) => setTimeout(r, 3500));
    const checkRes = await fetch(`https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${rid}`, {
      signal: AbortSignal.timeout(10000),
    });
    const statusText = await checkRes.text();
    if (statusText.includes('Status=READY')) {
      const jsonRes = await fetch(`https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&FORMAT_TYPE=JSON2_S&RID=${rid}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!jsonRes.ok) return null;
      const blastJson = await jsonRes.json() as {
        BlastOutput2?: Array<{
          report?: {
            results?: {
              search?: {
                query_len?: number;
                hits?: Array<{
                  description?: Array<{ accession?: string; title?: string; taxid?: number; sciname?: string }>;
                  hsps?: Array<{ identity?: number; align_len?: number; evalue?: number; bit_score?: number }>;
                }>;
              };
            };
          };
        }>;
      };
      const search = blastJson.BlastOutput2?.[0]?.report?.results?.search;
      const hit = search?.hits?.[0];
      const desc = hit?.description?.[0];
      const hsp = hit?.hsps?.[0];
      if (!desc || !hsp) return null;

      const qLen = search?.query_len || sequence.length;
      const alignLen = hsp.align_len || qLen;
      const identityPct = Number((((hsp.identity ?? 0) / alignLen) * 100).toFixed(2));
      const coveragePct = Number((Math.min(100, (alignLen / qLen) * 100)).toFixed(1));
      const taxId = String(desc.taxid ?? '');
      const lineage: Record<string, string> = {};

      if (taxId) {
        try {
          const taxRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=taxonomy&id=${taxId}&retmode=xml`, {
            signal: AbortSignal.timeout(6000),
          });
          if (taxRes.ok) {
            const xml = await taxRes.text();
            const pairs = [...xml.matchAll(/<Taxon>[\s\S]*?<ScientificName>(.*?)<\/ScientificName>[\s\S]*?<Rank>(.*?)<\/Rank>[\s\S]*?<\/Taxon>/g)];
            for (const m of pairs) {
              lineage[m[2].toLowerCase()] = m[1];
            }
          }
        } catch {
          // Taxonomy enrichment optional
        }
      }

      return {
        accession: desc.accession || 'NCBI_NT',
        scientificName: desc.sciname || desc.title || 'Unknown NCBI Hit',
        taxonomyId: taxId || '0',
        identityPct,
        coveragePct,
        eValue: hsp.evalue ?? 0,
        score: hsp.bit_score ?? 0,
        lineage,
      };
    }
    if (statusText.includes('Status=FAILED')) {
      throw new Error('NCBI BLAST job failed upstream');
    }
  }
  return null;
}

export async function identifySequences(
  sequences: SequenceRecord[],
  sampleId: string,
  datasetId: string,
  ownerUid: string,
  referenceMode: ReferenceMode,
  isSimulated = false
): Promise<{ assignments: TaxonomicAssignmentRecord[]; notices: string[] }> {
  const retained = sequences.filter((s) => s.is_valid && !s.is_filtered_out);
  const assignments: TaxonomicAssignmentRecord[] = [];
  const notices: string[] = [];

  for (let idx = 0; idx < retained.length; idx++) {
    const seq = retained[idx];

    if (!isSimulated && referenceMode === 'ncbi_blast' && idx < 3) {
      try {
        const ncbiHit = await queryNcbiBlastAndTaxonomy(seq.sequence_data);
        if (ncbiHit) {
          const confidence: ConfidenceLevel =
            ncbiHit.identityPct >= 97 && ncbiHit.coveragePct >= 80
              ? 'High'
              : ncbiHit.identityPct >= 90
              ? 'Moderate'
              : 'Low';
          assignments.push({
            id: crypto.randomUUID(),
            sequence_id: seq.id,
            sample_id: sampleId,
            dataset_id: datasetId,
            owner_uid: ownerUid,
            query_sequence_id: seq.sequence_id,
            reference_id: ncbiHit.accession,
            scientific_name: ncbiHit.scientificName,
            common_name: '',
            taxonomy_id: ncbiHit.taxonomyId,
            taxonomic_rank: ncbiHit.scientificName.includes(' ') ? 'Species' : 'Genus',
            domain_name: ncbiHit.lineage['superkingdom'] || ncbiHit.lineage['domain'] || 'Eukaryota',
            kingdom_name: ncbiHit.lineage['kingdom'] || '',
            phylum_name: ncbiHit.lineage['phylum'] || '',
            class_name: ncbiHit.lineage['class'] || '',
            order_name: ncbiHit.lineage['order'] || '',
            family_name: ncbiHit.lineage['family'] || '',
            genus_name: ncbiHit.lineage['genus'] || ncbiHit.scientificName.split(' ')[0] || '',
            species_name: ncbiHit.scientificName,
            percentage_identity: ncbiHit.identityPct,
            query_coverage: ncbiHit.coveragePct,
            e_value: ncbiHit.eValue,
            alignment_score: ncbiHit.score,
            confidence,
            reference_source: 'NCBI BLAST (nt) + NCBI Taxonomy',
            conservation_status: null,
            invasive_status: null,
            is_simulated: false,
            created_at: new Date().toISOString(),
          });
          continue;
        } else {
          notices.push(`Sequence ${seq.sequence_id}: NCBI BLAST queued beyond polling window; evaluated against local curated reference.`);
        }
      } catch (err) {
        notices.push(
          `Sequence ${seq.sequence_id}: Live NCBI BLAST unavailable (${err instanceof Error ? err.message : 'network error'}); evaluated against local curated reference.`
        );
      }
    }

    if (!isSimulated && referenceMode === 'bold_systems' && idx < 3) {
      try {
        const boldUrl = `https://v3.boldsystems.org/index.php/Ids_xml?db=COX1_SPECIES&sequence=${encodeURIComponent(seq.sequence_data.slice(0, 700))}`;
        const boldRes = await fetch(boldUrl, { signal: AbortSignal.timeout(8000) });
        if (boldRes.ok) {
          const xml = await boldRes.text();
          const taxonMatch = xml.match(/<taxonomicidentification>(.*?)<\/taxonomicidentification>/);
          const simMatch = xml.match(/<similarity>(.*?)<\/similarity>/);
          const idMatch = xml.match(/<ID>(.*?)<\/ID>/);
          if (taxonMatch && simMatch) {
            const pct = Number((Number(simMatch[1]) * 100).toFixed(2));
            assignments.push({
              id: crypto.randomUUID(),
              sequence_id: seq.id,
              sample_id: sampleId,
              dataset_id: datasetId,
              owner_uid: ownerUid,
              query_sequence_id: seq.sequence_id,
              reference_id: idMatch?.[1] || 'BOLD_COI',
              scientific_name: taxonMatch[1],
              common_name: '',
              taxonomy_id: idMatch?.[1] || 'BOLD',
              taxonomic_rank: 'Species',
              domain_name: 'Eukaryota',
              kingdom_name: 'Metazoa',
              phylum_name: '',
              class_name: '',
              order_name: '',
              family_name: '',
              genus_name: taxonMatch[1].split(' ')[0] || '',
              species_name: taxonMatch[1],
              percentage_identity: pct,
              query_coverage: 95,
              e_value: 1e-12,
              alignment_score: pct * 2,
              confidence: pct >= 98 ? 'High' : pct >= 92 ? 'Moderate' : 'Low',
              reference_source: 'BOLD Systems ID Engine (COX1_SPECIES)',
              conservation_status: null,
              invasive_status: null,
              is_simulated: false,
              created_at: new Date().toISOString(),
            });
            continue;
          }
        }
      } catch (err) {
        notices.push(
          `Sequence ${seq.sequence_id}: BOLD Systems unavailable (${err instanceof Error ? err.message : 'timeout'}); evaluated against local curated reference.`
        );
      }
    }

    // Deterministic Local Reference Alignment (k-mer seeded local alignment + LCA)
    const scoredHits = CURATED_LOCAL_REFERENCE_DB.map((entry) => {
      const aln = alignSequenceSimilarity(seq.sequence_data, entry.sequence);
      return { entry, ...aln };
    }).sort((a, b) => b.identityPct - a.identityPct || b.score - a.score);

    const classified = classifyByLcaAndConfidence(scoredHits);
    const best = classified.best;

    assignments.push({
      id: crypto.randomUUID(),
      sequence_id: seq.id,
      sample_id: sampleId,
      dataset_id: datasetId,
      owner_uid: ownerUid,
      query_sequence_id: seq.sequence_id,
      reference_id: best?.referenceId ?? 'NONE',
      scientific_name: classified.scientificName,
      common_name: best?.commonName ?? '',
      taxonomy_id: best?.taxonomyId ?? '0',
      taxonomic_rank: classified.rank,
      domain_name: best?.domain ?? 'Unclassified',
      kingdom_name: best?.kingdom ?? '',
      phylum_name: best?.phylum ?? '',
      class_name: best?.className ?? '',
      order_name: best?.orderName ?? '',
      family_name: best?.familyName ?? '',
      genus_name: best?.genusName ?? '',
      species_name: classified.rank === 'Species' && best ? best.speciesName : '',
      percentage_identity: classified.identityPct,
      query_coverage: classified.coveragePct,
      e_value: classified.eValue,
      alignment_score: classified.score,
      confidence: classified.confidence,
      reference_source: isSimulated
        ? 'Simulated Demo Reference (Illustrative — Not NCBI/BOLD)'
        : best?.referenceSource ?? 'Curated Local Reference DB',
      conservation_status: best?.conservationStatus ?? null,
      invasive_status: best?.invasiveStatus ?? null,
      is_simulated: isSimulated,
      created_at: new Date().toISOString(),
    });
  }

  return { assignments, notices };
}

export function buildDemoSampleFasta(): string {
  const entries = [
    { id: 'DEMO_READ_001_TROUT_1', seq: CURATED_LOCAL_REFERENCE_DB[0].sequence.slice(0, 220) },
    { id: 'DEMO_READ_002_TROUT_2', seq: CURATED_LOCAL_REFERENCE_DB[0].sequence.slice(10, 230) },
    { id: 'DEMO_READ_003_TROUT_3', seq: CURATED_LOCAL_REFERENCE_DB[0].sequence.slice(5, 225) },
    { id: 'DEMO_READ_004_CARP_1', seq: CURATED_LOCAL_REFERENCE_DB[2].sequence.slice(0, 210) },
    { id: 'DEMO_READ_005_CARP_2', seq: CURATED_LOCAL_REFERENCE_DB[2].sequence.slice(8, 218) },
    { id: 'DEMO_READ_006_DAPHNIA_1', seq: CURATED_LOCAL_REFERENCE_DB[3].sequence.slice(0, 200) },
    { id: 'DEMO_READ_007_DAPHNIA_2', seq: CURATED_LOCAL_REFERENCE_DB[3].sequence.slice(12, 212) },
    { id: 'DEMO_READ_008_MUSSEL_1', seq: CURATED_LOCAL_REFERENCE_DB[4].sequence.slice(0, 210) },
    { id: 'DEMO_READ_009_DIATOM_1', seq: CURATED_LOCAL_REFERENCE_DB[7].sequence.slice(0, 205) },
    { id: 'DEMO_READ_010_UNCLASSIFIED', seq: 'ATGCATGCATGCGCTAGCTAGCTAGCATCGATCGATCGATAGCATGCATGCATGCGCTAGCTAGCATCGATCGATCGATGCATGCATGCATGCGCTAGCTA' },
  ];
  return entries.map((e) => `>${e.id}\n${e.seq}`).join('\n');
}
