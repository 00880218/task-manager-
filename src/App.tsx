import React, { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { io, Socket } from 'socket.io-client';
import { 
  LayoutDashboard, 
  Plus, 
  Search, 
  LogOut, 
  Moon, 
  Sun, 
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, isToday, isThisWeek } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { Task, User, Priority, Status } from './types';
import { sortTasks, getTaskStatus } from './utils';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<{ id: number, email: string }[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'All'>('All');
  const [filterStatus, setFilterStatus] = useState<Status | 'All'>('All');
  const [socket, setSocket] = useState<Socket | null>(null);

  // Auth logic
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRole, setAuthRole] = useState<'manager' | 'employee'>('employee');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (token) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        
        const newSocket = io();
        setSocket(newSocket);

        newSocket.on('task:created', (task: Task) => {
          if (parsedUser.role === 'manager' || task.assigned_to_id === parsedUser.id) {
            setTasks(prev => [task, ...prev]);
            toast.success(`New task assigned: ${task.title}`);
          }
        });

        newSocket.on('task:updated', (updatedTask: Task) => {
          setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
          if (updatedTask.status === 'completed' && parsedUser.role === 'manager') {
            toast.success(`Task completed by employee: ${updatedTask.title}`);
          }
        });

        newSocket.on('task:deleted', (id: number) => {
          setTasks(prev => prev.filter(t => t.id !== id));
        });

        fetchTasks();
        if (parsedUser.role === 'manager') {
          fetchEmployees();
        }

        return () => {
          newSocket.disconnect();
        };
      }
    }
  }, [token]);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      toast.error('Failed to fetch tasks');
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/api/employees', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setEmployees(data);
    } catch (err) {
      console.error('Failed to fetch employees');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, role: authRole })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      if (isRegistering) {
        toast.success('Registered successfully! Please login.');
        setIsRegistering(false);
      } else {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        toast.success('Welcome back!');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socket?.disconnect();
  };

  const createTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newTask = {
      title: formData.get('title'),
      description: formData.get('description'),
      deadline: formData.get('deadline'),
      priority: formData.get('priority'),
      assigned_to_id: Number(formData.get('assigned_to_id')),
    };

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newTask)
      });
      if (res.ok) {
        setIsModalOpen(false);
        toast.success('Task assigned successfully');
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to create task');
      }
    } catch (err) {
      toast.error('Failed to create task');
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      toast.error('Failed to update task');
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await fetch('/api/tasks/export', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to download report');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
      a.download = `Task_Report_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Report downloaded successfully');
    } catch (err) {
      toast.error('Failed to download report');
    }
  };

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filterPriority !== 'All') {
      result = result.filter(t => t.priority === filterPriority);
    }

    if (filterStatus !== 'All') {
      result = result.filter(t => t.status === filterStatus);
    }

    return sortTasks(result);
  }, [tasks, searchQuery, filterPriority, filterStatus]);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      overdue: tasks.filter(t => getTaskStatus(t) === 'overdue').length,
    };
  }, [tasks]);

  if (!token) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-stone-100 p-4 transition-colors", isDarkMode && "bg-zinc-950")}>
        <Toaster position="top-right" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-stone-200", isDarkMode && "bg-zinc-900 border-zinc-800")}
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <LayoutDashboard className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className={cn("text-3xl font-bold text-center mb-2 text-stone-900", isDarkMode && "text-white")}>
            {isRegistering ? 'Join TaskFlow' : 'Welcome Back'}
          </h1>
          <p className="text-stone-500 text-center mb-8">Manage your team tasks with intelligence.</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Email Address</label>
              <input 
                type="email" 
                required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                placeholder="name@company.com"
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Password</label>
              <input 
                type="password" 
                required
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Role</label>
              <select 
                value={authRole}
                onChange={e => setAuthRole(e.target.value as any)}
                className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            >
              {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-stone-50 transition-colors", isDarkMode && "bg-zinc-950")}>
      <Toaster position="top-right" />
      
      {/* Navigation */}
      <nav className={cn("sticky top-0 z-40 bg-white/80 backdrop-blur-md border-bottom border-stone-200 px-6 py-4 flex items-center justify-between", isDarkMode && "bg-zinc-900/80 border-zinc-800")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <span className={cn("text-xl font-bold text-stone-900", isDarkMode && "text-white")}>TaskFlow</span>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-2 rounded-xl hover:bg-stone-100 transition-colors", isDarkMode && "hover:bg-zinc-800 text-zinc-400")}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <div className="h-6 w-px bg-stone-200 mx-2" />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className={cn("text-sm font-semibold text-stone-900", isDarkMode && "text-white")}>{user?.email}</p>
              <p className="text-xs text-stone-500 capitalize">{user?.role}</p>
            </div>
            <button 
              onClick={handleLogout}
              className={cn("p-2 rounded-xl text-stone-500 hover:bg-red-50 hover:text-red-600 transition-all", isDarkMode && "hover:bg-red-900/20")}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header & Stats */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className={cn("text-3xl font-bold text-stone-900 mb-2", isDarkMode && "text-white")}>
              {user?.role === 'manager' ? 'Manager Dashboard' : 'Employee Dashboard'}
            </h2>
            <p className="text-stone-500">
              {user?.role === 'manager' 
                ? `Overseeing ${employees.length} employees and ${stats.total} tasks.`
                : `You have ${stats.pending} pending tasks assigned to you.`}
            </p>
          </div>
          {user?.role === 'manager' && (
            <div className="flex gap-3">
              <button 
                onClick={handleDownloadReport}
                className="flex items-center gap-2 bg-stone-200 hover:bg-stone-300 text-stone-700 px-6 py-3 rounded-xl font-semibold transition-all active:scale-95"
              >
                <Download size={20} />
                Download Task Report (Excel)
              </button>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                <Plus size={20} />
                Assign New Task
              </button>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard 
            title="Total Tasks" 
            value={stats.total} 
            icon={<LayoutDashboard className="text-indigo-600" />} 
            isDarkMode={isDarkMode}
          />
          <StatCard 
            title="Pending" 
            value={stats.pending} 
            icon={<Clock className="text-orange-500" />} 
            isDarkMode={isDarkMode}
            color="orange"
          />
          <StatCard 
            title="Completed" 
            value={stats.completed} 
            icon={<CheckCircle2 className="text-emerald-500" />} 
            isDarkMode={isDarkMode}
            color="emerald"
          />
          <StatCard 
            title="Overdue" 
            value={stats.overdue} 
            icon={<AlertCircle className="text-red-500" />} 
            isDarkMode={isDarkMode}
            color="red"
          />
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          <div className={cn("flex-1 relative", isDarkMode && "text-white")}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input 
              type="text" 
              placeholder="Search tasks by title or description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={cn("w-full pl-12 pr-4 py-3 rounded-2xl border border-stone-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all", isDarkMode && "bg-zinc-900 border-zinc-800")}
            />
          </div>
          <div className="flex gap-4">
            <select 
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value as any)}
              className={cn("px-4 py-3 rounded-2xl border border-stone-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all", isDarkMode && "bg-zinc-900 border-zinc-800 text-white")}
            >
              <option value="All">All Priorities</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className={cn("px-4 py-3 rounded-2xl border border-stone-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all", isDarkMode && "bg-zinc-900 border-zinc-800 text-white")}
            >
              <option value="All">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onToggle={() => toggleTaskStatus(task)}
                isDarkMode={isDarkMode}
                isEmployee={user?.role === 'employee'}
              />
            ))}
          </AnimatePresence>
          {filteredTasks.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="text-stone-300" size={32} />
              </div>
              <p className="text-stone-500 font-medium">No tasks found matching your criteria.</p>
            </div>
          )}
        </div>

        {/* Employee List for Managers */}
        {user?.role === 'manager' && employees.length > 0 && (
          <div className="mt-16">
            <h3 className={cn("text-2xl font-bold text-stone-900 mb-6", isDarkMode && "text-white")}>Team Members</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {employees.map(emp => (
                <div key={emp.id} className={cn("bg-white p-4 rounded-2xl border border-stone-200 flex items-center gap-4", isDarkMode && "bg-zinc-900 border-zinc-800")}>
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                    <Users size={20} />
                  </div>
                  <div className="overflow-hidden">
                    <p className={cn("text-sm font-semibold text-stone-900 truncate", isDarkMode && "text-white")}>{emp.email}</p>
                    <p className="text-xs text-stone-500">Employee</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Create Task Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn("relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 border border-stone-200", isDarkMode && "bg-zinc-900 border-zinc-800")}
            >
              <h3 className={cn("text-2xl font-bold text-stone-900 mb-6", isDarkMode && "text-white")}>Assign New Task</h3>
              <form onSubmit={createTask} className="space-y-5">
                <div>
                  <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Task Title</label>
                  <input 
                    name="title" 
                    required 
                    className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-indigo-500", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                    placeholder="e.g. Update Q1 Marketing Report"
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Description (Optional)</label>
                  <textarea 
                    name="description" 
                    rows={3}
                    className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-indigo-500", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                    placeholder="Provide more context..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Deadline</label>
                    <input 
                      name="deadline" 
                      type="datetime-local" 
                      required 
                      className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-indigo-500", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                    />
                  </div>
                  <div>
                    <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Priority</label>
                    <select 
                      name="priority" 
                      className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-indigo-500", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={cn("block text-sm font-medium text-stone-700 mb-1", isDarkMode && "text-zinc-400")}>Assign To</label>
                  <select 
                    name="assigned_to_id" 
                    required
                    className={cn("w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-indigo-500", isDarkMode && "bg-zinc-800 border-zinc-700 text-white")}
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.email}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className={cn("flex-1 px-6 py-3 rounded-xl font-semibold text-stone-600 hover:bg-stone-100 transition-all", isDarkMode && "text-zinc-400 hover:bg-zinc-800")}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                  >
                    Assign Task
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon, isDarkMode, color = "indigo" }: { title: string, value: number, icon: React.ReactNode, isDarkMode: boolean, color?: string }) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  const darkColors: Record<string, string> = {
    indigo: "bg-indigo-900/20 text-indigo-400",
    red: "bg-red-900/20 text-red-400",
    orange: "bg-orange-900/20 text-orange-400",
    emerald: "bg-emerald-900/20 text-emerald-400",
  };

  return (
    <div className={cn("bg-white p-6 rounded-3xl border border-stone-200 shadow-sm", isDarkMode && "bg-zinc-900 border-zinc-800")}>
      <div className="flex items-center justify-between mb-4">
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", isDarkMode ? darkColors[color] : colors[color])}>
          {icon}
        </div>
      </div>
      <p className="text-stone-500 text-sm font-medium mb-1">{title}</p>
      <p className={cn("text-3xl font-bold text-stone-900", isDarkMode && "text-white")}>{value}</p>
    </div>
  );
}

function TaskCard({ task, onToggle, isDarkMode, isEmployee }: { task: Task, onToggle: () => void | Promise<void>, isDarkMode: boolean, isEmployee?: boolean, key?: any }) {
  const status = getTaskStatus(task);
  
  const statusStyles = {
    'completed': "bg-emerald-50 text-emerald-600 border-emerald-100",
    'overdue': "bg-red-50 text-red-600 border-red-100",
    'due-soon': "bg-orange-50 text-orange-600 border-orange-100",
    'pending': "bg-stone-50 text-stone-600 border-stone-100",
  };

  const darkStatusStyles = {
    'completed': "bg-emerald-900/20 text-emerald-400 border-emerald-900/30",
    'overdue': "bg-red-900/20 text-red-400 border-red-900/30",
    'due-soon': "bg-orange-900/20 text-orange-400 border-orange-900/30",
    'pending': "bg-zinc-800 text-zinc-400 border-zinc-700",
  };

  const priorityColors = {
    'High': "text-red-500",
    'Medium': "text-orange-500",
    'Low': "text-emerald-500",
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "group bg-white rounded-3xl border border-stone-200 p-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden flex flex-col",
        isDarkMode && "bg-zinc-900 border-zinc-800",
        task.status === 'completed' && "opacity-75"
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
          isDarkMode ? darkStatusStyles[status] : statusStyles[status]
        )}>
          {status === 'due-soon' ? 'Due Soon' : status}
        </div>
        <div className={cn("text-xs font-bold uppercase tracking-wider", priorityColors[task.priority])}>
          {task.priority} Priority
        </div>
      </div>

      <h4 className={cn(
        "text-lg font-bold text-stone-900 mb-2 group-hover:text-indigo-600 transition-colors", 
        isDarkMode && "text-white group-hover:text-indigo-400",
        task.status === 'completed' && "line-through text-stone-400"
      )}>
        {task.title}
      </h4>
      
      {task.description && (
        <p className="text-stone-500 text-sm mb-4 line-clamp-2">{task.description}</p>
      )}

      <div className="mt-auto space-y-4">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-stone-500">
            <Clock size={14} />
            <span>{format(parseISO(task.deadline), 'MMM d, h:mm a')}</span>
          </div>
          {!isEmployee && (
            <div className="text-stone-400 italic truncate max-w-[120px]">
              @{task.assigned_to_name?.split('@')[0]}
            </div>
          )}
        </div>

        {isEmployee && task.status !== 'completed' && (
          <button 
            onClick={onToggle}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} />
            Mark as Completed
          </button>
        )}

        {!isEmployee && (
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <span className="text-xs text-stone-400">Status: <span className="capitalize font-medium">{task.status}</span></span>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              task.status === 'completed' ? "bg-emerald-100 text-emerald-600" : "bg-stone-100 text-stone-400"
            )}>
              <CheckCircle2 size={18} />
            </div>
          </div>
        )}
      </div>

      {/* Urgency Indicator Bar */}
      {task.status !== 'completed' && (
        <div className={cn(
          "absolute bottom-0 left-0 h-1 bg-indigo-500 transition-all",
          status === 'overdue' && "bg-red-500 w-full",
          status === 'due-soon' && "bg-orange-500 w-2/3",
          status === 'pending' && "bg-indigo-500 w-1/3"
        )} />
      )}
    </motion.div>
  );
}
