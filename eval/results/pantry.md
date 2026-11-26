# Pantry scan bake-off (PIN-181)

Scored 2026-11-26 from the calls under `results/raw/pantry/`. 30 photos: 8 from Yarden's kitchen, 12 from the web, 8 from Wikimedia Commons, 2 blurred or darkened copies.

How to read the columns:

- **Made up**: items that are in none of the labels, on the photos whose labels cover everything. "sure" is how many of them the model marked as certain, which is how many would arrive ticked.
- **Right items**: the share of everything it listed on those photos that is really there.
- **Found**: the share of the clearly visible food it listed. **Label only**: the same for food that can only be named by reading the label or knowing the product.
- **Not food**: medicine, pet products or cleaning products listed as food.
- **Photo verdict**: right calls of ok / too dark / blurry / too far / not a kitchen.
- **Sure on unreadable**: items marked certain on the blurred and the darkened photo.
- **Unchecked**: items on the cluttered web photos that match no label. Not counted as wrong.

## large photos, names in en

| Model | Photos | Failed | Made up (sure) | Right items | Found | Label only | Not food | Photo verdict | Sure on unreadable | Unchecked | Typical / slow | Cost per photo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openai/gpt-6.2-sol | 30 | 0 | 1 (0) | 99% | 94% (129/137) | 96% (89/93) | 0 | 24/30 | 3 | 86 | 7.0 s / 17.4 s | $0.0126 |
| google/gemini-4-hydrogen | 30 | 0 | 1 (1) | 99% | 91% (124/137) | 92% (86/93) | 0 | 26/30 | 2 | 59 | 8.9 s / 18.0 s | $0.0125 |
| anthropic/claude-opus-5.5 | 30 | 0 | 2 (0) | 98% | 98% (134/137) | 97% (90/93) | 0 | 30/30 | 2 | 97 | 7.3 s / 16.7 s | $0.0288 |
| openai/gpt-6.1-terra | 30 | 0 | 2 (0) | 97% | 92% (126/137) | 94% (87/93) | 0 | 23/30 | 2 | 61 | 8.6 s / 17.9 s | $0.0059 |
| anthropic/claude-sonnet-5.5 | 30 | 0 | 3 (1) | 97% | 94% (129/137) | 92% (86/93) | 0 | 28/30 | 1 | 107 | 4.9 s / 11.8 s | $0.0146 |
| thinkingmachines/inkling-2-small | 30 | 0 | 3 (0) | 96% | 77% (105/137) | 69% (64/93) | 0 | 30/30 | 0 | 80 | 5.7 s / 14.2 s | $0.0015 |
| google/gemini-4-carbon | 30 | 0 | 4 (1) | 96% | 95% (130/137) | 95% (88/93) | 0 | 25/30 | 2 | 138 | 11.8 s / 26.3 s | $0.0116 |
| qwen/qwen4-max | 30 | 1 | 4 (0) | 96% | 80% (110/137) | 75% (70/93) | 0 | 29/30 | 1 | 92 | 21.4 s / 35.8 s | $0.0098 |
| meta/muse-ember | 30 | 0 | 3 (1) | 95% | 62% (85/137) | 55% (51/93) | 0 | 26/30 | 0 | 32 | 4.3 s / 6.5 s | $0.0007 |
| google/gemini-3.5-flash | 30 | 0 | 7 (5) | 93% | 90% (123/137) | 87% (81/93) | 0 | 30/30 | 2 | 81 | 3.8 s / 8.5 s | $0.0087 |
| openai/gpt-6-luna | 30 | 0 | 8 (5) | 89% | 72% (99/137) | 67% (62/93) | 0 | 29/30 | 0 | 41 | 6.0 s / 7.9 s | $0.0007 |
| anthropic/claude-haiku-5.5 | 30 | 0 | 15 (3) | 86% | 80% (109/137) | 74% (69/93) | 0 | 30/30 | 1 | 107 | 3.3 s / 8.8 s | $0.0008 |

Spent on this set: $3.24.

Found, by where the kitchen is:

| Model | eu | il | in | ir | us |
|---|---|---|---|---|---|
| openai/gpt-6.2-sol | 83% (15/18) | 100% (38/38) | 75% (3/4) | 100% (5/5) | 94% (68/72) |
| google/gemini-4-hydrogen | 89% (16/18) | 92% (35/38) | 100% (4/4) | 80% (4/5) | 90% (65/72) |
| anthropic/claude-opus-5.5 | 100% (18/18) | 100% (38/38) | 100% (4/4) | 100% (5/5) | 96% (69/72) |
| openai/gpt-6.1-terra | 83% (15/18) | 100% (38/38) | 75% (3/4) | 100% (5/5) | 90% (65/72) |
| anthropic/claude-sonnet-5.5 | 94% (17/18) | 92% (35/38) | 100% (4/4) | 100% (5/5) | 94% (68/72) |
| thinkingmachines/inkling-2-small | 78% (14/18) | 87% (33/38) | 100% (4/4) | 100% (5/5) | 68% (49/72) |
| google/gemini-4-carbon | 89% (16/18) | 100% (38/38) | 100% (4/4) | 100% (5/5) | 93% (67/72) |
| qwen/qwen4-max | 78% (14/18) | 95% (36/38) | 100% (4/4) | 100% (5/5) | 71% (51/72) |
| meta/muse-ember | 50% (9/18) | 66% (25/38) | 100% (4/4) | 100% (5/5) | 58% (42/72) |
| google/gemini-3.5-flash | 94% (17/18) | 92% (35/38) | 100% (4/4) | 100% (5/5) | 86% (62/72) |
| openai/gpt-6-luna | 72% (13/18) | 68% (26/38) | 100% (4/4) | 100% (5/5) | 71% (51/72) |
| anthropic/claude-haiku-5.5 | 72% (13/18) | 84% (32/38) | 100% (4/4) | 100% (5/5) | 76% (55/72) |

### openai/gpt-6.2-sol

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 7 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 9 +1 tubs | – | – | – |
| own-coffee-corner | ok | 9 +1 tubs | – | – | – |
| own-fridge-door | ok | 9 | – | – | – |
| own-cupboard-spices | ok | 15 +2 tubs | – | bread | – |
| own-counter-avocados | ok | 2 +2 tubs | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +2 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 5 +2 tubs | – | tahini ✓, soft white cheese ✓, green grapes ✓, bagged leafy greens, shredded red cabbage | – |
| web-pantry-cereal-boxes ° | too_far ✗ | 18 +3 tubs | pretzel | crispy fried onions, instant noodles ✓, salad dressing, dill pickles, pizza crust mix, gelatin dessert mix ✓, canned pineapple tidbits ✓, stuffing mix for chicken ✓, chicken-flavored rice mix, worcestershire sauce, canned refried beans ✓, canned baked beans | – |
| web-pantry-pots-dim ° | too_dark | 2 +3 tubs | pasta | cooking oil, red sauce | – |
| web-pantry-quaker ° | too_far ✗ | 18 +2 tubs | – | sesame tahini ✓, canned albacore tuna ✓, evaporated milk ✓, dried cranberries ✓, potato chips ✓, vegetable juice, yellow mustard, pickles | – |
| web-pantry-teddy-grahams ° | too_far ✗ | 9 +2 tubs | – | cocoa powder ✓, cornstarch ✓, dry yeast | – |
| web-kitchen-dark-counter ° | too_dark | 3 | – | tomato | – |
| web-spice-drawer ° | ok | 3 +4 tubs | zaatar | jarred herring ✓, pasta | – |
| web-shelf-soup-cans ° | too_far | 2 +5 tubs | – | dark sauce | – |
| web-pantry-full ° | ok | 30 +2 tubs | – | sodium citrate ✓, sliced bread ✓, cinnamon roll cereal, rice, flour, coffee capsules ✓, panko breadcrumbs, dried mushrooms, raspberry cookies ✓, ground gumbo filé ✓, shrimp paste ✓, creole seasoning, seafood seasoning, malted milk powder ✓, sesame oil, maple syrup | – |
| web-pantry-tidy ° | too_far ✗ | 25 +2 tubs | – | red wine, worcestershire sauce, seasoned salt ✓, white vinegar, hot sauce ✓, strawberry jam, canned tomatoes ✓, canned diced tomatoes with green chilies ✓, canned pasta rings ✓, flour, sugar, rice, lemon iced tea mix ✓, applesauce | – |
| web-closet-cleaning ° | too_far ✗ | 12 | broth | fried pork rinds ✓, canned chili, canned sloppy joe sauce ✓, bottled iced tea ✓, lemon-lime soda ✓ | – |
| web-counter-olive-oil ° | too_far ✗ | 3 +2 tubs | – | vinegar, black pepper | – |
| web-kitchen-rubbish ° | too_far | 1 +1 tubs | – | ketchup ✓ | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 25 +5 tubs | spinach | hard iced tea ✓, beer, chocolate breakfast drink ✓, pickled jalapeños ✓, syrup, salsa verde ✓, sweet chili dipping sauce ✓, wing sauce ✓, pasta with tomato sauce, bagged salad greens | – |
| commons-cellar-jars | ok | 3 +4 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 13 +3 tubs | – | – | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 3 +3 tubs | coriander | – | – |
| commons-fridge-night | ok | 8 +5 tubs | – | – | – |
| commons-fridge-persian ° | too_far | 10 +4 tubs | – | lettuce, hot sauce, flatbread, fruit syrup | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### google/gemini-4-hydrogen

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 7 | – | – | – |
| own-fridge-shelves | ok | 8 +2 tubs | – | – | – |
| own-coffee-corner | ok | 7 +1 tubs | candy | – | – |
| own-fridge-door | ok | 8 | sweet chili sauce | – | – |
| own-cupboard-spices | ok | 14 | soup almond | popcorn kernels ✓ | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 2 +2 tubs | – | white cheese ✓, tahini ✓ | – |
| web-pantry-cereal-boxes ° | ok | 10 | – | instant noodles ✓, seasoned pasta mix, canned corn, canned pasta ✓ | – |
| web-pantry-pots-dim ° | blurry ✗ | 3 +2 tubs | pasta | cooking oil, canned food, sauce | – |
| web-pantry-quaker ° | ok | 9 | flour | canned tuna ✓ | – |
| web-pantry-teddy-grahams ° | ok | 9 | – | mustard, cereal, chips | – |
| web-kitchen-dark-counter ° | too_far ✗ | 3 | – | tomato | – |
| web-spice-drawer ° | ok | 5 +1 tubs | – | garam masala ✓, oregano ✓, sichuan peppercorn ✓ | – |
| web-shelf-soup-cans ° | blurry ✗ | 3 +1 tubs | – | coffee, syrup | – |
| web-pantry-full ° | ok | 22 | cocoa | sodium citrate ✓, bread, cinnamon roll bar, white rice, flour, coffee pods ✓, raspberry cookies ✓, gumbo file, shrimp paste, soy sauce, vanilla extract | – |
| web-pantry-tidy ° | ok | 19 | – | wine, vinegar ✓, canned tomatoes ✓, canned tomatoes with green chilies ✓, hot sauce ✓, canned pasta ✓, flour, sugar, chocolate bar ✓, iced tea mix ✓ | – |
| web-closet-cleaning ° | too_far ✗ | 10 | twinkie, pretzel, broth | cereal bars ✓, sloppy joe sauce ✓, twinkies ✓, pork rinds ✓, iced tea ✓, flavored water ✓ | – |
| web-counter-olive-oil ° | ok | 2 +1 tubs | – | vinegar | – |
| web-kitchen-rubbish ° | too_far | 2 | – | pastry, instant noodles | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 20 +3 tubs | – | jalapeño peppers ✓, salsa verde ✓, hard iced tea ✓, beer ✓, breakfast drink ✓, almond creamer ✓, wing sauce ✓ | – |
| commons-cellar-jars | ok | 4 +3 tubs | apple, potted meat | – | – |
| commons-spice-shelf | ok | 12 +2 tubs | – | – | – |
| commons-freezer | ok | 4 +2 tubs | tortilla | – | – |
| commons-masala-dabba | ok | 6 | – | – | – |
| commons-fridge-night | ok | 8 +4 tubs | – | – | – |
| commons-fridge-persian ° | too_far | 7 +2 tubs | egg | cola ✓, hot sauce, juice | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### anthropic/claude-opus-5.5

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 7 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 13 +2 tubs | – | – | – |
| own-coffee-corner | ok | 9 | – | – | – |
| own-fridge-door | ok | 10 | – | – | – |
| own-cupboard-spices | ok | 17 +1 tubs | – | fenugreek seeds, tahini | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +3 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 4 +4 tubs | – | tahini ✓, white cheese ✓, shredded red cabbage, lettuce | – |
| web-pantry-cereal-boxes ° | ok | 16 | – | chicken stuffing mix ✓, canned evaporated milk, canned corn, canned vegetables, pasta side mix, salad dressing, mustard, chips | – |
| web-pantry-pots-dim ° | too_far | 7 +1 tubs | – | canned tomatoes, rice, olive oil, hot sauce, soy sauce, vinegar | – |
| web-pantry-quaker ° | ok | 17 +1 tubs | – | tahini, salt, tuna, salsa, mustard, potato crisps, cookies, tortilla chips | – |
| web-pantry-teddy-grahams ° | ok | 14 | – | cocoa powder, corn starch ✓, oats, chips, vinegar, cereal, snack mix | – |
| web-kitchen-dark-counter ° | too_dark | 6 | – | potatoes, tomato, bok choy | – |
| web-spice-drawer ° | ok | 3 +3 tubs | – | dried herbs | – |
| web-shelf-soup-cans ° | too_far | 8 +1 tubs | – | canned tomatoes, canned beans, salsa, soy sauce, peanuts, crackers, tomato sauce in a jar | – |
| web-pantry-full ° | ok | 29 | cooking spray | sodium citrate ✓, cinnamon roll baking mix, rice, flour, coffee capsules ✓, canned beans, cooking oil, raspberry cookies ✓, dried mushrooms, paprika, gumbo file ✓, vanilla extract, soy sauce, lentils, salsa, milk chocolate, coffee | – |
| web-pantry-tidy ° | ok | 23 | – | port wine, vinegar ✓, worcestershire sauce, canned tomatoes ✓, hot sauce, sugar, flour, cocoa powder, candy, iced tea mix, snack bars, spices | – |
| web-closet-cleaning ° | ok | 13 | twinkie, broth | canned chili, barbecue sauce, cereal bars ✓, pork rinds, fruit juice, sports drink | – |
| web-counter-olive-oil ° | ok | 3 +1 tubs | – | fresh herbs | – |
| web-kitchen-rubbish ° | ok | 2 | – | roast chicken, ketchup | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 23 +2 tubs | – | pickled jalapeños, salsa, twisted tea ✓, breakfast shake, chicken wing sauce, buffalo wing sauce, cut melon | – |
| commons-cellar-jars | ok | 7 | – | – | – |
| commons-spice-shelf | ok | 15 | – | – | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 6 | – | – | – |
| commons-fridge-night | ok | 11 +2 tubs | – | – | – |
| commons-fridge-persian ° | too_far | 14 +2 tubs | – | jam, hot sauce, pepsi ✓, orange juice concentrate, cabbage, yogurt, powdered drink mix, vinegar | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### openai/gpt-6.1-terra

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 5 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 8 +1 tubs | – | – | – |
| own-coffee-corner | ok | 6 | – | – | – |
| own-fridge-door | ok | 10 | – | – | – |
| own-cupboard-spices | ok | 14 | – | oats, bread | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 4 +1 tubs | – | tahini ✓, white cheese ✓, shredded red cabbage, green grapes | – |
| web-pantry-cereal-boxes ° | ok | 9 | pretzel | chicken stuffing mix ✓, chopped walnuts ✓, canned beans, canned corn, mustard | – |
| web-pantry-pots-dim ° | too_far | 3 +1 tubs | – | cooking oil, hot sauce | – |
| web-pantry-quaker ° | too_far ✗ | 13 | pancake mix | canned tuna ✓, evaporated milk ✓, cranberry juice, mustard, pickles | – |
| web-pantry-teddy-grahams ° | too_far ✗ | 8 | graham | cocoa powder ✓, cornstarch ✓, grated cheese | – |
| web-kitchen-dark-counter ° | too_far ✗ | 4 | – | bread rolls, tomatoes | – |
| web-spice-drawer ° | ok | 2 +1 tubs | zaatar | tikka masala sauce | – |
| web-shelf-soup-cans ° | too_far | 2 +2 tubs | – | pasta | – |
| web-pantry-full ° | too_far ✗ | 22 | – | sodium citrate ✓, bread ✓, rice ✓, flour, coffee capsules ✓, raspberry cookies, ground cumin ✓, vanilla extract ✓, dried mushrooms | – |
| web-pantry-tidy ° | too_far ✗ | 18 | – | red wine ✓, hot sauce ✓, canned tomatoes, canned tomatoes with green chilies ✓, canned pasta ✓, flour ✓, sugar ✓, iced tea mix ✓, spices | – |
| web-closet-cleaning ° | too_far ✗ | 11 | broth | sloppy joe sauce ✓, coffee creamer, potato chips, iced tea, lemon-lime soda | – |
| web-counter-olive-oil ° | too_far ✗ | 3 | – | pepper, leafy greens | – |
| web-kitchen-rubbish ° | too_far | 2 | – | ketchup, bread | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 19 +2 tubs | spinach | hard iced tea ✓, hard cider ✓, pickled jalapeños ✓, relish, sweet chili dipping sauce ✓, lemonade, carrots | – |
| commons-cellar-jars | ok | 3 +3 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 11 +2 tubs | cinnamon | – | – |
| commons-freezer | ok | 4 | tortilla | – | – |
| commons-masala-dabba | ok | 3 +2 tubs | coriander | – | – |
| commons-fridge-night | ok | 8 +2 tubs | – | – | – |
| commons-fridge-persian ° | too_far | 9 +1 tubs | – | green grapes, cabbage, yogurt, hot sauce | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### anthropic/claude-sonnet-5.5

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 6 +4 tubs | pickle, tomato paste | pickled peppers ✓, vegetable spread | – |
| own-fridge-shelves | ok | 10 +2 tubs | – | – | – |
| own-coffee-corner | ok | 8 | – | – | – |
| own-fridge-door | ok | 10 | – | – | – |
| own-cupboard-spices | ok | 15 +3 tubs | soup almond | bread | – |
| own-counter-avocados | ok | 2 +1 tubs | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 5 +2 tubs | – | mayonnaise, mustard, balsamic vinegar, instant coffee, pasta sauce | – |
| own-fridge-shelves-dark ° | too_dark | 5 +3 tubs | – | tahini ✓, white cheese spread, shredded red cabbage, leafy greens, pickled vegetables | – |
| web-pantry-cereal-boxes ° | ok | 18 | – | chicken stuffing mix, canned soup, canned vegetables, canned corn, canned tomatoes, canned beans, pasta sauce, pickles, salad dressing, mustard, canned chili | – |
| web-pantry-pots-dim ° | too_far | 6 +2 tubs | – | canned tomatoes, canned beans, olive oil, cereal, hot sauce | – |
| web-pantry-quaker ° | too_far ✗ | 18 | bread crumb | tahini, canned plain food, jam, mustard, canned tuna, pickles, chips, hot sauce, pasta sauce | – |
| web-pantry-teddy-grahams ° | ok | 11 | – | oats, snack chips, cookies, canned goods, cooking oil | – |
| web-kitchen-dark-counter ° | too_dark | 5 | – | tomato, bok choy | – |
| web-spice-drawer ° | too_far ✗ | 3 +5 tubs | – | dried herbs | – |
| web-shelf-soup-cans ° | too_dark | 8 +3 tubs | – | canned tomatoes, pasta sauce, hot sauce, soy sauce, honey, jam | – |
| web-pantry-full ° | ok | 31 +1 tubs | cooking spray | sodium citrate ✓, cinnamon roll protein bar ✓, canned beans, rice, flour, cooking oil, coffee capsules ✓, dried mushrooms, dried roots, raspberry cookies ✓, vanilla extract, soy sauce, gumbo file ✓, seasoning blend, spice jars, jam, hot chocolate mix, chocolate snack | – |
| web-pantry-tidy ° | ok | 22 | – | vinegar, port wine, sparkling wine, canned tomatoes ✓, canned tomatoes with green chilies ✓, hot sauce, iced tea mix, flour, sugar, cocoa powder, spices, seasoning packets, candy | – |
| web-closet-cleaning ° | ok | 14 | twinkie, broth | twinkies ✓, canned chili, barbecue sauce, corn chips, fruit snacks, juice, sports drink ✓, flavored water | – |
| web-counter-olive-oil ° | ok | 5 +1 tubs | – | black pepper, fresh herbs, canned fish | – |
| web-kitchen-rubbish ° | ok | 2 +2 tubs | – | roast chicken, ketchup | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 21 +5 tubs | – | pickled jalapeño peppers, salsa, buffalo wing sauce, iced tea, protein shake | – |
| commons-cellar-jars | ok | 6 +2 tubs | potted meat | – | – |
| commons-spice-shelf | ok | 16 +1 tubs | – | – | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 7 | – | – | – |
| commons-fridge-night | ok | 12 +1 tubs | – | – | – |
| commons-fridge-persian ° | ok | 15 +2 tubs | – | juice, jam, hot sauce, orange juice, cooking oil, soft drink, lettuce, green vegetables, fruit spread in red jar | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### thinkingmachines/inkling-2-small

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 5 +4 tubs | coconut oil | unidentified food in orange box | – |
| own-fridge-shelves | ok | 9 +5 tubs | white cheese | – | – |
| own-coffee-corner | ok | 7 +2 tubs | – | – | – |
| own-fridge-door | ok | 9 +2 tubs | – | – | – |
| own-cupboard-spices | ok | 12 +7 tubs | soup almond, garlic powder | – | – |
| own-counter-avocados | ok | 2 +2 tubs | cracker | cornflakes cereal | – |
| own-produce-corner | ok | 4 +1 tubs | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +5 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 2 +4 tubs | – | tahini, leafy greens | – |
| web-pantry-cereal-boxes ° | ok | 16 +1 tubs | pretzel | chicken broth, bananas ✓, honey roasted nuts, soy sauce, jarred sauce, ice cream, canned tomatoes, cookies, milk, canned goods, chips | – |
| web-pantry-pots-dim ° | too_dark | 4 +1 tubs | pasta | olive oil, hot sauce, canned tomatoes, canned chickpeas | – |
| web-pantry-quaker ° | ok | 9 +1 tubs | hazelnut spread, pancake mix, cracker, chili, bread crumb | cocoa, salsa, cereal, canned tomatoes, hot sauce | – |
| web-pantry-teddy-grahams ° | ok | 9 +1 tubs | corn syrup | corn starch, vinegar, cooking oil, potato chips, cereal, soy sauce | – |
| web-kitchen-dark-counter ° | too_dark | 5 | – | tomatoes, bread roll | – |
| web-spice-drawer ° | ok | 1 +6 tubs | zaatar, paprika | pesto | – |
| web-shelf-soup-cans ° | too_dark | 5 +3 tubs | soup | mixed spices, soy sauce, hot sauce, tomato sauce, jam or preserves | – |
| web-pantry-full ° | ok | 16 +2 tubs | cooking spray, cocoa, bbq sauce, peppercorn | sodium citrate ✓, bread ✓, wine, soy sauce, cookies, chips | – |
| web-pantry-tidy ° | ok | 19 +2 tubs | soup, chili, cheese puff, lemonade | red wine, worcestershire sauce ✓, hot sauce, canned tomatoes ✓, canned peaches, sugar, flour, cocoa powder, canned chickpeas, cornmeal, pickles, spices | – |
| web-closet-cleaning ° | ok | 7 +1 tubs | bean, twinkie, pretzel, broth | twinkies, barbecue sauce, bottled soda, chips | – |
| web-counter-olive-oil ° | ok | 3 +2 tubs | – | wine, leafy greens | – |
| web-kitchen-rubbish ° | ok | 2 +2 tubs | – | cooking spray, leftover pizza | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 19 +3 tubs | spinach | pickles, balsamic vinegar, canned corn, coffee creamer, leafy greens, bananas ✓, jam | – |
| commons-cellar-jars | ok | 6 +1 tubs | apple | roasted red peppers | – |
| commons-spice-shelf | ok | 10 +5 tubs | cinnamon | – | – |
| commons-freezer | ok | 4 | – | – | – |
| commons-masala-dabba | ok | 5 +1 tubs | – | – | – |
| commons-fridge-night | ok | 10 | egg | – | – |
| commons-fridge-persian ° | ok | 17 +3 tubs | – | juice, pickles, jam, yogurt, white onions, lettuce, papaya, hot sauce, orange juice, bottled water, cooking oil | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### google/gemini-4-carbon

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 8 +3 tubs | – | lasagna sheets ✓ | – |
| own-fridge-shelves | ok | 15 +5 tubs | – | – | – |
| own-coffee-corner | ok | 9 +1 tubs | – | – | – |
| own-fridge-door | ok | 10 +1 tubs | – | – | – |
| own-cupboard-spices | ok | 16 +3 tubs | – | tahini | – |
| own-counter-avocados | ok | 3 +1 tubs | – | – | – |
| own-produce-corner | ok | 4 +2 tubs | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 1 +5 tubs | – | spaghetti | – |
| own-fridge-shelves-dark ° | too_dark | 9 +4 tubs | – | soft white cheese ✓, tahini ✓, green grapes, shredded red cabbage, lettuce, chicken soup powder, butter, sliced yellow cheese, vanilla extract | – |
| web-pantry-cereal-boxes ° | ok | 21 +3 tubs | – | chicken stuffing mix ✓, instant ramen ✓, yellow mustard ✓, macaroni and cheese ✓, chicken noodle side, canned chicken ✓, canned corn ✓, canned black beans ✓, canned soup ✓, gelatin mix, salad dressing, marinade, peanut butter, canned tuna | – |
| web-pantry-pots-dim ° | blurry ✗ | 5 +5 tubs | pasta | cooking oil, hot sauce, soy sauce, cereal, canned soup | – |
| web-pantry-quaker ° | ok | 23 +2 tubs | flour | sesame tahini ✓, canned tuna ✓, mustard ✓, applesauce, pita chips ✓, instant noodles ✓, potato chips, marshmallows, pasta sauce, pickles, maple syrup, baking soda, broth | – |
| web-pantry-teddy-grahams ° | blurry ✗ | 15 +2 tubs | – | breadsticks, oats, coffee creamer ✓, hot cocoa mix ✓, mustard, chips, peanuts, canned vegetables, frosting, cookies | – |
| web-kitchen-dark-counter ° | too_far ✗ | 4 +2 tubs | – | tomato, olive oil | – |
| web-spice-drawer ° | ok | 10 +5 tubs | – | garam masala ✓, coriander, oregano ✓, sichuan pepper ✓, sesame seeds, bay leaves, miso paste, furikake | – |
| web-shelf-soup-cans ° | too_far | 7 +4 tubs | – | coffee, hot sauce, honey, pretzels, cornstarch, pancake syrup | – |
| web-pantry-full ° | ok | 27 +2 tubs | cocoa | sodium citrate ✓, bread, cereal ✓, white rice, flour, coffee pods ✓, cookies ✓, chocolate ✓, gumbo file ✓, shrimp paste, malted milk powder ✓, sesame oil ✓, vanilla extract ✓, chives ✓ | – |
| web-pantry-tidy ° | too_far ✗ | 34 +3 tubs | – | white vinegar ✓, coconut oil, cooking spray, red wine vinegar, sparkling grape juice, barbecue sauce, hot sauce ✓, vodka sauce, tomato paste ✓, canned diced tomatoes ✓, diced tomatoes and green chilies ✓, canned tomatoes ✓, canned ravioli ✓, canned spaghetti ✓, iced tea mix ✓, sunflower butter ✓, milk chocolate bars ✓, flour, sugar, cocoa powder, peppermint candies, honey, apple pie filling | – |
| web-closet-cleaning ° | too_far ✗ | 16 | twinkie, broth | cereal bars ✓, pork rinds ✓, lemon-lime soda ✓, flavored water ✓, iced tea ✓, canned chili ✓, sloppy joe sauce, canned peas ✓, barbecue sauce | – |
| web-counter-olive-oil ° | ok | 4 +3 tubs | – | vinegar, black pepper | – |
| web-kitchen-rubbish ° | too_far | 2 +3 tubs | – | pastry, bread | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 28 +5 tubs | – | pickled jalapenos ✓, buffalo wing sauce, green salsa ✓, hard iced tea ✓, beer ✓, protein shake ✓, half and half, margarita mix, wing sauce ✓ | – |
| commons-cellar-jars | ok | 4 +2 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 12 +5 tubs | – | – | – |
| commons-freezer | ok | 7 +2 tubs | – | raisin bran, frozen broccoli | – |
| commons-masala-dabba | ok | 5 +1 tubs | – | – | – |
| commons-fridge-night | ok | 10 +4 tubs | – | – | – |
| commons-fridge-persian ° | too_far | 17 +5 tubs | – | melon, hot sauce ✓, cola ✓, chocolate hazelnut spread, juice, cream cheese, jam, verjuice, lemon juice, rosewater, malt beverage | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### qwen/qwen4-max

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 6 +3 tubs | – | – | – |
| own-fridge-shelves | ok | 12 +5 tubs | – | – | – |
| own-coffee-corner | ok | 6 +4 tubs | – | – | – |
| own-fridge-door | ok | 9 +2 tubs | – | – | – |
| own-cupboard-spices | ok | 14 +2 tubs | soup almond, mixed vegetable | canned fruit cocktail, tahini | – |
| own-counter-avocados | ok | 3 +1 tubs | – | whipped cream spray | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +3 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 4 +5 tubs | – | tahini ✓, white cheese, shredded red cabbage, bagged leafy greens | – |
| web-pantry-cereal-boxes ° | ok | 20 +1 tubs | – | bananas ✓, chicken broth, canned soup, canned vegetables, canned beans, salsa, salad dressing, worcestershire sauce, yogurt, potato chips, dried pasta | – |
| web-pantry-pots-dim ° | too_far | 4 +4 tubs | pasta | cooking oil, vinegar, sauce in a squeeze bottle, jar of pickled vegetables | – |
| web-pantry-quaker ° | ok | 19 | – | mustard, ketchup, cinnamon, cake mix, cream, margarine, rice, sugar, pickles | – |
| web-pantry-teddy-grahams ° | ok | 13 +1 tubs | graham | cornstarch ✓, cocoa powder ✓, breakfast cereal, hot sauce, soy sauce, chips, cooking oil | – |
| web-kitchen-dark-counter ° | too_dark | 5 +1 tubs | – | oranges, bread | – |
| web-spice-drawer ° | ok | 3 +3 tubs | zaatar, paprika | pickled herring, flatbread, curry sauce | – |
| web-shelf-soup-cans ° | too_far | 2 +4 tubs | soup | soy sauce, peanuts | – |
| web-pantry-full ° | ok | 25 +3 tubs | cocoa | sodium citrate ✓, bread ✓, cinnamon roll bars, rice, flour, coffee capsules, raspberry cookies, tortilla chips, gumbo file powder, sesame oil, vanilla extract, seasoning blend in a kamayan jar | – |
| web-pantry-tidy ° | ok | 20 +1 tubs | chili | tabasco sauce ✓, canned diced tomatoes with green chilies ✓, iced tea mix, flour, sugar, assorted spices in shaker jars, chocolate hazelnut spread, snack bars, bagged snacks, liquor | – |
| web-closet-cleaning ° | ok | 11 | bean, twinkie, pretzel, broth | twinkies ✓, canned vegetables, pasta sauce, raisins, chips, cooking spray, sports drink, bottled juice | – |
| web-counter-olive-oil ° | ok | 3 +2 tubs | – | fresh herbs in a plastic bag, black pepper | – |
| web-kitchen-rubbish ° | ok | 2 | – | cereal, bread rolls | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | failed | 0 | mustard, ketchup, mayonnaise, soy sauce, hot sauce, milk, egg, english muffin, steak sauce, bbq sauce, salad dressing, spinach | – | – |
| commons-cellar-jars | ok | 4 +2 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 14 +4 tubs | – | turmeric | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 5 +1 tubs | – | – | – |
| commons-fridge-night | ok | 10 +2 tubs | – | – | – |
| commons-fridge-persian ° | ok | 22 +3 tubs | – | melon ✓, cabbage, cauliflower, green grapes, fresh herbs, juice, yogurt, cream cheese, jam, pickles, cooking oil, orange juice, hot sauce, soda, lemon juice, cheese | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### meta/muse-ember

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 3 +2 tubs | tomato paste, coconut oil | – | – |
| own-fridge-shelves | ok | 5 +5 tubs | white cheese, tahini | – | – |
| own-coffee-corner | ok | 6 +2 tubs | chocolate milk powder | soy sauce | – |
| own-fridge-door | ok | 6 | sweet chili sauce | – | – |
| own-cupboard-spices | ok | 6 +5 tubs | soup almond, hazelnut spread, mixed vegetable, garlic powder, chicken seasoning, brown sugar | bread rolls | – |
| own-counter-avocados | ok | 2 +1 tubs | cracker | ptitim ✓ | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 0 +5 tubs | – | – | – |
| web-pantry-cereal-boxes ° | ok | 7 +2 tubs | pretzel | chicken stock | – |
| web-pantry-pots-dim ° | blurry ✗ | 4 +2 tubs | pasta | cereal, canned food, cooking oil, sauce | – |
| web-pantry-quaker ° | blurry ✗ | 7 | pancake mix, chili, bread crumb | cereal | – |
| web-pantry-teddy-grahams ° | ok | 7 | – | corn starch, chex cereal, potato chips | – |
| web-kitchen-dark-counter ° | too_dark | 5 | – | oranges, potatoes | – |
| web-spice-drawer ° | ok | 1 +5 tubs | zaatar, paprika | seeds | – |
| web-shelf-soup-cans ° | blurry ✗ | 3 +1 tubs | soup | canned food, bottled sauce, peanut butter | – |
| web-pantry-full ° | ok | 3 | cayenne, cooking spray, sardine, macaroni, crushed tomato, cocoa, salt, bbq sauce, peppercorn | – | – |
| web-pantry-tidy ° | ok | 6 +1 tubs | chili, lemonade, pasta sauce, peanut butter | hazelnut spread | – |
| web-closet-cleaning ° | too_far ✗ | 2 +5 tubs | soup, bean, cracker, twinkie, pretzel, broth | twinkies ✓ | – |
| web-counter-olive-oil ° | ok | 2 +3 tubs | – | pepper | – |
| web-kitchen-rubbish ° | ok | 2 | – | roast chicken ✓, steak sauce | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 10 +2 tubs | egg, english muffin, bbq sauce, spinach | pickles ✓, bananas ✓ | – |
| commons-cellar-jars | ok | 0 +5 tubs | cherry, plum, apple, apricot, potted meat | – | – |
| commons-spice-shelf | ok | 12 +5 tubs | cinnamon | – | – |
| commons-freezer | ok | 2 | – | – | – |
| commons-masala-dabba | ok | 6 | – | – | – |
| commons-fridge-night | ok | 6 +4 tubs | pickle, egg | – | – |
| commons-fridge-persian ° | too_far | 15 +3 tubs | – | broccoli ✓, cauliflower ✓, lettuce ✓, avocado, hot sauce, cooking oil, juice, soda, wine, jam | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### google/gemini-3.5-flash

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 7 | – | – | – |
| own-fridge-shelves | ok | 9 +4 tubs | – | – | – |
| own-coffee-corner | ok | 7 | – | – | – |
| own-fridge-door | ok | 9 | – | iced coffee ✓ | – |
| own-cupboard-spices | ok | 15 | soup almond, mixed vegetable, garlic powder | tapioca pearls, canned fruit ✓, biscuits, halva ✓ | – |
| own-counter-avocados | ok | 3 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +5 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 4 +3 tubs | – | tahini ✓, cream cheese ✓, sour cream, grapes | – |
| web-pantry-cereal-boxes ° | ok | 14 | – | cup noodles ✓, canned sweet potatoes ✓, peanut butter ✓, chicken stuffing mix ✓, chicken flavored pasta ✓, salad dressing ✓, canned soup ✓, canned beans, marshmallow fluff ✓ | – |
| web-pantry-pots-dim ° | ok | 9 +1 tubs | – | cereal ✓, canned soup ✓, cooking oil ✓, ketchup ✓, hot sauce, soy sauce, vinegar, spices | – |
| web-pantry-quaker ° | ok | 14 | cracker | canned tuna ✓, maple syrup ✓, marshmallows ✓, honey ✓, marinara sauce, sesame tahini ✓ | – |
| web-pantry-teddy-grahams ° | ok | 9 | – | quick oats ✓, cocoa powder ✓, corn starch ✓, parmesan cheese ✓ | – |
| web-kitchen-dark-counter ° | ok | 5 | – | potato ✓ | – |
| web-spice-drawer ° | ok | 6 +2 tubs | – | herring ✓, sichuan pepper ✓, sesame seeds ✓, pink salt | – |
| web-shelf-soup-cans ° | ok | 9 | – | maple syrup ✓, soy sauce ✓, ketchup ✓, honey ✓, instant coffee ✓, hot sauce, canned tomato paste, jar of snacks | – |
| web-pantry-full ° | ok | 14 +2 tubs | cooking spray, crushed tomato, cocoa, spaghetti, salt, peppercorn | sodium citrate ✓, red curry paste ✓, coconut milk ✓, cookies ✓, soy sauce ✓, vanilla extract ✓, sprinkles ✓, dried mushrooms ✓ | – |
| web-pantry-tidy ° | ok | 15 +3 tubs | – | canned tomatoes ✓, hot sauce ✓, soy sauce ✓, white vinegar ✓, marshmallow fluff ✓, baking powder ✓ | – |
| web-closet-cleaning ° | ok | 7 | bean, twinkie, broth | twinkies ✓, tortilla chips, bottled juice | – |
| web-counter-olive-oil ° | ok | 6 | – | white wine vinegar, peppercorns, canned tuna, garlic ✓, herbs | – |
| web-kitchen-rubbish ° | ok | 2 | – | fried chicken, bread | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 20 +2 tubs | – | pickled peppers ✓, creamer ✓, yellow bell pepper ✓, hard cider ✓, buffalo wild wings sauce ✓ | – |
| commons-cellar-jars | ok | 6 | apple | – | – |
| commons-spice-shelf | ok | 14 | – | – | – |
| commons-freezer | ok | 6 | – | hard seltzer ✓, raisin bran ✓ | – |
| commons-masala-dabba | ok | 6 | – | – | – |
| commons-fridge-night | ok | 10 | – | – | – |
| commons-fridge-persian ° | ok | 14 +1 tubs | – | hot sauce ✓, lemon juice, orange juice ✓, cabbage ✓, cola ✓, jam, butter, yogurt | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### openai/gpt-6-luna

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 6 +1 tubs | pickle, coconut oil | eggplant in vinegar ✓ | – |
| own-fridge-shelves | ok | 8 +1 tubs | tahini | cream | – |
| own-coffee-corner | ok | 4 | candy, chocolate milk powder | – | – |
| own-fridge-door | ok | 8 | wine, sweet chili sauce | tomato sauce | – |
| own-cupboard-spices | ok | 8 | soup almond, mixed vegetable, garlic powder, chicken seasoning | – | – |
| own-counter-avocados | ok | 3 +1 tubs | cracker | whipped cream, parve cream substitute ✓ | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 2 +4 tubs | – | white cheese, cream | – |
| web-pantry-cereal-boxes ° | ok | 7 | cereal, pretzel | chicken stuffing mix ✓, chicken-flavored noodles, gelatin dessert mix ✓ | – |
| web-pantry-pots-dim ° | too_dark | 0 +3 tubs | pasta | – | – |
| web-pantry-quaker ° | ok | 9 | pancake mix, chickpea | tahini ✓, albacore tuna ✓ | – |
| web-pantry-teddy-grahams ° | too_far ✗ | 3 | graham, pasta sauce | cornstarch ✓ | – |
| web-kitchen-dark-counter ° | ok | 4 | – | tomatoes ✓, squash | – |
| web-spice-drawer ° | ok | 1 +1 tubs | zaatar, paprika | pickled herring ✓ | – |
| web-shelf-soup-cans ° | too_far | 1 | soup | cola ✓ | – |
| web-pantry-full ° | ok | 16 | crushed tomato, bbq sauce, peppercorn | sodium citrate ✓, white rice, flour, granola, dried mushrooms, raspberry cookies ✓, turmeric ✓ | – |
| web-pantry-tidy ° | ok | 20 | chili, lemonade, peanut butter | flour ✓, sugar, canned tomatoes ✓, tomatoes and green chilies ✓, spaghetti, canned vegetables, ketchup ✓, hot sauce, mustard, vinegar, cooking oil, canned fruit, crackers | – |
| web-closet-cleaning ° | ok | 4 | soup, cracker, twinkie, pretzel, broth | twinkies ✓, soda ✓ | – |
| web-counter-olive-oil ° | ok | 1 +2 tubs | – | – | – |
| web-kitchen-rubbish ° | ok | 0 | – | – | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 14 +2 tubs | steak sauce | pickled jalapeños, yogurt | – |
| commons-cellar-jars | ok | 4 +1 tubs | cherry, potted meat | – | – |
| commons-spice-shelf | ok | 11 +1 tubs | cinnamon | sea salt ✓ | – |
| commons-freezer | ok | 5 | – | oatmeal ✓, kombucha ✓ | – |
| commons-masala-dabba | ok | 6 | – | – | – |
| commons-fridge-night | ok | 7 +3 tubs | egg | – | – |
| commons-fridge-persian ° | ok | 11 | – | jam, yogurt, lettuce, hot sauce, orange juice | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### anthropic/claude-haiku-5.5

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 5 +2 tubs | pickle, coconut oil | pickled peppers ✓ | – |
| own-fridge-shelves | ok | 10 +1 tubs | – | pickles | – |
| own-coffee-corner | ok | 7 +1 tubs | – | – | – |
| own-fridge-door | ok | 10 | – | soy sauce | – |
| own-cupboard-spices | ok | 18 +1 tubs | soup almond, hazelnut spread, mixed vegetable, garlic powder | hazelnut cocoa spread ✓, canned fruit, yogurt, sesame seeds, ground spice | – |
| own-counter-avocados | ok | 3 | – | – | – |
| own-produce-corner | ok | 5 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 1 +3 tubs | – | pasta | – |
| own-fridge-shelves-dark ° | too_dark | 4 +4 tubs | – | cottage cheese, tahini ✓, lettuce, red cabbage salad | – |
| web-pantry-cereal-boxes ° | ok | 16 +1 tubs | – | chicken broth ✓, chicken noodle soup, oatmeal, canned tuna, canned fruit, canned vegetables, canned soup, canned beans, popcorn, dried fruit | – |
| web-pantry-pots-dim ° | ok | 6 +2 tubs | pasta | rice, canned goods, cooking oil, vinegar, hot sauce, cereal | – |
| web-pantry-quaker ° | ok | 8 +1 tubs | peanut, chili, bread crumb | sugar, ketchup | – |
| web-pantry-teddy-grahams ° | ok | 9 | graham, corn syrup | cooking oil ✓, cereal, sugar, chips, milk, hot chocolate, aluminum foil | – |
| web-kitchen-dark-counter ° | ok | 3 | – | potato ✓ | – |
| web-spice-drawer ° | ok | 6 +1 tubs | zaatar, paprika | jam, pickled vegetables, dried seaweed, rice crackers, dried herbs, chocolate spread | – |
| web-shelf-soup-cans ° | ok | 5 +1 tubs | – | ketchup, soy sauce, canned tomatoes, canned beans | – |
| web-pantry-full ° | ok | 37 | cooking spray, bbq sauce | citric acid ✓, almond milk, rice, flour, maple syrup, garlic ✓, smoked paprika, ground cumin, garam masala, kamayan seasoning ✓, soy sauce, vanilla extract ✓, raspberry tea, coffee capsules ✓, pretzels, walnuts, dried mushrooms, sweet potato chips, cider vinegar, olive oil, coconut milk, gum arabic, cinnamon roll mix, mustard, pickles | – |
| web-pantry-tidy ° | ok | 19 | lemonade, steak sauce | pasta, flour, sugar, candy, green beans, corn, vinegar, hot sauce, oil | – |
| web-closet-cleaning ° | ok | 10 | cracker, nutty bar, twinkie, pretzel, broth | brown sugar, cereal, canned vegetables, candy bars ✓, twinkies ✓, chips, pasta, cola | – |
| web-counter-olive-oil ° | ok | 3 +1 tubs | – | vinegar, black pepper | – |
| web-kitchen-rubbish ° | ok | 2 | – | roast chicken, cereal box | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 26 +4 tubs | – | pickled jalapeños ✓, pickled peppers, sweet pickle relish, iced tea, buffalo wing sauce ✓, sriracha, sweet and sour sauce, orange juice, frozen vegetables, leafy greens ✓, sour cream, cottage cheese | – |
| commons-cellar-jars | ok | 8 +2 tubs | potted meat | vegetable relish | – |
| commons-spice-shelf | ok | 13 +1 tubs | cinnamon | dried flakes | – |
| commons-freezer | ok | 8 | tortilla | pastries, eggs ✓, sparkling water | – |
| commons-masala-dabba | ok | 7 | – | – | – |
| commons-fridge-night | ok | 11 | pickle, egg | milk, pickled vegetables | – |
| commons-fridge-persian ° | ok | 14 +1 tubs | – | jam, yogurt, lime ✓, hot sauce, mineral water, orange juice, vegetable oil, pickles | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

## large photos, names in he

| Model | Photos | Failed | Made up (sure) | Right items | Found | Label only | Not food | Photo verdict | Sure on unreadable | Unchecked | Typical / slow | Cost per photo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openai/gpt-6.2-sol | 30 | 0 | 1 (1) | 99% | 93% (127/137) | 94% (87/93) | 0 | 30/30 | 2 | 84 | 8.0 s / 22.3 s | $0.0130 |
| openai/gpt-6.1-terra | 30 | 0 | 1 (0) | 99% | 91% (125/137) | 94% (87/93) | 0 | 29/30 | 2 | 59 | 10.0 s / 22.1 s | $0.0060 |
| anthropic/claude-sonnet-5.5 | 30 | 0 | 4 (1) | 96% | 93% (128/137) | 92% (86/93) | 0 | 30/30 | 2 | 87 | 5.6 s / 9.6 s | $0.0145 |

Spent on this set: $1.00.

Found, by where the kitchen is:

| Model | eu | il | in | ir | us |
|---|---|---|---|---|---|
| openai/gpt-6.2-sol | 83% (15/18) | 97% (37/38) | 75% (3/4) | 100% (5/5) | 93% (67/72) |
| openai/gpt-6.1-terra | 83% (15/18) | 97% (37/38) | 75% (3/4) | 100% (5/5) | 90% (65/72) |
| anthropic/claude-sonnet-5.5 | 94% (17/18) | 92% (35/38) | 100% (4/4) | 100% (5/5) | 93% (67/72) |

### openai/gpt-6.2-sol

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 6 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 8 +4 tubs | – | – | – |
| own-coffee-corner | ok | 9 +1 tubs | – | – | – |
| own-fridge-door | ok | 9 +1 tubs | – | – | – |
| own-cupboard-spices | ok | 13 +4 tubs | hazelnut spread | hazelnut cocoa spread ✓ | – |
| own-counter-avocados | ok | 2 +1 tubs | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 +4 tubs | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 5 +2 tubs | – | tahini ✓, soft white cheese ✓, red cabbage salad, green grapes, leafy greens | – |
| web-pantry-cereal-boxes ° | ok | 15 +3 tubs | pretzel | chicken-flavored stuffing mix ✓, chicken-flavored rice ✓, balsamic vinegar ✓, canned corn ✓, gelatin dessert mix ✓, canned baked beans, ranch style beans | – |
| web-pantry-pots-dim ° | too_dark | 4 +3 tubs | pasta | cooking oil, hot sauce, canned beans, canned chickpeas | – |
| web-pantry-quaker ° | ok | 20 +2 tubs | – | sesame tahini ✓, canned albacore tuna ✓, evaporated milk ✓, chocolate drink mix ✓, dried cranberries ✓, corn chips ✓, marshmallows, maple syrup, pickles | – |
| web-pantry-teddy-grahams ° | ok | 11 | – | cornstarch ✓, cocoa powder ✓, cake mix, cooking spray, chips, nuts in a jar | – |
| web-kitchen-dark-counter ° | too_dark | 4 +1 tubs | – | tomato, eggplant | – |
| web-spice-drawer ° | ok | 2 +5 tubs | zaatar | mustard seeds | – |
| web-shelf-soup-cans ° | ok | 3 +2 tubs | – | soy sauce, crushed red pepper | – |
| web-pantry-full ° | ok | 28 +2 tubs | – | sodium citrate ✓, sliced bread ✓, rice, flour, coffee capsules ✓, canned mixed beans, dried mushrooms, raspberry cookies ✓, gumbo filé powder ✓, shrimp paste, cheese crisps ✓, malted milk drink powder ✓, sesame oil, maple-flavored syrup | – |
| web-pantry-tidy ° | ok | 22 +2 tubs | – | marsala wine, soy sauce, worcestershire sauce, white vinegar ✓, hot sauce ✓, canned tomatoes, canned tomatoes and green chilies ✓, flour ✓, sugar, iced tea mix ✓ | – |
| web-closet-cleaning ° | ok | 13 | broth | canned chili, potato chips, iced tea ✓, sports drink, lemon-lime soda | – |
| web-counter-olive-oil ° | ok | 3 +1 tubs | – | vinegar, garlic | – |
| web-kitchen-rubbish ° | ok | 2 | – | roast chicken, bread | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 27 +5 tubs | spinach | pickled jalapeños ✓, pancake syrup, salsa verde ✓, hard iced tea ✓, pale ale ✓, almond coffee creamer ✓, breakfast drink ✓, bagged leafy greens, bananas ✓, classic wing sauce, wing sauce ✓ | – |
| commons-cellar-jars | ok | 3 +4 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 11 +5 tubs | cinnamon | – | – |
| commons-freezer | ok | 6 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 3 +3 tubs | coriander | – | – |
| commons-fridge-night | ok | 8 +5 tubs | – | – | – |
| commons-fridge-persian ° | ok | 10 +5 tubs | – | hot sauce, lettuce, bread, fruit juice concentrate | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### openai/gpt-6.1-terra

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 5 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 9 | – | – | – |
| own-coffee-corner | ok | 7 | – | – | – |
| own-fridge-door | ok | 10 | – | – | – |
| own-cupboard-spices | ok | 12 +1 tubs | mixed vegetable | canned fruit cocktail | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 4 +1 tubs | – | tahini ✓, white cheese ✓, shredded red cabbage, green grapes | – |
| web-pantry-cereal-boxes ° | ok | 11 | pretzel | chicken stuffing mix ✓, flavored gelatin ✓, canned sweet potatoes ✓, blueberry pie filling ✓, fried onions, coffee creamer ✓, mustard | – |
| web-pantry-pots-dim ° | too_dark | 4 +1 tubs | – | cooking oil, canned beans, bottled sauce | – |
| web-pantry-quaker ° | ok | 14 | bread crumb | canned tuna ✓, evaporated milk ✓, pickles, tomato sauce, marshmallows | – |
| web-pantry-teddy-grahams ° | ok | 7 | – | cocoa powder ✓, corn starch | – |
| web-kitchen-dark-counter ° | ok | 4 | – | orange bell pepper, bread | – |
| web-spice-drawer ° | ok | 3 +1 tubs | zaatar | canned anchovies, dried pasta | – |
| web-shelf-soup-cans ° | blurry ✗ | 1 +1 tubs | – | – | – |
| web-pantry-full ° | ok | 23 | salt | sodium citrate ✓, sliced bread ✓, rice, flour, coffee capsules ✓, raspberry cookies ✓, dried mushrooms, ground cumin ✓, sesame oil, vanilla extract | – |
| web-pantry-tidy ° | ok | 17 | – | red wine ✓, vodka ✓, hot sauce ✓, canned tomatoes with green chilies ✓, iced tea mix ✓, flour ✓, sugar ✓ | – |
| web-closet-cleaning ° | ok | 11 | – | sloppy joe sauce ✓, iced tea, soda ✓, potato chips | – |
| web-counter-olive-oil ° | ok | 3 | – | black pepper, herbs | – |
| web-kitchen-rubbish ° | ok | 2 | – | ketchup, bread roll | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 18 +2 tubs | milk, steak sauce | pickled jalapeño peppers ✓, hard iced tea ✓, breakfast drink ✓, almond coffee creamer ✓, bananas ✓, chicken wing sauce ✓ | – |
| commons-cellar-jars | ok | 3 +3 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 11 | cinnamon | – | – |
| commons-freezer | ok | 4 | tortilla | – | – |
| commons-masala-dabba | ok | 3 +2 tubs | coriander | – | – |
| commons-fridge-night | ok | 8 +1 tubs | – | – | – |
| commons-fridge-persian ° | ok | 8 +1 tubs | – | yogurt, lettuce, jam | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### anthropic/claude-sonnet-5.5

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 6 +3 tubs | pickle | pickled peppers in vinegar ✓ | – |
| own-fridge-shelves | ok | 10 +2 tubs | – | – | – |
| own-coffee-corner | ok | 9 | – | – | – |
| own-fridge-door | ok | 10 | – | – | – |
| own-cupboard-spices | ok | 14 +1 tubs | soup almond, mixed vegetable | canned fruit cocktail, fenugreek, tahini | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 5 | – | olive oil, mayonnaise, mustard, spice, instant coffee | – |
| own-fridge-shelves-dark ° | too_dark | 5 +2 tubs | – | tahini ✓, white cheese ✓, red cabbage, leafy greens, pickles | – |
| web-pantry-cereal-boxes ° | ok | 14 | – | canned vegetables, canned corn, dark sauce, mustard, jarred pickles or olives, packaged pasta meal | – |
| web-pantry-pots-dim ° | too_far | 6 +1 tubs | pasta | canned goods, boxed cereal, olive oil, dark sauce, canned tomatoes, rice | – |
| web-pantry-quaker ° | ok | 15 | – | tahini, potato chips, jam, mustard, hot sauce, canned tuna | – |
| web-pantry-teddy-grahams ° | ok | 11 | graham | oats, bag of chips, oil, canned food, boxed cereal or snacks, boxed cookies | – |
| web-kitchen-dark-counter ° | too_dark | 5 | – | bok choy, tomato | – |
| web-spice-drawer ° | ok | 6 +1 tubs | – | spice in a jar, dried herbs, nuts or seeds, spread in a jar | – |
| web-shelf-soup-cans ° | too_dark | 6 +3 tubs | – | ketchup, hot sauce, soy sauce, canned food, bottled sauce | – |
| web-pantry-full ° | ok | 24 | – | sodium citrate ✓, cinnamon roll bar, nespresso capsules ✓, rice, flour, raspberry cookies ✓, dried roots, vanilla extract, soy sauce, gumbo file powder, jarred sauce | – |
| web-pantry-tidy ° | ok | 20 | – | vinegar, port wine, canned tomatoes ✓, hot sauce, flour, sugar, candy, spices, snack packets | – |
| web-closet-cleaning ° | ok | 12 | twinkie, broth | twinkies ✓, canned chili, barbecue sauce, snack chips, bottled juice, sports drink | – |
| web-counter-olive-oil ° | ok | 4 +1 tubs | – | fresh herbs in a bag, basil leaf | – |
| web-kitchen-rubbish ° | ok | 2 +2 tubs | – | roast chicken, red sauce bottle | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 19 +3 tubs | egg | pickled hot peppers, buffalo wing sauce, caramel coffee creamer, iced tea, protein shake | – |
| commons-cellar-jars | ok | 4 +3 tubs | potted meat | – | – |
| commons-spice-shelf | ok | 17 | – | – | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 7 | – | – | – |
| commons-fridge-night | ok | 12 +1 tubs | – | – | – |
| commons-fridge-persian ° | ok | 13 +2 tubs | – | boxed juice, hot sauce, jam, orange juice, cooking oil, vinegar, lettuce | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### Names in he on Yarden's photos

**openai/gpt-6.2-sol**

- own-dog-bed: –
- own-cupboard-cans: מלפפונים בחומץ (pickled cucumbers) · אפונה וגזר משומרים (canned peas and carrots) · רסק עגבניות (tomato paste) · שמן קוקוס (coconut oil) · אורז לבן (white rice) · קמח (flour) · אבקה לבנה בקופסה שטוחה (white powder in a shallow container) · גרגירים יבשים בקופסה שקופה (dried grains in a clear container)
- own-fridge-shelves: גבינה לבנה (white cheese) · טחינה גולמית (tahini) · סלט כרוב סגול (red cabbage slaw) · ענבים ירוקים (green grapes) · כרובית (cauliflower) · חסה (lettuce) · גזר (carrots) · טבלאות שוקולד (chocolate bars) · אוכל בקופסה עם מכסה ירוק (food in a green-lidded container) · מזון בשקית ורודה (food in a pink bag) · מזון במכל צהוב עם מכסה אדום (food in a yellow canister with a red lid) · מזון באריזה שקופה במדף העליון (food in a clear package on the top shelf)
- own-coffee-corner: קפה נמס נטול קפאין (decaf instant coffee) · קפה נמס (instant coffee) · קפה נמס בטעם וניל צרפתי (french vanilla instant coffee) · אבקה להכנת שוקו (chocolate drink powder) · קפה טחון (ground coffee) · סוכר לבן (white sugar) · מלח (salt) · סוכריות חלב (milk candies) · שקיקי תה (tea bags) · נוזל כהה בבקבוק מזיגה (dark liquid in a dispenser bottle)
- own-fridge-door: ביצים (eggs) · חלב סויה (soy milk) · חלב לקפה (milk for coffee) · חלב נטול לקטוז 2% (2% lactose-free milk) · חלב מועשר 3% (3% fortified milk) · תמצית וניל (vanilla essence) · יין רוזה (rosé wine) · רוטב צ׳ילי מתוק (sweet chili sauce) · קולה ללא סוכר (zero-sugar cola) · משקה בבקבוק כהה (drink in a dark bottle)
- own-cupboard-spices: סוכר לבן (white sugar) · סוכר חום (brown sugar) · תה שחור בטעם ברגמוט (bergamot black tea) · חליטת צמחים (herbal tea) · פריכיות תירס דקות (thin corn cakes) · שקדי מרק (soup croutons) · ממרח אגוזי לוז וקקאו (hazelnut cocoa spread) · חלב מרוכז ממותק (sweetened condensed milk) · לקט ירקות משומר (canned mixed vegetables) · מלח ים גס (coarse sea salt) · אבקת שום (garlic powder) · תיבול לגריל עוף (chicken grill seasoning) · פפריקה מתוקה (sweet paprika) · מזון בצנצנת עם מכסה לבן (food in a white-lidded jar) · נוזל כהה בבקבוק עם פקק זהוב (dark liquid in a gold-capped bottle) · תבלין בקופסה שקופה (spice in a clear container) · מזון בשקית אדומה (food in a red bag)
- own-counter-avocados: אבוקדו (avocado) · קרקרים משישה דגנים (six-grain crackers) · מזון לא מזוהה בשקית כחולה (unidentified food in a blue bag)
- own-produce-corner: בטטה (sweet potato) · בצל יבש (yellow onion) · אננס (pineapple) · קולה ללא סוכר (sugar-free cola)
- own-cupboard-spices-blurry: מזון בצנצנת גדולה עם מכסה כחול (food in a large blue-lidded jar) · מזון בצנצנת עם מכסה צהוב (food in a yellow-lidded jar) · תבלין בצנצנת עם מכסה ירוק כהה (spice in a dark green-lidded jar) · תבלין בצנצנת עם מכסה ירוק בהיר (spice in a light green-lidded jar)
- own-fridge-shelves-dark: טחינה גולמית (tahini) · גבינה לבנה (soft white cheese) · סלט כרוב סגול (red cabbage salad) · ענבים ירוקים (green grapes) · עלים ירוקים (leafy greens) · אוכל בקופסה שקופה עם מכסה בהיר (food in a clear container with a pale lid) · אוכל בשקית אדומה (food in a red bag)

**openai/gpt-6.1-terra**

- own-dog-bed: –
- own-cupboard-cans: מלפפונים חמוצים בחומץ (pickled cucumbers) · אפונה וגזר משומרים (canned peas and carrots) · רסק עגבניות (tomato paste) · שמן קוקוס (coconut oil) · אורז (rice) · אבקה לבנה במכל (white powder in a container) · אבקה לבנה במכל תחתון (white powder in a lower container)
- own-fridge-shelves: טחינה גולמית (tahini) · גבינה לבנה (white cheese) · כרוב סגול (red cabbage) · ענבים ירוקים (green grapes) · כרובית (cauliflower) · חסה (lettuce) · גזר (carrot) · גבינה פרוסה (sliced cheese) · עוף מבושל (cooked chicken)
- own-coffee-corner: קפה נמס נטול קפאין (decaffeinated instant coffee) · קפה נמס בטעם וניל (vanilla instant coffee) · אבקה להכנת משקה שוקו (chocolate drink powder) · קפה נמס (instant coffee) · סוכר לבן (white sugar) · סוכריות מנטה (mint candies) · שקיקי תה (tea bags)
- own-fridge-door: ביצים (eggs) · משקה סויה (soy milk) · משקה חלב לקפה (milk drink for coffee) · חלב ללא לקטוז (lactose-free milk) · חלב (milk) · יין רוזה (rosé wine) · רוטב צ'ילי מתוק (sweet chili sauce) · קולה ללא סוכר (sugar-free cola) · תמצית וניל (vanilla extract) · יין (wine)
- own-cupboard-spices: סוכר לבן (white sugar) · סוכר חום (brown sugar) · תה שחור בטעם ברגמוט (bergamot black tea) · חליטת צמחים (herbal tea) · ממרח אגוזי לוז וקקאו (chocolate hazelnut spread) · חלב מרוכז ממותק (sweetened condensed milk) · מלח ים גס (coarse sea salt) · פפריקה מתוקה (sweet paprika) · תבלין לגריל עוף (chicken grill seasoning) · שום גבישי (granulated garlic) · שקדי מרק (soup croutons) · לפתן פירות (canned fruit cocktail) · מזון לא מזוהה בצנצנת (unidentified food in a jar)
- own-counter-avocados: אבוקדו (avocado) · קרקרים מדגנים (multigrain crackers)
- own-produce-corner: בטטה (sweet potato) · בצל (onion) · אננס (pineapple) · קולה ללא סוכר (sugar-free cola)
- own-cupboard-spices-blurry: –
- own-fridge-shelves-dark: טחינה (tahini) · גבינה לבנה (white cheese) · כרוב סגול קצוץ (shredded red cabbage) · ענבים ירוקים (green grapes) · מזון בקופסה שקופה (food in a clear container)

**anthropic/claude-sonnet-5.5**

- own-dog-bed: –
- own-cupboard-cans: אפונת גינה וגזר משומרים (canned peas and carrots) · פלפונים בחומץ (pickled peppers in vinegar) · רסק עגבניות (tomato paste) · שמן קוקוס (coconut oil) · אורז (rice) · קמח (flour) · שקיות תבלין או אבקה בקופסה שקופה (packets in a clear box) · גרגירים או זרעים בקופסה שקופה (seeds or grains in a clear container) · אבקה לבנה בקופסה (white powder in a container)
- own-fridge-shelves: טחינה (tahini) · גבינה לבנה (white cheese) · אבקת מרק (soup powder) · כרוב אדום מגורר (shredded red cabbage) · ענבים ירוקים (green grapes) · כרובית (cauliflower) · חסה (lettuce) · גבינה צהובה פרוסה (sliced yellow cheese) · חומוס (hummus) · שאריות בקופסה אדומה (leftovers in a red tub) · שאריות בקופסה עם מכסה ירוק (leftovers in a green-lidded container) · גזר (carrots)
- own-coffee-corner: קפה נמס נסקפה טייסטרס צ'ויס נטול קפאין (decaf instant coffee) · נסקפה ריץ' בטעם וניל צרפתי (french vanilla instant coffee) · אבקת שוקולית (chocolate milk powder) · קפה נמס (instant coffee) · פולי קפה (coffee beans) · סוכר (sugar) · סוכריות (candy) · שקיקי תה (tea bags) · ממתיק בטבליות (sweetener tablets)
- own-fridge-door: ביצים (eggs) · משקה סויה (soy milk) · משקה חלב לקפה (milk coffee drink) · חלב 2% (2% milk) · חלב 3% (3% milk) · יין רוזה (rosé wine) · יין אדום (red wine) · רוטב צ'ילי מתוק (sweet chili sauce) · קוקה קולה זירו (coca-cola zero) · תמצית וניל (vanilla extract)
- own-cupboard-spices: סוכר לבן (white sugar) · סוכר חום (brown sugar) · ממרח אגוזי לוז (hazelnut spread) · חלב מרוכז ממותק (sweetened condensed milk) · תה שחור ברגמוט (bergamot black tea) · תה קמומיל (calm herbal tea) · מלח ים גס (coarse sea salt) · פפריקה מתוקה (sweet paprika) · תבלין בריל עוף (chicken bbq seasoning) · פירות מעורבים בקופסה (canned fruit cocktail) · חילבה (fenugreek) · טחינה (tahini) · שום גרנולות (garlic powder) · תמצית וניל (vanilla extract) · אורז או קמח באריזה (bagged dry goods)
- own-counter-avocados: אבוקדו (avocado) · קרקר פריך משישה דגנים (six-grain crispbread crackers)
- own-produce-corner: בטטה (sweet potato) · בצל (onion) · אננס (pineapple) · קוקה קולה זירו (coca-cola zero)
- own-cupboard-spices-blurry: בקבוק שמן זית (olive oil) · מיונז (mayonnaise) · חרדל (mustard) · תבלין בצנצנת ירוקה (spice) · קפה נמס (instant coffee)
- own-fridge-shelves-dark: טחינה (tahini) · גבינה לבנה (white cheese) · כרוב אדום (red cabbage) · עלים ירוקים (leafy greens) · מלפפונים חמוצים (pickles) · שאריות בקופסה אדומה (leftovers in a red tub) · מיכל מזון עם תוכן לא ברור (food container with unclear contents)

## small photos, names in en

| Model | Photos | Failed | Made up (sure) | Right items | Found | Label only | Not food | Photo verdict | Sure on unreadable | Unchecked | Typical / slow | Cost per photo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openai/gpt-6.1-terra | 30 | 0 | 1 (0) | 99% | 79% (108/137) | 76% (71/93) | 0 | 30/30 | 1 | 45 | 8.4 s / 15.9 s | $0.0040 |
| openai/gpt-6.2-sol | 30 | 0 | 4 (1) | 95% | 85% (116/137) | 85% (79/93) | 0 | 29/30 | 1 | 68 | 6.8 s / 13.8 s | $0.0090 |
| anthropic/claude-sonnet-5.5 | 30 | 0 | 7 (1) | 93% | 82% (113/137) | 77% (72/93) | 0 | 30/30 | 1 | 88 | 4.2 s / 6.4 s | $0.0107 |

Spent on this set: $0.71.

Found, by where the kitchen is:

| Model | eu | il | in | ir | us |
|---|---|---|---|---|---|
| openai/gpt-6.1-terra | 78% (14/18) | 92% (35/38) | 75% (3/4) | 60% (3/5) | 74% (53/72) |
| openai/gpt-6.2-sol | 83% (15/18) | 87% (33/38) | 75% (3/4) | 80% (4/5) | 85% (61/72) |
| anthropic/claude-sonnet-5.5 | 94% (17/18) | 82% (31/38) | 100% (4/4) | 100% (5/5) | 78% (56/72) |

### openai/gpt-6.1-terra

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 4 +3 tubs | coconut oil | – | – |
| own-fridge-shelves | ok | 6 +1 tubs | – | – | – |
| own-coffee-corner | ok | 5 | – | – | – |
| own-fridge-door | ok | 9 | – | – | – |
| own-cupboard-spices | ok | 10 | mixed vegetable, garlic powder | – | – |
| own-counter-avocados | ok | 2 | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 0 | – | – | – |
| own-fridge-shelves-dark ° | too_dark | 2 +1 tubs | – | tahini ✓, leafy greens | – |
| web-pantry-cereal-boxes ° | ok | 8 | pretzel | canned corn ✓, cranberry sauce ✓, cranberry walnut salad topping | – |
| web-pantry-pots-dim ° | ok | 4 | pasta | canned beans, canned tomatoes, canned corn, cooking oil | – |
| web-pantry-quaker ° | ok | 12 | pancake mix | canned albacore tuna ✓, evaporated milk ✓, marshmallows, chocolate chips | – |
| web-pantry-teddy-grahams ° | ok | 7 | graham | cornstarch ✓, cocoa powder ✓ | – |
| web-kitchen-dark-counter ° | ok | 3 | – | bread | – |
| web-spice-drawer ° | ok | 3 +1 tubs | zaatar, paprika | canned fish, dried grains, pasta | – |
| web-shelf-soup-cans ° | ok | 2 +2 tubs | – | spices | – |
| web-pantry-full ° | ok | 13 +1 tubs | crushed tomato, cocoa, onion, bbq sauce, peppercorn | garlic ✓, rice, dried mushrooms, bread, malt drink mix ✓, garlic powder | – |
| web-pantry-tidy ° | ok | 16 | peanut butter | red wine, hot sauce ✓, canned tomatoes, canned diced tomatoes with green chilies ✓, canned pasta ✓, iced tea mix ✓, flour, sugar | – |
| web-closet-cleaning ° | ok | 4 | soup, bean, cracker, twinkie, pretzel, broth | brown rice ✓, pork rinds, cookies | – |
| web-counter-olive-oil ° | ok | 3 | – | pepper, leafy herbs | – |
| web-kitchen-rubbish ° | ok | 2 | – | pastry, bread | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 13 +2 tubs | spinach | pickled jalapeños ✓, bananas ✓ | – |
| commons-cellar-jars | ok | 3 +3 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 11 | cinnamon | – | – |
| commons-freezer | ok | 4 | tortilla | – | – |
| commons-masala-dabba | ok | 3 | coriander | – | – |
| commons-fridge-night | ok | 9 +1 tubs | – | milk | – |
| commons-fridge-persian ° | ok | 6 +1 tubs | egg, milk | lettuce, mushrooms | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### openai/gpt-6.2-sol

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 5 +2 tubs | – | – | – |
| own-fridge-shelves | ok | 11 +3 tubs | – | broccoli | – |
| own-coffee-corner | ok | 6 +4 tubs | sugar, candy | – | – |
| own-fridge-door | ok | 9 | – | – | – |
| own-cupboard-spices | ok | 12 +4 tubs | hazelnut spread, mixed vegetable, garlic powder | hazelnut cocoa spread ✓, chicken stock powder, ground chili pepper | – |
| own-counter-avocados | ok | 3 +1 tubs | – | – | – |
| own-produce-corner | ok | 4 | – | – | – |
| own-cupboard-spices-blurry ° | blurry | 1 +3 tubs | – | pasta | – |
| own-fridge-shelves-dark ° | too_dark | 4 +2 tubs | – | tahini ✓, green grapes, leafy greens, shredded purple cabbage | – |
| web-pantry-cereal-boxes ° | ok | 11 +1 tubs | pretzel | chicken-flavored rice mix, canned whole-kernel corn ✓, canned refried beans, canned baked beans | – |
| web-pantry-pots-dim ° | too_dark | 2 +3 tubs | pasta | cooking oil, red sauce in a bottle | – |
| web-pantry-quaker ° | ok | 17 +1 tubs | – | tahini ✓, canned albacore tuna ✓, cooking wine, raisins, dried cranberries ✓, pickles, sliced bread | – |
| web-pantry-teddy-grahams ° | ok | 9 +1 tubs | – | cornstarch ✓, cocoa powder, seasoning blend, flatbread | – |
| web-kitchen-dark-counter ° | too_dark | 3 | – | tomatoes | – |
| web-spice-drawer ° | ok | 2 +3 tubs | zaatar | canned swedish anchovies | – |
| web-shelf-soup-cans ° | blurry ✗ | 2 +2 tubs | – | cooking oil | – |
| web-pantry-full ° | ok | 20 +3 tubs | cocoa, bbq sauce, peppercorn | sliced bread ✓, rice, flour, dried mushrooms, garlic powder, shrimp paste, pretzel sticks, soy sauce, pancake syrup, vanilla extract, rolled oats | – |
| web-pantry-tidy ° | ok | 22 +2 tubs | – | worcestershire sauce, salad dressing, chocolate hazelnut spread ✓, white vinegar, hot sauce ✓, canned diced tomatoes with green chilies ✓, canned tomatoes ✓, canned spaghetti, flour, sugar, rice, dried spaghetti, iced tea mix ✓ | – |
| web-closet-cleaning ° | ok | 6 +2 tubs | bean, cracker, pretzel, broth | brown rice ✓, lemon-lime soda, juice | – |
| web-counter-olive-oil ° | ok | 3 +2 tubs | – | black pepper, vinegar | – |
| web-kitchen-rubbish ° | ok | 2 +1 tubs | – | cooking oil, cooked chicken | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 24 +5 tubs | spinach | pickled jalapeño slices ✓, hot chile sauce ✓, pickles, beer ✓, coffee creamer, unsalted butter ✓, sweet peppers, leafy greens, wing sauce | – |
| commons-cellar-jars | ok | 3 +4 tubs | apricot, potted meat | – | – |
| commons-spice-shelf | ok | 11 +5 tubs | cinnamon | – | – |
| commons-freezer | ok | 6 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 3 +3 tubs | coriander | – | – |
| commons-fridge-night | ok | 8 +4 tubs | – | – | – |
| commons-fridge-persian ° | ok | 7 +4 tubs | egg | white onions ✓, lettuce, hot sauce | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.

### anthropic/claude-sonnet-5.5

| Photo | Verdict | Listed | Missed | Made up or unchecked (✓ = sure) | Not food |
|---|---|---|---|---|---|
| own-dog-bed | not_kitchen | 0 | – | – | – |
| own-cupboard-cans | ok | 7 +2 tubs | pickle, tomato paste | canned chickpeas ✓, vegetable spread | – |
| own-fridge-shelves | ok | 9 +2 tubs | – | – | – |
| own-coffee-corner | ok | 7 | – | – | – |
| own-fridge-door | ok | 10 | – | buttermilk, small bottle of extract | – |
| own-cupboard-spices | ok | 14 | soup almond, mixed vegetable, garlic powder, chicken seasoning | canned tomatoes, ground spice, bread | – |
| own-counter-avocados | ok | 2 +1 tubs | – | – | – |
| own-produce-corner | ok | 3 | onion | – | – |
| own-cupboard-spices-blurry ° | blurry | 6 | – | milk, mustard, balsamic vinegar, spice, instant coffee, canned fish | – |
| own-fridge-shelves-dark ° | too_dark | 4 +3 tubs | – | tahini ✓, cottage cheese, yogurt, leafy greens | – |
| web-pantry-cereal-boxes ° | ok | 14 | – | chicken stuffing mix, canned vegetables, canned beans, canned corn, canned soup, mustard, sauce | – |
| web-pantry-pots-dim ° | too_dark | 5 +1 tubs | pasta | cereal, canned tomatoes, canned goods, cooking oil, hot sauce | – |
| web-pantry-quaker ° | ok | 17 | pancake mix, bread crumb | tahini, canned tomatoes, marshmallows, pasta sauce, pickles, mustard, hot sauce, canned tuna, cooking oil | – |
| web-pantry-teddy-grahams ° | ok | 10 | – | oats, pizza rolls, chips, canned vegetables, mustard | – |
| web-kitchen-dark-counter ° | too_dark | 5 | – | sweet potatoes, tomato | – |
| web-spice-drawer ° | ok | 5 +3 tubs | – | dried herbs, spices, canned food | – |
| web-shelf-soup-cans ° | ok | 8 +1 tubs | – | pasta sauce, ketchup, honey, canned goods, crackers, soy sauce, pickles | – |
| web-pantry-full ° | ok | 18 | cooking spray, cocoa, peppercorn | sodium citrate ✓, bread, canned beans, flour, rice, vanilla extract, dried mushrooms, dried fruit, cereal | – |
| web-pantry-tidy ° | ok | 17 | chili, lemonade | iced tea mix, canned tomatoes ✓, canned diced tomatoes with chilies ✓, flour, sugar, brown sugar, spices, canned spaghetti, wine, liquor | – |
| web-closet-cleaning ° | ok | 8 | soup, bean, cracker, twinkie, pretzel, broth | twinkies ✓, canned goods, bottled drinks, fruit, snack bag, cereal, sauces | – |
| web-counter-olive-oil ° | ok | 5 +1 tubs | – | black pepper, fresh herbs, canned fish | – |
| web-kitchen-rubbish ° | ok | 1 +2 tubs | – | roast chicken | – |
| commons-mess-tins | not_kitchen | 0 | – | – | – |
| commons-fridge-us-sauces ° | ok | 13 +3 tubs | egg, spinach | pickled hot peppers, coffee creamer, canned drinks | – |
| commons-cellar-jars | ok | 4 +3 tubs | potted meat | – | – |
| commons-spice-shelf | ok | 17 +1 tubs | – | – | – |
| commons-freezer | ok | 5 +1 tubs | – | – | – |
| commons-masala-dabba | ok | 7 | – | – | – |
| commons-fridge-night | ok | 12 +1 tubs | – | – | – |
| commons-fridge-persian ° | ok | 13 +2 tubs | – | cabbage, fruit juice, hot sauce, jam, orange drink, cooking oil, soda | – |

° labels cover only the clear items, so the extra names are unchecked, not wrong.
