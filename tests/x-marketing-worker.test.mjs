import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url = s => 'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile = (path,replacements={}) => {
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements)) source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
let state;
const db={rpc:async()=>{state.claims++;return {data:state.claimed?null:{id:'slot'}};},from(){
 let update;
 const q={ select(){return q;},eq(){return q;},not(){return q;},order(){return q;},limit(){return q;},update(v){update=v;return q;},single:async()=>{state.row={...state.row,...update};return {data:{id:'slot'}};},then(resolve){resolve({data:[]});} };
 return q;
}};
class Anthropic {
 messages={create:async()=>({stop_reason:'end_turn',content:[{type:'text',text:'Choose a clear lead photo. Give someone an easy conversation starter in your prompts.'}]}),parse:async()=>({stop_reason:'end_turn',parsed_output:{approved:!state.reject,reason:'Grounded'}})};
}
globalThis.__marketingTest={db,Anthropic,xRequest:async(method)=>{
 if(method==='GET')return {data:{id:state.wrongAccount?'wrong':'123',username:'secondlook_date'}};
 assert.equal(state.row.state,'posting');state.sent++;
 if(state.timeout)throw Error('timeout');
 return {data:{id:'456'}};
}};
const {runMarketingPost}=await import(compile('../lib/x-marketing.ts',{
 './supabase':url('export const db=globalThis.__marketingTest.db;'),
 './x-client':url('export const xRequest=globalThis.__marketingTest.xRequest;'),
 '@anthropic-ai/sdk':url('export default globalThis.__marketingTest.Anthropic;'),
 '@anthropic-ai/sdk/helpers/json-schema':url('export const jsonSchemaOutputFormat=s=>s;'),
 './tiers':compile('../lib/tiers.ts'),
 './marketing-policy':compile('../lib/marketing-policy.ts'),
}));
function reset(){state={claims:0,sent:0,row:{}};process.env.X_MARKETING_ENABLED='true';process.env.X_MARKETING_PUBLISH_ENABLED='true';process.env.VERCEL_ENV='production';process.env.X_ACCOUNT_ID='123';}
test('publishing disabled produces a draft and never calls X create', async()=>{reset();process.env.X_MARKETING_PUBLISH_ENABLED='false';assert.equal((await runMarketingPost()).draft,true);assert.equal(state.sent,0);assert.equal(state.row.state,'draft');});
test('disabled flag and preview deployments do no work',async()=>{reset();process.env.X_MARKETING_ENABLED='false';assert.equal((await runMarketingPost()).disabled,true);process.env.X_MARKETING_ENABLED='true';process.env.VERCEL_ENV='preview';assert.equal((await runMarketingPost()).disabled,true);assert.equal(state.claims,0);assert.equal(state.sent,0);});
test('wrong account and rejected copy cannot post',async()=>{reset();state.wrongAccount=true;await assert.rejects(runMarketingPost(),/account_mismatch/);assert.equal(state.claims,0);reset();state.reject=true;assert.equal((await runMarketingPost()).failed,true);assert.equal(state.sent,0);});
test('used daily slot cannot create a second post',async()=>{reset();state.claimed=true;assert.equal((await runMarketingPost()).skipped,true);assert.equal(state.sent,0);});
test('successful create persists X ID; a timeout is unknown without retries',async()=>{reset();assert.equal((await runMarketingPost()).posted,true);assert.equal(state.row.post_id,'456');assert.equal(state.sent,1);reset();state.timeout=true;assert.equal((await runMarketingPost()).needsAttention,true);assert.equal(state.row.state,'unknown');assert.equal(state.sent,1);});
