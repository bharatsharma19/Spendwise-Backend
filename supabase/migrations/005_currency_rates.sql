-- Create a table to store currency exchange rates
-- We will store rates relative to USD (e.g., pair='USD_INR', rate=83.12)
CREATE TABLE IF NOT EXISTS currency_rates (
  pair text PRIMARY KEY, -- e.g. 'USD_INR'
  rate decimal NOT NULL, -- The exchange rate
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

-- Allow public read access (authenticated and anon)
CREATE POLICY "Allow public read access"
ON currency_rates FOR SELECT
TO public
USING (true);

-- Allow only service role (admin) to insert/update
-- (Implicitly denied for others by default)
