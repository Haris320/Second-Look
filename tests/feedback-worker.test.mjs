import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(path,replacements={})=>{
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements))source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
let state;
const db={from(table){let update;const q={select(){return q;},eq(){return q;},gt(){return q;},order(){return q;},update(v){update=v;return q;},single:async()=>({data:table==='recruitment_jobs'?{opportunity_id:'opp'}:null}),maybeSingle:async()=>({data:state.review}),then(resolve,reject){
 if(update){if(table==='feedback_quality_jobs')Object.assign(state.job,update);return Promise.resolve({data:[{submission_id:'sub'}]}).then(resolve,reject);}
 return Promise.resolve({data:table==='screenshots'?[{position:1,storage_path:'shot'}]:null}).then(resolve,reject);
 }};return q;},
 storage:{from:()=>({createSignedUrls:async()=>({data:[{signedUrl:'https://example.test/synthetic.jpg'}]})})},
 async rpc(name,args){
 if(name==='claim_feedback_quality'){state.job.attempts++;return {data:{...state.job}};}
 if(name==='finish_feedback_quality'){assert.equal(state.remote.status,args.p_outcome);assert.equal(state.job.decision.outcome,args.p_outcome);state.job.state='done';state.review.status=args.p_outcome;state.finalized++;return {};}
 throw Error(name);
 }};
const assessment=()=>({verdict:'approve',confidence:.99,complete:true,grounded:true,actionable:true,respectful:true,reason:'Specific grounded and actionable feedback.',screenshot_positions:[1],issues:[]});
globalThis.__feedbackTest={db,assess:async()=>{state.modelCalls++;if(state.failModel)throw Error('provider outage');return state.assessment;},withTerac:async fn=>fn(async(name)=>{
 state.calls.push(name);
 if(name==='terac_get_submission')return {...state.remote};
 assert.ok(state.job.decision,'decision must be durable before any payment tool');assert.ok(state.job.input_hash);
 state.remote.status=name==='terac_approve_submission'?'approved':'rejected';
 if(state.loseResponse){state.loseResponse=false;throw Error('response lost');}return {...state.remote};
})};
const {processFeedback}=await import(compile('../lib/feedback-quality.ts',{
 './supabase':url('export const db=globalThis.__feedbackTest.db'),
 './terac':url('export const withTerac=globalThis.__feedbackTest.withTerac'),
 './feedback-assessment':url('export const FEEDBACK_MODEL="test";export const assessFeedback=globalThis.__feedbackTest.assess'),
 './feedback-policy':compile('../lib/feedback-policy.ts'),
 './feedback-actions':compile('../lib/feedback-actions.ts'),
 './reviewer-access':url('export const parseReviewAnswers=x=>x'),
 './log':url('export async function logDecision(){}'),
 sharp:url('export default function sharp(){const s={rotate:()=>s,resize:()=>s,flatten:()=>s,jpeg:()=>s,toBuffer:async()=>Buffer.from("synthetic")};return s;}')
}));
function reset(){
 process.env.FEEDBACK_REVIEW_ENABLED='true';
 state={modelCalls:0,calls:[],finalized:0,job:{state:'checking',attempts:0,decision:null,input_hash:null},assessment:assessment(),remote:{id:'sub',opportunity_id:'opp',participant_id:'person',status:'awaiting_review'},review:{id:'r',order_id:'o',terac_participant_id:'person',answers_json:{like:'no',works:'Concrete helpful comment on the profile.',changes:'Concrete changes to the photos and lead choice.',prompts:'Useful specific improvements to the prompts.'},duration_s:120,submitted_at:'2026-10-24',status:'pending'}};
}
const originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;});
globalThis.fetch=async()=>new Response(Buffer.from('synthetic image'));
test('worker persists assessment before approval, then duplicate events are no-ops',async()=>{
 reset();assert.equal((await processFeedback('sub')).state,'done');await processFeedback('sub');
 assert.equal(state.modelCalls,1);assert.equal(state.finalized,1);assert.equal(state.calls.filter(x=>x==='terac_approve_submission').length,1);
});
test('model outage retries once and never rejects or pays',async()=>{
 reset();state.failModel=true;await assert.rejects(processFeedback('sub'));
 assert.equal(state.modelCalls,2);assert.equal(state.job.state,'retry');assert.equal(state.review.status,'pending');assert.ok(!state.calls.some(x=>/approve|reject/.test(x)));
});
test('uncertainty stays pending for attention',async()=>{
 reset();state.assessment.confidence=.5;assert.equal((await processFeedback('sub')).state,'needs_attention');assert.equal(state.review.status,'pending');assert.equal(state.finalized,0);
});
test('lost MCP response reuses saved assessment and reconciles once',async()=>{
 reset();state.loseResponse=true;await assert.rejects(processFeedback('sub'));assert.equal(state.remote.status,'approved');
 assert.equal((await processFeedback('sub')).state,'done');assert.equal(state.modelCalls,1);assert.equal(state.finalized,1);assert.equal(state.calls.filter(x=>x==='terac_approve_submission').length,1);
});
test('conflicting local status is held before contacting the model or Terac',async()=>{
 reset();state.review.status='rejected';assert.equal((await processFeedback('sub')).state,'needs_attention');assert.equal(state.modelCalls,0);assert.equal(state.calls.length,0);
});
