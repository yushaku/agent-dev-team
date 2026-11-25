import * as C from "../lib/charts.js";
import { fmt, widthOf, fig, hBars } from "../lib/charts.js";

export function renderRtkCommands() {
  const d = C.state.data.rtk;
  if (!d?.available) return fig("#c-rtk-cmd", { title: "RTK tool save token", body: "", empty: "Không có dữ liệu RTK." });
  const byCmd = d.by_cmd || [];
  const W = widthOf("#c-rtk-cmd");
  fig("#c-rtk-cmd", {
    title: "RTK tool save token",
    body: byCmd.length
      ? hBars({
          W,
          LW: 240,
          rowH: 24,
          rows: byCmd.map((x) => ({
            label: x.cmd,
            full: x.cmd,
            segs: [{ v: x.saved, color: "var(--green)", name: "Tiết kiệm" }],
            right: [{ t: fmt(x.saved) }, { t: x.pct + "%", color: "var(--subtext0)" }],
            tip: [x.cmd, x.n + " lệnh", "Tiết kiệm " + fmt(x.saved) + " (" + x.pct + "%)"],
          })),
          xTitle: "Token tiết kiệm",
          aria: "Thanh ngang token tiết kiệm theo lệnh",
        })
      : "",
    caption: "15 lệnh RTK tiết kiệm nhiều token nhất.",
  });
}
