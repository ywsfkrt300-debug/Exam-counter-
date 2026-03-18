import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import TelegramBot from "node-telegram-bot-api";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, orderBy } from "firebase/firestore";
import firebaseConfig from "./firebase-applet-config.json";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const app = express();
const PORT = 3000;

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// State management for interactive bot
const userStates: { [key: number]: { step: string; data?: any } } = {};

// Initialize Telegram Bot
let bot: TelegramBot | null = null;
if (token && token !== "YOUR_TELEGRAM_BOT_TOKEN") {
  bot = new TelegramBot(token, { polling: true });
  console.log("Telegram Bot initialized with interactive mode");

  const sendMainMenu = (chatId: number) => {
    bot?.sendMessage(chatId, "🏠 القائمة الرئيسية - اختر ما تريد القيام به:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ إضافة امتحان جديد", callback_data: "add_exam" }],
          [{ text: "📅 عرض قائمة الامتحانات", callback_data: "list_exams" }],
          [{ text: "📢 إرسال إشعار للموقع", callback_data: "send_notif" }],
          [{ text: "🛠️ وضع الصيانة (تفعيل/تعطيل)", callback_data: "toggle_maintenance" }],
          [{ text: "📊 إحصائيات الزوار", callback_data: "user_stats" }],
          [{ text: "🖼️ صورة فوق العداد", callback_data: "set_overlay" }],
          [{ text: "👨‍💻 تحديث بيانات المطور", callback_data: "set_dev_info" }],
          [{ text: "📚 إضافة مادة دراسية", callback_data: "add_subject" }],
          [{ text: "📉 إحصائيات يومية", callback_data: "daily_stats" }],
          [{ text: "👥 عدد المستخدمين", callback_data: "user_count" }],
          [{ text: "🖼️ تغيير خلفية الموقع", callback_data: "set_bg" }],
          [{ text: "❓ مساعدة", callback_data: "help" }]
        ]
      }
    });
  };

  bot.onText(/\/start/, (msg) => {
    delete userStates[msg.chat.id];
    bot?.sendMessage(msg.chat.id, "مرحباً بك في نظام إدارة مؤقت الامتحانات! 🎓\nتم تحديث البوت ليكون أسهل في الاستخدام.");
    sendMainMenu(msg.chat.id);
  });

  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId || !query.data) return;

    const action = query.data;

    if (action === "add_exam") {
      userStates[chatId] = { step: "WAITING_FOR_NAME" };
      bot?.sendMessage(chatId, "📝 حسناً، ما هو اسم الامتحان؟ (مثال: رياضيات، فيزياء)");
    } else if (action === "list_exams") {
      await listExams(chatId);
    } else if (action === "send_notif") {
      userStates[chatId] = { step: "WAITING_FOR_NOTIF" };
      bot?.sendMessage(chatId, "📢 أرسل نص الإشعار الذي تريد إظهاره على الموقع:");
    } else if (action === "toggle_maintenance") {
      try {
        const settingsRef = doc(db, "settings", "config");
        const settingsSnap = await getDoc(settingsRef);
        const currentMode = settingsSnap.exists() ? settingsSnap.data().maintenanceMode : false;
        const newMode = !currentMode;
        
        await setDoc(settingsRef, { maintenanceMode: newMode }, { merge: true });
        bot?.sendMessage(chatId, `🛠️ تم ${newMode ? "تفعيل" : "تعطيل"} وضع الصيانة بنجاح!`);
        sendMainMenu(chatId);
      } catch (e) {
        bot?.sendMessage(chatId, "❌ فشل تغيير وضع الصيانة.");
      }
    } else if (action === "add_subject") {
      userStates[chatId] = { step: "WAITING_FOR_SUBJECT_NAME" };
      bot?.sendMessage(chatId, "📚 أرسل اسم المادة (مثال: رياضيات):");
    } else if (action === "daily_stats") {
      try {
        const presenceSnap = await getDocs(collection(db, "presence"));
        const progressSnap = await getDocs(collection(db, "progress"));
        const subjectsSnap = await getDocs(collection(db, "subjects"));
        
        let message = "📊 *التقرير اليومي للطلاب:*\n\n";
        message += `👥 عدد الطلاب النشطين: *${presenceSnap.size}*\n`;
        message += `📚 عدد المواد المضافة: *${subjectsSnap.size}*\n`;
        message += `✅ عدد الطلاب الذين سجلوا تقدماً: *${progressSnap.size}*\n\n`;
        
        bot?.sendMessage(chatId, message, { parse_mode: "Markdown" });
      } catch (e) {
        bot?.sendMessage(chatId, "❌ فشل جلب التقرير اليومي.");
      }
    } else if (action === "set_dev_info") {
      userStates[chatId] = { step: "WAITING_FOR_DEV_NAME" };
      bot?.sendMessage(chatId, "👨‍💻 حسناً، أرسل اسم المطور الجديد:");
    } else if (action === "set_overlay") {
      userStates[chatId] = { step: "WAITING_FOR_OVERLAY_URL" };
      bot?.sendMessage(chatId, "🖼️ أرسل رابط الصورة الذي تريد وضعه فوق العداد (أو أرسل 'حذف' لإزالتها):");
    } else if (action === "user_stats") {
      try {
        const snapshot = await getDocs(collection(db, "presence"));
        const stats: { [key: string]: number } = {};
        const ips: string[] = [];
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const gov = data.governorate || "غير معروف";
          stats[gov] = (stats[gov] || 0) + 1;
          if (data.ip) ips.push(data.ip);
        });

        let message = "📊 *إحصائيات الزوار الحالية:*\n\n";
        message += "📍 *المحافظات الأكثر استخداماً:*\n";
        Object.entries(stats)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([gov, count]) => {
            message += `- ${gov}: ${count} مستخدم\n`;
          });

        message += "\n🌐 *عناوين IP المتصلة (آخر 10):*\n";
        ips.slice(-10).forEach(ip => {
          message += `- \`${ip}\`\n`;
        });

        bot?.sendMessage(chatId, message, { parse_mode: "Markdown" });
      } catch (e) {
        bot?.sendMessage(chatId, "❌ فشل جلب الإحصائيات.");
      }
    } else if (action === "user_count") {
      try {
        const snapshot = await getDocs(collection(db, "presence"));
        bot?.sendMessage(chatId, `👥 عدد المستخدمين المتصلين حالياً بالموقع: *${snapshot.size}*`, { parse_mode: "Markdown" });
      } catch (e) {
        bot?.sendMessage(chatId, "❌ فشل جلب عدد المستخدمين.");
      }
    } else if (action === "set_bg") {
      userStates[chatId] = { step: "WAITING_FOR_BG_URL" };
      bot?.sendMessage(chatId, "🖼️ أرسل رابط الصورة الجديد الذي تريده كخلفية للموقع:");
    } else if (action === "help") {
      bot?.sendMessage(chatId, "هذا البوت يساعدك في التحكم في موقع مؤقت الامتحانات.\n\nيمكنك إضافة امتحانات جديدة، حذفها، أو تغيير خلفية الموقع بسهولة عبر الأزرار.");
      sendMainMenu(chatId);
    } else if (action.startsWith("year_")) {
      const year = action.split("_")[1];
      userStates[chatId].data.year = year;
      userStates[chatId].step = "WAITING_FOR_MONTH";
      
      const months = [];
      for (let i = 1; i <= 12; i++) {
        months.push({ text: `${i}`, callback_data: `month_${i}` });
      }
      const monthButtons = [];
      for (let i = 0; i < months.length; i += 4) {
        monthButtons.push(months.slice(i, i + 4));
      }

      bot?.sendMessage(chatId, `📅 اختر الشهر لعام ${year}:`, {
        reply_markup: { inline_keyboard: monthButtons }
      });
    } else if (action.startsWith("month_")) {
      const month = action.split("_")[1];
      userStates[chatId].data.month = month.padStart(2, '0');
      userStates[chatId].step = "WAITING_FOR_DAY";
      
      const days = [];
      for (let i = 1; i <= 31; i++) {
        days.push({ text: `${i}`, callback_data: `day_${i}` });
      }
      const dayButtons = [];
      for (let i = 0; i < days.length; i += 7) {
        dayButtons.push(days.slice(i, i + 7));
      }

      bot?.sendMessage(chatId, `📅 اختر اليوم من الشهر ${month}:`, {
        reply_markup: { inline_keyboard: dayButtons }
      });
    } else if (action.startsWith("day_")) {
      const day = action.split("_")[1];
      userStates[chatId].data.day = day.padStart(2, '0');
      userStates[chatId].step = "WAITING_FOR_HOUR";
      
      const hours = [];
      for (let i = 0; i < 24; i++) {
        hours.push({ text: `${i}:00`, callback_data: `hour_${i}` });
      }
      const hourButtons = [];
      for (let i = 0; i < hours.length; i += 4) {
        hourButtons.push(hours.slice(i, i + 4));
      }

      bot?.sendMessage(chatId, `⏰ اختر الساعة (بتوقيت 24 ساعة):`, {
        reply_markup: { inline_keyboard: hourButtons }
      });
    } else if (action.startsWith("hour_")) {
      const hour = action.split("_")[1];
      const data = userStates[chatId].data;
      const finalDate = `${data.year}-${data.month}-${data.day} ${hour.padStart(2, '0')}:00`;
      
      try {
        const id = data.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString().slice(-4);
        await setDoc(doc(db, "exams", id), {
          id,
          name: data.name,
          targetDate: new Date(finalDate).toISOString(),
          description: `امتحان ${data.name}`
        });
        bot?.sendMessage(chatId, `✅ تم بنجاح! تمت إضافة امتحان *${data.name}*\n📅 الموعد: ${finalDate}`, { parse_mode: "Markdown" });
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ حدث خطأ أثناء الحفظ: ${error.message || error}`);
      }
    } else if (action.startsWith("delete_")) {
      const examId = action.split("_")[1];
      try {
        await deleteDoc(doc(db, "exams", examId));
        bot?.sendMessage(chatId, `✅ تم حذف الامتحان بنجاح.`);
        await listExams(chatId);
      } catch (e) {
        bot?.sendMessage(chatId, "❌ حدث خطأ أثناء الحذف.");
      }
    }

    bot?.answerCallbackQuery(query.id);
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[chatId];

    if (!state || !text || text.startsWith("/")) return;

    if (state.step === "WAITING_FOR_NAME") {
      userStates[chatId] = { step: "WAITING_FOR_YEAR", data: { name: text } };
      const currentYear = new Date().getFullYear();
      bot?.sendMessage(chatId, `📅 اختر السنة لامتحان "${text}":`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `${currentYear}`, callback_data: `year_${currentYear}` }],
            [{ text: `${currentYear + 1}`, callback_data: `year_${currentYear + 1}` }],
            [{ text: `${currentYear + 2}`, callback_data: `year_${currentYear + 2}` }]
          ]
        }
      });
    } else if (state.step === "WAITING_FOR_NOTIF") {
      try {
        const id = Date.now().toString();
        await setDoc(doc(db, "notifications", id), {
          id,
          message: text,
          timestamp: new Date().toISOString()
        });
        bot?.sendMessage(chatId, "✅ تم إرسال الإشعار للموقع بنجاح!");
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ فشل إرسال الإشعار: ${error.message || error}`);
      }
    } else if (state.step === "WAITING_FOR_SUBJECT_NAME") {
      userStates[chatId] = { step: "WAITING_FOR_SUBJECT_UNITS", data: { name: text } };
      bot?.sendMessage(chatId, `✅ تم حفظ اسم المادة: ${text}\n📝 الآن أرسل أسماء الوحدات/الدروس مفصولة بفاصلة (مثال: الوحدة الأولى، الوحدة الثانية):`);
    } else if (state.step === "WAITING_FOR_SUBJECT_UNITS") {
      const units = text.split(",").map(u => u.trim()).filter(u => u.length > 0);
      if (units.length === 0) {
        bot?.sendMessage(chatId, "❌ يرجى إرسال وحدة واحدة على الأقل.");
        return;
      }
      try {
        const id = Date.now().toString();
        await setDoc(doc(db, "subjects", id), {
          id,
          name: state.data.name,
          units
        });
        bot?.sendMessage(chatId, `✅ تمت إضافة مادة *${state.data.name}* مع ${units.length} وحدة بنجاح!`, { parse_mode: "Markdown" });
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ فشل إضافة المادة: ${error.message || error}`);
      }
    } else if (state.step === "WAITING_FOR_DEV_NAME") {
      userStates[chatId] = { step: "WAITING_FOR_DEV_IMAGE", data: { name: text } };
      bot?.sendMessage(chatId, `✅ تم حفظ الاسم: ${text}\n🖼️ الآن أرسل رابط صورة المطور:`);
    } else if (state.step === "WAITING_FOR_DEV_IMAGE") {
      if (!text.startsWith("http")) {
        bot?.sendMessage(chatId, "❌ يرجى إرسال رابط صحيح يبدأ بـ http أو https");
        return;
      }
      try {
        await setDoc(doc(db, "settings", "config"), { 
          developerName: state.data.name,
          developerImageUrl: text 
        }, { merge: true });
        bot?.sendMessage(chatId, "✅ تم تحديث بيانات المطور بنجاح!");
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ فشل التحديث: ${error.message || error}`);
      }
    } else if (state.step === "WAITING_FOR_OVERLAY_URL") {
      if (text === "حذف") {
        try {
          await setDoc(doc(db, "settings", "config"), { overlayImageUrl: null }, { merge: true });
          bot?.sendMessage(chatId, "✅ تم حذف الصورة من فوق العداد.");
          delete userStates[chatId];
          sendMainMenu(chatId);
        } catch (e) {
          bot?.sendMessage(chatId, "❌ فشل حذف الصورة.");
        }
        return;
      }

      if (!text.startsWith("http")) {
        bot?.sendMessage(chatId, "❌ يرجى إرسال رابط صحيح يبدأ بـ http أو https");
        return;
      }

      try {
        await setDoc(doc(db, "settings", "config"), { overlayImageUrl: text }, { merge: true });
        bot?.sendMessage(chatId, "✅ تم تحديث الصورة فوق العداد بنجاح!");
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ حدث خطأ أثناء التحديث: ${error.message || error}`);
      }
    } else if (state.step === "WAITING_FOR_BG_URL") {
      if (!text.startsWith("http")) {
        bot?.sendMessage(chatId, "❌ يرجى إرسال رابط صحيح يبدأ بـ http أو https");
        return;
      }

      try {
        await setDoc(doc(db, "settings", "config"), {
          backgroundUrl: text,
          theme: "glass"
        }, { merge: true });
        bot?.sendMessage(chatId, "✅ تم تحديث خلفية الموقع بنجاح!");
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error: any) {
        bot?.sendMessage(chatId, `❌ حدث خطأ أثناء تحديث الخلفية: ${error.message || error}`);
      }
    }
  });

  async function listExams(chatId: number) {
    try {
      const q = query(collection(db, "exams"), orderBy("targetDate", "asc"));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        bot?.sendMessage(chatId, "📭 لا توجد امتحانات حالياً.");
        sendMainMenu(chatId);
        return;
      }

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        const date = new Date(data.targetDate).toLocaleString('ar-EG');
        bot?.sendMessage(chatId, `📌 *${data.name}*\n📅 التاريخ: ${date}`, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🗑️ حذف هذا الامتحان", callback_data: `delete_${data.id}` }]
            ]
          }
        });
      }
      
      setTimeout(() => sendMainMenu(chatId), 1000);
    } catch (error) {
      bot?.sendMessage(chatId, "❌ خطأ في جلب البيانات.");
    }
  }

} else {
  console.warn("TELEGRAM_BOT_TOKEN not set. Bot disabled.");
}

async function startServer() {
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botActive: !!bot });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
