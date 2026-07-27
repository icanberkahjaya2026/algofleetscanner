# AlgoFleet — Cloud Scan Bot (Telegram)

Scan universe SOP v3.6 **tiap 10 menit di cloud (GitHub Actions)** — tanpa browser/app terbuka.
Saat ada coin **ENTRY**, kamu dapat pesan **Telegram** (masuk ke HP walau app tertutup total).

Gratis. Tidak perlu server/kartu kredit.

---

## Cara pasang (± 10 menit, sekali saja)

### 1. Buat bot Telegram → dapat TOKEN
1. Buka Telegram, chat **@BotFather**.
2. Kirim `/newbot` → ikuti (kasih nama & username bot).
3. BotFather kasih **token** seperti `1234567890:AAH...` → simpan.

### 2. Dapatkan CHAT ID kamu
1. Chat **bot yang baru kamu buat**, kirim pesan apa saja (mis. `halo`).
2. Buka di browser (ganti `<TOKEN>`):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Cari `"chat":{"id":123456789` → angka itu **CHAT_ID** kamu.
   (Alternatif: chat **@userinfobot**, dia balas ID-mu.)

### 3. Buat repo GitHub & upload folder ini
1. Buat repo baru (boleh **private**) di github.com.
2. Upload **isi folder `alert-bot/`** ini ke repo (file `scan.mjs`, `state.json`, `README.md`, dan folder `.github/`).
   - Cara cepat via web: "Add file → Upload files", tapi folder `.github/workflows/scan.yml` harus ikut (drag folder `.github`).
   - Atau via git:
     ```bash
     cd alert-bot
     git init && git add . && git commit -m "algofleet scan bot"
     git branch -M main
     git remote add origin https://github.com/USER/REPO.git
     git push -u origin main
     ```

### 4. Isi Secrets di repo
Repo → **Settings → Secrets and variables → Actions → New repository secret**, tambah 2:
| Name | Value |
|---|---|
| `TELEGRAM_TOKEN` | token dari BotFather |
| `TELEGRAM_CHAT_ID` | chat id kamu |

### 5. Aktifkan & tes
1. Tab **Actions** → kalau ada tombol "I understand, enable workflows", klik.
2. Pilih **AlgoFleet Scan** → **Run workflow** (tes manual sekarang).
3. Lihat log-nya. Kalau pas ada coin ENTRY, Telegram-mu berbunyi. Kalau pasar lagi sepi, log bilang `0 ENTRY` (wajar).

Selesai — mulai sekarang scan jalan **otomatis tiap 10 menit**.

---

## Pengaturan (opsional)
Repo → **Settings → Secrets and variables → Actions → Variables** → New variable:
- `SCAN_MODES` = `intraday` (default) · atau `intraday,swing` · atau `scalping,intraday`
  (scalping paling sering sinyal; swing paling jarang.)

## Catatan penting
- **Jadwal GitHub kadang telat** beberapa menit saat server sibuk — normal untuk cron gratis.
- Bot hanya kirim saat ada **ENTRY baru** (anti-spam via `state.json`; 1 notif per sinyal per bar).
- Sinyal = **perkiraan**, bukan pasti. Entry **LIMIT maker**, patuhi heat-cap ≤3 posisi, skip hari news besar (NFP/CPI/FOMC).
- Kalau repo tak ada aktivitas 60 hari, GitHub bisa menonaktifkan schedule — jalankan manual sekali untuk mengaktifkan lagi.
- Data dari Binance **SPOT** (arah identik futures); funding rate tidak dihitung.
