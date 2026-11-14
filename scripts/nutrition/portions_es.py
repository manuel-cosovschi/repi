# Spanish (Rioplatense) labels for USDA food_portion.csv `modifier` values.
# Only modifiers listed here are kept; anything else (oz, lb, fl oz, NLEA,
# yield-from-raw, US package sizes, fast-food cup sizes...) is dropped.
# The gram weight always comes from food_portion.csv; nothing is invented here.
# Inches are converted to cm (1" = 2.54 cm), fl oz to ml (1 fl oz = 29.57 ml), rounded.

T = {
    # generic household measures
    "cup": "taza",
    "cup (8 fl oz)": "taza (240 ml)",
    "cup (1 NLEA serving)": "taza",
    "cup (not packed)": "taza (sin apretar)",
    "cup, packed": "taza (apretada)",
    "cup (4.86 large eggs)": "taza (≈5 huevos grandes)",
    "cup chopped": "taza, picado",
    "cup, chopped": "taza, picado",
    "cup, chopped or diced": "taza, picado o en cubos",
    "cup, chopped or sliced": "taza, picado o en rodajas",
    "cup, diced": "taza, en cubos",
    "cup, cubes": "taza, en cubos",
    "cup cut": "taza, cortado",
    "cup, sliced": "taza, en rodajas",
    "cup slices": "taza, en rodajas",
    "cup, slices": "taza, en rodajas",
    "cup strips or slices": "taza, en tiras o rodajas",
    "cup, pieces or slices": "taza, en trozos o rodajas",
    "cup pieces": "taza, en trozos",
    "cup, chunks": "taza, en trozos",
    "cup, solid or chunks": "taza, en trozos",
    "cup, mashed": "taza, pisado",
    "cup, pureed": "taza, en puré",
    "cup, shredded": "taza, rallado",
    "cup shredded": "taza, rallado",
    "cup grated": "taza, rallado",
    "cup, crumbled": "taza, desmenuzado",
    "cup, halves": "taza, en mitades",
    "cup, whole": "taza, entero",
    "cup, pitted": "taza, sin carozo",
    "cup, sections": "taza, en gajos",
    "cup sections, with juice": "taza, en gajos con jugo",
    "cup, quartered or chopped": "taza, en cuartos o picado",
    "cup, balls": "taza, en bolitas",
    "cup, ground": "taza, molido",
    "cup, slivered": "taza, fileteado",
    "cup, melted": "taza, derretido",
    "cup, whipped": "taza, batido",
    "cup, fluid (yields 2 cups whipped)": "taza, líquida (rinde 2 tazas batida)",
    "cup, large curd (not packed)": "taza, grano grande",
    "cup, small curd (not packed)": "taza, grano chico",
    "cup shelled (50 halves)": "taza, pelado (50 mitades)",
    "cup cherry tomatoes": "taza de tomates cherry",
    "cup spaghetti": "taza (spaghetti)",
    "cup spaghetti not packed": "taza (spaghetti, sin apretar)",
    "cup elbows": "taza (codito)",
    "cup elbows not packed": "taza (codito, sin apretar)",
    "cup penne": "taza (penne / mostachol)",
    "cup farfalle": "taza (moñito)",
    "cup rotini": "taza (tirabuzón)",
    "cup shells": "taza (caracoles)",
    "cantaloupe balls": "taza, en bolitas",
    "watermelon balls": "taza, en bolitas",
    "tablespoon": "cucharada",
    "tbsp": "cucharada",
    "tbsp chopped": "cucharada, picado",
    "tbsp, ground": "cucharada, molido",
    "tbsp, whole": "cucharada, entero",
    "tbsp, whipped": "cucharada, batido",
    "tsp": "cucharadita",
    "tsp or 1 packet": "cucharadita o sobrecito",
    "tsp, ground": "cucharadita, molido",
    "tsp, whole": "cucharadita, entero",
    "pat (1\" sq, 1/3\" high)": "rulito / porción individual (2,5 cm)",
    "individual packet": "sobrecito",
    "packet": "sobrecito",
    "packet (0.5 oz)": "sobrecito",
    "serving packet": "sobrecito",
    "scoop": "scoop / medida",
    "jigger (1.5 fl oz)": "medida (44 ml)",
    "serving (5 fl oz)": "copa (148 ml)",
    "can or bottle (12 fl oz)": "lata (355 ml)",
    "can can 12 fl oz": "lata (355 ml)",
    "can or bottle (16 fl oz)": "botella (473 ml)",
    "bottle bottle 16 fl oz": "botella (473 ml)",
    "drink (12 fl oz)": "lata / vaso (355 ml)",
    "container (4 oz)": "pote chico (≈113 g)",
    "container (6 oz)": "pote (≈170 g)",
    "container (8 oz)": "pote grande (≈227 g)",
    "can (12.5 oz), drained": "lata, escurrida",
    "container": "pote",

    # sizes / units (generic)
    "small": "unidad chica",
    "medium": "unidad mediana",
    "large": "unidad grande",
    "extra large": "unidad extra grande",
    "jumbo": "unidad jumbo",
    "piece": "porción / pieza",
    "fruit": "unidad",
    "fruit without refuse": "unidad (sin desperdicio)",
    "slice": "rebanada / feta",
    "slice, thin": "rebanada / feta fina",
    "slice, large": "rebanada / feta grande",
    "slice, very thin": "rebanada muy fina",
    "slice (1 oz)": "feta (≈28 g)",
    "fillet": "filet",
    "steak": "bife",
    "tortilla": "tortilla",
    "tortilla medium (approx 6\" dia)": "tortilla mediana (≈15 cm)",
    "tortilla (approx 7-8\" dia)": "tortilla (≈18–20 cm)",
    "tortilla (approx 10\" dia)": "tortilla grande (≈25 cm)",
    "tortilla (approx 12\" dia)": "tortilla extra grande (≈30 cm)",
    "cookie": "galletita",
    "cracker": "galletita",
    "cracker square": "galletita cuadrada",
    "cracker, rectangle": "galletita rectangular",
    "cracker, round large": "galletita redonda grande",
    "crackers square (1 serving)": "porción de galletitas cuadradas",
    "cake": "unidad",
    "cakes": "unidades",
    "bar": "barrita",
    "bar, miniature": "barrita mini",
    "croissant, mini": "unidad mini",
    "croissant, small": "unidad chica",
    "croissant, medium": "unidad mediana",
    "croissant, large": "unidad grande",
    "link (4\" long)": "unidad (10 cm)",
    "serving (1 hot dog)": "unidad (1 pancho)",
    "leaf": "hoja",
    "leaf inner": "hoja interior",
    "leaf outer": "hoja exterior",
    "head": "planta entera",
    "stalk": "tallo",
    "spear (about 5\" long)": "lanza (≈13 cm)",
    "almond": "unidad",
    "peanut": "unidad",
    "raisins": "unidades",
    "berries": "unidades",
    "grapes": "unidades",
    "cherry": "tomate cherry",
    "plum tomato": "tomate perita",
    "Italian tomato": "tomate perita",
    "wedge (1/4 of medium tomato)": "gajo (1/4 de tomate mediano)",
    "slice, medium (1/4\" thick)": "rodaja mediana (6 mm)",
    "slice, thick/large (1/2\" thick)": "rodaja gruesa (13 mm)",
    "slice, thin/small": "rodaja fina",
    "small whole (2-2/5\" dia)": "unidad chica (6 cm)",
    "medium whole (2-3/5\" dia)": "unidad mediana (6,6 cm)",
    "large whole (3\" dia)": "unidad grande (7,6 cm)",
    "carrot": "unidad",
    "beet (2\" dia)": "unidad (5 cm)",
    "cucumber (8-1/4\")": "unidad (21 cm)",
    "ring (3\" dia., 1/4\" thick)": "aro (7,6 cm, 6 mm)",
    "potato small": "papa chica",
    "potato medium": "papa mediana",
    "potato large": "papa grande",
    "Potato small (1-3/4\" to 2-1/2\" dia)": "papa chica (4,5–6,4 cm)",
    "Potato medium (2-1/4\" to 3-1/4\" dia)": "papa mediana (5,7–8,3 cm)",
    "Potato large (3\" to 4-1/4\" dia)": "papa grande (7,6–10,8 cm)",
    "small (1-3/4\" to 2-1/2\" dia.)": "unidad chica (4,5–6,4 cm)",
    "medium (2-1/4\" to 3-1/4\" dia.)": "unidad mediana (5,7–8,3 cm)",
    "large (3\" to 4-1/4\" dia.)": "unidad grande (7,6–10,8 cm)",
    "sweetpotato, 5\" long": "batata (13 cm)",
    "medium (2\" dia, 5\" long, raw)": "unidad mediana (5 cm diám., 13 cm largo)",
    "ear small (5-1/2\" to 6-1/2\" long)": "choclo chico (14–16,5 cm)",
    "ear medium (6-3/4\" to 7-1/2\" long)": "choclo mediano (17–19 cm)",
    "ear large (7-3/4\" to 9\" long)": "choclo grande (19,7–23 cm)",
    "ear, small (5-1/2\" to 6-1/2\" long)": "choclo chico (14–16,5 cm)",
    "ear, medium (6-3/4\" to 7-1/2\" long) yields": "choclo mediano (17–19 cm), granos",
    "ear, large (7-3/4\" to 9\" long) yields": "choclo grande (19,7–23 cm), granos",
    "eggplant, unpeeled (approx 1-1/4 lb)": "berenjena entera con cáscara",
    "extra small (less than 6\" long)": "unidad extra chica (<15 cm)",
    "small (6\" to 6-7/8\" long)": "unidad chica (15–17,5 cm)",
    "medium (7\" to 7-7/8\" long)": "unidad mediana (18–20 cm)",
    "large (8\" to 8-7/8\" long)": "unidad grande (20–22,5 cm)",
    "extra large (9\" or longer)": "unidad extra grande (≥23 cm)",
    "small (2-1/2\" dia)": "unidad chica (6,4 cm)",
    "medium (2-1/2\" dia)": "unidad mediana (6,4 cm)",
    "small (2-3/4\" dia)": "unidad chica (7 cm)",
    "medium (3\" dia)": "unidad mediana (7,6 cm)",
    "large (3-1/4\" dia)": "unidad grande (8,3 cm)",
    "large (2-3/4\" dia)": "unidad grande (7 cm)",
    "medium (2-2/3\" dia)": "unidad mediana (6,8 cm)",
    "large (3-1/16\" dia)": "unidad grande (7,8 cm)",
    "small (2-3/8\" dia)": "unidad chica (6 cm)",
    "small (2-1/4\" dia)": "unidad chica (5,7 cm)",
    "extra small (2-1/2\" dia)": "unidad extra chica (6,4 cm)",
    "extra large (3\" dia)": "unidad extra grande (7,6 cm)",
    "small (1\" dia)": "unidad chica (2,5 cm)",
    "medium (1-1/4\" dia)": "unidad mediana (3,2 cm)",
    "large (1-3/8\" dia)": "unidad grande (3,5 cm)",
    "extra large (1-5/8\" dia)": "unidad extra grande (4,1 cm)",
    "fruit (2\" dia)": "unidad (5 cm)",
    "fruit (2-1/8\" dia)": "unidad (5,4 cm)",
    "fruit (2-3/8\" dia)": "unidad (6 cm)",
    "fruit (2-5/8\" dia)": "unidad (6,7 cm)",
    "small (approx 3-1/2\" dia)": "unidad chica (≈9 cm)",
    "medium (approx 4\" dia)": "unidad mediana (≈10 cm)",
    "large (approx 4-1/2\" dia)": "unidad grande (≈11,4 cm)",
    "medium (approx 2-3/4\" long, 2-1/2 dia.)": "unidad mediana (≈7 cm)",
    "large (2-1/4 per pound, approx 3-3/4\" long, 3\" dia.)": "unidad grande (≈9,5 cm)",
    "small (5-1/2\" long)": "unidad chica (14 cm)",
    "large (7-1/4\" to 8-/1/2\" long)": "unidad grande (18–21,5 cm)",
    "wedge or slice (1/8 of one 2-1/8\" dia lemon)": "gajo (1/8 de limón)",
    "wedge (approx 1/16 of melon)": "tajada (≈1/16 de sandía)",
    "melon, small (about 4-1/4\" dia)": "melón chico entero (≈11 cm)",
    "melon, medium (about 5\" dia)": "melón mediano entero (≈13 cm)",
    "melon, large (about 6-1/2\" dia)": "melón grande entero (≈16,5 cm)",
    "wedge, small (1/8 of small melon)": "tajada (1/8 de melón chico)",
    "wedge, medium (1/8 of medium melon)": "tajada (1/8 de melón mediano)",
    "wedge, large (1/8 of large melon)": "tajada (1/8 de melón grande)",
    "stalk, small (5\" long)": "tallo chico (13 cm)",
    "stalk, medium (7-1/2\" - 8\" long)": "tallo mediano (19–20 cm)",
    "stalk, large (11\"-12\" long)": "tallo grande (28–30 cm)",
    "prune, pitted": "unidad, sin carozo",
    "avocado, NS as to Florida or California": "palta entera (sin cáscara ni carozo)",
    "baby ear": "choclito baby",
    "breast, bone and skin removed": "pechuga, sin hueso ni piel",
    "thigh without skin": "muslo sin piel",
    "thigh with skin": "muslo con piel",
    "chop, excluding refuse (yield from 1 raw chop, with refuse, weighing 151 g)": "chuleta, sin hueso",
    "slice crust not eaten": "rebanada sin corteza",
    "slice thin, crust not eaten": "rebanada fina sin corteza",
    "serving 1/2 cup": "porción (1/2 taza)",
    "strip medium": "tira mediana",
    "strip large (3\" long)": "tira grande (7,6 cm)",
    "serving small": "porción chica",
    "serving medium": "porción mediana",
    "serving large": "porción grande",
    "block": "bloque",
    "cup, crushed": "taza, triturado",
    "can": "lata",
    "cubic inch": "cubo (2,5 cm de lado)",
    "cup pieces or chips": "taza, en trozos",
    "serving": "porción",
    "slice, large (1/4\" thick)": "rodaja grande (6 mm)",
    "slice, medium (1/8\" thick)": "rodaja mediana (3 mm)",
    "slice (4-2/3\" dia x 3/4\" thick)": "rodaja grande (12 cm diám., 2 cm)",
    "slice (3-1/2\" dia x 3/4\" thick)": "rodaja (9 cm diám., 2 cm)",
    "slice, thin (3-1/2\" dia x 1/2\" thick)": "rodaja fina (9 cm diám., 1,3 cm)",
    "cookie, oval (3-1/8\" x 1-1/4\" x 3/8\")": "galletita ovalada (8 cm)",
    "cookie, round (1-3/4\" dia)": "galletita redonda (4,5 cm)",
    "bar (1.55 oz)": "barra (≈44 g)",
    "bar (1 oz)": "barrita (≈28 g)",
    "small box (1.5 oz)": "cajita (≈43 g)",
    "miniature box (.5 oz)": "cajita mini (≈14 g)",
    "piece individually wrapped cake": "porción envasada individual",
    "steak without refuse (Yield from 1 raw steak, with refuse, weighing 380g)": "bife (sin hueso)",
    "steak without refuse (Yield from 1 cooked steak, with refuse, weighing 249g)": "bife (sin hueso)",
}

FRACTIONS = {0.25: "1/4", 0.5: "1/2", 0.33: "1/3", 0.333: "1/3", 0.75: "3/4", 1.5: "1 1/2"}


def fmt_amount(a):
    a = float(a)
    if a in FRACTIONS:
        return FRACTIONS[a]
    if a == int(a):
        return str(int(a))
    return ("%g" % a).replace(".", ",")


# Full labels for (amount, modifier) pairs whose amount is part of the meaning.
SPECIAL = {
    (6, "fl oz"): "1 taza de café / té (177 ml)",
    (56, "grams 1 serving"): "1 porción (56 g)",
    (1, "roll 1 serving"): "1 pan",
    (4, "cracker 1 serving"): "4 galletitas",
    (5, "crackers"): "5 galletitas",
    (22, "chips"): "22 papas fritas",
    (4, "pieces"): "4 tiritas",
    (0.5, "chicken, bone removed"): "1/2 pollo, sin huesos",
    (0.16, "loaf 1/6 of the loaf"): "1/6 de budín",
    (1, "fruit yields"): "jugo de 1 naranja",
    (1, "serving 1 cube"): "1 terrón",
    (1, "serving 3 servings per 15.1 oz package"): "1 porción (1/3 de pizza congelada de 428 g)",
    (1, "serving 1 serving per 8 oz box"): "1 pizza individual congelada (227 g)",
}


def translate(amount, modifier):
    sp = SPECIAL.get((float(amount), modifier))
    if sp is not None:
        return sp
    if float(amount) <= 0:
        return None
    lab = T.get(modifier)
    if lab is None:
        return None
    return f"{fmt_amount(amount)} {lab}"


# Per-food overrides keyed by (slug, original USDA "amount modifier" string).
# A value of None drops a portion that does not make sense in Argentina.
PER_FOOD = {
    ("pollo-pechuga-cruda", "1 piece"): "1 pechuga entera (sin hueso ni piel)",
    ("pollo-pechuga-plancha", "1 piece"): "1 pechuga entera (sin hueso ni piel)",
    ("asado-de-tira-crudo", "1 piece"): "1 pieza (sin hueso)",
    ("asado-de-tira-cocido", "1 piece"): "1 pieza (sin hueso)",
    ("empanada-de-carne", "1 piece"): "1 empanada",
    ("milanesa-de-pollo-cruda", "1 piece"): "1 tirita",
    ("milanesa-de-pollo-cocida", "1 piece"): "1 tirita",
    ("pan-frances", "1 slice"): None,  # USDA slice of 139 g has no Argentine equivalent
    ("chocolate-amargo", "1 bar"): "1 tableta (101 g)",
    ("chocolate-semiamargo", "1 bar"): "1 tableta (162 g)",
    ("galletitas-crackers-saladas", "5 crackers square (1 serving)"): "5 galletitas cuadradas",
    ("sandia", "10 watermelon balls"): "10 bolitas",
    ("almendras", "1 cup, sliced"): "1 taza, en láminas",
    ("melon", "10 cantaloupe balls"): "10 bolitas",
}

PLURAL = [
    ("unidad mediana", "unidades medianas"), ("unidad grande", "unidades grandes"),
    ("unidad chica", "unidades chicas"), ("unidad", "unidades"),
    ("galletita", "galletitas"), ("cucharadita", "cucharaditas"), ("cucharada", "cucharadas"),
    ("scoop / medida", "scoops / medidas"), ("taza", "tazas"), ("rebanada", "rebanadas"),
    ("feta", "fetas"), ("rodaja", "rodajas"),
]


def contextualize(label, slug, category, usda, amount):
    if (slug, usda) in PER_FOOD:
        return PER_FOOD[(slug, usda)]
    if "rebanada / feta" in label:
        if category in ("verduras", "frutas"):
            label = label.replace("rebanada / feta", "rodaja")
        elif category == "panificados":
            label = label.replace("rebanada / feta", "rebanada")
        elif category in ("lacteos", "carnes"):
            label = label.replace("rebanada / feta", "feta")
    if label.startswith("1 porción / pieza"):
        label = label.replace("porción / pieza", "pieza")
    a = float(amount)
    if a > 1:
        num, rest = label.split(" ", 1)
        for sing, plur in PLURAL:
            if rest.startswith(sing) and not rest.startswith(plur):
                rest = plur + rest[len(sing):]
                break
        label = f"{num} {rest}"
    return label
