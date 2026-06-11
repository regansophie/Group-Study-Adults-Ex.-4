# Experiment 5 Adult Online Experiment

Run locally from the `Group Study` folder:

```bash
python3 -m http.server 8765
```

Open:

```text
http://localhost:8765/Experiment%205/github_pages_deploy/index.html?version=1&participant=test
```

If `version` is omitted, the experiment randomly assigns one of the four
counterbalanced PowerPoint versions. This deploy version includes the exposure
slides and only the first test block: the four three-option feature-choice
trials before the dog choices.

DataPipe is included through `jspsych/plugin-pipe.js`. Replace
`DATAPIPE_EXPERIMENT_ID` in `experiment.js` with the Experiment 5 DataPipe ID,
or pass it temporarily in the URL:

```text
?datapipe_id=YOUR_ID
```

The Prolific completion code shown at the end is `CNENXNHJ`.
