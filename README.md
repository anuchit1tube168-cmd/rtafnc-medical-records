# ระบบเวชระเบียนและงานสุขภาพประจำหน่วยงาน (RTAFNC Health & Medical Records)
> ระบบเวชระเบียนและงานสุขภาพประจำหน่วยงาน สำหรับใช้งานจริงในสถานพยาบาลและห้องพยาบาล  
> พัฒนาด้วย **Google Apps Script**, **HTML5**, **CSS3**, **JavaScript (ES6+)** โดยใช้ **Google Sheets** เป็นฐานข้อมูลหลัก พร้อมระบบเชื่อมโยง **Google Slides** และการแจ้งเตือนผ่าน **Telegram Bot**

---

## 🌟 จุดเด่นและฟังก์ชันการทำงาน (Key Features)

### 1. 📊 แดชบอร์ดภาพรวมสุขภาพ (Comprehensive Health Dashboard)
- สรุปสถิติผู้รับบริการประจำวัน (จำแนกตามชั้นปีของ นพอ. และกำลังพล)
- กราฟและสถิติกลุ่มโรคที่พบบ่อย (URI, ทางเดินอาหาร, อาการบาดเจ็บจากการฝึก)
- การแจ้งเตือนด่วน: ยาใกล้หมดสต็อก, ผู้ป่วยฉุกเฉินที่ต้องส่งตัว, และรายการนัดติดตามอาการ

### 2. 📋 ทะเบียนผู้รับบริการ (Patient & Student Registry)
- จัดการประวัติเวชระเบียนส่วนบุคคล ข้อมูลชั้นปี รหัสประจำตัว กรุ๊ปเลือด
- คัดกรองและแจ้งเตือน **ประวัติการแพ้ยา** และโรคประจำตัวอย่างชัดเจน
- บันทึกข้อมูลผู้ติดต่อฉุกเฉิน

### 3. 🩺 บันทึกการตรวจรักษา & สัญญาณชีพ (Visits & Vital Signs)
- บันทึกสัญญาณชีพ 6 ค่ามาตรฐาน (BT, BP, PR, RR, SpO2, Pain Score)
- การประเมินความเร่งด่วน (Triage: Routine / Urgent / Emergency)
- บันทึกซักประวัติ อาการสำคัญ (CC) และการวินิจฉัยโรคเบื้องต้น (Dx)
- ระบบสั่งจ่ายยาที่เชื่อมโยงกับคลังยา พร้อมระบบความปลอดภัย **LockService** ป้องกันการตัดสต็อกชนกัน

### 4. 💊 ระบบคลังยาและเวชภัณฑ์ (Pharmacy & Inventory Management)
- ติดตามยอดคงเหลือแบบเรียลไทม์ (ตัดยอดทันทีที่จ่ายยา)
- ระบบเตือนยาใกล้หมดสต็อกเมื่อถึงจุดสั่งซื้อขั้นต่ำ (Reorder Point)
- ระบบเตือนวันหมดอายุล่วงหน้า 90 วัน (Near Expiry Alerts)

### 5. 🚑 ระบบส่งต่อผู้ป่วยภายนอก (Hospital Referral & Print A4)
- บันทึกการส่งตัวผู้ป่วยไปโรงพยาบาลภายนอก (เช่น รพ.ภูมิพลอดุลยเดช พอ.)
- ออกแบบหน้าเอกสารแบบฟอร์มขนาดมาตรฐาน A4 สวยงาม พร้อมสั่งพิมพ์ (Print) ได้ทันที

### 6. 📑 ระบบสร้างเอกสาร Google Slides อัตโนมัติ (Mail-Merge)
- เชื่อมโยงกับ Google Form เมื่อมีการส่งคำตอบเข้ามา
- ดึงเทมเพลต Google Slides "บันทึกการตรวจ/รักษา" มาสร้างเป็นไฟล์ใหม่เฉพาะบุคคล
- ทำการแทนที่แท็ก `<<...>>` ทั้ง 16 ฟิลด์ (ยศ, ชื่อ, รหัส นพอ., อาการสำคัญ, การวินิจฉัย, ยาที่ได้รับ ฯลฯ)

### 7. 📱 ระบบแจ้งเตือนผ่าน Telegram Bot
- แจ้งเตือนการรับบริการใหม่แบบเรียลไทม์
- แจ้งเตือนการส่งตัวผู้ป่วยฉุกเฉิน
- แจ้งเตือนเมื่อมีคำตอบฟอร์มสุขภาพ พร้อมแนบ **ลิงก์เปิดดู Google Slides** โดยตรงในห้องแชท

---

## 🗄️ โครงสร้างฐานข้อมูล (Google Sheets Database)
ระบบสร้างและบริหารจัดการข้อมูลผ่าน Google Sheets โดยแบ่งเป็น 16 ตารางหลัก:
1. **Users** - ผู้ใช้งานระบบและสิทธิ์การเข้าถึง (Admin, Staff, Doctor)
2. **Roles** - บทบาทและสิทธิ์การใช้งาน
3. **Settings** - ค่าปรับแต่งระบบและชื่อหน่วยงาน
4. **Recipients** - ทะเบียนประวัติผู้รับบริการ/นพอ.
5. **Visits** - ประวัติการเข้ารับบริการตรวจรักษา
6. **Medicines** - คลังยาและเวชภัณฑ์
7. **MedicineBatches** - ล็อตยาและวันหมดอายุ
8. **MedicineUsage** - ประวัติการจ่ายยาและตัดสต็อก
9. **Referrals** - บันทึกการส่งตัวผู้ป่วยออกรักษาภายนอก
10. **FollowUps** - การนัดหมายและติดตามอาการ
11. **HealthExams** - บันทึกการตรวจสุขภาพประจำปี
12. **Vaccinations** - ประวัติการรับวัคซีน
13. **Attachments** - ไฟล์แนบและเอกสาร
14. **AuditLogs** - บันทึกประวัติการใช้งานระบบ (Security Log)
15. **Sessions** - จัดการการล็อกอินและการหมดอายุของเซสชัน
16. **Counters** - ตัวนับเลขที่เอกสารอัตโนมัติ (HN, VN, REF)

---

## 🛠️ โครงสร้างไฟล์ในโครงการ

```text
├── Code.gs             # Backend Logic (Google Apps Script, REST APIs, Sheets/Slides/Telegram)
├── Index.html          # โครงสร้างหน้าเว็บหลัก Single Page Application (SPA)
├── Styles.html         # สไตล์และ CSS ออกแบบตามดีไซน์ทันสมัย (รองรับ Mobile/Tablet/Desktop)
├── Scripts.html        # Frontend JavaScript (DOM Controllers, Data Handling, Modals)
├── appsscript.json     # Apps Script Manifest (Timezone, WebApp scopes, Libraries)
├── .clasp.json         # Google Clasp Configuration
└── README.md           # รายละเอียดเอกสารโครงการ
```

---

## 🚀 การติดตั้งและ Deploy (Getting Started)

### 1. โคลนและตั้งค่า Clasp
```bash
git clone https://github.com/anuchit1tube168-cmd/rtafnc-medical-records.git
cd rtafnc-medical-records
npm install -g @google/clasp
clasp login
```

### 2. Push โค้ดขึ้น Google Apps Script
```bash
clasp push -f
```

### 3. Deploy เป็น Web Application
```bash
clasp deploy -d "Deploy Production"
```
* **Execute as:** `User accessing the web app` หรือ `Me (developer)`
* **Who has access:** `Anyone with Google account` หรือ `Anyone`

---

## 🔒 ความปลอดภัย (Security & Compliance)
- มีระบบ Audit Log ติดตามทุกกิจกรรม
- ป้องกันการตัดสต็อกชนกันด้วย `LockService.getScriptLock()`
- รองรับการเข้ารหัสและการจัดการสิทธิ์ตามระดับผู้ใช้งาน (RBAC)

---
© วิทยาลัยพยาบาลทหารอากาศ กรมแพทย์ทหารอากาศ (RTAFNC)
