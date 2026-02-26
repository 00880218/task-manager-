import { differenceInDays, isPast, isWithinInterval, addHours, parseISO } from 'date-fns';
import { Task, Priority } from './types';

const PRIORITY_WEIGHTS: Record<Priority, number> = {
  'High': 3,
  'Medium': 2,
  'Low': 1
};

export const calculateUrgencyScore = (task: Task): number => {
  const deadline = parseISO(task.deadline);
  const now = new Date();
  const daysLeft = differenceInDays(deadline, now);
  
  // Urgency Score = (Days Left × -1) + Priority Weight
  return (daysLeft * -1) + PRIORITY_WEIGHTS[task.priority];
};

export const getTaskStatus = (task: Task): 'overdue' | 'due-soon' | 'completed' | 'pending' => {
  if (task.status === 'completed') return 'completed';
  
  const deadline = parseISO(task.deadline);
  if (isPast(deadline)) return 'overdue';
  
  const now = new Date();
  const next24Hours = addHours(now, 24);
  
  if (isWithinInterval(deadline, { start: now, end: next24Hours })) {
    return 'due-soon';
  }
  
  return 'pending';
};

export const sortTasks = (tasks: Task[]): Task[] => {
  return [...tasks].sort((a, b) => {
    // First, sort by completion (completed at bottom)
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    
    // Then by Priority (High -> Medium -> Low)
    const priorityDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by Deadline (Nearest first)
    return parseISO(a.deadline).getTime() - parseISO(b.deadline).getTime();
  });
};
