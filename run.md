# 🚀 Project Run Guide — Smart Home Service Automation

এই ডকুমেন্টটিতে প্রজেক্টটি সঠিকভাবে সেটআপ এবং রান করার সকল নিয়ম ও কমান্ড দেওয়া হয়েছে।

---

## ⚡ ১. দ্রুত রান করার উপায় (Quick Start)

Windows ব্যবহারকারীরা খুব সহজেই একটি স্ক্রিপ্ট ডাবল ক্লিক করে অথবা কমান্ড লাইনে চালিয়ে ব্যাকএন্ড ও ফ্রন্টএন্ড একসাথে চালু করতে পারেন:

```bat
cd smart-home-service-automation
run.bat
```
*(অথবা ফাইল এক্সপ্লোরারে গিয়ে `smart-home-service-automation/run.bat` ফাইলে ডাবল ক্লিক করুন)*

---

## 🛠️ ২. ম্যানুয়ালি রান করার নিয়ম (Step-by-Step)

যদি আপনি আলাদা আলাদা টার্মিনালে ম্যানুয়ালি চালাতে চান, তবে নিচের ধাপগুলো অনুসরণ করুন:

### 📋 পূর্বশর্ত (Prerequisites)
- **Python** (v3.10 বা তার বেশি)
- **Node.js** (v18 বা v20 LTS)
- **Git / Terminal** (PowerShell, Command Prompt, or Bash)

---

### ধাপ ১: ব্যাকএন্ড রান করা (FastAPI Backend)

১. টার্মিনাল ওপেন করে `backend` ফোল্ডারে যান:
```powershell
cd d:\1_project\smart-home-service-automation\backend
```

২. ভার্চুয়াল এনভায়রনমেন্ট তৈরি করুন (যদি পূর্বে না করা থাকে):
```powershell
python -m venv .venv
```

৩. ভার্চুয়াল এনভায়রনমেন্ট অ্যাক্টিভেট করুন:
- **Windows (PowerShell/CMD):**
  ```powershell
  .venv\Scripts\activate
  ```
- **Linux / macOS:**
  ```bash
  source .venv/bin/activate
  ```

> *নোট: PowerShell-এ স্ক্রিপ্ট রান রেস্ট্রিকশন থাকলে চালান: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`*

৪. ডিপেন্ডেন্সি ইন্সটল করুন:
```powershell
pip install -r requirements.txt
```

৫. ডাটাবেজ সিড করুন (Mock Providers ও Data লোড করার জন্য):
```powershell
python seed.py
```

৬. ব্যাকএন্ড সার্ভার চালু করুন:
```powershell
uvicorn main:app --reload --port 8000
```

✅ **ব্যাকএন্ড চালু হওয়ার পর:**
- API রুট: [http://localhost:8000](http://localhost:8000)
- হেলথ চেক: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- সোয়াগার এপিআই ডকুমেন্টস: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### ধাপ ২: ফ্রন্টএন্ড রান করা (React + Vite Frontend)

একটি **নতুন টার্মিনাল** ওপেন করুন:

১. `frontend` ফোল্ডারে যান:
```powershell
cd d:\1_project\smart-home-service-automation\frontend
```

২. ডিপেন্ডেন্সি ইন্সটল করুন (যদি পূর্বে না করা থাকে):
```powershell
npm install
```

৩. ডেভেলপমেন্ট সার্ভার চালু করুন:
```powershell
npm run dev
```

✅ **ফ্রন্টএন্ড চালু হওয়ার পর:**
- ব্রাউজারে ওপেন করুন: **[http://localhost:5173](http://localhost:5173)**

---

## 🔑 ৩. ডেমো অ্যাকাউন্ট ক্রেডেনশিয়াল (Demo Login)

সকল অ্যাকাউন্টের ডিফল্ট পাসওয়ার্ড: **`demo1234`**

### কাস্টমার অ্যাকাউন্ট (Customer):
| নাম | ইমেইল | পাসওয়ার্ড |
|---|---|---|
| Demo Customer | `customer@demo.com` | `demo1234` |
| Ayesha Rahman | `ayesha@demo.com` | `demo1234` |
| Tanvir Hasan | `tanvir@demo.com` | `demo1234` |

### সার্ভিস প্রোভাইডার অ্যাকাউন্ট (Service Provider):
| নাম / প্রতিষ্ঠান | সার্ভিস ক্যাটাগরি | ইমেইল | পাসওয়ার্ড |
|---|---|---|---|
| Rahim Electronics | Appliance & Gadget Repair | `rahim.electronics@demo.com` | `demo1234` |
| Karim Plumbing | Plumbing | `karim.plumbing.services@demo.com` | `demo1234` |
| QuickSpark Electrical | Electrical Services | `quickspark.electrical@demo.com` | `demo1234` |
| SparkleClean Dhaka | Cleaning & Housekeeping | `sparkleclean.dhaka@demo.com` | `demo1234` |

*(অন্যান্য সকল ক্যাটাগরির অ্যাকাউন্টের জন্য দেখুন: `demo_accounts.md`)*

---

## 🔍 ৪. সাধারণ সমস্যা ও সমাধান (Troubleshooting)

### সমস্যা ১: `Port 8000` অথবা `Port 5173` অলরেডি ইন ইউজ
যদি পূর্বের কোনো প্রসেস পোর্ট ব্লক করে থাকে:
```powershell
# পোর্ট ব্যবহারকারী প্রসেস চেক করতে
netstat -ano | findstr :8000
netstat -ano | findstr :5173

# PID দিয়ে প্রসেস বন্ধ করতে (যেমন PID 1234 হলে)
taskkill /F /PID 1234
```

### সমস্যা ২: ফ্রন্টএন্ড থেকে এপিআই কল হচ্ছে না
নিশ্চিত করুন ব্যাকএন্ড সার্ভার [http://localhost:8000](http://localhost:8000) পোর্টে সচল রয়েছে। `frontend/vite.config.js` ফাইলে `/api` প্রক্সি কনফিগার করা রয়েছে।
