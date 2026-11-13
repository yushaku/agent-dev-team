import json
import os

from .common import COPILOT_TYPES, finish_first, ts_of

def read_yaml_flat(path):
    """workspace.yaml of a Copilot session: flat `key: value` lines only."""
    out = {}
    try:
        for line in open(path, encoding="utf-8", errors="replace"):
            if ":" in line and not line.startswith((" ", "-", "#")):
                k, v = line.split(":", 1)
                out[k.strip()] = v.strip().strip("'\"")
    except OSError:
        pass
    return out

def parse_copilot(path):
    """GitHub Copilot CLI: one call = one session.usage_record (unique sourceSessionId + sequence).

    usage.inputTokens already includes cacheReadTokens and cacheWriteTokens, so fresh input is
    the difference (matches accountingSnapshot.tokenDetails.input). Premium requests: usage.cost
    counts only on user initiated calls; agent follow ups inside the same turn are free.
    accountingSnapshot in usage_checkpoint / shutdown is cumulative for the session (it survives
    resume), so only the last one is kept, as a cross check of the per call sum.
    """
    ws = read_yaml_flat(os.path.join(os.path.dirname(path), "workspace.yaml"))
    s = {"agent": "copilot", "cwd": ws.get("cwd"), "branch": ws.get("branch"), "start": ts_of(ws.get("created_at")),
         "end": None, "first": None, "id": ws.get("id") or os.path.basename(os.path.dirname(path)),
         "originator": ws.get("client_name"), "skills": [], "subagent": False, "limits": [], "quota": [],
         "snapshot": None}
    calls = {}
    last_q = {}
    for line in open(path, encoding="utf-8", errors="replace"):
        head = line[:48]
        if not any(t in head for t in COPILOT_TYPES):
            continue
        try:
            d = json.loads(line)
        except ValueError:
            continue
        t = d.get("type")
        p = d.get("data") or {}
        ts = ts_of(d.get("timestamp"))
        if ts:
            s["start"] = ts if s["start"] is None else min(s["start"], ts)
            s["end"] = ts if s["end"] is None else max(s["end"], ts)
        if t in ("session.start", "session.resume"):
            ctx = p.get("context") or {}
            s["cwd"] = s["cwd"] or ctx.get("cwd")
            s["branch"] = s["branch"] or ctx.get("branch")
        elif t == "user.message":
            txt = p.get("content") or ""
            if s["first"] is None and txt and not txt.lstrip().startswith("<"):
                s["first"] = txt
        elif t == "session.usage_record":
            u = p.get("usage") or {}
            acc = u.get("accounting") or {}
            inp = u.get("inputTokens") or 0
            cr = u.get("cacheReadTokens") or 0
            cw = u.get("cacheWriteTokens") or 0
            prem = (u.get("cost") or 0) if u.get("initiator") == "user" else 0
            key = "cp:%s:%s" % (acc.get("sourceSessionId") or s["id"], acc.get("sequence") or d.get("id"))
            calls[key] = [ts, u.get("model") or "?", u.get("reasoningEffort"), max(inp - cr - cw, 0), cr, cw,
                          u.get("outputTokens") or 0, u.get("reasoningTokens") or 0, key, prem]
        elif t in ("session.usage_checkpoint", "session.shutdown"):
            a = p.get("accountingSnapshot") or {}
            td = a.get("tokenDetails") or {}
            tc = lambda k: (td.get(k) or {}).get("tokenCount") or 0
            s["snapshot"] = {"ts": ts, "premium": a.get("totalPremiumRequestCost") or 0, "fin": tc("input"),
                             "cr": tc("cache_read"), "cw": tc("cache_write"), "out": tc("output"),
                             "requests": sum(((m.get("requests") or {}).get("count") or 0)
                                             for m in (a.get("modelMetrics") or {}).values())}
        elif t == "model.model_call_success":
            for bucket, q in (p.get("quotaSnapshots") or {}).items():
                smp = [ts, bucket, q.get("entitlementRequests"), q.get("usedRequests"), q.get("remainingPercentage"),
                       bool(q.get("isUnlimitedEntitlement")), bool(q.get("overageAllowedWithExhaustedQuota")),
                       q.get("resetDate")]
                if last_q.get(bucket) != smp[2:]:
                    last_q[bucket] = smp[2:]
                    s["quota"].append(smp)
                s["quota_seen"] = ts
        elif t in ("skill.invoked", "skill.invoked_ref"):
            if p.get("name"):
                s["skills"].append([p["name"], ts])
    s["calls"] = sorted(calls.values(), key=lambda c: c[0] or 0)
    return finish_first(s)
