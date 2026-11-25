import * as C from "../lib/charts.js";
import { $ } from "../lib/charts.js";
import { runDetail, renderRunTimeline } from "./runs.js";

const text = (v) => String(v == null ? "" : v).replace(/[–—]/g, "-");

export function renderOverall(S) {
  const d = C.state.data;
  if (!d) return;
  const runs = d.orca.runs || [],
    ids = new Set(S.map((s) => s.run_id).filter(Boolean));
  const timelineRun = ids.size === 1 ? runs.find((r) => r.id === C.state.runF && ids.has(r.id)) : null;
  $("#overall-timeline").hidden = !timelineRun;
  if (!timelineRun) {
    $("#overall-run-list").innerHTML = "";
    return;
  }
  const r = { ...timelineRun, objective: text(timelineRun.objective), tasks: timelineRun.tasks.map((t) => ({ ...t, title: text(t.title) })) };
  renderRunTimeline([runDetail(r)], r.id, "", "#overall-run-list", "overall-g-");
}
