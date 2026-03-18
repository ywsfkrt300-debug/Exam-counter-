import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { db } from './firebase';
import { formatDistanceToNow, differenceInSeconds, intervalToDuration } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, Image as ImageIcon, Settings, ChevronRight, ChevronLeft, LayoutGrid, Maximize2 } from 'lucide-react';
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
}

const CountdownBox = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl min-w-[100px] shadow-xl">
    <span className="text-4xl md:text-6xl font-bold text-white tabular-nums">
      {String(value).padStart(2, '0')}
    </span>
    <span className="text-xs md:text-sm uppercase tracking-widest text-white/70 mt-1 font-bold">
      {label}
    </span>
  </div>
);

export default function App() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [settings, setSettings] = useState<Settings>({ backgroundUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&q=80&w=1920', theme: 'glass' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  useEffect(() => {
    // Listen for exams
    const q = query(collection(db, 'exams'), orderBy('targetDate', 'asc'));
    const unsubscribeExams = onSnapshot(q, (snapshot) => {
      const examsData = snapshot.docs.map(doc => doc.data() as Exam);
      setExams(examsData);
    });

    // Listen for settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'config'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as Settings);
      }
    });

    return () => {
      unsubscribeExams();
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0) return;

    const timer = setInterval(() => {
      const target = new Date(exams[currentIndex].targetDate);
      const now = new Date();
      
      if (target > now) {
        const duration = intervalToDuration({ start: now, end: target });
        setTimeLeft(duration);
      } else {
        setTimeLeft(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [exams, currentIndex]);

  const nextExam = () => setCurrentIndex((prev) => (prev + 1) % exams.length);
  const prevExam = () => setCurrentIndex((prev) => (prev - 1 + exams.length) % exams.length);

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
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Header Controls */}
      <div className="absolute top-6 left-6 flex gap-3 z-20">
        <button 
          onClick={() => setViewMode(viewMode === 'single' ? 'grid' : 'single')}
          className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/20"
          title={viewMode === 'single' ? 'عرض الشبكة' : 'عرض منفرد'}
        >
          {viewMode === 'single' ? <LayoutGrid size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl px-6 py-12">
        <AnimatePresence mode="wait">
          {exams.length === 0 ? (
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

      {/* Footer Info */}
      <div className="absolute bottom-6 right-6 flex items-center gap-4 z-20">
        <div className="flex flex-col">
          <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">الحالة</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-white/80 text-xs font-medium">تحديثات مباشرة نشطة</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 z-20">
         <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">
           المسؤول: استخدم بوت التليجرام للتحديث
         </p>
      </div>
    </div>
  );
}
