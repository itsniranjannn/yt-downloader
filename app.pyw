import sys
import threading
import ctypes
from pathlib import Path

MUTEX_NAME = "Global\\YT_Helper_Mutex"
mutex = ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX_NAME)
if ctypes.windll.kernel32.GetLastError() == 183:
    ctypes.windll.user32.MessageBoxW(0, "yt-downloader is already running.", "Already Open", 0)
    sys.exit(0)

import winreg
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as Item
import requests
import subprocess
import os

sys.path.insert(0, str(Path(__file__).parent))
import server

server_running = False
tray_icon      = None
APP_NAME       = "yt-downloader"
STARTUP_KEY    = r"Software\Microsoft\Windows\CurrentVersion\Run"

if getattr(sys, "frozen", False):
    EXE_PATH = f'"{sys.executable}"'
else:
    pythonw  = str(Path(sys.executable).parent / "pythonw.exe")
    EXE_PATH = f'"{pythonw}" "{Path(__file__).resolve()}"'

def make_icon(color):
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    d.ellipse([4, 4, 60, 60], fill=color)
    d.polygon(
        [(32, 44), (18, 28), (26, 28), (26, 18),
         (38, 18), (38, 28), (46, 28)],
        fill="white"
    )
    return img

ICON_ON   = make_icon("#22c55e")
ICON_OFF  = make_icon("#ef4444")
ICON_BUSY = make_icon("#f59e0b")   # amber while updating

def _no_window_kwargs():
    if os.name != "nt":
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0
    return {"creationflags": subprocess.CREATE_NO_WINDOW, "startupinfo": si}

def start_server():
    global server_running
    if server_running:
        return
    threading.Thread(target=server.run_server, kwargs={"port": 9999}, daemon=True).start()
    server_running = True
    refresh_menu()

def stop_server():
    global server_running
    try:
        requests.post("http://localhost:9999/shutdown", timeout=2)
    except Exception:
        pass
    server_running = False
    refresh_menu()

def is_startup_enabled():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_KEY, 0, winreg.KEY_READ)
        winreg.QueryValueEx(key, APP_NAME)
        winreg.CloseKey(key)
        return True
    except FileNotFoundError:
        return False

def toggle_startup():
    key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, STARTUP_KEY, 0, winreg.KEY_SET_VALUE)
    if is_startup_enabled():
        winreg.DeleteValue(key, APP_NAME)
    else:
        winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, EXE_PATH)
    winreg.CloseKey(key)
    refresh_menu()

def update_ytdlp():
    """Run yt-dlp -U in a background thread, show amber icon while running."""
    def _run():
        if tray_icon:
            tray_icon.icon  = ICON_BUSY
            tray_icon.title = f"{APP_NAME} — Updating yt-dlp…"
        try:
            result = subprocess.run(
                [server.YTDLP_EXE, "-U"],
                capture_output=True, text=True,
                **_no_window_kwargs(),
            )
            lines  = (result.stdout + result.stderr).strip().splitlines()
            last   = lines[-1] if lines else "Done."
            # Show result as tray notification (balloon on Windows)
            if tray_icon:
                tray_icon.notify(last, "yt-dlp update")
        except Exception as e:
            if tray_icon:
                tray_icon.notify(str(e), "yt-dlp update failed")
        finally:
            refresh_menu()

    threading.Thread(target=_run, daemon=True).start()

def build_menu():
    status        = "● Running" if server_running else "○ Stopped"
    t_label       = "Stop server" if server_running else "Start server"
    t_action      = stop_server  if server_running else start_server
    startup_label = "✓ Start with Windows" if is_startup_enabled() else "   Start with Windows"
    return pystray.Menu(
        Item(status,             lambda: None, enabled=False),
        pystray.Menu.SEPARATOR,
        Item(t_label,            t_action),
        pystray.Menu.SEPARATOR,
        Item("Update yt-dlp",    lambda: update_ytdlp()),
        pystray.Menu.SEPARATOR,
        Item(startup_label,      toggle_startup),
        pystray.Menu.SEPARATOR,
        Item("Quit",             quit_app),
    )

def refresh_menu():
    if tray_icon:
        tray_icon.menu  = build_menu()
        tray_icon.icon  = ICON_ON if server_running else ICON_OFF
        tray_icon.title = f"{APP_NAME} — {'Running' if server_running else 'Stopped'}"

def quit_app():
    if server_running:
        stop_server()
    tray_icon.stop()
    sys.exit(0)

if __name__ == "__main__":
    tray_icon = pystray.Icon(
        APP_NAME,
        icon=ICON_OFF,
        title=f"{APP_NAME} — Stopped",
        menu=build_menu(),
    )
    threading.Thread(target=start_server, daemon=True).start()
    tray_icon.run()
