const test = require('node:test');
const assert = require('node:assert/strict');
const { renderer, completedState } = require('./helpers.cjs');
function recoveryFixture() {
  const h = renderer();
  const saved = completedState();
  saved.studentName = 'Synthetic Returning Learner';
  saved.studentEmail = 'returning@example.invalid';
  saved.quizCompleted = false;
  saved.vrCompleted = false;
  saved.debriefingCompleted = false;
  h.context.saved = saved;
  h.element('studentName').value = 'Synthetic New Name';
  h.element('studentEmail').value = saved.studentEmail;
  h.run("localStorage.setItem(sessionStorageKey(saved.studentEmail),JSON.stringify(saved));refreshTab1()");
  const key = h.run('sessionStorageKey(saved.studentEmail)');
  return { h, saved, key, before: h.storage.get(key) };
}
test('recovery does not overwrite saved data or enable orientation while a decision is pending', async () => {
  const { h, key, before } = recoveryFixture();
  let respond, options;
  h.context.window.wahDialogs.showSessionRecovery = value => { options = value; return new Promise(resolve => { respond = resolve; }); };
  assert.equal(h.element('completeLearning').disabled, true);
  h.run('saveSession()');
  assert.equal(h.storage.get(key), before, 'delayed lookup must not overwrite existing progress');
  const pending = h.run('checkForSavedSessionAfterEmailEntry()');
  h.run('saveSession()');
  assert.equal(h.storage.get(key), before);
  assert.equal(h.run('state.currentTab'), 1);
  assert.equal(options.title, 'Welcome back');
  assert.match(options.message, /Synthetic Returning Learner/);
  assert.equal(options.detail, 'Step 4 — Knowledge Quiz');
  respond('primary');
  await pending;
  assert.equal(h.run('state.studentName'), 'Synthetic Returning Learner');
  assert.equal(h.run('state.currentTab'), 4);
  assert.equal(h.run('state.interviewCompleted'), true);
  assert.equal(h.run('state.quizCompleted'), false);
});
test('Keep My Progress returns to recovery without changing state or storage', async () => {
  const { h, key, before } = recoveryFixture();
  const initialState = h.json('state');
  let recoveries = 0;
  h.context.window.wahDialogs.showSessionRecovery = async () => {
    if (++recoveries === 1) return 'secondary';
    assert.equal(h.storage.get(key), before);
    assert.deepEqual(h.json('state'), initialState);
    return 'primary';
  };
  h.context.window.wahDialogs.showConfirm = async options => {
    assert.equal(options.primaryLabel, 'Keep My Progress');
    assert.equal(options.secondaryLabel, 'Start New Training');
    return 'primary';
  };
  await h.run('checkForSavedSessionAfterEmailEntry()');
  assert.equal(recoveries, 2);
  assert.equal(h.run('state.currentTab'), 4);
});
test('confirmed new training uses existing reset and preserves microphone preference and unrelated sessions', async () => {
  const { h, key, before } = recoveryFixture();
  h.storage.set('wah.microphoneDeviceId', 'synthetic-microphone');
  h.storage.set('workingAtHeightSession:other@example.invalid', 'other synthetic session');
  h.context.window.wahDialogs.showSessionRecovery = async () => 'secondary';
  h.context.window.wahDialogs.showConfirm = async () => 'secondary';
  await h.run('checkForSavedSessionAfterEmailEntry()');
  assert.notEqual(h.storage.get(key), before);
  assert.equal(h.run('state.currentTab'), 1);
  assert.equal(h.run('state.orientationCompleted'), false);
  assert.equal(h.run('state.interview.history.length'), 0);
  assert.equal(h.run('state.studentEmail'), 'returning@example.invalid');
  assert.equal(h.storage.get('wah.microphoneDeviceId'), 'synthetic-microphone');
  assert.equal(h.storage.get('workingAtHeightSession:other@example.invalid'), 'other synthetic session');
});
test('missing, malformed and orientation-only sessions do not prompt; duplicate lookups share one decision', async () => {
  const h = renderer();
  h.element('studentEmail').value = 'returning@example.invalid';
  let calls = 0, respond;
  h.context.window.wahDialogs.showSessionRecovery = () => { calls++; return new Promise(resolve => { respond = resolve; }); };
  await h.run('checkForSavedSessionAfterEmailEntry()');
  h.run("localStorage.setItem(sessionStorageKey('returning@example.invalid'),'malformed')");
  await h.run('checkForSavedSessionAfterEmailEntry()');
  h.run("localStorage.setItem(sessionStorageKey('returning@example.invalid'),JSON.stringify({orientationCompleted:false}))");
  await h.run('checkForSavedSessionAfterEmailEntry()');
  assert.equal(calls, 0);
  h.context.saved = completedState();
  h.run("saved.studentEmail='returning@example.invalid';localStorage.setItem(sessionStorageKey(saved.studentEmail),JSON.stringify(saved))");
  const pending = h.run('checkForSavedSessionAfterEmailEntry()');
  await h.run('checkForSavedSessionAfterEmailEntry()');
  assert.equal(calls, 1);
  respond('primary'); await pending;
});
test('stale recovery cannot apply a different learner session after asynchronous input changes', async () => {
  const { h, key, before } = recoveryFixture();
  let respond;
  h.context.window.wahDialogs.showSessionRecovery = () => new Promise(resolve => { respond = resolve; });
  const pending = h.run('checkForSavedSessionAfterEmailEntry()');
  h.element('studentEmail').value = 'other@example.invalid';
  respond('primary'); await pending;
  assert.equal(h.storage.get(key), before);
  assert.equal(h.run('state.studentEmail'), 'other@example.invalid');
  assert.equal(h.run('state.interviewCompleted'), false);
});
test('an eligible saved session is protected even before a new learner name is entered', () => {
  const { h, key, before } = recoveryFixture();
  h.element('studentName').value = '';
  h.run('refreshTab1();setTab(1);saveSession()');
  assert.equal(h.storage.get(key), before);
  assert.equal(h.element('completeLearning').disabled, true);
});
