<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0f0f,50:cc0000,100:0f0f0f&height=210&section=header&text=NJK%20YT%20Downloader&fontSize=48&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=A%20native%20Download%20button%20for%20YouTube%20%E2%80%94%20yours%2C%20not%20the%20cloud%27s&descAlignY=58&descSize=16" width="100%"/>

<a href="https://readme-typing-svg.demolab.com">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=20&pause=1000&color=FF0000&center=true&vCenter=true&width=650&lines=No+third-party+servers.+No+cloud.;Just+your+browser+%2B+your+machine.;One+button.+One+localhost.+Done." alt="Typing SVG" />
</a>

<br/><br/>

<p>
  <img src="https://img.shields.io/badge/Manifest-V3-FF0000?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Server-Local_Only-0f0f0f?style=for-the-badge&logo=serverfault&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
</p>

<p>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/Chrome_Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Fetch_API-cc0000?style=flat-square" />
</p>

<p align="center">
  <a href="#-how-it-works"><b>How It Works</b></a> &nbsp;•&nbsp;
  <a href="#-installation"><b>Install</b></a> &nbsp;•&nbsp;
  <a href="#-privacy--security"><b>Privacy</b></a> &nbsp;•&nbsp;
  <a href="#-roadmap"><b>Roadmap</b></a>
</p>

</div>

<br/>

> A lightweight Chromium extension that drops a native **Download** button right beside YouTube's Like and Share buttons — no third-party sites, no cloud services, no accounts. It just hands the video URL to a local server running on *your* machine, and your own app does the rest.

<br/>

![Preview](./image.png)

<br/>

## 🔴 Why "Local Only" Matters

<div align="center">

<table>
<tr>
<td align="center" width="33%">

### 🚫
**No Cloud**
Nothing ever leaves your machine except the request to YouTube itself

</td>
<td align="center" width="33%">

### 🪶
**Featherweight**
No background scripts, minimal permissions, near-zero memory footprint

</td>
<td align="center" width="33%">

### 🔓
**Full Control**
Your downloader, your rules — the extension just points the way

</td>
</tr>
</table>

</div>

<br/>

## ⚙️ How It Works

<div align="center">

```
   ▶️  YouTube Page
        │
        ▼
   🔴  [ Download ]  ← injected next to Like / Share
        │
        ▼
   🧩  Chrome Extension  (content.js)
        │
        ▼
   📡  http://localhost:9999
        │
        ▼
   💻  Your Local Downloader
        │
        ▼
   ⬇️   Download Begins
```

</div>

The extension's entire job is capturing the current video's URL and forwarding it to your locally running server — **that's it**. All actual downloading is handled by your own application on the other end.

<br/>

## 🖼️ Screenshots

<table>
  <tr>
    <td width="50%"><img src="./image.png" /><p align="center"><sub>Download button on YouTube</sub></p></td>
    <td width="50%"><img src="./image-1.png" /><p align="center"><sub>Extension in action</sub></p></td>
  </tr>
</table>

<br/>

## 🧾 Requirements

<div align="center">

> ⚠️ **Your local download server must be running before the button will work.**
>
> By default, the extension talks to:
> ```
> http://localhost:9999
> ```
> No server running → the Download button simply won't do anything.

</div>

<br/>

## 📥 Installation

<div align="center">
<img src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
<img src="https://img.shields.io/badge/Brave-FB542B?style=for-the-badge&logo=brave&logoColor=white" />
<img src="https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white" />
<img src="https://img.shields.io/badge/Opera-FF1B2D?style=for-the-badge&logo=opera&logoColor=white" />
</div>

<br/>

1. Download or clone this repository, then extract if downloaded as a ZIP
2. Install the Python dependencies from the project folder:
  ```powershell
  py -m pip install -r requirements.txt
  ```
3. Open `app.pyw` to start the local server and tray app. The app automatically downloads `yt-dlp` and FFmpeg into `bin/` when they are needed.
4. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
5. Enable **Developer Mode**
6. Click **Load unpacked**
7. Select the `extension` folder
8. Open YouTube — the **Download** button appears below supported videos 🎉

<br/>

## 📁 Project Structure

```
NJK-YT-Downloader/
├── manifest.json     # Extension configuration
├── content.js          # Injects the Download button
├── icons/                # Extension icons
└── README.md
```

<br/>

## 🔑 Permissions

<div align="center">

| Permission | Why |
|---|---|
| `activeTab` | Interact with the currently open YouTube tab |
| `storage` | Store extension settings, if applicable |
| Host: `https://*.youtube.com/*` | Inject the Download button into YouTube |
| Host: `http://localhost:9999/*` | Talk to your local download server |

**No other hosts are ever contacted.**

</div>

<br/>

## 🌐 Browser Compatibility

<div align="center">

✔️ Google Chrome &nbsp;·&nbsp; ✔️ Brave &nbsp;·&nbsp; ✔️ Microsoft Edge &nbsp;·&nbsp; ✔️ Opera &nbsp;·&nbsp; ✔️ Vivaldi

*Any Chromium-based browser that supports Manifest V3.*

</div>

<br/>

## 🔒 Privacy & Security

<div align="center">

<img src="https://img.shields.io/badge/✗-Analytics-0f0f0f?style=for-the-badge" />
<img src="https://img.shields.io/badge/✗-Tracking-0f0f0f?style=for-the-badge" />
<img src="https://img.shields.io/badge/✗-External_Servers-0f0f0f?style=for-the-badge" />
<img src="https://img.shields.io/badge/✗-Ads-0f0f0f?style=for-the-badge" />

</div>

The extension talks to exactly two places: **the YouTube page you're on**, and **your own `localhost` server**. Nothing else. It never downloads anything itself — it detects the current video, sends the URL to your local downloader, and steps out of the way. Your own application handles everything from there.

<br/>

## 🗺️ Roadmap

- [ ] Download progress indicator
- [ ] Download quality selection
- [ ] Audio-only downloads
- [ ] Playlist support
- [ ] Batch downloads
- [ ] Download history
- [ ] Custom local server address
- [ ] Dark/light theme compatibility
- [ ] Keyboard shortcuts

<br/>

## 🛠️ Built With

<div align="center">

<img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
<img src="https://img.shields.io/badge/Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
<img src="https://img.shields.io/badge/Content_Scripts-cc0000?style=for-the-badge" />
<img src="https://img.shields.io/badge/Fetch_API-0f0f0f?style=for-the-badge" />

No external libraries or frameworks required.

</div>

<br/>

## ⚠️ Disclaimer

> This project is intended for **personal use and educational purposes**. You're responsible for ensuring any downloaded content complies with YouTube's Terms of Service and the copyright laws that apply in your jurisdiction.

<br/>

## 📄 License

<div align="center">

<img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="MIT License" />

Free to use, modify, and distribute — just keep the copyright notice. 

</div>

<br/>

## 👤 Author

<div align="center">

**Niranjan**
<br/>
*Built for a simple, private, locally-controlled YouTube download workflow.*

<br/>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0f0f,50:cc0000,100:0f0f0f&height=100&section=footer" width="100%"/>

</div>
