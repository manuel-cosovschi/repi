#!/usr/bin/env python3
"""Independent quality checks for seed/foods.json against the SR Legacy CSVs; writes REPORT.md.

Usage: python3 -I check_seed.py <SR_LEGACY_CSV_DIR> <SEED_DIR>
Exit code 1 if any hard check fails.
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

SRC, SEED = sys.argv[1], sys.argv[2]
foods = json.load(open(os.path.join(SEED, "foods.json"), encoding="utf-8"))
CATS = ["carnes", "aves", "pescados", "huevos", "lacteos", "cereales", "panificados", "pastas", "legumbres",
        "verduras", "frutas", "frutos-secos", "aceites-grasas", "bebidas", "dulces-snacks", "preparaciones", "otros"]
NUT = {"energyKcal": ["1008"], "proteinG": ["1003"], "fatG": ["1004"], "carbsG": ["1005"], "fiberG": ["1079"],
       "sugarsG": ["2000", "1063"], "satFatG": ["1258"], "sodiumMg": ["1093"]}
# raw/cooked (or raw/cooked variants) that must both be present
PAIRS = [
    ("pollo-pechuga-cruda", "pollo-pechuga-plancha"), ("pollo-pechuga-cruda", "pollo-pechuga-asada"),
    ("pollo-muslo-crudo", "pollo-muslo-asado"), ("pollo-muslo-con-piel-crudo", "pollo-muslo-con-piel-asado"),
    ("pollo-entero-con-piel-crudo", "pollo-entero-con-piel-asado"), ("pollo-picado-crudo", "pollo-picado-cocido"),
    ("carne-picada-comun-cruda", "carne-picada-comun-cocida"), ("carne-picada-magra-cruda", "carne-picada-magra-cocida"),
    ("lomo-vacuno-crudo", "lomo-vacuno-cocido"), ("bife-de-chorizo-crudo", "bife-de-chorizo-cocido"),
    ("nalga-cruda", "nalga-cocida"), ("peceto-crudo", "peceto-cocido"), ("vacio-crudo", "vacio-cocido"),
    ("asado-de-tira-crudo", "asado-de-tira-cocido"), ("cerdo-lomo-crudo", "cerdo-lomo-asado"),
    ("cerdo-solomillo-crudo", "cerdo-solomillo-asado"), ("bondiola-cruda", "bondiola-cocida"),
    ("merluza-cruda", "merluza-cocida"), ("salmon-crudo", "salmon-cocido"), ("tilapia-cruda", "tilapia-cocida"),
    ("langostinos-crudos", "langostinos-cocidos"), ("huevo-entero-crudo", "huevo-duro"),
    ("huevo-entero-crudo", "huevo-revuelto"), ("milanesa-de-pollo-cruda", "milanesa-de-pollo-cocida"),
    ("arroz-blanco-crudo", "arroz-blanco-cocido"), ("arroz-integral-crudo", "arroz-integral-cocido"),
    ("avena-cruda", "avena-cocida"), ("fideos-secos-crudos", "fideos-secos-cocidos"),
    ("fideos-integrales-crudos", "fideos-integrales-cocidos"), ("pasta-fresca-cruda", "pasta-fresca-cocida"),
    ("polenta-cruda", "polenta-cocida"), ("lentejas-crudas", "lentejas-cocidas"),
    ("garbanzos-crudos", "garbanzos-cocidos"), ("porotos-negros-crudos", "porotos-negros-cocidos"),
    ("porotos-blancos-crudos", "porotos-blancos-cocidos"), ("arvejas-crudas", "arvejas-cocidas"),
    ("soja-cruda", "soja-cocida"), ("papa-cruda", "papa-hervida"), ("papa-cruda", "papa-al-horno"),
    ("batata-cruda", "batata-al-horno"), ("zapallo-anco-crudo", "zapallo-anco-al-horno"),
    ("zapallito-crudo", "zapallito-hervido"), ("zanahoria-cruda", "zanahoria-hervida"),
    ("tomate-crudo", "tomate-cocido"), ("cebolla-cruda", None), ("morron-rojo-crudo", "morron-rojo-salteado"),
    ("brocoli-crudo", "brocoli-hervido"), ("espinaca-cruda", "espinaca-hervida"), ("acelga-cruda", "acelga-hervida"),
    ("choclo-crudo", "choclo-hervido"), ("mani-crudo", "mani-tostado"),
]


def rd(name):
    with open(os.path.join(SRC, name), encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


ids = {str(f["fdcId"]) for f in foods}
desc = {r["fdc_id"]: r["description"] for r in rd("food.csv") if r["fdc_id"] in ids}
dtype = {r["fdc_id"]: r["data_type"] for r in rd("food.csv") if r["fdc_id"] in ids}
nut = defaultdict(dict)
for r in rd("food_nutrient.csv"):
    if r["fdc_id"] in ids:
        nut[r["fdc_id"]][r["nutrient_id"]] = float(r["amount"])
prow = defaultdict(set)
for r in rd("food_portion.csv"):
    if r["fdc_id"] in ids:
        a = float(r["amount"])
        a = int(a) if a == int(a) else a
        prow[r["fdc_id"]].add((f'{a} {r["modifier"]}'.strip(), float(r["gram_weight"])))

res = {}
fails = []


def check(name, bad, hard=True):
    res[name] = bad
    if bad and hard:
        fails.append(name)


slugs = Counter(f["slug"] for f in foods)
fdcs = Counter(f["fdcId"] for f in foods)
bySlug = {f["slug"]: f for f in foods}
check("count 180-230", [] if 180 <= len(foods) <= 230 else [len(foods)])
check("duplicate slugs", [s for s, c in slugs.items() if c > 1])
check("duplicate fdcIds", [s for s, c in fdcs.items() if c > 1])
check("slug kebab-case", [f["slug"] for f in foods if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", f["slug"])])
check("aliases lowercase & non-empty", [f["slug"] for f in foods if not f["aliases"] or any(a != a.lower() for a in f["aliases"])])
check("valid category", [f["slug"] for f in foods if f["category"] not in CATS])
check("valid state", [f["slug"] for f in foods if f["state"] not in ("raw", "cooked", "na")])
check("valid match", [f["slug"] for f in foods if f["match"] not in ("exact", "approx")])
check("approx has note", [f["slug"] for f in foods if f["match"] == "approx" and not f.get("note")])
check("fdcId is SR Legacy", [f["slug"] for f in foods if dtype.get(str(f["fdcId"])) != "sr_legacy_food"])
check("usdaDescription matches food.csv", [f["slug"] for f in foods if desc.get(str(f["fdcId"])) != f["usdaDescription"]])
check("energyKcal non-null", [f["slug"] for f in foods if f["per100g"]["energyKcal"] is None])

mism = []
for f in foods:
    n = nut[str(f["fdcId"])]
    for field, nids in NUT.items():
        src = next((n[i] for i in nids if i in n), None)
        val = f["per100g"][field]
        if (src is None) != (val is None) or (src is not None and abs(src - val) > 1e-9):
            mism.append(f"{f['slug']}.{field}: json={val} csv={src}")
check("per100g equals CSV (null only when row absent)", mism)

atw, atw_unexpl = [], []
for f in foods:
    p = f["per100g"]
    e = p["energyKcal"]
    a = 4 * (p["proteinG"] or 0) + 4 * (p["carbsG"] or 0) + 9 * (p["fatG"] or 0)
    if e < 20 and abs(a - e) <= 5:
        continue
    dev = (a - e) / e
    if abs(dev) > 0.20:
        explained = "4-4-9" in (f.get("note") or "")
        atw.append((f["slug"], e, round(a, 1), f"{dev:+.0%}", explained))
        if not explained:
            atw_unexpl.append(f["slug"])
check("Atwater 4P+4C+9F within ±20% or explained in note", atw_unexpl)

badp = []
for f in foods:
    for pt in f["portions"]:
        if (pt["usda"], float(pt["grams"])) not in prow[str(f["fdcId"])]:
            badp.append(f"{f['slug']}: {pt}")
        if not pt["label"] or re.search(r"\b(cup|tbsp|tsp|oz|slice|medium|large|small)\b", pt["label"]):
            badp.append(f"{f['slug']}: untranslated {pt['label']}")
check("portions only from food_portion.csv (usda text + grams match a row)", badp)
check("portion labels unique per food", [f["slug"] for f in foods if len({p["label"] for p in f["portions"]}) != len(f["portions"])])

missing_pairs = []
for a, b in PAIRS:
    for s in (a, b):
        if s and s not in bySlug:
            missing_pairs.append(s)
    if a in bySlug and bySlug[a]["state"] != "raw":
        missing_pairs.append(f"{a} not raw")
    if b and b in bySlug and bySlug[b]["state"] != "cooked":
        missing_pairs.append(f"{b} not cooked")
check("raw/cooked pairs present", missing_pairs)

nulls = {k: sum(1 for f in foods if f["per100g"][k] is None) for k in NUT}
cats = Counter(f["category"] for f in foods)
approx = [f for f in foods if f["match"] == "approx"]
states = Counter(f["state"] for f in foods)
nport = sum(len(f["portions"]) for f in foods)
noport = [f["slug"] for f in foods if not f["portions"]]

L = []
L.append("# REPI — Seed de alimentos (USDA SR Legacy) — Reporte\n")
L.append("Fuente única: USDA FoodData Central **SR Legacy** (abril 2018), dominio público / CC0. "
         "Archivos: `food.csv`, `food_nutrient.csv`, `food_portion.csv` (+ `food_calorie_conversion_factor.csv` sólo para explicar energía). "
         "Sin APIs, sin descargas adicionales, sin Foundation Foods.\n")
L.append("Generado por `build_seed.py` (mapeo curado en `foods_map.py`, etiquetas de porciones en `portions_es.py`) y verificado por `check_seed.py`.\n")
L.append(f"## Resumen\n\n- Entradas: **{len(foods)}** (rango pedido 180–230)\n- Coincidencia exacta: {len(foods) - len(approx)} · aproximada: {len(approx)}\n"
         f"- Estado: raw {states['raw']} · cooked {states['cooked']} · na {states['na']}\n"
         f"- Porciones: {nport} (todas de `food_portion.csv`); entradas sin porciones: {len(noport)}\n")
L.append("## Entradas por categoría\n\n| Categoría | Entradas | Aprox. |\n|---|---:|---:|")
for c in CATS:
    L.append(f"| {c} | {cats.get(c, 0)} | {sum(1 for f in approx if f['category'] == c)} |")
L.append(f"| **total** | **{len(foods)}** | **{len(approx)}** |\n")
L.append("## Controles de calidad\n\n| Control | Resultado |\n|---|---|")
for k, v in res.items():
    L.append(f"| {k} | {'OK' if not v else 'FALLA: ' + str(len(v)) + ' — ' + '; '.join(map(str, v[:8]))} |")
L.append("")
L.append("### Energía vs Atwater (4P+4C+9F)\n")
L.append("Tolerancia ±20 %; para alimentos con <20 kcal/100 g se acepta además una diferencia absoluta ≤5 kcal. "
         "Fuera de tolerancia (todos explicados en `note`, se conserva el valor USDA):\n")
L.append("| slug | kcal USDA | 4-4-9 | desvío | explicado |\n|---|---:|---:|---:|---|")
for s, e, a, d, ex in atw:
    L.append(f"| {s} | {e} | {a} | {d} | {'sí' if ex else 'NO'} |")
L.append("\nCausas: alcohol (cerveza, vinos, destilados: 7 kcal/g no contados por 4-4-9) y factores de Atwater específicos de USDA "
         "(verduras de hoja, brócoli, champiñones, limón, cacao: proteína 1,8–3,4 y carbohidratos 1,3–3,6 kcal/g; "
         "los carbohidratos por diferencia incluyen fibra).\n")
L.append("### Nutrientes ausentes en SR Legacy (quedan `null`, nunca 0)\n")
L.append("| nutriente | entradas con null |\n|---|---:|")
for k, v in nulls.items():
    L.append(f"| {k} | {v} |")
L.append("\nAzúcares: id 2000 (Sugars, Total); se usa 1063 sólo si falta 2000.\n")
L.append("### Pares crudo/cocido verificados\n")
L.append(", ".join(f"`{a}`↔`{b}`" for a, b in PAIRS if b) + "\n")
L.append("### Entradas sin porciones útiles\n")
L.append("Sólo tenían porciones en oz/lb/\"yield from 1 lb\" o tamaños de EE.UU. sin equivalente local; se registran por gramos: "
         + ", ".join(f"`{s}`" for s in noport) + "\n")
L.append(f"## Coincidencias aproximadas ({len(approx)})\n\n| slug | fdcId | USDA | nota |\n|---|---:|---|---|")
for f in approx:
    L.append(f"| {f['slug']} | {f['fdcId']} | {f['usdaDescription']} | {f.get('note', '')} |")
L.append("\n## Criterios\n")
L.append("- Valores por 100 g con la precisión original de SR Legacy (sin redondeo). `null` cuando la fila del nutriente no existe.\n"
         "- Porciones: sólo filas de `food_portion.csv` del mismo fdcId; `grams` = `gram_weight`; `usda` = cantidad + modificador original. "
         "Se descartan oz, lb, fl oz, NLEA serving, \"yield from\", envases y tamaños de fast food de EE.UU.; pulgadas → cm y fl oz → ml sólo en la etiqueta.\n"
         "- Cortes de carne: mapeados al corte USDA más parecido, \"separable lean only\" salvo bondiola/asado de tira/costillas (carne y grasa); marcados `approx`.\n"
         "- Cocidos: el peso es el cocido; la app no convierte crudo↔cocido automáticamente.\n"
         "- Ver `SKIPPED.md` para lo omitido y por qué.\n")
open(os.path.join(SEED, "REPORT.md"), "w", encoding="utf-8").write("\n".join(L))
print("FAILS:", fails or "none")
for k, v in res.items():
    print(f"{'OK  ' if not v else 'FAIL'} {k}" + ("" if not v else f": {v[:5]}"))
sys.exit(1 if fails else 0)
