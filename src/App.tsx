import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp, limit, getDocFromServer, getDocs, addDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { signOut } from 'firebase/auth';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, Calendar, ChevronRight, ChevronLeft, LayoutGrid, Maximize2, Bell, ShieldAlert, User, Home, Map as MapIcon, CheckCircle2, BookOpen, Timer, Download, FileText, Volume2, VolumeX, Phone, Facebook, MessageCircle, ShieldCheck, Lock, FileWarning, Mail, X, ArrowRight, Shield, Menu, Sun, Moon, Ban, Trash2, Plus, CheckCircle, AlertCircle, Upload, Save, Megaphone, Printer, Share2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import useSound from 'use-sound';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useApp, Exam, Subject, Schedule, Settings, UserProgress } from './context/AppContext';

interface AppNotification {
  id: string;
  message: string;
  timestamp: any;
}

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PAGE_MAP: { [key: string]: 'home' | 'about' | 'study' | 'schedules' | 'admin' | 'contact' | 'privacy' | 'terms' } = {
  '/': 'home',
  '/الرئيسية': 'home',
  '/عن-الموقع': 'about',
  '/الدراسة': 'study',
  '/الجداول': 'schedules',
  '/لوحة-التحكم': 'admin',
  '/تواصل-معنا': 'contact',
  '/سياسة-الخصوصية': 'privacy',
  '/سياسة-الخصوصية/admin': 'admin',
  '/سياسة-الخصوصية-admin': 'admin',
  '/شروط-الخدمة': 'terms',
  '/admin': 'admin'
};

const REVERSE_PAGE_MAP: { [key: string]: string } = {
  'home': '/الرئيسية',
  'about': '/عن-الموقع',
  'study': '/الدراسة',
  'schedules': '/الجداول',
  'admin': '/لوحة-التحكم',
  'contact': '/تواصل-معنا',
  'privacy': '/سياسة-الخصوصية',
  'terms': '/شروط-الخدمة'
};

const ImageUploadButton = ({ onUpload, label = "رفع صورة", uploading }: { onUpload: (file: File) => void, label?: string, uploading: boolean }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input 
        type="file" 
        ref={fileInputRef}
        className="hidden" 
        onChange={handleFileChange}
        accept="image/*"
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs font-bold hover:bg-emerald-500/20 transition-all flex items-center gap-2 whitespace-nowrap"
        disabled={uploading}
      >
        <Upload size={14} />
        {uploading ? 'جاري الرفع...' : label}
      </button>
    </div>
  );
};

const AdminDashboard = ({ onExit }: { onExit: () => void }) => {
  const { settings, setSettings, subjects, exams, schedules, showToast } = useApp();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('stats');
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [presenceData, setPresenceData] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirm, setConfirm] = useState<{ message: string, onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (isLoggedIn) {
      fetchStats();
      fetchLogs();
      const unsubNotifs = onSnapshot(query(collection(db, 'notifications'), orderBy('timestamp', 'desc')), (snap) => {
        setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
        setPresenceData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => {
        unsubNotifs();
        unsubPresence();
      };
    }
  }, [isLoggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '33454') {
      setIsLoggedIn(true);
      setError('');
      showToast('تم تسجيل الدخول بنجاح');
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

  const handleFileUpload = async (file: File, callback?: (url: string) => void) => {
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (callback) {
        callback(url);
      } else {
        setUploadedUrl(url);
      }
      showToast('تم الرفع بنجاح');
    } catch (err) {
      console.error(err);
      showToast('فشل الرفع', 'error');
    } finally {
      setUploading(false);
    }
  };

  const addSubject = async (name: string, unitsCount: number) => {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const units = Array.from({ length: unitsCount }, (_, i) => `الوحدة ${i + 1}`);
    await setDoc(doc(db, 'subjects', id), { name, units });
  };

  const addExam = async (name: string, date: string, desc: string) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'exams', id), { name, targetDate: date, description: desc });
  };

  const addUnit = async (subjectId: string) => {
    const subject = subjects.find(s => s.id === subjectId);
    if (subject) {
      const nextUnitNumber = subject.units.length + 1;
      await setDoc(doc(db, 'subjects', subjectId), { 
        ...subject, 
        units: [...subject.units, `الوحدة ${nextUnitNumber}`] 
      });
    }
  };

  const addSchedule = async (title: string, imageUrl: string, fileType: 'image' | 'pdf' = 'image') => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'schedules', id), { title, imageUrl, fileType, timestamp: serverTimestamp() });
  };

  const sendNotification = async (message: string) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'notifications', id), { message, timestamp: serverTimestamp() });
  };

  const deleteItem = async (col: string, id: string) => {
    setConfirm({
      message: 'هل أنت متأكد من الحذف؟',
      onConfirm: async () => {
        await deleteDoc(doc(db, col, id));
        showToast('تم الحذف بنجاح');
      }
    });
  };

  const blockIp = async (ip: string) => {
    setConfirm({
      message: `هل أنت متأكد من حظر IP: ${ip}؟`,
      onConfirm: async () => {
        const newBlocked = [...(settings.blockedIPs || []), ip];
        await setDoc(doc(db, 'settings', 'config'), { ...settings, blockedIPs: newBlocked }, { merge: true });
        setSettings({ ...settings, blockedIPs: newBlocked });
        showToast('تم الحظر بنجاح');
      }
    });
  };

  const unblockIp = async (ip: string) => {
    setConfirm({
      message: `هل أنت متأكد من فك الحظر عن IP: ${ip}؟`,
      onConfirm: async () => {
        const newBlocked = (settings.blockedIPs || []).filter(b => b !== ip);
        await setDoc(doc(db, 'settings', 'config'), { ...settings, blockedIPs: newBlocked }, { merge: true });
        setSettings({ ...settings, blockedIPs: newBlocked });
        showToast('تم فك الحظر بنجاح');
      }
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Background Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-md p-10 bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] shadow-2xl relative z-10"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-6 border border-emerald-500/20 shadow-inner">
              <ShieldAlert className="text-emerald-500" size={40} />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">لوحة التحكم</h1>
            <p className="text-zinc-500 text-sm mt-2 font-medium">الوصول مقيد للمسؤولين فقط</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">كلمة المرور</label>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••"
                className="w-full p-5 bg-black/40 border border-white/10 rounded-2xl text-white text-center text-3xl tracking-[0.5em] focus:border-emerald-500/50 outline-none transition-all shadow-inner"
                autoFocus
              />
            </div>
            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-red-400 text-sm text-center font-bold"
              >
                {error}
              </motion.p>
            )}
            <button 
              type="submit"
              className="w-full p-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg rounded-2xl transition-all shadow-xl shadow-emerald-900/20 active:scale-[0.98]"
            >
              تسجيل الدخول
            </button>
          </form>
          <button 
            onClick={onExit} 
            className="w-full mt-6 text-zinc-500 hover:text-white transition-colors text-sm font-bold flex items-center justify-center gap-2"
          >
            <Home size={16} />
            العودة للموقع الرئيسي
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col lg:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-zinc-900 border-b border-white/10 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <LayoutGrid size={18} className="text-black" />
          </div>
          <span className="font-black tracking-tight">المدير</span>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-white">
          {isSidebarOpen ? <Maximize2 size={24} /> : <LayoutGrid size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-0 lg:relative lg:inset-auto z-40 w-full lg:w-72 bg-zinc-900/95 lg:bg-zinc-900 border-l border-white/10 p-6 flex flex-col gap-2 transition-transform duration-300 transform lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="hidden lg:flex items-center gap-3 mb-8 px-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <LayoutGrid size={18} className="text-black" />
          </div>
          <span className="font-black tracking-tight text-xl">لوحة التحكم</span>
        </div>

        <div className="flex flex-col gap-1 flex-1 overflow-y-auto pr-2">
          {[
            { id: 'stats', label: 'الإحصائيات', icon: BarChart },
            { id: 'subjects', label: 'المواد', icon: BookOpen },
            { id: 'exams', label: 'الامتحانات', icon: Clock },
            { id: 'schedules', label: 'الجداول', icon: Calendar },
            { id: 'notifications', label: 'التنبيهات', icon: Bell },
            { id: 'ads', label: 'الإعلانات', icon: Megaphone },
            { id: 'uploads', label: 'رفع الملفات', icon: Download },
            { id: 'logs', label: 'السجلات', icon: FileText },
            { id: 'security', label: 'الأمان والزوار', icon: Shield },
            { id: 'settings', label: 'الإعدادات', icon: Maximize2 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold",
                activeTab === tab.id 
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" 
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <button 
          onClick={onExit}
          className="mt-auto flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-2xl transition-all font-bold"
        >
          <Home size={20} />
          <span>الخروج للموقع</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 bg-zinc-950">
        <AnimatePresence mode="wait">
          {activeTab === 'stats' && (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                  { label: 'المتصلين الآن', value: stats?.activeUsers || 0, color: 'bg-blue-500', icon: User },
                  { label: 'إجمالي المواد', value: stats?.totalSubjects || 0, color: 'bg-emerald-500', icon: BookOpen },
                  { label: 'الامتحانات', value: stats?.totalExams || 0, color: 'bg-amber-500', icon: Clock },
                  { label: 'سجلات التقدم', value: stats?.progressCount || 0, color: 'bg-purple-500', icon: FileText },
                ].map((s, i) => (
                  <div key={i} className="p-8 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-xl relative overflow-hidden group hover:border-white/20 transition-all">
                    <div className={cn("absolute top-0 right-0 w-24 h-24 blur-[60px] opacity-20 transition-opacity group-hover:opacity-40", s.color)} />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <div className={cn("p-3 rounded-2xl text-white shadow-lg", s.color)}>
                          <s.icon size={20} />
                        </div>
                      </div>
                      <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mb-1">{s.label}</p>
                      <p className="text-4xl font-black tracking-tighter">{s.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2rem] shadow-xl">
                  <h3 className="text-xl font-bold mb-6">توزيع الطلاب حسب المحافظات</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Object.entries(stats?.governorates || {}).map(([name, value]) => ({ name, value }))}>
                        <XAxis dataKey="name" stroke="#52525b" fontSize={12} />
                        <YAxis stroke="#52525b" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '1rem' }}
                          itemStyle={{ color: '#fff' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {Object.entries(stats?.governorates || {}).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'][index % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2rem] shadow-xl overflow-hidden">
                  <h3 className="text-xl font-bold mb-6">عناوين IP النشطة</h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {stats?.ips?.map((ip: string, i: number) => (
                      <div key={i} className="p-3 bg-black/40 border border-white/5 rounded-xl text-sm font-mono text-zinc-400">
                        {ip}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'subjects' && (
            <motion.div 
              key="subjects"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-3xl font-black tracking-tight">إدارة المواد</h2>
                <button 
                  onClick={() => {
                    const name = prompt('اسم المادة:');
                    if (name) {
                      const countStr = prompt('كم وحدة ينقسم الكتاب؟');
                      const count = parseInt(countStr || '0', 10);
                      addSubject(name, isNaN(count) ? 0 : count);
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <BookOpen size={20} />
                  إضافة مادة
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {subjects.map(s => (
                  <div key={s.id} className="p-6 bg-zinc-900 border border-white/10 rounded-[2rem] space-y-6 shadow-xl hover:border-white/20 transition-all group">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-xl text-white group-hover:text-emerald-400 transition-colors">{s.name}</h4>
                      <button onClick={() => deleteItem('subjects', s.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                        حذف
                      </button>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">الوحدات الدراسية</p>
                      <div className="flex flex-wrap gap-2">
                        {s.units.map((u, i) => (
                          <span key={i} className="px-3 py-1.5 bg-black/40 border border-white/5 rounded-xl text-xs text-zinc-400 font-medium">{u}</span>
                        ))}
                        <button 
                          onClick={() => addUnit(s.id)}
                          className="px-3 py-1.5 border border-dashed border-white/20 rounded-xl text-xs text-zinc-500 hover:text-white hover:border-white transition-all"
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
            <motion.div 
              key="schedules"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-3xl font-black tracking-tight">إدارة الجداول</h2>
              </div>

              <div className="p-8 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] space-y-6 shadow-2xl">
                <h3 className="text-xl font-black">إضافة جدول جديد</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">عنوان الجدول</label>
                    <input 
                      type="text"
                      id="new-schedule-title"
                      placeholder="مثال: جدول امتحانات نصف السنة"
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">رابط الملف (PDF أو صورة)</label>
                      <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, (url) => {
                        const input = document.getElementById('new-schedule-url') as HTMLInputElement;
                        if (input) input.value = url;
                      })} label="رفع ملف" />
                    </div>
                    <input 
                      type="text"
                      id="new-schedule-url"
                      placeholder="أدخل الرابط أو ارفع ملفاً"
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm font-mono"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const titleInput = document.getElementById('new-schedule-title') as HTMLInputElement;
                    const urlInput = document.getElementById('new-schedule-url') as HTMLInputElement;
                    if (titleInput && urlInput && titleInput.value && urlInput.value) {
                      const fileType = urlInput.value.toLowerCase().includes('.pdf') ? 'pdf' : 'image';
                      addSchedule(titleInput.value, urlInput.value, fileType);
                      titleInput.value = '';
                      urlInput.value = '';
                      showToast('تم إضافة الجدول بنجاح');
                    } else {
                      showToast('يرجى ملء جميع الحقول', 'error');
                    }
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  حفظ الجدول الجديد
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {schedules.map(s => (
                  <div key={s.id} className="p-4 bg-zinc-900 border border-white/10 rounded-[2rem] space-y-4 shadow-xl overflow-hidden group">
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/5 bg-black/20 flex items-center justify-center">
                      {s.fileType === 'pdf' ? (
                        <div className="flex flex-col items-center justify-center text-emerald-500">
                          <FileText size={48} className="mb-2" />
                          <span className="font-bold text-sm">ملف PDF</span>
                        </div>
                      ) : (
                        <img src={s.imageUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                        <h4 className="font-bold text-lg text-white">{s.title}</h4>
                        <div className="flex gap-2">
                          {s.fileType === 'pdf' && (
                            <a href={s.imageUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-500/20 hover:bg-blue-500 text-blue-500 hover:text-white rounded-xl transition-all backdrop-blur-md">
                              <Download size={16} />
                            </a>
                          )}
                          <button onClick={() => deleteItem('schedules', s.id)} className="p-2 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all backdrop-blur-md">
                            حذف
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div 
              key="notifications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center">
                <h2 className="text-3xl font-black tracking-tight mb-2">إرسال تنبيه عام</h2>
                <p className="text-zinc-500">سيظهر هذا التنبيه لجميع المستخدمين المتصلين حالياً.</p>
              </div>
              <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2.5rem] space-y-6 shadow-2xl">
                <div className="space-y-2">
                  <label className="text-xs font-black text-zinc-500 uppercase tracking-widest px-2">محتوى الرسالة</label>
                  <textarea 
                    id="notif-msg"
                    placeholder="اكتب رسالة التنبيه هنا..."
                    className="w-full h-48 bg-black/40 border border-white/10 rounded-3xl p-6 text-white outline-none focus:border-emerald-500/50 transition-all resize-none text-lg"
                  />
                </div>
                <button 
                  onClick={() => {
                    const msg = (document.getElementById('notif-msg') as HTMLTextAreaElement).value;
                    if (msg) {
                      sendNotification(msg);
                      (document.getElementById('notif-msg') as HTMLTextAreaElement).value = '';
                      alert('تم إرسال التنبيه بنجاح!');
                    }
                  }}
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 rounded-3xl font-black text-xl transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3"
                >
                  <Bell size={24} />
                  إرسال للجميع
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xl font-black">التنبيهات السابقة</h3>
                  {notifications.length > 0 && (
                    <button 
                      onClick={async () => {
                        if (window.confirm('هل أنت متأكد من حذف جميع التنبيهات؟')) {
                          for (const n of notifications) {
                            await deleteDoc(doc(db, 'notifications', n.id));
                          }
                        }
                      }}
                      className="text-xs font-black text-red-500 uppercase tracking-widest hover:underline"
                    >
                      حذف الكل
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div key={n.id} className="p-4 bg-zinc-900 border border-white/10 rounded-2xl flex justify-between items-center gap-4 group">
                      <p className="text-zinc-300 text-sm flex-1">{n.message}</p>
                      <button 
                        onClick={() => deleteItem('notifications', n.id)}
                        className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all flex-shrink-0"
                        title="حذف التنبيه"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="p-8 bg-zinc-900/50 border border-dashed border-white/10 rounded-[2rem] text-center">
                      <p className="text-zinc-500">لا توجد تنبيهات سابقة</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'exams' && (
            <motion.div 
              key="exams"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-3xl font-black tracking-tight">إدارة الامتحانات</h2>
              </div>

              <div className="p-8 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] space-y-6 shadow-2xl">
                <h3 className="text-xl font-black">إضافة امتحان جديد</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">اسم الامتحان</label>
                    <input 
                      type="text"
                      id="new-exam-name"
                      placeholder="مثال: امتحان اللغة العربية"
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">التاريخ والوقت</label>
                    <input 
                      type="datetime-local"
                      id="new-exam-date"
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">الوصف</label>
                    <textarea 
                      id="new-exam-desc"
                      placeholder="وصف بسيط للامتحان..."
                      className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm h-24 resize-none"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const nameInput = document.getElementById('new-exam-name') as HTMLInputElement;
                    const dateInput = document.getElementById('new-exam-date') as HTMLInputElement;
                    const descInput = document.getElementById('new-exam-desc') as HTMLTextAreaElement;
                    if (nameInput && dateInput && nameInput.value && dateInput.value) {
                      addExam(nameInput.value, dateInput.value, descInput.value || '');
                      nameInput.value = '';
                      dateInput.value = '';
                      descInput.value = '';
                      showToast('تم إضافة الامتحان بنجاح');
                    } else {
                      showToast('يرجى ملء الاسم والتاريخ', 'error');
                    }
                  }}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  حفظ الامتحان الجديد
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {exams.map(e => (
                  <div key={e.id} className="p-6 bg-zinc-900 border border-white/10 rounded-[2rem] space-y-4 shadow-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-xl">{e.name}</h4>
                        <p className="text-zinc-500 text-sm font-mono mt-1">{e.targetDate}</p>
                      </div>
                      <button onClick={() => deleteItem('exams', e.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                        حذف
                      </button>
                    </div>
                    <p className="text-zinc-400 text-sm line-clamp-2">{e.description || 'لا يوجد وصف'}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'uploads' && (
            <motion.div 
              key="uploads"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="text-center">
                <h2 className="text-3xl font-black tracking-tight mb-2">رفع الملفات</h2>
                <p className="text-zinc-500">ارفع الصور والملفات للحصول على روابط مباشرة لاستخدامها في الموقع.</p>
              </div>
              
              <div className="p-12 border-2 border-dashed border-white/10 rounded-[3rem] flex flex-col items-center justify-center gap-8 bg-zinc-900/50 hover:bg-zinc-900 transition-all group">
                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform duration-500">
                  <Download className="text-emerald-500" size={40} />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-black">اسحب الملفات هنا أو انقر للاختيار</p>
                  <p className="text-zinc-500 font-medium">يدعم الصور، PDF، والملفات النصية</p>
                </div>
                <ImageUploadButton 
                  uploading={uploading} 
                  onUpload={(file) => handleFileUpload(file)} 
                  label="اختيار ملف للرفع"
                />
              </div>

              {uploadedUrl && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] shadow-2xl"
                >
                  <p className="text-emerald-500 text-xs font-black mb-4 uppercase tracking-widest px-2">تم الرفع بنجاح</p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <input 
                      readOnly 
                      value={uploadedUrl} 
                      className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-sm text-zinc-300 outline-none"
                    />
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(uploadedUrl);
                        alert('تم نسخ الرابط بنجاح!');
                      }}
                      className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black transition-all shadow-lg shadow-emerald-500/20"
                    >
                      نسخ الرابط
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div 
              key="logs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <h2 className="text-3xl font-black tracking-tight">سجلات النظام</h2>
              <div className="bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="max-h-[600px] overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="p-20 text-center text-zinc-500 font-bold">لا توجد سجلات حالياً.</div>
                  ) : logs.map((log, i) => (
                    <div key={i} className="p-6 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <span className={cn(
                          "text-[10px] uppercase font-black px-3 py-1 rounded-full tracking-widest",
                          log.type === 'security' ? "bg-red-500/20 text-red-500" : "bg-blue-500/20 text-blue-500"
                        )}>
                          {log.type || 'system'}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono group-hover:text-zinc-300 transition-colors">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ar-EG') : 'N/A'}
                        </span>
                      </div>
                      <p className="text-zinc-200 font-bold">{log.message || log.action}</p>
                      {log.details && <p className="text-[10px] text-zinc-600 mt-2 font-mono bg-black/20 p-2 rounded-lg">{JSON.stringify(log.details)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div 
              key="security"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <Shield className="text-emerald-500" size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white">الأمان والزوار</h2>
                  <p className="text-zinc-500 text-sm">مراقبة الأجهزة المتصلة وإدارة الحظر</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Active Visitors */}
                <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <User size={20} className="text-emerald-500" />
                      الزوار النشطون
                    </h3>
                    <span className="bg-emerald-500/20 text-emerald-500 px-3 py-1 rounded-full text-sm font-bold">
                      {presenceData.length} متصل
                    </span>
                  </div>
                  
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {presenceData.map((p, i) => {
                      const isBlocked = settings.blockedIPs?.includes(p.ip);
                      return (
                        <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm text-emerald-400">{p.ip}</span>
                              {isBlocked && <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-bold">محظور</span>}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-2">
                              <MapIcon size={12} /> {p.governorate || 'غير معروف'}
                              <span className="text-white/20">•</span>
                              <Clock size={12} /> {p.lastSeen?.toDate ? formatDistanceToNow(p.lastSeen.toDate(), { addSuffix: true }) : 'الآن'}
                            </div>
                          </div>
                          {!isBlocked && (
                            <button 
                              onClick={() => blockIp(p.ip)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                              title="حظر هذا الجهاز"
                            >
                              <Ban size={18} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {presenceData.length === 0 && (
                      <div className="text-center py-8 text-zinc-500">لا يوجد زوار نشطون حالياً</div>
                    )}
                  </div>
                </div>

                {/* Blocked IPs */}
                <div className="bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <Ban size={20} className="text-red-500" />
                      الأجهزة المحظورة
                    </h3>
                    <span className="bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-sm font-bold">
                      {(settings.blockedIPs || []).length} محظور
                    </span>
                  </div>
                  
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {(settings.blockedIPs || []).map((ip, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-red-500/10">
                        <span className="font-mono text-sm text-red-400">{ip}</span>
                        <button 
                          onClick={() => unblockIp(ip)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all"
                        >
                          فك الحظر
                        </button>
                      </div>
                    ))}
                    {(!settings.blockedIPs || settings.blockedIPs.length === 0) && (
                      <div className="text-center py-8 text-zinc-500">لا توجد أجهزة محظورة</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'ads' && (
            <motion.div 
              key="ads"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-3xl font-black tracking-tight">إدارة الإعلانات</h2>
                <button 
                  onClick={() => {
                    const text = prompt('نص الإعلان:');
                    if (text) {
                      const link = prompt('رابط الإعلان (اختياري):');
                      const newAd = { id: Date.now().toString(), text, link, active: true };
                      const newAds = [...(settings.ads || []), newAd];
                      setSettings({ ...settings, ads: newAds });
                      setDoc(doc(db, 'settings', 'config'), { ads: newAds }, { merge: true });
                      showToast('تم إضافة الإعلان بنجاح');
                    }
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <Megaphone size={20} />
                  إضافة إعلان
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(settings.ads || []).map((ad: any) => (
                  <div key={ad.id} className="p-6 bg-zinc-900 border border-white/10 rounded-[2rem] space-y-4 shadow-xl">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-bold text-lg">{ad.text}</p>
                        {ad.link && <p className="text-xs text-zinc-500 font-mono truncate max-w-[200px]">{ad.link}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const newAds = settings.ads?.map((a: any) => a.id === ad.id ? { ...a, active: !a.active } : a);
                            setSettings({ ...settings, ads: newAds });
                            setDoc(doc(db, 'settings', 'config'), { ads: newAds }, { merge: true });
                          }}
                          className={cn("p-2 rounded-xl transition-all", ad.active ? "text-emerald-500 bg-emerald-500/10" : "text-zinc-500 bg-zinc-500/10")}
                        >
                          {ad.active ? <CheckCircle size={16} /> : <Ban size={16} />}
                        </button>
                        <button 
                          onClick={() => {
                            const newAds = settings.ads?.filter((a: any) => a.id !== ad.id);
                            setSettings({ ...settings, ads: newAds });
                            setDoc(doc(db, 'settings', 'config'), { ads: newAds }, { merge: true });
                            showToast('تم حذف الإعلان');
                          }}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-3xl font-black tracking-tight">إعدادات النظام</h2>
                <button 
                  onClick={async () => {
                    try {
                      await setDoc(doc(db, 'settings', 'config'), settings);
                      localStorage.setItem('appSettings', JSON.stringify(settings));
                      showToast('تم حفظ جميع الإعدادات بنجاح');
                    } catch (err) {
                      showToast('فشل حفظ الإعدادات', 'error');
                    }
                  }}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  <Save size={20} />
                  حفظ التغييرات
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-8 bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[2.5rem] space-y-8 shadow-2xl">
                  <h3 className="text-xl font-black flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg">
                      <Maximize2 size={20} className="text-emerald-500" />
                    </div>
                    المظهر العام
                  </h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">رابط الخلفية</label>
                        <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (url) => {
                          const newSettings = { ...settings, backgroundUrl: url };
                          setSettings(newSettings);
                          await setDoc(doc(db, 'settings', 'config'), newSettings);
                        })} />
                      </div>
                      <input 
                        type="text"
                        value={settings.backgroundUrl || ''}
                        onChange={(e) => setSettings({ ...settings, backgroundUrl: e.target.value })}
                        className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                      />
                      {settings.backgroundUrl && (
                        <div className="mt-2 relative aspect-video rounded-xl overflow-hidden border border-white/10">
                          <img src={settings.backgroundUrl} alt="Background Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">رابط الصورة العلوية الرئيسية</label>
                        <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (url) => {
                          const newSettings = { ...settings, overlayImageUrl: url };
                          setSettings(newSettings);
                          await setDoc(doc(db, 'settings', 'config'), newSettings);
                        })} />
                      </div>
                      <input 
                        type="text"
                        value={settings.overlayImageUrl || ''}
                        onChange={(e) => setSettings({ ...settings, overlayImageUrl: e.target.value })}
                        className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                        placeholder="رابط الصورة التي تظهر فوق عداد الامتحان"
                      />
                      {settings.overlayImageUrl && (
                        <div className="mt-2 relative h-32 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center">
                          <img src={settings.overlayImageUrl} alt="Overlay Preview" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">نص البنر المتحرك</label>
                      <input 
                        type="text"
                        value={settings.scrollingBannerText || ''}
                        onChange={(e) => setSettings({ ...settings, scrollingBannerText: e.target.value })}
                        className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-bold text-sm"
                        placeholder="أدخل النص الذي سيظهر في البنر المتحرك أعلى الصفحة"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">روابط الصور العلوية الإضافية (سلايدر)</label>
                        <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (url) => {
                          const newUrls = [...(settings.overlayImageUrls || []), url];
                          const newSettings = { ...settings, overlayImageUrls: newUrls };
                          setSettings(newSettings);
                          await setDoc(doc(db, 'settings', 'config'), newSettings);
                        })} label="رفع وإضافة صورة" />
                      </div>
                      <div className="space-y-2">
                        {(settings.overlayImageUrls || []).map((url, index) => (
                          <div key={index} className="space-y-2">
                            <div className="flex gap-2">
                              <div className="flex-1 space-y-1">
                                <input
                                  type="text"
                                  value={url}
                                  onChange={(e) => {
                                    const newUrls = [...(settings.overlayImageUrls || [])];
                                    newUrls[index] = e.target.value;
                                    setSettings({ ...settings, overlayImageUrls: newUrls });
                                  }}
                                  className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                                />
                              </div>
                              <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (uploadedUrl) => {
                                const newUrls = [...(settings.overlayImageUrls || [])];
                                newUrls[index] = uploadedUrl;
                                const newSettings = { ...settings, overlayImageUrls: newUrls };
                                setSettings(newSettings);
                                await setDoc(doc(db, 'settings', 'config'), newSettings);
                              })} label="تغيير" />
                              <button
                                onClick={async () => {
                                  const newUrls = (settings.overlayImageUrls || []).filter((_, i) => i !== index);
                                  const newSettings = { ...settings, overlayImageUrls: newUrls };
                                  setSettings(newSettings);
                                  await setDoc(doc(db, 'settings', 'config'), newSettings);
                                }}
                                className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all"
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                            {url && (
                              <div className="relative h-24 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center">
                                <img src={url} alt={`Preview ${index + 1}`} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">رابط صورة التحميل</label>
                        <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (url) => {
                          const newSettings = { ...settings, loadingImageUrl: url };
                          setSettings(newSettings);
                          await setDoc(doc(db, 'settings', 'config'), newSettings);
                        })} />
                      </div>
                      <input 
                        type="text"
                        value={settings.loadingImageUrl || ''}
                        onChange={(e) => setSettings({ ...settings, loadingImageUrl: e.target.value })}
                        className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                        placeholder="اتركه فارغاً لاستخدام دائرة التحميل الافتراضية"
                      />
                      {settings.loadingImageUrl && (
                        <div className="mt-2 relative h-24 w-24 rounded-xl overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center">
                          <img src={settings.loadingImageUrl} alt="Loading Preview" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">رابط فيسبوك</label>
                        <input 
                          type="text"
                          value={settings.facebookUrl || ''}
                          onChange={(e) => setSettings({ ...settings, facebookUrl: e.target.value })}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">رابط واتساب</label>
                        <input 
                          type="text"
                          value={settings.whatsappUrl || ''}
                          onChange={(e) => setSettings({ ...settings, whatsappUrl: e.target.value })}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">سياسة الخصوصية</label>
                      <textarea 
                        value={settings.privacyPolicy || ''}
                        onChange={(e) => setSettings({ ...settings, privacyPolicy: e.target.value })}
                        className="w-full h-32 p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">شروط الخدمة</label>
                      <textarea 
                        value={settings.termsOfService || ''}
                        onChange={(e) => setSettings({ ...settings, termsOfService: e.target.value })}
                        className="w-full h-32 p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-2">اسم المطور</label>
                        <input 
                          type="text"
                          value={settings.developerName}
                          onChange={(e) => setSettings({ ...settings, developerName: e.target.value })}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">رابط صورة المطور</label>
                          <ImageUploadButton uploading={uploading} onUpload={(file) => handleFileUpload(file, async (url) => {
                            const newSettings = { ...settings, developerImageUrl: url };
                            setSettings(newSettings);
                            await setDoc(doc(db, 'settings', 'config'), newSettings);
                          })} />
                        </div>
                        <input 
                          type="text"
                          value={settings.developerImageUrl}
                          onChange={(e) => setSettings({ ...settings, developerImageUrl: e.target.value })}
                          className="w-full p-4 bg-black/40 border border-white/10 rounded-2xl text-white outline-none focus:border-emerald-500/50 transition-all font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-zinc-900 border border-white/10 rounded-[2.5rem] space-y-8 shadow-2xl">
                  <h3 className="text-xl font-black flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <ShieldAlert size={20} className="text-amber-500" />
                    </div>
                    حالة الموقع
                  </h3>
                  <div className="flex items-center justify-between p-6 bg-black/40 border border-white/10 rounded-3xl">
                    <div className="space-y-1">
                      <span className="font-black block">وضع الصيانة</span>
                      <span className="text-xs text-zinc-500">تعطيل الوصول للمستخدمين</span>
                    </div>
                    <button 
                      onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                      className={cn(
                        "w-16 h-9 rounded-full transition-all relative p-1",
                        settings.maintenanceMode ? "bg-amber-500" : "bg-zinc-700"
                      )}
                    >
                      <div className={cn(
                        "w-7 h-7 bg-white rounded-full transition-all shadow-md",
                        settings.maintenanceMode ? "translate-x-0" : "translate-x-7"
                      )} />
                    </button>
                  </div>
                  <button 
                    onClick={async () => {
                      await setDoc(doc(db, 'settings', 'config'), settings);
                      showToast('تم حفظ الإعدادات بنجاح!');
                    }}
                    className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 rounded-3xl font-black text-lg transition-all shadow-xl shadow-emerald-500/20"
                  >
                    حفظ الإعدادات
                  </button>
                </div>
              </div>

              {/* Toast Notification */}
              <AnimatePresence>
                {toast && (
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 50 }}
                    className={cn(
                      "fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-[100] font-bold text-white flex items-center gap-3",
                      toast.type === 'success' ? "bg-emerald-600" : "bg-red-600"
                    )}
                  >
                    {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {toast.message}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Confirmation Modal */}
              <AnimatePresence>
                {confirm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full text-center space-y-6 shadow-2xl"
                    >
                      <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle size={32} className="text-red-500" />
                      </div>
                      <p className="text-xl font-bold">{confirm.message}</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setConfirm(null)}
                          className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={() => {
                            confirm.onConfirm();
                            setConfirm(null);
                          }}
                          className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-bold transition-all"
                        >
                          تأكيد
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const CountdownBox = ({ value, label, color }: { value: number; label: string; color?: string }) => {
  const formattedValue = String(value).padStart(2, '0');
  
  return (
    <div className="flex flex-col items-center gap-4 group/unit">
      <div className="relative h-32 w-28 md:h-48 md:w-40 [perspective:1000px] rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        
        {/* Top Half */}
        <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden bg-black/60 backdrop-blur-2xl rounded-t-[2rem] border-x border-t border-white/10">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={value}
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: -90, opacity: 0 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
              style={{ transformOrigin: "bottom", backfaceVisibility: "hidden" }}
              className="absolute top-0 left-0 w-full h-[200%] flex items-center justify-center"
            >
              <div className={cn(
                "text-6xl md:text-8xl font-black bg-gradient-to-br bg-clip-text text-transparent",
                color || "from-white to-zinc-500"
              )}>
                {formattedValue}
              </div>
            </motion.div>
          </AnimatePresence>
          {/* Glossy overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
        </div>

        {/* Bottom Half */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 overflow-hidden bg-black/60 backdrop-blur-2xl rounded-b-[2rem] border-x border-b border-white/10">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={value}
              initial={{ rotateX: -90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: 90, opacity: 0 }}
              transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
              style={{ transformOrigin: "top", backfaceVisibility: "hidden" }}
              className="absolute bottom-0 left-0 w-full h-[200%] flex items-center justify-center"
            >
              <div className={cn(
                "text-6xl md:text-8xl font-black bg-gradient-to-br bg-clip-text text-transparent",
                color || "from-white to-zinc-500"
              )}>
                {formattedValue}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Center split line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-black/80 -translate-y-1/2 z-20 shadow-[0_1px_0_rgba(255,255,255,0.1)]" />
      </div>
      <span className="text-[10px] md:text-xs font-black text-zinc-500 uppercase tracking-[0.3em] group-hover/unit:text-white transition-colors">{label}</span>
    </div>
  );
};

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

const ContactUs = ({ settings }: { settings: Settings }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="max-w-4xl mx-auto space-y-8 p-6"
  >
    <div className="text-center space-y-4">
      <h1 className="text-4xl font-bold text-white drop-shadow-lg">تواصل معنا</h1>
      <p className="text-zinc-300 text-lg">نحن هنا لمساعدتك في أي وقت. تواصل مع المطور عبر القنوات التالية:</p>
    </div>

    <div className="grid md:grid-cols-2 gap-6">
      {settings.facebookUrl && (
        <a
          href={settings.facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-6 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
        >
          <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
            <Facebook className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-black text-white text-xl">فيسبوك</h3>
            <p className="text-sm text-zinc-400">تابعنا للحصول على آخر التحديثات</p>
          </div>
        </a>
      )}

      {settings.whatsappUrl && (
        <a
          href={`https://wa.me/${settings.whatsappUrl.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-6 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all group"
        >
          <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <MessageCircle className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-black text-white text-xl">واتساب</h3>
            <p className="text-sm text-zinc-400">تواصل مباشر وسريع</p>
          </div>
        </a>
      )}
    </div>

    <div className="bg-white/5 backdrop-blur-md rounded-[2.5rem] p-10 text-center space-y-6 border border-white/10">
      <div className="w-20 h-20 bg-indigo-500/20 rounded-3xl flex items-center justify-center text-indigo-400 mx-auto">
        <Mail className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h3 className="text-2xl font-black text-white">هل لديك استفسار آخر؟</h3>
        <p className="text-zinc-400 text-lg">يمكنك مراسلتنا عبر البريد الإلكتروني أو من خلال وسائل التواصل أعلاه.</p>
      </div>
      <button className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-indigo-600/20">
        إرسال بريد إلكتروني
      </button>
    </div>
  </motion.div>
);

const MarqueeAds = ({ ads }: { ads: any[] }) => {
  const activeAds = ads?.filter(ad => ad.active) || [];
  if (activeAds.length === 0) return null;

  return (
    <div className="w-full bg-emerald-500/10 border-y border-emerald-500/20 py-2 overflow-hidden mb-8">
      <div className="flex whitespace-nowrap animate-marquee">
        {activeAds.map((ad, i) => (
          <div key={i} className="flex items-center gap-4 px-8">
            <Megaphone size={16} className="text-emerald-400" />
            <span className="text-sm font-bold text-emerald-100">
              {ad.link ? (
                <a href={ad.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {ad.text}
                </a>
              ) : ad.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PolicyPage = ({ title, content }: { title: string; content: string }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="max-w-4xl mx-auto p-6"
  >
    <div className="bg-black/40 backdrop-blur-3xl rounded-[3rem] border border-white/10 p-8 md:p-16 shadow-2xl">
      <div className="flex items-center gap-4 mb-10 pb-6 border-b border-white/10">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">{title}</h1>
      </div>
      <div className="prose prose-invert max-w-none whitespace-pre-wrap text-zinc-300 leading-relaxed text-lg">
        {content || "سيتم إضافة المحتوى قريباً..."}
      </div>
    </div>
  </motion.div>
);

export default function App() {
  const { 
    settings, setSettings, 
    exams, subjects, schedules, 
    userProgress, setUserProgress, 
    isAppLoading, 
    isAdminMode, setIsAdminMode,
    page, setPage,
    showToast,
    toggleFavorite,
    connectionStatus
  } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [sessionId] = useState(() => localStorage.getItem('sessionId') || Math.random().toString(36).substring(7));
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [userIp, setUserIp] = useState<string>('');
  const [userGov, setUserGov] = useState<string>('');
  const [aboutStats, setAboutStats] = useState<{ count: number, govs: any[] }>({ count: 0, govs: [] });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const [showPrivacyBanner, setShowPrivacyBanner] = useState(() => {
    return localStorage.getItem('privacyAccepted') !== 'true';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  const [playClick] = useSound('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', { volume: 0.5, soundEnabled });
  const [playSuccess] = useSound('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3', { volume: 0.5, soundEnabled });
  const [playTransition] = useSound('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3', { volume: 0.3, soundEnabled });

  useEffect(() => {
    const handlePopState = () => {
      const path = decodeURIComponent(window.location.pathname);
      const mappedPage = PAGE_MAP[path] || 'home';
      if (mappedPage === 'admin') {
        setIsAdminMode(true);
      } else {
        setIsAdminMode(false);
        setPage(mappedPage as any);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePageChange = (newPage: typeof page) => {
    playTransition();
    setPage(newPage);
    const newPath = REVERSE_PAGE_MAP[newPage] || '/';
    window.history.pushState({}, '', newPath);
    const pageTitle = newPage === 'home' ? 'الرئيسية' : newPage === 'about' ? 'من نحن' : newPage === 'study' ? 'الدراسة' : 'الجداول';
    document.title = `نظام الامتحانات - ${pageTitle}`;
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

    let cachedIp = sessionStorage.getItem('userIp');
    let cachedGov = sessionStorage.getItem('userGov');

    const updatePresence = async () => {
      try {
        let ip = cachedIp || 'Unknown';
        let governorate = cachedGov || 'Unknown';

        if (!cachedIp) {
          try {
            const res = await fetch('https://ipapi.co/json/').catch(() => null);
            if (res && res.ok) {
              const data = await res.json();
              ip = data.ip || 'Unknown';
              governorate = data.region || data.city || 'Unknown';
            } else {
              const resIp = await fetch('https://api.ipify.org?format=json').catch(() => null);
              if (resIp && resIp.ok) {
                const data = await resIp.json();
                ip = data.ip || 'Unknown';
              }
            }
            sessionStorage.setItem('userIp', ip);
            sessionStorage.setItem('userGov', governorate);
            cachedIp = ip;
            cachedGov = governorate;
          } catch (e) {}
        }

        setUserIp(ip);
        setUserGov(governorate);

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
    const heartbeat = setInterval(updatePresence, 300000); // Heartbeat every 5 minutes

    // Cleanup presence on unmount
    const cleanup = async () => {
      try {
        await deleteDoc(presenceRef);
      } catch (e) {}
    };

    window.addEventListener('beforeunload', cleanup);

    const unsubNotifs = onSnapshot(query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(10)), (snap) => {
      const notifs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
      setNotifications(notifs);
      if (notifs.length > 0) {
        setNotification(notifs[0]);
        const timer = setTimeout(() => setNotification(null), 10000);
        return () => clearTimeout(timer);
      }
    });

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('beforeunload', cleanup);
      unsubNotifs();
    };
  }, [sessionId]);

  // Fetch about stats when page is 'about'
  useEffect(() => {
    if (page === 'about') {
      const fetchAboutStats = async () => {
        try {
          const presenceSnap = await getDocs(collection(db, 'presence'));
          const stats: { [key: string]: number } = {};
          presenceSnap.docs.forEach(doc => {
            const gov = doc.data().governorate || 'غير معروف';
            stats[gov] = (stats[gov] || 0) + 1;
          });
          const govs = Object.entries(stats).map(([name, value]) => ({ name, value }));
          setAboutStats({ count: presenceSnap.size, govs });
        } catch (e) {
          console.error("Failed to fetch about stats", e);
        }
      };
      fetchAboutStats();
    }
  }, [page]);

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
    if (!userProgress) return;
    playClick();
    const unitKey = `${subjectId}-${unit}`;
    const completedUnits = userProgress.completedUnits.includes(unitKey)
      ? userProgress.completedUnits.filter(u => u !== unitKey)
      : [...userProgress.completedUnits, unitKey];
    
    const newProgress = { ...userProgress, completedUnits };
    setUserProgress(newProgress);
    await setDoc(doc(db, 'progress', sessionId), newProgress);
    if (!userProgress.completedUnits.includes(unitKey)) {
      playSuccess();
    }
  };

  const downloadSchedule = async (schedule: Schedule) => {
    playClick();
    try {
      const response = await fetch(schedule.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      let ext = schedule.fileType === 'pdf' ? 'pdf' : 'png';
      if (schedule.fileType !== 'pdf') {
        if (blob.type.includes('jpeg') || blob.type.includes('jpg')) ext = 'jpg';
        else if (blob.type.includes('png')) ext = 'png';
        else if (blob.type.includes('webp')) ext = 'webp';
      }
      
      link.download = `${schedule.title}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      playSuccess();
    } catch (e) {
      console.error("Download failed", e);
      window.open(schedule.imageUrl, '_blank');
      playSuccess();
    }
  };

  const setHours = async (subjectId: string, unit: string, hours: number) => {
    if (!userProgress) return;
    const newProgress = {
      ...userProgress,
      studyHours: { ...userProgress.studyHours, [`${subjectId}-${unit}`]: hours }
    };
    setUserProgress(newProgress);
    await setDoc(doc(db, 'progress', sessionId), newProgress);
  };

  const currentExam = exams[currentIndex];
  const fontClass = settings.fontFamily ? `font-${settings.fontFamily.toLowerCase()}` : 'font-sans';

  if (isAppLoading) {
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
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          {settings.loadingImageUrl ? (
            <img src={settings.loadingImageUrl} alt="Loading..." className="w-32 h-32 object-contain animate-pulse" />
          ) : (
            <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          )}
          <p className="text-zinc-400 font-medium animate-pulse">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (settings?.blockedIPs?.includes(userIp) && !isAdminMode) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="w-full max-w-md p-10 bg-zinc-900/80 backdrop-blur-2xl border border-red-500/20 rounded-[2.5rem] shadow-2xl relative z-10 text-center space-y-6">
          <div className="w-24 h-24 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto border border-red-500/20 shadow-inner">
            <Ban className="text-red-500" size={48} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">تم حظر وصولك</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            لقد تم حظر عنوان IP الخاص بك من الوصول إلى هذا الموقع. إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع الإدارة.
          </p>
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-zinc-500 font-mono">IP: {userIp}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAdminMode) {
    return <AdminDashboard 
      onExit={() => {
        window.history.pushState({}, '', '/الرئيسية');
        setIsAdminMode(false);
        setPage('home');
      }} 
    />;
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
      {settings.scrollingBannerText && (
        <div className="w-full bg-emerald-600/20 backdrop-blur-md border-b border-white/10 overflow-hidden py-2 relative z-[100]">
          <motion.div
            animate={{ x: ["100%", "-100%"] }}
            transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
            className="whitespace-nowrap text-white font-black text-sm flex items-center gap-8"
          >
            <span>{settings.scrollingBannerText}</span>
            <span>{settings.scrollingBannerText}</span>
            <span>{settings.scrollingBannerText}</span>
            <span>{settings.scrollingBannerText}</span>
          </motion.div>
        </div>
      )}
      {settings.maintenanceMode && <MaintenanceOverlay />}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Header Controls */}
      <div className="absolute top-6 left-6 flex items-center gap-3 z-50">
        {/* Notification Icon */}
        <div className="relative">
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-3 bg-white/5 backdrop-blur-md rounded-full text-white transition-all border border-white/10 hover:bg-white/10"
            title="الإشعارات"
          >
            <Bell size={20} />
            {notification && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            )}
          </button>
        </div>

        {connectionStatus === 'error' && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-full text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
            <ShieldAlert size={12} />
            خطأ في الاتصال
          </div>
        )}

        {/* Notifications Panel */}
        <AnimatePresence>
          {isNotificationsOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute top-full mt-4 left-0 w-80 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-4 shadow-2xl flex flex-col gap-4 z-50"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">التنبيهات</h3>
                <button onClick={() => setIsNotificationsOpen(false)} className="text-white/50 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div key={notif.id} className="p-3 bg-white/5 rounded-2xl text-sm text-white/80">
                      {notif.message}
                    </div>
                  ))
                ) : (
                  <p className="text-center text-white/50 py-4">لا توجد تنبيهات جديدة</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn(
              "p-3 backdrop-blur-md rounded-full text-white transition-all border border-white/10",
              isMenuOpen ? "bg-emerald-500 border-emerald-500" : "bg-white/5 hover:bg-white/10"
            )}
            title="القائمة"
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute top-full mt-4 left-0 w-64 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-3xl p-4 shadow-2xl flex flex-col gap-2"
              >
                {[
                  { id: 'home', label: 'الرئيسية', icon: Home },
                  { id: 'study', label: 'الدراسة', icon: BookOpen },
                  { id: 'schedules', label: 'الجداول', icon: Calendar },
                  { id: 'about', label: 'من نحن', icon: User },
                  { id: 'contact', label: 'تواصل معنا', icon: Phone },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { handlePageChange(item.id as any); setIsMenuOpen(false); }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                      page === item.id ? "bg-emerald-500/20 text-emerald-400" : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                ))}

                <div className="h-px w-full bg-white/10 my-2" />

                {[
                  { id: 'privacy', label: 'سياسة الخصوصية', icon: Shield },
                  { id: 'terms', label: 'شروط الاستخدام', icon: FileText },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { handlePageChange(item.id as any); setIsMenuOpen(false); }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all",
                      page === item.id ? "bg-emerald-500/20 text-emerald-400" : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                ))}

                <div className="h-px w-full bg-white/10 my-2" />

                <button
                  onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setIsMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
                </button>

                <button
                  onClick={() => { setSoundEnabled(!soundEnabled); setIsMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-white/70 hover:bg-white/5 hover:text-white transition-all"
                >
                  {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  {soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl px-6 py-12">
        {/* Top Banner Images */}
        {(settings.overlayImageUrl || (settings.overlayImageUrls && settings.overlayImageUrls.length > 0)) && (
          <div className="mb-12 space-y-6">
            {settings.overlayImageUrl && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl group relative"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <img 
                  src={settings.overlayImageUrl} 
                  alt="Primary Banner" 
                  className="w-full h-auto object-cover max-h-[400px]"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            )}
            {settings.overlayImageUrls && settings.overlayImageUrls.map((url, index) => (
              url && url !== settings.overlayImageUrl && (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl group relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <img 
                    src={url} 
                    alt={`Banner ${index + 1}`} 
                    className="w-full h-auto object-cover max-h-[400px]"
                    referrerPolicy="no-referrer"
                  />
                </motion.div>
              )
            ))}
          </div>
        )}

        <MarqueeAds ads={settings.ads || []} />

        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex flex-col gap-2"
          >
            <h1 className="text-4xl md:text-5xl font-black tracking-tight">
              {userProgress && userProgress.completedUnits.length > 0 ? 'مرحباً بعودتك!' : 'أهلاً بك في نظام الامتحانات'}
            </h1>
            <p className="text-zinc-400 font-bold">
              {userIp ? `نحن نراك من ${userIp} - نتمنى لك دراسة ممتعة` : 'نتمنى لك دراسة ممتعة وموفقة'}
            </p>
          </motion.div>
        </div>
        
        <AnimatePresence mode="wait">
          {page === 'contact' ? (
            <ContactUs settings={settings} />
          ) : page === 'privacy' ? (
            <PolicyPage title="سياسة الخصوصية" content={settings.privacyPolicy} />
          ) : page === 'terms' ? (
            <PolicyPage title="شروط الاستخدام" content={settings.termsOfService} />
          ) : page === 'about' ? (
            <motion.div 
              key="about-page"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
            >
              <div className="lg:col-span-5 p-8 md:p-12 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3rem] text-center shadow-2xl relative overflow-hidden group flex flex-col justify-center">
                <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="mb-8 relative inline-block mx-auto">
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 6 }}
                    className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 rounded-full" 
                  />
                  <img 
                    src={settings.developerImageUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"} 
                    alt="Developer" 
                    className="w-48 h-48 md:w-64 md:h-64 rounded-full border-8 border-white/10 shadow-2xl object-cover relative z-10 hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <h2 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tight">
                  {settings.developerName || "اسم المطور"}
                </h2>
                <div className="h-1.5 w-20 bg-emerald-500 mx-auto mb-8 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.6)]" />
                <p className="text-zinc-300 text-lg md:text-xl leading-relaxed mb-10 font-medium">
                  مرحباً بكم في منصتنا! نحن نسعى جاهدين لتوفير أفضل الأدوات للطلاب لمساعدتهم في تنظيم أوقاتهم والاستعداد للامتحانات بكل ثقة واحترافية.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'الرؤية', sub: 'تسهيل الوصول', icon: Maximize2 },
                    { label: 'الهدف', sub: 'دعم الطلاب', icon: ShieldAlert }
                  ].map((item, i) => (
                    <div key={i} className="p-5 bg-white/5 rounded-[2rem] border border-white/5 hover:border-emerald-500/30 transition-all group/card">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-3 group-hover/card:bg-emerald-500 group-hover/card:text-white transition-all">
                        <item.icon size={20} className="text-emerald-500 group-hover/card:text-white" />
                      </div>
                      <h4 className="text-white font-black text-sm mb-1">{item.label}</h4>
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{item.sub}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 p-8 md:p-12 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-2xl flex flex-col">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-500 shadow-lg shadow-emerald-500/10">
                      <MapIcon size={24} />
                    </div>
                    <h3 className="text-3xl font-black text-white tracking-tight">خريطة الزوار</h3>
                  </div>
                  <div className="px-4 py-2 bg-white/5 rounded-full border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    مباشر الآن
                  </div>
                </div>
                <div className="flex-1 min-h-[400px] w-full bg-black/20 rounded-[2.5rem] p-6 border border-white/5 relative group">
                  <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={aboutStats.govs} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        stroke="#71717a" 
                        fontSize={12} 
                        fontWeight="900"
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(9, 9, 11, 0.95)', 
                          border: '1px solid rgba(255, 255, 255, 0.1)', 
                          borderRadius: '24px',
                          backdropFilter: 'blur(12px)',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                          padding: '16px'
                        }}
                        itemStyle={{ color: '#10b981', fontWeight: '900', fontSize: '14px' }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                      />
                      <Bar dataKey="value" radius={[0, 20, 20, 0]} barSize={24}>
                        {aboutStats.govs.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={`rgba(16, 185, 129, ${0.3 + (index * 0.15)})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {[
                    { label: 'المتصلين', value: aboutStats.count, icon: User },
                    { label: 'المحافظات', value: aboutStats.govs.length, icon: MapIcon },
                    { label: 'التفاعل', value: 'عالي', icon: Bell }
                  ].map((stat, i) => (
                    <div key={i} className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                      <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">{stat.label}</p>
                      <p className="text-xl font-black text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : page === 'study' ? (
            <motion.div 
              key="study-page"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="flex flex-col gap-12"
            >
              <div className="text-center max-w-3xl mx-auto">
                <h2 className="text-5xl md:text-7xl font-black text-white mb-4 tracking-tight leading-tight">خطة الدراسة والتقدم</h2>
                <p className="text-zinc-400 text-xl font-medium">تتبع تقدمك في المواد الدراسية، حدد ساعات المذاكرة، وراقب إنجازاتك اليومية.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {subjects.length === 0 ? (
                  <div className="col-span-full p-24 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] text-center shadow-2xl">
                    <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                      <BookOpen size={40} className="text-zinc-600" />
                    </div>
                    <p className="text-zinc-500 text-xl font-bold">لا توجد مواد دراسية مضافة حالياً. يرجى مراجعة الإدارة.</p>
                  </div>
                ) : subjects.map((subject, sIdx) => {
                  const completedUnits = userProgress?.completedUnits.filter(u => u.startsWith(`${subject.id}-`)) || [];
                  const percent = Math.round((completedUnits.length / subject.units.length) * 100) || 0;
                  
                  return (
                    <motion.div 
                      key={`subject-${subject.id}-${sIdx}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: sIdx * 0.1 }}
                      className="p-10 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] shadow-2xl hover:border-emerald-500/30 transition-all group"
                    >
                      <div className="flex justify-between items-center mb-10">
                        <div className="space-y-1">
                          <h3 className="text-3xl font-black text-white group-hover:text-emerald-400 transition-colors">{subject.name}</h3>
                          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{subject.units.length} وحدات دراسية</p>
                        </div>
                        <div className="relative w-20 h-20">
                          <svg className="w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                            <circle 
                              cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="8" 
                              className="text-emerald-500 transition-all duration-1000 ease-out"
                              strokeDasharray={226}
                              strokeDashoffset={226 - (226 * percent) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-white">
                            {percent}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        {subject.units.map((unit, uIdx) => {
                          const unitKey = `${subject.id}-${unit}`;
                          const isDone = userProgress?.completedUnits.includes(unitKey);
                          const hours = userProgress?.studyHours[unitKey] || 0;
                          
                          return (
                            <div key={`${subject.id}-${unit}-${uIdx}`} className="flex flex-col gap-4 p-6 bg-white/5 rounded-[2rem] border border-white/5 hover:border-emerald-500/20 transition-all group/unit">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <button 
                                    onClick={() => toggleUnit(subject.id, unit)}
                                    className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 shadow-lg",
                                      isDone ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-white/10 text-white/20 hover:bg-white/20"
                                    )}
                                  >
                                    <CheckCircle2 size={22} className={cn(isDone ? "scale-100" : "scale-75")} />
                                  </button>
                                  <span className={cn("text-lg font-bold transition-all duration-500", isDone ? "text-white/30 line-through" : "text-white")}>
                                    {unit.startsWith('http') ? (
                                      <a href={unit} target="_blank" rel="noreferrer" className="text-emerald-400 underline hover:text-emerald-300 transition-colors flex items-center gap-2">
                                        رابط المادة / الملف <Download size={16} />
                                      </a>
                                    ) : unit}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-2xl border border-white/5 group-hover/unit:border-emerald-500/30 transition-all">
                                  <Timer size={16} className="text-emerald-500" />
                                  <div className="flex items-center gap-1">
                                    <input 
                                      type="number" 
                                      min="0" 
                                      value={hours}
                                      onChange={(e) => setHours(subject.id, unit, parseInt(e.target.value) || 0)}
                                      className="bg-transparent text-white font-black text-sm w-10 text-center focus:outline-none"
                                    />
                                    <span className="text-[10px] text-zinc-500 font-black uppercase">ساعة</span>
                                  </div>
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
              className="flex flex-col gap-12"
            >
              <div className="text-center max-w-3xl mx-auto">
                <h2 className="text-5xl md:text-7xl font-black text-white mb-4 tracking-tight leading-tight">الجداول الدراسية</h2>
                <p className="text-zinc-400 text-xl font-medium">نظم وقتك بذكاء مع جداولنا المنسقة. حملها واستخدمها في أي وقت.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {schedules.length === 0 ? (
                  <div className="col-span-full p-24 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] text-center shadow-2xl">
                    <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                      <FileText size={40} className="text-zinc-600" />
                    </div>
                    <p className="text-zinc-500 text-xl font-bold">لا توجد جداول دراسية متاحة حالياً.</p>
                  </div>
                ) : schedules.map((schedule, idx) => (
                  <motion.div 
                    key={schedule.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-8 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[3.5rem] shadow-2xl group overflow-hidden hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex justify-between items-center mb-8">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-black text-white group-hover:text-emerald-400 transition-colors">{schedule.title}</h3>
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">تاريخ الإضافة: {schedule.timestamp?.toDate ? schedule.timestamp.toDate().toLocaleDateString('ar-EG') : 'N/A'}</p>
                      </div>
                      <button 
                        onClick={() => downloadSchedule(schedule)}
                        className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-black transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
                      >
                        <Download size={18} />
                        تحميل الملف
                      </button>
                    </div>
                    <div 
                      id={`schedule-${schedule.id}`}
                      className="relative rounded-[2rem] overflow-hidden border border-white/10 bg-zinc-950 shadow-inner group/img flex items-center justify-center min-h-[300px]"
                    >
                      <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      {schedule.fileType === 'pdf' ? (
                        <div className="flex flex-col items-center justify-center text-emerald-500 p-12">
                          <FileText size={80} className="mb-4 opacity-80" />
                          <span className="font-bold text-xl text-white">ملف PDF</span>
                          <span className="text-zinc-500 text-sm mt-2">انقر على زر التحميل لعرض الملف</span>
                        </div>
                      ) : (
                        <img 
                          src={schedule.imageUrl} 
                          alt={schedule.title}
                          className="w-full h-auto object-contain max-h-[600px] transition-transform duration-700 group-hover/img:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* HOME PAGE */
            exams.length === 0 ? (
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
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, y: -20 }}
              transition={{ type: "spring", damping: 20, stiffness: 100 }}
              className="flex flex-col items-center gap-16"
            >
              <div className="text-center space-y-8 max-w-4xl relative">
                {settings.overlayImageUrl && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    className="mb-12 flex justify-center relative"
                  >
                    <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full" />
                    <img 
                      src={settings.overlayImageUrl} 
                      alt="Overlay" 
                      className="max-w-[220px] md:max-w-[340px] h-auto rounded-[3rem] shadow-2xl border border-white/10 relative z-10 hover:scale-105 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                )}
                
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl"
                  >
                    <Calendar size={14} className="text-emerald-400" />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                      موعد الامتحان: {new Date(currentExam.targetDate).toLocaleDateString('ar-EG', { dateStyle: 'full' })}
                    </span>
                  </motion.div>
                  
                  <h1 className="text-6xl md:text-9xl font-black text-white tracking-tighter leading-[0.9] drop-shadow-[0_20px_20px_rgba(0,0,0,0.5)] uppercase">
                    {currentExam.name}
                  </h1>
                  
                  <p className="text-zinc-400 text-xl md:text-2xl font-medium leading-relaxed max-w-2xl mx-auto drop-shadow-lg">
                    {currentExam.description || "بدأ العد التنازلي. حافظ على تركيزك واستمر في التقدم نحو النجاح."}
                  </p>
                </div>
              </div>

              {timeLeft ? (
                <div className="w-full flex flex-col items-center gap-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 w-full max-w-5xl">
                    <CountdownBox value={timeLeft.days || 0} label="أيام" color="from-emerald-400 to-emerald-600" />
                    <CountdownBox value={timeLeft.hours || 0} label="ساعات" color="from-indigo-400 to-indigo-600" />
                    <CountdownBox value={timeLeft.minutes || 0} label="دقائق" color="from-purple-400 to-purple-600" />
                    <CountdownBox value={timeLeft.seconds || 0} label="ثواني" color="from-pink-400 to-pink-600" />
                  </div>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => window.print()}
                      className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center gap-2 transition-all"
                    >
                      <Printer size={18} /> طباعة
                    </button>
                    <button 
                      onClick={() => {
                        const messages = [
                          "باقي القليل، استعد للنجاح! 🚀",
                          "العداد لا يتوقف، هل أنت جاهز؟ 🔥",
                          "كل لحظة تقربك من هدفك. بالتوفيق! 🎯",
                          "استغل الوقت، فالتميز ينتظرك. ✨"
                        ];
                        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
                        navigator.share({
                          title: 'العد التنازلي للامتحان',
                          text: `${randomMsg}\nالزمن المتبقي لـ ${currentExam.name}: ${timeLeft.days} يوم، ${timeLeft.hours} ساعة، ${timeLeft.minutes} دقيقة.`,
                          url: window.location.href
                        }).catch(() => {});
                      }}
                      className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center gap-2 transition-all"
                    >
                      <Share2 size={18} /> مشاركة
                    </button>
                  </div>
                </div>
              ) : (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="p-16 bg-emerald-500/20 backdrop-blur-3xl border border-emerald-500/40 rounded-[4rem] text-center shadow-2xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-emerald-500/10 animate-pulse" />
                  <div className="relative z-10 space-y-4">
                    <h2 className="text-6xl md:text-8xl font-black text-white tracking-tight">بدأ الامتحان!</h2>
                    <p className="text-emerald-200 text-2xl font-bold">كل التوفيق لجميع الطلاب في مسيرتهم.</p>
                  </div>
                </motion.div>
              )}

              {/* Navigation & Actions */}
              <div className="flex flex-col items-center gap-12 w-full max-w-5xl">
                {exams.length > 1 && (
                  <div className="flex items-center gap-10">
                    <button 
                      onClick={prevExam}
                      className="p-5 bg-white/5 hover:bg-emerald-500 backdrop-blur-xl rounded-full text-white transition-all border border-white/10 group shadow-xl hover:shadow-emerald-500/20 active:scale-95"
                    >
                      <ChevronRight size={28} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <div className="flex gap-3">
                      {exams.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setCurrentIndex(idx)}
                          className={cn(
                            "h-2 rounded-full transition-all duration-700",
                            idx === currentIndex ? "bg-emerald-500 w-12 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "bg-white/10 w-3 hover:bg-white/30"
                          )}
                        />
                      ))}
                    </div>
                    <button 
                      onClick={nextExam}
                      className="p-5 bg-white/5 hover:bg-emerald-500 backdrop-blur-xl rounded-full text-white transition-all border border-white/10 group shadow-xl hover:shadow-emerald-500/20 active:scale-95"
                    >
                      <ChevronLeft size={28} className="group-hover:-translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                  {[
                    { label: 'ابدأ الدراسة', icon: BookOpen, page: 'study', color: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20' },
                    { label: 'عرض الجداول', icon: Calendar, page: 'schedules', color: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' },
                    { label: 'من نحن', icon: User, page: 'about', color: 'bg-zinc-800 hover:bg-zinc-700 shadow-zinc-800/20' }
                  ].map((btn, i) => (
                    <button
                      key={i}
                      onClick={() => handlePageChange(btn.page as any)}
                      className={cn(
                        "flex items-center justify-center gap-4 p-8 rounded-[2.5rem] text-white font-black text-xl transition-all shadow-2xl hover:-translate-y-2 group",
                        btn.color
                      )}
                    >
                      <btn.icon size={28} className="group-hover:scale-110 transition-transform" />
                      <span>{btn.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div key="exams-grid" className="flex flex-col gap-12">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {exams.map((exam, idx) => (
                <motion.div 
                  key={`grid-exam-${exam.id}-${idx}`}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1, type: "spring" }}
                  onClick={() => { setCurrentIndex(idx); setViewMode('single'); }}
                  className="group cursor-pointer p-8 bg-black/40 hover:bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] transition-all hover:-translate-y-2 shadow-2xl hover:border-emerald-500/50"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                      <Clock size={24} />
                    </div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
                      {new Date(exam.targetDate).getFullYear()}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 group-hover:text-emerald-400 transition-colors">{exam.name}</h3>
                  <p className="text-zinc-400 text-sm mb-8 line-clamp-3 leading-relaxed font-medium">{exam.description}</p>
                  <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <span className="text-white/90 font-black text-lg">
                      {formatDistanceToNow(new Date(exam.targetDate), { addSuffix: true, locale: undefined })}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-emerald-500 transition-all">
                      <ChevronLeft size={20} className="text-white" />
                    </div>
                  </div>
                </motion.div>
              ))}
              </div>
            </div>
          )
        )}
      </AnimatePresence>
    </div>

      <div className="absolute bottom-0 left-0 w-full z-20 p-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-gradient-to-t from-black/80 to-transparent backdrop-blur-[2px]">
        <div className="flex items-center gap-6 text-xs font-bold text-white/60">
          <button onClick={() => handlePageChange('privacy')} className="hover:text-white transition-colors flex items-center gap-2"><Shield size={14} /> سياسة الخصوصية</button>
          <button onClick={() => handlePageChange('terms')} className="hover:text-white transition-colors flex items-center gap-2"><FileText size={14} /> شروط الاستخدام</button>
          <button onClick={() => handlePageChange('contact')} className="hover:text-white transition-colors flex items-center gap-2"><Phone size={14} /> تواصل معنا</button>
        </div>
        
        <div className="flex items-center gap-4">
          <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
            &copy; {new Date().getFullYear()} {settings.siteName || "نظام إدارة الامتحانات"}
          </p>
          <div className="w-1 h-1 rounded-full bg-white/20 hidden md:block" />
          <button 
            onClick={() => {
              window.history.pushState({}, '', '/لوحة-التحكم');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-white/20 hover:text-white/60 transition-colors text-[10px] uppercase tracking-widest font-bold flex items-center gap-1"
          >
            <LayoutGrid size={12} />
            Admin
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showPrivacyBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[400px] z-[100] bg-zinc-900/95 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-500">
                <Shield size={24} />
              </div>
              <div className="flex-1">
                <h4 className="text-white font-bold mb-2">سياسة الخصوصية وتتبع الموقع</h4>
                <p className="text-zinc-400 text-sm leading-relaxed mb-4">
                  نحن نستخدم خدمات لتحديد موقعك الجغرافي (مثل ipapi) لأغراض الإحصائيات وتحسين تجربة الاستخدام. باستخدامك للموقع، فإنك توافق على ذلك.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      localStorage.setItem('privacyAccepted', 'true');
                      setShowPrivacyBanner(false);
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all"
                  >
                    موافق
                  </button>
                  <button
                    onClick={() => handlePageChange('privacy')}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-sm transition-all"
                  >
                    اقرأ المزيد
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
