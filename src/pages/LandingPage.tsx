import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  Database,
  Dna,
  FileText,
  FlaskConical,
  MapPin,
  Menu,
  Microscope,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';
import { useAuth } from '../context/AuthContext';

const contactSchema = z.object({
  name: z.string().min(2, 'Please enter your full name'),
  email: z.string().email('Please enter a valid email address'),
  organization: z.string().optional(),
  message: z.string().min(10, 'Please describe your inquiry (at least 10 characters)'),
});

type ContactForm = z.infer<typeof contactSchema>;

export default function LandingPage() {
  const { firebaseUser } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
  });

  const onContactSubmit = async (_data: ContactForm) => {
    await new Promise((r) => setTimeout(r, 300));
    setContactSubmitted(true);
    reset();
  };

  const features = [
    {
      num: '01',
      title: 'DNA Sequence Analysis',
      description:
        'Ingest FASTA, FASTQ, CSV, TSV, and JSON files with Phred+33 quality scoring, ambiguous base detection, length distribution telemetry, and lossless malformed-record reporting.',
      icon: Dna,
    },
    {
      num: '02',
      title: 'AI-Assisted Taxonomic Identification',
      description:
        'Align sequences against NCBI BLAST, NCBI Taxonomy, BOLD Systems, and curated marker libraries with Lowest Common Ancestor confidence scoring. Gemini interprets verified matches without inventing hits.',
      icon: Microscope,
    },
    {
      num: '03',
      title: 'Biodiversity Assessment',
      description:
        'Compute Species Richness, Shannon Diversity (H\'), Simpson Dominance (D & 1-D), Pielou\'s Evenness (J), Hurlbert rarefaction curves, Bray-Curtis dissimilarity, and Jaccard similarity.',
      icon: BarChart3,
    },
    {
      num: '04',
      title: 'Species Explorer',
      description:
        'Query detected organisms across full Domain-to-Species lineages with taxonomic rank filters, confidence levels, read relative abundance, and reference accession traceability.',
      icon: Search,
    },
    {
      num: '05',
      title: 'Geographic Biodiversity Mapping',
      description:
        'Plot field sampling coordinates on an interactive watershed map to inspect spatial species richness, Shannon diversity gradients, and organism distribution.',
      icon: MapPin,
    },
    {
      num: '06',
      title: 'Scientific Report Generation',
      description:
        'Export publication-ready PDF, CSV, and JSON biodiversity dossiers containing sample metadata, processing parameters, taxonomic tables, and methodological limitations.',
      icon: FileText,
    },
  ];

  const workflowSteps = [
    {
      step: '01. Field Sampling & Upload',
      detail: 'Collect aquatic, soil, or sediment samples across 16S, COI, 12S, 18S, ITS, or rbcL markers and archive raw sequences.',
    },
    {
      step: '02. Preprocessing & Quality Control',
      detail: 'Validate IUPAC bases, filter Phred scores, detect ambiguous nucleotides, deduplicate reads, and export cleaned FASTA.',
    },
    {
      step: '03. Reference Alignment & LCA',
      detail: 'Execute asynchronous alignments against NCBI BLAST, BOLD Systems, or curated marker databases with E-value and coverage scoring.',
    },
    {
      step: '04. Ecological Indices & AI Synthesis',
      detail: 'Calculate alpha and beta diversity matrices, map sample stations, and synthesize findings with the grounded Gemini Research Assistant.',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <Link to="/" className="shrink-0">
            <EcoDnaLogo />
          </Link>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#home" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              Home
            </a>
            <a href="#about" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              About
            </a>
            <a href="#features" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#workflow" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              Scientific Workflow
            </a>
            <a href="#contact" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
              Contact
            </a>
            {!firebaseUser && (
              <Link to="/login" className="hover:text-emerald-700 transition-colors whitespace-nowrap shrink-0">
                Login
              </Link>
            )}
          </nav>

          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <Link
              to={firebaseUser ? '/dashboard' : '/register'}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {firebaseUser ? 'Open Dashboard' : 'Register'}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm font-medium text-slate-700">
              <a href="#home" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">Home</a>
              <a href="#about" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">About</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">Features</a>
              <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">Workflow</a>
              <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">Contact</a>
              <Link to="/demo" onClick={() => setMobileMenuOpen(false)} className="py-2 px-2 rounded hover:bg-slate-50">Demo Sandbox</Link>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
              {!firebaseUser ? (
                <>
                  <Link to="/login" className="flex-1 text-center py-2.5 text-sm font-medium border border-slate-300 rounded-lg text-slate-800">
                    Login
                  </Link>
                  <Link to="/register" className="flex-1 text-center py-2.5 text-sm font-semibold bg-emerald-700 text-white rounded-lg">
                    Register
                  </Link>
                </>
              ) : (
                <Link to="/dashboard" className="w-full text-center py-2.5 text-sm font-semibold bg-emerald-700 text-white rounded-lg">
                  Open Dashboard
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="home" className="bg-[#061f1a] text-white border-b border-emerald-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-mono tracking-wide text-cyan-300">
                Explore · Identify · Preserve · Problem Statement ID 25042
              </div>
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.1] max-w-2xl"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', textWrap: 'balance' }}
              >
                Discover the Hidden Biodiversity in Every DNA Sequence.
              </h1>
              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                An intelligent environmental DNA platform that transforms genetic data into taxonomic insights and biodiversity intelligence.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={firebaseUser ? '/dashboard' : '/register'}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#061f1a] bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white border border-emerald-700/80 hover:bg-emerald-900/50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Explore Features
                </a>
                <Link
                  to="/demo"
                  className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  Launch Demonstration Mode
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-emerald-800/70 bg-[#0b1622] relative">
                <img
                  src="/src/assets/images/hero_edna_lab_1795608957232.jpg"
                  alt="Environmental genomics laboratory overlooking an emerald river valley with eDNA water filtration samples"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#061f1a]/90 via-[#061f1a]/40 to-transparent p-5">
                  <p className="text-xs font-mono text-cyan-200">
                    Multi-marker eDNA Telemetry · COI · 16S · 12S · 18S · ITS · rbcL
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Grounded Quantitative Architecture Row */}
          <div className="mt-12 pt-8 border-t border-emerald-900/80 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-slate-400">Supported Sequence Formats</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">FASTA · FASTQ · CSV · TSV · JSON</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Reference Alignment Engines</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">NCBI BLAST · BOLD · Local DB</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Biodiversity Indices</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">Shannon · Simpson · Pielou · Beta</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Identity &amp; Data Isolation</div>
              <div className="mt-1 text-lg font-mono font-semibold text-white">Firebase Auth · PostgreSQL RLS</div>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities / Feature Cards */}
      <section id="features" className="py-16 lg:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl space-y-3">
          <div className="text-xs font-mono text-emerald-700">Platform Capabilities</div>
          <h2 className="text-3xl font-display font-bold tracking-tight text-slate-900">
            End-to-End Environmental DNA Intelligence
          </h2>
          <p className="text-slate-600 leading-relaxed">
            Built for environmental scientists, conservation biologists, and academic laboratories requiring transparent sequence validation and reproducible ecological math.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.num}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4 hover:border-emerald-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-emerald-700">{feat.num}</span>
                    <Icon className="w-5 h-5 text-cyan-700" />
                  </div>
                  <h3 className="text-lg font-display font-semibold text-slate-900">{feat.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{feat.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scientific Workflow Section */}
      <section id="workflow" className="py-16 lg:py-24 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-stretch">
            <div className="lg:col-span-5">
              <div className="h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                <img
                  src="/src/assets/images/workflow_field_sampling_1795608957060.jpg"
                  alt="Conservation biologist filtering stream water for environmental DNA sampling"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <div>
                <div className="text-xs font-mono text-emerald-700">Scientific Workflow</div>
                <h2 className="mt-2 text-3xl font-display font-bold tracking-tight text-slate-900">
                  From Field Filtration to Verified Taxonomic Dossiers
                </h2>
              </div>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {workflowSteps.map((w) => (
                  <div key={w.step} className="py-4">
                    <h3 className="text-base font-semibold text-slate-900">{w.step}</h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">{w.detail}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to="/demo"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                >
                  <FlaskConical className="w-4 h-4" />
                  Test Pipeline in Demo Mode
                </Link>
                <span className="text-xs text-slate-500">
                  Isolated sandbox · Simulated matches clearly marked
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About & Why eDNA Matters */}
      <section id="about" className="py-16 lg:py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div>
              <div className="text-xs font-mono text-emerald-700">About Project 25042 · Why eDNA Matters</div>
              <h2 className="mt-2 text-3xl font-display font-bold tracking-tight text-slate-900">
                Non-Invasive Ecological Monitoring at Molecular Resolution
              </h2>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Every organism sheds trace genetic material into water, soil, and sediment. Environmental DNA (eDNA) metabarcoding detects elusive native species, early biological invasions, and ecosystem shifts from a single filtered sample without disturbing fragile habitats.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="w-4 h-4 text-emerald-700" />
                  Evidence-First Identification
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Alignments use NCBI BLAST, BOLD Systems, and curated reference libraries—never AI-fabricated species names.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-cyan-700" />
                  Strict Ownership Isolation
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Every project, sample, and sequence dataset is verified against your Firebase identity token on the server.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-200 bg-[#0b1622]">
              <img
                src="/src/assets/images/biodiversity_microbiome_1795608956472.jpg"
                alt="Scientific illustration of environmental DNA strands with freshwater diatoms, copepods, fish scales, and spores"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-16 lg:py-20 bg-white border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-2 mb-10">
            <div className="text-xs font-mono text-emerald-700">Research Collaboration &amp; Support</div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-slate-900">
              Contact the EcoDNA AI Team
            </h2>
            <p className="text-sm text-slate-600">
              Questions regarding institutional onboarding, reference marker support, or Problem Statement 25042 documentation.
            </p>
          </div>

          {contactSubmitted ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-700 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900">Inquiry Received</h3>
              <p className="text-sm text-slate-600">
                Thank you for reaching out. Our research engineering team will respond to your email shortly.
              </p>
              <button
                type="button"
                onClick={() => setContactSubmitted(false)}
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onContactSubmit)} className="bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    {...register('name')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="Dr. Maya Lin"
                  />
                  {errors.name && <p className="mt-1 text-xs text-rose-600">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    {...register('email')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="researcher@university.edu"
                  />
                  {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Institution / Organization (Optional)</label>
                <input
                  type="text"
                  {...register('organization')}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="Institute of Marine & Freshwater Biology"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Message</label>
                <textarea
                  rows={4}
                  {...register('message')}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="Share details about your eDNA study, sequencing marker, or dataset requirements..."
                />
                {errors.message && <p className="mt-1 text-xs text-rose-600">{errors.message.message}</p>}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Quiet Footer (zero admin links) */}
      <footer className="bg-[#061f1a] text-slate-300 border-t border-emerald-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <EcoDnaLogo dark />
            <p className="text-xs text-slate-400">
              Explore. Identify. Preserve. · Project ID: 25042 — Identifying Taxonomy and Assessing Biodiversity from eDNA Datasets
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-300">
            <a href="#about" className="hover:text-white">About</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#workflow" className="hover:text-white">Scientific Workflow</a>
            <Link to="/demo" className="hover:text-white">Demo Mode</Link>
            <Link to="/login" className="hover:text-white">Sign In</Link>
            <Link to="/register" className="hover:text-white">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
