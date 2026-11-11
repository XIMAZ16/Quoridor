# QUORIDOR — Retro Arcade

เกม Quoridor 9×9 ธีม Retro Arcade แยกโค้ดเป็นไฟล์ตามหน้าที่ เพื่อให้แก้ไขและพัฒนาต่อได้ง่ายขึ้น

## โครงสร้างโปรเจกต์

```text
QUORIDOR/
├── README.md
├── index.html       # โครงสร้างหน้าเว็บและองค์ประกอบ UI
├── style.css        # ธีม Retro Arcade และ responsive styles
├── game.js          # กติกา game engine, state, board และ UI controller
├── ai.js            # อัลกอริทึม AI และระดับความยาก
├── audio.js         # เสียง 8-bit ด้วย Web Audio API
├── net.js           # Multiplayer transport (PubNub / BroadcastChannel)
└── net-config.js    # PubNub publish/subscribe keys ฝั่ง client
```

## วิธีเปิดใช้งาน

1. วางไฟล์ทั้งหมดไว้ในโฟลเดอร์เดียวกัน โดยคงชื่อไฟล์ตามนี้
2. เปิด `index.html` ผ่าน local web server หรือ deploy โฟลเดอร์นี้ไปยัง Vercel
3. ไม่จำเป็นต้องติดตั้ง build tools หรือ framework เพิ่มเติม

ตัวอย่างรัน local server ด้วย Python:

```bash
python -m http.server 8000
```

จากนั้นเปิด `http://localhost:8000` ในเบราว์เซอร์

## หน้าที่ของแต่ละไฟล์

- **index.html** — markup ของหน้าเกม, scoreboard, lobby และ dialogs
- **style.css** — CSS เดิมของธีม Retro Arcade
- **game.js** — กติกา Quoridor, การเดินหมาก/วางกำแพง, ตรวจเส้นทาง, state และ UI controller
- **ai.js** — การสร้าง candidate moves, evaluation และ minimax/alpha-beta search
- **audio.js** — สร้างเสียงเกมด้วย Web Audio API และจัดเก็บสถานะ mute
- **net.js** — เชื่อมต่อห้องออนไลน์ ส่ง/รับข้อความ และตรวจสถานะ peer
- **net-config.js** — ค่าตั้งต้น PubNub ที่ใช้จาก browser

## ลำดับการโหลด JavaScript

`net-config.js` → `audio.js` → `game.js` → `ai.js` → `net.js`

สคริปต์ใช้ classic browser scripts เพื่อคงการเข้าถึงฟังก์ชันและคลาสข้ามไฟล์แบบเดิม โดย controller เริ่มทำงานเมื่อเกิด `DOMContentLoaded`

## หมายเหตุด้านความปลอดภัยของ PubNub

Publish/subscribe keys ที่อยู่ใน `net-config.js` เป็นค่าที่ส่งไปยัง browser และผู้ใช้สามารถมองเห็นได้ จึงห้ามใส่ secret key หรือข้อมูลลับลงในไฟล์นี้ ควรกำหนด PubNub Access Manager/permissions และจำกัดสิทธิ์ channel ให้เหมาะสมกับการใช้งานจริง

## หมายเหตุการ refactor

แยกไฟล์จากต้นฉบับโดยคง markup, CSS, ชื่อ element ID และตรรกะเกมเดิมไว้ พร้อมย้ายส่วน Audio, AI และ Network ไปยังไฟล์เฉพาะหน้าที่ ไม่ได้เปลี่ยนธีมหรือออกแบบ UI ใหม่
