export function boardSession(ctx, basic) {
  const {
    state,
    board,
    $,
    esc,
    changeBoard,
    showDialog,
    dialogHead,
    toast,
    sync,
    updateCamera,
  } = ctx;
  let members = [],
    following = null,
    broadcasting = false,
    invite = 0,
    lastInvite = "",
    room = "";
  const dismissed=new Set();
  // Presenting and invitations belong to one board: start afresh when the board changes. Actions
  // call this too, so a heartbeat that ran before the board loaded cannot clear them.
  function enter() {
    const key = board()?.id;
    if (key === room) return;
    room = key;
    following = null;
    broadcasting = false;
    invite = 0;
  }
  const session = () => board()?.settings?.session || {};
  const write = (fn) =>
    changeBoard((b) => {
      b.settings ||= {};
      b.settings.session ||= { votes: [] };
      fn(b.settings.session);
    });
  function open() {
    const s = session(),
      mine = s.votes?.find((v) => v.id === sync.client)?.nodes || [],
      totals = new Map();
    for (const ballot of s.votes || [])
      for (const id of ballot.nodes) totals.set(id, (totals.get(id) || 0) + 1);
    showDialog(
      `<dialog class="dialog">${dialogHead("Board session")}<div class="dialog-body"><fieldset><legend>Present together</legend><button type="button" data-session="broadcast">${broadcasting ? "Stop presenting" : "Share my view"}</button><button type="button" data-session="invite">Invite everyone to my view</button>${following ? '<button type="button" data-session="unfollow">Stop following</button>' : ""}<p>Following is optional. An invitation never moves another person’s camera without their choice.</p>${members
        .filter((m) => m.client !== sync.client && m.presenting)
        .map(
          (m) =>
            `<button type="button" data-follow="${esc(m.client)}">Follow ${esc(m.name)}</button>`,
        )
        .join(
          "",
        )}</fieldset><fieldset><legend>Timer</legend><label>Minutes <input id="session-minutes" type="number" min="1" max="180" value="5"></label><button type="button" data-session="timer">Start timer</button><button type="button" data-session="timer-stop">Stop timer</button><output data-session-timer></output></fieldset><fieldset><legend>Voting</legend><p>Select board objects, then cast your votes. Up to ${s.voteLimit || 3} objects per person. Votes can be replaced before the session closes.</p><label>Votes per person <input id="session-vote-limit" type="number" min="1" max="20" value="${s.voteLimit || 3}"></label><button type="button" data-session="vote-start">Start new vote</button><button type="button" data-session="vote-cast" ${!s.voting ? "disabled" : ""}>Vote for selection (${basic.pick().length})</button><button type="button" data-session="vote-stop">Close voting</button><p>${mine.length} votes cast by you · ${s.voting ? "Voting open" : "Voting closed"}</p>${[
        ...totals,
      ]
        .sort((a, b) => b[1] - a[1])
        .map(([id, count]) => {
          const n = board().nodes.find((n) => n.id === id);
          return `<p><strong>${count}</strong> ${esc(n?.text || ctx.task(n?.task)?.title || "Removed object")}</p>`;
        })
        .join("")}</fieldset></div></dialog>`,
      "board-session",
    );
    tick();
  }
  document.addEventListener("click", (e) => {
    if(e.target.closest("[data-session-dismiss],[data-follow]")){dismissed.add(lastInvite);$("#session-invitation")?.remove();}
    const follow = e.target.closest("[data-follow]");
    if (follow) {
      following = follow.dataset.follow;
      ctx.closeDialog(true);
      toast(
        "Following presenter. Use Stop following to regain camera control.",
      );
      return;
    }
    const action = e.target.closest("[data-session]")?.dataset.session;
    if (!action) return;
    enter();
    if (action === "open") return open();
    if (action === "broadcast") broadcasting = !broadcasting;
    if (action === "invite") {
      broadcasting = true;
      invite = Date.now();
      toast("Invitation sent to people on this board.");
    }
    if (action === "unfollow") following = null;
    if (action === "timer")
      write(
        (s) =>
          (s.timerEnd =
            Date.now() +
            Math.max(1, Math.min(180, +$("#session-minutes").value || 5)) *
              60000),
      );
    if (action === "timer-stop") write((s) => delete s.timerEnd);
    if (action === "vote-start")
      write((s) => {
        s.voting = true;
        s.voteLimit = Math.max(
          1,
          Math.min(20, +$("#session-vote-limit").value || 3),
        );
        s.votes = [];
        s.voteStarted = Date.now();
      });
    if (action === "vote-stop") write((s) => (s.voting = false));
    if (action === "vote-cast") {
      const ids = basic.pick().map((n) => n.id),
        s = session();
      if (!s.voting) return;
      if (ids.length > (s.voteLimit || 3))
        return toast(`Select up to ${s.voteLimit || 3} objects.`);
      write((s) => {
        s.votes = (s.votes || []).filter((v) => v.id !== sync.client);
        s.votes.push({ id: sync.client, nodes: ids });
      });
    }
    if (action !== "unfollow") open();
  });
  function tick() {
    const c = $("#canvas");
    if (!c) return;
    const s = session();
    let bar = $("#session-status");
    if (!bar) {
      c.insertAdjacentHTML(
        "beforeend",
        '<div id="session-status" class="session-status"></div>',
      );
      bar = $("#session-status");
    }
    const time = s.timerEnd
        ? Math.max(0, Math.ceil((s.timerEnd - Date.now()) / 1000))
        : null,
      clock =
        time == null
          ? ""
          : `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
    const html = `${time != null ? `<output aria-label="Board timer">${time === 0 ? "Time is up" : clock}</output>` : ""}${following ? '<button data-session="unfollow">Stop following</button>' : ""}${s.voting ? '<button data-session="open">Voting open</button>' : ""}`;
    if (bar.innerHTML !== html) bar.innerHTML = html;
    document
      .querySelectorAll("[data-session-timer]")
      .forEach((el) => (el.textContent = clock));
  }
  setInterval(tick, 1000);
  return {
    payload() {
      enter();
      return { camera: state.camera, presenting: broadcasting, invite };
    },
    update(next) {
      members = next;
      const m = members.find((m) => m.client === following && m.presenting);
      if (following && !m) following = null;
      if (m?.camera && !state.canvasEditing && !state.dialog && !basic.busy()) {
        state.camera = { ...m.camera };
        updateCamera();
      }
      const invitation = members
        .filter(
          (m) =>
            m.client !== sync.client &&
            m.invite &&
            Date.now() - m.invite < 15000,
        )
        .sort((a, b) => b.invite - a.invite)[0];
      if (
        invitation &&
        !dismissed.has(`${invitation.client}:${invitation.invite}`) && !$("#session-invitation")
      ) {
        lastInvite = `${invitation.client}:${invitation.invite}`;
        $("#session-invitation")?.remove();
        $("#canvas")?.insertAdjacentHTML(
          "beforeend",
          `<div id="session-invitation" class="session-invitation canvas-panel">${esc(invitation.name)} invited you to follow. <button data-follow="${esc(invitation.client)}">Follow</button><button data-session-dismiss>Dismiss</button></div>`,
        );
        setTimeout(() => $("#session-invitation")?.remove(), 15000);
      }
      tick();
    },
  };
}
