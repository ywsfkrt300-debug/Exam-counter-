import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import TelegramBot from "node-telegram-bot-api";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, getDocs, deleteDoc, query, orderBy } from "firebase/firestore";
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
    if (!chatId) return;

    const action = query.data;

    if (action === "add_exam") {
      userStates[chatId] = { step: "WAITING_FOR_NAME" };
      bot?.sendMessage(chatId, "📝 حسناً، ما هو اسم الامتحان؟ (مثال: رياضيات، فيزياء)");
    } else if (action === "list_exams") {
      await listExams(chatId);
    } else if (action === "set_bg") {
      userStates[chatId] = { step: "WAITING_FOR_BG_URL" };
      bot?.sendMessage(chatId, "🖼️ أرسل رابط الصورة الجديد الذي تريده كخلفية للموقع:");
    } else if (action === "help") {
      bot?.sendMessage(chatId, "هذا البوت يساعدك في التحكم في موقع مؤقت الامتحانات.\n\nيمكنك إضافة امتحانات جديدة، حذفها، أو تغيير خلفية الموقع بسهولة عبر الأزرار.");
      sendMainMenu(chatId);
    } else if (action?.startsWith("delete_")) {
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
      userStates[chatId] = { step: "WAITING_FOR_DATE", data: { name: text } };
      bot?.sendMessage(chatId, `📅 جميل، "امتحان ${text}".\nالآن أرسل تاريخ الامتحان بالتنسيق التالي:\nYYYY-MM-DD HH:mm\nمثال: 2026-06-15 08:30`);
    } else if (state.step === "WAITING_FOR_DATE") {
      const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
      if (!dateRegex.test(text)) {
        bot?.sendMessage(chatId, "❌ التنسيق غير صحيح. يرجى الإرسال هكذا:\nYYYY-MM-DD HH:mm");
        return;
      }

      const name = state.data.name;
      const id = name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString().slice(-4);

      try {
        await setDoc(doc(db, "exams", id), {
          id,
          name,
          targetDate: new Date(text).toISOString(),
          description: `امتحان ${name}`
        });
        bot?.sendMessage(chatId, `✅ تم بنجاح! تمت إضافة امتحان ${name} في ${text}`);
        delete userStates[chatId];
        sendMainMenu(chatId);
      } catch (error) {
        bot?.sendMessage(chatId, "❌ حدث خطأ أثناء الحفظ في قاعدة البيانات.");
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
      } catch (error) {
        bot?.sendMessage(chatId, "❌ حدث خطأ أثناء تحديث الخلفية.");
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
