# TaskOrbit demo video — STAGING ONLY

**This is a recording of the STAGING deployment
(`https://taskorbit-gamma.vercel.app`). Production does not exist yet —
do not present this as a production demo.**

- File: `taskorbit-demo.webm` — 514.08 s (8 min 34 s), 45,679,888 bytes
  (VP9, 1280×720, 25 fps, no audio). Recorded 2026-11-12/13 with
  Playwright video capture (`~/workspace/e2e-tunnel/pw-staging-video.config.ts`,
  `TASKORBIT_VIDEO=1`); segments concatenated losslessly with ffmpeg.
- All three journeys passed in the recording run (6.4 min total):
  Journey A 1.1 min, Journey B 2.4 min, Journey C 2.9 min.

## Segments (in order)

| # | Time | Journey | What it shows |
|---|---|---|---|
| 1 | 0:00–1:07 (67 s) | A — Manager: homepage to analytics | New manager signs up, creates a workspace + project + task, comments, views analytics |
| 2 | 1:07–3:28 (141 s) | B — Manager side | Manager invites a new developer (Team page), creates the project and assigns the task |
| 3 | 3:28–5:41 (133 s) | B — Developer side | Developer follows the invite link, signs up, accepts, opens the assigned task, adds 3 subtasks, completes 2 (67%), comments, completes the third and the parent |
| 4 | 5:41–8:34 (172 s) | C — Deadlines | Neutral / overdue / on-time / late / no-deadline chips; reopening a completed task loses the green "on time" chip |

## Notes

- Longer than the 3–5 min target because Journey B is shown from both
  sides (manager + developer are parallel sessions); kept whole per the
  Part 4 spec rather than trimmed.
- The developer segment opens with ~20 s of blank white: that browser
  context is created before the manager has sent the invite, so the tab
  is empty until the invite link exists. That is the real recording, not
  a broken file.
- All data is demo/test data (accounts like
  `journey-a-manager-…@testorbit.dev`, "Journey A/B/C …" workspaces and
  tasks). No real personal data appears.
- The staging build in the video includes the Part 4 accessibility
  fixes, batch 1 (darker avatar colours, indigo "Manager" badge, rose
  notification badge). The notification-bell badge/label fix (batch 2)
  was not yet deployed when this was recorded.
