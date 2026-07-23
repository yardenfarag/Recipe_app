import { supabase } from '@/lib/supabase/client';

export type SupportTicketCategory = 'billing' | 'bug' | 'account' | 'other';
export type SupportTicketStatus = 'open' | 'closed';

export interface SupportTicket {
  id: string;
  user_id: string | null;
  email: string | null;
  category: SupportTicketCategory;
  message: string;
  status: SupportTicketStatus;
  created_at: string;
}

export async function submitSupportTicket(input: {
  category: SupportTicketCategory;
  message: string;
  email?: string | null;
}): Promise<SupportTicket> {
  const message = input.message.trim();
  if (message.length < 5) {
    throw new Error('Please describe the issue in a bit more detail.');
  }
  if (message.length > 4000) {
    throw new Error('Message is too long (max 4000 characters).');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sign in to submit a support ticket.');
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: user.id,
      email: input.email?.trim() || user.email || null,
      category: input.category,
      message,
      status: 'open',
    })
    .select('id, user_id, email, category, message, status, created_at')
    .single();

  if (error) throw error;
  return data as SupportTicket;
}

export async function fetchSupportTickets(limit = 80): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, email, category, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SupportTicket[];
}

export async function closeSupportTicket(id: string): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ status: 'closed' })
    .eq('id', id);
  if (error) throw error;
}
