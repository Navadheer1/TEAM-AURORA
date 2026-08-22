import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PlusCircle, FileText, Clock, CheckCircle, AlertTriangle, TrendingUp, Search } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import ComplaintCard from '../../components/ComplaintCard';
import StatusBadge from '../../components/StatusBadge';
import CivicHeatmap from '../../components/CivicHeatmap';
import useAuthStore from '../../store/authStore';
import api from '../../utils/api';
import { formatDate } from '../../utils/constants';
import { useTranslation } from '../../utils/i18n';

const StatCard = ({ icon: Icon, label, value, badgeColor, delay }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="stat-card">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${badgeColor}`}>
      <Icon size={20} />
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white leading-tight">{value}</div>
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
    </div>
  </motion.div>
);

export default function CitizenDashboard() {
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const { data: complaintsData, isLoading } = useQuery({
    queryKey: ['myComplaints'],
    queryFn: () => api.get('/complaints/my').then(r => r.data.data),
  });

  const complaints = complaintsData?.complaints || [];
  const stats = {
    total: complaints.length,
    pending: complaints.filter(c => c.status === 'pending').length,
    active: complaints.filter(c => ['under_review', 'investigating', 'action_taken'].includes(c.status)).length,
    closed: complaints.filter(c => c.status === 'closed').length,
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
            {t('dashboard.welcome')}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('complaint.submit.subtitle')}
          </p>
        </div>
        <Link to="/submit-complaint" className="btn-primary">
          <PlusCircle size={16} /> {t('nav.file')}
        </Link>
      </div>

      {/* Emergency Alert Banner (Flat Government Standard) */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="font-bold text-red-900 dark:text-red-300 text-sm">
              High-Risk Hazard & National Emergency Reporting
            </h4>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
              Immediate threat (fire, flood, road accident, gas leak)? Broadcast priority alert to NDMA/SDRF emergency teams.
            </p>
          </div>
        </div>
        <Link to="/emergency" className="btn-danger flex-shrink-0 text-xs font-semibold py-2 px-4 whitespace-nowrap">
          🚨 Broadcast SOS
        </Link>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText} label={t('dashboard.total')} value={stats.total} badgeColor="bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60" delay={0} />
        <StatCard icon={Clock} label={t('dashboard.pending')} value={stats.pending} badgeColor="bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60" delay={0.05} />
        <StatCard icon={TrendingUp} label={t('dashboard.active')} value={stats.active} badgeColor="bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60" delay={0.1} />
        <StatCard icon={CheckCircle} label={t('dashboard.closed')} value={stats.closed} badgeColor="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60" delay={0.15} />
      </div>

      {/* Quick actions (Enterprise Flat Cards) */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="card p-5 border-l-4 border-l-blue-600">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
            <PlusCircle size={22} />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">{t('complaint.submit.title')}</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-4 leading-relaxed">Submit a new grievance about civic issues, corruption or public safety.</p>
          <Link to="/submit-complaint" className="btn-primary text-xs">
            File Complaint →
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className="card p-5 border-l-4 border-l-slate-400 dark:border-l-slate-600">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mb-3">
            <Search size={22} />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">Track by ID</h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-4 leading-relaxed">Check real-time resolution status using your Complaint Tracking ID.</p>
          <Link to="/track" className="btn-secondary text-xs">
            Track Complaint →
          </Link>
        </motion.div>
      </div>

      {/* Live Civic Heatmap */}
      <motion.div 
        initial={{ opacity: 0, y: 16 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ delay: 0.25 }}
        className="mb-8"
      >
        <CivicHeatmap />
      </motion.div>

      {/* Recent complaints */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
            My Complaints
            {complaints.length > 0 && <span className="ml-2 text-sm font-normal text-slate-400">({complaints.length})</span>}
          </h2>
          {complaints.length > 5 && (
            <Link to="/dashboard?all=true" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all</Link>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="h-5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded mt-3" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded mt-2" />
              </div>
            ))}
          </div>
        ) : complaints.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="card p-12 text-center">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No complaints yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
              Have a grievance? File your first complaint and we'll route it to the right authority.
            </p>
            <Link to="/submit-complaint" className="btn-primary">File First Complaint</Link>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {complaints.slice(0, 5).map((c, i) => (
              <ComplaintCard key={c.id} complaint={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
