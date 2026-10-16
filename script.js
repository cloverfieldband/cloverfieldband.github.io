/* =========================================================
   Clover Field · page logic
   Nothing to edit here. Band info lives in band-info.js.
   ========================================================= */

/* ---------- 1. Fill the page from band-info.js ---------- */

(() => {
  const band = window.BAND || {};
  const val = (key) => (typeof band[key] === "string" ? band[key].trim() : "");
  const asset = (name) => (name ? "assets/" + name.replace(/^\/?(assets\/)?/, "") : "");
  const missing = [];

  // Plain text fields
  document.querySelectorAll("[data-field]").forEach((el) => {
    const text = val(el.dataset.field);
    if (text) el.textContent = text;
    else if (el.dataset.field !== "releaseLine") el.hidden = true;
  });
  if (!val("tagline")) missing.push("tagline");
  if (!val("clipCaption")) missing.push("clipCaption");

  // Logo (optional)
  if (val("logoFile")) {
    const img = document.querySelector(".wordmark__logo");
    img.src = asset(val("logoFile"));
    img.hidden = false;
    document.querySelector(".wordmark__text").hidden = true;
    img.addEventListener("error", () => {
      img.hidden = true;
      document.querySelector(".wordmark__text").hidden = false;
    });
  }

  // Buttons
  document.querySelectorAll("[data-link]").forEach((a) => {
    const url = val(a.dataset.link);
    if (url) {
      a.href = url;
      return;
    }
    // No link yet: show a quiet "coming soon" label instead of a dead button
    missing.push(a.dataset.link);
    const soon = document.createElement("span");
    soon.className = a.className + " btn--soon";
    soon.innerHTML = a.innerHTML;
    soon.querySelector("span").textContent =
      a.dataset.link === "streamingLink" ? "Streaming soon" : "Video coming soon";
    a.replaceWith(soon);
  });
  if (!val("streamingLink")) document.querySelector(".actions__note").hidden = true;

  // Video
  const frame = document.querySelector(".clip__frame");
  const video = frame.querySelector("video");
  const shapes = { wide: "16 / 9", vertical: "9 / 16", portrait: "4 / 5", square: "1 / 1" };
  const shape = shapes[val("videoShape")] ? val("videoShape") : "wide";
  frame.style.setProperty("--ratio", shapes[shape]);
  frame.dataset.shape = shape;
  if (val("posterFile")) video.poster = asset(val("posterFile"));
  if (val("videoFile")) video.src = asset(val("videoFile"));
  else missing.push("videoFile");

  // EP title + songs
  if (val("epTitle")) document.querySelector(".tracks__title").textContent = val("epTitle");
  const list = document.querySelector(".tracklist");
  (band.songs || []).forEach((song, i) => {
    const title = (song.title || "").trim();
    const length = (song.length || "").trim();
    if (!title) missing.push(`song ${i + 1} title`);
    const li = document.createElement("li");
    li.className = "track";
    li.innerHTML =
      `<span class="track__no">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="track__name"></span>` +
      (length ? `<span class="track__leader" aria-hidden="true"></span><span class="track__time"></span>` : "");
    li.querySelector(".track__name").textContent = title || "Song title";
    if (length) li.querySelector(".track__time").textContent = length;
    list.appendChild(li);
  });

  // Instagram
  // Accepts "name", "@name" or a pasted Instagram link (tracking bits after ? are dropped)
  const handle = val("instagram")
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/[?#].*$/, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  const ig = document.querySelector(".footer__ig");
  if (handle) {
    ig.href = `https://www.instagram.com/${handle}/`;
    ig.querySelector("span").textContent = "@" + handle;
  } else {
    missing.push("instagram");
  }

  // Footer year
  document.querySelector("[data-year]").textContent = new Date().getFullYear();

  // Setup bar: only when previewing locally, never on the live site
  const local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local && missing.length) {
    const bar = document.querySelector(".setup-bar");
    bar.textContent = "Still blank in band-info.js: " + missing.join(", ");
    bar.hidden = false;
  }
  if (!window.BAND && local) {
    const bar = document.querySelector(".setup-bar");
    bar.textContent = "band-info.js didn't load. Check it for a missing quote mark or comma.";
    bar.hidden = false;
  }
})();


/* ---------- 2. Clip behaviour ----------
   Desktop (mouse):  hover → play with sound; mouse out → pause.
                     If the browser blocks sound, the clip plays muted
                     and a "Click for sound" button appears.
   Phone (touch):    scrolls into view → plays muted, with "Tap for sound".
                     Tap → sound on. Tap again → pause. Scrolls away → pause.
   Reduced motion:   never autoplays; shows the play button instead.
*/

(() => {
  const frame = document.querySelector(".clip__frame");
  if (!frame) return;

  const video = frame.querySelector("video");
  const playBtn = frame.querySelector(".clip__play");
  const soundBtn = frame.querySelector(".clip__sound");
  const soundLabel = frame.querySelector(".clip__sound-label");
  const hint = document.querySelector(".clip__hint");
  const fallback = frame.querySelector(".clip__fallback");

  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let userPaused = false;   // they tapped pause: don't auto-resume on scroll
  let wantsSound = false;   // they've asked for sound once: keep it on

  soundLabel.textContent = canHover ? "Click for sound" : "Tap for sound";
  if (hint) hint.textContent = canHover ? "Hover to play" : "Tap for sound";

  function sync() {
    const playing = !video.paused;
    frame.dataset.playing = playing;
    soundBtn.hidden = !playing || !video.muted;
    playBtn.setAttribute("aria-label", playing ? "Pause clip" : "Play clip with sound");
  }
  ["play", "pause", "volumechange"].forEach((e) => video.addEventListener(e, sync));

  // Browsers often refuse sound that isn't triggered by a click/tap
  // (a hover doesn't count), so fall back to muted playback.
  async function playWithSound() {
    video.muted = false;
    try {
      await video.play();
    } catch (err) {
      if (err.name !== "NotAllowedError") return;
      video.muted = true;
      try { await video.play(); } catch { /* give up quietly */ }
    }
  }

  async function playMuted() {
    video.muted = true;
    try { await video.play(); } catch { /* ignore */ }
  }

  // One handler for the whole frame; the buttons inside bubble up here.
  frame.addEventListener("click", () => {
    if (frame.dataset.error === "true") return;
    if (video.paused) {
      userPaused = false;
      wantsSound = true;
      video.muted = false;
      video.play().catch(() => {});
    } else if (video.muted) {
      wantsSound = true;
      video.muted = false;
    } else {
      userPaused = true;
      video.pause();
    }
  });

  if (canHover) {
    frame.addEventListener("mouseenter", playWithSound);
    frame.addEventListener("mouseleave", () => video.pause());
  } else if (!reduceMotion && "IntersectionObserver" in window) {
    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!userPaused) wantsSound ? playWithSound() : playMuted();
        } else {
          video.pause();
        }
      },
      { threshold: 0.6 }
    ).observe(frame);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause();
  });

  // Missing or broken video file: keep the poster, show a quiet note.
  function showFallback() {
    frame.dataset.error = "true";
    fallback.hidden = false;
    if (hint) hint.textContent = "";
  }
  video.addEventListener("error", showFallback);
  if (!video.getAttribute("src")) showFallback();

  sync();
})();
