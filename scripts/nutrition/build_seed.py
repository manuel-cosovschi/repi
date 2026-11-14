#!/usr/bin/env python3
"""Build seed/foods.json from USDA FoodData Central SR Legacy CSVs (CC0).

Usage: python3 -I build_seed.py <SR_LEGACY_CSV_DIR> <OUT_DIR>
Reads CSVs as data only. Writes foods.json and checks.json (consumed by REPORT.md).
"""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from foods_map import FOODS  # noqa: E402
from portions_es import contextualize, translate  # noqa: E402

SRC, OUT = sys.argv[1], sys.argv[2]
CATEGORIES = ["carnes", "aves", "pescados", "huevos", "lacteos", "cereales", "panificados", "pastas",
              "legumbres", "verduras", "frutas", "frutos-secos", "aceites-grasas", "bebidas",
              "dulces-snacks", "preparaciones", "otros"]
NUT = {"energyKcal": "1008", "proteinG": "1003", "fatG": "1004", "carbsG": "1005", "fiberG": "1079",
       "satFatG": "1258", "sodiumMg": "1093"}
SUGARS = ("2000", "1063")
ALCOHOL = "1018"
MAX_PORTIONS = 8


def num(s):
    v = float(s)
    return int(v) if v == int(v) else v


def rd(name):
    with open(os.path.join(SRC, name), encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


ids = {str(f[5]) for f in FOODS}
desc = {r["fdc_id"]: r["description"] for r in rd("food.csv") if r["fdc_id"] in ids}
nut = defaultdict(dict)
wanted = set(NUT.values()) | set(SUGARS) | {ALCOHOL}
for r in rd("food_nutrient.csv"):
    if r["fdc_id"] in ids and r["nutrient_id"] in wanted:
        nut[r["fdc_id"]][r["nutrient_id"]] = r["amount"]
conv = {}
for r in rd("food_nutrient_conversion_factor.csv"):
    if r["fdc_id"] in ids:
        conv[r["id"]] = r["fdc_id"]
cal = {}
for r in rd("food_calorie_conversion_factor.csv"):
    if r["food_nutrient_conversion_factor_id"] in conv:
        cal[conv[r["food_nutrient_conversion_factor_id"]]] = tuple(
            float(r[x]) if r[x] else None for x in ("protein_value", "fat_value", "carbohydrate_value"))
portions_raw = defaultdict(list)
for r in rd("food_portion.csv"):
    if r["fdc_id"] in ids:
        portions_raw[r["fdc_id"]].append(r)

foods, checks = [], {"atwater": [], "portions_dropped": 0, "portions_kept": 0, "errors": []}
for slug, name, aliases, cat, state, fdc, match, note in FOODS:
    k = str(fdc)
    if k not in desc:
        checks["errors"].append(f"{slug}: fdcId {fdc} not in SR Legacy food.csv")
        continue
    n = nut[k]
    per = {}
    for field in ["energyKcal", "proteinG", "carbsG", "fatG", "fiberG"]:
        per[field] = num(n[NUT[field]]) if NUT[field] in n else None
    sug = next((n[s] for s in SUGARS if s in n), None)
    per["sugarsG"] = num(sug) if sug is not None else None
    for field in ["satFatG", "sodiumMg"]:
        per[field] = num(n[NUT[field]]) if NUT[field] in n else None

    # portions: only rows from food_portion.csv for this fdcId, Spanish label, grams untouched
    ports, seen = [], set()
    for r in sorted(portions_raw[k], key=lambda r: int(r["seq_num"] or 0)):
        label = translate(r["amount"], r["modifier"])
        usda = f'{num(r["amount"])} {r["modifier"]}'.strip()
        if label is not None:
            label = contextualize(label, slug, cat, usda, r["amount"])
        if label is None or label in seen or len(ports) >= MAX_PORTIONS:
            checks["portions_dropped"] += 1
            continue
        seen.add(label)
        ports.append({"label": label, "grams": num(r["gram_weight"]), "usda": usda})
    checks["portions_kept"] += len(ports)

    # Atwater check
    e, p, c, f = per["energyKcal"], per["proteinG"] or 0, per["carbsG"] or 0, per["fatG"] or 0
    at = 4 * p + 4 * c + 9 * f
    alc = float(n.get(ALCOHOL, 0) or 0)
    status, dev = "ok", None
    notes = [note] if note else []
    if e is None:
        status = "missing-energy"
    elif e < 20 and abs(e - at) <= 5:
        status = "ok-low-energy"
        dev = (at - e)
    else:
        dev = (at - e) / e if e else None
        if dev is not None and abs(dev) > 0.20:
            at2 = at + 7 * alc
            if alc > 0 and abs((at2 - e) / e) <= 0.20:
                status = "explained-alcohol"
                notes.append(f"La energía incluye el alcohol ({alc:g} g/100 g".replace(".", ",") + f", ~7 kcal/g), que la fórmula 4-4-9 no cuenta.")
            else:
                fp, ff, fc = cal.get(k, (None, None, None))
                spec = (fp * p + ff * f + fc * c) if None not in (fp, ff, fc) else None
                if spec is not None and abs((spec - e) / e) <= 0.20:
                    status = "explained-usda-factors"
                    fmt = lambda x: f"{x:g}".replace(".", ",")
                    notes.append(f"USDA calcula la energía con factores específicos de este alimento (proteína {fmt(fp)}, grasa {fmt(ff)}, "
                                 f"carbohidratos {fmt(fc)} kcal/g; los carbohidratos por diferencia incluyen fibra"
                                 f"{' y ácidos orgánicos' if slug.startswith('limon') else ''}). Con 4-4-9 daría {at:.0f} kcal; se mantiene el valor USDA.")
                else:
                    status = "UNEXPLAINED"
    checks["atwater"].append({"slug": slug, "fdcId": fdc, "energyKcal": e, "atwater449": round(at, 1),
                              "alcoholG": alc or None, "dev": dev, "status": status,
                              "usdaFactors": cal.get(k)})
    entry = {"slug": slug, "name": name, "aliases": list(dict.fromkeys(a.lower() for a in aliases)),
             "category": cat, "state": state, "fdcId": fdc, "usdaDescription": desc[k],
             "per100g": per, "portions": ports}
    if notes:
        entry["note"] = " ".join(notes)
    entry["match"] = match
    foods.append(entry)

# structural checks
slugs = Counter(f["slug"] for f in foods)
fdcs = Counter(f["fdcId"] for f in foods)
checks["dup_slugs"] = [s for s, c in slugs.items() if c > 1]
checks["dup_fdc"] = [s for s, c in fdcs.items() if c > 1]
checks["bad_category"] = [f["slug"] for f in foods if f["category"] not in CATEGORIES]
checks["bad_state"] = [f["slug"] for f in foods if f["state"] not in ("raw", "cooked", "na")]
checks["null_energy"] = [f["slug"] for f in foods if f["per100g"]["energyKcal"] is None]
checks["count"] = len(foods)

with open(os.path.join(OUT, "foods.json"), "w", encoding="utf-8") as fh:
    json.dump(foods, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
with open(os.path.join(OUT, "checks.json"), "w", encoding="utf-8") as fh:
    json.dump(checks, fh, ensure_ascii=False, indent=2)
print(json.dumps({k: v for k, v in checks.items() if k != "atwater"}, ensure_ascii=False))
print("atwater:", Counter(a["status"] for a in checks["atwater"]))
for a in checks["atwater"]:
    if a["status"] not in ("ok", "ok-low-energy"):
        print("  ", a)
