import { GoogleGenAI } from '@google/genai';
import type { BiodiversityResultRecord, ProjectRecord, SampleRecord, TaxonomicAssignmentRecord } from './types.ts';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isGeminiConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export async function askScientificAssistant(input: {
  question: string;
  projects: ProjectRecord[];
  samples: SampleRecord[];
  biodiversity: BiodiversityResultRecord[];
  taxa: TaxonomicAssignmentRecord[];
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured in the server Secrets panel.');
  }

  const compactContext = {
    projects: input.projects.map((p) => ({
      id: p.id,
      name: p.project_name,
      studyType: p.study_type,
      region: p.geographic_region,
      objective: p.research_objective,
    })),
    samples: input.samples.map((s) => ({
      id: s.id,
      projectId: s.project_id,
      name: s.sample_name,
      source: s.sample_type,
      marker: s.marker,
      location: s.collection_location,
      coordinates: s.latitude !== null && s.longitude !== null ? [s.latitude, s.longitude] : null,
    })),
    biodiversityMetrics: input.biodiversity.map((b) => ({
      sampleId: b.sample_id,
      richness: b.species_richness,
      totalReads: b.total_reads,
      shannonH: b.shannon_index,
      simpsonD: b.simpson_index,
      simpson1MinusD: b.simpson_diversity_1_minus_d,
      pielouJ: b.pielou_evenness,
      topTaxa: b.relative_abundances.slice(0, 12),
    })),
    taxonomicMatchesCount: input.taxa.length,
    sampleTaxonomicAssignments: input.taxa.slice(0, 40).map((t) => ({
      queryId: t.query_sequence_id,
      sampleId: t.sample_id,
      scientificName: t.scientific_name,
      phylum: t.phylum_name,
      rank: t.taxonomic_rank,
      identityPct: t.percentage_identity,
      coveragePct: t.query_coverage,
      eValue: t.e_value,
      confidence: t.confidence,
      source: t.reference_source,
      isSimulated: t.is_simulated,
    })),
  };

  const systemInstruction = [
    'You are the EcoDNA AI Scientific Research Assistant.',
    'You MUST base every factual claim, species name, biodiversity metric, and sample comparison strictly on the verified JSON database context provided below.',
    'NEVER fabricate species identifications, sequence similarity scores, coordinates, or ecological indices that are absent from the database context.',
    'If the user has no matching records yet, clearly explain that no analyzed samples exist yet and guide them to upload a dataset or explore Demonstration Mode.',
    'Always note when appropriate that eDNA sequencing read counts reflect relative read abundance subject to PCR and copy-number bias rather than absolute organism counts.',
    'Keep explanations scientifically rigorous, clear, and concise.',
    '',
    'VERIFIED_DATABASE_CONTEXT:',
    JSON.stringify(compactContext),
  ].join('\n');

  const historyLines = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Researcher' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = historyLines
    ? `Conversation so far:\n${historyLines}\n\nNew question from researcher: ${input.question}`
    : input.question;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  return response.text?.trim() || 'No interpretation was returned by the model.';
}

export async function generateReportInterpretation(input: {
  project: ProjectRecord;
  samples: SampleRecord[];
  biodiversity: BiodiversityResultRecord[];
  taxa: TaxonomicAssignmentRecord[];
}): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) {
    return 'AI executive interpretation skipped because GEMINI_API_KEY is not configured in server secrets. Quantitative metrics and taxonomic assignments in this report remain fully verified from the bioinformatics pipeline.';
  }

  const payload = {
    project: input.project,
    samples: input.samples.map((s) => ({
      name: s.sample_name,
      source: s.sample_type,
      marker: s.marker,
      location: s.collection_location,
    })),
    biodiversity: input.biodiversity,
    taxaSummary: input.taxa.slice(0, 30).map((t) => ({
      scientificName: t.scientific_name,
      phylum: t.phylum_name,
      identity: t.percentage_identity,
      confidence: t.confidence,
      source: t.reference_source,
    })),
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Draft a concise 2-paragraph scientific interpretation and 3 bulleted methodological limitations strictly based on this verified eDNA project dataset:\n${JSON.stringify(payload)}`,
    config: {
      systemInstruction:
        'You are a bioinformatics research analyst writing a formal ecological report summary. Cite only exact figures present in the JSON input. Never invent organisms or scores.',
    },
  });

  return response.text?.trim() || '';
}
