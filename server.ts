import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, orderBy, limit } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import firebaseConfig from "./firebase-applet-config.json";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = "33454";

// Configure Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
const storage = getStorage(firebaseApp);

app.use(express.json());

// Helper to upload file to Firebase Storage
async function uploadFileToFirebase(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const storageRef = ref(storage, `uploads/${Date.now()}_${fileName}`);
  await uploadBytes(storageRef, buffer, { contentType: mimeType });
  return await getDownloadURL(storageRef);
}

async function startServer() {
  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Admin Login
  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
      res.json({ success: true, token: "admin-token-" + Date.now() });
    } else {
      res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة" });
    }
  });

  // Admin File Upload
  app.post("/api/admin/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "لم يتم اختيار ملف" });
      }
      const downloadUrl = await uploadFileToFirebase(req.file.buffer, req.file.originalname, req.file.mimetype);
      res.json({ success: true, url: downloadUrl });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin Stats
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const presenceSnap = await getDocs(collection(db, "presence"));
      const progressSnap = await getDocs(collection(db, "progress"));
      const subjectsSnap = await getDocs(collection(db, "subjects"));
      const examsSnap = await getDocs(collection(db, "exams"));
      
      const stats = {
        activeUsers: presenceSnap.size,
        totalSubjects: subjectsSnap.size,
        totalExams: examsSnap.size,
        progressCount: progressSnap.size,
        governorates: {} as { [key: string]: number },
        ips: [] as string[]
      };

      presenceSnap.docs.forEach(doc => {
        const data = doc.data();
        const gov = data.governorate || "غير معروف";
        stats.governorates[gov] = (stats.governorates[gov] || 0) + 1;
        if (data.ip) stats.ips.push(data.ip);
      });

      res.json({ success: true, stats });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Admin Logs
  app.get("/api/admin/logs", async (req, res) => {
    try {
      const q = query(collection(db, "logs"), orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => doc.data());
      res.json({ success: true, logs });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
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
