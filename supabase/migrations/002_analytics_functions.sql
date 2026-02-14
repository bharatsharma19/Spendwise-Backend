-- ============================================
-- Analytics RPC Functions
-- Replaces in-memory aggregation with SQL
-- ============================================

-- 1. get_expense_summary: SUM, COUNT, AVG, MIN, MAX
CREATE OR REPLACE FUNCTION get_expense_summary(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total NUMERIC,
  count BIGINT,
  average NUMERIC,
  min_amount NUMERIC,
  max_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(e.amount), 0)::NUMERIC AS total,
    COUNT(*)::BIGINT AS count,
    COALESCE(AVG(e.amount), 0)::NUMERIC AS average,
    COALESCE(MIN(e.amount), 0)::NUMERIC AS min_amount,
    COALESCE(MAX(e.amount), 0)::NUMERIC AS max_amount
  FROM expenses e
  WHERE e.user_id = p_user_id
    AND (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date);
END;
$$;


-- 2. get_category_stats: per-category totals, counts, averages, percentages
CREATE OR REPLACE FUNCTION get_category_stats(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  total NUMERIC,
  count BIGINT,
  average NUMERIC,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  grand_total NUMERIC;
BEGIN
  -- Calculate grand total first
  SELECT COALESCE(SUM(e.amount), 0)
  INTO grand_total
  FROM expenses e
  WHERE e.user_id = p_user_id
    AND (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date);

  -- Return per-category breakdown
  RETURN QUERY
  SELECT
    COALESCE(e.category, 'other')::TEXT AS category,
    SUM(e.amount)::NUMERIC AS total,
    COUNT(*)::BIGINT AS count,
    AVG(e.amount)::NUMERIC AS average,
    CASE
      WHEN grand_total > 0 THEN (SUM(e.amount) / grand_total * 100)::NUMERIC
      ELSE 0::NUMERIC
    END AS percentage
  FROM expenses e
  WHERE e.user_id = p_user_id
    AND (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date)
  GROUP BY COALESCE(e.category, 'other')
  ORDER BY total DESC;
END;
$$;


-- 3. get_expense_trends: aggregated by date interval (daily/weekly/monthly)
CREATE OR REPLACE FUNCTION get_expense_trends(
  p_user_id UUID,
  p_interval TEXT DEFAULT 'monthly'
)
RETURNS TABLE (
  period TEXT,
  total NUMERIC,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_interval
      WHEN 'daily'   THEN TO_CHAR(e.date, 'YYYY-MM-DD')
      WHEN 'weekly'  THEN TO_CHAR(DATE_TRUNC('week', e.date), 'YYYY-MM-DD')
      WHEN 'monthly' THEN TO_CHAR(e.date, 'YYYY-MM')
      ELSE TO_CHAR(e.date, 'YYYY-MM')
    END AS period,
    SUM(e.amount)::NUMERIC AS total,
    COUNT(*)::BIGINT AS count
  FROM expenses e
  WHERE e.user_id = p_user_id
  GROUP BY period
  ORDER BY period;
END;
$$;
