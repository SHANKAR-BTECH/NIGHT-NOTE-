import {
  splitCompoundActions,
  isIntentActionable,
  attemptFastPath,
  groundCategory,
  generateLocalTasks
} from './src/services/customLLMService';

interface TestCase {
  id: number;
  category: string;
  input: string;
  expectedTasks: string[];
  expectedCount: number;
  isActionable: boolean;
}

const testCases: TestCase[] = [
  { id: 1, category: '1 task', input: 'Buy groceries tomorrow', expectedTasks: ['Buy groceries'], expectedCount: 1, isActionable: true },
  { id: 2, category: '1 task (meaning preservation)', input: 'See cybersecurity trends', expectedTasks: ['See cybersecurity trends'], expectedCount: 1, isActionable: true },
  { id: 3, category: '1 task (deadline)', input: 'Pay electricity bill Friday', expectedTasks: ['Pay electricity bill'], expectedCount: 1, isActionable: true },
  { id: 4, category: '1 task (time)', input: 'Go to the gym at seven PM', expectedTasks: ['Go to the gym'], expectedCount: 1, isActionable: true },
  { id: 5, category: '1 task (academic compound noun)', input: 'Study DBMS Chapter 4 and 5', expectedTasks: ['Study DBMS Chapter 4 and 5'], expectedCount: 1, isActionable: true },
  { id: 6, category: '1 task (compound noun)', input: 'Buy bread and butter', expectedTasks: ['Buy bread and butter'], expectedCount: 1, isActionable: true },
  { id: 7, category: '1 task (work & abbreviation)', input: 'Prepare presentation on AI & ML', expectedTasks: ['Prepare presentation on AI & ML'], expectedCount: 1, isActionable: true },
  { id: 8, category: '1 task (relationship)', input: 'Call mom tonight', expectedTasks: ['Call mom'], expectedCount: 1, isActionable: true },
  { id: 9, category: '1 task (health)', input: 'Renew doctor prescription tomorrow', expectedTasks: ['Renew doctor prescription tomorrow'], expectedCount: 1, isActionable: true },
  { id: 10, category: '1 task (errand + deadline)', input: 'Drop off package at post office by 2pm', expectedTasks: ['Drop off package at post office by 2pm'], expectedCount: 1, isActionable: true },
  { id: 11, category: '2-3 tasks (conjunction)', input: 'Buy groceries tomorrow and call mom tonight', expectedTasks: ['Buy groceries tomorrow', 'call mom tonight'], expectedCount: 2, isActionable: true },
  { id: 12, category: '2-3 tasks (list)', input: 'Study DBMS tomorrow, pay rent Friday, also hit the gym', expectedTasks: ['Study DBMS tomorrow', 'pay rent Friday', 'hit the gym'], expectedCount: 3, isActionable: true },
  { id: 13, category: '2-3 tasks (work + time)', input: 'Finish client proposal by 3pm and review PRs', expectedTasks: ['Finish client proposal by 3pm', 'review PRs'], expectedCount: 2, isActionable: true },
  {
    id: 14, category: '5 tasks (multiline)',
    input: '1. Prepare slides for morning standup\n2. Buy milk and eggs\n3. Call dentist for appointment\n4. Submit DBMS assignment\n5. 30 minute cardio session',
    expectedTasks: ['Prepare slides for morning standup', 'Buy milk and eggs', 'Call dentist for appointment', 'Submit DBMS assignment', '30 minute cardio session'],
    expectedCount: 5,
    isActionable: true
  },
  {
    id: 15, category: '5 tasks (inline)',
    input: 'Review budget report, email John about contract, buy groceries, fix login bug, and call mom',
    expectedTasks: ['Review budget report', 'email John about contract', 'buy groceries', 'fix login bug', 'call mom'],
    expectedCount: 5,
    isActionable: true
  },
  {
    id: 16, category: '10 tasks dump',
    input: '1. Review sprint backlog\n2. Email marketing team\n3. Buy groceries\n4. Pay wifi bill\n5. Call mom\n6. Study DBMS indexing\n7. 45 min workout\n8. Clean desk\n9. Renew car insurance\n10. Prepare dinner',
    expectedTasks: ['Review sprint backlog', 'Email marketing team', 'Buy groceries', 'Pay wifi bill', 'Call mom', 'Study DBMS indexing', '45 min workout', 'Clean desk', 'Renew car insurance', 'Prepare dinner'],
    expectedCount: 10,
    isActionable: true
  },
  { id: 17, category: 'slang', input: 'gonna hit the gym later and gotta prep for dbms quiz', expectedTasks: ['gonna hit the gym later', 'gotta prep for dbms quiz'], expectedCount: 2, isActionable: true },
  { id: 18, category: 'typos', input: 'stdy dbms tmrw and cll mom tonite', expectedTasks: ['stdy dbms tmrw', 'cll mom tonite'], expectedCount: 2, isActionable: true },
  { id: 19, category: 'shorthand', input: 'r&d report due fri, send pr to team, gym @ 7', expectedTasks: ['R&D report due fri', 'send pr to team', 'gym @ 7'], expectedCount: 3, isActionable: true },
  { id: 20, category: 'completed + future', input: 'Already submitted dbms assignment, need to study for operating systems exam tomorrow', expectedTasks: ['study for operating systems exam tomorrow'], expectedCount: 1, isActionable: true },
  { id: 21, category: 'completed past action (only)', input: 'Paid the electricity bill yesterday and finished my homework', expectedTasks: [], expectedCount: 0, isActionable: false },
  { id: 22, category: 'conversational (exhaustion)', input: 'Today was so exhausting, boy what a crazy day', expectedTasks: [], expectedCount: 0, isActionable: false },
  { id: 23, category: 'conversational (feeling)', input: 'I feel so tired tonight, just chilling before sleep', expectedTasks: [], expectedCount: 0, isActionable: false },
  { id: 24, category: 'conversational + actionable', input: 'Man work was brutal today, but remember to pay the electricity bill tomorrow', expectedTasks: ['pay the electricity bill tomorrow'], expectedCount: 1, isActionable: true },
  { id: 25, category: 'category ambiguity (work call)', input: 'Call client regarding contract proposal', expectedTasks: ['Call client regarding contract proposal'], expectedCount: 1, isActionable: true },
  { id: 26, category: 'category ambiguity (work study)', input: 'Study market trends for quarterly strategy meeting', expectedTasks: ['Study market trends for quarterly strategy meeting'], expectedCount: 1, isActionable: true },
  { id: 27, category: 'relationship + names', input: 'Resolve disagreement with Sarah about project deadlines', expectedTasks: ['Resolve disagreement with Sarah about project deadlines'], expectedCount: 1, isActionable: true },
  { id: 28, category: 'errands + abbreviations', input: 'Buy 2 gallons of milk, eggs, and bread from Walmart', expectedTasks: ['Buy 2 gallons of milk, eggs, and bread from Walmart'], expectedCount: 1, isActionable: true },
  { id: 29, category: 'health & fitness', input: 'Schedule annual physical checkup with Dr. Smith and do yoga tomorrow morning', expectedTasks: ['Schedule annual physical checkup with Dr. Smith', 'do yoga tomorrow morning'], expectedCount: 2, isActionable: true },
  { id: 30, category: 'academic + multiple deadlines', input: 'Submit machine learning project by midnight and prepare for algorithms midterm on Thursday', expectedTasks: ['Submit machine learning project by midnight', 'prepare for algorithms midterm on Thursday'], expectedCount: 2, isActionable: true },
];

console.log('=== RUNNING FINAL CODEBASE ACCURACY REGRESSION (30 CASES) ===\n');

let totalPassed = 0;

for (const tc of testCases) {
  console.log(`-------------------------------------------------------`);
  console.log(`TEST ${tc.id}: [${tc.category}]`);
  console.log(`ORIGINAL_INPUT: "${tc.input.replace(/\n/g, '\\n')}"`);

  const isActionable = isIntentActionable(tc.input);
  console.log(`IS_ACTIONABLE: ${isActionable}`);

  if (!isActionable) {
    if (!tc.isActionable) {
      console.log(`RESULT: PASSED (Non-actionable filtered cleanly, 0 tasks generated)`);
      totalPassed++;
    } else {
      console.log(`RESULT: FAILED (Actionable input was filtered out!)`);
    }
    console.log(`-------------------------------------------------------\n`);
    continue;
  }

  const splitClauses = splitCompoundActions(tc.input);
  console.log(`SPLIT_CLAUSES (${splitClauses.length}):`, JSON.stringify(splitClauses));

  const fastPathResults: any[] = [];
  const clausesSentToLLM: string[] = [];

  for (const c of splitClauses) {
    if (!isIntentActionable(c)) {
      console.log(`  (Filtered past/non-actionable clause: "${c}")`);
      continue;
    }
    const fp = attemptFastPath(c);
    if (fp) {
      fastPathResults.push(fp);
    } else {
      clausesSentToLLM.push(c);
    }
  }

  console.log(`FAST_PATH_RESULTS (${fastPathResults.length}):`, JSON.stringify(fastPathResults.map(f => ({ text: f.text, cat: f.category, dl: f.deadline }))));
  console.log(`CLAUSES_SENT_TO_LLM (${clausesSentToLLM.length}):`, JSON.stringify(clausesSentToLLM));

  const finalTasks: { text: string, cat: string }[] = [];
  fastPathResults.forEach(f => finalTasks.push({ text: f.text, cat: f.category }));
  clausesSentToLLM.forEach(c => finalTasks.push({ text: c, cat: groundCategory(c) }));

  console.log(`FINAL_SYNTHESIZED_TASKS (${finalTasks.length}):`, JSON.stringify(finalTasks));
  
  const countMatches = finalTasks.length === tc.expectedCount;
  if (countMatches) {
    console.log(`RESULT: PASSED (Expected count ${tc.expectedCount}, got ${finalTasks.length})`);
    totalPassed++;
  } else {
    console.log(`RESULT: FAILED (Expected count ${tc.expectedCount}, got ${finalTasks.length})`);
  }
  console.log(`-------------------------------------------------------\n`);
}

console.log(`\nOVERALL ACCURACY: ${totalPassed} / ${testCases.length} (${Math.round(totalPassed / testCases.length * 100)}%)\n`);
