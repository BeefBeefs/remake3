# Game rules taken from the manual

Source: `MAN/Manual.pdf` (16 scanned pages, OCR'd with tesseract; wording may carry OCR noise). Status: ✅ implemented, ⬜ not yet.

| Rule | Status |
|------|--------|
| Level-up gives **+4 points** to distribute on the character specifications window (key **C**); Life ties to Resistance, Mana to Power, Stamina to Resistance | ✅ points + spending; life = 2 × Resistance (the ratio is a guess); mana and stamina not modelled |
| Experience comes from defeating enemies *and* completing the objective | 🟡 kills only; the "Next level" table is not given (placeholder curve) |
| Items with a **red border** cannot be used yet (attributes too low or wrong weapon style) | ✅ class and attribute/level requirements (`R_Fuerza`, `R_Destreza` = Skill, `R_Resistencia`, `R_Magia` = Power, `R_Nivel`) block equipping; red border + tooltip. Equipment bonuses (`B_*`) are not applied yet |
| Walk (left button, footsteps audible); **Run** = Ctrl + click, twice as fast, uses stamina; **Stealth** = Shift + click, half speed, silent, lets you ambush | ✅ stamina (= 2 × Resistance) drains while moving (run 6/s, walk 0.5/s, stealth 0.2/s) and refills when standing (3/s); no running at 0; stealth halves the distance unaware monsters notice you and doubles the first blow (all rates and the sneak bonus are guesses) |
| **Block mode** = hold right button + left, lets the Amazon and Sorceress shoot without clicking an enemy; **Block attack** (Barbarian only) = right button | ⬜ |
| Quick keys 1–4 use the direct-access (light) items; Space shows the enemies that must be killed; Q objective window; T/I inventory, C character | 🟡 I, C, Space |
| **Buying and selling happens only at the Inn of the White Goddess**, with "certain people" there. Talking opens a Buy/Sell window with heavy and light lists; clicking adds to a basket; **if the basket costs more than your gold nothing is bought** | ✅ window + rules (merchant = innkeeper 27, stock = priced items the class can use, sell-back = half price: guesses). The Inn map is not part of this install; use `?npc=27` to place him next to the start |
| Dying loses the carried inventory and one point from every ability; you cannot save during a mission | ⬜ |
| Objectives per territory ("phase") must be completed to continue; only way to fail is dying | 🟡 Lost Forrest goal only |
| Difficulty: Apprentice (easy) and harder levels chosen before the adventure | ⬜ |
| Spell scrolls (parchments): light, storm, ice, fire, life, vampire, sacred (+2 attributes)…; potions: life, mana, stamina, vitality, fortuity, knowledge | 🟡 life / stamina / mana / vitality potions work (data bit mask 1/2/4); right-click use is click here; scrolls, fortuity and knowledge are not implemented |
