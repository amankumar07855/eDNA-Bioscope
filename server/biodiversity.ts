import crypto from 'node:crypto';
import type {
  BiodiversityResultRecord,
  RelativeAbundanceItem,
  TaxonomicAssignmentRecord,
} from './types.ts';

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  let res = 0;
  const kk = Math.min(k, n - k);
  for (let i = 1; i <= kk; i++) {
    res += Math.log(n - kk + i) - Math.log(i);
  }
  return res;
}

/**
 * Analytic Hurlbert rarefaction expected richness E[S_n]
 */
export function computeRarefactionCurve(counts: number[], steps = 10): Array<{ subsampleSize: number; expectedSpecies: number }> {
  const N = counts.reduce((a, b) => a + b, 0);
  if (N <= 0 || counts.length === 0) return [];
  const points: Array<{ subsampleSize: number; expectedSpecies: number }> = [];
  const actualSteps = Math.min(steps, N);
  for (let s = 1; s <= actualSteps; s++) {
    const n = Math.max(1, Math.round((s / actualSteps) * N));
    const logDenom = logChoose(N, n);
    let expected = 0;
    for (const ni of counts) {
      if (N - ni < n) {
        expected += 1;
      } else {
        const probAbsent = Math.exp(logChoose(N - ni, n) - logDenom);
        expected += 1 - probAbsent;
      }
    }
    points.push({
      subsampleSize: n,
      expectedSpecies: Number(expected.toFixed(2)),
    });
  }
  return points;
}

export function calculateBiodiversityMetrics(
  sampleId: string,
  ownerUid: string,
  assignments: TaxonomicAssignmentRecord[]
): BiodiversityResultRecord {
  const classified = assignments.filter((a) => a.confidence !== 'Unclassified' && a.scientific_name !== 'Unclassified environmental sequence');

  const countsByTaxon = new Map<string, { items: TaxonomicAssignmentRecord[] }>();
  for (const a of classified) {
    const existing = countsByTaxon.get(a.scientific_name);
    if (existing) existing.items.push(a);
    else countsByTaxon.set(a.scientific_name, { items: [a] });
  }

  const totalReads = classified.length;
  const richness = countsByTaxon.size;

  if (totalReads === 0 || richness === 0) {
    return {
      id: crypto.randomUUID(),
      sample_id: sampleId,
      owner_uid: ownerUid,
      species_richness: 0,
      total_reads: 0,
      shannon_index: 0,
      simpson_index: 0,
      simpson_diversity_1_minus_d: 0,
      pielou_evenness: null,
      relative_abundances: [],
      rarefaction_curve: [],
      analysis_date: new Date().toISOString(),
    };
  }

  let shannon = 0;
  let simpsonD = 0;
  const counts: number[] = [];
  const relativeAbundances: RelativeAbundanceItem[] = [];

  for (const [sciName, group] of countsByTaxon.entries()) {
    const count = group.items.length;
    counts.push(count);
    const pi = count / totalReads;
    if (pi > 0) {
      shannon += -pi * Math.log(pi);
      simpsonD += pi * pi;
    }
    const meanIdentity = group.items.reduce((acc, it) => acc + it.percentage_identity, 0) / count;
    const rep = group.items[0];
    relativeAbundances.push({
      scientific_name: sciName,
      common_name: rep.common_name,
      phylum_name: rep.phylum_name || 'Unassigned',
      taxonomy_id: rep.taxonomy_id,
      read_count: count,
      relative_abundance: Number((pi * 100).toFixed(2)),
      mean_identity: Number(meanIdentity.toFixed(2)),
      confidence: rep.confidence,
      reference_source: rep.reference_source,
    });
  }

  relativeAbundances.sort((a, b) => b.read_count - a.read_count);
  const pielou = richness > 1 ? Number((shannon / Math.log(richness)).toFixed(4)) : null;

  return {
    id: crypto.randomUUID(),
    sample_id: sampleId,
    owner_uid: ownerUid,
    species_richness: richness,
    total_reads: totalReads,
    shannon_index: Number(shannon.toFixed(4)),
    simpson_index: Number(simpsonD.toFixed(4)),
    simpson_diversity_1_minus_d: Number((1 - simpsonD).toFixed(4)),
    pielou_evenness: pielou,
    relative_abundances: relativeAbundances,
    rarefaction_curve: computeRarefactionCurve(counts, 10),
    analysis_date: new Date().toISOString(),
  };
}

export function computeBetaDiversityMatrix(
  sampleResults: Array<{ sampleId: string; sampleName: string; bio: BiodiversityResultRecord }>
): {
  pairs: Array<{
    sampleAId: string;
    sampleAName: string;
    sampleBId: string;
    sampleBName: string;
    brayCurtisDissimilarity: number;
    jaccardSimilarity: number;
    sharedTaxaCount: number;
  }>;
  accumulationCurve: Array<{ samplesIncluded: number; cumulativeTaxa: number; sampleName: string }>;
} {
  const pairs: Array<{
    sampleAId: string;
    sampleAName: string;
    sampleBId: string;
    sampleBName: string;
    brayCurtisDissimilarity: number;
    jaccardSimilarity: number;
    sharedTaxaCount: number;
  }> = [];

  for (let i = 0; i < sampleResults.length; i++) {
    for (let j = i + 1; j < sampleResults.length; j++) {
      const a = sampleResults[i];
      const b = sampleResults[j];
      const mapA = new Map<string, number>();
      const mapB = new Map<string, number>();
      for (const item of a.bio.relative_abundances) mapA.set(item.scientific_name, item.read_count);
      for (const item of b.bio.relative_abundances) mapB.set(item.scientific_name, item.read_count);

      const allTaxa = new Set([...mapA.keys(), ...mapB.keys()]);
      let minSum = 0;
      let totalA = 0;
      let totalB = 0;
      let shared = 0;

      for (const taxon of allTaxa) {
        const ca = mapA.get(taxon) ?? 0;
        const cb = mapB.get(taxon) ?? 0;
        totalA += ca;
        totalB += cb;
        minSum += Math.min(ca, cb);
        if (ca > 0 && cb > 0) shared++;
      }

      const brayCurtis = totalA + totalB > 0 ? 1 - (2 * minSum) / (totalA + totalB) : 1;
      const jaccard = allTaxa.size > 0 ? shared / allTaxa.size : 0;

      pairs.push({
        sampleAId: a.sampleId,
        sampleAName: a.sampleName,
        sampleBId: b.sampleId,
        sampleBName: b.sampleName,
        brayCurtisDissimilarity: Number(brayCurtis.toFixed(4)),
        jaccardSimilarity: Number(jaccard.toFixed(4)),
        sharedTaxaCount: shared,
      });
    }
  }

  const seenTaxa = new Set<string>();
  const accumulationCurve = sampleResults.map((sr, idx) => {
    for (const item of sr.bio.relative_abundances) seenTaxa.add(item.scientific_name);
    return {
      samplesIncluded: idx + 1,
      cumulativeTaxa: seenTaxa.size,
      sampleName: sr.sampleName,
    };
  });

  return { pairs, accumulationCurve };
}
