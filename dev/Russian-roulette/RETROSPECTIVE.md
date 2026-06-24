# Retrospective

## AI Tools Used

- **Codex:** Planning, implementation, debugging, test authoring, documentation, and release-check orchestration.

## Development Workflow

The workflow followed an AI-native loop:

1. Turn the broad challenge brief into a specific game plan.
2. Ask only the product decisions that materially changed scope.
3. Implement from the stable center outward: shared rules, server, client, docs.
4. Run checks early and let tool failures guide fixes.
5. Revisit online readiness as a separate pass: deployment assumptions, abuse limits, reconnect behavior, and voice transport.
6. Revisit UX after each feature pass and remove controls that are technically functional but not obvious to players.
7. Use deterministic e2e switches for dry and hit roulette outcomes so release bugs could be reproduced.
8. Treat user-reported issues as regression tests, especially survivor controls after elimination.

## What Worked Well

- Building the foundations was very fast. Once the rules were clear, Codex could create the shared engine, server, client, and initial tests quickly.

## What Did Not Work Well

- The models and animations took many iterations. Codex can generate usable in-repo assets, but making them feel natural and realistic is slow compared with starting from prepared art assets.
- Voice chat was harder than expected. Seeing microphone permission succeed did not mean remote audio was actually connected or audible.

## Surprises And Discoveries

- I was surprised by how fast AI can build a complete playable multiplayer prototype.
- I was also surprised by how much guidance AI needs for what looks or feels "normal" in a real game scene.

## Estimated Percentage Of AI-Generated Code

100%. I just directed requirements, priorities, visual feedback, and acceptance decisions; Codex generated all implementation and documentation text.

## Time Spent

Human prompting/review time was roughly 1-2 hours spread across multiple iterations. Codex spent substantially more wall-clock time implementing, debugging, running tests, and revising docs.

## What I Would Do Differently Next Time

- Start with prepared or licensed art direction and models instead of asking Codex to invent all assets from code.

## Key Lessons Learned

- AI is a very strong engineering partner, but it still needs product judgment and repeated feedback.
- For AI-native work, the best pattern was: plan clearly, implement narrowly, test immediately, then turn every real bug into a regression.
- AI is expensive. If you just use it blindly it's not worth it. I spend ~500$ to create this game. That's crazy.
