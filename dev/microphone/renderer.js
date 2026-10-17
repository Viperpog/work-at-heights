/* Same input constraints, MIME preference, analyser FFT and RMS calculation as
 * src/renderer.js. Manual stop deliberately preserves silence for diagnosis. */
const $ = id => document.getElementById(id);
let stream, context, recorder, animation, timer, blob, objectURL, recording = false, busy = false, generation = 0;
let samples = 0, sumSquares = 0, peak = 0, started = 0, duration = 0;
function mimeType() { return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) || ''; }
function status(text) { $('status').textContent = text; }
function controls() {
  $('record').disabled = recording || busy; $('permission').disabled = recording || busy;
  $('devices').disabled = recording || busy; $('stop').disabled = !recording;
  $('save').disabled = !blob || recording || busy; $('transcribe').disabled = !blob || recording || busy;
}
function cleanup() {
  cancelAnimationFrame(animation); clearTimeout(timer);
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  if (context && context.state !== 'closed') context.close().catch(() => {}); context = null;
}
function discard() {
  generation++; if (recorder?.state === 'recording') recorder.stop(); recorder = null; recording = false; cleanup();
  $('playback').pause(); $('playback').removeAttribute('src'); $('playback').load();
  if (objectURL) URL.revokeObjectURL(objectURL); objectURL = null; blob = null;
  $('transcript').textContent = ''; $('stats').textContent = 'No recording.'; controls();
}
async function devices() {
  const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
  const selected = $('devices').value; $('devices').replaceChildren(new Option('System default', ''));
  for (const input of inputs) $('devices').append(new Option(input.label || '(label unavailable)', input.deviceId));
  if (inputs.some(input => input.deviceId === selected)) $('devices').value = selected;
  $('defaultDevice').textContent = 'Default microphone: ' + (inputs.find(input => input.deviceId === 'default')?.label || 'OS default (not identified by browser)');
}
$('permission').onclick = async () => {
  const current = generation; busy = true; controls(); let permissionStream;
  try { permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true }); if (current === generation) { await devices(); status('Permission granted. Select a device or use System default.'); } }
  catch (error) { if (current === generation) status('Microphone permission failed: ' + error.name); }
  finally { permissionStream?.getTracks().forEach(track => track.stop()); busy = false; controls(); }
};
$('record').onclick = async () => {
  const selected = $('devices').value; discard(); const current = generation; busy = true; controls();
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: selected ? { deviceId: { exact: selected } } : true });
    if (current !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired; await devices(); if (current !== generation) return;
    const track = stream.getAudioTracks()[0]; const settings = track.getSettings();
    $('activeDevice').textContent = `Active microphone: ${track.label || '(unlabelled)'}; deviceId=${settings.deviceId || 'unavailable'}; sampleRate=${settings.sampleRate || 'unavailable'}; channels=${settings.channelCount || 'unavailable'}; echoCancellation=${settings.echoCancellation}; noiseSuppression=${settings.noiseSuppression}; autoGainControl=${settings.autoGainControl}`;
    context = new AudioContext(); await context.resume();
    if (current !== generation) return;
    const analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser);
    const type = mimeType(); recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const activeRecorder = recorder, chunks = []; samples = 0; sumSquares = 0; peak = 0;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { if (current === generation) { discard(); status('Recording failed. Try another microphone.'); } };
    recorder.onstop = () => {
      if (current !== generation) return;
      duration = (performance.now() - started) / 1000; recording = false; cleanup();
      blob = new Blob(chunks, { type: activeRecorder.mimeType || type || 'audio/webm' });
      objectURL = URL.createObjectURL(blob); $('playback').src = objectURL; updateStats(); controls();
      status(blob.size ? 'Recording ready. Listen locally before sending.' : 'Empty recording. Try again.');
    };
    function measure() {
      if (!recording || current !== generation) return;
      const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data);
      for (const value of data) { const centered = value - 128; sumSquares += centered * centered; peak = Math.max(peak, Math.abs(centered)); samples++; }
      duration = (performance.now() - started) / 1000; updateStats(); animation = requestAnimationFrame(measure);
    }
    started = performance.now(); recording = true; recorder.start(); measure();
    timer = setTimeout(() => { if (current === generation && recording) recorder.stop(); }, 120000);
    status('Recording. Speak the sentence, then press Stop. Silence is retained for diagnosis.');
  } catch (error) { if (current === generation) { discard(); status('Recording failed: ' + error.name); } }
  finally { busy = false; controls(); }
};
function updateStats() {
  const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
  $('stats').textContent = `Duration: ${duration.toFixed(2)} s\nFile size: ${blob ? blob.size : 'available after Stop'} bytes\nMIME: ${blob?.type || recorder?.mimeType || 'unknown'}\nSampled RMS: ${rms.toFixed(2)} / 128; peak: ${peak} / 128\nSampled level: ${rms ? (20 * Math.log10(rms / 128)).toFixed(1) : '-Infinity'} dBFS\nNear-silent indicator: ${rms < 1 ? 'yes' : 'no'} (diagnostic only; sampled analyser data, not full-file analysis)`;
}
function payload() {
  const recordingBlob = blob;
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read recording.')); reader.onload = () => resolve({ audioBase64: String(reader.result).split(',')[1], mimeType: recordingBlob.type }); reader.readAsDataURL(recordingBlob); });
}
async function operation(kind) {
  const current = generation; busy = true; controls(); if (kind === 'transcribe') $('transcript').textContent = '';
  try { const input = await payload(); if (current !== generation) return;
    const result = await window.microphoneApi[kind](input); if (current !== generation) return;
    if (kind === 'transcribe') { $('transcript').textContent = result.text; status(result.text.length ? 'Transcription succeeded.' : 'Transcription succeeded with an empty transcript.'); }
    else status(result.canceled ? 'Save canceled.' : 'Saved: ' + result.filePath);
  } catch (error) { if (current === generation) status((kind === 'transcribe' ? 'Transcription failed: ' : 'Save failed: ') + error.message); }
  finally { busy = false; controls(); }
}
$('stop').onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
$('cancel').onclick = () => { discard(); status('Canceled. Audio and playback released. An already-sent service request may finish; its result is ignored.'); };
$('save').onclick = () => operation('save'); $('transcribe').onclick = () => operation('transcribe');
window.addEventListener('beforeunload', discard);
