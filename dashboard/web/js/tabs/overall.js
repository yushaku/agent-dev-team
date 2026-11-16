import * as C from "../lib/charts.js";
import { $ } from "../lib/charts.js";
import { runDetail, renderRunTimeline } from "./runs.js";

const text = v => String(v == null ? "" : v).replace(/[–—]/g, "-");

export function renderOverall(S) {
  const d = C.state.data;
  if (!d) return;
  const runs = d.orca.runs || [], ids = new Set(S.map(s => s.run_id).filter(Boolean));
  const run = runs.find(r => r.id === C.state.runF);
  const timelineRun = run || runs.filter(r => ids.has(r.id)).sort((a, b) => b.created - a.created)[0];
  $("#overall-timeline").hidden = !timelineRun;
  if (timelineRun) {
    const r = { ...timelineRun, objective: text(timelineRun.objective), tasks: timelineRun.tasks.map(t => ({ ...t, title: text(t.title) })) };
    renderRunTimeline([runDetail(r)], r.id, "", "#overall-run-list", "overall-g-");
  }
}
