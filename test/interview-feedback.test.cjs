const { test } = require('node:test');
const assert = require('node:assert/strict');
const bank = require('../data/question-bank.json');
const { renderer } = require('./helpers.cjs');
const forbidden = /try that again|stepping back|step back|rebuild the foundation|revisit|repeat the question|apply.*next question|before.*moving on|practice.*before|next module/i;
function evaluate(h, q, answer='', skipped=false) {
  h.context.q=q;h.context.answer=answer;h.context.skipped=skipped;
  return h.run('localEvaluate(q,answer,skipped)');
}
// Frozen behavioral reference for the original local scoring calculation.
function originalScore(question,answer,skipped) {
  if(skipped)return {score:0,correctness:'Skipped',isCorrect:false};
  const text=answer.toLowerCase(),points=question.expectedAnswerPoints||[];
  const hits=points.filter(p=>p.toLowerCase().split(/\W+/).filter(w=>w.length>4).some(w=>text.includes(w))).length;
  const ratio=points.length?hits/points.length:0;
  if(ratio>=.55 || (question.difficulty==='basic' && ratio>=.35))return {score:question.maxScore,correctness:'Correct',isCorrect:true};
  if(ratio>=.25)return {score:Math.max(.5,question.maxScore/2),correctness:'Partially Correct',isCorrect:false};
  return {score:0,correctness:'Incorrect',isCorrect:false};
}
test('incorrect and skipped feedback covers every bank point across all modules/difficulties/personas',()=>{
  const h=renderer(); const before=JSON.stringify(bank);
  for(const instructor of ['jake','emily','carlos','beatrice'])for(const q of bank)for(const skipped of [false,true]) {
    h.run(`state.selectedInstructorId=${JSON.stringify(instructor)}`);
    const ev=evaluate(h,q,'',skipped);
    for(const point of q.expectedAnswerPoints){h.context.point=point;assert.ok(ev.explanation.toLowerCase().includes(h.run('interviewTeachingClauses[point]').toLowerCase()),q.id+': '+point);}
    const words=ev.interviewerMessage.split(/\s+/).length;
    assert.ok(words>=35 && words<=65,`${q.id}/${instructor}: ${words} words`);
    assert.ok(!forbidden.test(ev.interviewerMessage));assert.ok(!ev.interviewerMessage.includes('\n'));
    assert.equal(ev.score,0);assert.equal(ev.isCorrect,false);
  }
  assert.equal(JSON.stringify(bank),before);
});
test('safety-critical qualifiers, numbers and no-invented-weather-limits guidance survive concise explanations',()=>{
  const h=renderer();
  assert.match(evaluate(h,bank.find(q=>q.module===5),'',true).interviewerMessage,/cannot be eliminated or neutralized.*do not infer wind or rain limits/s);
  assert.match(evaluate(h,bank.find(q=>q.module===7),'',true).interviewerMessage,/unless restoration is allowed.*at least every six months/s);
  assert.match(evaluate(h,bank.find(q=>q.module===1),'',true).interviewerMessage,/above 2\.0 meters where there is a risk of falling/);
  assert.match(evaluate(h,bank.find(q=>q.module===8),'',true).interviewerMessage,/first-aid capable and fit/);
});
test('partial feedback acknowledges a demonstrated point once and teaches missing points',()=>{
  const h=renderer(),q=bank.find(q=>q.module===2&&q.difficulty==='expert');h.context.q=q;h.context.answer=q.expectedAnswerPoints[0];
  const ev=h.run("withInterviewFeedback({score:1.5,correctness:'Partially Correct',isCorrect:false},q,answer)");
  assert.match(ev.interviewerMessage,/You identified that the organization implements preventive measures and risk assessment/);
  assert.ok(!ev.explanation.includes('the organization implements preventive measures and risk assessment'));
  for(const point of q.expectedAnswerPoints.slice(1)){h.context.point=point;assert.ok(ev.explanation.toLowerCase().includes(h.run('interviewTeachingClauses[point]').toLowerCase()));}
  assert.equal(ev.score,1.5);assert.equal(ev.isCorrect,false);
});
test('feedback acknowledgments do not accept altered numerical requirements or negated statements',()=>{
  const h=renderer();assert.equal(h.run("demonstratedFeedbackPoint('NR-35 applies above 2.0 meters with risk of falling','NR-35 applies above 3.0 meters with risk of falling')"),false);
  assert.equal(h.run("demonstratedFeedbackPoint('worker follows NR-35 and employer procedures','worker does not follow NR-35 and employer procedures')"),false);
  assert.equal(h.run("demonstratedFeedbackPoint('Fall Protection System mandatory when work at height cannot be avoided','Fall Protection System mandatory when work at height cannot be avoided')"),true);
  assert.equal(h.run("demonstratedFeedbackPoint('periodic training every two years minimum eight hours','periodic training every three years minimum six hours')"),false);
  assert.equal(h.run("demonstratedFeedbackPoint('authorized worker is trained, clinically fit, and approved','authorized worker is trained clinically unfit and approved')"),false);
});
test('correct feedback is brief, varies with persona and avoids repeating bank explanations',()=>{
  const h=renderer();const messages=[];
  for(const instructor of ['jake','emily','carlos','beatrice']){h.run(`state.selectedInstructorId=${JSON.stringify(instructor)}`);const ev=evaluate(h,bank[0],bank[0].expectedAnswerPoints.join(' '));assert.equal(ev.correctness,'Correct');assert.equal(ev.explanation,'');assert.ok(ev.interviewerMessage.split(/\s+/).length<25);messages.push(ev.interviewerMessage);}
  assert.equal(new Set(messages).size,4);
});
test('all local scores and adaptive outcomes match the previous algorithm, including explicit skips',()=>{
  const h=renderer();
  for(const q of bank)for(const answer of ['',q.expectedAnswerPoints[0],q.expectedAnswerPoints.slice(0,2).join(' '),q.expectedAnswerPoints.join(' '),'unrelated synthetic response'])for(const skipped of [false,true]){
    const ev=evaluate(h,q,answer,skipped),expected=originalScore(q,answer,skipped);
    assert.deepEqual({score:ev.score,correctness:ev.correctness,isCorrect:ev.isCorrect},expected,q.id);
    h.run(`state.interview.currentModule=${q.module}`);h.context.ev=ev;h.context.q=q;
    const next=h.json('advanceInterview(ev.isCorrect,q.difficulty)');
    assert.deepEqual(next,ev.isCorrect&&q.difficulty!=='expert'?{module:q.module,level:q.difficulty==='basic'?'intermediate':'expert'}:{module:q.module+1,level:ev.isCorrect?'expert':'basic'});
  }
});
test('remote score normalization is preserved while invented prose/transitions are excluded',async()=>{
  const raw={evaluation:{score:1.5,correctness:'Partially Correct',isCorrect:false,explanation:'Invented 99 meter rule.',positiveReinforcement:'Try that again.',improvementGuidanceText:'We will revisit this now.'},nextInterviewerMessage:'We are stepping back to rebuild the foundation.',shouldAdvance:false};
  let prompt;const h=renderer({callCimatec:async payload=>{prompt=payload;return JSON.stringify(raw);}});h.context.q=bank.find(q=>q.module===5&&q.difficulty==='expert');
  const ev=await h.run("evaluateWithApi(q,'unrelated synthetic answer')");assert.equal(ev.score,1.5);assert.equal(ev.correctness,'Partially Correct');assert.equal(ev.shouldAdvance,false);
  assert.ok(!/99|try that again|revisit|stepping back/i.test(ev.interviewerMessage));assert.match(ev.interviewerMessage,/do not infer wind or rain limits/);
  assert.match(prompt.messages[1].content,/generally 35–65 words/);assert.match(prompt.messages[1].content,/Never invent future progression/);
});
test('skips avoid remote evaluation and failure/malformed responses retain the fallback/retry policy',async()=>{
  let calls=0;const h=renderer({callCimatec:async()=>{calls++;throw Error('offline');}});h.context.q=bank[0];
  const skip=await h.run("evaluateWithApi(q,'',true)");assert.equal(skip.correctness,'Skipped');assert.equal(skip.score,0);assert.equal(calls,0);assert.match(skip.interviewerMessage,/risk of falling/);
  h.run('config.useLocalFallbackWhenApiFails=true');const fallback=await h.run("evaluateWithApi(q,'',false)");assert.match(fallback.interviewerMessage,/risk of falling/);
  h.run('config.useLocalFallbackWhenApiFails=false');await assert.rejects(h.run("evaluateWithApi(q,'',false)"));
  for(const content of ['invalid JSON',JSON.stringify({evaluation:{score:'bad'}})]){const malformed=renderer({callCimatec:async()=>content});malformed.context.q=bank[0];malformed.run('config.useLocalFallbackWhenApiFails=true');assert.match((await malformed.run("evaluateWithApi(q,'')")).interviewerMessage,/risk of falling/);}
});
test('application transition describes the actual selected question without duplicate teaching',()=>{
  const h=renderer();h.context.q=bank.find(q=>q.module===2);h.run('state.interview.history=[{question:{module:1}}]');
  const next=h.run("makeSegue({correctness:'Incorrect'},q)");assert.equal(next,`Now let's move to Module 2: ${h.context.q.moduleTitle}.\n\n${h.context.q.question}`);assert.ok(!forbidden.test(next.replace('next module','')));
  h.run('state.interview.history=[{question:{module:2}}]');assert.match(h.run("makeSegue({correctness:'Correct'},q)"),/^Let's continue in Module 2/);
});
test('insufficient or unfamiliar bank evidence is not supplemented with invented requirements',()=>{
  const h=renderer();h.context.q={...bank[0],expectedAnswerPoints:[]};assert.match(h.run("localEvaluate(q,'',true)").interviewerMessage,/reliable explanation is not available/);
  h.context.q={...bank[0],expectedAnswerPoints:['A future bank point with a required qualifier']};const ev=h.run("localEvaluate(q,'',true)");assert.match(ev.interviewerMessage,/required qualifier/);assert.ok(!ev.interviewerMessage.includes('2.0'));
});
