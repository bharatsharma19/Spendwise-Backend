-- Create user_push_tokens table
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

-- Enable RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert their own push tokens"
  ON public.user_push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own push tokens"
  ON public.user_push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push tokens"
  ON public.user_push_tokens FOR DELETE
  USING (auth.uid() = user_id);
