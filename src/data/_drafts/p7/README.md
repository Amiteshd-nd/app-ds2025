# P7 drafts — waiting for the office pocket

These are the story 1.1 / 1.2 / 1.3 quests and scene components, filled from
the story script. They are NOT loaded or validated yet (the glob in
`src/data/index.ts` skips `_drafts/`): they name the district `office_gate`,
which exists only once the pocket is generated on its real streets (ADR-117
rule) from the user's office references (ADR-30).

When the pocket lands: move each file into `quests/` or `scenes/`, add the
district to `districts.json` with the trigger zones named here, run
`pnpm validate`, delete this folder.

Already live in `src/data/` (they need no new district): the Act 1 cast in
`npcs/act1.json`, the auto, guard, Prakash, Divya, Sameer and Ravi dialogues,
the auto-fare negotiation, the provision store's furniture (dormant until
`act1_first_day_done`), Shanthamma's notice, the Divya/Sameer/Ravi chats, the
`id_card` and `folding_table_chair` items, the `officeClockIn` and
`pgNoticeTimer` behaviours and the `workday` trigger action.
