# Clarifying questions eval (PIN-64)

Run 2026-11-23T08:25Z · language en · 20 unclear + 21 clear Commons photos (eval/cases/clarify.json) · recipes by the production invent model · recipe cost $2.14

Rule (ADR 031 D6): clear photos ask at most 10%; among thresholds that pass, the most right dishes wins.

**Without questions** (today): right dish on 15/20 unclear (75%) and 19/21 clear (90%).

## At the production threshold (0.7)

| Gate model | Clear asked | Unclear asked | Right dish, unclear | Right dish, clear | Useful questions | Gate ms (median) | Gate $ per photo | Errors |
|---|---|---|---|---|---|---|---|---|
| mistralai/mistral-small-2603 | 0/21 ✅ | 0/20 | 15/20 (75%) | 19/21 | 0/0 | 1628 | 0.00034 | 0 |
| openai/gpt-5.4-nano | 10/21 ❌ | 18/20 | 16/20 (80%) | 19/21 | 13/28 | 2170 | 0.00051 | 0 |
| google/gemini-2.5-flash-lite | 0/21 ✅ | 0/20 | 15/20 (75%) | 19/21 | 0/0 | 1148 | 0.00010 | 0 |
| openai/gpt-6-luna | 0/21 ✅ | 3/20 | 15/20 (75%) | 19/21 | 0/3 | 2268 | 0.00027 | 0 |
| qwen/qwen3.8-flash | 0/21 ✅ | 2/20 | 15/20 (75%) | 19/21 | 0/2 | 3727 | 0.00024 | 0 |
| anthropic/claude-sonnet-5.5@low | 1/21 ✅ | 8/20 | 17/20 (85%) | 19/21 | 6/9 | 2867 | 0.00639 | 0 |

## Threshold sweep

| Gate model | Threshold | Clear asked | Unclear asked | Right dish, unclear | Right dish, all |
|---|---|---|---|---|---|
| mistralai/mistral-small-2603 | 0.5 ⭐ | 0/21 | 0/20 | 15/20 | 34/41 |
| mistralai/mistral-small-2603 | 0.6 | 0/21 | 0/20 | 15/20 | 34/41 |
| mistralai/mistral-small-2603 | 0.7 | 0/21 | 0/20 | 15/20 | 34/41 |
| mistralai/mistral-small-2603 | 0.8 | 0/21 | 0/20 | 15/20 | 34/41 |
| openai/gpt-5.4-nano | 0.5 | 5/21 | 6/20 | 16/20 | 35/41 |
| openai/gpt-5.4-nano | 0.6 | 5/21 | 13/20 | 16/20 | 35/41 |
| openai/gpt-5.4-nano | 0.7 | 10/21 | 18/20 | 16/20 | 35/41 |
| openai/gpt-5.4-nano | 0.8 | 13/21 | 20/20 | 17/20 | 36/41 |
| google/gemini-2.5-flash-lite | 0.5 | 0/21 | 0/20 | 15/20 | 34/41 |
| google/gemini-2.5-flash-lite | 0.6 | 0/21 | 0/20 | 15/20 | 34/41 |
| google/gemini-2.5-flash-lite | 0.7 | 0/21 | 0/20 | 15/20 | 34/41 |
| google/gemini-2.5-flash-lite | 0.8 ⭐ | 0/21 | 1/20 | 16/20 | 35/41 |
| openai/gpt-6-luna | 0.5 | 0/21 | 1/20 | 15/20 | 34/41 |
| openai/gpt-6-luna | 0.6 | 0/21 | 2/20 | 15/20 | 34/41 |
| openai/gpt-6-luna | 0.7 | 0/21 | 3/20 | 15/20 | 34/41 |
| openai/gpt-6-luna | 0.8 ⭐ | 1/21 | 9/20 | 16/20 | 35/41 |
| qwen/qwen3.8-flash | 0.5 ⭐ | 0/21 | 0/20 | 15/20 | 34/41 |
| qwen/qwen3.8-flash | 0.6 | 0/21 | 0/20 | 15/20 | 34/41 |
| qwen/qwen3.8-flash | 0.7 | 0/21 | 2/20 | 15/20 | 34/41 |
| qwen/qwen3.8-flash | 0.8 | 1/21 | 5/20 | 15/20 | 34/41 |
| anthropic/claude-sonnet-5.5@low | 0.5 | 0/21 | 1/20 | 16/20 | 35/41 |
| anthropic/claude-sonnet-5.5@low | 0.6 ⭐ | 0/21 | 6/20 | 17/20 | 36/41 |
| anthropic/claude-sonnet-5.5@low | 0.7 | 1/21 | 8/20 | 17/20 | 36/41 |
| anthropic/claude-sonnet-5.5@low | 0.8 | 1/21 | 8/20 | 17/20 | 36/41 |

⭐ = best threshold for that model under the rule above.

## Per photo: mistralai/mistral-small-2603

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.95 | pork chop with herb crust and mashed pot · chicken cutlet with herb crust and mashe · veal cutlet with herb crust and mashed p |  | What is the main protein? → veal | ✅ | ✅ |
| u-chicken-schnitzel | Chicken schnitzel | 0.98 | French toast · Bread pudding · Eggy bread |  | – | ❌ |  |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.98 | chicken schnitzel · pork schnitzel · veal schnitzel |  | – | ✅ |  |
| u-grilled-cod | Grilled cod | 0.98 | whipped cream · meringue · foam |  | – | ❌ |  |
| u-chicken-breast | Grilled chicken breast | 0.95 | beef bourguignon with mashed potatoes · beef stew with dumplings · coq au vin with mashed potatoes |  | What is the main protein in the dish? → chicken | ✅ | ✅ |
| u-lamb-kebab | Lamb kebab | 0.95 | beef bourguignon · beef stew · coq au vin |  | What is the main protein in the dish? → _no matching chip_ | ❌ |  |
| u-chicken-kebab | Chicken kebab | 0.98 | pork ribs with barbecue sauce · grilled pork ribs · barbecue pork ribs |  | – | ✅ |  |
| u-lamb-stew | Lamb stew | 0.98 | chicken and vegetable stew with bread · beef stew with bread · lamb stew with bread |  | What is the main protein in the stew? → lamb | ✅ | ✅ |
| u-pulled-pork | Pulled pork sandwich | 0.98 | pumpkin pie with whipped cream · squash pie with whipped cream · sweet potato pie with whipped cream |  | – | ✅ |  |
| u-tofu-stir-fry | Tofu stir-fry | 0.95 | caramelized onion tart · caramelized onion galette · savory onion pie |  | – | ❌ |  |
| u-paneer-tikka | Paneer tikka | 0.98 | tomato and mozzarella salad · Caprese salad · bruschetta |  | – | ✅ |  |
| u-chickpea-curry | Chickpea curry | 0.95 | chickpea curry · dal makhani · chana masala |  | – | ✅ |  |
| u-chicken-curry | Chicken curry | 0.98 | stuffed bell peppers · stuffed tomatoes · stuffed zucchini |  | What is the main vegetable being stuffed? → _no matching chip_ | ❌ |  |
| u-veggie-burger | Veggie burger | 0.98 | roast beef sandwich · beef burger · steak sandwich |  | What is the main protein in the sandwich? → _no matching chip_ | ✅ |  |
| u-pork-dumplings | Pork dumplings | 0.98 | steamed dumplings · boiled dumplings · soup dumplings |  | – | ✅ |  |
| u-shrimp-tacos | Shrimp tacos | 0.95 | chicken shawarma with rice and salad · grilled chicken with rice and salad · kebabs with rice and salad |  | – | ✅ |  |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.98 | pizza with salad and drink · flatbread with salad and drink |  | – | ✅ |  |
| u-beef-tacos | Beef tacos | 0.98 | stuffed bell peppers · stuffed tomatoes · stuffed zucchini |  | What is the main vegetable used? → _no matching chip_ | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.98 | mushroom risotto · creamy mushroom pasta · mushroom pilaf |  | – | ✅ |  |
| u-fish-fingers | Fish fingers | 0.98 | chocolate chip cookie · brownie · chocolate chunk cookie |  | – | ✅ |  |
| c-grilled-salmon | Grilled salmon | 0.98 | grilled steak with side salad · pan-seared steak with side salad · beef fillet with green salad |  | – | ✅ |  |
| c-margherita | Margherita pizza | 0.98 | shakshuka · eggs in tomato sauce · huevos rancheros |  | Is the dish primarily Middle Eastern/North African? → _no matching chip_ | ✅ |  |
| c-nigiri | Nigiri sushi | 0.98 | prosciutto-wrapped melon · cantaloupe wrapped in cured ham · cured ham and melon roll |  | – | ✅ |  |
| c-shakshuka | Shakshuka | 0.98 | seafood paella · arroz a banda · saffron rice with seafood |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.98 | baked mac and cheese with bacon · baked mac and cheese with ham · creamy pasta bake |  | – | ✅ |  |
| c-caesar-salad | Caesar salad | 0.95 | chicken shawarma wrap · gyro wrap · kebab wrap |  | What is the main protein in the wrap? → _no matching chip_ | ❌ |  |
| c-pancakes | Pancakes | 0.98 | glazed doughnut with coffee · sugar-coated pastry with coffee · cinnamon roll with coffee |  | – | ✅ |  |
| c-croissant | Croissant | 0.98 | cinnamon rolls · sticky buns · caramel rolls |  | – | ✅ |  |
| c-hummus | Hummus | 0.98 | pumpkin soup · butternut squash soup · carrot soup |  | – | ✅ |  |
| c-falafel | Falafel | 0.95 | broccoli and chickpea patties · vegetable fritters · falafel |  | What is the main ingredient in the patties? → _no matching chip_ | ✅ |  |
| c-choc-chip-cookies | Chocolate chip cookies | 0.98 | chocolate chip cookies · oatmeal raisin cookies · chocolate chunk cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.98 | shakshuka with toast · baked eggs in tomato sauce with toast · tomato and pepper stew with toast |  | – | ✅ |  |
| c-apple-pie | Apple pie | 0.98 | chocolate chip cookie with walnuts · chocolate chip cookie with pecans · chocolate brownie |  | – | ✅ |  |
| c-tomato-soup | Tomato soup | 0.98 | pumpkin soup · butternut squash soup · carrot and ginger soup |  | – | ✅ |  |
| c-greek-salad | Greek salad | 0.95 | mixed grilled meats with rice · barbecue platter · kebab with rice |  | – | ✅ |  |
| c-fried-egg | Fried egg | 0.95 | crème brûlée with berries · vanilla custard with caramelized sugar a · flan with berries |  | – | ✅ |  |
| c-cheesecake | Cheesecake | 0.95 | chocolate lava cake · molten chocolate cake · chocolate fondant |  | – | ✅ |  |
| c-bagel | Bagel with cream cheese and lox | 0.98 | pork chop with apple sauce · breaded pork chop with apple slices · chicken schnitzel with apple slices |  | – | ✅ |  |
| c-omelette | Omelette | 0.95 | beef stew with mashed potatoes and green · beef bourguignon with mashed potatoes an · beef goulash with mashed potatoes and gr |  | – | ✅ |  |
| c-french-fries | French fries | 0.95 | shrimp fried rice · seafood fried rice · chicken fried rice |  | What is the main protein in the dish? → _no matching chip_ | ✅ |  |
| c-ice-cream | Ice cream | 0.95 | banana bread · caramelized banana cake · banana pudding |  | – | ✅ |  |

## Per photo: openai/gpt-5.4-nano

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.34 | breaded schnitzel · chicken parmesan cutlet · breaded pork cutlet | yes | Which main protein is it? → _no matching chip_ | ✅ |  |
| u-chicken-schnitzel | Chicken schnitzel | 0.72 | Breaded schnitzel · Chicken cutlet · Fish and chips |  | Which main protein is it? → Chicken cutlet | ❌ | ✅ |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.66 | Breaded fried pork cutlet with sauce · Chicken schnitzel with sauce · Breaded fried cutlet (pork) with Worcest | yes | Is the main meat pork or chicken? → Pork | ✅ | ✅ |
| u-grilled-cod | Grilled cod | 0.52 | Coconut macaroons · Shortbread cookies · Sugar cookies | yes | Which dough is it mainly made from? → _no matching chip_ | ❌ |  |
| u-chicken-breast | Grilled chicken breast | 0.36 | Grilled chicken with sausage and zucchin · Sausage with roasted vegetables and chic · Roasted chicken with grilled zucchini | yes | Which main protein is featured? → Chicken | ✅ | ✅ |
| u-lamb-kebab | Lamb kebab | 0.46 | Chicken curry · Goat curry · Fish curry | yes | Which protein is in the dish? → _no matching chip_ | ❌ |  |
| u-chicken-kebab | Chicken kebab | 0.62 | Baked chicken drumsticks with salsa · Chicken drumsticks with tomato sauce · BBQ-style chicken drumsticks | yes | Which sauce is shown with the chicken? → _no matching chip_ | ✅ |  |
| u-lamb-stew | Lamb stew | 0.56 | Goat stew with potatoes · Beef stew with potatoes · Oxtail stew | yes | Which protein is in the stew? → _no matching chip_ | ✅ |  |
| u-pulled-pork | Pulled pork sandwich | 0.52 | Bacon cheeseburger · Pulled pork sandwich · Italian sausage sandwich | yes | What’s the main protein in the sandwich? → Pulled pork | ✅ | ✅ |
| u-tofu-stir-fry | Tofu stir-fry | 0.56 | Spaghetti with sausage · Pad thai (chicken or pork) · Spaghetti aglio e olio with sausage | yes | What is the main protein? → _no matching chip_ | ❌ |  |
| u-paneer-tikka | Paneer tikka | 0.55 | Grilled beef kebabs · Tandoori chicken kebabs · Skewered grilled sausage or pork | yes | What is the main grilled protein? → _no matching chip_ | ✅ |  |
| u-chickpea-curry | Chickpea curry | 0.58 | Chana masala (chickpea curry) · Lentil dal with beans · Spanish-style chickpea stew | yes | What is the main legume? → Chickpeas | ✅ | ✅ |
| u-chicken-curry | Chicken curry | 0.45 | Tropical yellow curry with potatoes and · Japanese-style curry rice · Curry stew with boiled eggs | yes | What is the curry main protein? → Chicken or meat | ❌ | ✅ |
| u-veggie-burger | Veggie burger | 0.68 | BBQ pulled pork sandwich · Smoked brisket sandwich · Reuben sandwich | yes | Which main protein is it? → _no matching chip_ | ✅ |  |
| u-pork-dumplings | Pork dumplings | 0.72 | Boiled dumplings (wontons) · Steamed dumplings · Pierogi |  | Which main filling is it? → Meat (pork/chicken) | ✅ | ✅ |
| u-shrimp-tacos | Shrimp tacos | 0.45 | Cilantro-lime shrimp tacos with guacamol · Fish tacos with guacamole · Shrimp burritos with guacamole | yes | Main cooked protein in the filling? → Shrimp | ✅ | ✅ |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.63 | Ham and cheese crêpe with fried egg · Buckwheat galette with ham and egg · Crepe with ham and egg | yes | Which main pastry is it? → _no matching chip_ | ✅ |  |
| u-beef-tacos | Beef tacos | 0.58 | Steak burrito bowl with avocado · Tacos with steak and avocado crema · Fajita burrito with avocado crema | yes | Is the main base a tortilla or a bowl/rice? → _no matching chip_ | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.62 | Swedish meatballs with egg noodles · Italian-style meatballs with pasta · Chicken meatballs with pasta | yes | Are the meatballs made from beef/pork or chicken? → Beef/pork | ✅ | ✅ |
| u-fish-fingers | Fish fingers | 0.35 | Fried breaded chicken · Fried breaded pork cutlet · Chicken with sausage pieces | yes | Main protein is which? → _no matching chip_ | ✅ |  |
| c-grilled-salmon | Grilled salmon | 0.74 | Grilled salmon salad · Grilled trout salad · Grilled chicken salad |  | Which main protein is it? → Salmon | ✅ | ✅ |
| c-margherita | Margherita pizza | 0.86 | Margherita pizza · Mozzarella pizza · Tomato-basil pizza |  | – | ✅ |  |
| c-nigiri | Nigiri sushi | 0.78 | Tuna nigiri · Salmon nigiri · Tuna sashimi |  | Is the main fish tuna or salmon? → _no matching chip_ | ✅ |  |
| c-shakshuka | Shakshuka | 0.78 | Spinach tomato shakshuka · Eggs with spinach and tomato sauce (brea · Shakshuka with greens and feta |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.86 | Carbonara pasta · Spaghetti carbonara with bacon · Bacon spaghetti |  | What’s the main sauce base? → Egg & cheese (carbonara) | ✅ | ✅ |
| c-caesar-salad | Caesar salad | 0.78 | Caesar salad · Romaine Caesar with bacon · Caesar salad with Parmesan |  | Is the salad made with what main greens? → _no matching chip_ | ❌ |  |
| c-pancakes | Pancakes | 0.78 | Bacon-topped pancakes · Bacon breakfast pancakes · Pancakes with bacon |  | – | ✅ |  |
| c-croissant | Croissant | 0.92 | Croissant · Brioche · Danish pastry |  | – | ✅ |  |
| c-hummus | Hummus | 0.62 | Hummus with chickpeas and paprika · Baba ghanoush with chickpeas · Chickpea stew on hummus | yes | Which base is visible under the chickpeas? → Hummus (creamy chickpea dip) | ✅ | ✅ |
| c-falafel | Falafel | 0.42 | Broccoli fritters · Falafel · Cauliflower fritters | yes | What’s the main vegetable/protein? → Spiced like falafel | ✅ | ✅ |
| c-choc-chip-cookies | Chocolate chip cookies | 0.93 | Chocolate chip cookies · Oatmeal chocolate chip cookies · Chocolate chunk cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.2 | Nachos with salsa · Tortilla chips with pico de gallo · Nachos with guacamole and salsa | yes | Which main base is shown? → Guacamole | ✅ | ✅ |
| c-apple-pie | Apple pie | 0.62 | Apple pie turnover · Cinnamon apple strudel · Apple hand pie | yes | What’s the filling mainly made from? → Apples | ✅ | ✅ |
| c-tomato-soup | Tomato soup | 0.62 | Pizza bowl/mini pizza · Tomato soup in bread bowl · Marinara bread bowl | yes | Is the orange filling more like… → _no matching chip_ | ✅ |  |
| c-greek-salad | Greek salad | 0.6 | Greek salad · Feta and olive salad · Chopped salad with feta | yes | What is the main cheese used? → Yes, Greek | ✅ | ✅ |
| c-fried-egg | Fried egg | 0.78 | Breakfast plate with sunny-side-up eggs · Bacon and eggs with home fries · Brunch bowl with fried eggs and potatoes |  | – | ✅ |  |
| c-cheesecake | Cheesecake | 0.62 | Cheesecake with berry sauce · Chocolate mousse cake · New York-style cheesecake with berry top | yes | What is the filling mainly? → Cream cheese cheesecake | ✅ | ✅ |
| c-bagel | Bagel with cream cheese and lox | 0.38 | Smoked pork with pickled onions · Sausage/ham with pickled onions · Chicken/roast with tomato and pickled on | yes | Which main meat is it? → _no matching chip_ | ✅ |  |
| c-omelette | Omelette | 0.35 | Creamy chicken alfredo pasta · Creamy mushroom pasta · Chicken piccata (creamy sauce) | yes | What is the main protein/sauce base? → _no matching chip_ | ✅ |  |
| c-french-fries | French fries | 0.92 | French fries · Loaded fries · Potato wedges |  | – | ✅ |  |
| c-ice-cream | Ice cream | 0.28 | Chocolate cake · Tiramisu · Chocolate pudding | yes | What is the main dessert base? → _no matching chip_ | ✅ |  |

## Per photo: google/gemini-2.5-flash-lite

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.9 | Wiener Schnitzel · Cotoletta alla Milanese · Pork Schnitzel |  | What type of meat is used? → Veal | ✅ | ✅ |
| u-chicken-schnitzel | Chicken schnitzel | 0.9 | Wiener Schnitzel · Breaded Pork Cutlet · Chicken Schnitzel |  | – | ❌ |  |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.9 | Pork cutlet with sauce · Chicken cutlet with sauce · Fried fish with sauce |  | What type of meat is in the cutlet? → Pork | ✅ | ✅ |
| u-grilled-cod | Grilled cod | 0.7 | coconut cookies · rice crackers · shortbread |  | – | ❌ |  |
| u-chicken-breast | Grilled chicken breast | 0.9 | Grilled chicken with zucchini · Pan-seared chicken with zucchini · Baked chicken with zucchini |  | – | ✅ |  |
| u-lamb-kebab | Lamb kebab | 0.7 | Kofta · Kebab · Meatballs |  | What is the main ingredient? → Ground lamb | ❌ | ✅ |
| u-chicken-kebab | Chicken kebab | 0.9 | Chicken shish kebab · Chicken shawarma · Doner kebab |  | – | ✅ |  |
| u-lamb-stew | Lamb stew | 0.9 | lamb stew · beef stew · eggplant stew |  | – | ✅ |  |
| u-pulled-pork | Pulled pork sandwich | 0.89 | Pulled Pork Slider · BBQ Pork Sandwich · Shredded Pork Bun |  | – | ✅ |  |
| u-tofu-stir-fry | Tofu stir-fry | 0.8 | Pork Chow Mein · Beef Chow Mein · Chicken Chow Mein |  | What is the main protein in this dish? → Tofu | ❌ | ✅ |
| u-paneer-tikka | Paneer tikka | 0.9 | Paneer Tikka · Tandoori Tofu · Spiced Tofu Skewers |  | Is this dish made with paneer or tofu? → Paneer | ✅ | ✅ |
| u-chickpea-curry | Chickpea curry | 0.9 | chickpea curry · chickpea stew · chickpea salad |  | – | ✅ |  |
| u-chicken-curry | Chicken curry | 0.8 | Curry rice bowl with egg and edamame · Katsu curry · Japanese curry |  | – | ❌ |  |
| u-veggie-burger | Veggie burger | 0.9 | burger and fries · veggie burger and fries · sandwich and fries |  | What is the main patty of the burger? → Vegetable | ✅ | ✅ |
| u-pork-dumplings | Pork dumplings | 0.95 | pork dumplings · shrimp dumplings · gyoza |  | What is the main filling? → Pork | ✅ | ✅ |
| u-shrimp-tacos | Shrimp tacos | 0.9 | shrimp tacos · shrimp wraps · shrimp burritos |  | – | ✅ |  |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.9 | Galette complète · Savory crepe with egg, ham, and cheese · Ham and cheese crepe with egg |  | – | ✅ |  |
| u-beef-tacos | Beef tacos | 0.9 | tacos |  | – | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.9 | Swedish meatballs with egg noodles · Meatballs with gravy and noodles · Beef Stroganoff with egg noodles |  | – | ✅ |  |
| u-fish-fingers | Fish fingers | 0.8 | fish fingers · chicken tenders · fried fish |  | – | ✅ |  |
| c-grilled-salmon | Grilled salmon | 0.9 | Grilled Salmon Steak · Pan-Seared Salmon · Baked Salmon |  | – | ✅ |  |
| c-margherita | Margherita pizza | 0.9 | Pizza Margherita · Neapolitan Pizza · Margherita Pizza |  | – | ✅ |  |
| c-nigiri | Nigiri sushi | 0.9 | Sushi · Sashimi · Chirashi |  | – | ✅ |  |
| c-shakshuka | Shakshuka | 0.9 | shakshuka · eggs in purgatory · baked eggs with spinach and tomato |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.9 | Spaghetti Carbonara · Spaghetti Cacio e Pepe · Spaghetti Aglio e Olio |  | What is the main protein source? → _no matching chip_ | ✅ |  |
| c-caesar-salad | Caesar salad | 0.9 | Caesar salad · Iceberg wedge salad · Cobb salad |  | What kind of cheese is in the salad? → _no matching chip_ | ❌ |  |
| c-pancakes | Pancakes | 0.9 | pancakes with bacon · pancakes with syrup · pancakes |  | – | ✅ |  |
| c-croissant | Croissant | 1 | croissant |  | – | ✅ |  |
| c-hummus | Hummus | 0.9 | hummus · white bean dip · chickpea salad |  | – | ✅ |  |
| c-falafel | Falafel | 0.9 | Falafel · Vegetable croquettes · Arancini |  | – | ✅ |  |
| c-choc-chip-cookies | Chocolate chip cookies | 1 | chocolate chip cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.9 | Guacamole with tortilla chips · Salsa with tortilla chips |  | – | ✅ |  |
| c-apple-pie | Apple pie | 0.9 | apple pie · apple tart · apple crumble |  | – | ✅ |  |
| c-tomato-soup | Tomato soup | 0.9 | Tomato Soup in Bread Bowl · Gazpacho in Bread Bowl · Cream of Tomato Soup in Bread Bowl |  | – | ✅ |  |
| c-greek-salad | Greek salad | 1 | Greek salad |  | – | ✅ |  |
| c-fried-egg | Fried egg | 0.8 | biscuits and gravy · breakfast sandwich · country fried steak |  | What is the main protein component? → _no matching chip_ | ✅ |  |
| c-cheesecake | Cheesecake | 0.9 | New York cheesecake with blueberry toppi · Cheesecake with berry compote · Blueberry cheesecake |  | – | ✅ |  |
| c-bagel | Bagel with cream cheese and lox | 1 | Smoked salmon and cream cheese bagel |  | – | ✅ |  |
| c-omelette | Omelette | 0.9 | omelette with salad · scrambled eggs with salad |  | – | ✅ |  |
| c-french-fries | French fries | 1 | French fries |  | – | ✅ |  |
| c-ice-cream | Ice cream | 1 | ice cream |  | – | ✅ |  |

## Per photo: openai/gpt-6-luna

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.76 | breaded fried pork cutlet · breaded fried chicken cutlet · breaded fried veal cutlet |  | Which protein is the cutlet made from? → veal | ✅ | ✅ |
| u-chicken-schnitzel | Chicken schnitzel | 0.73 | breaded fried pork cutlet · chicken schnitzel · breaded fried fish |  | Which main protein is the cutlet? → chicken | ❌ | ✅ |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.95 | Pork tonkatsu · Chicken katsu |  | – | ✅ |  |
| u-grilled-cod | Grilled cod | 0.48 | cassava cakes · taro cakes · rice cakes | yes | Which main ingredient are these cakes made from? → _no matching chip_ | ❌ |  |
| u-chicken-breast | Grilled chicken breast | 0.87 | Grilled chicken with zucchini · Baked chicken with zucchini · Grilled fish with zucchini |  | – | ✅ |  |
| u-lamb-kebab | Lamb kebab | 0.57 | Spicy fried chicken · Chicken pakora · Fried fish | yes | What is the main ingredient? → _no matching chip_ | ❌ |  |
| u-chicken-kebab | Chicken kebab | 0.76 | Chicken shawarma wrap · Chicken kebab wrap · Chicken fajita wrap |  | Which style should the recipe use? → Chicken shawarma wrap | ✅ | ✅ |
| u-lamb-stew | Lamb stew | 0.64 | Turkish lamb stew · Turkish beef stew · Chicken stew |  | – | ✅ |  |
| u-pulled-pork | Pulled pork sandwich | 0.78 | Pulled pork sandwich · Barbecue beef sandwich |  | Which meat is in the sandwich? → Pulled pork sandwich | ✅ | ✅ |
| u-tofu-stir-fry | Tofu stir-fry | 0.69 | Stir-fried noodles with chicken · Stir-fried noodles with pork · Vegetable stir-fried noodles | yes | Which protein is in the noodles? → _no matching chip_ | ❌ |  |
| u-paneer-tikka | Paneer tikka | 0.76 | Tandoori paneer tikka · Tandoori chicken tikka |  | What is the main ingredient on the skewer? → Paneer | ✅ | ✅ |
| u-chickpea-curry | Chickpea curry | 0.88 | Chickpea curry · Chana masala |  | – | ✅ |  |
| u-chicken-curry | Chicken curry | 0.81 | Vegetable curry rice bowl · Japanese curry rice · Vegetable stew with rice |  | Which dish is it? → _no matching chip_ | ❌ |  |
| u-veggie-burger | Veggie burger | 0.98 | burger and fries |  | – | ✅ |  |
| u-pork-dumplings | Pork dumplings | 0.84 | Boiled dumplings · Chinese wontons |  | – | ✅ |  |
| u-shrimp-tacos | Shrimp tacos | 0.82 | Shrimp tacos · Shrimp burritos |  | – | ✅ |  |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.96 | Buckwheat galette with ham, egg, and che |  | – | ✅ |  |
| u-beef-tacos | Beef tacos | 0.91 | Mexican street tacos · Carne asada tacos · Al pastor tacos |  | – | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.86 | Meatballs with egg noodles in creamy sau · Swedish meatballs with egg noodles · Beef meatballs with pasta and cream sauc |  | – | ✅ |  |
| u-fish-fingers | Fish fingers | 0.75 | Breaded fish sticks · Breaded chicken strips |  | What is the main ingredient? → Fish | ✅ | ✅ |
| c-grilled-salmon | Grilled salmon | 0.96 | Grilled salmon steak |  | – | ✅ |  |
| c-margherita | Margherita pizza | 0.98 | Margherita pizza |  | – | ✅ |  |
| c-nigiri | Nigiri sushi | 0.97 | Assorted nigiri sushi |  | – | ✅ |  |
| c-shakshuka | Shakshuka | 0.88 | Spinach and tomato eggs · Shakshuka with spinach |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.96 | Spaghetti carbonara |  | – | ✅ |  |
| c-caesar-salad | Caesar salad | 0.83 | Caesar salad · creamy lettuce salad |  | – | ❌ |  |
| c-pancakes | Pancakes | 0.98 | Bacon pancakes with syrup |  | – | ✅ |  |
| c-croissant | Croissant | 0.93 | Croissant · Kouign-amann |  | – | ✅ |  |
| c-hummus | Hummus | 0.98 | Hummus with chickpeas |  | – | ✅ |  |
| c-falafel | Falafel | 0.98 | Falafel |  | – | ✅ |  |
| c-choc-chip-cookies | Chocolate chip cookies | 0.99 | Chocolate chip cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.94 | Tortilla chips with fresh salsa and guac |  | – | ✅ |  |
| c-apple-pie | Apple pie | 0.72 | Apple and raisin turnover · Apple strudel · Apple hand pie |  | – | ✅ |  |
| c-tomato-soup | Tomato soup | 0.83 | Tomato soup in a bread bowl · Tomato sauce in a bread bowl |  | – | ✅ |  |
| c-greek-salad | Greek salad | 0.98 | Greek salad |  | – | ✅ |  |
| c-fried-egg | Fried egg | 0.78 | Breakfast hash with fried eggs · Eggs Benedict · Breakfast sandwich with fried eggs |  | What is the base under the eggs? → _no matching chip_ | ✅ |  |
| c-cheesecake | Cheesecake | 0.91 | Cheesecake with berry sauce · Berry-topped sponge cake |  | – | ✅ |  |
| c-bagel | Bagel with cream cheese and lox | 0.91 | Smoked salmon bagel sandwich · Smoked salmon open-faced sandwich · Tomato and onion bagel sandwich |  | – | ✅ |  |
| c-omelette | Omelette | 0.73 | Herb omelet with salad · Scrambled eggs with salad |  | – | ✅ |  |
| c-french-fries | French fries | 0.98 | French fries |  | – | ✅ |  |
| c-ice-cream | Ice cream | 0.67 | Ice cream with chocolate sauce · Chocolate and vanilla frozen dessert |  | – | ✅ |  |

## Per photo: qwen/qwen3.8-flash

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.9 | Schnitzel · Breaded fish fillet |  | – | ✅ |  |
| u-chicken-schnitzel | Chicken schnitzel | 0.95 | Veal Schnitzel · Pork Schnitzel · Chicken Schnitzel |  | What type of meat is used for the schnitzel? → Chicken | ❌ | ✅ |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.95 | Tonkatsu with sauce · Chicken Katsu |  | – | ✅ |  |
| u-grilled-cod | Grilled cod | 0.6 | Crispy Cassava Chips · Banana Chips · Potato Chips | yes | What is the main ingredient? → _no matching chip_ | ❌ |  |
| u-chicken-breast | Grilled chicken breast | 0.9 | Grilled chicken with zucchini · Chicken and vegetable skewers |  | – | ✅ |  |
| u-lamb-kebab | Lamb kebab | 0.85 | Veg Seekh Kebab · Paneer Tikka · Mushroom Tikka |  | – | ❌ |  |
| u-chicken-kebab | Chicken kebab | 0.9 | Chicken tikka · Grilled chicken skewers · Chicken fajitas |  | – | ✅ |  |
| u-lamb-stew | Lamb stew | 0.75 | Beef stew · Lamb stew · Pork stew |  | What is the main protein in this stew? → Lamb | ✅ | ✅ |
| u-pulled-pork | Pulled pork sandwich | 0.85 | Pulled pork slider · Beef brisket slider |  | – | ✅ |  |
| u-tofu-stir-fry | Tofu stir-fry | 0.6 | Char Kway Teow · Hokkien Mee · Stir-fried Noodles | yes | What is the main ingredient in the noodles? → _no matching chip_ | ❌ |  |
| u-paneer-tikka | Paneer tikka | 0.75 | Paneer Tikka · Tandoori Chicken · Soy Chunks Seekh |  | What is the main protein in these skewers? → Paneer | ✅ | ✅ |
| u-chickpea-curry | Chickpea curry | 0.85 | Chana Masala · Curry Chickpeas · Masala Chole |  | – | ✅ |  |
| u-chicken-curry | Chicken curry | 0.85 | Chicken curry rice bowl · Japanese curry with toppings · Curry rice set |  | – | ❌ |  |
| u-veggie-burger | Veggie burger | 0.95 | Beef Burger with Fries · Veggie Burger with Fries |  | – | ✅ |  |
| u-pork-dumplings | Pork dumplings | 0.9 | boiled dumplings · wontons |  | – | ✅ |  |
| u-shrimp-tacos | Shrimp tacos | 0.95 | Shrimp Tacos |  | – | ✅ |  |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.95 | galette complète · savory buckwheat crepe |  | – | ✅ |  |
| u-beef-tacos | Beef tacos | 0.85 | Tacos al Pastor · Carne Asada Tacos · Carnitas Tacos |  | – | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.95 | Swedish meatballs with cream sauce and e · Creamy meatball pasta |  | – | ✅ |  |
| u-fish-fingers | Fish fingers | 0.75 | Breaded fish sticks · Breaded chicken tenders · Breaded tofu sticks |  | What is the main ingredient inside the breading? → Fish | ✅ | ✅ |
| c-grilled-salmon | Grilled salmon | 0.95 | Pan-Seared Salmon with Salad · Grilled Salmon Fillet · Seared Trout |  | – | ✅ |  |
| c-margherita | Margherita pizza | 0.98 | Pizza Margherita |  | – | ✅ |  |
| c-nigiri | Nigiri sushi | 0.95 | Nigiri sushi assortment |  | – | ✅ |  |
| c-shakshuka | Shakshuka | 0.95 | Shakshuka with spinach · Eggs in tomato sauce · Skillet egg bake |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.95 | Spaghetti Carbonara · Spaghetti with Bacon and Cheese |  | – | ✅ |  |
| c-caesar-salad | Caesar salad | 0.9 | Caesar salad · Romaine lettuce salad with croutons and |  | – | ❌ |  |
| c-pancakes | Pancakes | 0.95 | Bacon Pancakes with Maple Syrup · Pancakes with Bacon and Syrup · Savory Pancake Stack |  | – | ✅ |  |
| c-croissant | Croissant | 0.95 | Croissant |  | – | ✅ |  |
| c-hummus | Hummus | 0.98 | Hummus · Chickpea Dip |  | – | ✅ |  |
| c-falafel | Falafel | 0.95 | Falafel |  | – | ✅ |  |
| c-choc-chip-cookies | Chocolate chip cookies | 0.98 | Chocolate chip cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.9 | Guacamole with tortilla chips and pico d · Avocado salsa with tortilla chips · Chips and guacamole |  | – | ✅ |  |
| c-apple-pie | Apple pie | 0.9 | Apple pie slice with raisins · Baked apple crumble with pastry lid |  | – | ✅ |  |
| c-tomato-soup | Tomato soup | 0.95 | Tomato soup in bread bowl · Red pepper soup in bread bowl |  | – | ✅ |  |
| c-greek-salad | Greek salad | 0.95 | Greek Salad · Horiatiki |  | – | ✅ |  |
| c-fried-egg | Fried egg | 0.85 | breakfast sandwich with eggs and home fr · eggs benedict with potatoes · brunch plate with fried eggs |  | – | ✅ |  |
| c-cheesecake | Cheesecake | 0.9 | Blueberry Cheesecake · Cherry Cheesecake · Blackberry Cheesecake |  | – | ✅ |  |
| c-bagel | Bagel with cream cheese and lox | 0.95 | Smoked Salmon Bagel · Bagel with Cream Cheese and Smoked Salmo · Lox Bagel |  | – | ✅ |  |
| c-omelette | Omelette | 0.9 | scrambled eggs with salad · omelette with salad |  | – | ✅ |  |
| c-french-fries | French fries | 0.95 | French fries |  | – | ✅ |  |
| c-ice-cream | Ice cream | 0.7 | Affogato · Vanilla Ice Cream Sundae · Tiramisu Parfait |  | Is there a shot of espresso poured over the ice cream? → No, just vanilla ice cream | ✅ | ✅ |

## Per photo: anthropic/claude-sonnet-5.5@low

| Photo | Real dish | Confidence | Candidates | Asked @0.7 | Question → answer | Right without | Right with |
|---|---|---|---|---|---|---|---|
| u-wiener-schnitzel | Veal schnitzel | 0.8 | Wiener schnitzel · Pork schnitzel · Chicken schnitzel |  | Which meat is the schnitzel made from? → Veal | ✅ | ✅ |
| u-chicken-schnitzel | Chicken schnitzel | 0.8 | Wiener Schnitzel · Pork schnitzel · Chicken schnitzel |  | Which meat is the schnitzel made from? → Chicken | ❌ | ✅ |
| u-tonkatsu | Pork cutlet (tonkatsu) | 0.9 | Tonkatsu · Chicken katsu |  | – | ✅ |  |
| u-grilled-cod | Grilled cod | 0.35 | Seafood rice crackers · Dried fish chips · Coconut chips | yes | What are these crisp rounds mainly made from? → Dried fish | ❌ | ✅ |
| u-chicken-breast | Grilled chicken breast | 0.7 | Herb-crusted chicken with grilled zucchi · Pesto chicken with grilled zucchini · Parmesan-crusted chicken with zucchini |  | – | ✅ |  |
| u-lamb-kebab | Lamb kebab | 0.5 | Sai Oua (Northern Thai herb sausage) · Lao sausage (Sai Gok) · Seekh kebab | yes | Which style of dish is this closest to? → _no matching chip_ | ❌ |  |
| u-chicken-kebab | Chicken kebab | 0.6 | Chicken shish kebab with flatbread · Tavuk şiş wrap with bulgur pilaf · Grilled chicken fajitas |  | – | ✅ |  |
| u-lamb-stew | Lamb stew | 0.5 | Turkish lamb and eggplant stew · Lamb tas kebab · Beef and vegetable stew | yes | Which meat is in the stew? → Lamb | ✅ | ✅ |
| u-pulled-pork | Pulled pork sandwich | 0.6 | Pulled pork slider · Smoked brisket slider · Barbecue pulled pork sandwich | yes | Which meat is in the sandwich? → Pulled pork | ✅ | ✅ |
| u-tofu-stir-fry | Tofu stir-fry | 0.5 | Black pepper stir-fried noodles with tof · Chicken chow mein · Pork lo mein | yes | What is the main protein in the noodles? → Fried tofu | ❌ | ✅ |
| u-paneer-tikka | Paneer tikka | 0.6 | Paneer tikka · Tandoori fish tikka · Chicken tikka | yes | What is the main ingredient of the skewered pieces? → Paneer | ✅ | ✅ |
| u-chickpea-curry | Chickpea curry | 0.72 | Chickpea curry · Chana masala · Moroccan spiced chickpea stew |  | – | ✅ |  |
| u-chicken-curry | Chicken curry | 0.8 | Japanese vegetable curry rice · Vegetable curry rice bowl with egg and s |  | – | ❌ |  |
| u-veggie-burger | Veggie burger | 0.55 | Portobello mushroom burger with fries · Halloumi and mushroom burger with fries · Beef burger with fries | yes | What is the main filling of the burger? → _no matching chip_ | ✅ |  |
| u-pork-dumplings | Pork dumplings | 0.7 | Boiled pork dumplings · Shrimp dumplings · Gyoza |  | – | ✅ |  |
| u-shrimp-tacos | Shrimp tacos | 0.55 | Shrimp quesadillas with guacamole · Shrimp tacos with guacamole · Shrimp burritos | yes | How are the tortillas cooked? → _no matching chip_ | ✅ |  |
| u-savoury-crepe | Savoury buckwheat crepe (galette) | 0.93 | Galette complète · Buckwheat crepe with ham, egg and cheese |  | – | ✅ |  |
| u-beef-tacos | Beef tacos | 0.6 | Carne asada tacos · Tacos al pastor · Tacos de suadero |  | – | ✅ |  |
| u-swedish-meatballs | Swedish meatballs (beef and pork) | 0.8 | Swedish meatballs with egg noodles · Meatballs in creamy sauce with noodles · Beef stroganoff meatballs |  | – | ✅ |  |
| u-fish-fingers | Fish fingers | 0.9 | Fish sticks · Breaded chicken strips |  | – | ✅ |  |
| c-grilled-salmon | Grilled salmon | 0.8 | Pan-seared salmon steak · Grilled salmon steak with salad · Grilled fish steak with avocado |  | – | ✅ |  |
| c-margherita | Margherita pizza | 0.93 | Pizza Margherita |  | – | ✅ |  |
| c-nigiri | Nigiri sushi | 0.85 | Assorted nigiri sushi · Tuna nigiri · Sashimi and nigiri plate |  | – | ✅ |  |
| c-shakshuka | Shakshuka | 0.6 | Spinach and tomato skillet eggs · Shakshuka with spinach · Cheesy spinach fried egg |  | – | ❌ |  |
| c-carbonara | Spaghetti carbonara | 0.9 | Spaghetti alla carbonara · Spaghetti alla gricia · Spaghetti with bacon and cheese |  | – | ✅ |  |
| c-caesar-salad | Caesar salad | 0.5 | Creamy iceberg lettuce salad · Caesar salad · Wedge-style salad with bacon |  | – | ❌ |  |
| c-pancakes | Pancakes | 0.9 | Pancakes with bacon and maple syrup · American-style fluffy pancakes with cris |  | – | ✅ |  |
| c-croissant | Croissant | 0.96 | Croissant · Butter croissant |  | – | ✅ |  |
| c-hummus | Hummus | 0.93 | Hummus · Baba ganoush |  | – | ✅ |  |
| c-falafel | Falafel | 0.93 | Falafel · Herb-chickpea fritters |  | – | ✅ |  |
| c-choc-chip-cookies | Chocolate chip cookies | 0.95 | Chocolate chip cookies · Chocolate chunk cookies |  | – | ✅ |  |
| c-guacamole | Guacamole | 0.9 | Guacamole with tortilla chips · Chips with pico de gallo and guacamole |  | – | ✅ |  |
| c-apple-pie | Apple pie | 0.7 | Apple strudel · Apple raisin turnover · Apple pie slice |  | – | ✅ |  |
| c-tomato-soup | Tomato soup | 0.6 | Tomato soup in a bread bowl · Roasted red pepper soup in a bread bowl · Gazpacho in a bread bowl | yes | What is the soup mainly made from? → Tomato | ✅ | ✅ |
| c-greek-salad | Greek salad | 0.95 | Greek salad · Feta and tomato salad |  | – | ✅ |  |
| c-fried-egg | Fried egg | 0.6 | Biscuit with bacon and fried eggs · Eggs Benedict-style breakfast plate · Breakfast hash with fried eggs |  | – | ✅ |  |
| c-cheesecake | Cheesecake | 0.9 | Blueberry cheesecake · New York cheesecake with blueberry compo · Cherry cheesecake |  | – | ✅ |  |
| c-bagel | Bagel with cream cheese and lox | 0.93 | Bagel with lox and cream cheese · Smoked salmon bagel · Open-faced lox bagel sandwich |  | – | ✅ |  |
| c-omelette | Omelette | 0.8 | Herb omelette with green salad · Truffle scrambled eggs · French omelette aux fines herbes |  | – | ✅ |  |
| c-french-fries | French fries | 0.95 | French fries · Shoestring fries · Pommes frites |  | – | ✅ |  |
| c-ice-cream | Ice cream | 0.85 | Vanilla and chocolate ice cream · Chocolate and vanilla gelato · Chocolate swirl ice cream |  | – | ✅ |  |
