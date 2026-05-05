import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

export default async function handler(req: any, res: any) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const examsSnap = await getDocs(collection(db, "exams"));
    const exams = examsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    const targetExam = exams.find((e) => e.name.includes("الشهادة الإعدادية") || e.name.includes("التاسع")) 
                       || exams[0];

    res.status(200).json({
      success: true,
      now: new Date().toISOString(),
      exam: targetExam || null,
      allExams: exams
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}
