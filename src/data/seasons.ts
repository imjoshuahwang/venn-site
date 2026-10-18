// Past seasons, newest first. Orgs come from the master sheet, split roughly by join date (prototype, dates are loose).
// Logos (files in public/logos) are spread across seasons by hand. Reach is a rounded sum of what each org reported. Photos are files in src/assets/seasons; the prefix names the org.
export type Season = {
  code: string; name: string; tone: 'sky' | 'sage' | 'warm' | 'mix';
  line: string; reach: string; orgs: string[]; photos: string[];
  partners: string[]; clubs: string[];
};

export const orgOf: Record<string, string> = {
  totals: 'TOTALS', scvmun: 'SCVMUN', ai_go_learning: 'AI Go Learning', cfac: 'CFAC', ai_in_stem: 'AI in STEM',
  memory_matters: 'Memory Matters', stemroots: 'STEMRoots', future_speakers_initiative: 'Future Speakers Initiative',
  minorities_in_stem: 'Minorities in STEM', amaze_consortium: 'Amaze Consortium', bytebybyte: 'ByteByByte',
};

export const seasons: Season[] = [
  {
    code: 'F26', name: 'Fall 2026', tone: 'mix', reach: '98K+',
    line: 'Eleven organizations from Atlanta to Dhaka, in STEM, math, research and student tools.',
    orgs: ['Minorities in STEM', 'LevelUp', "She's Beyond", 'Project Q2', 'SolveFire', 'Amaze Consortium', 'Lock In', 'ClassVal', 'Learnly', 'Perpimaths', 'Down To Earth'],
    photos: ['minorities_in_stem_342', 'minorities_in_stem_366', 'amaze_consortium_243', 'minorities_in_stem_344', 'minorities_in_stem_377'],
    partners: ['y-combinator.svg', 'nepc.png'], clubs: ['harvard.svg', 'yale.svg', 'cu-boulder.svg'],
  },
  {
    code: 'S26', name: 'Summer 2026', tone: 'warm', reach: '21K+',
    line: 'Five weeks with Microsoft India. Seven organizations in AI, finance and machine learning.',
    orgs: ['YouthxAI', 'Synthica', 'ByteByByte', 'EmpowerEd', 'Codify Club', 'The BUILD', 'Quanticle'],
    photos: ['bytebybyte_03', 'future_speakers_initiative_303', 'stemroots_433', 'bytebybyte_02', 'future_speakers_initiative_302'],
    partners: ['microsoft.svg'], clubs: ['mit.svg', 'princeton.svg', 'johns-hopkins.svg'],
  },
  {
    code: 'X26', name: 'Spring 2026', tone: 'sage', reach: '124K+',
    line: 'Thirteen organizations in neuroscience, writing, public speaking and STEM.',
    orgs: ['Memory Matters', 'Elqo', 'Future Speakers Initiative', 'Framework4Future', 'STEMRoots', 'Gradlify', 'Noura', 'World Wide Writing', 'Essentialis', 'Pythe', 'PRIME', 'TRI', 'Innovatee Co'],
    photos: ['memory_matters_332', 'future_speakers_initiative_301', 'stemroots_432', 'memory_matters_325', 'future_speakers_initiative_297'],
    partners: ['runway.svg'], clubs: ['columbia.svg', 'emory.svg', 'northwestern.svg'],
  },
  {
    code: 'W25', name: 'Winter 2025', tone: 'sky', reach: '28K+',
    line: 'The first season. UC Berkeley’s philosophy department and four of its student clubs, with sixteen high school organizations.',
    orgs: ['UC Berkeley Philosophy', 'TOTALS', 'SCVMUN', 'AI Go Learning', 'CFAC', 'AI in STEM', 'SYALIS', 'AIM Norcal', 'Meroo AI', 'PHASE Initiative', 'Valencia Empowers', 'NeuroConnect', 'Saintly', 'Accord', 'BuddyMatch', 'Project Gen Planet', 'Genuine'],
    photos: ['scvmun_428', 'totals_438', 'cfac_273', 'ai_go_learning_043', 'ai_in_stem_137'],
    partners: ['uc-berkeley.svg'], clubs: ['stanford.svg', 'caltech.svg', 'usc.svg'],
  },
];
