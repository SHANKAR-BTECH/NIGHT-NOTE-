import {
  splitCompoundActions,
  isIntentActionable,
  attemptFastPath,
  groundCategory,
} from './src/services/customLLMService';

interface PhaseTestCase {
  id: number;
  description: string;
  input: string;
  expectedMinCount: number;
  expectedMaxCount: number;
  isActionable: boolean;
  requiredSubstrings: string[];
  forbiddenSubstrings: string[];
}

const phaseTests: PhaseTestCase[] = [
  {
    id: 1,
    description: 'Buy groceries tomorrow',
    input: 'Buy groceries tomorrow',
    expectedMinCount: 1,
    expectedMaxCount: 1,
    isActionable: true,
    requiredSubstrings: ['groceries'],
    forbiddenSubstrings: []
  },
  {
    id: 2,
    description: 'Study DBMS Chapter 4 and 5 (compound academic object)',
    input: 'Study DBMS Chapter 4 and 5',
    expectedMinCount: 1,
    expectedMaxCount: 1,
    isActionable: true,
    requiredSubstrings: ['DBMS', '4', '5'],
    forbiddenSubstrings: []
  },
  {
    id: 3,
    description: 'Prepare presentation on AI & ML (abbreviation preserve)',
    input: 'Prepare presentation on AI & ML',
    expectedMinCount: 1,
    expectedMaxCount: 1,
    isActionable: true,
    requiredSubstrings: ['presentation', 'AI & ML'],
    forbiddenSubstrings: []
  },
  {
    id: 4,
    description: 'Call dentist tomorrow and submit my assignment tonight',
    input: 'Call dentist tomorrow and submit my assignment tonight',
    expectedMinCount: 2,
    expectedMaxCount: 2,
    isActionable: true,
    requiredSubstrings: ['dentist', 'assignment'],
    forbiddenSubstrings: []
  },
  {
    id: 5,
    description: 'already paid wifi today but rent still pending before friday',
    input: 'already paid wifi today but rent still pending before friday',
    expectedMinCount: 1,
    expectedMaxCount: 1,
    isActionable: true,
    requiredSubstrings: ['rent'],
    forbiddenSubstrings: ['wifi', 'paid']
  },
  {
    id: 6,
    description: 'today was horrible lol anyway need to prep slides for client meeting, check cybersecurity trends and call dentist',
    input: 'today was horrible lol anyway need to prep slides for client meeting, check cybersecurity trends and call dentist',
    expectedMinCount: 3,
    expectedMaxCount: 3,
    isActionable: true,
    requiredSubstrings: ['slides', 'cybersecurity', 'dentist'],
    forbiddenSubstrings: ['horrible', 'lol']
  },
  {
    id: 7,
    description: 'bro tmrw i gotta finish dbms ch 4 n 5 call mom sometime at night buy milk eggs bread and also send that project file to arun',
    input: 'bro tmrw i gotta finish dbms ch 4 n 5 call mom sometime at night buy milk eggs bread and also send that project file to arun',
    expectedMinCount: 4,
    expectedMaxCount: 4,
    isActionable: true,
    requiredSubstrings: ['dbms', 'mom', 'milk', 'arun'],
    forbiddenSubstrings: []
  },
  {
    id: 8,
    description: 'I completed the report earlier but still need to email it to Sarah',
    input: 'I completed the report earlier but still need to email it to Sarah',
    expectedMinCount: 1,
    expectedMaxCount: 1,
    isActionable: true,
    requiredSubstrings: ['Sarah'],
    forbiddenSubstrings: ['completed the report']
  },
  {
    id: 9,
    description: 'Prepare the quarterly board presentation and review all security findings before the meeting',
    input: 'Prepare the quarterly board presentation and review all security findings before the meeting',
    expectedMinCount: 1,
    expectedMaxCount: 2,
    isActionable: true,
    requiredSubstrings: ['presentation', 'security findings'],
    forbiddenSubstrings: []
  },
  {
    id: 10,
    description: 'Buy milk eggs bread vegetables and pick up the package from the post office before 6 PM',
    input: 'Buy milk eggs bread vegetables and pick up the package from the post office before 6 PM',
    expectedMinCount: 2,
    expectedMaxCount: 2,
    isActionable: true,
    requiredSubstrings: ['milk', 'package'],
    forbiddenSubstrings: []
  },
  {
    id: 11,
    description: 'PHASE 12 — 10-TASK STRESS TEST',
    input: 'Tomorrow I need to buy groceries, call mom, finish DBMS Chapter 4 and 5, send the project file to Arun, pay the electricity bill, prepare slides for the client meeting, research cybersecurity trends, book the dentist appointment, go to the gym at 7 PM, and submit my assignment before midnight.',
    expectedMinCount: 10,
    expectedMaxCount: 10,
    isActionable: true,
    requiredSubstrings: [
      'groceries',
      'mom',
      'DBMS Chapter 4 and 5',
      'Arun',
      'electricity bill',
      'client meeting',
      'cybersecurity',
      'dentist',
      'gym',
      'assignment'
    ],
    forbiddenSubstrings: []
  }
];

console.log('=== RUNNING PHASE 11 & 12 FORENSIC INTEGRITY AUDIT ===\n');

let passedCount = 0;

for (const t of phaseTests) {
  console.log(`[TEST ${t.id}]: ${t.description}`);
  console.log(`INPUT: "${t.input}"`);

  const actionable = isIntentActionable(t.input);
  if (!actionable && t.isActionable) {
    console.log(`❌ FAIL: Actionable input was classified as non-actionable\n`);
    continue;
  }

  const clauses = splitCompoundActions(t.input);
  const activeClauses: string[] = [];

  for (const c of clauses) {
    if (isIntentActionable(c)) {
      activeClauses.push(c);
    }
  }

  const tasks: { text: string; category: string }[] = [];
  for (const c of activeClauses) {
    const fp = attemptFastPath(c);
    if (fp) {
      tasks.push({ text: fp.text, category: fp.category });
    } else {
      tasks.push({ text: c, category: groundCategory(c) });
    }
  }

  console.log(`EXTRACTED TASKS (${tasks.length}):`);
  tasks.forEach((tsk, i) => console.log(`  ${i + 1}. [${tsk.category}] ${tsk.text}`));

  const countOk = tasks.length >= t.expectedMinCount && tasks.length <= t.expectedMaxCount;
  const allTexts = tasks.map(x => x.text).join(' ');

  let requiredOk = true;
  for (const req of t.requiredSubstrings) {
    if (!allTexts.toLowerCase().includes(req.toLowerCase())) {
      console.log(`❌ Missing required entity: "${req}"`);
      requiredOk = false;
    }
  }

  let forbiddenOk = true;
  for (const forb of t.forbiddenSubstrings) {
    if (allTexts.toLowerCase().includes(forb.toLowerCase())) {
      console.log(`❌ Contains forbidden past/chatter entity: "${forb}"`);
      forbiddenOk = false;
    }
  }

  if (countOk && requiredOk && forbiddenOk) {
    console.log(`✅ PASS\n`);
    passedCount++;
  } else {
    console.log(`❌ FAIL (Count match: ${countOk}, Entities match: ${requiredOk}, Filter match: ${forbiddenOk})\n`);
  }
}

console.log(`\nPHASE 11 & 12 SCORE: ${passedCount} / ${phaseTests.length} (${Math.round(passedCount / phaseTests.length * 100)}%)\n`);
