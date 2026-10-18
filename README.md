# Working at Height – Multimodal Training Experience

An AI-powered multimodal training platform that combines conversational learning, adaptive assessments, and immersive virtual reality to support competency-based Working-at-Height (NR-35) training.

The platform integrates conversational learning, adaptive interviewing, knowledge assessment, immersive VR training, and AI-assisted reflective debriefing into a single coordinated learning experience.

---

## Why this project?

Traditional working-at-height training often separates theoretical instruction from practical exercises. This project explores how conversational AI, adaptive assessment, and immersive virtual reality can be orchestrated into a multimodal training experience that continuously adapts to learner performance across instructional modalities.

The project was developed as a research platform while remaining modular enough to support future industrial deployment.

---

## Features

- SmartChats conversational learning integration
- Adaptive AI interview
- Adaptive knowledge assessment
- Immersive VR training
- AI-assisted reflective debriefing
- Automatic Microsoft Word report generation
- Local PDF certificate generation (other reports remain Microsoft Word)
- Voice interaction (Speech-to-Text and Text-to-Speech)
- Resume interrupted sessions
- Modular, loosely coupled architecture

---

## System Architecture

The platform consists of three independent subsystems coordinated by the desktop application.

```text
                          Learner
                             │
                             ▼
          ┌────────────────────────────────────┐
          │ Working-at-Height Desktop          │
          │ Adaptive Orchestration Layer       │
          └────────────────────────────────────┘
               │                    ▲
               │ Launch             │ Import Learning
               ▼                    │ Analytics Report
     ┌──────────────────────┐       │
     │ SmartChats            │───────┘
     │ Conversational        │
     │ Learning Platform     │
     └──────────────────────┘

               │
               ▼
  Determine Initial Expertise Level
   (Basic / Intermediate / Expert)
               │
               ▼
       Adaptive AI Interview
               │
      Interview Evaluation
               ▼
 Determine Interview Expertise
   (Basic / Intermediate / Expert)
               │
               ▼
         Adaptive Quiz
               │
        Quiz Evaluation
               ▼
 Determine Recommended
     VR Difficulty
(Basic / Intermediate / Expert)
               │
               ▼
 ┌──────────────────────────────┐
 │ Immersive Virtual Environment│
 └──────────────────────────────┘
               │
      VR Performance Report
               │
               ▼
 AI-Assisted Reflective Debriefing
               │
               ▼
     Certificate Generation


        AI Services
             │
             ▼
   UF NaviGator AI APIs
             │
             ▼
 HiPerGator HPC Infrastructure
             │
             ▼
 LLMs • Speech-to-Text • Text-to-Speech
```

The desktop application functions as the adaptive orchestration layer, coordinating learner progression while intentionally remaining loosely coupled from both the SmartChats platform and the VR application. The current implementation exchanges standardized reports between subsystems, providing a simple integration mechanism today while establishing a clear migration path toward future API-based interoperability.

---

## Artificial Intelligence

The platform leverages the **University of Florida NaviGator AI APIs**, which provide secure access to multiple state-of-the-art AI models hosted on **HiPerGator**, the University of Florida's high-performance computing infrastructure.

Current AI capabilities include:

- Large Language Models (LLMs)
- Speech-to-Text (STT)
- Text-to-Speech (TTS)

These services support:

- Adaptive interviewing
- Automated learner assessment
- VR report summarization
- AI-assisted reflective debriefing
- Natural voice interaction

Because AI capabilities are accessed through the NaviGator service layer, the application remains independent of any specific language model.

---

## Technology Stack

- Electron
- HTML
- CSS
- JavaScript
- Node.js
- Unreal Engine (VR subsystem)
- Microsoft Word document generation
- UF NaviGator AI APIs
- HiPerGator HPC

---
## SmartChats login
- email: johnheights.user@gmail.com
- pass: hackastone
---

## Running the Application

Install dependencies:

```bash
npm install
```

Run the desktop application:

```bash
npm start
```

---

## Building

Create the Windows installer:

```bash
npm run dist:win
```

## Companion VR Application

The immersive virtual reality subsystem is distributed independently from this repository to keep the source code repository lightweight and focused on the desktop orchestration platform.

The latest VR application package can be downloaded from the following Google Drive folder:

**Download:** 
https://drive.google.com/drive/folders/17zMy0JkAAY2SIeM8u1XYScpM7r_Wmt0G?usp=sharing

The current VR application has been tested with:

- Meta Quest 3
- Meta Quest 3S

---

## Repository Structure

```
src/
    Electron application

assets/
    Images and interface resources

data/
    Adaptive interview and quiz datasets

docs/
    Technical documentation
```

---

## Future Work

Planned enhancements include:

- API-based SmartChats integration
- API-based VR integration
- Learning analytics dashboard
- Instructor management portal
- Cloud synchronization
- Additional competency-based training domains

---

## Contributing

Contributions, suggestions, and research collaborations are welcome.

Please open an Issue to discuss significant changes before submitting a Pull Request.

