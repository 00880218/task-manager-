export type Priority = 'High' | 'Medium' | 'Low';
export type Status = 'pending' | 'completed' | 'overdue';

export interface User {
  id: number;
  email: string;
  role: 'manager' | 'employee';
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  deadline: string;
  priority: Priority;
  status: Status;
  created_by: string;
  assigned_to_id: number;
  assigned_to_name?: string;
  created_at: string;
  urgencyScore?: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}
