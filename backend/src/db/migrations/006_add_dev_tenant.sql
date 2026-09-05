-- Add development tenant for local testing
INSERT INTO tenants (id, azure_tenant_id, name, plan)
VALUES ('00000000-0000-4000-a000-000000000001', 'dev-local', 'Development', 'enterprise')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, azure_user_id, email, name, role)
VALUES ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', 'dev-user', 'dev@localhost', 'Dev User', 'admin')
ON CONFLICT DO NOTHING;
