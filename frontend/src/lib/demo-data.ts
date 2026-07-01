import type { Stream } from '@/types/auth';
import type { Paper, Question } from '@/types/paper';
import type { Thread } from '@/types/forum';
import type { LeaderboardEntry } from '@/types/ranking';
import { STREAMS, DEMO_TOPICS, PAST_PAPER_YEARS } from './constants';

// ─── Demo Question Database ─────────────────────────────────────────────────

interface DemoQuestion {
  t: string;
  o: [string, string, string, string];
  a: number;
}

export const DEMO_QDB: Record<string, DemoQuestion[]> = {
  m: [
    { t: '∫sin²x dx=?', o: ['x/2−sin2x/4+C', 'x/2+sin2x/4+C', '−cos²x/2+C', 'sinxcosx+C'], a: 0 },
    { t: 'y=x³−3x, x=2 tangent:', o: ['y=9x−16', 'y=9x−14', 'y=3x−4', 'y=6x'], a: 0 },
    { t: 'P(A∪B)=P(A)+P(B)−?', o: ['P(A∩B)', 'P(A)P(B)', 'P(A|B)', 'P(B|A)'], a: 0 },
    { t: 'lim(x→0) sinx/x=?', o: ['1', '0', '∞', '−1'], a: 0 },
    { t: '∫₀¹ x² dx=?', o: ['1/3', '1/2', '2/3', '1/4'], a: 0 },
    { t: 'sin(A+B)=?', o: ['sinAcosB+cosAsinB', 'sinAcosB−cosAsinB', 'cosAcosB', 'sinAsinB'], a: 0 },
    { t: 'det [[1,2],[3,4]]=?', o: ['−2', '2', '10', '−10'], a: 0 },
    { t: 'log₂8=?', o: ['3', '4', '2', '8'], a: 0 },
    { t: 'AP: a=3,d=4,T₁₀=?', o: ['39', '40', '43', '36'], a: 0 },
    { t: 'dy/dx=y/x→y=?', o: ['cx', 'cx²', 'x+c', 'eˣc'], a: 0 },
  ],
  ph: [
    { t: 'EMF:', o: ['EMF=−dΦ/dt', 'F=ma', 'V=IR', 'P=IV'], a: 0 },
    { t: 'v²=u²+2as→s=?', o: ['(v²−u²)/2a', 'v²+u²', '(v+u)/a', 'v²/2a'], a: 0 },
    { t: 'c=?', o: ['ආලෝකය', 'ශබ්දය', 'තාපය', 'ගුරුත්ව'], a: 0 },
    { t: 'Parallel R1,R2:', o: ['R1R2/(R1+R2)', 'R1+R2', 'R1−R2', 'R1/R2'], a: 0 },
    { t: 'v=fλ→f=?', o: ['v/λ', 'vλ', 'λ/v', '1/vλ'], a: 0 },
    { t: 'Photoelectric E=?', o: ['hf', 'mc²', 'mv²/2', 'qV'], a: 0 },
    { t: 'Newton 3rd:', o: ['Action=Reaction', 'F=ma', 'W=mg', 'P=mv'], a: 0 },
    { t: 'SL household V:', o: ['230V', '110V', '12V', '24V'], a: 0 },
    { t: 'Snell:', o: ['n₁sinθ₁=n₂sinθ₂', 'v=fλ', 'E=hf', 'F=qvB'], a: 0 },
    { t: 'PV/T=?', o: ['constant', 'P/T', 'V/T', 'PT'], a: 0 },
  ],
  ch: [
    { t: 'H₂O molar mass:', o: ['18', '16', '20', '34'], a: 0 },
    { t: 'pH+pOH=?', o: ['14', '7', '1', '0'], a: 0 },
    { t: 'Avogadro:', o: ['6.02×10²³', '3.01×10²³', '6.02×10²²', '1.38×10²³'], a: 0 },
    { t: 'CH₄:', o: ['sp³', 'sp²', 'sp', 'dsp²'], a: 0 },
    { t: 'Acid+Base:', o: ['Salt+H₂O', 'Gas', 'Oxide', 'Element'], a: 0 },
    { t: 'SN2:', o: ['Inversion', 'Retention', 'Racemisation', 'None'], a: 0 },
    { t: 'ethanol:', o: ['ethanol', 'methanol', 'propanol', 'butanol'], a: 0 },
    { t: 'Alkene Br₂:', o: ['Decolourises', 'No change', 'Precipitate', 'Gas'], a: 0 },
    { t: 'Fe₂O₃:', o: ['+3', '+2', '+4', '+1'], a: 0 },
    { t: 'Period 1:', o: ['H,He', 'H only', 'H,Li', 'Li,He'], a: 0 },
  ],
  bi: [
    { t: 'DNA replication:', o: ['DNA Polymerase', 'RNA Polymerase', 'Helicase', 'Ligase'], a: 0 },
    { t: 'ATP:', o: ['Adenosine Triphosphate', 'Adenine', 'Alanine', 'Amino'], a: 0 },
    { t: 'Photosynthesis:', o: ['Chloroplast', 'Mitochondria', 'Ribosome', 'Nucleus'], a: 0 },
    { t: 'Universal donor:', o: ['O−', 'AB+', 'A+', 'B−'], a: 0 },
    { t: 'Osmosis:', o: ['Low→High', 'High→Low', 'Both', 'None'], a: 0 },
    { t: 'Crossing over:', o: ['Prophase I', 'Metaphase I', 'Anaphase I', 'Telophase I'], a: 0 },
    { t: 'Insulin:', o: ['Pancreas', 'Liver', 'Kidney', 'Thyroid'], a: 0 },
    { t: 'Darwin:', o: ['Fittest survives', 'Inheritance', 'Mutation', 'Migration'], a: 0 },
    { t: 'Enzyme:', o: ['Lock & Key', 'Induced Fit', 'Random', 'Competitive'], a: 0 },
    { t: 'Mitosis:', o: ['PMAT', 'PMATI', 'PMTI', 'APMT'], a: 0 },
  ],
  ac: [
    { t: 'Working Capital=?', o: ['CA−CL', 'FA−CL', 'CA+CL', 'FA+CA'], a: 0 },
    { t: 'Depreciation:', o: ['(Cost−Res)/Life', 'Cost/Life', 'Cost×Rate', 'BV'], a: 0 },
    { t: 'Goodwill:', o: ['Intangible', 'Tangible', 'Current', 'Liability'], a: 0 },
    { t: 'Acid Test:', o: ['(CA−Stock)/CL', 'CA/CL', 'NP/Sales', 'Sales/Cap'], a: 0 },
    { t: 'Gross Profit:', o: ['Sales−COGS', 'Sales−Exp', 'Rev−Tax', 'Inc−Int'], a: 0 },
    { t: 'FIFO:', o: ['Higher profit', 'Lower', 'Same', 'N/A'], a: 0 },
    { t: 'Accrued income:', o: ['Current Asset', 'Current Liab', 'Fixed Asset', 'Capital'], a: 0 },
    { t: 'Bank Rec:', o: ['CRB−,BRS+', 'CRB+,BRS−', 'Both same', 'None'], a: 0 },
    { t: 'Capital exp:', o: ['Asset', 'Expense', 'Liability', 'Income'], a: 0 },
    { t: 'Trial debit:', o: ['Assets+Exp', 'Liab+Inc', 'Capital+Rev', 'Purch+Sales'], a: 0 },
  ],
  ec: [
    { t: 'GDP=C+I+G+?', o: ['(X−M)', 'X+M', 'X×M', 'X/M'], a: 0 },
    { t: 'Inflation:', o: ['CPI', 'GDP', 'GNP', 'HDI'], a: 0 },
    { t: 'PED:', o: ['%ΔQ/%ΔP', 'ΔQ/ΔP', 'P/Q', 'Q/P'], a: 0 },
    { t: 'MPC+MPS:', o: ['1', '0', 'GDP', 'Income'], a: 0 },
    { t: 'Multiplier:', o: ['1/(1−MPC)', '1/MPC', 'MPC/(1−MPC)', '1+MPC'], a: 0 },
    { t: 'Perfect Comp:', o: ['Many homogeneous', 'Few', 'One', 'Two'], a: 0 },
    { t: 'Giffen:', o: ['P↑→D↑', 'P↑→D↓', 'Luxury', 'Normal'], a: 0 },
    { t: 'Fiscal:', o: ['Tax & Spend', 'Interest', 'Money supply', 'Exchange'], a: 0 },
    { t: 'Monopoly:', o: ['Price maker', 'Price taker', 'Market', 'World'], a: 0 },
    { t: 'Central Bank:', o: ['Monetary policy', 'Fiscal', 'Trade', 'Labour'], a: 0 },
  ],
};

// Generate fallback QDB for missing subjects
['hi', 'po', 'ge', 'ict', 'et', 'sc', 'bs'].forEach((s) => {
  if (!DEMO_QDB[s]) {
    DEMO_QDB[s] = DEMO_QDB.ec.map((q, i) => ({
      ...q,
      t: `${s.toUpperCase()} Q${i + 1}: ${q.t}`,
    }));
  }
});

// ─── Demo Paper Generator ────────────────────────────────────────────────────

function demoQuestionToQuestion(q: DemoQuestion, index: number): Question {
  return {
    sort_order: index + 1,
    question_text: q.t,
    option_a: q.o[0],
    option_b: q.o[1],
    option_c: q.o[2],
    option_d: q.o[3],
    correct_option: (['A', 'B', 'C', 'D'] as const)[q.a],
  };
}

function makeSRPQuestions(baseQs: DemoQuestion[]): Question[] {
  const expanded = [...baseQs, ...baseQs, ...baseQs].slice(0, 30);
  return expanded.map((q, i) => ({
    ...demoQuestionToQuestion(q, i),
    question_text: `[${i + 1}] ${q.t}`,
  }));
}

export interface DemoPaper extends Paper {
  _qs: Question[];
}

type DemoPapersMap = Record<string, Record<number, Record<string, { daily: DemoPaper[]; srp: DemoPaper[] }>>>;

export function generateDemoPapers(): DemoPapersMap {
  const papers: DemoPapersMap = {};

  Object.keys(STREAMS).forEach((stk) => {
    papers[stk] = {};
    ([12, 13] as const).forEach((g) => {
      papers[stk][g] = {};
      STREAMS[stk as Stream].subjects.forEach((sub) => {
        const qs = DEMO_QDB[sub.id] || DEMO_QDB.ec;
        const demoQs = qs.map(demoQuestionToQuestion);

        const make = (
          id: string,
          type: 'daily' | 'srp',
          name: string,
          qlist: Question[],
          time: number,
          msUp: boolean,
        ): DemoPaper => ({
          id,
          type,
          subject_id: sub.id,
          subject_name: sub.n,
          grade: String(g) as '12' | '13',
          title: name,
          question_count: qlist.length,
          time_seconds: time,
          ms_available: msUp,
          done: false,
          score: null,
          _qs: qlist,
        });

        papers[stk][g][sub.id] = {
          daily: [
            make(`d1_${stk}_${g}_${sub.id}`, 'daily', `${sub.n} · Daily 1 · ${g}ශ්‍රේ`, demoQs, 600, true),
            make(`d2_${stk}_${g}_${sub.id}`, 'daily', `${sub.n} · Daily 2 · ${g}ශ්‍රේ`, [...demoQs].reverse(), 600, false),
            make(`d3_${stk}_${g}_${sub.id}`, 'daily', `${sub.n} · Daily 3 · ${g}ශ්‍රේ`, demoQs.map((q, i) => ({ ...q, question_text: `[v3] ${q.question_text}` })), 600, true),
          ],
          srp: [
            make(`srp1_${stk}_${g}_${sub.id}`, 'srp', `${sub.n} · SRP සතිය 1 · ${g}ශ්‍රේ`, makeSRPQuestions(qs), 1800, true),
            make(`srp2_${stk}_${g}_${sub.id}`, 'srp', `${sub.n} · SRP සතිය 2 · ${g}ශ්‍රේ`, makeSRPQuestions(qs).map((q, i) => ({ ...q, question_text: `[w2/${i + 1}] ${q.question_text}` })), 1800, false),
          ],
        };
      });
    });
  });

  return papers;
}

export function findDemoPaper(papers: DemoPapersMap, pid: string): DemoPaper | null {
  for (const stk of Object.keys(papers)) {
    for (const g of [12, 13]) {
      for (const sid of Object.keys(papers[stk]?.[g] || {})) {
        const b = papers[stk][g][sid];
        for (const t of ['daily', 'srp'] as const) {
          const f = b[t].find((p) => p.id === pid);
          if (f) return f;
        }
      }
    }
  }
  return null;
}

// ─── Demo Rankings ───────────────────────────────────────────────────────────

export const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  { name: 'අමාය සිල්වා', district: 'gampaha', score: 28, time_taken_secs: 872, national_rank: 1 },
  { name: 'හසිත', district: 'colombo', score: 27, time_taken_secs: 1125, national_rank: 2 },
  { name: 'රවීන්', district: 'kandy', score: 27, time_taken_secs: 1147, national_rank: 3 },
  { name: 'නිමාශා', district: 'galle', score: 26, time_taken_secs: 1201, national_rank: 4 },
  { name: 'දිලංක', district: 'matara', score: 25, time_taken_secs: 1335, national_rank: 5 },
  { name: 'තිළිණි', district: 'kegalle', score: 24, time_taken_secs: 1440, national_rank: 6 },
  { name: 'සහන්', district: 'kurunegala', score: 23, time_taken_secs: 1533, national_rank: 7 },
  { name: 'ඉසුරි', district: 'ratnapura', score: 22, time_taken_secs: 1608, national_rank: 8 },
  { name: 'චමත්', district: 'hambantota', score: 21, time_taken_secs: 1682, national_rank: 9 },
  { name: 'බුද්ධික', district: 'kalutara', score: 20, time_taken_secs: 1750, national_rank: 10 },
];

// ─── Demo Forum Threads ─────────────────────────────────────────────────────

export const DEMO_THREADS: (Thread & { body: string; answers: { n: string; role: string; v: boolean; t: string }[] })[] = [
  { id: '1', subject_id: 'm', subject_name: 'ඒකාබද්ධ ගණිතය', title: '∫(sin²x)dx — සීමාව ළඟ', status: 'resolved', author_name: 'අ.සි', view_count: 142, reply_count: 8, created_at: new Date(Date.now() - 7200000).toISOString(), body: '0→π සීමා නිවැරදි නොලැ.', answers: [{ n: 'ගුරු කේ.', role: 'Certified Maths', v: true, t: 'x/2−sin2x/4+C → π/2.' }, { n: 'නෙත්මි', role: 'Student', v: false, t: 'Chain rule!' }] },
  { id: '2', subject_id: 'ph', subject_name: 'භෞතිකය', title: 'EMF max — parallel not perpendicular', status: 'resolved', author_name: 'ක.වි', view_count: 88, reply_count: 5, created_at: new Date(Date.now() - 14400000).toISOString(), body: 'EMF=−dΦ/dt.', answers: [{ n: 'ගුරු රණ.', role: 'Certified Physics', v: true, t: 'EMF ← dΦ/dt. Parallel: rate max.' }] },
  { id: '3', subject_id: 'ch', subject_name: 'රසායනය', title: 'SN2 stereochemistry', status: 'pending', author_name: 'ර.පේ', view_count: 61, reply_count: 2, created_at: new Date(Date.now() - 21600000).toISOString(), body: 'Walden inversion always?', answers: [{ n: 'සහන්', role: 'Student', v: false, t: 'Always inversion.' }] },
  { id: '4', subject_id: 'ac', subject_name: 'ගිණුම්', title: 'Capital vs Revenue A/L', status: 'resolved', author_name: 'ම.ෆ', view_count: 230, reply_count: 12, created_at: new Date(Date.now() - 86400000).toISOString(), body: 'Teacher: long-term asset.', answers: [{ n: 'ගුරු ජය.', role: 'Certified Accounts', v: true, t: 'Capital=long-term. Revenue=daily.' }] },
  { id: '5', subject_id: 'bi', subject_name: 'ජීව', title: 'Meiosis 4 cells', status: 'pending', author_name: 'නා.ද', view_count: 74, reply_count: 3, created_at: new Date(Date.now() - 86400000).toISOString(), body: 'Molecular reason?', answers: [{ n: 'ඉසුරි', role: 'Student', v: false, t: 'Crossing over + 2^23.' }] },
  { id: '6', subject_id: 'ec', subject_name: 'ආර්ථිකය', title: 'GDP misleading — Sri Lanka 2022', status: 'resolved', author_name: 'ච.ජේ', view_count: 195, reply_count: 9, created_at: new Date(Date.now() - 172800000).toISOString(), body: 'Income distribution.', answers: [{ n: 'ගුරු පෙරේ.', role: 'Certified Economics', v: true, t: 'Gini, non-market, 2022 70%+ inflation.' }] },
];

// ─── Demo Past Papers Tree Generator ─────────────────────────────────────────

export function generateDemoPastPapersTree(stream: Stream, filters: { subject?: string; grade?: string; year?: string } = {}) {
  const st = STREAMS[stream];
  const subjects = st.subjects.filter((s) => !filters.subject || s.id === filters.subject);
  const years = filters.year ? [parseInt(filters.year)] : [...PAST_PAPER_YEARS];

  return subjects.map((sub) => ({
    subject_id: sub.id,
    subject_name: sub.n,
    topics: (DEMO_TOPICS[sub.id] || DEMO_TOPICS.ec).map((tn, ti) => ({
      topic_id: ti + 1,
      topic_name: tn,
      years: years.map((yr) => ({
        id: `pp_${sub.id}_${ti}_${yr}`,
        year: yr,
        grade: filters.grade || '13',
        mcqCount: 3,
        essayCount: 2,
        mcqMarks: 6,
        essayMarks: 25,
        markingSchemeAvailable: yr <= 2023,
        msMcqUploaded: yr <= 2022,
        hasEssayPdf: true,
        hasMsEssay: yr <= 2022,
      })),
    })),
  }));
}
