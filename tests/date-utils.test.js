import test from 'node:test';import assert from 'node:assert/strict';import {dayNumber,nthDay,anniversaryDate,autoMilestones,occurrence,diff} from '../date-utils.js';
test('開始日は1日目、翌日は2日目',()=>{assert.equal(dayNumber('2026-08-01','2026-08-01'),1);assert.equal(dayNumber('2026-08-01','2026-08-02'),2)});
test('月末・年末・うるう年をまたぐ',()=>{assert.equal(nthDay('2026-01-31',2),'2026-02-01');assert.equal(nthDay('2025-12-31',2),'2026-01-01');assert.equal(nthDay('2024-02-28',2),'2024-02-29')});
test('2月29日の周年は平年に2月28日',()=>{assert.equal(anniversaryDate('2024-02-29',2025),'2025-02-28');assert.equal(anniversaryDate('2024-02-29',2028),'2028-02-29')});
test('100日目と周年を両方残す',()=>{const x=autoMilestones('2024-01-01','2024-12-30');assert.ok(x.some(a=>a.label==='1年目'));assert.ok(x.some(a=>a.label==='400日目')===false)});
test('100日記念の10日前と当日',()=>{assert.equal(autoMilestones('2026-01-01','2026-03-31').find(x=>x.label==='100日目').left,10);assert.equal(autoMilestones('2026-01-01','2026-04-10').find(x=>x.label==='100日目').left,0)});
test('毎年記念日の次回発生',()=>{assert.equal(occurrence({date:'2020-05-10',repeat:true},'2026-05-01'),'2026-05-10');assert.equal(occurrence({date:'2020-05-10',repeat:true},'2026-05-11'),'2027-05-10')});
test('日差はUTC日付だけで安定',()=>assert.equal(diff('2026-08-01','2026-08-02'),1));
