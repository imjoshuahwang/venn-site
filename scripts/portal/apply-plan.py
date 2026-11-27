"""Apply a Fall 2026 results plan as DRAFT rows (venn-site #185). Dry run by default; --apply writes.
Usage: python3 scripts/portal/apply-plan.py plan.json [--apply] [--backup peer_matches_backup.json]
plan.json: {cohorts:{slug:[{id,why}]}, pairs:[{ids,why}], nts:[{id,why}], duplicates:[{id,keep_id}]} (application ids).
Never touches approved rows, never deletes anything. Existing draft rows are replaced in place and their letter cleared.
Peer pairs of 2 ids make one peer_matches row; a triad (3 ids) makes all three edges AB, AC, BC (migration 20261126020000_peer_triads.sql
must be applied first: a result may sit in at most two rows, an unordered pair only once).
Old peer_matches with activity (a tap, a rematch, an approved side) are protected and kept; unprotected rows already holding a wanted pair
are kept; the rest are repointed in place (same row id) where no constraint conflicts, else new rows are inserted. Stale rows left over
are reported, never deleted. Reruns converge.
Env via ~/venn: VENN_SUPABASE_SERVICE_ROLE_KEY and the Supabase URL."""
import json, os, sys, urllib.request, collections
sys.path.insert(0, os.path.expanduser("~/venn")); os.chdir(os.path.expanduser("~/venn"))
from venn.__main__ import load_local_env
load_local_env()
from venn.applicants.applications import config
SEASON, COHORT_IDS = "fall-2026", {"aws": 2, "quadron": 1}
url, key = config(write=True)

def call(method, path, body=None):
    req = urllib.request.Request(f"{url}/rest/v1/{path}", method=method, data=None if body is None else json.dumps(body).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation,resolution=merge-duplicates"})
    try: return json.load(urllib.request.urlopen(req, timeout=60)) or []
    except urllib.error.HTTPError as e: sys.exit(f"{method} {path.split('?')[0]} failed: {e.code} {e.read().decode()[:300]}")

def desired(plan):
    want = {}
    for slug, items in plan["cohorts"].items():
        for i in items:
            want[i["id"]] = dict(outcome="cohort", cohort_id=COHORT_IDS[slug], why_matched=i["why"])
    for p in plan["pairs"]:
        for a in p["ids"]:
            want[a] = dict(outcome="peer", cohort_id=None, why_matched=p["why"])
    for i in plan["nts"]:
        want[i["id"]] = dict(outcome="not_this_season", cohort_id=None, why_matched=i["why"])
    return want

def main():
    plan = json.load(open(sys.argv[1])); go = "--apply" in sys.argv
    backup = sys.argv[sys.argv.index("--backup") + 1] if "--backup" in sys.argv else None
    want = desired(plan); dups = {d["id"]: d["keep_id"] for d in plan["duplicates"]}
    assert not set(want) & set(dups), "plan lists an id as both result and duplicate"
    apps = {a["id"] for a in call("GET", "applications?select=id,is_test&is_test=is.false&limit=5000")}
    assert apps == set(want) | set(dups), f"plan covers {len(set(want)|set(dups))} of {len(apps)} applicants"
    res = {r["application_id"]: r for r in call("GET", f"results?select=*&season=eq.{SEASON}&limit=5000")}
    approved = [a for a in list(want) + list(dups) if res.get(a, {}).get("status") == "approved"]
    assert not approved, f"approved rows in plan: {approved}"
    # Non-cohort rows first: the cohort seat-cap trigger counts the rows still holding seats, so they must be freed before cohort rows land.
    rows = [dict(application_id=a, season=SEASON, status="draft", letter=None, **v) for a, v in sorted(want.items(), key=lambda kv: (kv[1]["outcome"] == "cohort", kv[0]))]
    changed = sum(1 for r in rows if a_row(res, r))
    print(f"results to write {len(rows)} ({sum(r['application_id'] in res for r in rows)} replace drafts, {len(rows)-sum(r['application_id'] in res for r in rows)} new, {changed} change outcome/cohort)")
    print("by outcome", dict(collections.Counter((r["outcome"], r["cohort_id"]) for r in rows)))
    dup_rows = [a for a in dups if a in res]
    print(f"duplicates: {len(dups)}, {len(dup_rows)} have a draft row (set to network_waitlist, why_matched marks DUPLICATE, letter cleared, seat freed; never approve them)")
    pairs = [p["ids"] for p in plan["pairs"]]
    edges = [(p[i], p[j], pw["why"]) for p, pw in zip(pairs, plan["pairs"]) for i, j in ((0, 1), (0, 2), (1, 2)) if j < len(p)]
    print(f"peer pairs {len(pairs)}; triads {sum(len(p) == 3 for p in pairs)}; edges {len(edges)}")
    old = call("GET", f"peer_matches?select=*&season=eq.{SEASON}&limit=5000")
    print(f"old peer_matches {len(old)}")
    if not go:
        print("dry run: nothing written"); return
    if backup: json.dump(old, open(backup, "w"))
    for a in dup_rows:
        call("PATCH", f"results?application_id=eq.{a}&season=eq.{SEASON}&status=eq.draft", {"outcome": "network_waitlist", "cohort_id": None, "why_matched": f"DUPLICATE of application {dups[a]}: do not approve", "letter": None})
    rows = [r for r in rows if not same(res.get(r['application_id']), r)]  # reruns skip rows already written (the seat-cap trigger counts a row against itself)
    for i in range(0, len(rows), 100): call("POST", "results?on_conflict=application_id,season", rows[i:i + 100])
    rid = {r["application_id"]: r["id"] for r in call("GET", f"results?select=id,application_id,status&season=eq.{SEASON}&limit=5000")}
    status = {r["id"]: r["status"] for r in call("GET", f"results?select=id,status&season=eq.{SEASON}&limit=5000")}
    new = {frozenset((rid[a], rid[b])): (rid[a], rid[b], w) for a, b, w in edges}
    keep, recycle, protected = [], [], []
    for m in old:
        pair = frozenset((m["result_a"], m["result_b"]))
        live = m["a_down_at"] or m["b_down_at"] or m["rematches"] or "approved" in (status.get(m["result_a"]), status.get(m["result_b"]))
        (protected if live else keep if pair in new else recycle).append(m)
    for m in keep: call("PATCH", f"peer_matches?id=eq.{m['id']}", {"why_matched": new[frozenset((m['result_a'], m['result_b']))][2]})
    pair_of = lambda a, b: frozenset((a, b))
    cur = {m["id"]: (m["result_a"], m["result_b"]) for m in old}  # every row now in the table: id -> its two results
    seq = 0
    def ok(e, ignore=None):  # would edge e fit: unordered pair unused and each result in at most two other rows
        rows = [v for i, v in cur.items() if i != ignore]
        return all(pair_of(*v) != pair_of(e[0], e[1]) for v in rows) and all(sum(x in v for v in rows) < 2 for x in e[:2])
    stale = {m["id"] for m in recycle}
    todo = [e for k, e in new.items() if k not in {pair_of(m["result_a"], m["result_b"]) for m in keep}]
    placed = inserted = 0
    left = list(todo)
    while left:
        prog = False
        for e in list(left):
            mine = sorted(stale, key=lambda i: -len(set(cur[i]) & set(e[:2])))  # prefer a stale row that already holds its results
            row = next((i for i in mine if ok(e, i)), None)
            if row is not None:
                call("PATCH", f"peer_matches?id=eq.{row}", {"result_a": e[0], "result_b": e[1], "why_matched": e[2], "a_down_at": None, "b_down_at": None, "rematches": 0})
                cur[row] = e[:2]; stale.discard(row); placed += 1
            elif ok(e):
                call("POST", "peer_matches", [{"season": SEASON, "result_a": e[0], "result_b": e[1], "why_matched": e[2]}])
                seq += 1; cur[f"new{seq}"] = e[:2]; inserted += 1
            else: continue
            left.remove(e); prog = True
        if not prog: break  # the rest are blocked by protected rows or a result already in two rows
    print(f"peer_matches: kept {len(keep)}, repointed {placed}, inserted {inserted}, protected stale {len(protected)}, edges blocked (protected or full) {len(left)}, old rows left stale {len(stale)}")

def same(o, r):
    return bool(o) and not o.get('letter') and o['status'] == 'draft' and all(o[k] == r[k] for k in ('outcome', 'cohort_id', 'why_matched'))

def a_row(res, r):
    o = res.get(r["application_id"])
    return o is None or (o["outcome"], o["cohort_id"]) != (r["outcome"], r["cohort_id"])

main()
