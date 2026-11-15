# AI assistant baseline

Step 1 of [AI-DISCOVERY-PLAN.md](../AI-DISCOVERY-PLAN.md): record what ChatGPT, Claude, Perplexity and Gemini say today when someone asks for an app like Pinch. Re-run it monthly and compare.

## The questions

Ask them the way a real person would. Only Q19 and Q20 name Pinch. All the others must stay neutral, or you're testing nothing.

**Saving from social video (core use case)**

- Q1. What's the best app to save recipes from TikTok?
- Q2. How do I save recipes from Instagram reels so I can actually cook them later?
- Q3. Is there an app that turns a YouTube cooking video into a written recipe?
- Q4. I save a lot of recipe videos and never find them again. What app should I use?

**Recipe organizers in general**

- Q5. What's the best recipe organizer app in 2026?
- Q6. Best app to import recipes from any website without the ads and life story?
- Q7. Is there an app that can scan recipes from a cookbook photo?
- Q8. What's a good free recipe app for iPhone?
- Q9. What's a good recipe manager app for Android?

**Diets and adapting**

- Q10. Is there an app that can make any recipe vegan?
- Q11. App that converts recipes to gluten-free or dairy-free?

**Shopping and pantry**

- Q12. Recipe app that makes a shopping list and knows what I already have?
- Q13. App that tells me what I can cook with what's in my fridge?

**Alternatives (people switching apps)**

- Q14. What's a good alternative to Paprika?
- Q15. Alternatives to ReciMe?
- Q16. Is there something like Mela for Android?
- Q17. How do I move my recipes from one recipe app to another?

**Follow-up (ask in the same chat right after Q1)**

- Q18. Which of those is best if I mostly cook from TikTok and Instagram videos?

**About Pinch directly (are the facts right?)**

- Q19. What is the Pinch recipe app?
- Q20. Is Pinch recipe app free? How much does it cost?

## How to run it

1. **Use a fresh chat for each question** (except Q18). Old chats and memory skew the answers.
2. **Turn off personalization if you can, or use a private window logged out.** ChatGPT and Perplexity work logged out. Claude and Gemini need a login, so use temporary or incognito chat mode and turn off memory.
3. **Make sure web search is on.** It's on by default in Perplexity and Gemini. In ChatGPT and Claude, check that the answer shows sources. If it doesn't, note `search: no` in `notes`.
4. **Fill in one row in `baseline.csv` per question and assistant.** It's pre-filled with 80 rows (20 questions × 4 assistants).
5. **Save anything interesting** (a screenshot or the answer text) in `answers/` as `2026-11-Q01-chatgpt.png` or `.txt`. You don't need all of them, only the ones where Pinch shows up or something surprising does.

All 80 rows take about 1.5–2 hours. To start smaller, do Q1, Q3, Q5, Q10, Q14, Q19 and Q20 in all four assistants (28 rows) first.

## The columns

| Column | What to write |
|---|---|
| `date` | The day you asked, e.g. `2026-11-15` |
| `assistant` | Pre-filled |
| `question_id` | Pre-filled |
| `pinch_mentioned` | `yes` or `no` |
| `pinch_position` | Where Pinch appears in the list (`1`, `2`, …). Leave empty if not mentioned |
| `pinch_facts_correct` | `yes`, `no` or `partly`. Write what was wrong in `notes` |
| `apps_mentioned` | The apps it recommended, in order, separated by `;` |
| `sources_cited` | The domains it linked, separated by `;` (e.g. `reddit.com; techradar.com`) |
| `notes` | Anything odd: wrong price, `search: no`, a dead app recommended, and so on |

## What we'll do with it

When you're done, tell me and I'll read `baseline.csv` and summarize:

- How often Pinch appears today, per assistant and per question group.
- Which competitors win which questions.
- **Which sites are cited most.** That list becomes the target list for Step 4 (directories, articles, Reddit threads).
- What Q19 and Q20 got wrong. Those become Step 2 website fixes.
