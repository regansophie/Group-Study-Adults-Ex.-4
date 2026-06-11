const MANIFEST_PATHS = [
  "jspsych_stimuli/manifest.json",
  "../jspsych_stimuli/manifest.json",
];

const DATAPIPE_EXPERIMENT_ID = "7QkLhnSRWJQw";
const PROLIFIC_COMPLETION_CODE = "CNENXNHJ";
const CONSENT_IMAGES = [
  "consent form/consentFormPt1.jpg",
  "consent form/consentFormPt2.jpg",
  "consent form/consentFormPt3.jpg",
  "consent form/consentFormPt4.jpg",
  "consent form/consentFormPt5.jpg",
];

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeVersion(value, maxVersion) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxVersion ? parsed : null;
}

function makeParticipantId() {
  const prolificPid = getUrlParam("PROLIFIC_PID");
  const participant = getUrlParam("participant") || getUrlParam("participant_id") || getUrlParam("id");
  return prolificPid || participant || `anon_${Date.now()}_${randomInteger(1000, 9999)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function makeProlificIdTrial(jsPsych, initialParticipantId) {
  const prefill = initialParticipantId.startsWith("anon_") ? "" : initialParticipantId;
  return {
    type: jsPsychSurveyHtmlForm,
    preamble: `
      <div class="id-entry">
        <h1>Prolific ID</h1>
        <p>Please enter your Prolific ID before beginning the study.</p>
      </div>
    `,
    html: `
      <div class="id-entry">
        <label for="prolific-id">Prolific ID</label>
        <input id="prolific-id" name="prolific_id" type="text" value="${escapeHtml(prefill)}" required />
      </div>
    `,
    autofocus: "prolific-id",
    button_label: "Continue",
    data: { phase: "prolific_id_entry" },
    on_finish: (data) => {
      const enteredId = String(data.response.prolific_id || "").trim();
      data.entered_prolific_id = enteredId;
      data.participant_id = enteredId;
      jsPsych.data.addProperties({
        participant_id: enteredId,
        prolific_pid: enteredId,
      });
    },
  };
}

function imagePathFromManifest(path, manifestPath) {
  const relativePath = path
    .replace(/^Experiment 5\/jspsych_stimuli\//, "")
    .replace(/^jspsych_stimuli\//, "");
  const manifestBase = manifestPath.replace(/manifest\.json$/, "");
  return `${manifestBase}${relativePath}`;
}

function makeSlideStimulus(imagePath) {
  return `<div class="stage"><img class="slide-image" src="${imagePath}" alt="" /></div>`;
}

function makeConsentStimulus(imagePath, prompt = "") {
  return `
    <div class="stage">
      <img class="consent-image" src="${imagePath}" alt="Consent form page" />
      ${prompt}
    </div>
  `;
}

function makeCompletionScreen(savedToDataPipe) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="stage">
        <h1>Thank you.</h1>
        ${savedToDataPipe ? "<p>Your responses have been saved.</p>" : "<p>Your responses have been recorded.</p>"}
        <p>Your Prolific completion code is:</p>
        <div class="completion-code">${PROLIFIC_COMPLETION_CODE}</div>
      </div>
    `,
    choices: [],
    trial_duration: null,
  };
}

async function loadManifest() {
  for (const path of MANIFEST_PATHS) {
    const response = await fetch(path);
    if (response.ok) {
      return { manifest: await response.json(), manifestPath: path };
    }
  }
  throw new Error(`Could not load a stimulus manifest. Tried: ${MANIFEST_PATHS.join(", ")}`);
}

function groupLevelForGroup(group, version) {
  if (group === version.basic_level_group) return "basic";
  if (group === version.subordinate_level_group) return "subordinate";
  return null;
}

function buttonClassForChoice(testType, choice, choiceLevel) {
  if (testType === "feature_choice") {
    if (choiceLevel === "1_feature") return "choice-one-feature";
    if (choiceLevel === "2_features") return "choice-two-features";
    return "choice-zero-feature";
  }
  if (testType === "dog_group_choice") {
    return choice === "top" ? "choice-basic" : "choice-subordinate";
  }
  return "";
}

function choicesForSlide(slide) {
  if (slide.test_type === "new_dog_teacher_open_image") {
    return ["Continue"];
  }
  return slide.choices.map((choice) => String(choice).charAt(0).toUpperCase() + String(choice).slice(1));
}

function choiceLevelForResponse(slide, rawChoice) {
  const choice = String(rawChoice).toLowerCase();
  if (slide.test_type === "feature_choice") {
    return slide.answer_levels[rawChoice] || slide.answer_levels[choice] || null;
  }
  if (slide.test_type === "dog_group_choice") {
    return choice === "top" ? "basic" : "subordinate";
  }
  if (slide.test_type === "judgment_choice") {
    return slide.choice_label_levels[slide.choices.indexOf(choice)] || null;
  }
  return "continue";
}

function selectedGroupForResponse(slide, rawChoice, version) {
  if (slide.test_type !== "dog_group_choice") return null;
  const selectedLevel = choiceLevelForResponse(slide, rawChoice);
  if (selectedLevel === "basic") return version.basic_level_group;
  if (selectedLevel === "subordinate") return version.subordinate_level_group;
  return null;
}

function makeTestButtonHtml(slide) {
  return slide.choices.map((choice, index) => {
    const display = choicesForSlide(slide)[index];
    const level = slide.choice_label_levels[index];
    const className = buttonClassForChoice(slide.test_type, choice, level);
    return `<button class="jspsych-btn ${className}">${display}</button>`;
  });
}

function buildTimeline(jsPsych, manifest, manifestPath, assignedVersion, participantId) {
  const version = manifest.versions.find((entry) => entry.version === assignedVersion);
  if (!version) throw new Error(`Missing counterbalance version ${assignedVersion}`);

  const allImages = CONSENT_IMAGES.concat(
    version.exposure.concat(version.test).map((slide) => imagePathFromManifest(slide.image, manifestPath))
  );
  const dataPipeExperimentId = getUrlParam("datapipe_id") || DATAPIPE_EXPERIMENT_ID;
  const shouldSaveToDataPipe = Boolean(dataPipeExperimentId) && !dataPipeExperimentId.startsWith("REPLACE_WITH");
  const filename = `experiment5_${participantId}_v${String(assignedVersion).padStart(2, "0")}_${Date.now()}_${randomInteger(1000, 9999)}.csv`;
  const timeline = [];

  jsPsych.data.addProperties({
    experiment: "experiment_5_adult_online",
    participant_id: participantId,
    counterbalance_version: assignedVersion,
    datapipe_experiment_id: dataPipeExperimentId || null,
    source_pptx: version.source_pptx,
    basic_level_group: version.basic_level_group,
    subordinate_level_group: version.subordinate_level_group,
    exposure_first_group: version.exposure_first_group,
    exposure_first_label_level: version.exposure_first_label_level,
    test_first_group: version.test_first_group,
    test_first_label_level: version.test_first_label_level,
    prolific_pid: getUrlParam("PROLIFIC_PID"),
    study_id: getUrlParam("STUDY_ID"),
    session_id: getUrlParam("SESSION_ID"),
  });

  timeline.push({
    type: jsPsychPreload,
    images: allImages,
    message: "Loading the experiment...",
    show_progress_bar: true,
    show_detailed_errors: true,
  });

  timeline.push(makeProlificIdTrial(jsPsych, participantId));

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="stage">
        <h1>Welcome</h1>
        <p>Next, you will see a consent form. Please read the information provided and decide whether or not you consent to participating in the study.</p>
      </div>
    `,
    choices: ["Continue"],
    data: { phase: "instructions" },
  });

  CONSENT_IMAGES.slice(0, 4).forEach((image, index) => {
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: makeConsentStimulus(image),
      choices: ["Next"],
      data: {
        phase: "consent",
        consent_page: index + 1,
        image,
      },
    });
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: makeConsentStimulus(CONSENT_IMAGES[4], "<p>Do you consent to participating in this experiment?</p>"),
    choices: ["I consent", "I do not consent"],
    data: {
      phase: "consent",
      consent_page: 5,
      image: CONSENT_IMAGES[4],
    },
    on_finish: (data) => {
      data.consent_response = data.response === 0 ? "I consent" : "I do not consent";
      data.consented = data.response === 0;
      if (!data.consented) {
        jsPsych.endExperiment("You did not consent to participate. The experiment is now complete.");
      }
    },
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="stage">
        <h1>Instructions</h1>
        <p>You will now see a series of slides. Please read each slide carefully.</p>
      </div>
    `,
    choices: ["Start"],
    data: { phase: "post_consent_instructions" },
  });

  version.exposure.forEach((slide, index) => {
    const image = imagePathFromManifest(slide.image, manifestPath);
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: makeSlideStimulus(image),
      choices: ["Next"],
      data: {
        phase: "exposure",
        exposure_trial_number: index + 1,
        slide_number: slide.slide_number,
        image,
        slide_group: slide.slide_group,
        slide_label_level: slide.slide_label_level,
        slide_group_label_level: slide.slide_label_level,
      },
    });
  });

  timeline.push({
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="stage">
        <h1>Questions</h1>
        <p>Now you will answer a few questions. Please choose the response that seems best.</p>
      </div>
    `,
    choices: ["Continue"],
    data: { phase: "test_instructions" },
  });

  version.test.forEach((slide) => {
    const image = imagePathFromManifest(slide.image, manifestPath);
    const choices = choicesForSlide(slide);
    timeline.push({
      type: jsPsychHtmlButtonResponse,
      stimulus: makeSlideStimulus(image),
      choices,
      button_html: makeTestButtonHtml(slide),
      data: {
        phase: "test",
        slide_number: slide.slide_number,
        test_trial_number: slide.test_trial_number,
        test_type: slide.test_type,
        item: slide.item || null,
        judgment_type: slide.judgment_type || null,
        target_group: slide.target_group,
        prompt_group: slide.prompt_group,
        target_label_level: slide.target_label_level,
        choices: slide.choices,
        choice_label_levels: slide.choice_label_levels,
        image,
      },
      on_finish: (data) => {
        const rawChoice = slide.choices[data.response];
        const selectedLevel = choiceLevelForResponse(slide, rawChoice);
        data.selected_label = rawChoice;
        data.selected_group = selectedGroupForResponse(slide, rawChoice, version);
        data.selected_label_level = selectedLevel;
        data.selected_basic_level_label = selectedLevel === "basic";
        data.selected_subordinate_level_label = selectedLevel === "subordinate";
        data.selected_group_consistent = data.target_label_level ? selectedLevel === data.target_label_level : null;
        data.response_was_basic = selectedLevel === "basic";
        data.response_was_subordinate = selectedLevel === "subordinate";
        data.is_pragmatic = slide.test_type === "feature_choice" ? selectedLevel === "1_feature" : null;
      },
    });
  });

  if (shouldSaveToDataPipe) {
    timeline.push({
      type: jsPsychPipe,
      action: "save",
      experiment_id: dataPipeExperimentId,
      filename,
      data_string: () => jsPsych.data.get().csv(),
      data: {
        phase: "datapipe_save",
      },
    });
  }

  timeline.push(makeCompletionScreen(shouldSaveToDataPipe));

  return timeline;
}

function showError(error) {
  document.body.innerHTML = `
    <div class="error-message">
      <h1>Experiment could not start</h1>
      <p>${escapeHtml(error.message)}</p>
      <p>If you opened this file directly, run it from a local web server so the manifest can load.</p>
    </div>
  `;
}

async function startExperiment() {
  try {
    const { manifest, manifestPath } = await loadManifest();
    const requestedVersion = normalizeVersion(getUrlParam("version"), manifest.counterbalanced_versions || manifest.versions.length);
    const assignedVersion = requestedVersion || randomInteger(1, manifest.counterbalanced_versions || manifest.versions.length);
    const participantId = makeParticipantId();
    const jsPsych = initJsPsych({
      show_progress_bar: true,
      auto_update_progress_bar: true,
      on_finish: () => {},
    });
    const timeline = buildTimeline(jsPsych, manifest, manifestPath, assignedVersion, participantId);
    jsPsych.run(timeline);
  } catch (error) {
    showError(error);
  }
}

startExperiment();
