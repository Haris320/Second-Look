import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('database claims, reviewer isolation, quotas and submissions',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table orders(id uuid primary key,status text,audience text,whop_payment_id text,paid_at timestamptz,amount_cents integer,review_target int);
 create table reviews(id uuid default gen_random_uuid() primary key,order_id uuid references orders(id),terac_submission_id text unique,answers_json jsonb,duration_s int,status text default 'pending',created_at timestamptz default now(),submitted_at timestamptz);
 insert into orders values('00000000-0000-4000-8000-000000000001','paid','women_21_35_us','pay_test',now(),4000,3);
 insert into orders values('00000000-0000-4000-8000-000000000002','pending_payment','men_21_35_us',null,null,null,3);`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/2026-10-24-recruitment.sql',import.meta.url),'utf8'));
 const id='00000000-0000-4000-8000-000000000001';
 const claim=async()=> (await db.query('select claim_recruitment($1) j',[id])).rows[0].j;
 const [a,b]=await Promise.all([claim(),claim()]);
 assert.equal([a,b].filter(Boolean).length,1,'duplicate invocations claim exactly once');
 assert.equal((a||b).task_token.length,64);
 await assert.rejects(db.query("select claim_recruitment('00000000-0000-4000-8000-000000000002')"));
 await db.exec("update recruitment_jobs set state='needs_attention'");assert.equal(await claim(),null,'ambiguous create never retried');
 await db.exec("update recruitment_jobs set state='retryable',opportunity_id='opp_test'");assert.equal((await claim()).opportunity_id,'opp_test','retry retains the same opportunity');
 assert.equal(await claim(),null);
 const assign=async(s,p)=>(await db.query('select assign_terac_review($1,$2,$3) r',[id,s,p])).rows[0].r;
 const first=await assign('sub1','person1');
 assert.equal((await assign('sub1','person1')).id,first.id,'assignment retry does not duplicate');
 await assert.rejects(assign('sub1','person2'),'cannot substitute participant');
 await assert.rejects(assign('another-submission','person1'),'same person cannot fill two slots');
 await Promise.all([assign('sub2','person2'),assign('sub3','person3')]);
 await assert.rejects(assign('sub4','person4'),'fourth reviewer cannot obtain profile');
 assert.equal((await db.query('select count(*)::int n from reviews')).rows[0].n,3);
 await assert.rejects(db.query('select submit_terac_review($1,$2,$3)',[id,'sub1','{}']),'server minimum duration enforced');
 await db.exec("update reviews set created_at=now()-interval '2 minutes'");
 assert.equal((await db.query('select submit_terac_review($1,$2,$3) saved',[id,'sub1','{"works":"first"}'])).rows[0].saved,true);
 assert.equal((await db.query('select submit_terac_review($1,$2,$3) saved',[id,'sub1','{"works":"overwrite"}'])).rows[0].saved,false);
 const r=(await db.query("select * from reviews where terac_submission_id='sub1'")).rows[0];
 assert.equal(r.answers_json.works,'first');assert.equal(r.status,'pending','saved answers do not auto-approve/pay');
 const single='00000000-0000-4000-8000-000000000003';
 await db.query("insert into orders values($1,'paid','men_21_35_us','pay_single',now(),1500,1)",[single]);
 assert.ok((await db.query('select claim_recruitment($1) j',[single])).rows[0].j);
 await db.query('select assign_terac_review($1,$2,$3)',[single,'single-sub1','single-person1']);
 await assert.rejects(db.query('select assign_terac_review($1,$2,$3)',[single,'single-sub2','single-person2']),'single package stops after one reviewer');
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from recruitment_jobs'));
 await assert.rejects(db.query('select claim_recruitment($1)',[id]));
 } finally { await db.close(); }
});
