import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function moduleUrl(path, replacements={}) {
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8');
 for(const [from,to] of Object.entries(replacements)) source=source.replace(from,to);
 return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
}
const quality=moduleUrl('../lib/profile-quality.ts');
const tiers=moduleUrl('../lib/tiers.ts');
const {assertRecruitable,opportunityInput,assertLaunchable,assertOpportunityMatches}=await import(moduleUrl('../lib/recruitment-policy.ts',{'"./profile-quality"':JSON.stringify(quality),'"./tiers"':JSON.stringify(tiers)}));
const good=()=>({status:'paid',audience:'women_21_35_us',review_target:3,whop_payment_id:'pay_1',paid_at:new Date().toISOString(),amount_cents:4000,first_read_json:{is_dating_profile:true,explicit_content:false,appears_under_18:false,screenshot_checks:[{position:1,verdict:'profile',reason:'Profile UI'}]}});
test('only paid, fully screened, supported three-review orders qualify',()=>assert.doesNotThrow(()=>assertRecruitable(good(),[1])));
for(const status of ['pending_payment','screening','held','needs_reupload','done']) test(`${status} never recruits`,()=>assert.throws(()=>assertRecruitable({...good(),status},[1])));
test('missing payment, wrong amount, unsupported audience and target fail closed',()=>{
 for(const patch of [{whop_payment_id:null},{paid_at:null},{amount_cents:1},{audience:'men_18_31_us'},{review_target:4}]) assert.throws(()=>assertRecruitable({...good(),...patch},[1]));
});
test('stale/missing/mixed screenshot evidence cannot recruit',()=>{
 assert.throws(()=>assertRecruitable(good(),[1,2]));assert.throws(()=>assertRecruitable(good(),[]));
 const o=good();o.first_read_json.screenshot_checks[0].verdict='unrelated';assert.throws(()=>assertRecruitable(o,[1]));
});
test('both audiences map to verified Terac gender, age and country filters',()=>{
 for(const [audience,gender] of [['women_21_35_us','female'],['men_21_35_us','male']]) {
 const p=opportunityInput('order',audience,'project','https://example.test','token');
 assert.equal(p.num_participants,3);assert.deepEqual(p.filters,[{'integer--age':{$gte:21,$lte:35}},{'multi_select--country':{$in:['US']}},{'multi_select--gender':{$in:[gender]}}]);
 assert.equal(p.tasks[0].review_type,'manual_review');assert.equal(new URL(p.tasks[0].task_url).pathname,'/review');assert.equal(p.tasks[0].duration_minutes,5);
 }
});
test('missing quote, over-budget or credit-funded launch is blocked',()=>{
 const good={id:'opp',status:'draft',num_participants:3,pricing:{total_cost_cents:900,currency:'usd'},funding:{affordable:true,draws_on_credit:false,balance_cents:10000}};
 assert.doesNotThrow(()=>assertLaunchable(good,1500));
 for(const o of [{...good,pricing:null},{...good,status:'active'},{...good,num_participants:4},{...good,funding:{...good.funding,draws_on_credit:true}},{...good,funding:{...good.funding,balance_cents:10}}]) assert.throws(()=>assertLaunchable(o,1500));
 assert.throws(()=>assertLaunchable(good,800));assert.throws(()=>assertLaunchable(good,NaN));
});

test('persisted draft must preserve targeting and task settings',()=>{
 const input=opportunityInput('order','women_21_35_us','project','https://example.test','token');
 assert.doesNotThrow(()=>assertOpportunityMatches(input,input));
 const normalized=structuredClone(input);normalized.filters[1]={'multi_select--country':{$eq:'US'}};
 assert.doesNotThrow(()=>assertOpportunityMatches(normalized,input));
 for(const mutate of [o=>{o.filters[0]['integer--age'].$gte=18;},o=>{o.filters.pop();},o=>{o.tasks[0].review_type='auto_approve';},o=>{o.tasks[0].task_url='https://elsewhere.test';},o=>{o.num_participants=4;}]) {
  const draft=structuredClone(input);mutate(draft);assert.throws(()=>assertOpportunityMatches(draft,input));
 }
});
test('one-review and legacy three-review payments are eligible without changing counts',()=>{
 assert.doesNotThrow(()=>assertRecruitable({...good(),amount_cents:1500,review_target:1},[1]));
 assert.doesNotThrow(()=>assertRecruitable({...good(),amount_cents:1500,review_target:3},[1]));
 assert.throws(()=>assertRecruitable({...good(),amount_cents:4000,review_target:1},[1]));
 const p=opportunityInput('order','men_21_35_us','project','https://example.test','token',1);
 assert.equal(p.num_participants,1);assert.doesNotThrow(()=>assertOpportunityMatches(p,p));
});
