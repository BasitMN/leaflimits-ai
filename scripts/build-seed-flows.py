#!/usr/bin/env python3
"""Build docker/node-red/seed/flows.json from the two exported flows.

The seed is copied into a fresh Node-RED /data volume on first start so the
pipeline works without importing anything by hand. Rebuild it after changing
either export:

    python3 scripts/build-seed-flows.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLOWS = ROOT / "docker" / "node-red" / "flows"
OUT = ROOT / "docker" / "node-red" / "seed" / "flows.json"

# Development-only nodes of the storage export (manual test injection).
TEST_NODE_NAMES = {"Test water temperature", "Create four test measurements"}

merged, seen = [], {}
for name in ("mqtt-validation.json", "influxdb-storage.json"):
    for node in json.loads((FLOWS / name).read_text(encoding="utf-8")):
        if node.get("name") in TEST_NODE_NAMES:
            continue
        if node["id"] in seen:
            if seen[node["id"]] != node:
                sys.exit(f"conflicting definitions for node id {node['id']}")
            continue
        seen[node["id"]] = node
        merged.append(node)

ids = set(seen)
for node in merged:
    for wire_group in node.get("wires", []):
        for target in wire_group:
            if target not in ids:
                sys.exit(f"{node['id']} is wired to missing node {target}")
    if node.get("z") and node["z"] not in ids:
        sys.exit(f"{node['id']} belongs to missing tab {node['z']}")
    if node["type"] in ("mqtt in", "mqtt out") and node.get("broker") not in ids:
        sys.exit(f"{node['id']} uses missing broker {node['broker']}")
    if node["type"] == "tab" and node.get("disabled"):
        sys.exit(f"tab {node.get('label')} is disabled in an export")

OUT.write_text(json.dumps(merged, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: {len(merged)} nodes, "
      f"{sum(n['type'] == 'tab' for n in merged)} tabs")
