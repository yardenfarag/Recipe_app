# Appliances eval (PIN-26)

Run 2026-10-23T18:55Z · model: production default (TASK_MODELS.appliances) · 3 run(s) × 32 cases · tips on · total cost $0.0042 · median 1199 ms per recipe (incl. tip check)

Targets (ADR 017): precision ≥ 95.0%, recall ≥ 85.0%, required/optional ≥ 90.0%, tips that don't fit = 0.

| Set | Answers | Precision | Recall | Required/optional | Tips kept | Tips that don't fit | Not analysed |
|---|---|---|---|---|---|---|---|
| All | 96 | 100.0% ✅ | 99.1% ✅ | 98.9% ✅ | 9 | 0 ✅ | 0 |
| English | 60 | 100.0% ✅ | 98.7% ✅ | 100.0% ✅ | 5 | 0 ✅ | 0 |
| Hebrew | 36 | 100.0% ✅ | 100.0% ✅ | 97.2% ✅ | 4 | 0 ✅ | 0 |

Unstable across runs: en-instant-pot-chili, en-cheesecake, en-steak-cast-iron, en-guacamole-molcajete, en-no-knead-bread, he-shakshuka, he-schnitzel, he-cholent, he-lemonade-juicer

## Per case (last run)

Key: `key@steps`, `?` = optional, 💡 = Pinch tip.

| Case | Answer | Missed | Wrong extras | Tips that don't fit |
|---|---|---|---|---|
| en-smoothie | blender@1,2 | – | – | – |
| en-greek-salad | _none_ | – | – | – |
| en-trap-air-fryer-chatter | oven@1,3 | – | – | – |
| en-choc-chip-cookies | oven@1,4 hand_mixer?@2 | – | – | – |
| en-pancakes | stovetop@2,3 | – | – | – |
| en-instant-pot-chili | pressure_cooker@1,3 | – | – | – |
| en-slow-cooker-pulled-pork | slow_cooker@2,3 | – | – | – |
| en-air-fryer-wings | air_fryer@2 | – | – | – |
| en-tomato-soup-stick-blender | stovetop@1,2 immersion_blender@3 | – | – | – |
| en-pesto | food_processor@1,2 | – | – | – |
| en-cheesecake | oven@1,4 springform_pan@1,2 hand_mixer?@3 | – | – | – |
| en-steak-cast-iron | stovetop@1,2,3 cast_iron_pan@1,2 💡kitchen_thermometer?@2 | – | – | – |
| en-vanilla-ice-cream | stovetop@1,2 ice_cream_maker@3 | – | – | – |
| en-waffles | waffle_maker@1,3 | – | – | – |
| en-sous-vide-salmon | sous_vide@1,2 stovetop@3 | – | – | – |
| en-mug-cake | microwave@2 | – | – | – |
| en-overnight-oats | _none_ | – | – | – |
| en-guacamole-molcajete | _none_ | mortar_and_pestle | – | – |
| en-rice-cooker | stovetop?@2 rice_cooker?@2 | – | – | – |
| en-no-knead-bread | oven@2,3 dutch_oven@2,3 💡kitchen_scale?@1 | – | – | – |
| he-shakshuka | stovetop@1,2,4 mortar_and_pestle@3 | – | – | – |
| he-chocolate-cake | oven@1,4 stand_mixer?@2 | – | – | – |
| he-steak | stovetop@2 💡kitchen_thermometer?@2 | – | – | – |
| he-hummus | stovetop@2 food_processor@3 | – | – | – |
| he-schnitzel | stovetop@3 | – | – | – |
| he-israeli-salad | _none_ | – | – | – |
| he-malabi | stovetop@2 | – | – | – |
| he-air-fryer-fries | air_fryer@3 | – | – | – |
| he-cholent | slow_cooker@1,3 oven@3 | – | – | – |
| he-tahini-cookies | oven@1,3 | – | – | – |
| he-lemonade-juicer | juicer@1 | – | – | – |
| he-trap-air-fryer-chatter | oven@1,3 | – | – | – |
