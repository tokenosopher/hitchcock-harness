<!-- Read by: no script; the film record and the cost line on the Release page (with the Higgsfield account's transactions, Flow v3.3 - 12 Release, step 15) are added up from it by hand.
     Described in: Flow v3.3 - 0 Standing rules (log every paid job the moment it is submitted, a blocked job at 0) and Flow v3.3 - 13 Services and costs (units, rates, how to quote). -->
# Spend: <Film>

| date | stage | service | job id | units | rate | cost | version or take | purpose | the user's go |
|---|---|---|---|---|---|---|---|---|---|
| <YYYY-MM-DD> | 2 Characters | Higgsfield · soul_cinematic 2k, 3:4 | <n> jobs (cast/<CID>-<name>/r<n>/prompts.json) | 20 images | 0.12 cr | 2.4 cr | <CID> r<n> | <CID> faces, round <n> | the script lock |
| <YYYY-MM-DD> | 7 Takes | Higgsfield · seedance_2_5 omni_reference, 480p draft | <job id> | <n> s | 3 cr | <3 × n> cr | <G> prompt v<N>, take <n> | <G>, first pass | "<the user's go, in their words>" |
| <YYYY-MM-DD> | 7 Takes | Higgsfield · seedance_2_5 omni_reference, 480p draft | <job id> | <n> s | 3 cr | 0 (blocked: nsfw or ip_detected) | <G> prompt v<N>, take <n> | the same generation, retried as take <n+1> | "<the same go>" |
| <YYYY-MM-DD> | 10 Finish | Higgsfield · seedance_2_5 finalize, 1080p | <job id> | <n> s | 16 cr | <16 × n> cr | <G> take <n> | the 1080p of <G> | "<the user's say-so>" |
