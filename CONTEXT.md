# Hearthhold

A single-player, real-time idle town-builder. The player grows Settlements, sends Villagers on Jobs and Expeditions, and works toward Objectives that unlock more of the game.

## Language

### Town

**Settlement**:
A town the player owns and manages, shown as its own 3D diorama.
_Avoid_: City (reserved for Foreign Cities), base, colony

**Plot**:
A preset spot in a Settlement where one Building can be placed.
_Avoid_: Tile, lot, grid cell

**Building**:
A levelled structure on a Plot that offers Jobs and Slots.
_Avoid_: Structure, facility

**Slot**:
A place in a Building that one Villager can fill to work one of its Jobs.
_Avoid_: Position, seat

**Housing**:
Building capacity that caps how many Villagers a Settlement can hold.
_Avoid_: Population cap, beds

### Villagers

**Villager**:
A recruited inhabitant who can be assigned to Jobs and Expeditions.
_Avoid_: Unit, worker, hero

**Recruit**:
A candidate in the Tavern pool who becomes a Villager once hired.
_Avoid_: Applicant, candidate

**Attribute**:
One of a fixed set of stats every Villager has (e.g. Strength, Intellect, Charm), raised with points on level-up.
_Avoid_: Stat, trait, skill

**Trait**:
A rare, named quality a Villager is recruited with (e.g. Green Thumb, Haggler) that grants a bonus.
_Avoid_: Perk, attribute, quirk

**Specialization**:
A permanent role a Villager picks at a level milestone, from options gated by their Attributes and Traits, that boosts matching Jobs and unlocks exclusive Contracts and Expedition roles. The second, later pick is an **Advanced Specialization**.
_Avoid_: Class, profession, evolution, role

**Upkeep**:
The Food each Villager consumes over time. When it cannot be paid, all Villagers work more slowly.
_Avoid_: Hunger, maintenance, wages

**Injured**:
A temporary state in which a Villager cannot be assigned to anything.
_Avoid_: Wounded, dead, knocked out

### Activities

**Job**:
Work a Villager does in a Building that yields XP, Gold, or Materials. A Job is either a Production Job or a Contract.
_Avoid_: Mission, task, quest

**Production Job**:
A Job that repeats each cycle for as long as a Villager stays assigned.
_Avoid_: Work, loop, idle job

**Contract**:
A one-off Job with a fixed duration and a reward that is paid once.
_Avoid_: Task, quest, bounty

**Expedition**:
A timed journey from a Settlement onto the World Map to reveal or reach Sites, which can succeed or fail.
_Avoid_: Mission, scouting run

**Trade Route**:
A standing exchange with a Foreign City, worked by an assigned Villager, that repeatedly swaps goods at that city's rates.
_Avoid_: Caravan, market, deal

**Objective**:
A player-facing goal, belonging to a Chapter, whose completion unlocks new content or rewards.
_Avoid_: Mission, quest, achievement

**Chapter**:
A set of Objectives that, once all are complete, unlocks the next Chapter's Buildings and features.
_Avoid_: Act, era, stage, tier

### Economy

**Stockpile**:
The single store of Gold and Materials shared by all of the player's Settlements.
_Avoid_: Inventory, storage, treasury

**Gold**:
The single currency, spent on recruiting, upgrading and trade.
_Avoid_: Coins, money, currency

**Material**:
A basic stockpiled good produced by Settlements: Wood, Stone, Food, or Ore.
_Avoid_: Resource (too broad), item

**Rare Material**:
A scarce good obtainable only from Sites or trade (e.g. Crystal, Spice, Silk).
_Avoid_: Luxury, exotic resource

### World

**World Map**:
The fog-of-war map surrounding the player's Settlements, explored through Expeditions.
_Avoid_: Overworld, region map

**Site**:
A discoverable location on the World Map, such as a resource deposit, ruin, empty land, or Foreign City.
_Avoid_: Node, point of interest, tile

**Foreign City**:
A Site holding a city the player does not own, which can be traded with.
_Avoid_: Settlement, rival, NPC town

**Outpost**:
A small structure built on a resource Site that a Villager works as a Production Job for Rare Materials.
_Avoid_: Mine, camp, colony

**Ruin**:
A Site that can be the target of one high-risk, high-reward Expedition.
_Avoid_: Dungeon, lair

**Reputation**:
A Foreign City's standing toward the player.
_Avoid_: Relations, favor, diplomacy

### Progression

**Prestige**:
A voluntary reset of progress in exchange for permanent bonuses.
_Avoid_: Rebirth, ascension, new game+

**Legacy**:
Points earned at Prestige from total Gold produced and spent on permanent bonuses.
_Avoid_: Prestige points, souls, karma

**Heirloom Villager**:
The one Villager the player chooses to carry through a Prestige, reset to level 1 but keeping their Traits.
_Avoid_: Hero, legend, carry-over

**Offline Progress**:
The Job and Expedition outcomes that accrue while the game is closed (up to a cap) and are settled when it reopens.
_Avoid_: AFK gains, idle rewards

**Report**:
The summary shown on return of everything that happened during Offline Progress.
_Avoid_: Recap, log, welcome-back screen
