// One trusted presentation template for the screen preview and local PDF.
(() => {
  function render(root, data) {
    const node = (tag, text, className, id) => {
      const el = document.createElement(tag);
      el.textContent = text;
      if (className) el.className = className;
      if (id) el.id = id;
      return el;
    };
    root.replaceChildren();
    root.classList.add('certificateInner');
    root.classList.toggle('longName', data.name.length > 80);
    root.append(node('p', 'Certificate of Completion', 'certSmall'),
      node('h3', 'Working at Height Learning Track'),
      node('p', 'NR-35 Weather and Safety Focus', 'certSub'),
      node('div', '', 'certDivider'), node('p', 'This certifies that', 'certStatement'),
      node('p', data.name, 'certName', 'certStudentName'),
      node('p', 'has completed the required training experience activities: SmartChats, adaptive interview, adaptive quiz, VR experience review, and guided debriefing.', 'certStatement'));
    const readiness = node('div', '', 'certificateReadinessBlock');
    readiness.append(node('p', 'Overall Readiness Classification'), node('div', data.readiness, 'readinessBadge', 'certOverallBadge'));
    root.append(readiness, node('p', data.qualification, 'certQualification'),
      node('p', 'SmartChats · Interview · Quiz · VR · Debriefing', 'certActivities'));
    // Phase 4: weather probe before the VR x after the review quiz, only when the probe was taken.
    if (data.weather) root.append(node('p', data.weather, 'certWeather', 'certWeatherCheck'));
    root.append(node('p', `Completion date: ${data.date}`, 'certCompletionDate'),
      node('p', 'WORKATHEIGHTS / TRAINING EXPERIENCE RECORD', 'certRecord'));
  }
  window.wahCertificate = Object.freeze({ render });
})();
