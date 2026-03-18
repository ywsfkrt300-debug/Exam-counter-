import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from './firebase';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, ChevronRight, ChevronLeft, LayoutGrid, Maximize2, Bell, ShieldAlert, User, Home, Map as MapIcon, CheckCircle2, BookOpen, Timer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
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

interface UserProgress {
  sessionId: string;
  subjectId: string;
  completedUnits: string[];
  studyHours: { [key: string]: number };
}

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
  const [page, setPage] = useState<'home' | 'about' | 'study'>('home');
  const [notification, setNotification] = useState<Notification | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [presenceData, setPresenceData] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [userProgress, setUserProgress] = useState<{ [key: string]: UserProgress }>({});
  const [sessionId, setSessionId] = useState(localStorage.getItem('sessionId') || Math.random().toString(36).substring(7));

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
          const res = await fetch('https://ipapi.co/json/');
          const data = await res.json();
          ip = data.ip || 'Unknown';
          governorate = data.region || data.city || 'Unknown';
        } catch (e) {
          console.error("Location fetch failed", e);
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

    return () => {
      window.removeEventListener('beforeunload', cleanup);
      unsubscribeExams();
      unsubscribeSettings();
      unsubscribeNotifs();
      unsubscribePresence();
      unsubscribeSubjects();
      unsubscribeProgress();
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
    const current = userProgress[subjectId] || { sessionId, subjectId, completedUnits: [], studyHours: {} };
    const completed = [...current.completedUnits];
    const index = completed.indexOf(unit);
    if (index > -1) {
      completed.splice(index, 1);
    } else {
      completed.push(unit);
    }
    await setDoc(doc(db, 'progress', `${sessionId}_${subjectId}`), { ...current, completedUnits: completed }, { merge: true });
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

  return (
    <div 
      dir="rtl"
      className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center font-sans transition-all duration-1000"
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
          onClick={() => setPage(page === 'home' ? 'about' : 'home')}
          className={cn(
            "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
            page === 'about' ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
          )}
          title="من نحن"
        >
          <User size={20} />
        </button>
        <button 
          onClick={() => setPage(page === 'home' ? 'study' : 'home')}
          className={cn(
            "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
            page === 'study' ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
          )}
          title="خطة الدراسة"
        >
          <BookOpen size={20} />
        </button>
        {page === 'home' && (
          <button 
            onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
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
                ) : subjects.map(subject => {
                  const progress = userProgress[subject.id] || { completedUnits: [], studyHours: {} };
                  const percent = Math.round((progress.completedUnits.length / subject.units.length) * 100) || 0;
                  
                  return (
                    <motion.div 
                      key={subject.id}
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
                                    {unit}
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
          ) : exams.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-white"
            >
              <h1 className="text-4xl font-bold mb-4">لا توجد امتحانات مجدولة</h1>
              <p className="text-white/70">استخدم بوت التليجرام لإضافة موعد امتحان جديد.</p>
            </motion.div>
          ) : viewMode === 'single' ? (
            <motion.div 
              key={currentExam.id}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.map((exam, idx) => (
                <motion.div 
                  key={exam.id}
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

      <div className="absolute bottom-6 left-6 z-20">
         <p className="text-white/10 text-[10px] uppercase tracking-widest font-bold">
           &copy; {new Date().getFullYear()} نظام إدارة الامتحانات
         </p>
      </div>
    </div>
  );
}
