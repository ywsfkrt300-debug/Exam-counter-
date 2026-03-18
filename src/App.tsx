import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, limit, getDocFromServer, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, ChevronRight, ChevronLeft, LayoutGrid, Maximize2, Bell, ShieldAlert, User, Home, Map as MapIcon, CheckCircle2, BookOpen, Timer, Download, FileText, Volume2, VolumeX } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import useSound from 'use-sound';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Exam {
  id: string;
  name: string;
  targetDate: string;
  description?: string;
}

interface Settings {
  backgroundUrl?: string;
  theme?: string;
  maintenanceMode?: boolean;
  overlayImageUrl?: string;
  developerName?: string;
  developerImageUrl?: string;
  fontFamily?: string;
}

interface Notification {
  id: string;
  message: string;
  timestamp: any;
}

interface Subject {
  id: string;
  name: string;
  units: string[];
}

interface Schedule {
  id: string;
  title: string;
  imageUrl: string;
  timestamp: any;
}

interface UserProgress {
  sessionId: string;
  subjectId: string;
  completedUnits: string[];
  studyHours: { [key: string]: number };
}

const AdminDashboard = ({ onExit }: { onExit: () => void }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('stats');
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats();
      fetchLogs();
      const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
        setSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));
      });
      const unsubExams = onSnapshot(collection(db, 'exams'), (snap) => {
        setExams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
      });
      const unsubSchedules = onSnapshot(collection(db, 'schedules'), (snap) => {
        setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
      });
      return () => {
        unsubSubjects();
        unsubExams();
        unsubSchedules();
      };
    }
  }, [isLoggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '33454') {
      setIsLoggedIn(true);
      setError('');
    } else {
      setError('كلمة المرور غير صحيحة');
    }
  };

  const fetchStats = async () => {
    try {
      const presenceSnap = await getDocs(collection(db, 'presence'));
      const progressSnap = await getDocs(collection(db, 'progress'));
      const subjectsSnap = await getDocs(collection(db, 'subjects'));
      const examsSnap = await getDocs(collection(db, 'exams'));
      
      const statsData = {
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
        statsData.governorates[gov] = (statsData.governorates[gov] || 0) + 1;
        if (data.ip) statsData.ips.push(data.ip);
      });

      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      setLogs(snapshot.docs.map(doc => doc.data()));
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setUploadedUrl(url);
    } catch (err) {
      console.error('Upload failed', err);
      alert('فشل الرفع');
    } finally {
      setUploading(false);
    }
  };

  const addSubject = async (name: string) => {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    await setDoc(doc(db, 'subjects', id), { name, units: [] });
  };

  const addExam = async (name: string, date: string, desc: string) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'exams', id), { name, targetDate: date, description: desc });
  };

  const addUnit = async (subjectId: string, unitName: string) => {
    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
      await setDoc(doc(db, 'subjects', subjectId), { 
        ...subject, 
        units: [...subject.units, unitName] 
      });
    }
  };

  const addSchedule = async (title: string, imageUrl: string) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'schedules', id), { title, imageUrl, timestamp: serverTimestamp() });
  };

  const sendNotification = async (message: string) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'notifications', id), { message, timestamp: serverTimestamp() });
  };

  const deleteItem = async (col: string, id: string) => {
    if (window.confirm('هل أنت متأكد من الحذف؟')) {
      await deleteDoc(doc(db, col, id));
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 border border-emerald-500/20">
              <ShieldAlert className="text-emerald-500" size={32} />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">لوحة التحكم</h1>
            <p className="text-zinc-500 text-sm mt-1">يرجى إدخال كلمة المرور للمتابعة</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••"
              className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white text-center text-2xl tracking-[0.5em] focus:border-emerald-500/50 outline-none transition-all"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button 
              type="submit"
              className="w-full p-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-900/20"
            >
              دخول
            </button>
          </form>
          <button onClick={onExit} className="w-full mt-4 text-zinc-500 hover:text-white transition-colors text-sm">العودة للموقع</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-zinc-900 border-b md:border-b-0 md:border-l border-white/10 p-6 flex flex-col gap-2">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <LayoutGrid size={18} className="text-black" />
          </div>
          <span className="font-black tracking-tight">المدير</span>
        </div>

        {[
          { id: 'stats', label: 'الإحصائيات', icon: BarChart },
          { id: 'subjects', label: 'المواد', icon: BookOpen },
          { id: 'exams', label: 'الامتحانات', icon: Clock },
          { id: 'schedules', label: 'الجداول', icon: Calendar },
          { id: 'notifications', label: 'التنبيهات', icon: Bell },
          { id: 'uploads', label: 'الرفع', icon: Download },
          { id: 'logs', label: 'السجلات', icon: FileText },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-medium",
              activeTab === tab.id ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            )}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}

        <div className="mt-auto pt-6">
          <button onClick={onExit} className="w-full p-3 text-zinc-500 hover:text-white transition-colors text-sm flex items-center gap-3">
            <ChevronRight size={18} />
            خروج
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <h2 className="text-3xl font-black tracking-tight">نظرة عامة</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'المستخدمين النشطين', value: stats?.activeUsers || 0, color: 'emerald' },
                  { label: 'إجمالي المواد', value: stats?.totalSubjects || 0, color: 'blue' },
                  { label: 'إجمالي الامتحانات', value: stats?.totalExams || 0, color: 'purple' },
                  { label: 'تفاعلات التقدم', value: stats?.progressCount || 0, color: 'orange' },
                ].map((s, i) => (
                  <div key={i} className="p-6 bg-zinc-900 border border-white/10 rounded-3xl">
                    <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-2">{s.label}</p>
                    <p className="text-4xl font-black">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-8 bg-zinc-900 border border-white/10 rounded-3xl">
                  <h3 className="text-xl font-bold mb-6">توزيع المحافظات</h3>
                  <div className="space-y-4">
                    {stats?.governorates && Object.entries(stats.governorates).map(([gov, count]: [string, any]) => (
                      <div key={gov} className="flex items-center justify-between">
                        <span className="text-zinc-400">{gov}</span>
                        <div className="flex items-center gap-3 flex-1 mx-4">
                          <div className="h-1.5 bg-zinc-800 rounded-full flex-1 overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500" 
                              style={{ width: `${(count / stats.activeUsers) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="font-mono">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-8 bg-zinc-900 border border-white/10 rounded-3xl">
                  <h3 className="text-xl font-bold mb-6">عناوين IP الأخيرة</h3>
                  <div className="space-y-2 font-mono text-sm text-zinc-500">
                    {stats?.ips?.slice(0, 10).map((ip: string, i: number) => (
                      <div key={i} className="p-2 bg-black/20 rounded-lg">{ip}</div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'subjects' && (
            <motion.div key="subjects" className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black tracking-tight">إدارة المواد</h2>
                <button 
                  onClick={() => {
                    const name = prompt('اسم المادة:');
                    if (name) addSubject(name);
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all"
                >
                  إضافة مادة
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {subjects.map(s => (
                  <div key={s.id} className="p-6 bg-zinc-900 border border-white/10 rounded-3xl space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-lg">{s.name}</h4>
                      <button onClick={() => deleteItem('subjects', s.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                        حذف
                      </button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">الوحدات</p>
                      <div className="flex flex-wrap gap-2">
                        {s.units.map((u, i) => (
                          <span key={i} className="px-3 py-1 bg-black/40 border border-white/5 rounded-full text-xs text-zinc-400">{u}</span>
                        ))}
                        <button 
                          onClick={() => {
                            const unit = prompt('اسم الوحدة:');
                            if (unit) addUnit(s.id, unit);
                          }}
                          className="px-3 py-1 border border-dashed border-white/20 rounded-full text-xs text-zinc-500 hover:text-white hover:border-white transition-all"
                        >
                          + إضافة وحدة
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'schedules' && (
            <motion.div key="schedules" className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black tracking-tight">إدارة الجداول</h2>
                <button 
                  onClick={() => {
                    const title = prompt('عنوان الجدول:');
                    const url = prompt('رابط الصورة:');
                    if (title && url) addSchedule(title, url);
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all"
                >
                  إضافة جدول
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {schedules.map(s => (
                  <div key={s.id} className="p-6 bg-zinc-900 border border-white/10 rounded-3xl space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-lg">{s.title}</h4>
                      <button onClick={() => deleteItem('schedules', s.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                        حذف
                      </button>
                    </div>
                    <img src={s.imageUrl} alt={s.title} className="w-full h-32 object-cover rounded-xl border border-white/5" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div key="notifications" className="space-y-8">
              <h2 className="text-3xl font-black tracking-tight">إرسال تنبيه</h2>
              <div className="p-8 bg-zinc-900 border border-white/10 rounded-3xl space-y-4">
                <textarea 
                  id="notif-msg"
                  placeholder="اكتب رسالة التنبيه هنا..."
                  className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-white outline-none focus:border-emerald-500/50 transition-all"
                />
                <button 
                  onClick={() => {
                    const msg = (document.getElementById('notif-msg') as HTMLTextAreaElement).value;
                    if (msg) {
                      sendNotification(msg);
                      (document.getElementById('notif-msg') as HTMLTextAreaElement).value = '';
                      alert('تم الإرسال!');
                    }
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold transition-all"
                >
                  إرسال للجميع
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'exams' && (
            <motion.div key="exams" className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black tracking-tight">إدارة الامتحانات</h2>
                <button 
                  onClick={() => {
                    const name = prompt('اسم الامتحان:');
                    const date = prompt('التاريخ (YYYY-MM-DD HH:mm):');
                    const desc = prompt('الوصف:');
                    if (name && date) addExam(name, date, desc || '');
                  }}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all"
                >
                  إضافة امتحان
                </button>
              </div>

              <div className="space-y-4">
                {exams.map(e => (
                  <div key={e.id} className="p-6 bg-zinc-900 border border-white/10 rounded-3xl flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-lg">{e.name}</h4>
                      <p className="text-zinc-500 text-sm font-mono">{e.targetDate}</p>
                    </div>
                    <button onClick={() => deleteItem('exams', e.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'uploads' && (
            <motion.div key="uploads" className="space-y-8">
              <h2 className="text-3xl font-black tracking-tight">رفع الملفات</h2>
              
              <div className="p-12 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center gap-6 bg-white/5">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                  <Download className="text-emerald-500" size={32} />
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold">اختر صورة أو ملف للرفع</p>
                  <p className="text-zinc-500 text-sm mt-1">سيتم تحويل الملف إلى رابط مباشر</p>
                </div>
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <label 
                  htmlFor="file-upload"
                  className={cn(
                    "px-8 py-3 bg-white text-black font-bold rounded-2xl cursor-pointer hover:bg-zinc-200 transition-all",
                    uploading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {uploading ? 'جاري الرفع...' : 'اختيار ملف'}
                </label>
              </div>

              {uploadedUrl && (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl">
                  <p className="text-emerald-500 text-sm font-bold mb-2 uppercase tracking-widest">تم الرفع بنجاح</p>
                  <div className="flex gap-4">
                    <input 
                      readOnly 
                      value={uploadedUrl} 
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl p-3 font-mono text-sm text-zinc-300"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(uploadedUrl);
                        alert('تم النسخ!');
                      }}
                      className="px-6 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition-all"
                    >
                      نسخ
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div key="logs" className="space-y-8">
              <h2 className="text-3xl font-black tracking-tight">سجلات النظام</h2>
              <div className="bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto">
                  {logs.map((log, i) => (
                    <div key={i} className="p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className={cn(
                          "text-[10px] uppercase font-bold px-2 py-0.5 rounded",
                          log.type === 'security' ? "bg-red-500/20 text-red-500" : "bg-blue-500/20 text-blue-500"
                        )}>
                          {log.type}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-300">{log.message}</p>
                      {log.details && <p className="text-[10px] text-zinc-600 mt-1 font-mono">{JSON.stringify(log.details)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const CountdownBox = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl min-w-[120px] shadow-2xl group transition-all hover:border-emerald-500/50">
    <span className="text-5xl md:text-7xl font-black text-white tabular-nums tracking-tighter group-hover:text-emerald-400 transition-colors">
      {String(value).padStart(2, '0')}
    </span>
    <div className="h-px w-8 bg-white/20 my-3 group-hover:w-12 group-hover:bg-emerald-500/50 transition-all" />
    <span className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-white/40 font-bold group-hover:text-white/60 transition-colors">
      {label}
    </span>
  </div>
);

const MaintenanceOverlay = () => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center"
  >
    <div className="absolute inset-0 opacity-20 pointer-events-none" 
      style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '24px 24px' }} 
    />
    <motion.div 
      animate={{ rotate: [0, 5, -5, 0] }}
      transition={{ repeat: Infinity, duration: 4 }}
      className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mb-8 border border-emerald-500/20"
    >
      <ShieldAlert size={48} className="text-emerald-500" />
    </motion.div>
    <h1 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight">الموقع في وضع الصيانة</h1>
    <p className="text-zinc-400 text-lg max-w-md leading-relaxed">
      نحن نقوم ببعض التحديثات والتحسينات لضمان أفضل تجربة لكم. سنعود قريباً جداً!
    </p>
    <div className="mt-12 flex gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-75" />
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse delay-150" />
    </div>
  </motion.div>
);

export default function App() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [settings, setSettings] = useState<Settings>({ backgroundUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1920', theme: 'glass' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [isAdminMode, setIsAdminMode] = useState(window.location.pathname === '/admin');

  useEffect(() => {
    const handlePopState = () => {
      setIsAdminMode(window.location.pathname === '/admin');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [page, setPage] = useState<'home' | 'about' | 'study' | 'schedules'>('home');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [presenceData, setPresenceData] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [userProgress, setUserProgress] = useState<{ [key: string]: UserProgress }>({});
  const [sessionId, setSessionId] = useState(localStorage.getItem('sessionId') || Math.random().toString(36).substring(7));
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('soundEnabled') !== 'false');

  // Sounds
  const [playClick] = useSound('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', { volume: 0.5, soundEnabled });
  const [playSuccess] = useSound('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3', { volume: 0.5, soundEnabled });
  const [playTransition] = useSound('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', { volume: 0.3, soundEnabled });

  useEffect(() => {
    localStorage.setItem('soundEnabled', String(soundEnabled));
  }, [soundEnabled]);

  const handlePageChange = (newPage: typeof page) => {
    playTransition();
    setPage(newPage);
  };

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    // Session ID for presence
    const sId = sessionId;
    localStorage.setItem('sessionId', sId);
    const presenceRef = doc(db, 'presence', sId);

    const updatePresence = async () => {
      try {
        // Fetch IP and location info
        let ip = 'Unknown';
        let governorate = 'Unknown';
        try {
          // Try ipapi.co first
          const res = await fetch('https://ipapi.co/json/').catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            ip = data.ip || 'Unknown';
            governorate = data.region || data.city || 'Unknown';
          } else {
            // Fallback 1: ipify for IP only
            const resIp = await fetch('https://api.ipify.org?format=json').catch(() => null);
            if (resIp && resIp.ok) {
              const data = await resIp.json();
              ip = data.ip || 'Unknown';
            }
          }
        } catch (e) {
          // Silent fail for location fetch - not critical for app functionality
        }

        await setDoc(presenceRef, { 
          id: sId, 
          lastSeen: serverTimestamp(),
          ip,
          governorate
        }, { merge: true });
      } catch (e) {
        console.error("Presence update failed", e);
      }
    };

    updatePresence();
    const heartbeat = setInterval(updatePresence, 30000); // Heartbeat every 30s

    // Cleanup presence on unmount
    const cleanup = async () => {
      clearInterval(heartbeat);
      try {
        await deleteDoc(presenceRef);
      } catch (e) {}
    };

    window.addEventListener('beforeunload', cleanup);

    // Listen for exams
    const qExams = query(collection(db, 'exams'), orderBy('targetDate', 'asc'));
    const unsubscribeExams = onSnapshot(qExams, (snapshot) => {
      const examsData = snapshot.docs.map(doc => doc.data() as Exam);
      setExams(examsData);
    });

    // Listen for settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'config'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as Settings);
      }
    });

    // Listen for notifications
    const qNotifs = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(1));
    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as Notification;
        setNotification(data);
        
        // Auto-hide notification after 10 seconds
        const timer = setTimeout(() => {
          setNotification(null);
        }, 10000);
        
        return () => clearTimeout(timer);
      }
    });

    // Listen for user count
    const unsubscribePresence = onSnapshot(collection(db, 'presence'), (snapshot) => {
      setUserCount(snapshot.size);
      setPresenceData(snapshot.docs.map(doc => doc.data()));
    });

    // Listen for subjects
    const unsubscribeSubjects = onSnapshot(collection(db, 'subjects'), (snapshot) => {
      setSubjects(snapshot.docs.map(doc => doc.data() as Subject));
    });

    // Listen for user progress
    const unsubscribeProgress = onSnapshot(collection(db, 'progress'), (snapshot) => {
      const progress: { [key: string]: UserProgress } = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as UserProgress;
        if (data.sessionId === sId) {
          progress[data.subjectId] = data;
        }
      });
      setUserProgress(progress);
    });

    // Listen for schedules
    const unsubscribeSchedules = onSnapshot(query(collection(db, 'schedules'), orderBy('timestamp', 'desc')), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => doc.data() as Schedule));
    });

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      unsubscribeExams();
      unsubscribeSettings();
      unsubscribeNotifs();
      unsubscribePresence();
      unsubscribeSubjects();
      unsubscribeProgress();
      unsubscribeSchedules();
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0) return;

    const timer = setInterval(() => {
      const target = new Date(exams[currentIndex].targetDate);
      const now = new Date();
      
      if (target > now) {
        const totalSeconds = differenceInSeconds(target, now);
        const days = Math.floor(totalSeconds / (24 * 3600));
        const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setTimeLeft(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [exams, currentIndex]);

  const nextExam = () => setCurrentIndex((prev) => (prev + 1) % exams.length);
  const prevExam = () => setCurrentIndex((prev) => (prev - 1 + exams.length) % exams.length);

  const toggleUnit = async (subjectId: string, unit: string) => {
    playClick();
    const current = userProgress[subjectId] || { sessionId, subjectId, completedUnits: [], studyHours: {} };
    const completed = [...current.completedUnits];
    const index = completed.indexOf(unit);
    if (index > -1) {
      completed.splice(index, 1);
    } else {
      completed.push(unit);
      playSuccess();
    }
    await setDoc(doc(db, 'progress', `${sessionId}_${subjectId}`), { ...current, completedUnits: completed }, { merge: true });
  };

  const downloadScheduleAsPDF = async (scheduleId: string, title: string) => {
    playClick();
    const element = document.getElementById(`schedule-${scheduleId}`);
    if (!element) return;

    try {
      const canvas = await html2canvas(element, { useCORS: true, scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${title}.pdf`);
      playSuccess();
    } catch (e) {
      console.error("PDF generation failed", e);
    }
  };

  const setHours = async (subjectId: string, unit: string, hours: number) => {
    const current = userProgress[subjectId] || { sessionId, subjectId, completedUnits: [], studyHours: {} };
    const studyHours = { ...current.studyHours, [unit]: hours };
    await setDoc(doc(db, 'progress', `${sessionId}_${subjectId}`), { ...current, studyHours }, { merge: true });
  };

  const getGovStats = () => {
    const stats: { [key: string]: number } = {};
    presenceData.forEach(p => {
      const gov = p.governorate || 'غير معروف';
      stats[gov] = (stats[gov] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const currentExam = exams[currentIndex];
  const fontClass = settings.fontFamily ? `font-${settings.fontFamily.toLowerCase()}` : 'font-sans';

  if (isAdminMode) {
    return <AdminDashboard onExit={() => {
      window.history.pushState({}, '', '/');
      setIsAdminMode(false);
    }} />;
  }

  return (
    <div 
      dir="rtl"
      className={cn(
        "min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center transition-all duration-1000",
        fontClass
      )}
      style={{
        backgroundImage: `url(${settings.backgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {settings.maintenanceMode && <MaintenanceOverlay />}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Header Controls */}
      <div className="absolute top-6 left-6 flex gap-3 z-20">
        <button 
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-3 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
          title={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button 
          onClick={() => handlePageChange(page === 'home' ? 'about' : 'home')}
          className={cn(
            "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
            page === 'about' ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
          )}
          title="من نحن"
        >
          <User size={20} />
        </button>
        <button 
          onClick={() => handlePageChange(page === 'home' ? 'study' : 'home')}
          className={cn(
            "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
            page === 'study' ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
          )}
          title="خطة الدراسة"
        >
          <BookOpen size={20} />
        </button>
        <button 
          onClick={() => handlePageChange(page === 'home' ? 'schedules' : 'home')}
          className={cn(
            "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
            page === 'schedules' ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
          )}
          title="الجداول الدراسية"
        >
          <FileText size={20} />
        </button>
        {page === 'home' && (
          <button 
            onClick={() => { playClick(); setViewMode(viewMode === 'single' ? 'grid' : 'single'); }}
            className="p-3 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
            title={viewMode === 'single' ? 'عرض الشبكة' : 'عرض منفرد'}
          >
            {viewMode === 'single' ? <LayoutGrid size={20} /> : <Maximize2 size={20} />}
          </button>
        )}
      </div>

      {/* Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-6"
          >
            <div className="bg-emerald-500/20 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
              <div className="p-2 bg-emerald-500 rounded-xl text-white">
                <Bell size={20} />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{notification.message}</p>
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="text-white/40 hover:text-white transition-colors"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl px-6 py-12">
        <AnimatePresence mode="wait">
          {page === 'about' ? (
            <motion.div 
              key="about-page"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start"
            >
              <div className="p-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[3rem] text-center shadow-2xl">
                <div className="mb-8 relative inline-block">
                  <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 rounded-full" />
                  <img 
                    src={settings.developerImageUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"} 
                    alt="Developer" 
                    className="w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-white/20 shadow-2xl object-cover relative z-10"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h2 className="text-3xl md:text-5xl font-black text-white mb-4 tracking-tight">
                  {settings.developerName || "اسم المطور"}
                </h2>
                <div className="h-1 w-12 bg-emerald-500 mx-auto mb-6 rounded-full" />
                <p className="text-zinc-300 text-lg leading-relaxed mb-8">
                  مرحباً بكم في منصتنا! نحن نسعى جاهدين لتوفير أفضل الأدوات للطلاب لمساعدتهم في تنظيم أوقاتهم والاستعداد للامتحانات بكل ثقة.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <h4 className="text-emerald-400 font-bold mb-1">الرؤية</h4>
                    <p className="text-xs text-zinc-400">تسهيل الوصول للمعلومات</p>
                  </div>
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <h4 className="text-emerald-400 font-bold mb-1">الهدف</h4>
                    <p className="text-xs text-zinc-400">دعم الطلاب في رحلتهم</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[3rem] shadow-2xl h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500">
                    <MapIcon size={20} />
                  </div>
                  <h3 className="text-2xl font-bold text-white">خريطة الزوار التفاعلية</h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getGovStats()} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={100} stroke="#888" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                        itemStyle={{ color: '#10b981' }}
                      />
                      <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                        {getGovStats().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`rgba(16, 185, 129, ${0.3 + (index * 0.1)})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-zinc-500 text-xs mt-4 text-center">توزيع الطلاب حسب المحافظات والمدن بشكل حي ومباشر.</p>
              </div>
            </motion.div>
          ) : page === 'study' ? (
            <motion.div 
              key="study-page"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <div className="text-center mb-4">
                <h2 className="text-4xl md:text-6xl font-black text-white mb-2">خطة الدراسة والتقدم</h2>
                <p className="text-zinc-400">تتبع تقدمك في المواد الدراسية وحدد ساعات المذاكرة لكل وحدة.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {subjects.length === 0 ? (
                  <div className="col-span-full p-12 bg-white/5 border border-white/10 rounded-[2rem] text-center">
                    <p className="text-zinc-500">لا توجد مواد دراسية مضافة حالياً. اطلب من المطور إضافتها عبر البوت.</p>
                  </div>
                ) : subjects.map((subject, sIdx) => {
                  const progress = userProgress[subject.id] || { completedUnits: [], studyHours: {} };
                  const percent = Math.round((progress.completedUnits.length / subject.units.length) * 100) || 0;
                  
                  return (
                    <motion.div 
                      key={`subject-${subject.id}-${sIdx}`}
                      className="p-8 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-xl"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-bold text-white">{subject.name}</h3>
                        <div className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold">
                          {percent}% مكتمل
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {subject.units.map((unit, uIdx) => {
                          const isDone = progress.completedUnits.includes(unit);
                          const hours = progress.studyHours[unit] || 0;
                          
                          return (
                            <div key={`${subject.id}-${unit}-${uIdx}`} className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 transition-all">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={() => toggleUnit(subject.id, unit)}
                                    className={cn(
                                      "p-1 rounded-md transition-all",
                                      isDone ? "bg-emerald-500 text-white" : "bg-white/10 text-white/20"
                                    )}
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                  <span className={cn("text-sm font-medium", isDone ? "text-white/40 line-through" : "text-white")}>
                                    {unit.startsWith('http') ? (
                                      <a href={unit} target="_blank" rel="noreferrer" className="text-emerald-400 underline hover:text-emerald-300 transition-colors">
                                        رابط المادة / الملف 📎
                                      </a>
                                    ) : unit}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 bg-black/20 px-3 py-1 rounded-lg">
                                  <Timer size={14} className="text-zinc-500" />
                                  <input 
                                    type="number" 
                                    min="0" 
                                    value={hours}
                                    onChange={(e) => setHours(subject.id, unit, parseInt(e.target.value) || 0)}
                                    className="bg-transparent text-white text-xs w-8 text-center focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-500">ساعة</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ) : page === 'schedules' ? (
            <motion.div 
              key="schedules-page"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col gap-8"
            >
              <div className="text-center mb-4">
                <h2 className="text-4xl md:text-6xl font-black text-white mb-2">الجداول الدراسية</h2>
                <p className="text-zinc-400">هنا تجد الجداول التي تساعدك في تنظيم وقتك. يمكنك تحميلها بصيغة PDF.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {schedules.length === 0 ? (
                  <div className="col-span-full p-12 bg-white/5 border border-white/10 rounded-[2rem] text-center">
                    <p className="text-zinc-500">لا توجد جداول دراسية مضافة حالياً.</p>
                  </div>
                ) : schedules.map((schedule, idx) => (
                  <motion.div 
                    key={schedule.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-6 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] shadow-xl group overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-white">{schedule.title}</h3>
                      <button 
                        onClick={() => downloadScheduleAsPDF(schedule.id, schedule.title)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20"
                      >
                        <Download size={16} />
                        تحميل PDF
                      </button>
                    </div>
                    <div 
                      id={`schedule-${schedule.id}`}
                      className="relative rounded-xl overflow-hidden border border-white/5 bg-zinc-900"
                    >
                      <img 
                        src={schedule.imageUrl} 
                        alt={schedule.title}
                        className="w-full h-auto object-contain max-h-[500px]"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : exams.length === 0 ? (
            <motion.div 
              key="no-exams-state"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center text-white"
            >
              <h1 className="text-4xl font-bold mb-4">لا توجد امتحانات مجدولة</h1>
              <p className="text-white/70">استخدم بوت التليجرام لإضافة موعد امتحان جديد.</p>
            </motion.div>
          ) : viewMode === 'single' ? (
            <motion.div 
              key={`single-${currentExam.id}-${currentIndex}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center"
            >
              <div className="text-center mb-12">
                {settings.overlayImageUrl && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mb-8 flex justify-center"
                  >
                    <img 
                      src={settings.overlayImageUrl} 
                      alt="Overlay" 
                      className="max-w-[200px] md:max-w-[300px] h-auto rounded-2xl shadow-2xl border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                )}
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-md rounded-full border border-white/20 text-white/80 text-sm mb-6"
                >
                  <Calendar size={14} />
                  <span>{new Date(currentExam.targetDate).toLocaleDateString('ar-EG', { dateStyle: 'long' })}</span>
                </motion.div>
                <h1 className="text-5xl md:text-8xl font-black text-white mb-4 tracking-tighter drop-shadow-2xl uppercase">
                  {currentExam.name}
                </h1>
                <p className="text-xl md:text-2xl text-white/80 font-light max-w-2xl mx-auto italic">
                  {currentExam.description || "بدأ العد التنازلي. حافظ على تركيزك واستمر في التقدم."}
                </p>
              </div>

              {timeLeft ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full max-w-4xl">
                  <CountdownBox value={timeLeft.days || 0} label="أيام" />
                  <CountdownBox value={timeLeft.hours || 0} label="ساعات" />
                  <CountdownBox value={timeLeft.minutes || 0} label="دقائق" />
                  <CountdownBox value={timeLeft.seconds || 0} label="ثواني" />
                </div>
              ) : (
                <div className="p-8 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 rounded-3xl text-center">
                  <h2 className="text-4xl font-bold text-white">بدأ الامتحان!</h2>
                  <p className="text-emerald-200 mt-2">بالتوفيق لجميع الطلاب.</p>
                </div>
              )}

              {/* Navigation */}
              {exams.length > 1 && (
                <div className="flex items-center gap-8 mt-16">
                  <button 
                    onClick={prevExam}
                    className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20 group"
                  >
                    <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                  <div className="flex gap-2">
                    {exams.map((_, idx) => (
                      <div 
                        key={idx}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all duration-300",
                          idx === currentIndex ? "bg-white w-6" : "bg-white/30"
                        )}
                      />
                    ))}
                  </div>
                  <button 
                    onClick={nextExam}
                    className="p-4 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20 group"
                  >
                    <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <div key="exams-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map((exam, idx) => (
                <motion.div 
                  key={`grid-exam-${exam.id}-${idx}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => { setCurrentIndex(idx); setViewMode('single'); }}
                  className="group cursor-pointer p-6 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-3xl transition-all hover:-translate-y-1"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-2xl font-bold text-white group-hover:text-emerald-300 transition-colors">{exam.name}</h3>
                    <Clock size={20} className="text-white/40" />
                  </div>
                  <p className="text-white/60 text-sm mb-6 line-clamp-2">{exam.description}</p>
                  <div className="flex items-center justify-between text-white/80 font-mono text-lg">
                    <span>{formatDistanceToNow(new Date(exam.targetDate), { addSuffix: true, locale: undefined })}</span>
                    <ChevronLeft size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-6 left-6 z-20 flex items-center gap-4">
         <p className="text-white/10 text-[10px] uppercase tracking-widest font-bold">
           &copy; {new Date().getFullYear()} نظام إدارة الامتحانات
         </p>
         <button 
           onClick={() => {
             window.history.pushState({}, '', '/admin');
             window.dispatchEvent(new PopStateEvent('popstate'));
           }}
           className="text-white/5 hover:text-white/20 transition-colors text-[10px] uppercase tracking-widest font-bold"
         >
           Admin
         </button>
      </div>
    </div>
  );
}
