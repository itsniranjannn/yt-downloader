const SERVER = "http://localhost:9999";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return "";
  const mb = b / 1048576;
  return mb < 1 ? `${(b/1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
}
function fmtDur(s) {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2,"0")}`;
}

// ── Settings persistence ──────────────────────────────────────────────────
const SETTINGS_KEY = "yth_settings";

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      resolve(result[SETTINGS_KEY] || {});
    });
  });
}

function saveSettings(settings) {
  chrome.storage.local.get(SETTINGS_KEY, (result) => {
    const current = result[SETTINGS_KEY] || {};
    const merged = { ...current, ...settings };
    chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel injection
// ─────────────────────────────────────────────────────────────────────────────
function injectPanel() {
  const onVideo    = window.location.href.includes("/watch");
  const onPlaylist = window.location.href.includes("list=");

  if (!onVideo && !onPlaylist) {
    document.getElementById("yth-toggle-btn")?.remove();
    document.getElementById("yt-helper-panel")?.remove();
    return;
  }

  injectStyles();

  // ── Toggle button ──────────────────────────────────────────────────────
  let toggleBtn = document.getElementById("yth-toggle-btn");
  if (!toggleBtn) {
    const actions = document.querySelector("#actions-inner");
    if (!actions) { setTimeout(injectPanel, 1500); return; }

    toggleBtn = document.createElement("button");
    toggleBtn.id        = "yth-toggle-btn";
    toggleBtn.className = "yth-trigger";
    toggleBtn.setAttribute("aria-label", "Download with NJK - YT-Downloader");
    toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Download</span>`;

    toggleBtn.onclick = () => {
      const p = document.getElementById("yt-helper-panel");
      if (!p) return;
      p.classList.toggle("yth-open");
    };
    actions.appendChild(toggleBtn);
  }

  // ── Panel ──────────────────────────────────────────────────────────────
  if (document.getElementById("yt-helper-panel")) return;

  const panel = document.createElement("div");
  panel.id        = "yt-helper-panel";
  panel.className = "yth-panel";
  panel.innerHTML = `
    <div class="yth-head">
      <div class="yth-brand">
        <span class="yth-dot" id="yth-dot"></span>
        <span>NJK - YT-Downloader</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <button id="yth-tab-dl"   class="yth-tab yth-tab-active">Download</button>
        <button id="yth-tab-hist" class="yth-tab">History</button>
        <button id="yth-close" class="yth-iconbtn" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- ── DOWNLOAD TAB ── -->
    <div id="yth-tab-dl-content">
      <div class="yth-media">
        <div id="yth-thumb" class="yth-thumb"></div>
        <div id="yth-title" class="yth-title">Loading…</div>
      </div>

      <!-- Playlist banner (hidden for single videos) -->
      <div id="yth-playlist-bar" style="display:none" class="yth-playlist-bar">
        <span id="yth-playlist-count"></span>
        <span id="yth-playlist-progress" style="margin-left:auto;font-weight:600"></span>
        <button id="yth-playlist-close" class="yth-iconbtn" style="margin-left:6px" aria-label="Hide playlist banner">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Queue -->
      <div id="yth-queue-wrap" style="display:none" class="yth-field">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <label class="yth-label" style="margin-bottom:0">Queue <span id="yth-queue-count" style="color:#2DD4BF"></span></label>
          <button id="yth-queue-toggle" class="yth-queue-collapse-btn">Hide</button>
        </div>
        <div id="yth-queue-body">
          <div id="yth-queue-list" class="yth-queue-list"></div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <input id="yth-queue-input" class="yth-input" placeholder="Paste any YouTube video URL to add it…" style="flex:1;font-size:11px"/>
            <button id="yth-queue-add" class="yth-queue-btn">+ Add</button>
          </div>
        </div>
      </div>

      <div class="yth-seg" id="yth-mode-seg">
        <button class="yth-seg-btn yth-seg-active" data-mode="video">Video</button>
        <button class="yth-seg-btn" data-mode="audio">Audio</button>
      </div>

      <div id="yth-fmt-row" class="yth-field">
        <label class="yth-label">Quality</label>
        <select id="yth-fmt" class="yth-select">
          <option value="bestvideo+bestaudio/best">Best available</option>
        </select>
      </div>

      <div id="yth-audiofmt-row" class="yth-field" style="display:none">
        <label class="yth-label">Audio Format</label>
        <select id="yth-audiofmt" class="yth-select"></select>
        <div id="yth-audiofmt-hint" class="yth-hint"></div>
      </div>

      <div class="yth-field">
        <label class="yth-label">Save to</label>
        <input id="yth-dir" class="yth-input" type="text" placeholder="C:\\Users\\ASUS\\Downloads"/>
      </div>

      <div class="yth-field" style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="yth-use-cookies" style="accent-color:#2DD4BF;">
        <label for="yth-use-cookies" style="font-size:11px;color:#71717A;">Use browser cookies (for age‑restricted videos)</label>
      </div>

      <div id="yth-btn-row" style="display:flex;gap:8px;margin-top:4px;">
        <button id="yth-dl" class="yth-dl-btn" style="flex:1;margin-top:0;">
          <span class="yth-dl-label">Download</span>
        </button>
        <button id="yth-cancel-btn" class="yth-cancel-btn" style="display:none;">✕ Cancel</button>
      </div>

      <div class="yth-progress-wrap" id="yth-progress-wrap">
        <div class="yth-progress-bar"><div class="yth-progress-fill" id="yth-progress-fill"></div></div>
        <div class="yth-progress-pct" id="yth-progress-pct">0%</div>
      </div>

      <div id="yth-log" class="yth-log"></div>
    </div>

    <!-- ── HISTORY TAB ── -->
    <div id="yth-tab-hist-content" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;color:#71717A">Recent downloads</span>
        <button id="yth-hist-clear" class="yth-queue-btn" style="font-size:10px;padding:3px 8px">Clear</button>
      </div>
      <div id="yth-hist-list" class="yth-hist-list">
        <div style="color:#71717A;font-size:11px;text-align:center;padding:20px 0">No downloads yet.</div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  makeDraggable(panel, panel.querySelector(".yth-head"));

  // ── Element refs ───────────────────────────────────────────────────────
  const dot         = document.getElementById("yth-dot");
  const titleEl     = document.getElementById("yth-title");
  const thumbEl     = document.getElementById("yth-thumb");
  const fmtSel      = document.getElementById("yth-fmt");
  const fmtRow      = document.getElementById("yth-fmt-row");
  const audioFmtSel = document.getElementById("yth-audiofmt");
  const audioFmtRow = document.getElementById("yth-audiofmt-row");
  const log         = document.getElementById("yth-log");
  const modeSeg     = document.getElementById("yth-mode-seg");
  const dlBtn       = document.getElementById("yth-dl");
  const dlLabel     = dlBtn.querySelector(".yth-dl-label");
  const cancelBtn   = document.getElementById("yth-cancel-btn");
  const plBar       = document.getElementById("yth-playlist-bar");
  const plCount     = document.getElementById("yth-playlist-count");
  const plProgress  = document.getElementById("yth-playlist-progress");
  const plClose     = document.getElementById("yth-playlist-close");
  const queueWrap   = document.getElementById("yth-queue-wrap");
  const queueBody   = document.getElementById("yth-queue-body");
  const queueToggle = document.getElementById("yth-queue-toggle");
  const queueList   = document.getElementById("yth-queue-list");
  const queueInput  = document.getElementById("yth-queue-input");
  const queueCount  = document.getElementById("yth-queue-count");
  const useCookiesCheck = document.getElementById("yth-use-cookies");
  const dirInput    = document.getElementById("yth-dir");

  let currentMode   = "video";
  let isPlaylist    = false;
  let playlistItems = [];
  let queue         = [];
  let activeAbortController = null;
  let isDownloading = false;
  let lastDownloadDir = null;

  window._ythFormats = { video: [], audio: [] };

  // ── Load saved settings ──────────────────────────────────────────────────
  loadSettings().then(settings => {
    if (settings.mode) {
      currentMode = settings.mode;
      modeSeg.querySelectorAll(".yth-seg-btn").forEach(btn => {
        btn.classList.toggle("yth-seg-active", btn.dataset.mode === settings.mode);
      });
    }
    if (settings.saveDir) {
      dirInput.value = settings.saveDir;
    }
    if (settings.useCookies !== undefined) {
      useCookiesCheck.checked = settings.useCookies;
    }
    // quality and audioFormat will be applied after formats are loaded
    window._pendingSettings = settings;
  });

  // ── Playlist banner: hide/show ─────────────────────────────────────────
  plClose.onclick = () => { plBar.style.display = "none"; };

  // ── Queue: collapse/expand ──────────────────────────────────────────────
  queueToggle.onclick = () => {
    const hidden = queueBody.style.display === "none";
    queueBody.style.display = hidden ? "block" : "none";
    queueToggle.textContent = hidden ? "Hide" : "Show";
  };

  // ── Tabs ───────────────────────────────────────────────────────────────
  document.getElementById("yth-close").onclick = () => panel.classList.remove("yth-open");

  function switchTab(tab) {
    const isDl = tab === "dl";
    document.getElementById("yth-tab-dl-content").style.display   = isDl ? "" : "none";
    document.getElementById("yth-tab-hist-content").style.display = isDl ? "none" : "";
    document.getElementById("yth-tab-dl").classList.toggle("yth-tab-active", isDl);
    document.getElementById("yth-tab-hist").classList.toggle("yth-tab-active", !isDl);
    if (!isDl) renderHistory();
  }
  document.getElementById("yth-tab-dl").onclick   = () => switchTab("dl");
  document.getElementById("yth-tab-hist").onclick  = () => switchTab("hist");
  document.getElementById("yth-hist-clear").onclick = () => {
    fetch(`${SERVER}/history`, { method: "DELETE" }).then(() => renderHistory());
  };

  // ── History rendering ──────────────────────────────────────────────────
  function renderHistory() {
    const list = document.getElementById("yth-hist-list");
    fetch(`${SERVER}/history`)
      .then(r => r.json())
      .then(items => {
        if (!items.length) {
          list.innerHTML = `<div style="color:#71717A;font-size:11px;text-align:center;padding:20px 0">No downloads yet.</div>`;
          return;
        }
        list.innerHTML = items.map(it => `
          <div class="yth-hist-item">
            <div class="yth-hist-icon">${it.mode === "audio" ? "🎵" : "🎬"}</div>
            <div style="flex:1;min-width:0">
              <div class="yth-hist-title">${it.title}</div>
              <div class="yth-hist-meta">${it.date} · ${fmtBytes(it.size_bytes)}</div>
            </div>
          </div>`).join("");
      })
      .catch(() => {
        list.innerHTML = `<div style="color:#EF4444;font-size:11px;text-align:center;padding:10px">Can't reach server.</div>`;
      });
  }

  // ── Format lists ───────────────────────────────────────────────────────
  function updateFormatList() {
    fmtSel.innerHTML = "";
    if (currentMode === "video") {
      fmtSel.appendChild(Object.assign(document.createElement("option"),
        { value: "bestvideo+bestaudio/best", textContent: "Best available" }));
      (window._ythFormats.video || []).forEach(f =>
        fmtSel.appendChild(Object.assign(document.createElement("option"),
          { value: f.id, textContent: f.label })));
      fmtRow.style.display      = "block";
      audioFmtRow.style.display = "none";
      // Apply saved quality if any
      if (window._pendingSettings && window._pendingSettings.quality) {
        const saved = window._pendingSettings.quality;
        if ([...fmtSel.options].some(opt => opt.value === saved)) {
          fmtSel.value = saved;
        }
        delete window._pendingSettings.quality; // apply once
      }
      fmtSel.onchange = () => {
        saveSettings({ quality: fmtSel.value });
      };
    } else {
      fmtRow.style.display      = "none";
      audioFmtRow.style.display = "block";
      updateAudioFormatOptions();
    }
  }

  function updateAudioFormatOptions() {
    const est = window._ythAudioSizeEstimates || {};
    audioFmtSel.innerHTML = "";

    const opts = [
      {
        value: "mp3_192",
        short: "MP3 (192kbps)",
        hint: "Smaller file size" + (est.mp3_192 ? ` — ~${est.mp3_192}` : "")
      },
      {
        value: "mp3_320",
        short: "MP3 (320kbps)",
        hint: "Best quality" + (est.mp3_320 ? ` — ~${est.mp3_320}` : "")
      },
      {
        value: "original",
        short: "Original (Opus)",
        hint: "Best quality, may not play on all devices" +
              (est.original ? ` — ~${est.original}` : "")
      }
    ];

    opts.forEach(o =>
      audioFmtSel.appendChild(
        Object.assign(document.createElement("option"), {
          value: o.value,
          textContent: o.short
        })
      )
    );

    audioFmtSel._hints = Object.fromEntries(
      opts.map(o => [o.value, o.hint])
    );

    // Apply saved audio format if any
    if (window._pendingSettings && window._pendingSettings.audioFormat) {
      const saved = window._pendingSettings.audioFormat;
      if ([...audioFmtSel.options].some(opt => opt.value === saved)) {
        audioFmtSel.value = saved;
      }
      delete window._pendingSettings.audioFormat;
    }
    updateAudioFormatHint();
    audioFmtSel.onchange = () => {
      updateAudioFormatHint();
      saveSettings({ audioFormat: audioFmtSel.value });
    };
  }

  function updateAudioFormatHint() {
    document.getElementById("yth-audiofmt-hint").textContent =
      (audioFmtSel._hints || {})[audioFmtSel.value] || "";
  }

  // Mode segment buttons
  modeSeg.querySelectorAll(".yth-seg-btn").forEach(btn => {
    btn.onclick = () => {
      modeSeg.querySelectorAll(".yth-seg-btn").forEach(b => b.classList.remove("yth-seg-active"));
      btn.classList.add("yth-seg-active");
      currentMode = btn.dataset.mode;
      saveSettings({ mode: currentMode });
      updateFormatList();
    };
  });

  // Directory input: save on change
  dirInput.addEventListener("change", () => {
    saveSettings({ saveDir: dirInput.value.trim() });
  });

  // Cookies checkbox
  useCookiesCheck.addEventListener("change", () => {
    saveSettings({ useCookies: useCookiesCheck.checked });
  });

  // ── Log / progress helpers ─────────────────────────────────────────────
  function setLog(text, kind) {
    log.innerHTML = text; // allow HTML for button later
    log.className   = "yth-log" + (kind ? " yth-log-" + kind : "");
  }

  function setProgress(pct) {
    const wrap  = document.getElementById("yth-progress-wrap");
    const fill  = document.getElementById("yth-progress-fill");
    const pctEl = document.getElementById("yth-progress-pct");
    if (pct === null) { wrap.style.display = "none"; return; }
    wrap.style.display  = "flex";
    fill.style.width    = Math.max(0, Math.min(100, pct)) + "%";
    pctEl.textContent   = Math.round(pct) + "%";
  }

  function resetDownloadUI(logText, logKind) {
    cancelBtn.style.display = "none";
    cancelBtn.disabled      = false;
    cancelBtn.textContent   = "✕ Cancel";
    dlBtn.disabled          = false;
    dlBtn.classList.remove("yth-dl-busy");
    dlLabel.textContent     = "Download";
    setProgress(null);
    if (logText) setLog(logText, logKind);
  }

  // ── Open folder button ──────────────────────────────────────────────────
  function showOpenFolderButton(folder) {
    const btn = document.createElement("button");
    btn.textContent = "📁 Open folder";
    btn.className = "yth-queue-btn";
    btn.style.marginTop = "6px";
    btn.onclick = () => {
      fetch(`${SERVER}/open_folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
        targetAddressSpace: "localhost"
      });
    };
    log.appendChild(document.createElement("br"));
    log.appendChild(btn);
  }

  // ── Load URL (video or playlist) ───────────────────────────────────────
  function loadUrl(url) {
    dot.className = "yth-dot yth-dot-loading";
    titleEl.textContent = "Loading…";
    thumbEl.innerHTML   = "";
    plBar.style.display = "none";
    isPlaylist    = false;
    playlistItems = [];
    queue = [];
    renderQueue();

    fetchSingleFormats(url);

    if (url.includes("list=")) {
      plBar.style.display = "flex";
      plCount.textContent = "This video is part of a playlist";
      plProgress.innerHTML = "";
      const viewBtn = document.createElement("button");
      viewBtn.className = "yth-queue-btn";
      viewBtn.style.marginLeft = "auto";
      viewBtn.textContent = "View playlist";
      viewBtn.onclick = () => loadPlaylist(url);
      plProgress.appendChild(viewBtn);
    }
  }

  function loadPlaylist(url) {
    plProgress.innerHTML = "Loading playlist…";
    fetch(`${SERVER}/playlist_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.error || !data.count) {
        plProgress.textContent = "Couldn't load playlist.";
        return;
      }
      isPlaylist    = true;
      playlistItems = data.entries;
      plCount.textContent = `${data.count} videos in playlist`;
      plProgress.textContent = "";
      queue = playlistItems.map(e => ({
        url: e.url, title: e.title, thumbnail: e.thumbnail || null,
      }));
      renderQueue();
      queueWrap.style.display = "block";
      queueBody.style.display = "block";
      queueToggle.textContent = "Hide";
      setLog(`Playlist loaded (${data.count} videos). Remove any you don't want, then hit Download.`, "muted");
    })
    .catch(() => { plProgress.textContent = "Couldn't reach server."; });
  }

  function fetchSingleFormats(url) {
    fetch(`${SERVER}/formats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        dot.className = "yth-dot yth-dot-error";
        setLog("Couldn't read this video.\n" + data.error, "error");
        return;
      }
      dot.className = "yth-dot yth-dot-ready";
      if (data.title) titleEl.textContent = data.title;
      if (data.thumbnail) thumbEl.innerHTML = `<img src="${data.thumbnail}" alt="">`;
      window._ythFormats = { video: data.video || [], audio: data.audio || [] };
      window._ythAudioSizeEstimates = data.audio_size_estimates || {};
      updateFormatList();
      setLog("Ready. Choose quality and download.", "muted");
      queueWrap.style.display = "block";
      if (!isPlaylist) {
        queue = [{ url, title: data.title || url, thumbnail: data.thumbnail || null }];
        renderQueue();
      }
    })
    .catch(() => {
      dot.className = "yth-dot yth-dot-error";
      setLog("Can't reach the local server.\nMake sure NJK - YT-Downloader is running.", "error");
    });
  }

  window.fetchFormats = loadUrl;

  // ── Queue UI with drag‑and‑drop ──────────────────────────────────────
  let dragSrcIndex = null;

  function handleDragStart(e) {
    dragSrcIndex = Number(this.dataset.i);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", this.dataset.i);
    this.style.opacity = "0.5";
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e) {
    e.preventDefault();
    const fromIndex = dragSrcIndex;
    const toIndex = Number(this.dataset.i);
    if (fromIndex !== toIndex && fromIndex !== null) {
      const [moved] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, moved);
      renderQueue();
    }
    dragSrcIndex = null;
  }

  function handleDragEnd(e) {
    this.style.opacity = "1";
  }

  function renderQueue() {
    queueCount.textContent = queue.length ? `(${queue.length})` : "";
    if (!queue.length) {
      queueList.innerHTML = `<div style="color:#52525B;font-size:11px;padding:4px 0">Queue is empty.</div>`;
      return;
    }
    let html = queue.map((item, i) => `
      <div class="yth-queue-item" data-i="${i}" draggable="true">
        <span class="yth-queue-num">${i + 1}</span>
        ${item.thumbnail
          ? `<img class="yth-queue-thumb" src="${item.thumbnail}" alt="">`
          : `<span class="yth-queue-thumb yth-queue-thumb-empty"></span>`}
        <span class="yth-queue-title">${item.title || item.url}</span>
        <button class="yth-queue-remove" data-i="${i}">✕</button>
      </div>`).join("");

    queueList.innerHTML = html;

    queueList.querySelectorAll(".yth-queue-item").forEach(el => {
      el.addEventListener("dragstart", handleDragStart);
      el.addEventListener("dragover", handleDragOver);
      el.addEventListener("drop", handleDrop);
      el.addEventListener("dragend", handleDragEnd);
    });

    queueList.querySelectorAll(".yth-queue-remove").forEach(btn => {
      btn.onclick = () => {
        queue.splice(Number(btn.dataset.i), 1);
        renderQueue();
      };
    });
  }

  document.getElementById("yth-queue-add").onclick = () => {
    const raw = queueInput.value.trim();
    if (!raw) return;
    const item = { url: raw, title: raw };
    queue.push(item);
    queueInput.value = "";
    renderQueue();

    fetch(`${SERVER}/formats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: raw }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.title) item.title = data.title;
        if (data.thumbnail) item.thumbnail = data.thumbnail;
        renderQueue();
      })
      .catch(() => { /* keep raw URL */ });
  };
  queueInput.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("yth-queue-add").click();
  });

  // ── Cancel handler ─────────────────────────────────────────────────────
  cancelBtn.onclick = () => {
    cancelBtn.disabled    = true;
    cancelBtn.textContent = "⏳";
    setLog("Cancelling…", "muted");
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    fetch(`${SERVER}/cancel`, { method: "POST" })
      .then(r => r.json())
      .then(d => {
        const msg = d.status === "cancelled"          ? "✕ Cancelled."
                  : d.status === "no_active_download" ? "Nothing to cancel."
                  : d.status === "already_finished"   ? "Download already finished."
                  : "Server: " + d.status;
        resetDownloadUI(msg, "muted");
        plProgress.textContent = "";
      })
      .catch(() => resetDownloadUI("✕ Cancelled (server unreachable).", "error"));
  };

  // ── Download one URL ────────────────────────────────────────────────────
  function downloadOne(url, videoTitle) {
    return new Promise((resolve) => {
      const fmt         = fmtSel.value;
      const audioFormat = audioFmtSel.value;
      const dir         = dirInput.value.trim() || "C:\\Users\\ASUS\\Downloads";
      lastDownloadDir   = dir;  // store for open folder button

      activeAbortController = new AbortController();
      const signal = activeAbortController.signal;

      let lastErrorMsg = null;

      fetch(`${SERVER}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url, title: videoTitle,
          format: fmt, mode: currentMode,
          audio_format: audioFormat, dir,
          use_cookies: useCookiesCheck.checked,
        }),
        signal,
      }).then(async res => {
        if (!res.ok) throw new Error("Server error: " + await res.text());
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let buf = "", lastLines = [];

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop();

          for (const l of lines) {
            if (!l.startsWith("data: ")) continue;
            const msg = l.slice(6);

            if (msg.startsWith("__ERRORMSG__")) {
              lastErrorMsg = msg.slice(12);
            } else if (msg.startsWith("__DONE__")) {
              const code = msg.match(/__DONE__(-?\d+)__/)?.[1];
              resolve(code === "0" ? "ok" : (lastErrorMsg || "error"));
              return;
            } else if (msg === "__TIMEOUT__") {
              resolve("timeout");
              return;
            } else {
              const m = msg.match(/(\d{1,3}\.\d)%/);
              if (m) setProgress(parseFloat(m[1]));
              lastLines.push(msg);
              if (lastLines.length > 4) lastLines.shift();
              setLog(lastLines.join("\n"), "muted");
            }
          }
        }
        resolve("done");
      }).catch(e => {
        if (e.name === "AbortError") { resolve("cancelled"); return; }
        resolve("error: " + e.message);
      });
    });
  }

  // ── Main download button ────────────────────────────────────────────────
  dlBtn.onclick = async () => {
    if (!queue.length) {
      setLog("Queue is empty — nothing to download.", "error");
      return;
    }

    // Clear any old open-folder button from log
    log.innerHTML = "";

    dlBtn.disabled = true;
    dlBtn.classList.add("yth-dl-busy");
    cancelBtn.style.display = "flex";
    isDownloading = true;

    const total = queue.length;
    let done = 0, errors = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      dlLabel.textContent = total > 1 ? `${i + 1}/${total}…` : "Downloading…";
      if (total > 1) plProgress.textContent = `${i + 1} / ${total}`;
      setProgress(0);

      const result = await downloadOne(item.url, item.title);

      if (result === "cancelled") {
        setLog(`✕ Cancelled (${done} of ${total} done).`, "muted");
        break;
      } else if (result === "ok") {
        done++;
        // Mark done in queue
        const itemEl = queueList.querySelector(`[data-i="${i}"]`);
        if (itemEl) itemEl.classList.add("yth-queue-done");
      } else {
        errors++;
        setLog(`⚠ Error on "${item.title}": ${result}`, "error");
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (done === total) {
      setProgress(100);
      plProgress.textContent = total > 1 ? `✅ All ${total} done!` : "";
      setLog(total > 1 ? `✅ All ${total} files saved!` : "✅ Done! File saved.", "success");
      if (lastDownloadDir) {
        showOpenFolderButton(lastDownloadDir);
      }
    } else if (done > 0) {
      setLog(`✅ ${done} done, ${errors} failed.`, "success");
      if (lastDownloadDir) {
        showOpenFolderButton(lastDownloadDir);
      }
    }

    isDownloading = false;
    resetDownloadUI(null, null);
    if (done > 0) {
      fetch(`${SERVER}/history`);
    }
  };

  // ── Auto-refresh on navigation ──────────────────────────────────────────
  window._ythOnNavigate = (newUrl) => {
    if (isDownloading) return;
    if (panel._lastUrl === newUrl) return;
    panel._lastUrl = newUrl;
    resetPanelState();
    loadUrl(newUrl);
  };

  panel._lastUrl = window.location.href;
  loadUrl(panel._lastUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag
// ─────────────────────────────────────────────────────────────────────────────
function makeDraggable(panel, handle) {
  handle.style.cursor = "move";
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  handle.addEventListener("mousedown", e => {
    if (e.target.closest(".yth-iconbtn, .yth-tab")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    panel.style.left  = rect.left + "px";
    panel.style.top   = rect.top  + "px";
    panel.style.right = "auto";
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    e.preventDefault();
  });
  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    panel.style.left = Math.max(4, Math.min(window.innerWidth  - panel.offsetWidth  - 4, startLeft + e.clientX - startX)) + "px";
    panel.style.top  = Math.max(4, Math.min(window.innerHeight - 40,                    startTop  + e.clientY - startY)) + "px";
  });
  document.addEventListener("mouseup", () => { dragging = false; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────
function resetPanelState() {
  const log  = document.getElementById("yth-log");
  const wrap = document.getElementById("yth-progress-wrap");
  const cb   = document.getElementById("yth-cancel-btn");
  const pl   = document.getElementById("yth-playlist-bar");
  if (log)  { log.innerHTML = "Loading…"; log.className = "yth-log yth-log-muted"; }
  if (wrap) wrap.style.display = "none";
  if (cb)   cb.style.display  = "none";
  if (pl)   pl.style.display  = "none";
  const thumb = document.getElementById("yth-thumb");
  if (thumb) thumb.innerHTML = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById("yth-styles")) return;
  const style = document.createElement("style");
  style.id = "yth-styles";
  style.textContent = `
    .yth-trigger {
      display:inline-flex;align-items:center;gap:6px;
      background:rgba(255,255,255,.08);color:#F1F1F1;
      border:none;border-radius:18px;padding:8px 16px;margin:8px 0 0 0;
      font-family:"Roboto",system-ui,sans-serif;font-size:14px;font-weight:500;
      cursor:pointer;transition:background .15s ease,transform .1s ease;
    }
    .yth-trigger:hover{background:rgba(255,255,255,.16);}
    .yth-trigger:active{transform:scale(.97);}
    .yth-trigger svg{flex-shrink:0;color:#2DD4BF;}

    .yth-panel {
      position:fixed;top:70px;right:20px;z-index:99999;width:330px;
      background:#0F0F10;color:#F5F5F0;border:1px solid #232326;
      border-radius:14px;padding:16px;
      box-shadow:0 12px 40px rgba(0,0,0,.55);
      font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;
      opacity:0;transform:translateY(-6px) scale(.98);pointer-events:none;
      transition:opacity .16s ease,transform .16s ease;
    }
    .yth-panel.yth-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}

    .yth-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
    .yth-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;letter-spacing:.01em;white-space:nowrap;}
    .yth-dot{width:7px;height:7px;border-radius:50%;background:#71717A;display:inline-block;}
    .yth-dot-loading{background:#71717A;animation:yth-pulse 1s ease-in-out infinite;}
    .yth-dot-ready{background:#2DD4BF;}
    .yth-dot-error{background:#EF4444;}
    @keyframes yth-pulse{0%,100%{opacity:.4}50%{opacity:1}}

    .yth-tab {
      background:none;border:none;color:#71717A;font-size:11px;font-weight:500;
      padding:3px 8px;border-radius:6px;cursor:pointer;transition:all .12s ease;
    }
    .yth-tab:hover{color:#F5F5F0;background:#1A1A1D;}
    .yth-tab-active{background:#2DD4BF !important;color:#0F0F10 !important;}

    .yth-iconbtn{background:none;border:none;color:#71717A;cursor:pointer;width:22px;height:22px;
      display:flex;align-items:center;justify-content:center;border-radius:6px;transition:background .12s ease,color .12s ease;}
    .yth-iconbtn:hover{background:#1A1A1D;color:#F5F5F0;}

    .yth-media{display:flex;gap:10px;margin-bottom:14px;align-items:center;}
    .yth-thumb{width:64px;height:36px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#1A1A1D;}
    .yth-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .yth-title{font-size:12px;color:#A1A1AA;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}

    .yth-playlist-bar{
      display:flex;align-items:center;gap:6px;
      background:#1A1A1D;border-radius:7px;padding:6px 10px;
      font-size:11px;color:#A1A1AA;margin-bottom:10px;
    }

    .yth-queue-collapse-btn{
      background:none;border:none;color:#71717A;font-size:11px;cursor:pointer;
      padding:2px 6px;border-radius:5px;transition:background .12s ease,color .12s ease;
    }
    .yth-queue-collapse-btn:hover{background:#1A1A1D;color:#F5F5F0;}

    .yth-seg{display:flex;background:#1A1A1D;border-radius:8px;padding:3px;margin-bottom:12px;}
    .yth-seg-btn{flex:1;background:none;border:none;color:#A1A1AA;font-size:12px;font-weight:500;
      padding:6px 0;border-radius:6px;cursor:pointer;transition:background .14s ease,color .14s ease;}
    .yth-seg-active{background:#2DD4BF;color:#0F0F10;}

    .yth-field{margin-bottom:10px;}
    .yth-label{display:block;font-size:11px;color:#71717A;margin-bottom:5px;}
    .yth-select,.yth-input{width:100%;box-sizing:border-box;background:#1A1A1D;color:#F5F5F0;
      border:1px solid #2A2A2E;border-radius:7px;padding:7px 9px;font-size:12.5px;font-family:inherit;}
    .yth-select:focus,.yth-input:focus{outline:none;border-color:#2DD4BF;}
    .yth-input::placeholder{color:#52525B;}
    .yth-hint{font-size:11px;color:#71717A;margin-top:5px;}

    .yth-dl-btn{width:100%;background:#2DD4BF;color:#0F0F10;border:none;border-radius:8px;
      padding:10px;font-size:13px;font-weight:600;cursor:pointer;margin-top:4px;
      transition:background .14s ease,opacity .14s ease;}
    .yth-dl-btn:hover:not(:disabled){background:#5EEAD4;}
    .yth-dl-btn:disabled{cursor:default;}
    .yth-dl-busy{background:#1F8F80;color:#D1FAF5;}

    .yth-cancel-btn{background:#ef4444;color:#fff;border:none;border-radius:8px;padding:10px 14px;
      font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;
      transition:background .14s ease;align-items:center;justify-content:center;}
    .yth-cancel-btn:hover:not(:disabled){background:#dc2626;}
    .yth-cancel-btn:disabled{opacity:.5;cursor:default;}

    .yth-progress-wrap{display:none;align-items:center;gap:8px;margin-top:10px;}
    .yth-progress-bar{flex:1;height:4px;background:#1A1A1D;border-radius:2px;overflow:hidden;}
    .yth-progress-fill{height:100%;width:0%;background:#2DD4BF;transition:width .2s ease;}
    .yth-progress-pct{font-family:ui-monospace,monospace;font-size:11px;color:#71717A;min-width:32px;text-align:right;}

    .yth-log{margin-top:8px;font-family:ui-monospace,"SF Mono",monospace;font-size:11px;
      color:#71717A;white-space:pre-wrap;max-height:80px;overflow-y:auto;}
    .yth-log-muted{color:#71717A;}
    .yth-log-success{color:#2DD4BF;}
    .yth-log-error{color:#EF4444;}

    /* Queue */
    .yth-queue-list{max-height:140px;overflow-y:auto;margin-bottom:4px;}
    .yth-queue-thumb{width:36px;height:20px;border-radius:4px;object-fit:cover;flex-shrink:0;background:#1A1A1D;}
    .yth-queue-thumb-empty{display:inline-block;}
    .yth-queue-item{display:flex;align-items:center;gap:6px;padding:4px 0;
      border-bottom:1px solid #1A1A1D;font-size:11px;cursor:grab;}
    .yth-queue-item:last-child{border-bottom:none;}
    .yth-queue-num{color:#52525B;min-width:16px;text-align:right;font-variant-numeric:tabular-nums;}
    .yth-queue-title{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#A1A1AA;}
    .yth-queue-done .yth-queue-title{color:#2DD4BF;}
    .yth-queue-remove{background:none;border:none;color:#52525B;cursor:pointer;font-size:10px;
      padding:0 2px;line-height:1;flex-shrink:0;}
    .yth-queue-remove:hover{color:#EF4444;}
    .yth-queue-btn{background:#1A1A1D;color:#A1A1AA;border:1px solid #2A2A2E;
      border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;white-space:nowrap;}
    .yth-queue-btn:hover{background:#232326;color:#F5F5F0;}

    /* History */
    .yth-hist-list{max-height:220px;overflow-y:auto;}
    .yth-hist-item{display:flex;align-items:flex-start;gap:8px;padding:7px 0;
      border-bottom:1px solid #1A1A1D;}
    .yth-hist-item:last-child{border-bottom:none;}
    .yth-hist-icon{font-size:16px;flex-shrink:0;margin-top:1px;}
    .yth-hist-title{font-size:12px;color:#F5F5F0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;}
    .yth-hist-meta{font-size:10px;color:#52525B;margin-top:2px;}
  `;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────────────────────
// SPA navigation watcher
// ─────────────────────────────────────────────────────────────────────────────
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(injectPanel, 1500);
    setTimeout(() => {
      if (typeof window._ythOnNavigate === "function") {
        window._ythOnNavigate(location.href);
      }
    }, 1500);
  }
}).observe(document, { subtree: true, childList: true });

setTimeout(injectPanel, 3000);