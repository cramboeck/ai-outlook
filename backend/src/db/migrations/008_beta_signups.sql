-- Beta Signups table for landing page registrations
CREATE TABLE IF NOT EXISTS beta_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  company VARCHAR(255),
  name VARCHAR(255),
  source VARCHAR(50) DEFAULT 'landing_page',
  signed_up_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_beta_signups_email ON beta_signups(email);
CREATE INDEX IF NOT EXISTS idx_beta_signups_signed_up_at ON beta_signups(signed_up_at);
