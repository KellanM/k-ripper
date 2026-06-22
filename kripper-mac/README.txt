K-Ripper for Ableton Live (macOS)
==================================

INSTALL
-------
1. Double-click "install.command".

   First time only: macOS may block it ("Apple cannot check it for
   malicious software"). If so: System Settings -> Privacy & Security ->
   scroll down -> click "Open Anyway", then double-click it again.
   (Or: right-click install.command -> Open -> Open.)

2. A Terminal window opens and installs K-Ripper into your Ableton
   User Library automatically.

USE
---
1. Open Ableton Live (restart it if it was already running)
2. Browser -> User Library -> Audio Effects -> Max Audio Effect -> K-Ripper
3. Drag K-Ripper onto any AUDIO track
4. Copy a track URL (SoundCloud, YouTube, Bandcamp, ...), click RIP
5. The track appears as a clip on that track; the WAV file is saved
   to ~/Music/K-Ripper

REQUIREMENTS
------------
- Ableton Live 11 or 12 with Max for Live (included in Suite)
- Works on both Apple Silicon (M1-M4) and Intel Macs

TROUBLESHOOTING
---------------
- Device shows but RIP does nothing: open Window -> Max Console inside
  Live (click the device's Edit button first) and look for red errors.
- "unavailable or private": that track needs a subscription/login on
  the source platform, or it was removed.
- Moved your User Library to a custom location? The installer will ask
  for the path. Find it in Live: Preferences -> Library.
