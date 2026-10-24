import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('feedback claims, fencing, durable decisions and approved counts are atomic',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table orders(id uuid primary key,reviews_done int default 0);
 create table reviews(terac_submission_id text unique,order_id uuid,status text default 'pending',terac_status text,terac_status_at timestamptz);
 create table decisions(order_id uuid,step text,choice text,reason text);
 insert into orders(id) values('00000000-0000-4000-8000-000000000001');
 insert into reviews(terac_submission_id,order_id) values('sub1','00000000-0000-4000-8000-000000000001'),('sub2','00000000-0000-4000-8000-000000000001'),('sub3','00000000-0000-4000-8000-000000000001');`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/2026-10-24-feedback-quality.sql',import.meta.url),'utf8'));
 const t1='00000000-0000-4000-8000-000000000011',t2='00000000-0000-4000-8000-000000000012';
 const claim=async(s,t)=>(await db.query('select claim_feedback_quality($1,$2) j',[s,t])).rows[0].j;
 assert.equal((await claim('sub1',t1)).attempts,1);assert.equal(await claim('sub1',t2),null);
 await db.query("update feedback_quality_jobs set decision=$1,lease_until=now()-interval '1 second' where submission_id='sub1'",[JSON.stringify({outcome:'approved',reason:'Specific useful feedback.'})]);
 assert.equal((await claim('sub1',t2)).decision.outcome,'approved','reclaimed lease keeps the original decision');
 await assert.rejects(db.query('select finish_feedback_quality($1,$2,$3)',['sub1',t1,'approved']),'old lease fenced');
 await assert.rejects(db.query('select finish_feedback_quality($1,$2,$3)',['sub1',t2,'rejected']),'cannot change saved decision');
 await db.query('select finish_feedback_quality($1,$2,$3)',['sub1',t2,'approved']);
 await db.query('select finish_feedback_quality($1,$2,$3)',['sub1',t2,'approved']);
 assert.equal((await db.query('select reviews_done from orders')).rows[0].reviews_done,1);
 assert.equal((await db.query('select count(*)::int n from decisions')).rows[0].n,1);
 await claim('sub2',t1);await claim('sub3',t2);
 await db.exec(`update feedback_quality_jobs set decision='{"outcome":"rejected","reason":"Unrelated spam."}' where submission_id='sub2';update feedback_quality_jobs set decision='{"outcome":"approved","reason":"Specific feedback."}' where submission_id='sub3';`);
 await Promise.all([db.query('select finish_feedback_quality($1,$2,$3)',['sub2',t1,'rejected']),db.query('select finish_feedback_quality($1,$2,$3)',['sub3',t2,'approved'])]);
 assert.equal((await db.query('select reviews_done from orders')).rows[0].reviews_done,2,'rejected reviews never count');
 assert.equal((await claim('sub1',t1)).state,'done');
 await db.exec('set role anon');await assert.rejects(db.query('select * from feedback_quality_jobs'));await assert.rejects(db.query('select claim_feedback_quality($1,$2)',['sub1',t1]));
 }finally{await db.close();}
});
