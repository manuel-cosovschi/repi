import json, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
keys = ["slug","name","aliases","category","state","fdcId","usdaDescription","per100g","portions","note","match"]
lines = []
for f in d:
    e = {k: f[k] for k in keys if k in f and f[k] not in (None, "")}
    e["portions"] = [{"label": p["label"], "grams": p["grams"], **({"usda": p["usda"]} if p.get("usda") else {})} for p in f.get("portions", [])]
    lines.append("  " + json.dumps(e, ensure_ascii=False, separators=(",", ":")) + ",")
hdr = f'''// GENERADO desde la curaduría de USDA FoodData Central SR Legacy (abril 2018, dominio público CC0) — no editar a mano.
// Cada alimento: nombre rioplatense, estado crudo/cocido, fdcId de origen, valores por 100 g tal como los informa la fuente
// (null = la fuente no lo informa; nunca 0 por defecto) y porciones domésticas sólo si USDA las documenta.
// Coincidencias «approx»: el alimento local no tiene equivalente exacto en USDA y se usa el más cercano (ver `note`).
// Procedencia y método: docs/nutrition/FUENTES_Y_LICENCIAS.md. Versión de la biblioteca: FOODS_VERSION.
import type {{ CatalogFood }} from "./catalog";

export const FOODS_VERSION = "repi-foods-1 (usda-sr-legacy-2018-04)";
export const FOODS: CatalogFood[] = [
'''
open(out, "w").write(hdr + "\n".join(lines) + "\n];\n")
print(len(d))
