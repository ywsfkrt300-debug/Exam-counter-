import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore';
import { db } from '../firebase';

export interface Exam {
  id: string;
  name: string;
  targetDate: string;
  description?: string;
}

export interface Subject {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  units?: string[];
}

export interface Schedule {
  id: string;
  title: string;
  content: string;
  timestamp: any;
  imageUrl?: string;
  fileType?: string;
}

export interface Ad {
  id: string;
  text: string;
  link?: string;
  active: boolean;
}

export interface Settings {
  backgroundUrl?: string;
  theme?: string;
  maintenanceMode?: boolean;
  overlayImageUrl?: string;
  overlayImageUrls?: string[];
  scrollingBannerText?: string;
  developerName?: string;
  developerImageUrl?: string;
  loadingImageUrl?: string;
  primaryColor?: string;
  fontFamily?: string;
  privacyPolicy?: string;
  termsOfService?: string;
  blockedIPs?: string[];
  ads?: Ad[];
  facebookUrl?: string;
  whatsappUrl?: string;
}

export interface UserProgress {
  sessionId: string;
  subjectId?: string;
  completedUnits: string[];
  studyHours: { [key: string]: number };
  favorites?: string[];
}

interface AppContextType {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  exams: Exam[];
  subjects: Subject[];
  schedules: Schedule[];
  userProgress: UserProgress;
  setUserProgress: React.Dispatch<React.SetStateAction<UserProgress>>;
  isAppLoading: boolean;
  isAdminMode: boolean;
  setIsAdminMode: (val: boolean) => void;
  page: string;
  setPage: (page: any) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  toggleFavorite: (subjectId: string) => void;
  connectionStatus: 'connected' | 'error';
  userCount: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : { theme: 'dark', primaryColor: '#10b981' };
  });

  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [page, setPage] = useState('home');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'error'>('connected');
  const [userCount, setUserCount] = useState(0);

  const [userProgress, setUserProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('userProgress');
    if (saved) return JSON.parse(saved);
    return {
      sessionId: Math.random().toString(36).substring(7),
      completedUnits: [],
      studyHours: {}
    };
  });

  useEffect(() => {
    localStorage.setItem('userProgress', JSON.stringify(userProgress));
  }, [userProgress]);

  useEffect(() => {
    const unsubExams = onSnapshot(collection(db, 'exams'), (snap) => {
      setExams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exam)));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'config'), (snap) => {
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...snap.data() }));
      }
      setIsAppLoading(false);
    });

    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      setSubjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subject)));
    });

    const unsubSchedules = onSnapshot(query(collection(db, 'schedules'), orderBy('timestamp', 'desc')), (snap) => {
      setSchedules(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
    });

    const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
      setUserCount(snap.size);
    });

    return () => {
      unsubExams();
      unsubSettings();
      unsubSubjects();
      unsubSchedules();
      unsubPresence();
    };
  }, []);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    // This will be implemented in App.tsx or a separate Toast component
    // For now, we just log it or use a custom event
    const event = new CustomEvent('app-toast', { detail: { msg, type } });
    window.dispatchEvent(event);
  }, []);

  const toggleFavorite = useCallback((subjectId: string) => {
    setUserProgress(prev => {
      const favorites = prev.favorites || [];
      const newFavorites = favorites.includes(subjectId)
        ? favorites.filter(id => id !== subjectId)
        : [...favorites, subjectId];
      return { ...prev, favorites: newFavorites };
    });
  }, []);

  return (
    <AppContext.Provider value={{
      settings, setSettings,
      exams, subjects, schedules,
      userProgress, setUserProgress,
      isAppLoading,
      isAdminMode, setIsAdminMode,
      page, setPage,
      showToast,
      toggleFavorite,
      connectionStatus,
      userCount
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
