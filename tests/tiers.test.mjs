import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(fs.readFileSync(new URL('../lib/tiers.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {TIERS,isTier,tierForAmount,expectedOrderCents,matchesCurrentPackage,validPaidReviewCount}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('current checkout packages have exact prices and counts',()=>{
 assert.deepEqual([TIERS.quick.priceUsd,TIERS.quick.reviews],[15,1]);
 assert.deepEqual([TIERS.full.priceUsd,TIERS.full.reviews],[40,3]);
 assert.equal(tierForAmount(15),'quick');assert.equal(tierForAmount(40),'full');assert.equal(tierForAmount(39.99),null);
 assert.equal(expectedOrderCents('quick',1),1500);assert.equal(expectedOrderCents('full',3),4000);
});
test('unsupported and mismatched packages cannot enter checkout',()=>{
 assert.equal(isTier('toString'),false);assert.equal(isTier('rush'),false);
 assert.equal(matchesCurrentPackage('quick',3),false);assert.equal(matchesCurrentPackage('full',1),false);
 assert.equal(expectedOrderCents('full',1),null);assert.equal(validPaidReviewCount(4000,1),false);
});
test('legacy purchased three-review orders retain their price and count',()=>{
 assert.equal(expectedOrderCents('quick',3),1500);assert.equal(validPaidReviewCount(1500,3),true);
});
