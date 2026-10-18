let questionBank = [];
let finalQuizBank = [];
let config = {};
const levels = ['basic', 'intermediate', 'expert'];
const levelLabels = { basic: 'Basic', intermediate: 'Intermediate', expert: 'Expert' };
const state = {
  studentName: '', studentEmail: '', currentTab: 1, selectedInstructorId: 'jake',
  orientationCompleted: false,
  smartchatsCompleted: false, expertiseAfterSmartChats: null, smartQuestionCount: 0, smartSummary: '',
  interviewCompleted: false, interviewScore: 0, expertiseAfterInterview: null,
  quizCompleted: false, quizScore: null, expertiseAfterQuiz: null,
  vrCompleted: false, vrExpertiseLevel: null, debriefingCompleted: false, certificateDownloaded: false,
  interview: { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '' },
  quiz: { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '', module5ExpertEncountered: false, activeQuestion: null, pendingNext: null },
  debriefing: { vrReportFileName: '', vrReportText: '', vrSummary: '', history: [], turn: 0, followUpAsked: false, summary: '' }
};

const safetyInstructors = {
  jake: {
    id: 'jake',
    name: 'Jake Miller',
    initials: 'JM',
    title: 'Senior Safety Instructor',
    shortLabel: 'Jake, Tampa, Florida instructor',
    origin: 'Tampa, Florida',
    image: 'assets/instructors/jake-miller.png',
    voice: 'cedar',
    description: 'A senior instructor from Tampa with a fast, confident field-coach style. He is energetic, practical, and direct without sounding formal.',
    displayDescription: 'Fast, practical field coach.',
    systemStyle: 'Use clear modern English with a fast Tampa, Florida field-coach rhythm. Be energetic, approachable, practical, confident, and direct. Use coaching phrases such as "good catch", "walk me through that", "that is exactly what crews miss", and "that is what we see in the field" when natural. Do not sound like a lecturer. Keep safety reasoning precise and grounded in the provided material.',
    ttsInstructions: 'Speak as a fast, energetic safety trainer from Tampa, Florida. Use clear modern English, confident field-coach delivery, practical emphasis, and an approachable but decisive rhythm. Do not exaggerate an accent; make the character distinct through pace, confidence, and coaching cadence.'
  },
  emily: {
    id: 'emily',
    name: 'Emily Carter',
    initials: 'EC',
    title: 'Senior Safety Instructor',
    shortLabel: 'Emily, Denver, Colorado instructor',
    origin: 'Denver, Colorado',
    image: 'assets/instructors/emily-carter.png',
    voice: 'sage',
    description: 'A senior instructor from Denver with a warm mentor style. She is calm, articulate, supportive, and focused on helping students explain their reasoning.',
    displayDescription: 'Calm, supportive mentor.',
    systemStyle: 'Use clear western English shaped by a Denver, Colorado mentor style. Be warm, articulate, supportive, calm, and practical. Use coaching phrases such as "you are on the right track", "tell me a little more about your reasoning", "let us think through that together", and "I want to understand how you are assessing the hazard" when natural. Keep the tone friendly while still expert and safety-focused.',
    ttsInstructions: 'Speak as a professional female safety trainer from Denver, Colorado. Use warm mentor-like pacing, highly articulate speech, supportive coaching intonation, clear pronunciation, and calm confidence. Do not force a heavy accent; make her distinct through clarity, warmth, and patient cadence.'
  },
  carlos: {
    id: 'carlos',
    name: 'Carlos Rivera',
    initials: 'CR',
    title: 'Senior Safety Instructor',
    shortLabel: 'Carlos, Miami, Florida instructor',
    origin: 'Miami, Florida',
    image: 'assets/instructors/carlos-rivera.png',
    voice: 'onyx',
    description: 'A senior instructor from Miami with a formal, demanding supervisor style. He is precise, disciplined, direct, and expects students to justify every safety decision.',
    displayDescription: 'Precise, disciplined supervisor.',
    systemStyle: 'Use mostly English with a natural Miami bilingual rhythm. Use occasional Spanish words such as "mira", "exacto", "vamos", "compadre", or "tranquilo" when natural, but keep the safety content clear. Be formal, demanding, deliberate, and direct. Hold students accountable without being rude. Ask for precise safety reasoning before accepting an answer. Sound like a strict senior supervisor who expects discipline before anyone leaves the ground.',
    ttsInstructions: 'Speak as an older male senior safety instructor from Miami, Florida. Use an authoritative, deep, firm, professional voice with deliberate pacing and subtle Miami bilingual rhythm. Include light Spanish flavor only through cadence and occasional phrasing. Do not sound feminine. Do not overdo the accent. Sound demanding but professional.'
  },
  beatrice: {
    id: 'beatrice',
    name: 'Beatrice Mae Johnson',
    initials: 'BJ',
    title: 'Senior Safety Instructor',
    shortLabel: 'Beatrice, Birmingham, Alabama instructor',
    origin: 'Birmingham, Alabama',
    image: 'assets/instructors/beatrice-johnson.png',
    voice: 'shimmer',
    description: 'A highly experienced instructor from Birmingham with a warm Deep South teaching style. She is memorable, practical, caring, and firm about safe decisions.',
    displayDescription: 'Warm, experienced field trainer.',
    systemStyle: 'Use clear English with a natural Deep South Alabama flavor. Use regional phrasing such as "well now", "now listen", "honey", "let me tell you", "I have seen folks make that mistake before", and "you do not want to be halfway up there wishing you had checked first" sparingly and naturally. Be warm but firm, practical, and serious about safety. Keep wording understandable. Sound like a respected field trainer with decades of experience.',
    ttsInstructions: 'Speak as an experienced senior safety instructor from Birmingham, Alabama. Use warm, confident, authentic Southern cadence with practical field authority and a slightly slower storytelling rhythm. Do not exaggerate the accent. Focus on sounding natural, conversational, reassuring, and clear.'
  }
};

function getSelectedInstructor() {
  return safetyInstructors[state.selectedInstructorId] || safetyInstructors.jake;
}

function selectInstructor(id, options = {}) {
  if (!safetyInstructors[id]) return;
  const previousInstructorId = state.selectedInstructorId;
  state.selectedInstructorId = id;
  renderInstructorCards();
  updateInstructorHeader();
  const instructor = getSelectedInstructor();
  updateVoiceStatus(`Selected interviewer: ${instructor.name}.`);

  const interviewVisible = $('interviewBox') && !$('interviewBox').classList.contains('hidden');
  const changed = previousInstructorId !== id;
  if (changed && interviewVisible) {
    cancelInterviewerSpeech();

    // When the learner switches instructor mid-interview, do not simply replay
    // the old text in the new voice. Rebuild the currently active prompt using
    // the newly selected persona so the displayed text and spoken voice match.
    const refreshedPrompt = buildCurrentPromptForSelectedInstructor();
    if (refreshedPrompt) {
      replaceLastInterviewerMessage(refreshedPrompt);
      if (voiceState.enabled && !voiceState.muted && options.replayCurrentPrompt !== false) {
        speakInterviewer(refreshedPrompt);
      }
    }
  }
}

function buildCurrentPromptForSelectedInstructor() {
  const q = state.interview && state.interview.activeQuestion;
  if (!q) return '';
  const instructor = getSelectedInstructor();
  const switchNote = `You are now speaking with ${instructor.name}.`;
  if (!state.interview.history || state.interview.history.length === 0) {
    return `${personaOpening()}

${makeSegue(null, q)}`;
  }
  return `${switchNote}

${makeSegue(null, q)}`;
}

function replaceLastInterviewerMessage(text) {
  const messages = Array.from(document.querySelectorAll('#chatLog .msg.interviewer'));
  if (!messages.length) {
    addMsg('interviewer', text, { speak: false });
    return;
  }
  const last = messages[messages.length - 1];
  last.textContent = text;
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

function renderInstructorCards() {
  const containers = Array.from(document.querySelectorAll('.instructorChoices'));
  if (!containers.length) return;
  containers.forEach(wrap => {
    wrap.replaceChildren();
    Object.values(safetyInstructors).forEach(instructor => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `instructorCard ${state.selectedInstructorId === instructor.id ? 'selected' : ''}`;
      button.dataset.instructorId = instructor.id;
      const portrait = document.createElement('img');
      portrait.src = instructor.image;
      portrait.alt = 'Portrait of ' + instructor.name;
      const body = textNode('span', '', 'instructorCardBody');
      body.append(textNode('strong', instructor.name), textNode('em', instructor.origin), textNode('span', instructor.displayDescription || instructor.description));
      button.append(portrait, body);
      button.addEventListener('click', () => {
        selectInstructor(instructor.id);
        if (wrap.id === 'instructorModalChoices') closeInstructorModal();
      });
      wrap.appendChild(button);
    });
  });
}

function openInstructorModal() {
  renderInstructorCards();
  const modal = $('instructorModal');
  if (modal) modal.classList.remove('hidden');
}

function closeInstructorModal() {
  const modal = $('instructorModal');
  if (modal) modal.classList.add('hidden');
}

function updateInstructorHeader() {
  const instructor = getSelectedInstructor();
  const img = $('selectedInstructorImage');
  const avatar = $('selectedInstructorAvatar');
  if (img) {
    img.src = instructor.image;
    img.alt = `Portrait of ${instructor.name}`;
  }
  if (avatar) avatar.textContent = instructor.initials;
  if ($('selectedInstructorName')) $('selectedInstructorName').textContent = instructor.name;
  if ($('selectedInstructorSubtitle')) $('selectedInstructorSubtitle').textContent = `${instructor.title} | ${instructor.shortLabel}`;
  updateDebriefInstructorHeader();
}

function updateDebriefInstructorHeader() {
  const instructor = getSelectedInstructor();
  const img = $('selectedDebriefInstructorImage');
  const avatar = $('selectedDebriefInstructorAvatar');
  if (img) {
    img.src = instructor.image;
    img.alt = `Portrait of ${instructor.name}`;
  }
  if (avatar) avatar.textContent = instructor.initials;
  if ($('selectedDebriefInstructorName')) $('selectedDebriefInstructorName').textContent = instructor.name;
  if ($('selectedDebriefInstructorSubtitle')) $('selectedDebriefInstructorSubtitle').textContent = `Debriefing Facilitator | ${instructor.shortLabel}`;
}

function personaOpening() {
  const instructor = getSelectedInstructor();
  if (instructor.id === 'carlos') {
    return `Hello ${state.studentName}. I am ${instructor.name}. Mira, today I am going to be direct. Before anyone leaves the ground, I want discipline, evidence, and no guessing. If you do not know, say it clearly, and we fix the gap.`;
  }
  if (instructor.id === 'beatrice') {
    return `Hello ${state.studentName}. I am ${instructor.name}. Well now, we are going to take our time and think this through right. Work at height is not the place for wishful thinking, honey. I want the safest decision you can stand behind.`;
  }
  if (instructor.id === 'emily') {
    return `Hello ${state.studentName}. I am ${instructor.name}. We will work through this together. I will ask you to explain your reasoning clearly, and I will help you connect each answer back to safe practice.`;
  }
  return `Hello ${state.studentName}. I am ${instructor.name}. Good to meet you. We will walk through this like a field coaching conversation, so focus on what you would actually check, decide, and do on the job.`;
}

const $ = (id) => document.getElementById(id);

// Untrusted values are always text, never HTML.
function textNode(tag, value, className = '') {
  const node = document.createElement(tag);
  node.textContent = String(value ?? '');
  if (className) node.className = className;
  return node;
}
function textParagraph(root, label, value) {
  const paragraph = textNode('p', '');
  if (label) paragraph.appendChild(textNode('strong', label + ' '));
  paragraph.appendChild(document.createTextNode(String(value ?? '')));
  root.appendChild(paragraph);
}
function updateSmartMetrics() {
  if ($('smartCountDisplay')) $('smartCountDisplay').textContent = state.smartchatsCompleted ? String(state.smartQuestionCount) : '—';
  if ($('smartLevelDisplay')) $('smartLevelDisplay').textContent = state.smartchatsCompleted ? state.expertiseAfterSmartChats : 'Not imported';
  if ($('smartContinueTitle')) $('smartContinueTitle').textContent = state.smartchatsCompleted ? 'Ready to continue' : 'Import your conversations';
}
function renderSmartResults() {
  const root = $('smartResults');
  updateSmartMetrics();
  root.replaceChildren();
  if (!state.smartchatsCompleted) { root.textContent = 'No CSV loaded.'; return; }
  const badge = textNode('p', '');
  badge.appendChild(textNode('span', state.expertiseAfterSmartChats || 'Completed', 'badge'));
  root.appendChild(badge);
  textParagraph(root, '', state.smartSummary || 'SmartChats analysis completed.');
}
function renderVrStatus(analyzing = false) {
  const root = $('vrReportStatus');
  root.replaceChildren();
  if (!state.vrCompleted && !analyzing) { root.textContent = 'No VR report uploaded.'; return; }
  textParagraph(root, 'Uploaded:', state.debriefing.vrReportFileName || 'VR report');
  if (analyzing) textParagraph(root, '', 'Analyzing VR experience...');
  else {
    textParagraph(root, 'VR Expertise Level:', state.vrExpertiseLevel || 'Not identified');
    textParagraph(root, '', state.debriefing.vrSummary || 'VR report analyzed.');
  }
}

async function handleDocumentSave(operation, onSaved) {
  try {
    const result = await operation();
    if (!result.canceled) onSaved(result);
  } catch (_) {
    alert('Unable to save the document. Check completion evidence and choose a valid Word document destination.');
  }
}

const voiceState = {
  enabled: false,
  muted: false,
  recording: false,
  transcribing: false,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  audioContext: null,
  analyser: null,
  silenceCheckId: null,
  maxRecordingTimer: null,
  noSpeechTimer: null,
  speechDetected: false,
  supportedRecording: false,
  supportedSpeech: false,
  supportedNaturalSpeech: false,
  currentAudio: null,
  currentAudioUrl: null,
  finishPlayback: null,
  speechRequestId: 0,
  recordingRequestId: 0,
  mode: 'interview'
};

function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function addMsg(role, text, options = {}) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  $('chatLog').appendChild(div);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
  if (role === 'interviewer' && options.speak !== false) speakInterviewer(text);
}

function cleanTextForSpeech(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/Module (\d+):/gi, 'Module $1,')
    .trim();
}

function updateVoiceStatus(message) {
  if ($('voiceStatus')) $('voiceStatus').textContent = message;
  if ($('debriefVoiceStatus')) $('debriefVoiceStatus').textContent = message;
}

function updateDebriefVoiceStatus(message) {
  if ($('debriefVoiceStatus')) $('debriefVoiceStatus').textContent = message;
}

function setVoiceWaitIndicator(active, message = 'Preparing voice...') {
  ['voiceWaitIndicator', 'debriefVoiceWaitIndicator'].forEach(id => {
    const indicator = $(id);
    if (!indicator) return;
    indicator.classList.toggle('hidden', !active);
    const label = indicator.querySelector('.voiceWaitText');
    if (label && message) label.textContent = message;
  });
}

function refreshVoiceControls() {
  refreshMicrophoneControls();
  if ($('toggleVoiceMode')) {
    $('toggleVoiceMode').textContent = voiceState.enabled ? 'Disable Voice Interview' : 'Enable Voice Interview';
    $('toggleVoiceMode').classList.toggle('active', voiceState.enabled);
  }
  if ($('muteInterviewer')) {
    $('muteInterviewer').classList.toggle('hidden', !voiceState.enabled);
    $('muteInterviewer').textContent = voiceState.muted ? 'Unmute Interviewer' : 'Mute Interviewer';
    $('muteInterviewer').classList.toggle('active', voiceState.enabled && voiceState.muted);
  }
  if ($('voiceAnswer')) {
    $('voiceAnswer').disabled = !voiceState.supportedRecording || voiceState.transcribing;
    $('voiceAnswer').replaceChildren(textNode('span', '🎙️', 'micIcon'), textNode('span', 'Record voice answer', 'srOnly'));
    $('voiceAnswer').firstChild.setAttribute('aria-hidden', 'true');
    $('voiceAnswer').setAttribute('aria-label', voiceState.recording ? 'Stop recording early' : 'Record voice answer');
    $('voiceAnswer').title = voiceState.recording ? 'Listening; stops after you finish. Click to stop early.' : 'Record voice answer';
    $('voiceAnswer').classList.toggle('active', voiceState.recording && voiceState.mode === 'interview');
  }
  if ($('toggleDebriefVoiceMode')) {
    $('toggleDebriefVoiceMode').textContent = voiceState.enabled ? 'Disable Voice Debriefing' : 'Enable Voice Debriefing';
    $('toggleDebriefVoiceMode').classList.toggle('active', voiceState.enabled);
  }
  if ($('muteDebriefFacilitator')) {
    $('muteDebriefFacilitator').classList.toggle('hidden', !voiceState.enabled);
    $('muteDebriefFacilitator').textContent = voiceState.muted ? 'Unmute Facilitator' : 'Mute Facilitator';
    $('muteDebriefFacilitator').classList.toggle('active', voiceState.enabled && voiceState.muted);
  }
  if ($('debriefVoiceAnswer')) {
    $('debriefVoiceAnswer').disabled = !voiceState.supportedRecording || voiceState.transcribing;
    $('debriefVoiceAnswer').replaceChildren(textNode('span', '🎙️', 'micIcon'), textNode('span', 'Record voice reflection', 'srOnly'));
    $('debriefVoiceAnswer').firstChild.setAttribute('aria-hidden', 'true');
    $('debriefVoiceAnswer').setAttribute('aria-label', voiceState.recording ? 'Stop recording early' : 'Record voice reflection');
    $('debriefVoiceAnswer').title = voiceState.recording ? 'Listening; stops after you finish. Click to stop early.' : 'Record voice reflection';
    $('debriefVoiceAnswer').classList.toggle('active', voiceState.recording && voiceState.mode === 'debrief');
  }
}

function audioTrace(event, details = {}) {
  if (config?.audioDiagnostics === true) console.info('[WAH audio]', { event, timeMs: Math.round(performance.now()), requestId: voiceState.speechRequestId, phase: voiceState.audioPhase || 'idle', ...details });
}
function audioPhase(phase) { voiceState.audioPhase = phase; audioTrace('state'); }
function cancelInterviewerSpeech(reason = 'user action') {
  audioTrace('playback canceled', { reason });
  voiceState.pendingSpeechText = null;
  audioPhase('idle');
  setVoiceWaitIndicator(false);
  if (voiceState.finishPlayback) voiceState.finishPlayback();
  voiceState.speechRequestId += 1;
  if (voiceState.currentAudio) {
    try { voiceState.currentAudio.pause(); } catch (_) {}
    voiceState.currentAudio = null;
  }
  if (voiceState.currentAudioUrl) {
    try { URL.revokeObjectURL(voiceState.currentAudioUrl); } catch (_) {}
    voiceState.currentAudioUrl = null;
  }
  if (voiceState.supportedSpeech && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (_) {}
  }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

async function playNaturalInterviewerVoice(text, requestId) {
  audioPhase('preparing'); audioTrace('synthesis requested');
  setVoiceWaitIndicator(true, 'Preparing interviewer voice...');
  updateVoiceStatus('Preparing interviewer voice...');
  const instructor = getSelectedInstructor();
  const result = await window.appApi.synthesizeSpeech({
    text: cleanTextForSpeech(text),
    voice: instructor.voice || 'cedar',
    model: 'gpt-4o-mini-tts',
    instructions: instructor.ttsInstructions || 'Speak naturally as a warm, experienced senior safety instructor. Use a clear professional tone, moderate pace, supportive intonation, and avoid sounding robotic.'
  });
  if (requestId !== voiceState.speechRequestId) { audioTrace('obsolete synthesis ignored', { obsoleteRequestId: requestId }); return; }
  if (!result || !result.audioBase64) throw new Error('Missing voice audio.');
  const blob = base64ToBlob(result.audioBase64, result.mimeType || 'audio/mpeg');
  const url = URL.createObjectURL(blob);
  voiceState.currentAudioUrl = url;
  const audio = new Audio(url);
  voiceState.currentAudio = audio;
  audio.onplay = () => {
    if (requestId !== voiceState.speechRequestId) { audio.pause(); return; }
    if (requestId === voiceState.speechRequestId) {
      audioPhase('speaking'); audioTrace('playback start', { durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0 });
      setVoiceWaitIndicator(true, 'Interviewer speaking...');
      updateVoiceStatus('Interviewer speaking...');
    }
  };
  await new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      audio.onpause = null;
      clearTimeout(timer);
      if (voiceState.finishPlayback === finish) voiceState.finishPlayback = null;
      audio.pause();
      if (voiceState.currentAudio === audio) voiceState.currentAudio = null;
      if (voiceState.currentAudioUrl === url) {
        URL.revokeObjectURL(url);
        voiceState.currentAudioUrl = null;
      }
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Voice playback timed out.')), 180000);
    voiceState.finishPlayback = finish;
    audio.onpause = () => { if (!finished && !audio.ended) audioTrace('unexpected pause', { elapsedSeconds: audio.currentTime, durationSeconds: Number.isFinite(audio.duration) ? audio.duration : 0 }); };
    audio.onended = () => {
      audioTrace('playback complete', { elapsedSeconds: audio.currentTime });
      if (voiceState.currentAudio === audio) voiceState.currentAudio = null;
      if (voiceState.currentAudioUrl === url) {
        URL.revokeObjectURL(url);
        voiceState.currentAudioUrl = null;
      }
      if (requestId === voiceState.speechRequestId) {
        setVoiceWaitIndicator(false);
        updateVoiceStatus(voiceState.mode === 'debrief'
          ? 'Voice debriefing enabled. Press the microphone once; your answer is sent after you finish speaking.'
          : 'Voice interview enabled. Press the microphone once; your answer is sent after you finish speaking.');
      }
      finish();
    };
    audio.onerror = () => {
      audioPhase('error');
      audioTrace('playback error');
      if (requestId === voiceState.speechRequestId) {
        setVoiceWaitIndicator(false);
        updateVoiceStatus('Natural voice playback failed. Falling back to system voice.');
      }
      finish(new Error('Natural voice playback failed.'));
    };
    audio.play().catch(() => finish(new Error('Natural voice playback failed.')));
  });
}

function speakWithSystemVoice(text) {
  audioPhase('speaking'); audioTrace('system playback start');
  setVoiceWaitIndicator(false);
  if (!voiceState.supportedSpeech) return Promise.resolve();
  try { window.speechSynthesis.cancel(); } catch (_) {}
  const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text));
  const instructor = getSelectedInstructor();
  utterance.lang = 'en-US';
  utterance.rate = instructor.id === 'carlos' ? 0.88 : instructor.id === 'beatrice' ? 0.9 : instructor.id === 'emily' ? 0.94 : 0.98;
  utterance.pitch = instructor.id === 'carlos' ? 0.86 : instructor.id === 'beatrice' ? 1.03 : instructor.id === 'emily' ? 1.08 : 1.01;
  return new Promise(resolve => {
    let timer, finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      clearTimeout(timer);
      if (voiceState.finishPlayback === finish) voiceState.finishPlayback = null;
      resolve();
    };
    timer = setTimeout(() => { try { window.speechSynthesis.cancel(); } finally { finish(); } }, 180000);
    voiceState.finishPlayback = finish;
    utterance.onend = () => { audioTrace('system playback complete'); finish(); };
    utterance.onerror = () => { audioTrace('system playback error'); finish(); };
    try { window.speechSynthesis.speak(utterance); } catch (_) { finish(); }
  });
}

async function speakInterviewer(text) {
  if (!voiceState.enabled || voiceState.muted) return;
  if (voiceState.recording || microphoneState.local || microphoneState.busy) { audioTrace('playback suppressed during capture'); return; }
  if (voiceState.pendingSpeechText === text && voiceState.pendingSpeechMode === voiceState.mode) { audioTrace('repeated synthesis suppressed'); return; }
  cancelInterviewerSpeech('new prompt');
  const requestId = voiceState.speechRequestId;
  voiceState.pendingSpeechText = text; voiceState.pendingSpeechMode = voiceState.mode;
  try {
  if (voiceState.supportedNaturalSpeech) {
    try {
      await playNaturalInterviewerVoice(text, requestId);
      return;
    } catch (err) {
      if (requestId !== voiceState.speechRequestId) return;
      console.warn('Voice operation failed.');
      setVoiceWaitIndicator(false);
      updateVoiceStatus('Natural voice failed. Falling back to system voice for this prompt.');
    }
  }
  if (requestId === voiceState.speechRequestId) return await speakWithSystemVoice(text);
  } finally { if (requestId === voiceState.speechRequestId) { voiceState.pendingSpeechText = null; audioPhase('idle'); } }
}

function getCurrentInterviewerText() {
  const messages = Array.from(document.querySelectorAll('#chatLog .msg.interviewer'));
  if (messages.length) return messages[messages.length - 1].textContent || '';
  const q = state.interview && state.interview.activeQuestion;
  return q ? q.question : '';
}

function getCurrentDebriefText() {
  const messages = Array.from(document.querySelectorAll('#debriefLog .msg.interviewer'));
  if (messages.length) return messages[messages.length - 1].textContent || '';
  return '';
}

function debriefPersonaOpening() {
  const instructor = getSelectedInstructor();
  if (instructor.id === 'carlos') {
    return `Hello ${state.studentName}. I am ${instructor.name}. Mira, now we debrief the VR activity with discipline and honesty. I want to know what felt real, what helped your judgment, and where this training can be stronger.`;
  }
  if (instructor.id === 'beatrice') {
    return `Hello ${state.studentName}. I am ${instructor.name}. Well now, we are going to slow down and talk through what you experienced in VR. Reflection matters, honey, because that is where safe habits start to settle in.`;
  }
  if (instructor.id === 'emily') {
    return `Hello ${state.studentName}. I am ${instructor.name}. We will reflect on the VR activity together and connect it back to the full multimodal learning experience. I am interested in what felt useful, what felt unclear, and what would help future learners.`;
  }
  return `Hello ${state.studentName}. I am ${instructor.name}. Good work getting to the debriefing stage. Let us treat this like a field reflection and talk about what the VR activity helped you notice, practice, and question.`;
}

function toggleDebriefVoiceMode() {
  voiceState.mode = 'debrief';
  if (!voiceState.supportedNaturalSpeech && !voiceState.supportedSpeech) {
    updateDebriefVoiceStatus('Voice playback is not available in this Electron/browser build. Text reflection remains available.');
    return;
  }
  voiceState.enabled = !voiceState.enabled;
  if (!voiceState.enabled) {
    cancelInterviewerSpeech();
    cancelVoiceRecording();
  }
  updateDebriefVoiceStatus(voiceState.enabled
    ? 'Voice debriefing enabled. Press the microphone once; your answer is sent after you finish speaking.'
    : 'Voice debriefing disabled. Text reflection remains available.');
  refreshVoiceControls();
  if (voiceState.enabled) {
    const currentPrompt = getCurrentDebriefText();
    if (currentPrompt) speakInterviewer(currentPrompt);
  }
}

function toggleDebriefFacilitatorMute() {
  voiceState.mode = 'debrief';
  voiceState.muted = !voiceState.muted;
  if (voiceState.muted) cancelInterviewerSpeech('muted');
  updateDebriefVoiceStatus(voiceState.muted ? 'Facilitator muted. Text prompts will still appear in the debriefing chat.' : 'Facilitator unmuted. New debriefing prompts will be spoken aloud.');
  refreshVoiceControls();
}

async function toggleDebriefVoiceAnswer() {
  voiceState.mode = 'debrief';
  await toggleVoiceAnswer();
}

// Device IDs remain local, separate from learner sessions and provider payloads.
const microphoneState = { deviceId: '', inputs: [], busy: false, local: null, url: null, request: 0, ready: false };
const microphonePreferenceKey = 'wah.microphoneDeviceId';
function microphoneMessage(text) {
  if ($('audioMicrophoneStatus')) $('audioMicrophoneStatus').textContent = text;
}
function microphoneError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone permission denied. Allow microphone access in Windows privacy settings, or continue typing.';
  if (['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(error?.name)) return 'Selected microphone is unavailable, disconnected, or in use. Reconnect it or choose another microphone. No other microphone was selected automatically.';
  return 'Microphone recording failed. Check your microphone, try Test microphone, or continue typing.';
}
function refreshMicrophoneControls() {
  if (!microphoneState.ready) return;
  const locked = !voiceState.supportedRecording || microphoneState.busy || !!microphoneState.local || voiceState.recording || voiceState.transcribing;
  for (const prefix of ['audio']) {
    const select = $(prefix + 'Microphone'); if (!select) continue;
    select.replaceChildren(new Option('System default' + (microphoneState.inputs.find(input => input.deviceId === 'default')?.label ? ' — ' + microphoneState.inputs.find(input => input.deviceId === 'default').label : ''), ''));
    for (const [index, input] of microphoneState.inputs.entries()) if (input.deviceId && input.deviceId !== 'default') select.append(new Option(input.label || `Microphone ${index + 1} (grant access to show name)`, input.deviceId));
    if (microphoneState.deviceId && !microphoneState.inputs.some(input => input.deviceId === microphoneState.deviceId)) select.append(new Option('Saved microphone unavailable — reconnect or choose another', microphoneState.deviceId));
    select.value = microphoneState.deviceId; select.disabled = locked;
    $(prefix + 'MicrophoneRefresh').disabled = locked;
    $(prefix + 'MicrophoneTest').disabled = locked;
    $(prefix + 'MicrophoneStop').disabled = !microphoneState.local || microphoneState.local.stopping;
  }
}
async function refreshMicrophones() {
  try {
    microphoneState.inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    refreshMicrophoneControls();
    if (microphoneState.deviceId && !microphoneState.inputs.some(input => input.deviceId === microphoneState.deviceId)) microphoneMessage('Saved microphone is unavailable. Reconnect it or choose another microphone; there is no automatic fallback.');
  } catch (_) { microphoneMessage('Could not list microphones. Check microphone access or continue typing.'); }
}
function microphoneConstraints() {
  return { audio: microphoneState.deviceId ? { deviceId: { exact: microphoneState.deviceId } } : true };
}
async function acquireMicrophone() {
  const stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints());
  const settings = stream.getAudioTracks()[0]?.getSettings() || {};
  audioTrace('capture acquired', { sampleRate: settings.sampleRate || 0, channels: settings.channelCount || 0,
    echoCancellation: settings.echoCancellation, noiseSuppression: settings.noiseSuppression, autoGainControl: settings.autoGainControl });
  const active = 'Microphone used: ' + (stream.getAudioTracks()[0]?.label || 'System default (name unavailable)');
  if (microphoneState.ready) $('audioMicrophoneActive').textContent = active;
  microphoneMessage('Microphone ready. Use Test microphone to check the sound.');
  await refreshMicrophones();
  return stream;
}
function clearLocalMicrophoneTest() {
  microphoneState.request++;
  const local = microphoneState.local; microphoneState.local = null;
  if (local) {
    local.discarded = true; clearTimeout(local.timer); cancelAnimationFrame(local.animation);
    if (local.recorder.state === 'recording') local.recorder.stop();
    local.stream.getTracks().forEach(track => track.stop()); local.context?.close().catch(() => {});
  }
  for (const prefix of ['audio']) {
    const audio = microphoneState.ready && $(prefix + 'MicrophonePlayback'); if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  }
  if (microphoneState.url) URL.revokeObjectURL(microphoneState.url); microphoneState.url = null;
  refreshMicrophoneControls();
}
async function startLocalMicrophoneTest() {
  if (microphoneState.busy || microphoneState.local || voiceState.recording || voiceState.transcribing) return;
  clearLocalMicrophoneTest(); cancelInterviewerSpeech('local microphone test');
  const request = microphoneState.request; microphoneState.busy = true; refreshMicrophoneControls();
  let stream, context;
  try {
    stream = await acquireMicrophone();
    if (request !== microphoneState.request) { stream.getTracks().forEach(track => track.stop()); return; }
    const type = getSupportedAudioMimeType(); const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    context = new AudioContext(); await context.resume();
    if (request !== microphoneState.request) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
    const analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser);
    const local = { stream, recorder, context, chunks: [], peak: 0, discarded: false, stopping: false };
    microphoneState.local = local;
    const measure = () => { if (local.discarded || local.stopping) return; const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data); for (const value of data) local.peak = Math.max(local.peak, Math.abs(value - 128)); local.animation = requestAnimationFrame(measure); }; measure();
    recorder.ondataavailable = event => { if (!local.discarded && event.data.size) local.chunks.push(event.data); };
    recorder.onstop = () => {
      clearTimeout(local.timer); cancelAnimationFrame(local.animation); stream.getTracks().forEach(track => track.stop()); context.close().catch(() => {});
      if (local.discarded) return;
      microphoneState.local = null;
      const blob = new Blob(local.chunks, { type: recorder.mimeType || type || 'audio/webm' });
      microphoneState.url = URL.createObjectURL(blob);
      $('audioMicrophonePlayback').src = microphoneState.url;
      microphoneMessage(local.peak < 1 ? 'No detectable microphone input. Check the selected device and volume, then test again. Audio stayed local.' : 'Test recorded. Play it back to confirm your microphone. Audio stayed local; nothing was sent or submitted.');
      refreshMicrophoneControls();
    };
    recorder.onerror = () => { clearLocalMicrophoneTest(); microphoneMessage('Microphone test recording failed. Choose a working microphone and try again.'); };
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => { if (local.discarded || microphoneState.local !== local) return; clearLocalMicrophoneTest(); microphoneMessage('Microphone disconnected. Reconnect it or choose another microphone.'); });
    recorder.start(250); local.timer = setTimeout(stopLocalMicrophoneTest, 10000);
    microphoneMessage('Local microphone test: say “The orange safety helmet is beside the blue ladder.” Press Stop test when finished (10-second limit).');
  } catch (error) { stream?.getTracks().forEach(track => track.stop()); context?.close().catch(() => {}); if (request === microphoneState.request) microphoneMessage(microphoneError(error)); }
  finally { microphoneState.busy = false; refreshMicrophoneControls(); }
}
function stopLocalMicrophoneTest() {
  const local = microphoneState.local; if (!local || local.stopping) return;
  local.stopping = true; if (local.recorder.state === 'recording') local.recorder.stop(); refreshMicrophoneControls();
}
function setupMicrophones() {
  try { const saved = localStorage.getItem(microphonePreferenceKey); if (typeof saved === 'string' && saved.length <= 1024) microphoneState.deviceId = saved; } catch (_) { /* OS default when storage is unavailable. */ }
  for (const prefix of ['audio']) {
    const panel = document.createElement('div'); panel.className = 'microphoneSettings';
    const label = document.createElement('label'); label.htmlFor = prefix + 'Microphone'; label.textContent = 'Your microphone';
    const select = document.createElement('select'); select.id = label.htmlFor;
    select.onchange = () => { const selected = select.value; clearLocalMicrophoneTest(); microphoneState.deviceId = selected; microphoneMessage('Microphone selected. Use Test microphone to check it.'); try { if (selected) localStorage.setItem(microphonePreferenceKey, selected); else localStorage.removeItem(microphonePreferenceKey); } catch (_) { microphoneMessage('Microphone selected for this session; preference could not be saved.'); } refreshMicrophoneControls(); };
    panel.append(label, select);
    const advanced = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Advanced: test microphone'; advanced.append(summary);
    for (const [suffix, text, action] of [['Refresh','Show / refresh microphones',async () => {
      if (microphoneState.busy) return; microphoneState.busy = true; refreshMicrophoneControls(); let stream;
      try { cancelInterviewerSpeech('microphone permission check'); stream = await acquireMicrophone(); } catch (error) { microphoneMessage(microphoneError(error)); } finally { stream?.getTracks().forEach(track => track.stop()); microphoneState.busy = false; refreshMicrophoneControls(); }
    }], ['Test','Test microphone',startLocalMicrophoneTest], ['Stop','Stop test',stopLocalMicrophoneTest], ['Cancel','Discard test',() => { clearLocalMicrophoneTest(); microphoneMessage('Local microphone test discarded.'); }]]) {
      const button = document.createElement('button'); button.id = prefix + 'Microphone' + suffix; button.type = 'button'; button.className = 'secondary'; button.textContent = text; button.onclick = action; advanced.append(button);
    }
    const status = document.createElement('p'); status.id = prefix + 'MicrophoneStatus'; status.className = 'hint'; status.setAttribute('role','status'); status.textContent = 'Choose a microphone or use System default. Test audio stays on this computer.';
    const active = document.createElement('p'); active.id = prefix + 'MicrophoneActive'; active.className = 'hint'; active.textContent = 'Microphone used: not yet tested';
    const playback = document.createElement('audio'); playback.id = prefix + 'MicrophonePlayback'; playback.controls = true; playback.setAttribute('aria-label','Local microphone test playback'); advanced.append(status, playback); panel.append(active, advanced);
    $('audioSettingsContent').append(panel);
  }
  $('audioSettingsButton').onclick = () => { $('audioSettings').showModal(); refreshMicrophones(); };
  $('closeAudioSettings').onclick = () => $('audioSettings').close();
  $('audioSettings').addEventListener('close', () => { clearLocalMicrophoneTest(); $('audioSettingsButton').focus(); });
  microphoneState.ready = true;
  navigator.mediaDevices?.addEventListener('devicechange', async () => {
    await refreshMicrophones();
    if (microphoneState.deviceId && !microphoneState.inputs.some(input => input.deviceId === microphoneState.deviceId)) {
      clearLocalMicrophoneTest();
      if (voiceState.recording) { voiceState.microphoneError = 'Selected microphone disconnected. Reconnect it or choose another microphone.'; voiceState.audioChunks = []; voiceState.speechDetected = false; stopVoiceRecording(); }
    }
  });
  if (navigator.mediaDevices?.enumerateDevices) refreshMicrophones();
  window.addEventListener('beforeunload', clearLocalMicrophoneTest);
}
function setupVoiceFeatures() {
  voiceState.supportedSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  voiceState.supportedNaturalSpeech = Boolean(window.appApi && window.appApi.synthesizeSpeech);
  voiceState.supportedRecording = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && window.appApi && window.appApi.transcribeAudio);
  if (!voiceState.supportedRecording) {
    updateVoiceStatus('Voice recording is unavailable. Text entry remains available.');
  } else {
    if ($('voiceStatus')) $('voiceStatus').textContent = 'Voice is optional. Choose an instructor, press the microphone, and answer aloud.';
    if ($('debriefVoiceStatus')) $('debriefVoiceStatus').textContent = 'Voice is optional. Press the microphone once; your reflection is sent after you finish speaking.';
  }
  setupMicrophones();
  refreshVoiceControls();
}

function toggleVoiceMode() {
  voiceState.mode = 'interview';
  if (!voiceState.supportedNaturalSpeech && !voiceState.supportedSpeech) {
    updateVoiceStatus('Voice playback is unavailable. Text chat remains available.');
    return;
  }
  voiceState.enabled = !voiceState.enabled;
  if (!voiceState.enabled) {
    cancelInterviewerSpeech();
    cancelVoiceRecording();
  }
  updateVoiceStatus(voiceState.enabled
    ? 'Voice enabled. Press the microphone to answer aloud.'
    : 'Voice disabled. Text chat remains available.');
  refreshVoiceControls();
  if (voiceState.enabled) {
    const currentPrompt = getCurrentInterviewerText();
    if (currentPrompt) speakInterviewer(currentPrompt);
  }
}

function toggleInterviewerMute() {
  voiceState.mode = 'interview';
  voiceState.muted = !voiceState.muted;
  if (voiceState.muted) cancelInterviewerSpeech('muted');
  updateVoiceStatus(voiceState.muted ? 'Interviewer muted. Text prompts will still appear in the chat.' : 'Interviewer unmuted. New interviewer prompts will be spoken aloud.');
  refreshVoiceControls();
}

function getSupportedAudioMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function transcribeVoiceBlob(blob) {
  const audioBase64 = await blobToBase64(blob);
  const result = await window.appApi.transcribeAudio({
    audioBase64,
    mimeType: blob.type || 'audio/webm',
    fileName: 'interview-answer.webm'
  });
  const transcript = String(result && result.text ? result.text : '').trim();
  if (!transcript) {
    updateVoiceStatus('No speech was transcribed. Please record again, speak clearly, or type your answer.');
    return;
  }
  if (voiceState.mode === 'debrief') {
    const existing = $('debriefAnswerBox') ? $('debriefAnswerBox').value.trim() : '';
    $('debriefAnswerBox').value = existing ? `${existing} ${transcript}`.replace(/\s+/g, ' ').trim() : transcript;
    updateDebriefVoiceStatus('Voice reflection transcribed. Submitting automatically...');
    await submitDebriefingAnswer();
    return;
  }
  const existing = $('answerBox') ? $('answerBox').value.trim() : '';
  $('answerBox').value = existing ? `${existing} ${transcript}`.replace(/\s+/g, ' ').trim() : transcript;
  updateVoiceStatus('Voice answer transcribed. Submitting automatically...');
  await handleAnswer(false);
}

function clearVoiceTimers() {
  if (voiceState.silenceCheckId) {
    cancelAnimationFrame(voiceState.silenceCheckId);
    voiceState.silenceCheckId = null;
  }
  if (voiceState.maxRecordingTimer) {
    clearTimeout(voiceState.maxRecordingTimer);
    voiceState.maxRecordingTimer = null;
  }
  if (voiceState.noSpeechTimer) {
    clearTimeout(voiceState.noSpeechTimer);
    voiceState.noSpeechTimer = null;
  }
}

function closeVoiceAudioContext() {
  if (voiceState.audioContext) {
    try { voiceState.audioContext.close(); } catch (_) {}
    voiceState.audioContext = null;
  }
  voiceState.analyser = null;
}

function stopVoiceRecording() {
  if (voiceState.recording) audioTrace('recording stop', { elapsedMs: Math.round(performance.now() - (voiceState.recordingStartedAt || performance.now())) });
  clearVoiceTimers();
  closeVoiceAudioContext();
  if (voiceState.mediaRecorder && voiceState.recording) {
    voiceState.transcribing = true;
    try { voiceState.mediaRecorder.stop(); } catch (_) { voiceState.transcribing = false; }
  }
  if (voiceState.mediaStream) {
    voiceState.mediaStream.getTracks().forEach(track => track.stop());
    voiceState.mediaStream = null;
  }
  voiceState.recording = false;
  refreshVoiceControls();
}

// Four seconds tolerates short thinking pauses; this is an audio boundary only,
// unrelated to assessment scoring. Centralize timings for controlled tuning.
const answerRecordingPolicy = Object.freeze({ speechRms: 10, minimumMs: 2000, silenceMs: 4000, noSpeechMs: 15000 });
function cancelVoiceRecording() {
  voiceState.recordingRequestId++;
  voiceState.speechDetected = false; voiceState.audioChunks = [];
  stopVoiceRecording();
}
function monitorSpeechSignal() {
  if (!voiceState.recording || !voiceState.analyser) return;
  const data = new Uint8Array(voiceState.analyser.fftSize);
  const startedAt = performance.now();
  let lastVoiceAt = startedAt;

  const tick = () => {
    if (!voiceState.recording || !voiceState.analyser) return;
    voiceState.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const centered = value - 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / data.length);

    const now = performance.now();
    if (rms > answerRecordingPolicy.speechRms) {
      voiceState.speechDetected = true;
      lastVoiceAt = now;
      if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Listening to your reflection. It will be sent after you finish speaking.'); else updateVoiceStatus('Listening to your answer. It will be sent after you finish speaking.');
    }
    if (voiceState.speechDetected && now - startedAt >= answerRecordingPolicy.minimumMs && now - lastVoiceAt >= answerRecordingPolicy.silenceMs) {
      audioTrace('speech ending detected');
      if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Finished speaking. Transcribing your reflection...'); else updateVoiceStatus('Finished speaking. Transcribing your answer...');
      stopVoiceRecording(); return;
    }

    voiceState.silenceCheckId = requestAnimationFrame(tick);
  };

  voiceState.silenceCheckId = requestAnimationFrame(tick);
}

async function startVoiceRecording() {
  if (voiceState.recording || voiceState.transcribing || microphoneState.busy || microphoneState.local) { microphoneMessage('Finish the current audio operation before recording another answer.'); return; }
  if (voiceState.currentAudio || voiceState.audioPhase === 'speaking') audioTrace('capture/playback overlap prevented');
  cancelInterviewerSpeech('answer recording');
  const recordingRequest = ++voiceState.recordingRequestId;
  microphoneState.busy = true; refreshMicrophoneControls(); voiceState.microphoneError = '';
  try {
    if (voiceState.mode === 'debrief') {
      if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = true;
    } else {
      if ($('submitAnswer')) $('submitAnswer').disabled = true;
      if ($('skipAnswer')) $('skipAnswer').disabled = true;
    }

    const stream = await acquireMicrophone();
    if (recordingRequest !== voiceState.recordingRequestId) { stream.getTracks().forEach(track => track.stop()); return; }
    voiceState.mediaStream = stream;
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => {
      if (!voiceState.recording) return;
      voiceState.microphoneError = 'Microphone disconnected. Reconnect it or choose another microphone.';
      voiceState.audioChunks = []; voiceState.speechDetected = false; stopVoiceRecording();
    });
    voiceState.audioChunks = [];
    voiceState.speechDetected = false;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      voiceState.audioContext = new AudioContextClass();
      const source = voiceState.audioContext.createMediaStreamSource(stream);
      voiceState.analyser = voiceState.audioContext.createAnalyser();
      voiceState.analyser.fftSize = 1024;
      source.connect(voiceState.analyser);
    }

    const mimeType = getSupportedAudioMimeType();
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    voiceState.mediaRecorder = recorder;

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) voiceState.audioChunks.push(event.data);
    };

    recorder.onerror = () => {
      if (voiceState.mode === 'debrief') {
        updateDebriefVoiceStatus('Recording failed. Please check microphone access or type your reflection.');
      } else {
        updateVoiceStatus('Recording failed. Please check microphone access or type your answer.');
      }
      stopVoiceRecording();
      if (voiceState.mode === 'debrief') {
        if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = false;
      } else {
        if ($('submitAnswer')) $('submitAnswer').disabled = false;
        if ($('skipAnswer')) $('skipAnswer').disabled = false;
      }
    };

    recorder.onstop = async () => {
      audioPhase('transcribing');
      clearVoiceTimers();
      closeVoiceAudioContext();
      voiceState.recording = false;
      voiceState.transcribing = true;
      refreshVoiceControls();
      if (voiceState.mediaStream) {
        voiceState.mediaStream.getTracks().forEach(track => track.stop());
        voiceState.mediaStream = null;
      }
      if (!voiceState.audioChunks.length || !voiceState.speechDetected) {
        audioPhase('idle');
        voiceState.audioChunks = [];
        voiceState.transcribing = false;
        refreshVoiceControls();
        const message = voiceState.microphoneError || 'No clear microphone input was detected. Check Your microphone and Test microphone, or type your answer.';
        if (voiceState.mode === 'debrief') updateDebriefVoiceStatus(message); else updateVoiceStatus(message);
        if (voiceState.mode === 'debrief') {
          if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = false;
        } else {
          if ($('submitAnswer')) $('submitAnswer').disabled = false;
          if ($('skipAnswer')) $('skipAnswer').disabled = false;
        }
        return;
      }
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const audioBlob = new Blob(voiceState.audioChunks, { type });
      voiceState.audioChunks = [];
      if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Transcribing your reflection...'); else updateVoiceStatus('Transcribing your answer...');
      try {
        await transcribeVoiceBlob(audioBlob);
      } catch (err) {
        console.warn('Voice operation failed.');
        const message = 'Transcription service failed. Type your response or try again. Use Test microphone to check local audio.';
        if (voiceState.mode === 'debrief') updateDebriefVoiceStatus(message); else updateVoiceStatus(message);
        if (voiceState.mode === 'debrief') {
          if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = false;
        } else {
          if ($('submitAnswer')) $('submitAnswer').disabled = false;
          if ($('skipAnswer')) $('skipAnswer').disabled = false;
        }
      } finally {
        audioPhase('idle');
        voiceState.transcribing = false;
        refreshVoiceControls();
        if (voiceState.mode === 'debrief' && !state.debriefingCompleted) {
          if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = false;
        } else if (voiceState.mode !== 'debrief' && !state.interviewCompleted) {
          if ($('submitAnswer')) $('submitAnswer').disabled = false;
          if ($('skipAnswer')) $('skipAnswer').disabled = false;
        }
      }
    };

    recorder.start(250);
    voiceState.recording = true;
    voiceState.recordingStartedAt = performance.now();
    audioPhase('recording'); audioTrace('recording start');
    refreshVoiceControls();
    if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Listening. Speak your reflection; it will be sent after you finish.'); else updateVoiceStatus('Listening. Speak your answer; it will be sent after you finish.');

    monitorSpeechSignal();
    voiceState.noSpeechTimer = setTimeout(() => {
      if (voiceState.recording && !voiceState.speechDetected) {
        voiceState.microphoneError = 'No speech detected. Check your microphone in Audio settings, then try again or type your answer.';
        stopVoiceRecording();
      }
    }, answerRecordingPolicy.noSpeechMs);
    const maxRecordingMs = voiceState.mode === 'debrief' ? 180000 : 120000;
    voiceState.maxRecordingTimer = setTimeout(() => {
      if (voiceState.recording) {
        if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Maximum recording time reached. Transcribing your reflection...'); else updateVoiceStatus('Maximum recording time reached. Transcribing your answer...');
        stopVoiceRecording();
      }
    }, maxRecordingMs);
  } catch (err) {
    console.warn('Voice operation failed.');
    const message = microphoneError(err); microphoneMessage(message);
    if (voiceState.mode === 'debrief') updateDebriefVoiceStatus(message); else updateVoiceStatus(message);
    stopVoiceRecording();
    if (voiceState.mode === 'debrief') {
      if ($('submitDebriefAnswer')) $('submitDebriefAnswer').disabled = false;
    } else {
      if ($('submitAnswer')) $('submitAnswer').disabled = false;
      if ($('skipAnswer')) $('skipAnswer').disabled = false;
    }
  } finally { microphoneState.busy = false; refreshMicrophoneControls(); }
}

async function toggleVoiceAnswer() {
  if (!voiceState.mode) voiceState.mode = 'interview';
  if (!voiceState.supportedRecording) {
    updateVoiceStatus('Voice recording is not available in this build. Please type your answer.');
    return;
  }
  if (voiceState.recording) {
    audioTrace('recording stopped manually');
    if (voiceState.mode === 'debrief') updateDebriefVoiceStatus('Recording stopped. Transcribing your reflection...'); else updateVoiceStatus('Recording stopped. Transcribing your answer...');
    stopVoiceRecording();
  } else {
    await startVoiceRecording();
  }
}


function stopNarrationForUserAction() {
  // Any user navigation/action should immediately stop the current narrator audio.
  // Incrementing speechRequestId also prevents delayed TTS responses from starting after the user moved on.
  cancelInterviewerSpeech('navigation');
}

function setTab(tab) {
  if (voiceState.recording || microphoneState.busy) cancelVoiceRecording();
  clearLocalMicrophoneTest();
  stopNarrationForUserAction();
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  $(`tab${tab}`).classList.add('active');
  document.querySelectorAll('.tabs button').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.tab) === tab));
  if (tab === 7) updateCertificatePreview();
  updateStatus();
  saveSession();
}
function unlock(tab) { document.querySelector(`.tabs button[data-tab="${tab}"]`).disabled = false; }

function lockTabsAfterOrientation() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    const tabNumber = Number(btn.dataset.tab);
    btn.disabled = tabNumber !== 1;
    btn.classList.toggle('active', tabNumber === 1);
  });
}

function normalizeReadinessLevel(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('expert') || text.includes('strong')) return 'Expert';
  if (text.includes('intermediate')) return 'Intermediate';
  if (text.includes('basic') || text.includes('needs review') || text.includes('beginner')) return 'Basic';
  return null;
}

function readinessPoints(value) {
  const level = normalizeReadinessLevel(value);
  if (level === 'Expert') return 3;
  if (level === 'Intermediate') return 2;
  if (level === 'Basic') return 1;
  return 1;
}

function calculateOverallReadiness() {
  const total = readinessPoints(state.expertiseAfterSmartChats)
    + readinessPoints(state.expertiseAfterInterview)
    + readinessPoints(state.expertiseAfterQuiz)
    + readinessPoints(state.vrExpertiseLevel);
  if (total >= 11) return 'Expert';
  if (total >= 7) return 'Intermediate';
  return 'Basic';
}

function readinessMessage(level) {
  if (level === 'Expert') return 'Congratulations. You demonstrated an Expert level of readiness and successfully completed the Working at Height training experience.';
  if (level === 'Intermediate') return 'You successfully completed the Working at Height training experience with an Intermediate readiness level. Additional review is recommended to strengthen mastery of advanced concepts.';
  return 'You successfully completed the Working at Height training experience with a Basic readiness level. Additional study and practice are recommended before performing complex work-at-height activities independently.';
}

function updateCertificatePreview() {
  const overall = calculateOverallReadiness();
  if ($('certStudentName')) $('certStudentName').textContent = state.studentName || 'Learner Name';
  if ($('certEmail')) $('certEmail').textContent = state.studentEmail || 'Not available';
  if ($('certDate')) $('certDate').textContent = new Date().toLocaleDateString();
  if ($('certSmart')) $('certSmart').textContent = state.expertiseAfterSmartChats || 'Not available';
  if ($('certInterview')) $('certInterview').textContent = state.expertiseAfterInterview || 'Not available';
  if ($('certQuiz')) $('certQuiz').textContent = state.expertiseAfterQuiz || 'Not available';
  if ($('certVR')) $('certVR').textContent = state.vrExpertiseLevel || 'Not identified';
  if ($('certOverallLevel')) $('certOverallLevel').textContent = overall;
  if ($('certOverallBadge')) {
    $('certOverallBadge').textContent = overall;
    $('certOverallBadge').className = `readinessBadge ${overall.toLowerCase()}`;
  }
  if ($('certificateReadinessMessage')) $('certificateReadinessMessage').textContent = readinessMessage(overall);
  if ($('retakeProgram')) $('retakeProgram').classList.toggle('hidden', overall === 'Expert');
}


const SESSION_STORAGE_PREFIX = 'workingAtHeightSession:';
const promptedSessionEmails = new Set();
let restoringSession = false;

function normalizedSessionEmail(email = state.studentEmail) {
  return String(email || '').trim().toLowerCase();
}

function sessionStorageKey(email = state.studentEmail) {
  const normalized = normalizedSessionEmail(email);
  return normalized ? `${SESSION_STORAGE_PREFIX}${normalized}` : '';
}

function cloneSessionState(source = state) {
  return JSON.parse(JSON.stringify(source));
}

function saveSession() {
  if (restoringSession || !validEmail(state.studentEmail)) return;
  try {
    const snapshot = cloneSessionState(state);
    snapshot.savedAt = new Date().toISOString();
    localStorage.setItem(sessionStorageKey(), JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Session could not be saved.', err);
  }
}

function loadSavedSession(email) {
  const key = sessionStorageKey(email);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Session could not be loaded.', err);
    return null;
  }
}

function clearSavedSession(email = state.studentEmail) {
  const key = sessionStorageKey(email);
  if (key) localStorage.removeItem(key);
}

function getFirstUnfinishedTab(saved = state) {
  const orientationDone = Boolean(saved.orientationCompleted || saved.smartchatsCompleted || saved.interviewCompleted || saved.quizCompleted || saved.debriefingCompleted || saved.certificateDownloaded);
  if (!orientationDone) return 1;
  if (!saved.smartchatsCompleted) return 2;
  if (!saved.interviewCompleted) return 3;
  if (!saved.quizCompleted) return 4;
  if (!saved.vrCompleted) return 5;
  if (!saved.debriefingCompleted) return 6;
  if (!saved.certificateDownloaded) return 7;
  return 7;
}

function resetIncompleteWorkFromTab(tab) {
  if (tab <= 2) {
    state.smartchatsCompleted = false;
    state.expertiseAfterSmartChats = null;
    state.smartQuestionCount = 0;
    state.smartSummary = '';
  }
  if (tab <= 3) {
    state.interviewCompleted = false;
    state.interviewScore = 0;
    state.expertiseAfterInterview = null;
    state.interview = { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '', activeQuestion: null };
  }
  if (tab <= 4) {
    state.quizCompleted = false;
    state.quizScore = null;
    state.expertiseAfterQuiz = null;
    state.quiz = { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '', module5ExpertEncountered: false, activeQuestion: null, pendingNext: null };
  }
  if (tab <= 5) {
    state.vrCompleted = false;
    state.vrExpertiseLevel = null;
    state.debriefing.vrReportFileName = '';
    state.debriefing.vrReportText = '';
    state.debriefing.vrSummary = '';
  }
  if (tab <= 6) {
    state.debriefingCompleted = false;
    state.debriefing.history = [];
    state.debriefing.turn = 0;
    state.debriefing.followUpAsked = false;
    state.debriefing.summary = '';
  }
  if (tab <= 7) {
    state.certificateDownloaded = false;
  }
}

function applySessionToState(saved) {
  restoringSession = true;
  try {
    Object.keys(state).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(saved, key)) state[key] = saved[key];
    });
    state.orientationCompleted = Boolean(state.orientationCompleted || state.smartchatsCompleted || state.interviewCompleted || state.quizCompleted || state.debriefingCompleted || state.certificateDownloaded);
    if (!state.selectedInstructorId || !safetyInstructors[state.selectedInstructorId]) state.selectedInstructorId = 'jake';

    const resumeTab = getFirstUnfinishedTab(state);
    resetIncompleteWorkFromTab(resumeTab);
    state.currentTab = resumeTab;

    rebuildInterfaceFromState(resumeTab);
  } finally {
    restoringSession = false;
  }
}

function rebuildInterfaceFromState(resumeTab = getFirstUnfinishedTab(state)) {
  cancelInterviewerSpeech();
  stopVoiceRecording();

  if ($('studentName')) $('studentName').value = state.studentName || '';
  if ($('studentEmail')) $('studentEmail').value = state.studentEmail || '';

  lockTabsAfterOrientation();
  for (let i = 1; i <= resumeTab; i += 1) unlock(i);

  if ($('smartCsv')) $('smartCsv').value = '';
  if ($('smartResults')) {
    renderSmartResults();
  }
  if ($('completeSmart')) $('completeSmart').disabled = !state.smartchatsCompleted;

  if ($('chatLog')) $('chatLog').replaceChildren();
  if ($('answerBox')) $('answerBox').value = '';
  if ($('interviewIntro')) $('interviewIntro').classList.toggle('hidden', state.interviewCompleted);
  if ($('interviewBox')) $('interviewBox').classList.add('hidden');
  if ($('interviewComplete')) $('interviewComplete').classList.toggle('hidden', !state.interviewCompleted);
  if ($('unlockQuiz')) $('unlockQuiz').disabled = !state.interviewCompleted;

  if ($('quizIntro')) $('quizIntro').classList.toggle('hidden', state.quizCompleted);
  if ($('quizBox')) $('quizBox').classList.add('hidden');
  if ($('quizComplete')) $('quizComplete').classList.toggle('hidden', !state.quizCompleted);
  if ($('quizSummaryText') && state.quizCompleted) $('quizSummaryText').textContent = `${state.quiz.summary || 'Quiz completed.'} ${state.quiz.vrMessage || ''}`.trim();
  if ($('quizFeedback')) $('quizFeedback').classList.add('hidden');
  if ($('quizOptions')) $('quizOptions').replaceChildren();
  if ($('unlockVrAnalysis')) $('unlockVrAnalysis').disabled = !state.quizCompleted;

  if ($('debriefIntro')) $('debriefIntro').classList.toggle('hidden', state.debriefingCompleted);
  if ($('debriefBox')) $('debriefBox').classList.add('hidden');
  if ($('debriefComplete')) $('debriefComplete').classList.toggle('hidden', !state.debriefingCompleted);
  if ($('debriefLog')) $('debriefLog').replaceChildren();
  if ($('debriefAnswerBox')) $('debriefAnswerBox').value = '';
  if ($('vrReportStatus')) {
    renderVrStatus();
  }
  if ($('continueDebriefing')) $('continueDebriefing').disabled = !state.vrCompleted;
  if ($('startDebrief')) $('startDebrief').disabled = !state.vrCompleted;
  if ($('continueCertificate')) $('continueCertificate').disabled = !state.debriefingCompleted;

  renderInstructorCards();
  updateInstructorHeader();
  updateCertificatePreview();
  refreshTab1();
  setTab(resumeTab);
}

function checkForSavedSessionAfterEmailEntry() {
  const email = normalizedSessionEmail($('studentEmail') ? $('studentEmail').value : state.studentEmail);
  if (!validEmail(email) || promptedSessionEmails.has(email)) return;
  const saved = loadSavedSession(email);
  if (!saved) return;
  const resumeTab = getFirstUnfinishedTab(saved);
  if (resumeTab <= 1 && !saved.orientationCompleted) return;
  promptedSessionEmails.add(email);
  const stepLabels = { 1: 'Orientation', 2: 'SmartChats', 3: 'Interview', 4: 'Quiz', 5: 'VR Experience Analysis', 6: 'Debriefing', 7: 'Certificate' };
  const savedName = saved.studentName ? ` for ${saved.studentName}` : '';
  const shouldContinue = window.confirm(`A previous training experience session was found${savedName}.\n\nContinue from Step ${resumeTab}: ${stepLabels[resumeTab]}?\n\nChoose OK to continue, or Cancel to start over.`);
  if (shouldContinue) {
    applySessionToState(saved);
    saveSession();
  } else {
    clearSavedSession(email);
    resetProgramForRetake();
    state.studentEmail = email;
    if ($('studentEmail')) $('studentEmail').value = email;
    refreshTab1();
  }
}

function resetProgramForRetake() {
  cancelInterviewerSpeech();
  stopVoiceRecording();
  const keepName = state.studentName;
  const keepEmail = state.studentEmail;

  state.studentName = keepName;
  state.studentEmail = keepEmail;
  state.currentTab = 1;
  state.selectedInstructorId = 'jake';
  state.orientationCompleted = false;

  state.smartchatsCompleted = false;
  state.expertiseAfterSmartChats = null;
  state.smartQuestionCount = 0;
  state.smartSummary = '';

  state.interviewCompleted = false;
  state.interviewScore = 0;
  state.expertiseAfterInterview = null;

  state.quizCompleted = false;
  state.quizScore = null;
  state.expertiseAfterQuiz = null;

  state.vrCompleted = false;
  state.vrExpertiseLevel = null;
  state.debriefingCompleted = false;
  state.certificateDownloaded = false;

  state.interview = { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '' };
  state.quiz = { currentModule: 1, currentLevel: 'basic', history: [], usedIds: [], recommendations: [], summary: '', module5ExpertEncountered: false, activeQuestion: null, pendingNext: null };
  state.debriefing = { vrReportFileName: '', vrReportText: '', vrSummary: '', history: [], turn: 0, followUpAsked: false, summary: '' };

  if ($('studentName')) $('studentName').value = keepName;
  if ($('studentEmail')) $('studentEmail').value = keepEmail;

  if ($('smartCsv')) $('smartCsv').value = '';
  if ($('smartResults')) $('smartResults').textContent = 'No CSV loaded.';
  if ($('completeSmart')) $('completeSmart').disabled = true;

  if ($('chatLog')) $('chatLog').replaceChildren();
  if ($('answerBox')) $('answerBox').value = '';
  if ($('interviewIntro')) $('interviewIntro').classList.remove('hidden');
  if ($('interviewBox')) $('interviewBox').classList.add('hidden');
  if ($('interviewComplete')) $('interviewComplete').classList.add('hidden');
  if ($('unlockQuiz')) $('unlockQuiz').disabled = true;

  if ($('quizIntro')) $('quizIntro').classList.remove('hidden');
  if ($('quizBox')) $('quizBox').classList.add('hidden');
  if ($('quizComplete')) $('quizComplete').classList.add('hidden');
  if ($('quizFeedback')) $('quizFeedback').classList.add('hidden');
  if ($('quizOptions')) $('quizOptions').replaceChildren();
  if ($('unlockVrAnalysis')) $('unlockVrAnalysis').disabled = true;

  if ($('debriefIntro')) $('debriefIntro').classList.remove('hidden');
  if ($('debriefBox')) $('debriefBox').classList.add('hidden');
  if ($('debriefComplete')) $('debriefComplete').classList.add('hidden');
  if ($('debriefLog')) $('debriefLog').replaceChildren();
  if ($('debriefAnswerBox')) $('debriefAnswerBox').value = '';
  if ($('vrReportStatus')) $('vrReportStatus').textContent = 'No VR report uploaded.';
  if ($('continueDebriefing')) $('continueDebriefing').disabled = true;
  if ($('startDebrief')) $('startDebrief').disabled = true;
  if ($('continueCertificate')) $('continueCertificate').disabled = true;

  lockTabsAfterOrientation();
  setTab(1);
  renderInstructorCards();
  updateInstructorHeader();
  refreshTab1();
  updateCertificatePreview();
  saveSession();
}
function progressTrackerState(step, completed, ready) {
  if (state.currentTab === step) return 'current';
  if (completed) return 'completed';
  if (ready) return 'ready';
  return 'locked';
}

function setProgressTrackerStep(step, status, detail = '') {
  const row = document.querySelector(`[data-progress-step="${step}"]`);
  if (!row) return;
  row.classList.remove('completed', 'current', 'ready', 'locked');
  row.classList.add(status);
  const chip = row.querySelector('.statusChip');
  if (!chip) return;
  chip.textContent = status === 'completed' ? 'Completed'
    : status === 'current' ? 'Current'
    : status === 'ready' ? 'Ready'
    : 'Locked';
  if (detail) chip.title = detail; else chip.removeAttribute('title');
  const level = row.querySelector('.progressLevel');
  if (level) {
    const value = level.querySelector('em');
    if (status === 'completed' && detail) {
      if (value) value.textContent = detail;
      level.classList.remove('hidden');
    } else {
      if (value) value.textContent = '';
      level.classList.add('hidden');
    }
  }
}

function updateInterviewProgress() {
  if ($('interviewStageProgress')) $('interviewStageProgress').value = Math.min(8, state.interview.currentModule);
  if ($('interviewDifficultyDisplay')) $('interviewDifficultyDisplay').textContent = levelLabels[state.interview.currentLevel] || 'Basic';
}
function updateStatus() {
  updateSmartMetrics();
  // Presentation of the current stage, not an invented completion percentage.
  if ($('stageProgressText')) $('stageProgressText').textContent = `${state.currentTab} / 7 stages`;
  if ($('stageProgress')) $('stageProgress').value = state.currentTab;
  updateInterviewProgress();
  $('statusName').textContent = state.studentName || 'Not started';
  $('statusEmail').textContent = state.studentEmail || 'Not started';
  const stepLabels = { 1: 'Orientation', 2: 'SmartChats', 3: 'Interview', 4: 'Quiz', 5: 'VR Experience Analysis', 6: 'Debriefing', 7: 'Certificate' };
  $('statusProgress').textContent = stepLabels[state.currentTab] || `Step ${state.currentTab}`;
  const orientationDone = Boolean(state.orientationCompleted || state.smartchatsCompleted || state.interviewCompleted || state.quizCompleted || state.vrCompleted || state.debriefingCompleted || state.certificateDownloaded);
  setProgressTrackerStep(1, progressTrackerState(1, orientationDone, true));
  setProgressTrackerStep(2, progressTrackerState(2, state.smartchatsCompleted, orientationDone), state.expertiseAfterSmartChats || '');
  setProgressTrackerStep(3, progressTrackerState(3, state.interviewCompleted, state.smartchatsCompleted), state.expertiseAfterInterview || '');
  setProgressTrackerStep(4, progressTrackerState(4, state.quizCompleted, state.interviewCompleted), state.expertiseAfterQuiz || '');
  setProgressTrackerStep(5, progressTrackerState(5, state.vrCompleted, state.quizCompleted), state.vrExpertiseLevel || '');
  setProgressTrackerStep(6, progressTrackerState(6, state.debriefingCompleted, state.vrCompleted));
  setProgressTrackerStep(7, progressTrackerState(7, state.certificateDownloaded, state.debriefingCompleted));
}
function refreshTab1() {
  state.studentName = $('studentName').value.trim();
  state.studentEmail = $('studentEmail').value.trim();
  const ok = state.studentName.length > 1 && validEmail(state.studentEmail);
  $('openSmartChats').disabled = !ok;
  $('completeLearning').disabled = !ok;
  updateStatus();
  setTimeout(checkForSavedSessionAfterEmailEntry, 250);
}

function classifySmartChats(rows) {
  const email = state.studentEmail.toLowerCase();
  const matched = rows.filter(r => String(r.studentEmail || r.email || '').trim().toLowerCase() === email);
  const qs = matched.map(r => String(r.question || r.Question || r.message || '').toLowerCase()).filter(Boolean);
  if (qs.length === 0) return { count: 0, level: 'Expert', summary: 'No questions found for this email. Classified as Expert by project rule.' };
  const advancedWords = ['why','how','scenario','suspend','risk assessment','external influence','restrictive','emergency','supervisor','decision','continue','weather'];
  const introWords = ['what is','what are','tell me','module about','define','meaning'];
  let advanced = 0, intro = 0;
  qs.forEach(q => { if (advancedWords.some(w => q.includes(w))) advanced++; if (introWords.some(w => q.includes(w))) intro++; });
  let level = 'Intermediate';
  if (advanced >= Math.max(2, qs.length * .45)) level = 'Expert';
  else if (intro >= qs.length * .6) level = 'Basic';
  return { count: qs.length, level, summary: `${qs.length} SmartChats question(s) found. Introductory: ${intro}. Advanced safety reasoning: ${advanced}. Classified as ${level}.` };
}

function initialLevelFromSmartChats() {
  if (state.expertiseAfterSmartChats === 'Expert') return 'expert';
  if (state.expertiseAfterSmartChats === 'Intermediate') return 'intermediate';
  return 'basic';
}
function chooseQuestion(module, level) {
  const pool = questionBank.filter(q => q.module === module && q.difficulty === level && !state.interview.usedIds.includes(q.id));
  const fallback = questionBank.filter(q => q.module === module && q.difficulty === level);
  const selected = (pool.length ? pool : fallback)[Math.floor(Math.random() * (pool.length ? pool.length : fallback.length))];
  state.interview.usedIds.push(selected.id);
  return selected;
}
function makeSegue(prevEval, nextQuestion) {
  const instructor = getSelectedInstructor();
  if (!prevEval) {
    if (instructor.id === 'carlos') return `Vamos. We start with Module ${nextQuestion.module}: ${nextQuestion.moduleTitle}. I expect a clear safety answer, not guessing. Tell me what you would check first and why.\n\n${nextQuestion.question}`;
    if (instructor.id === 'beatrice') return `Well now, let's start with Module ${nextQuestion.module}: ${nextQuestion.moduleTitle}. Take your time, but give me the safest decision you can defend out there in the real world.\n\n${nextQuestion.question}`;
    if (instructor.id === 'emily') return `Let's begin with Module ${nextQuestion.module}: ${nextQuestion.moduleTitle}. You're not just choosing an answer here. I want to hear your reasoning and how you would keep the team safe.\n\n${nextQuestion.question}`;
    return `Let's get started with Module ${nextQuestion.module}: ${nextQuestion.moduleTitle}. Good field decisions come from noticing the right details, so walk me through your thinking.\n\n${nextQuestion.question}`;
  }
  const previousModule = state.interview.history.at(-1)?.question.module;
  const transition = previousModule === nextQuestion.module ? "Let's continue in" : "Now let's move to";
  return `${transition} Module ${nextQuestion.module}: ${nextQuestion.moduleTitle}.\n\n${nextQuestion.question}`;
}

// Editorial paraphrases keyed by exact bank text: not a second question bank or
// scoring rubric. Unknown points are quoted as supplied, never filled from AI.
const interviewTeachingClauses = Object.freeze({
  'NR-35 applies above 2.0 meters with risk of falling': 'NR-35 applies above 2.0 meters where there is a risk of falling',
  'planning organization and execution': 'the work needs planning, organization and execution',
  'protects workers directly and indirectly involved': 'protection covers workers directly and indirectly involved',
  'weather connects to risk assessment and external influences': 'weather belongs in risk assessment as an external influence',
  'organization implements preventive measures and risk assessment': 'the organization implements preventive measures and risk assessment',
  'worker follows NR-35 and employer procedures': 'workers follow NR-35 and employer procedures',
  'authorized worker is trained, clinically fit, and approved': 'an authorized worker is trained, clinically fit and approved',
  'organization suspends unforeseen hazardous work': 'the organization suspends unforeseen hazardous work',
  'initial training before work begins minimum eight hours': 'initial training takes at least eight hours before work begins',
  'training covers risk assessment restrictive conditions PPE emergencies': 'training covers risk assessment, restrictive conditions, PPE and emergencies',
  'periodic training every two years minimum eight hours': 'periodic training takes at least eight hours every two years',
  'qualified instruction and health evaluation support authorization': 'qualified instruction and health evaluation support authorization',
  'avoid work at height first, then eliminate fall risk, then minimize consequences': 'first avoid work at height, then eliminate fall risk, then minimize consequences',
  'every work at height activity needs Risk Assessment': 'every work-at-height activity needs Risk Assessment',
  'Risk Assessment includes adverse weather, communication, supervision, emergency planning': 'Risk Assessment covers adverse weather, communication, supervision and emergency planning',
  'non-routine work requires Work Permit': 'non-routine work requires a Work Permit',
  'adverse weather must be considered in Risk Assessment': 'Risk Assessment must consider adverse weather',
  'external influences may change worksite conditions': 'external influences can change site conditions',
  'restrictive conditions may prevent start or continuation': 'restrictive conditions can prevent starting or continuing work',
  'suspend work when unforeseen hazardous condition cannot be eliminated or neutralized': 'suspend work if an unforeseen hazard cannot be eliminated or neutralized',
  'do not invent wind or rain thresholds based only on NR-35': 'do not infer wind or rain limits from NR-35 alone',
  'Fall Protection System mandatory when work at height cannot be avoided': 'a Fall Protection System is mandatory when work at height cannot be avoided',
  'system selected according to Risk Assessment by qualified safety professional': 'a qualified safety professional selects the system according to Risk Assessment',
  'collective protection considered before personal protection when applicable': 'consider collective protection before personal protection when applicable',
  'fall arrest planning considers free fall distance fall factor impact force and clearance': 'fall-arrest planning considers free-fall distance, fall factor, impact force and clearance',
  'initial routine and periodic inspections are required': 'initial, routine and periodic inspections are required',
  'routine inspection before work begins': 'routine inspection happens before work begins',
  'defective degraded deformed or fall impact equipment must be discarded unless restoration allowed': 'discard defective, degraded, deformed or fall-impacted equipment unless restoration is allowed',
  'rope access equipment and cords inspected before use and at least every six months': 'inspect rope-access equipment and cords before use and at least every six months',
  'organization establishes emergency response procedures': 'the organization establishes emergency response procedures',
  'Risk Assessment considers emergency rescue and first aid to reduce inert suspension time': 'Risk Assessment considers rescue and first aid to reduce inert suspension time',
  'procedures consider rescue hazards team sizing estimated rescue time equipment and systems': 'procedures cover rescue hazards, team size, estimated rescue time, equipment and systems',
  'rescue personnel must be trained first aid capable and fit': 'rescuers must be trained, first-aid capable and fit'
});
const interviewSafetyConnections = Object.freeze({
  1: 'These points connect planning and changing conditions to protection from falls.',
  2: 'This connects safe work to authorization, procedures and preventive measures.',
  3: 'These checks support training and fitness before authorization.',
  4: 'This connects fall prevention to the risks and controls in the work plan.',
  5: 'Changing conditions can make starting or continuing work unsafe.',
  6: 'These choices connect fall protection to the risks and available clearance.',
  7: 'Inspections identify equipment that needs attention before use.',
  8: 'Planning rescue and first aid helps reduce time in inert suspension.'
});
function demonstratedFeedbackPoint(point, answer) {
  // Deliberately stricter than the UNCHANGED keyword scoring below. This only
  // controls whether feedback acknowledges a point, never credit/progression.
  const normalize = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalize(answer) === normalize(point)) return true;
  if (/\b(no|not|never|cannot|without)\b|n't\b/i.test(answer)) return false;
  const stopWords = new Set(['a','an','and','the','to','of','with','for','is','in','at','on','as','be','when','from','by']);
  const words = normalize(point).split(' ').filter(word => !stopWords.has(word) && !/^\d+$/.test(word));
  const answerWords = new Set(normalize(answer).split(' '));
  const numbers = point.match(/\d+(?:\.\d+)?/g) || [];
  const suppliedNumbers = (answer.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return words.length > 0 && words.every(word => answerWords.has(word))
    && numbers.every(number => suppliedNumbers.includes(Number(number)));
}
function withInterviewFeedback(evaluation, question, answer, skipped = false) {
  const variation = Number(String(question.id || '').split('-').at(-1)) || question.module || 1;
  if (evaluation.correctness === 'Correct' && !skipped) {
    const alternatives = {
      carlos: ['That is clear, disciplined safety reasoning.', 'Exacto. You identified the safety requirements clearly.'],
      beatrice: ['That is right. You kept the safety decision clear.', 'Well explained. You covered the expected safety points.'],
      emily: ['Good work. You connected the key safety points clearly.', 'You explained the expected safety reasoning clearly.'],
      jake: ['Good catch. You identified the key safety points.', 'That is clear safety reasoning for the field.']
    };
    const choices = alternatives[getSelectedInstructor().id] || alternatives.jake;
    const message = choices[variation % choices.length];
    return { ...evaluation, positiveReinforcement: message, explanation: '', improvementGuidanceText: '', interviewerMessage: message };
  }
  const points = Array.isArray(question.expectedAnswerPoints) ? question.expectedAnswerPoints : [];
  const partial = evaluation.correctness === 'Partially Correct' && !skipped;
  const demonstrated = partial ? points.filter(point => demonstratedFeedbackPoint(point, answer)) : [];
  const missing = points.filter(point => !demonstrated.includes(point));
  const acknowledgments = { carlos: ['The essential requirements are:', 'Mira, here are the essentials:'], beatrice: ['Here is what matters for safety:', 'Well now, here are the essentials:'], emily: ['Here are the key safety points:', 'The key concepts are:'], jake: ['Here is the safety reasoning:', 'Here are the essentials for the field:'] };
  let acknowledgment = skipped ? 'Thanks for saying so. ' : '';
  acknowledgment += (acknowledgments[getSelectedInstructor().id] || acknowledgments.jake)[variation % 2];
  if (partial) acknowledgment = demonstrated.length
    ? `You identified that ${interviewTeachingClauses[demonstrated[0]] || demonstrated[0]}. The important additions are:`
    : 'There are important points to add:';
  if (partial && points.length && !missing.length) acknowledgment = 'You named the expected concepts.';
  const clauses = missing.map(point => interviewTeachingClauses[point] || point);
  const middle = Math.ceil(clauses.length / 2);
  const sentence = values => values.length ? values.join('; ').replace(/^./, character => character.toUpperCase()) + '.' : '';
  // No truncation: retain qualifiers/numbers and all missing bank points. Four
  // or five concise clauses fit the editorial target or a safety-led exception.
  const explanation = [sentence(clauses.slice(0, middle)), sentence(clauses.slice(middle)),
    points.length && points.every(point => Object.hasOwn(interviewTeachingClauses, point)) ? interviewSafetyConnections[question.module] || '' : ''].filter(Boolean).join(' ');
  const fallback = points.length ? 'Their application to this question needs clarification.'
    : 'A reliable explanation is not available for this question.';
  return { ...evaluation, positiveReinforcement: acknowledgment, explanation: explanation || fallback,
    improvementGuidanceText: '', interviewerMessage: `${acknowledgment} ${explanation || fallback}` };
}

function localEvaluate(question, answer, skipped=false) {
  if (skipped) return withInterviewFeedback({
    score: 0, correctness: 'Skipped', isCorrect: false,
    recommendations: question.recommendedChapters
  }, question, answer, true);
  const text = answer.toLowerCase();
  const points = question.expectedAnswerPoints || [];
  const hits = points.filter(p => p.toLowerCase().split(/\W+/).filter(w => w.length > 4).some(w => text.includes(w))).length;
  const ratio = points.length ? hits / points.length : 0;
  let correctness = 'Incorrect', score = 0, isCorrect = false;
  if (ratio >= .55 || (question.difficulty === 'basic' && ratio >= .35)) { correctness = 'Correct'; score = question.maxScore; isCorrect = true; }
  else if (ratio >= .25) { correctness = 'Partially Correct'; score = Math.max(.5, question.maxScore / 2); }
  return withInterviewFeedback({
    score, correctness, isCorrect,
    recommendations: question.recommendedChapters
  }, question, answer);
}

function extractJsonObject(text) {
  if (!text) throw new Error('Empty API response');
  if (typeof text === 'object') return text;
  const cleaned = String(text).trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
  throw new Error('API response did not contain valid JSON');
}

function normalizeEvaluation(raw, question) {
  const parsed = raw || {};
  const evaluation = parsed.evaluation || parsed;
  const correctness = ['Correct', 'Partially Correct', 'Incorrect', 'Skipped'].includes(evaluation.correctness)
    ? evaluation.correctness
    : 'Partially Correct';
  const score = Math.min(Math.max(Number(evaluation.score || 0), 0), question.maxScore);
  return {
    score,
    correctness,
    isCorrect: Boolean(evaluation.isCorrect) && correctness === 'Correct',
    positiveReinforcement: evaluation.positiveReinforcement || 'Thank you. I appreciate your response.',
    explanation: evaluation.explanation || 'Let us connect your answer back to the NR-35 safety reasoning for this module.',
    improvementGuidanceText: evaluation.improvementGuidanceText || '',
    recommendations: evaluation.recommendations || question.recommendedChapters,
    interviewerMessage: parsed.nextInterviewerMessage || evaluation.interviewerMessage || '',
    shouldAdvance: parsed.shouldAdvance
  };
}

function buildConversationContext() {
  return state.interview.history.slice(-4).map((h, i) => ({
    turn: i + 1,
    module: h.question.module,
    moduleTitle: h.question.moduleTitle,
    difficulty: h.question.difficulty,
    questionAsked: h.question.question,
    learnerAnswer: h.skipped ? 'I do not know / skipped' : h.answer,
    correctness: h.evaluation.correctness,
    score: h.evaluation.score
  }));
}

async function evaluateWithApi(question, answer, skipped=false) {
  if (skipped) {
    return localEvaluate(question, answer, true);
  }

  const instructor = getSelectedInstructor();

  const prompt = `You are ${instructor.name}, the selected Senior Safety Instructor for an NR-35 work-at-height learning track.
Persona and communication style: ${instructor.systemStyle}
Your role is to make the experience feel like a live safety-readiness interview, not a quiz.
You must evaluate the learner's answer and respond conversationally.
Use only the supplied expected answer points and recommendations. Do not invent safety thresholds, wind limits, rain limits, or external regulations.

Return valid JSON only. Do not include markdown.

Required JSON shape:
{
  "evaluation": {
    "score": number,
    "correctness": "Correct" | "Partially Correct" | "Incorrect",
    "isCorrect": boolean,
    "positiveReinforcement": string,
    "explanation": string,
    "improvementGuidanceText": string,
    "recommendations": [{"module": number, "chapter": string, "topic": string}]
  },
  "nextInterviewerMessage": string,
  "shouldAdvance": boolean
}

Scoring rules:
- Maximum score for this question is ${question.maxScore}.
- isCorrect must be true only when the learner fully meets the level.
- Partial answers receive partial credit but shouldAdvance should normally be false unless the missing point is minor.
- Unsafe misconceptions should be Incorrect and shouldAdvance false.

Conversation requirements for nextInterviewerMessage:
- Stay fully in the selected instructor persona: ${instructor.systemStyle}
- Sound like an experienced Senior Safety Instructor.
- Start by reacting to the learner's answer.
- Explain the essential correct answer and its safety relevance using only the supplied expected points.
- For partial correctness, acknowledge the accurate part and explain missing points without repeating understood information.
- For correct answers, give brief positive reinforcement without a lecture.
- For incorrect answers, aim for 2–3 explanatory sentences, generally 35–65 words; accuracy takes priority over padding or truncation.
- Do not promise another attempt, review, repetition, a module revisit or application to a next question. Never invent future progression instructions.
- The application alone introduces the actual next question/module. End the current-answer explanation naturally without a forced encouragement sentence.
- Persona must not override factual grounding, conciseness or this current-answer-only contract.
- The application constrains learner-facing teaching text to bank-backed wording; your score and correctness fields are evaluated independently.

Recent interview context:
${JSON.stringify(buildConversationContext())}

Current module: Module ${question.module}: ${question.moduleTitle}
Difficulty: ${question.difficulty}
Current interviewer prompt: ${question.question}
Expected answer points: ${question.expectedAnswerPoints.join(' | ')}
Recommended chapters: ${JSON.stringify(question.recommendedChapters)}
Learner answer: ${answer}`;

  try {
    if (window.appApi.callCimatec) {
      const content = await window.appApi.callCimatec({
        maxTokens: config.maxTokens || 1200,
        messages: [
          { role: 'system', content: `You are ${instructor.name}, the selected Senior Safety Instructor for an NR-35 work-at-height learning track. ${instructor.systemStyle} Return valid JSON only. Do not include markdown.` },
          { role: 'user', content: prompt }
        ]
      });
      const parsed = extractJsonObject(content);
      const evaluation = parsed && (parsed.evaluation || parsed);
      if (!evaluation || typeof evaluation.score !== 'number' || !Number.isFinite(evaluation.score)
        || !['Correct', 'Partially Correct', 'Incorrect', 'Skipped'].includes(evaluation.correctness)
        || typeof evaluation.isCorrect !== 'boolean'
        || ['positiveReinforcement', 'explanation', 'improvementGuidanceText', 'interviewerMessage'].some(key => evaluation[key] !== undefined && typeof evaluation[key] !== 'string')
        || (parsed.nextInterviewerMessage !== undefined && typeof parsed.nextInterviewerMessage !== 'string')
        || (evaluation.recommendations !== undefined && (!Array.isArray(evaluation.recommendations)
          || evaluation.recommendations.some(r => !r || typeof r.module !== 'number' || typeof r.chapter !== 'string' || typeof r.topic !== 'string')))) {
        throw new Error('Invalid interview evaluation response.');
      }
      return withInterviewFeedback(normalizeEvaluation(parsed, question), question, answer);
    }

    throw new Error('Chat service is unavailable. Restart the application and retry.');
  } catch (e) {
    if (config.useLocalFallbackWhenApiFails) {
      return localEvaluate(question, answer, false);
    }
    throw e;
  }
}

function advanceInterview(wasCorrect, level) {
  if (wasCorrect) {
    if (level === 'basic') return { module: state.interview.currentModule, level: 'intermediate' };
    if (level === 'intermediate') return { module: state.interview.currentModule, level: 'expert' };
    return { module: state.interview.currentModule + 1, level: 'expert' };
  }
  return { module: state.interview.currentModule + 1, level: 'basic' };
}
function finishInterview() {
  const h = state.interview.history;
  const earned = h.reduce((s,x) => s + Number(x.evaluation.score || 0), 0);
  const possible = h.reduce((s,x) => s + Number(x.question.maxScore || 0), 0);
  const expertCorrect = h.filter(x => x.question.difficulty === 'expert' && x.evaluation.isCorrect).length;
  const intermediateCorrect = h.filter(x => x.question.difficulty === 'intermediate' && x.evaluation.isCorrect).length;
  const skipped = h.filter(x => x.skipped).length;
  const pct = possible ? Math.round((earned/possible)*100) : 0;
  state.interviewScore = `${earned}/${possible} (${pct}%)`;
  state.expertiseAfterInterview = expertCorrect >= 4 && pct >= 75 ? 'Expert' : (intermediateCorrect >= 3 && pct >= 55 ? 'Intermediate' : 'Basic');
  const recMap = new Map();
  h.forEach(x => { if (!x.evaluation.isCorrect) (x.evaluation.recommendations || x.question.recommendedChapters).forEach(r => recMap.set(`${r.module}-${r.chapter}`, r)); });
  state.interview.recommendations = [...recMap.values()];
  state.interview.summary = `The learner completed an adaptive Expert Interviewer conversation with ${h.length} prompt(s). Earned score: ${state.interviewScore}. Skipped responses: ${skipped}. Expertise after interview: ${state.expertiseAfterInterview}.`;
  state.interviewCompleted = true;
  updateStatus();
  $('interviewBox').classList.add('hidden');
  $('interviewComplete').classList.remove('hidden');
  saveSession();
}
async function handleAnswer(skipped=false) {
  stopVoiceRecording();
  const answer = skipped ? "I don't know" : $('answerBox').value.trim();
  if (!skipped && !answer) return alert('Please type an answer or select I Don\'t Know.');
  const q = state.interview.activeQuestion;
  addMsg('user', skipped ? "I don't know." : answer);
  $('answerBox').value = '';
  $('submitAnswer').disabled = true; $('skipAnswer').disabled = true;
  setVoiceWaitIndicator(true, 'Analyzing answer...');
  updateVoiceStatus('Analyzing your answer...');
  try {
    const evaluation = await evaluateWithApi(q, answer, skipped);
    const feedbackText = evaluation.interviewerMessage || `${evaluation.positiveReinforcement}

${evaluation.explanation}

${evaluation.improvementGuidanceText || ''}`;
    setVoiceWaitIndicator(false);
    addMsg('interviewer', feedbackText, { speak: false });
    state.interview.history.push({ question: q, answer, skipped, evaluation });
    const next = advanceInterview(Boolean(evaluation.isCorrect), q.difficulty);
    state.interview.currentModule = next.module; state.interview.currentLevel = next.level;
    if (next.module > 8) {
      speakInterviewer(feedbackText);
      return finishInterview();
    }
    const nq = chooseQuestion(next.module, next.level);
    state.interview.activeQuestion = nq;
    updateInterviewProgress();
    saveSession();
    const segueText = makeSegue(evaluation, nq);

    // Display the next prompt without triggering a second speech event.
    // Otherwise speechSynthesis.cancel() inside speakInterviewer() can stop the feedback mid-sentence.
    setTimeout(() => addMsg('interviewer', segueText, { speak: false }), 250);

    // Read the feedback and the next question as one uninterrupted turn.
    speakInterviewer(`${feedbackText}

${segueText}`);
    $('submitAnswer').disabled = false; $('skipAnswer').disabled = false;
  } catch (_) {
    // Keep the current bank question and learner answer available for retry.
    setVoiceWaitIndicator(false);
    if (!skipped) $('answerBox').value = answer;
    updateVoiceStatus('Unable to evaluate this answer. Please retry, or select I Don\'t Know.');
    alert('Unable to evaluate this answer. Please retry, or select I Don\'t Know.');
  } finally {
    if (!state.interviewCompleted) {
      $('submitAnswer').disabled = false;
      $('skipAnswer').disabled = false;
    }
  }
}


function initialQuizLevelFromInterview() {
  if (state.expertiseAfterInterview === 'Expert') return 'expert';
  if (state.expertiseAfterInterview === 'Intermediate') return 'intermediate';
  return 'basic';
}

function chooseQuizQuestion(module, level) {
  const pool = finalQuizBank.filter(q => q.module === module && q.difficulty === level && !state.quiz.usedIds.includes(q.id));
  const fallback = finalQuizBank.filter(q => q.module === module && q.difficulty === level);
  const source = pool.length ? pool : fallback;
  if (!source.length) throw new Error(`No quiz question found for Module ${module}, ${level}`);
  const selected = source[Math.floor(Math.random() * source.length)];
  state.quiz.usedIds.push(selected.id);
  if (selected.module === 5 && selected.difficulty === 'expert') state.quiz.module5ExpertEncountered = true;
  return selected;
}

function renderQuizQuestion() {
  const q = state.quiz.activeQuestion;
  if ($('quizStageProgress')) $('quizStageProgress').value = q.module;
  $('quizModuleBadge').textContent = `Module ${q.module}: ${q.moduleTitle}`;
  $('quizDifficultyBadge').textContent = levelLabels[q.difficulty] || q.difficulty;
  $('quizProgressText').textContent = `Questions presented: ${state.quiz.history.length + 1}`;
  $('quizQuestionText').textContent = q.question;
  $('quizFeedback').classList.add('hidden');
  $('quizFeedback').replaceChildren();
  $('nextQuizQuestion').classList.add('hidden');
  $('submitQuizAnswer').classList.remove('hidden');
  $('submitQuizAnswer').disabled = false;

  // Important: rebuild the option controls from the active question every time.
  // This prevents stale answers from a previous question remaining on screen.
  const optionsRoot = $('quizOptions');
  optionsRoot.replaceChildren();
  const radioName = `quizOption_${state.quiz.history.length + 1}`;

  q.options.forEach((opt, idx) => {
    const label = document.createElement('label');
    label.className = 'option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = radioName;
    input.value = String(idx);
    input.dataset.quizOption = 'true';

    const span = document.createElement('span');
    span.textContent = opt;

    label.appendChild(input);
    label.appendChild(span);
    optionsRoot.appendChild(label);
  });
}

function advanceQuiz(correct, question) {
  const currentModule = question.module;
  const level = question.difficulty;

  // Special Module 5 rule: every learner must encounter an Expert-level Module 5 question.
  // If Module 5 is reached at Basic or Intermediate, remain in Module 5 until Expert is presented.
  if (currentModule === 5 && level !== 'expert') {
    if (level === 'basic') return { module: 5, level: correct ? 'intermediate' : 'expert' };
    if (level === 'intermediate') return { module: 5, level: 'expert' };
  }

  if (correct) {
    if (level === 'basic') return { module: currentModule, level: 'intermediate' };
    if (level === 'intermediate') return { module: currentModule, level: 'expert' };
    return { module: currentModule + 1, level: 'expert' };
  }
  return { module: currentModule + 1, level: 'basic' };
}

function classifyQuizLevel(pct) {
  if (pct < 50) return 'Basic';
  if (pct < 85) return 'Intermediate';
  return 'Expert';
}

function finishQuizAdaptive() {
  const h = state.quiz.history;
  const earned = h.reduce((s, x) => s + Number(x.earnedPoints || 0), 0);
  const possible = h.reduce((s, x) => s + Number(x.question.points || 0), 0);
  const correctCount = h.filter(x => x.correct).length;
  const pct = possible ? Math.round((earned / possible) * 100) : 0;
  state.quizScore = `${earned}/${possible} (${pct}%)`;
  state.expertiseAfterQuiz = classifyQuizLevel(pct);
  state.quizCompleted = true;

  const recMap = new Map();
  h.forEach(x => {
    if (!x.correct) (x.question.recommendedChapters || []).forEach(r => recMap.set(`${r.module}-${r.chapter}`, r));
  });
  state.quiz.recommendations = [...recMap.values()];
  state.quiz.summary = `The learner completed the adaptive Final Quiz with ${h.length} question(s). Correct answers: ${correctCount}. Earned score: ${state.quizScore}. Readiness classification: ${state.expertiseAfterQuiz}. Module 5 Expert question encountered: ${state.quiz.module5ExpertEncountered ? 'Yes' : 'No'}.`;
  state.quiz.vrMessage = state.expertiseAfterQuiz === 'Basic'
    ? 'You completed the quiz. Additional review is recommended before participating in more advanced work-at-height activities.'
    : 'Congratulations. You may now experience the Virtual Reality simulation.';

  $('quizBox').classList.add('hidden');
  $('quizComplete').classList.remove('hidden');
  $('quizSummaryText').textContent = state.quiz.summary + ' ' + state.quiz.vrMessage;
  updateStatus();
  saveSession();
}

function submitQuizAnswer() {
  const q = state.quiz.activeQuestion;
  const selected = document.querySelector('input[data-quiz-option="true"]:checked');
  if (!selected) return alert('Please select an answer before continuing.');
  const selectedIndex = Number(selected.value);
  const correct = selectedIndex === q.correctIndex;
  const earnedPoints = correct ? q.points : 0;
  const selectedText = q.options[selectedIndex];
  const correctText = q.options[q.correctIndex];
  state.quiz.history.push({ question: q, selectedIndex, selectedText, correctText, correct, earnedPoints });

  const feedback = $('quizFeedback');
  feedback.replaceChildren();
  const result = textNode('p', '');
  result.appendChild(textNode('strong', correct ? 'Correct' : 'Incorrect'));
  feedback.appendChild(result);
  textParagraph(feedback, 'Correct answer:', correctText);
  textParagraph(feedback, '', q.explanation);
  if (!correct && q.recommendedChapters && q.recommendedChapters.length) {
    textParagraph(feedback, 'Recommended review:', q.recommendedChapters.map(r => 'Module ' + r.module + ', Chapter ' + r.chapter + ': ' + r.topic).join('; '));
  }
  $('quizFeedback').classList.remove('hidden');
  // Review decorations use exactly the selected index and bank's correct index.
  document.querySelectorAll('#quizOptions .option').forEach((label, index) => {
    const isCorrect = index === q.correctIndex;
    const isSelected = index === selectedIndex;
    label.classList.toggle('correctAnswer', isCorrect);
    label.classList.toggle('incorrectAnswer', isSelected && !correct);
    if (isCorrect || isSelected) label.appendChild(textNode('span',
      isCorrect ? (isSelected ? 'Your answer · Correct answer' : 'Correct answer') : 'Your answer', 'answerStatus'));
  });
  document.querySelectorAll('input[data-quiz-option="true"]').forEach(input => input.disabled = true);
  $('submitQuizAnswer').classList.add('hidden');
  $('nextQuizQuestion').classList.remove('hidden');
  state.quiz.pendingNext = advanceQuiz(correct, q);
  saveSession();
}

function continueQuiz() {
  const next = state.quiz.pendingNext;
  if (!next || next.module > 8) return finishQuizAdaptive();
  state.quiz.currentModule = next.module;
  state.quiz.currentLevel = next.level;
  state.quiz.activeQuestion = chooseQuizQuestion(next.module, next.level);
  renderQuizQuestion();
  saveSession();
}

function startQuizAdaptive() {
  $('quizIntro').classList.add('hidden');
  $('quizBox').classList.remove('hidden');
  $('quizComplete').classList.add('hidden');
  state.quiz = { currentModule: 1, currentLevel: initialQuizLevelFromInterview(), history: [], usedIds: [], recommendations: [], summary: '', module5ExpertEncountered: false, activeQuestion: null, pendingNext: null };
  state.quiz.activeQuestion = chooseQuizQuestion(state.quiz.currentModule, state.quiz.currentLevel);
  renderQuizQuestion();
  saveSession();
}


function addDebriefMsg(role, text, options = {}) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  $('debriefLog').appendChild(div);
  $('debriefLog').scrollTop = $('debriefLog').scrollHeight;
  state.debriefing.history.push({ role, text });
  if (role === 'interviewer' && options.speak !== false && voiceState.mode === 'debrief') speakInterviewer(text);
}

function extractVrExpertiseLevel(text) {
  const match = String(text || '').match(/(?:expertise|level|readiness)\s*(?:level)?\s*[:\-]\s*([^\n\r]+)/i);
  if (match) return match[1].trim().slice(0, 80);
  if (/expert/i.test(text)) return 'Expert';
  if (/intermediate/i.test(text)) return 'Intermediate';
  if (/basic|beginner/i.test(text)) return 'Basic';
  return 'Not identified';
}

async function summarizeVrReport() {
  const fallback = () => {
    const excerpt = state.debriefing.vrReportText.slice(0, 600).replace(/\s+/g, ' ').trim();
    state.debriefing.vrSummary = excerpt || 'No readable text was found in the VR report.';
    state.vrExpertiseLevel = extractVrExpertiseLevel(state.debriefing.vrReportText);
  };
  try {
    const content = await window.appApi.callCimatec({
      maxTokens: 700,
      messages: [
        { role: 'system', content: 'You summarize VR training reports for a work-at-height learning track. Return concise plain text only.' },
        { role: 'user', content: `Read this VR experience report. Identify the VR expertise level if present and summarize the general comments in 4 to 6 sentences. Do not invent information.\n\n${state.debriefing.vrReportText}` }
      ]
    });
    state.debriefing.vrSummary = content.trim() || 'No summary generated.';
    state.vrExpertiseLevel = extractVrExpertiseLevel(state.debriefing.vrReportText + '\n' + content);
  } catch (e) {
    fallback();
  }
}

async function analyzeVrReport() {
  let result;
  try { result = await window.appApi.selectVrReport(); }
  catch (_) { alert('Unable to read this Word report. Select a valid .docx file within the supported size limits.'); return; }
  if (result.canceled) return;
  state.debriefing.vrReportFileName = result.fileName;
  state.debriefing.vrReportText = result.text || '';
  renderVrStatus(true);
  if ($('continueDebriefing')) $('continueDebriefing').disabled = true;
  if ($('startDebrief')) $('startDebrief').disabled = true;
  await summarizeVrReport();
  state.vrCompleted = true;
  renderVrStatus();
  if ($('continueDebriefing')) $('continueDebriefing').disabled = false;
  if ($('startDebrief')) $('startDebrief').disabled = false;
  updateStatus();
  saveSession();
}

function buildDebriefingContext() {
  return {
    studentName: state.studentName,
    smartChatsLevel: state.expertiseAfterSmartChats,
    interviewLevel: state.expertiseAfterInterview,
    quizLevel: state.expertiseAfterQuiz,
    quizScore: state.quizScore,
    vrExpertiseLevel: state.vrExpertiseLevel,
    vrSummary: state.debriefing.vrSummary,
    recentDebriefingMessages: state.debriefing.history.slice(-8)
  };
}

async function nextDebriefingMessage(userAnswer) {
  state.debriefing.turn += 1;
  const isFinalTurn = state.debriefing.turn >= 4;
  const instructor = getSelectedInstructor();
  const system = `You are ${instructor.name}, a supportive debriefing facilitator for an NR-35 Working at Height Learning Track. This is reflective, not a quiz. Ask about the whole learning track, the VR experience, what was good, what was not good, and what the learner would improve. Ask at least one follow-up question based on the learner response. Do not invent safety thresholds. Keep responses concise and conversational. Use this persona style: ${instructor.systemStyle}`;
  const prompt = `Use the context and learner answer to continue the debriefing.\n\nRules:\n- If this is the first or second learner answer, ask a natural follow-up question based on the answer.\n- Before the end, ask about the entire learning track and what was good or not good.\n- If finalTurn is true, thank the learner and say the Working at Height Learning Track is complete. Do not ask another question.\n\nReturn JSON only with keys: message, followUpAsked, complete, summary.\n\nfinalTurn: ${isFinalTurn}\ncontext: ${JSON.stringify(buildDebriefingContext())}\nlearnerAnswer: ${userAnswer}`;
  try {
    const content = await window.appApi.callCimatec({
      maxTokens: 900,
      messages: [
        { role: 'system', content: system + ' Return valid JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed.message !== 'string' || !parsed.message.trim()
      || typeof parsed.complete !== 'boolean' || typeof parsed.followUpAsked !== 'boolean'
      || (parsed.summary !== undefined && typeof parsed.summary !== 'string')) {
      throw new Error('Invalid debriefing response.');
    }
    if (isFinalTurn) {
      parsed.complete = true;
      parsed.followUpAsked = false;
      if (!parsed.message || parsed.message.includes('?')) {
        parsed.message = 'Thank you for completing the debriefing. Your reflections help connect the learning modules, the Expert Interviewer, the Final Quiz, and the VR experience. You have completed the Working at Height training experience. Your certificate is now ready.';
      }
    }
    if (!isFinalTurn && parsed.followUpAsked) state.debriefing.followUpAsked = true;
    if (parsed.summary) state.debriefing.summary = parsed.summary;
    return parsed;
  } catch (e) {
    if (isFinalTurn) {
      return {
        message: 'Thank you for completing the debriefing. Your reflections help connect the learning modules, the Expert Interviewer, the Final Quiz, and the VR experience. You have completed the Working at Height training experience. Your certificate is now ready.',
        followUpAsked: state.debriefing.followUpAsked,
        complete: true,
        summary: 'The learner completed a reflective debriefing about the multimodal learning experience and VR experience.'
      };
    }
    state.debriefing.followUpAsked = true;
    return {
      message: 'Thank you for that reflection. Can you tell me one thing from the VR activity that felt most useful, and one thing that could be improved for future learners?',
      followUpAsked: true,
      complete: false,
      summary: ''
    };
  }
}

async function startDebriefing() {
  $('debriefIntro').classList.add('hidden');
  $('debriefBox').classList.remove('hidden');
  voiceState.mode = 'debrief';
  updateDebriefInstructorHeader();
  const opening = `${debriefPersonaOpening()}\n\nI reviewed your VR experience report.\n\nVR expertise level: ${state.vrExpertiseLevel || 'Not identified'}\n\nSummary: ${state.debriefing.vrSummary}\n\nBefore we finish the training experience, what part of the VR activity felt most realistic, useful, or memorable to you?`;
  addDebriefMsg('interviewer', opening);
  saveSession();
}

async function submitDebriefingAnswer() {
  if (state.debriefingCompleted) return;
  const answer = $('debriefAnswerBox').value.trim();
  if (!answer) return alert('Please type your reflection before continuing.');
  $('debriefAnswerBox').value = '';
  $('submitDebriefAnswer').disabled = true;
  addDebriefMsg('user', answer);
  addDebriefMsg('interviewer', 'Thank you. Let me reflect on that...', { speak: false });
  const response = await nextDebriefingMessage(answer);
  const lastMessage = document.querySelector('#debriefLog .msg.interviewer:last-child');
  if (lastMessage) lastMessage.textContent = response.message;
  const lastHistory = state.debriefing.history[state.debriefing.history.length - 1];
  if (lastHistory && lastHistory.role === 'interviewer') lastHistory.text = response.message;
  if (response.summary) state.debriefing.summary = response.summary;
  const shouldFinish = Boolean(response.complete || state.debriefing.turn >= 4);

  if (voiceState.enabled && !voiceState.muted) {
    try {
      await speakInterviewer(response.message);
    } catch (_) {
      // If speech fails, keep the text response and continue the debriefing flow.
    }
  }

  if (shouldFinish) {
    finishDebriefing();
  } else if (!state.debriefingCompleted) {
    $('submitDebriefAnswer').disabled = false;
    saveSession();
  }
}

function finishDebriefing() {
  state.vrCompleted = true;
  state.debriefingCompleted = true;
  if (!state.debriefing.summary) {
    state.debriefing.summary = 'The learner completed a reflective debriefing about the multimodal learning experience and VR experience.';
  }
  $('debriefBox').classList.add('hidden');
  $('debriefComplete').classList.remove('hidden');
  updateStatus();
  saveSession();
}

async function init() {
  questionBank = await window.appApi.readJson('data/question-bank.json');
  finalQuizBank = await window.appApi.readJson('data/final-quiz-bank.json');
  config = await window.appApi.readJson('data/config.json');
  updateStatus();
  renderInstructorCards();
  updateInstructorHeader();
  updateDebriefInstructorHeader();
  setupVoiceFeatures();

  if ($('beginTrack')) {
    $('beginTrack').addEventListener('click', () => {
      $('welcomePage').classList.add('hidden');
      $('appShell').classList.remove('hidden');
      setTab(1);
    });
  }

  if ($('retakeProgram')) {
    $('retakeProgram').addEventListener('click', resetProgramForRetake);
  }

  document.querySelectorAll('.tabs button').forEach(btn => btn.addEventListener('click', () => { if (!btn.disabled) setTab(Number(btn.dataset.tab)); }));
  $('studentName').addEventListener('input', refreshTab1);
  $('studentEmail').addEventListener('input', refreshTab1);
  $('openSmartChats').addEventListener('click', () => window.appApi.openExternal(`https://smartchats.info/course/whs?=${encodeURIComponent(state.studentEmail)}`));
  $('downloadEbook').addEventListener('click', () => handleDocumentSave(() => window.appApi.saveEbook(), r => alert(`Ebook saved to ${r.filePath}`)));
  $('completeLearning').addEventListener('click', () => { state.orientationCompleted = true; unlock(2); setTab(2); saveSession(); });
  $('smartCsv').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    $('smartResults').textContent = 'Importing SmartChats CSV...';
    $('smartResults').setAttribute('aria-busy', 'true');
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => {
      const result = classifySmartChats(res.data);
      state.smartQuestionCount = result.count; state.expertiseAfterSmartChats = result.level; state.smartSummary = result.summary; state.smartchatsCompleted = true;
      renderSmartResults();
      $('smartResults').removeAttribute('aria-busy');
      if (res.errors.length) textParagraph($('smartResults'), 'Import notice:', 'The CSV contains formatting warnings. Check the source file if the results are unexpected.');
      $('completeSmart').disabled = false; updateStatus(); saveSession();
    }, error: () => {
      $('smartResults').removeAttribute('aria-busy');
      $('smartResults').textContent = 'Unable to read this CSV. Choose a readable CSV exported from SmartChats and try again.';
    }});
  });
  $('completeSmart').addEventListener('click', () => { unlock(3); setTab(3); saveSession(); });
  if ($('toggleVoiceMode')) $('toggleVoiceMode').addEventListener('click', toggleVoiceMode);
  if ($('muteInterviewer')) $('muteInterviewer').addEventListener('click', toggleInterviewerMute);
  if ($('voiceAnswer')) $('voiceAnswer').addEventListener('click', () => { voiceState.mode = 'interview'; toggleVoiceAnswer(); });
  if ($('changeInstructorAvatar')) $('changeInstructorAvatar').addEventListener('click', openInstructorModal);
  if ($('changeDebriefInstructorAvatar')) $('changeDebriefInstructorAvatar').addEventListener('click', openInstructorModal);
  if ($('toggleDebriefVoiceMode')) $('toggleDebriefVoiceMode').addEventListener('click', toggleDebriefVoiceMode);
  if ($('muteDebriefFacilitator')) $('muteDebriefFacilitator').addEventListener('click', toggleDebriefFacilitatorMute);
  if ($('debriefVoiceAnswer')) $('debriefVoiceAnswer').addEventListener('click', toggleDebriefVoiceAnswer);
  if ($('closeInstructorModal')) $('closeInstructorModal').addEventListener('click', closeInstructorModal);
  if ($('instructorModal')) $('instructorModal').addEventListener('click', e => { if (e.target === $('instructorModal')) closeInstructorModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInstructorModal(); });
  document.addEventListener('click', e => {
    const button = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!button) return;
    if (['submitAnswer','skipAnswer','startInterview','startDebrief','submitDebriefAnswer','submitQuizAnswer','nextQuizQuestion','uploadVrReport'].includes(button.id)) cancelInterviewerSpeech('learner action');
  }, true);
  $('startInterview').addEventListener('click', () => {
    voiceState.mode = 'interview';
    $('interviewIntro').classList.add('hidden'); $('interviewBox').classList.remove('hidden');
    updateInstructorHeader();
    state.interview.currentModule = 1; state.interview.currentLevel = initialLevelFromSmartChats();
    const q = chooseQuestion(1, state.interview.currentLevel); state.interview.activeQuestion = q;
    updateInterviewProgress();
    addMsg('interviewer', `${personaOpening()}

Welcome to the Interview stage of the Working at Height training experience. I will guide you through questions about work-at-height safety, hazard recognition, weather-related decisions, and practical judgment. If you are unsure, you may select I Don't Know and continue.

${makeSegue(null, q)}`);
    saveSession();
  });
  $('submitAnswer').addEventListener('click', () => handleAnswer(false));
  $('skipAnswer').addEventListener('click', () => handleAnswer(true));
  $('exportInterview').addEventListener('click', () => { return handleDocumentSave(() => window.appApi.saveInterviewReport(state), r => { $('unlockQuiz').disabled = false; saveSession(); alert(`Report saved to ${r.filePath}`); }); });
  $('unlockQuiz').addEventListener('click', () => { unlock(4); setTab(4); saveSession(); });
  $('startQuiz').addEventListener('click', startQuizAdaptive);
  $('submitQuizAnswer').addEventListener('click', submitQuizAnswer);
  $('nextQuizQuestion').addEventListener('click', continueQuiz);
  $('exportQuiz').addEventListener('click', () => { return handleDocumentSave(() => window.appApi.saveQuizReport(state), r => { $('unlockVrAnalysis').disabled = false; saveSession(); alert(`Quiz report saved to ${r.filePath}`); }); });
  $('unlockVrAnalysis').addEventListener('click', () => { unlock(5); setTab(5); saveSession(); });
  $('uploadVrReport').addEventListener('click', analyzeVrReport);
  $('continueDebriefing').addEventListener('click', () => { unlock(6); setTab(6); saveSession(); });
  $('startDebrief').addEventListener('click', startDebriefing);
  $('submitDebriefAnswer').addEventListener('click', submitDebriefingAnswer);
  $('exportDebrief').addEventListener('click', () => { return handleDocumentSave(() => window.appApi.saveDebriefingReport(state), r => { $('continueCertificate').disabled = false; saveSession(); alert(`Debriefing report saved to ${r.filePath}`); }); });
  $('continueCertificate').addEventListener('click', () => { unlock(7); updateCertificatePreview(); setTab(7); saveSession(); });
  $('downloadCertificate').addEventListener('click', () => { updateCertificatePreview(); return handleDocumentSave(() => window.appApi.saveCertificate(state), r => { state.certificateDownloaded = true; updateStatus(); saveSession(); alert(`Certificate saved to ${r.filePath}`); }); });
}
init();
