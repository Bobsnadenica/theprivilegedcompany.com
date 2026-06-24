import { expect, test } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import type { PrivatePlayerState, RoomState } from "@rrld/shared";

const FORCED_ROULETTE_RESULT = process.env.E2E_FORCE_ROULETTE_RESULT;
const E2E_SERVER_URL = `http://127.0.0.1:${process.env.E2E_SERVER_PORT ?? 3102}`;

type TrackedSocket = {
  socket: Socket;
  playerId: string;
  latestRoom?: RoomState;
  latestPrivate?: PrivatePlayerState;
};

test("solo bot demo starts without opening a Socket.IO backend connection", async ({ page }) => {
  test.setTimeout(45_000);
  const backendRequests: string[] = [];
  const isStaticSoloOnly = process.env.E2E_STATIC_SOLO_ONLY === "true";
  page.on("request", (request) => {
    if (request.url().startsWith(E2E_SERVER_URL)) {
      backendRequests.push(request.url());
    }
  });

  await page.goto("/");
  await expect(page.getByTestId("entry-cockpit")).toBeVisible();
  if (isStaticSoloOnly) {
    await expect(page.getByTestId("create-room")).toHaveCount(0);
    await expect(page.getByTestId("join-room")).toHaveCount(0);
  }
  await expect.poll(() => backendRequests.length).toBe(0);

  await page.getByTestId("play-solo-demo").click();
  await expect(page.getByTestId("solo-mode-pill")).toBeVisible();
  await expect(page.getByTestId("solo-demo-panel")).toBeVisible();
  await expect(page.getByTestId("solo-demo-panel")).toContainText(/Your move|thinking|Resolving|Spectating/i);
  await expect(page.getByTestId("solo-quick-row")).toBeVisible();
  await expect(page.getByTestId("solo-status-grid")).toBeHidden();
  await expect(page.getByTestId("solo-sound-toggle")).toBeVisible();
  await expect.poll(() => soloDockIsCompact(page), { timeout: 5000 }).toBe(true);
  await page.getByTestId("solo-details-toggle").click();
  await expect(page.getByTestId("solo-status-grid")).toBeVisible();
  await page.getByTestId("solo-details-toggle").click();
  await expect(page.getByTestId("solo-status-grid")).toBeHidden();
  await expect(page.getByTestId("voice-panel")).toHaveCount(0);
  await expect(page.getByTestId("bottom-action-tray")).toBeVisible({ timeout: 10000 });
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => (snapshot.seatNameplates ?? []).map((plate: { name: string }) => plate.name).sort()), { timeout: 10000 }).toEqual([
    "Mira",
    "Nadia",
    "Viktor",
    "You"
  ]);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.soloPhase), { timeout: 10000 }).toBe("humanTurn");
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.gunParked), { timeout: 10000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.localHandVisible), { timeout: 10000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.visibleNameplateCount >= 3), { timeout: 10000 }).toBe(true);

  await playFirstEnabledCards(page, 1);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => ["botThinking", "resolvingChallenge", "humanTurn", "spectating"].includes(snapshot.soloPhase)), { timeout: 10000 }).toBe(true);
  await expect
    .poll(() => page.getByTestId("event-ticker").innerText(), { timeout: 8000 })
    .toMatch(/Mira|Viktor|Nadia|LIAR|played/i);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => Boolean(snapshot.speechBubbleVisible || snapshot.botThinkingPlayerId)), { timeout: 10000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.visibleQuoteCount <= 1), { timeout: 10000 }).toBe(true);
  expect(backendRequests).toEqual([]);
});

test("solo bot demo autostarts and responds to generic Play controls", async ({ page }) => {
  test.skip(process.env.E2E_STATIC_SOLO_ONLY !== "true", "Autostart URL is for the static solo Pages build.");
  test.setTimeout(45_000);

  const backendRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(E2E_SERVER_URL)) {
      backendRequests.push(request.url());
    }
  });

  await page.goto("/?autostart=1");
  await expect(page.getByTestId("entry-cockpit")).toHaveCount(0);
  await expect(page.getByTestId("solo-mode-pill")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("bottom-action-tray")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("play-selected")).toBeEnabled({ timeout: 10000 });
  await expect(page.getByTestId("action-hint")).toContainText(/auto-play one card/i);

  await page.getByTestId("play-selected").click();
  await expect
    .poll(() => sceneSnapshot(page).then((snapshot) => (snapshot.settledPileVisualCount ?? 0) + (snapshot.visibleMotionCards ?? 0)), { timeout: 8000 })
    .toBeGreaterThan(0);

  expect(backendRequests).toEqual([]);
});

test("two real browser players can complete a play and LIAR challenge", async ({ browser }) => {
  test.setTimeout(140_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installVoiceMocks(host);
  await installVoiceMocks(guest);

  await host.goto("/");
  await expect(host.getByTestId("entry-cockpit")).toBeVisible();
  await host.getByTestId("create-name").fill("Host");
  await host.getByTestId("create-room").click();
  await expect(host.getByTestId("room-code")).toBeVisible();
  await expect(host.getByTestId("invite-code")).toContainText("Invite code");
  await expect.poll(() => inviteCodeIsProminent(host), { timeout: 5000 }).toBe(true);
  await expect.poll(() => topbarCopyFits(host), { timeout: 5000 }).toBe(true);
  await expect(host.getByTestId("bar-scene")).toHaveAttribute("data-scene-ready", "true", { timeout: 10000 });
  await expect.poll(() => sceneAssetIds(host), { timeout: 10000 }).toEqual(["bar-room", "card-table", "characters", "playing-card", "toy-roulette"]);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => hasToyGunMeshes(snapshot)), { timeout: 10000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => tableHasNoVisibleSlotMeshes(snapshot)), { timeout: 10000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.characterSceneState), { timeout: 10000 }).toBe("textured");
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => [...(snapshot.characterAssetIds ?? [])].sort()), { timeout: 10000 }).toEqual([
    "challenger",
    "host",
    "watcher",
    "wildcard"
  ]);
  await expect(host.getByTestId("rules-overlay")).toBeVisible();
  await host.getByTestId("close-rules").click();
  await expect(host.getByTestId("rules-overlay")).toBeHidden();
  await host.getByTestId("open-rules").click();
  await expect(host.getByTestId("rules-overlay")).toBeVisible();
  await host.getByTestId("close-rules").click();
  const roomCode = (await host.getByTestId("room-code").innerText()).trim();

  await guest.goto("/");
  await guest.getByTestId("entry-mode-join").click();
  await guest.getByTestId("join-name").fill("Guest");
  await guest.getByTestId("join-code").fill(roomCode);
  await guest.getByTestId("join-room").click();
  await expect(guest.getByTestId("room-code")).toHaveText(roomCode);
  await expect(guest.getByTestId("rules-overlay")).toBeVisible();
  await guest.getByTestId("close-rules").click();
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.visibleCharacterCount), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).map((plate: { name: string }) => plate.name).sort()), { timeout: 5000 })
    .toEqual(["Guest", "Host"]);
  await expect
    .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).every((plate: { shotsLeft: number; voice: string }) => plate.shotsLeft === 6 && plate.voice === "off")), {
      timeout: 5000
    })
    .toBe(true);
  await expect.poll(() => compactHeaderLeavesNameplatesVisible(host, 2), { timeout: 5000 }).toBe(true);
  await expect(host.getByTestId("lobby-command")).toBeVisible();
  await expect(host.getByTestId("seat-status-strip")).toHaveCount(0);
  await expect(host.getByTestId("voice-dock")).toBeVisible();
  await expect(host.getByTestId("event-ticker")).toBeVisible();
  await expect(host.locator(".cockpit-rail")).toHaveCount(0);

  await host.getByTestId("join-voice").click();
  await expect(host.getByTestId("voice-status")).toContainText("Connected");
  await guest.getByTestId("join-voice").click();
  await expect(guest.getByTestId("voice-status")).toContainText("Connected");
  await expect(host.getByTestId("voice-status")).toContainText("2 in voice");
  await expect(host.getByTestId("voice-status")).toContainText("1 speaker link");
  await expect(host.getByTestId("voice-peer-list")).toContainText("Receiving audio", { timeout: 5000 });
  await expect(guest.getByTestId("voice-peer-list")).toContainText("Receiving audio", { timeout: 5000 });
  await expect
    .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).some((plate: { name: string; voice: string }) => plate.name === "Guest" && plate.voice !== "off")), {
      timeout: 5000
    })
    .toBe(true);
  await host.getByTestId("test-speaker").click();
  await expect(host.getByTestId("test-speaker")).toBeEnabled();
  await host.getByTestId("test-mic-loopback").click();
  await expect(host.getByTestId("test-mic-loopback")).toContainText(/Looping|Test mic/);
  await host.getByTestId("toggle-mute").click();
  await expect(host.getByTestId("voice-status")).toContainText("Muted");
  await expect
    .poll(() => sceneSnapshot(guest).then((snapshot) => (snapshot.seatNameplates ?? []).some((plate: { name: string; voice: string }) => plate.name === "Host" && plate.voice === "muted")), {
      timeout: 5000
    })
    .toBe(true);

  await host.getByRole("button", { name: "Start" }).click();
  await expect(host.getByTestId("rules-overlay")).toBeHidden();
  await expect(host.getByTestId("bottom-action-tray")).toBeVisible();
  await expect(host.getByTestId("invite-code")).toHaveCount(0);
  await expect(host.getByTestId("room-code")).toHaveCount(0);
  await expect(host.getByTestId("seat-status-strip")).toHaveCount(0);
  await expect.poll(() => bottomTrayIsPinned(host), { timeout: 5000 }).toBe(true);
  await expect.poll(() => activeLayoutFitsViewport(host), { timeout: 5000 }).toBe(true);
  await expect.poll(() => topbarCopyFits(host), { timeout: 5000 }).toBe(true);
  await expect(host.locator(".bar-scene canvas")).toBeVisible();
  await expect.poll(() => canvasHasNonBlankPixels(host), { timeout: 5000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.cameraPreset), { timeout: 5000 }).toBe("activeSeat");
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.characterMotionStates?.length ?? 0), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.seatChamberIndicators?.length ?? 0), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => compactHeaderLeavesNameplatesVisible(host, 2), { timeout: 5000 }).toBe(true);
  await expect(host.locator('[data-testid^="hand-card-"]').first()).toBeVisible();
  await expect(guest.locator('[data-testid^="hand-card-"]').first()).toBeVisible();

  const hostCards = host.locator('[data-testid^="hand-card-"]');
  await expect(hostCards).toHaveCount(5);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.localHandVisualCount), { timeout: 5000 }).toBe(5);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.localHandFacingPlayer), { timeout: 5000 }).toBe(true);
  const firstHostCard = hostCards.nth(0);
  const firstHostCardTestId = await firstHostCard.getAttribute("data-testid");
  expect(firstHostCardTestId).toBeTruthy();
  await expect(guest.getByTestId(firstHostCardTestId!)).toHaveCount(0);
  await expect(JSON.stringify(await sceneSnapshot(host))).not.toContain(firstHostCardTestId!);
  for (const index of [0, 1, 2]) {
    const card = hostCards.nth(index);
    await card.click();
    await expect(card).toHaveAttribute("data-selected", "true");
  }
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.selectedCount), { timeout: 2000 }).toBe(3);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.selectedHandVisualCount), { timeout: 2000 }).toBe(3);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.cardMotionState), { timeout: 2000 }).toBe("selected");
  await host.getByTestId("play-selected").click();
  await expect(host.getByTestId("pile-count")).toContainText("3");
  await expect
    .poll(() => sceneSnapshot(host).then((snapshot) => snapshot.activeTimeline === "card-play" || ["throwing", "settled"].includes(snapshot.cardMotionState)), {
      timeout: 5000
    })
    .toBe(true);
  await expect.poll(() => pileVisualCountDoesNotDouble(host, 3), { timeout: 5000 }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.settledPileVisualCount), { timeout: 5000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => pileVisualsAreStacked(host, 3), { timeout: 5000 }).toBe(true);
  await expect.poll(() => sceneOrbitChangesAfterDrag(host), { timeout: 5000 }).toBe(true);
  await expect(guest.getByTestId("call-liar")).toBeEnabled();

  await guest.getByTestId("call-liar").click();
  await expect(host.getByTestId("challenge-panel")).toBeVisible();
  await expect(guest.getByTestId("challenge-panel")).toBeVisible();
  await expect.poll(() => challengePanelFitsViewport(host), { timeout: 5000 }).toBe(true);
  await host.setViewportSize({ width: 390, height: 720 });
  await expect.poll(() => challengePanelFitsViewport(host), { timeout: 5000 }).toBe(true);
  await host.setViewportSize({ width: 1280, height: 720 });
  await expect(host.getByTestId("toy-roulette-readout")).toBeVisible();
  await expect(host.getByTestId("toy-roulette-readout")).toHaveAttribute("data-result-unlocked", "false");
  await expect(host.getByTestId("toy-roulette-readout")).not.toContainText(/Dry chamber|Hit: eliminated/i);
  await expect(host.getByTestId("event-ticker")).not.toContainText(/got hit|dry click|was eliminated|wins the table/i);
  await expect.poll(() => host.locator(".revealed-cards .mini-card").count(), { timeout: 5000 }).toBe(3);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.completedTimelines?.includes("liar-impact")), { timeout: 10000 }).toBe(true);
  await expect
    .poll(
      async () => {
        const snapshot = await sceneSnapshot(host);
        return snapshot.completedTimelines?.includes("roulette");
      },
      { timeout: 15000, intervals: [100, 200, 350] }
    )
    .toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.resultUiUnlocked), { timeout: 5000 }).toBe(true);
  if ((await host.getByTestId("toy-roulette-readout").count()) > 0) {
    const readoutState = await host
      .getByTestId("toy-roulette-readout")
      .first()
      .evaluate((element) => ({
        unlocked: element.getAttribute("data-result-unlocked"),
        text: element.textContent ?? ""
      }))
      .catch(() => undefined);
    if (readoutState) {
      expect(readoutState.unlocked).toBe("true");
      expect(readoutState.text).toMatch(/Dry chamber|Hit: eliminated/i);
    }
  }
  await expect(host.getByTestId("challenge-panel")).toBeHidden({ timeout: 7000 });
  await expect.poll(() => challengeVisualStateCleared(host), { timeout: 5000 }).toBe(true);
  await expect.poll(() => nextTurnTimerIsHealthy(host), { timeout: 5000 }).toBe(true);
  const rouletteVisualResult = (await sceneSnapshot(host)).rouletteVisualResult;
  if (FORCED_ROULETTE_RESULT === "BLANK") {
    expect(rouletteVisualResult).toBe("dry");
  }
  if (FORCED_ROULETTE_RESULT === "LETHAL") {
    expect(rouletteVisualResult).toBe("water");
  }
  if (rouletteVisualResult === "dry") {
    await expect.poll(() => playablePageKey(host, guest), { timeout: 5000 }).toMatch(/host|guest/);
    const activePageKey = await playablePageKey(host, guest);
    const activePage = activePageKey === "host" ? host : guest;
    const activeCard = activePage.locator('[data-testid^="hand-card-"]:not(:disabled)').first();
    await activeCard.click();
    await expect(activeCard).toHaveAttribute("data-selected", "true");
    await expect(activePage.getByTestId("play-selected")).toBeEnabled();
    await activePage.getByTestId("play-selected").click();
    await expect(activePage.getByTestId("pile-count")).toContainText("1");
  } else {
    await expect(host.getByTestId("winner-banner")).toBeVisible({ timeout: 7000 });
    await expect
      .poll(
        () =>
          sceneSnapshot(host).then((snapshot) => ({
            winners: (snapshot.seatNameplates ?? []).filter((plate: { status?: string }) => plate.status === "WINNER").length,
            losers: (snapshot.seatNameplates ?? []).filter((plate: { status?: string }) => plate.status === "LOSER").length
          })),
        { timeout: 5000 }
      )
      .toEqual({ winners: 1, losers: 1 });
    await expect(host.getByTestId("endgame-actions")).toBeVisible();
    await expect(host.getByTestId("play-again")).toBeEnabled();
    await expect(host.getByTestId("exit-room")).toBeVisible();
    await host.getByTestId("play-again").click();
    await expect(host.getByTestId("bottom-action-tray")).toBeVisible({ timeout: 8000 });
  }
  await expect
    .poll(() => sceneSnapshot(host).then((snapshot) => ["liar-impact", "roulette", "elimination", "winner", "round-start", "card-play", "idle"].includes(snapshot.activeTimeline)), {
      timeout: 5000
    })
    .toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => ["liarImpact", "reveal", "roulette", "winner", "activeSeat", "cardPlay"].includes(snapshot.cameraPreset)), {
    timeout: 5000
  }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.visibleCharacterCount), { timeout: 2000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => ["idle", "accuse", "accused", "roulette", "relief", "eliminated", "winner", "thinking", "active", "play"].includes(snapshot.activeCharacterPose)), {
    timeout: 5000
  }).toBe(true);
  await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.queuedTimelineCount), { timeout: 10000 }).toBe(0);
  await expect(host.getByTestId("history-panel")).toHaveAttribute("data-open", "false");
  await host.getByTestId("history-toggle").click();
  await expect(host.getByTestId("history-panel")).toHaveAttribute("data-open", "true");
  await expect(host.getByTestId("history-panel").locator(".event-log")).toBeVisible();
  await expect(host.getByTestId("seat-status-strip")).toHaveCount(0);
  await expect(host.getByTestId("open-rules")).toBeEnabled();
  await host.getByTestId("open-rules").click();
  await expect(host.getByTestId("rules-overlay")).toBeVisible();
  await host.getByTestId("close-rules").click();

  await hostContext.close();
  await guestContext.close();
});

test("dev scene helper can stage dry click and hit roulette visuals", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByTestId("create-name").fill("Visual Host");
  await page.getByTestId("create-room").click();
  await expect(page.getByTestId("bar-scene")).toHaveAttribute("data-scene-ready", "true", { timeout: 10000 });
  await page.getByTestId("close-rules").click();

  await forceRouletteVisual(page, "BLANK");
  await forceRouletteVisual(page, "LETHAL");
});

test("four player room can start and spread an accumulated center pile", async ({ browser }) => {
  test.setTimeout(100_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const sockets: Socket[] = [];

  try {
    await installVoiceMocks(host);
    const roomCode = await createHostRoom(host, "Host");
    for (const name of ["Guest A", "Guest B", "Guest C"]) {
      sockets.push(await joinRoomSocket(roomCode, name));
    }
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).length), { timeout: 5000 }).toBe(4);

    const privateStates = sockets.map((socket) => waitForSocketEvent<PrivatePlayerState>(socket, "game:privateState", (state) => state.hand.length === 5));
    await host.getByRole("button", { name: "Start" }).click();
    const guestHands = await Promise.all(privateStates);
    await expect(host.locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });

    await playFirstEnabledCards(host, 3);
    await expect(host.getByTestId("pile-count")).toContainText("3");
    await expect.poll(() => pileVisualsAreStacked(host, 3), { timeout: 5000 }).toBe(true);

    sockets[0].emit("game:playCards", { roomCode, cardIds: guestHands[0].hand.slice(0, 2).map((card) => card.id) });
    await expect(host.getByTestId("pile-count")).toContainText("5", { timeout: 8000 });
    await expect.poll(() => pileVisualsAreStacked(host, 5), { timeout: 5000 }).toBe(true);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await hostContext.close();
  }
});

test("player can refresh and reconnect without leaking private cards", async ({ browser }) => {
  test.setTimeout(80_000);
  const setup = await createRoomWithPlayers(browser, ["Host", "Guest"]);

  try {
    await setup.host.getByRole("button", { name: "Start" }).click();
    await expect(setup.guestPages[0].locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });
    const guestFirstCardTestId = await setup.guestPages[0].locator('[data-testid^="hand-card-"]').first().getAttribute("data-testid");
    expect(guestFirstCardTestId).toBeTruthy();

    await setup.guestPages[0].reload();
    await expect(setup.guestPages[0].getByTestId("room-code")).toHaveCount(0, { timeout: 10000 });
    await expect(setup.guestPages[0].locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });
    await expect(setup.host.getByTestId(guestFirstCardTestId!)).toHaveCount(0);
  } finally {
    await closeSetup(setup);
  }
});

test("browser survivors can select cards after a 3-player hit elimination", async ({ browser }) => {
  test.skip(FORCED_ROULETTE_RESULT !== "LETHAL", "This release scenario is covered by npm run test:e2e:hit.");
  test.setTimeout(110_000);
  const setup = await createRoomWithPlayers(browser, ["Host", "Guest A", "Guest B"]);

  try {
    await setup.host.getByRole("button", { name: "Start" }).click();
    await expect(setup.host.locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });
    await playFirstEnabledCards(setup.host, 1);

    await expect(setup.guestPages[0].getByTestId("call-liar")).toBeEnabled({ timeout: 10000 });
    await setup.guestPages[0].getByTestId("call-liar").click();

    await expect
      .poll(() => sceneSnapshot(setup.host).then((snapshot) => (snapshot.seatChamberIndicators ?? []).filter((indicator: { eliminated: boolean }) => indicator.eliminated).length), {
        timeout: 18000
      })
      .toBe(1);
    await expect.poll(() => sceneSnapshot(setup.host).then((snapshot) => (snapshot.seatNameplates ?? []).filter((plate: { status?: string }) => plate.status === "LOSER").length), {
      timeout: 5000
    }).toBe(1);
    await expect(setup.host.getByTestId("winner-banner")).toHaveCount(0);
    await expect.poll(() => sceneSnapshot(setup.host).then((snapshot) => snapshot.phase), { timeout: 8000 }).toBe("playing");

    const pages = [setup.host, ...setup.guestPages];
    const playableIndex = await waitForPlayableBrowserPage(pages, 12_000);
    expect(playableIndex).toBeGreaterThanOrEqual(0);
    await playFirstEnabledCards(pages[playableIndex], 1);
    await expect
      .poll(() => sceneSnapshot(setup.host).then((snapshot) => (snapshot.settledPileVisualCount ?? 0) + (snapshot.visibleMotionCards ?? 0)), { timeout: 8000 })
      .toBeGreaterThan(0);
  } finally {
    await closeSetup(setup);
  }
});

test("three player hit eliminates one player and keeps the table playable", async ({ browser }) => {
  test.skip(FORCED_ROULETTE_RESULT !== "LETHAL", "This release scenario is covered by npm run test:e2e:hit.");
  test.setTimeout(100_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const sockets: TrackedSocket[] = [];

  try {
    await installVoiceMocks(host);
    const roomCode = await createHostRoom(host, "Host");
    sockets.push(await joinTrackedRoomSocket(roomCode, "Guest A"));
    sockets.push(await joinTrackedRoomSocket(roomCode, "Guest B"));
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).length), { timeout: 5000 }).toBe(3);

    await host.getByRole("button", { name: "Start" }).click();
    await expect(host.locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });
    await playFirstEnabledCards(host, 1);

    await waitForTrackedPlayerTurn(sockets[0]);
    sockets[0].socket.emit("game:callLiar", { roomCode });

    await expect
      .poll(() => eliminatedPlayerCount(host, sockets), { timeout: 18000 })
      .toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.resultUiUnlocked), { timeout: 18000 }).toBe(true);
    await expect(host.getByTestId("challenge-panel")).toBeHidden({ timeout: 18000 });
    await expect(host.getByTestId("winner-banner")).toHaveCount(0);
    await expect
      .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatChamberIndicators ?? []).filter((indicator: { eliminated: boolean }) => indicator.eliminated).length), {
        timeout: 8000
      })
      .toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).filter((plate: { status?: string }) => plate.status === "LOSER").length), {
      timeout: 5000
    }).toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.phase), { timeout: 8000 }).toBe("playing");
    await advanceSurvivingPlayer(host, sockets, roomCode);
    await expect
      .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.settledPileVisualCount ?? 0) + (snapshot.visibleMotionCards ?? 0)), { timeout: 8000 })
      .toBeGreaterThan(0);
  } finally {
    sockets.forEach((tracked) => tracked.socket.disconnect());
    await hostContext.close();
  }
});

test("four player hit eliminates one player and survivors can keep playing", async ({ browser }) => {
  test.skip(FORCED_ROULETTE_RESULT !== "LETHAL", "This release scenario is covered by npm run test:e2e:hit.");
  test.setTimeout(110_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const sockets: TrackedSocket[] = [];

  try {
    await installVoiceMocks(host);
    const roomCode = await createHostRoom(host, "Host");
    sockets.push(await joinTrackedRoomSocket(roomCode, "Guest A"));
    sockets.push(await joinTrackedRoomSocket(roomCode, "Guest B"));
    sockets.push(await joinTrackedRoomSocket(roomCode, "Guest C"));
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).length), { timeout: 5000 }).toBe(4);

    await host.getByRole("button", { name: "Start" }).click();
    await expect(host.locator('[data-testid^="hand-card-"]').first()).toBeVisible({ timeout: 10000 });
    await playFirstEnabledCards(host, 1);

    await waitForTrackedPlayerTurn(sockets[0]);
    sockets[0].socket.emit("game:callLiar", { roomCode });

    await expect
      .poll(() => eliminatedPlayerCount(host, sockets), { timeout: 18000 })
      .toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.resultUiUnlocked), { timeout: 18000 }).toBe(true);
    await expect(host.getByTestId("challenge-panel")).toBeHidden({ timeout: 18000 });
    await expect(host.getByTestId("winner-banner")).toHaveCount(0);
    await expect
      .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatChamberIndicators ?? []).filter((indicator: { eliminated: boolean }) => indicator.eliminated).length), {
        timeout: 8000
      })
      .toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).filter((plate: { status?: string }) => plate.status === "LOSER").length), {
      timeout: 5000
    }).toBe(1);
    await expect.poll(() => sceneSnapshot(host).then((snapshot) => snapshot.phase), { timeout: 8000 }).toBe("playing");
    await advanceSurvivingPlayer(host, sockets, roomCode);
    await expect
      .poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.settledPileVisualCount ?? 0) + (snapshot.visibleMotionCards ?? 0)), { timeout: 8000 })
      .toBeGreaterThan(0);
  } finally {
    sockets.forEach((tracked) => tracked.socket.disconnect());
    await hostContext.close();
  }
});

async function sceneAssetIds(page: import("@playwright/test").Page) {
  const snapshot = await sceneSnapshot(page);
  return [...(snapshot?.assetIds ?? [])].sort();
}

async function sceneSnapshot(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as any).__RRLD_CINEMATIC_SCENE__?.());
}

function hasToyGunMeshes(snapshot: any) {
  const meshNames = new Set(snapshot?.toyGunMeshNames ?? []);
  const hasOldRealisticModel = ["RealisticRouletteGun", "Sketchfab9mmModel", "LoadedSketchfab9mmRoulette", "Slide", "MagazineBase"].some((name) =>
    meshNames.has(name)
  );
  const hasOldToyModel = ["SimpleWaterPistol", "ToyBody", "WaterTank", "ToyNozzle", "ToyGrip"].some((name) => meshNames.has(name));
  return (
    !hasOldRealisticModel &&
    !hasOldToyModel &&
    [
      "LoadedToyRoulette",
      "CinematicRouletteProp",
      "RevolverFrame",
      "ModernFrameRail",
      "TacticalTopRail",
      "FrameSidePlate",
      "BarrelShroud",
      "RealisticBarrel",
      "BarrelBore",
      "FrontSight",
      "RearSight",
      "Hammer",
      "SixShotDial",
      "SixShotCylinder",
      "CylinderFrontRim",
      "TriggerGuard",
      "TriggerPivot",
      "GripPanelLeft",
      "GripPanelRight",
      "GripStipple_0",
      "NozzleAnchor",
      "ResultLight"
    ].every((name) => meshNames.has(name))
  );
}

function tableHasNoVisibleSlotMeshes(snapshot: any) {
  const meshNames = new Set(snapshot?.tableMeshNames ?? []);
  if (!meshNames.has("TableTop") || !meshNames.has("FeltInset")) {
    return false;
  }
  if (!["TableApron", "PaddedOuterRail", "CentralPedestal", "WeightedFoot"].every((name) => meshNames.has(name))) {
    return false;
  }
  return !["DeckOrigin", "RankSlot", "RouletteSlot", "PileSlot", "BrassStud_0", "BrassStud_1", "BrassStud_2", "BrassStud_3"].some((name) => meshNames.has(name));
}

async function forceRouletteVisual(page: import("@playwright/test").Page, result: "BLANK" | "LETHAL") {
  const observedStates = new Set<string>();
  let streamSeen = false;
  let splashSeen = false;
  let dryPuffSeen = false;
  let unlockedTooEarly = false;
  await page.evaluate((forcedResult) => {
    const helper = (window as any).__RRLD_CINEMATIC_SCENE_TEST__;
    if (!helper) {
      throw new Error("Scene test helper is not available.");
    }
    void helper.playRouletteVisual(forcedResult);
  }, result);

  await expect
    .poll(
      async () => {
        const snapshot = await sceneSnapshot(page);
        observedStates.add(snapshot.rouletteState);
        streamSeen ||= Boolean(snapshot.waterStreamVisible);
        splashSeen ||= Boolean(snapshot.waterSplashVisible);
        dryPuffSeen ||= Boolean(snapshot.dryPuffVisible);
        unlockedTooEarly ||= Boolean(
          snapshot.resultUiUnlocked && ((result === "LETHAL" && !splashSeen) || (result === "BLANK" && !dryPuffSeen))
        );
        if (result === "LETHAL") {
          return snapshot.rouletteVisualResult === "water" && observedStates.has("aiming") && observedStates.has("waterShot") && splashSeen && snapshot.resultUiUnlocked;
        }
        return snapshot.rouletteVisualResult === "dry" && observedStates.has("aiming") && observedStates.has("dryFire") && dryPuffSeen && snapshot.resultUiUnlocked;
      },
      { timeout: 15000, intervals: [100, 160, 260] }
    )
    .toBe(true);

  await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.rouletteState), { timeout: 8000 }).toBe(result === "LETHAL" ? "lethal" : "blank");
  expect(unlockedTooEarly).toBe(false);
  if (result === "LETHAL") {
    expect(streamSeen).toBe(true);
    expect(splashSeen).toBe(true);
    expect(dryPuffSeen).toBe(false);
    await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.waterStreamVisible), { timeout: 5000 }).toBe(false);
    await expect.poll(() => sceneSnapshot(page).then((snapshot) => snapshot.waterSplashVisible), { timeout: 5000 }).toBe(false);
  } else {
    expect(streamSeen).toBe(false);
    expect(splashSeen).toBe(false);
    expect(dryPuffSeen).toBe(true);
  }
}

async function canvasHasNonBlankPixels(page: import("@playwright/test").Page) {
  return page.locator(".bar-scene canvas").evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const gl = element.getContext("webgl2", { preserveDrawingBuffer: true }) ?? element.getContext("webgl", { preserveDrawingBuffer: true });
    if (!gl) {
      return false;
    }

    const width = Math.max(1, Math.floor(element.width / 2));
    const height = Math.max(1, Math.floor(element.height / 2));
    const pixels = new Uint8Array(4 * 6 * 6);
    gl.readPixels(width - 3, height - 3, 6, 6, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 24) {
        return true;
      }
    }
    return false;
  });
}

async function bottomTrayIsPinned(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const tray = document.querySelector('[data-testid="bottom-action-tray"]');
    const shell = document.querySelector(".app-shell");
    if (!tray || !shell || shell.getAttribute("data-game-ui") !== "active") {
      return false;
    }
    const rect = tray.getBoundingClientRect();
    return window.scrollY === 0 && rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
  });
}

async function inviteCodeIsProminent(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const invite = document.querySelector('[data-testid="invite-code"]');
    const code = document.querySelector('[data-testid="room-code"]');
    if (!invite || !code) {
      return false;
    }
    const inviteRect = invite.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    return inviteRect.width >= 140 && inviteRect.height >= 42 && codeRect.height >= 24;
  });
}

async function activeLayoutFitsViewport(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const tray = document.querySelector('[data-testid="bottom-action-tray"]');
    const surface = document.querySelector(".table-surface");
    if (!shell || !tray || !surface || shell.getAttribute("data-game-ui") !== "active") {
      return false;
    }
    const trayRect = tray.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    return window.scrollY === 0 && document.documentElement.scrollHeight <= window.innerHeight + 1 && trayRect.bottom <= window.innerHeight + 1 && surfaceRect.top >= 0;
  });
}

async function challengePanelFitsViewport(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="challenge-panel"]');
    if (!panel) {
      return false;
    }
    const rect = panel.getBoundingClientRect();
    const style = window.getComputedStyle(panel);
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth + 1 &&
      rect.bottom <= window.innerHeight + 1 &&
      style.overflowY !== "auto" &&
      style.overflowY !== "scroll"
    );
  });
}

async function challengeVisualStateCleared(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const surface = document.querySelector(".table-surface");
    const cockpit = document.querySelector(".game-cockpit");
    const panel = document.querySelector('[data-testid="challenge-panel"]');
    const phase = cockpit?.getAttribute("data-phase");
    return surface?.getAttribute("data-challenge") === "false" && cockpit?.getAttribute("data-cinematic") === "false" && !panel && (phase === "playing" || phase === "gameOver");
  });
}

async function nextTurnTimerIsHealthy(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    if (shell?.getAttribute("data-game-ui") !== "active") {
      return true;
    }
    const timerText = document.querySelector(".timer-wrap strong")?.textContent ?? "";
    const seconds = Number(timerText.replace(/\D/g, ""));
    return Number.isFinite(seconds) && seconds >= 20;
  });
}

async function playablePageKey(host: import("@playwright/test").Page, guest: import("@playwright/test").Page) {
  const [hostPlayable, guestPlayable] = await Promise.all([hasPlayableHandCard(host), hasPlayableHandCard(guest)]);
  if (hostPlayable) {
    return "host";
  }
  if (guestPlayable) {
    return "guest";
  }
  return "none";
}

async function hasPlayableHandCard(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const cockpit = document.querySelector(".game-cockpit");
    const tray = document.querySelector('[data-testid="bottom-action-tray"]');
    const card = document.querySelector('[data-testid^="hand-card-"]:not(:disabled)');
    if (!cockpit || !tray || !card) {
      return false;
    }
    return cockpit.getAttribute("data-controls-blocked") !== "true" && getComputedStyle(tray).pointerEvents !== "none" && getComputedStyle(card).pointerEvents !== "none";
  });
}

async function waitForPlayableBrowserPage(pages: import("@playwright/test").Page[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let index = 0; index < pages.length; index += 1) {
      if (await hasPlayableHandCard(pages[index])) {
        return index;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return -1;
}

async function compactHeaderLeavesNameplatesVisible(page: import("@playwright/test").Page, expectedNameplates: number) {
  const snapshot = await sceneSnapshot(page);
  const nameplates = snapshot?.seatNameplates ?? [];
  if (nameplates.length < expectedNameplates) {
    return false;
  }

  return page.evaluate(() => {
    const compactTopbar = document.querySelector('.topbar[data-compact="true"]');
    const brandLockup = document.querySelector(".topbar .brand-lockup");
    if (!compactTopbar) {
      return false;
    }

    const brandStyle = brandLockup ? window.getComputedStyle(brandLockup) : undefined;
    return !brandStyle || brandStyle.display === "none" || brandStyle.visibility === "hidden";
  });
}

async function pileVisualsAreStacked(page: import("@playwright/test").Page, minCount: number) {
  const snapshot = await sceneSnapshot(page);
  const positions = snapshot?.pileVisualPositions ?? [];
  if (positions.length < minCount) {
    return false;
  }
  const uniqueSlots = new Set(positions.map((position: { x: number; y: number; z: number; rotationZ: number }) => `${position.x}:${position.y}:${position.z}:${position.rotationZ}`));
  const xs = positions.map((position: { x: number }) => position.x);
  const ys = positions.map((position: { y: number }) => position.y);
  const zs = positions.map((position: { z: number }) => position.z);
  return (
    uniqueSlots.size >= minCount &&
    Math.max(...xs) - Math.min(...xs) < 0.18 &&
    Math.max(...zs) - Math.min(...zs) < 0.12 &&
    (minCount === 1 || Math.max(...ys) - Math.min(...ys) > 0.018 * (minCount - 1))
  );
}

async function pileVisualCountDoesNotDouble(page: import("@playwright/test").Page, expectedCount: number) {
  const snapshot = await sceneSnapshot(page);
  return (snapshot?.visibleMotionCards ?? 0) + (snapshot?.settledPileVisualCount ?? 0) <= expectedCount;
}

async function sceneOrbitChangesAfterDrag(page: import("@playwright/test").Page) {
  const before = await sceneSnapshot(page);
  await page.mouse.move(520, 280);
  await page.mouse.down();
  await page.mouse.move(700, 330, { steps: 8 });
  await page.mouse.up();
  const after = await sceneSnapshot(page);
  return (
    after?.cameraUserControlled === true &&
    (Math.abs((after?.userCameraYaw ?? 0) - (before?.userCameraYaw ?? 0)) > 0.02 || Math.abs((after?.userCameraPitch ?? 0) - (before?.userCameraPitch ?? 0)) > 0.02)
  );
}

async function topbarCopyFits(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const topbar = document.querySelector(".topbar");
    const title = document.querySelector(".topbar h1");
    const status = document.querySelector(".status-pill");
    if (!topbar || !status) {
      return false;
    }
    if (topbar.getAttribute("data-compact") === "true") {
      const topbarRect = topbar.getBoundingClientRect();
      return topbarRect.height <= 86 && topbarRect.left >= 0 && topbarRect.right <= window.innerWidth + 1;
    }
    if (!title) {
      return false;
    }
    const topbarRect = topbar.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    return (
      titleRect.width > 24 &&
      titleRect.height >= 14 &&
      title.scrollWidth <= title.clientWidth + 2 &&
      titleRect.top >= topbarRect.top - 1 &&
      titleRect.bottom <= topbarRect.bottom + 1 &&
      statusRect.right <= topbarRect.right + 1 &&
      statusRect.bottom <= topbarRect.bottom + 1
    );
  });
}

async function createRoomWithPlayers(browser: import("@playwright/test").Browser, names: string[]) {
  const contexts = await Promise.all(names.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  await Promise.all(pages.map(installVoiceMocks));
  const [host, ...guestPages] = pages;

  const roomCode = await createHostRoom(host, names[0]);

  for (let index = 0; index < guestPages.length; index += 1) {
    const guest = guestPages[index];
    await guest.goto("/");
    await guest.getByTestId("entry-mode-join").click();
    await guest.getByTestId("join-name").fill(names[index + 1]);
    await guest.getByTestId("join-code").fill(roomCode);
    await guest.getByTestId("join-room").click();
    await expect(guest.getByTestId("room-code")).toHaveText(roomCode);
    if ((await guest.getByTestId("rules-overlay").count()) > 0) {
      await guest.getByTestId("close-rules").click();
    }
  }

  await expect.poll(() => sceneSnapshot(host).then((snapshot) => (snapshot.seatNameplates ?? []).length), { timeout: 5000 }).toBe(names.length);
  return { contexts, pages, host, guestPages, roomCode };
}

async function createHostRoom(host: import("@playwright/test").Page, name: string) {
  await host.goto("/");
  await host.getByTestId("create-name").fill(name);
  await host.getByTestId("create-room").click();
  await expect(host.getByTestId("room-code")).toBeVisible();
  if ((await host.getByTestId("rules-overlay").count()) > 0) {
    await host.getByTestId("close-rules").click();
  }
  return (await host.getByTestId("room-code").innerText()).trim();
}

async function joinRoomSocket(roomCode: string, name: string) {
  const socket = io(E2E_SERVER_URL, { transports: ["websocket"] });
  await waitForSocketEvent(socket, "connect");
  socket.emit("room:join", { roomCode, name });
  await waitForSocketEvent<RoomState>(socket, "room:state", (state) => state.code === roomCode && state.you?.playerId !== undefined);
  return socket;
}

async function joinTrackedRoomSocket(roomCode: string, name: string): Promise<TrackedSocket> {
  const socket = io(E2E_SERVER_URL, { transports: ["websocket"] });
  const tracked: TrackedSocket = {
    socket,
    playerId: ""
  };

  socket.on("room:state", (state: RoomState) => {
    tracked.latestRoom = state;
    tracked.playerId = state.you?.playerId ?? tracked.playerId;
  });
  socket.on("game:privateState", (state: PrivatePlayerState) => {
    tracked.latestPrivate = state;
    tracked.playerId = state.playerId;
  });

  await waitForSocketEvent(socket, "connect");
  socket.emit("room:join", { roomCode, name });
  const initialRoom = await waitForSocketEvent<RoomState>(socket, "room:state", (state) => state.code === roomCode && state.you?.playerId !== undefined);
  tracked.latestRoom = initialRoom;
  tracked.playerId = initialRoom.you?.playerId ?? "";
  return tracked;
}

async function advanceSurvivingPlayer(host: import("@playwright/test").Page, sockets: TrackedSocket[], roomCode: string) {
  await expect
    .poll(
      async () => {
        const state = await getBestRoomState(host, sockets);
        return state?.game?.phase === "playing" ? state.game.currentTurnPlayerId ?? "" : "";
      },
      { timeout: 10000 }
    )
    .not.toBe("");

  await expect
    .poll(
      async () => {
        const state = await getBestRoomState(host, sockets);
        const lockExpiresAt = state?.game?.actionsLockedUntil ?? 0;
        const snapshot = await sceneSnapshot(host);
        return lockExpiresAt <= Date.now() && snapshot?.actionsLocked !== true;
      },
      { timeout: 12000 }
    )
    .toBe(true);

  const roomState = await getBestRoomState(host, sockets);
  const currentTurnPlayerId = roomState?.game?.currentTurnPlayerId;
  expect(currentTurnPlayerId).toBeTruthy();

  const activePlayer = roomState?.players.find((player) => player.id === currentTurnPlayerId);
  expect(activePlayer?.eliminated).toBe(false);

  if (await hasPlayableHandCard(host)) {
    await playFirstEnabledCards(host, 1);
    return;
  }

  const tracked = sockets.find((candidate) => candidate.playerId === currentTurnPlayerId);
  expect(tracked, `No tracked socket for active survivor ${currentTurnPlayerId ?? "unknown"}`).toBeTruthy();

  await expect
    .poll(() => Promise.resolve(tracked?.latestPrivate?.hand?.[0]?.id ?? ""), { timeout: 10000 })
    .not.toBe("");

  const cardId = tracked!.latestPrivate!.hand[0]!.id;
  tracked!.socket.emit("game:playCards", { roomCode, cardIds: [cardId] });
}

async function waitForTrackedPlayerTurn(tracked: TrackedSocket) {
  await expect
    .poll(() => Promise.resolve(tracked.latestRoom?.game?.currentTurnPlayerId ?? ""), { timeout: 10000 })
    .toBe(tracked.playerId);
}

async function eliminatedPlayerCount(host: import("@playwright/test").Page, sockets: TrackedSocket[]) {
  const roomState = await getBestRoomState(host, sockets);
  return roomState?.players.filter((player) => player.eliminated).length ?? 0;
}

async function getBestRoomState(host: import("@playwright/test").Page, sockets: TrackedSocket[]): Promise<RoomState | undefined> {
  const browserRoom = await host.evaluate(() => (window as any).__RRLD_ROOM_STATE__).catch(() => undefined);
  if (browserRoom?.game?.phase === "playing") {
    return browserRoom as RoomState;
  }
  return sockets.find((tracked) => tracked.latestRoom?.game)?.latestRoom;
}

function waitForSocketEvent<T = unknown>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 10_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });
}

async function closeSetup(setup: { contexts: import("@playwright/test").BrowserContext[] }) {
  await Promise.all(setup.contexts.map((context) => context.close()));
}

async function playFirstEnabledCards(page: import("@playwright/test").Page, count: number) {
  const cards = page.locator('[data-testid^="hand-card-"]:not(:disabled)');
  await expect(cards.first()).toBeVisible({ timeout: 10000 });
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    await card.click();
    await expect(card).toHaveAttribute("data-selected", "true");
  }
  await expect(page.getByTestId("play-selected")).toBeEnabled();
  await page.getByTestId("play-selected").click();
}

async function soloDockIsCompact(page: import("@playwright/test").Page) {
  return page.getByTestId("solo-dock").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width <= 310 && rect.height <= 330 && style.overflow === "hidden";
  });
}

async function installVoiceMocks(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const RealAudioContext = window.AudioContext || window.webkitAudioContext;
    const realAudioContext = RealAudioContext ? new RealAudioContext() : undefined;
    const stream = realAudioContext?.createMediaStreamDestination().stream ?? new MediaStream();
    const remoteStream = realAudioContext?.createMediaStreamDestination().stream ?? stream;
    const remoteTrack = remoteStream.getAudioTracks()[0];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => stream
      }
    });

    class MockAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};

      createAnalyser() {
        return {
          fftSize: 512,
          frequencyBinCount: 1,
          __level: 0,
          getByteFrequencyData(samples: Uint8Array) {
            samples[0] = (this as { __level?: number }).__level ?? 0;
          }
        };
      }

      createMediaStreamSource(sourceStream?: MediaStream) {
        return {
          connect(analyser?: { __level?: number }) {
            if (analyser) {
              analyser.__level = sourceStream === remoteStream ? 48 : 0;
            }
            return undefined;
          },
          disconnect() {
            return undefined;
          }
        };
      }

      createOscillator() {
        return {
          type: "sine",
          frequency: { value: 0 },
          connect() {
            return undefined;
          },
          start() {
            return undefined;
          },
          stop() {
            return undefined;
          },
          disconnect() {
            return undefined;
          }
        };
      }

      createGain() {
        return {
          gain: {
            setValueAtTime() {
              return undefined;
            },
            exponentialRampToValueAtTime() {
              return undefined;
            }
          },
          connect() {
            return undefined;
          },
          disconnect() {
            return undefined;
          }
        };
      }

      async resume() {
        return undefined;
      }

      async close() {
        return undefined;
      }
    }

    class MockRTCPeerConnection extends EventTarget {
      localDescription: RTCSessionDescriptionInit | null = null;
      signalingState: RTCSignalingState = "stable";
      connectionState: RTCPeerConnectionState = "connected";
      onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
      ontrack: ((event: RTCTrackEvent) => void) | null = null;
      private readonly senders: RTCRtpSender[] = [];
      private trackEmitted = false;

      addTrack(track?: MediaStreamTrack) {
        const sender = { track } as RTCRtpSender;
        this.senders.push(sender);
        return sender;
      }

      getSenders() {
        return this.senders;
      }

      async createOffer() {
        return { type: "offer" as RTCSdpType, sdp: "v=0\r\nmock-offer" };
      }

      async createAnswer() {
        return { type: "answer" as RTCSdpType, sdp: "v=0\r\nmock-answer" };
      }

      async setLocalDescription(description: RTCSessionDescriptionInit) {
        this.localDescription = description;
        window.setTimeout(() => {
          this.onicecandidate?.({ candidate: null } as RTCPeerConnectionIceEvent);
        }, 0);
      }

      async setRemoteDescription() {
        if (!this.trackEmitted && remoteTrack) {
          this.trackEmitted = true;
          window.setTimeout(() => {
            this.ontrack?.({ streams: [remoteStream], track: remoteTrack } as RTCTrackEvent);
          }, 0);
        }
        return undefined;
      }

      async addIceCandidate() {
        return undefined;
      }

      close() {
        this.connectionState = "closed";
      }
    }

    Object.defineProperty(window, "AudioContext", { configurable: true, value: MockAudioContext });
    Object.defineProperty(window, "RTCPeerConnection", { configurable: true, value: MockRTCPeerConnection });
  });
}
